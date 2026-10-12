/**
 * Costo por kilómetro — por camión, por destino y por chofer, en un rango de fechas.
 *
 * Kilómetros de un viaje (en este orden de confianza):
 *   1. GPS          trip.km con trip.kmSource === "gps"   (lo pone la sincronización con TrackSolid)
 *   2. Odómetro     trip.odoEnd − trip.odoStart           (lo escribe el chofer)
 *   3. Estimado     distancia de referencia del destino   (tabla `distances`: provincia/municipio → km ida y vuelta)
 *
 * Costos de la EMPRESA en un viaje / camión:
 *   variable: combustible, chofer (driverPay), ayudantes, dieta (va dentro de driverPay), reparaciones y
 *             cualquier gasto ligado al viaje o al camión en el período
 *   fijo:     plantillas de gastos fijos con truckId (prorrateadas por días del período)
 *   En camiones de socios, lo que se le descuenta al socio en la liquidación NO es costo de la empresa:
 *   se resta (la empresa solo "paga" lo que no recupera). Se usa `settlementCharged` si se pasa.
 */
import { expenseChargedToPartner, normalizePartner } from "./partnerModels.js";
import { tripNetRevenue } from "./partnerModels.js";

export const KM_SOURCE_LABEL = { gps: "GPS", odometer: "Odómetro", estimated: "Estimado", none: "Sin km" };

/**
 * Un gasto de combustible tiene que decir de qué camión es (directo o a través del viaje);
 * si no, no entra en el costo por km. Lo usa el formulario de Gastos para no dejarlo guardar así.
 */
export function fuelNeedsTruck(e) {
  return !!e && e.category === "fuel" && !e.truckId && !e.tripId;
}

/** Km de referencia (ida y vuelta) para un destino. */
export function referenceKm(distances = [], province, municipality) {
  const d = (distances || []).find(x => x.province === province && x.municipality === municipality);
  return d ? Number(d.km) || 0 : 0;
}

/** Km de un viaje y de dónde salieron. */
export function tripKm(trip, distances = []) {
  if (!trip) return { km: 0, source: "none" };
  if (trip.kmSource === "gps" && Number(trip.km) > 0) return { km: Number(trip.km), source: "gps" };
  const odo = Number(trip.odoEnd) - Number(trip.odoStart);
  if (Number(trip.odoStart) > 0 && Number(trip.odoEnd) > 0 && odo > 0) return { km: odo, source: "odometer" };
  if (Number(trip.km) > 0) return { km: Number(trip.km), source: trip.kmSource || "estimated" };
  const ref = referenceKm(distances, trip.province, trip.municipality);
  return ref > 0 ? { km: ref, source: "estimated" } : { km: 0, source: "none" };
}

const NOT_COST = new Set(["nominaTotalOverride", "adelanto_conductor", "adelanto_ayudante", "broker_commission", "partner_settlement", "cash_withdrawal", "reserve_withdrawal"]);
const inRange = (d, from, to) => !!d && d >= from && d <= to;
const daysBetween = (a, b) => Math.max(1, Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000) + 1);

/**
 * Cálculo principal.
 * @returns { byTruck:[], byRoute:[], byDriver:[], totals, quality }
 */
export function costPerKm({ dateFrom, dateTo, trips = [], expenses = [], trucks = [], drivers = [], clients = [], brokers = [], partners = [], fixedTemplates = [], distances = [], targetMarginPerKm = 0 }) {
  const tripMap = new Map(trips.map(t => [t.id, t]));
  const truckMap = new Map(trucks.map(t => [t.id, t]));
  const partnerMap = new Map(partners.map(p => [p.id, normalizePartner(p)]));
  const clientMap = new Map(clients.map(c => [c.id, c]));
  const brokerMap = new Map(brokers.map(b => [b.id, b]));
  const days = daysBetween(dateFrom, dateTo);

  const pTrips = trips.filter(t => t.status !== "cancelled" && inRange(t.date, dateFrom, dateTo));
  const pTripIds = new Set(pTrips.map(t => t.id));

  // ── Gastos del período atribuibles a un camión ─────────────────────────────
  const costOf = (e) => { // costo para la empresa (si el socio lo reembolsa, no es costo nuestro)
    const amt = Number(e.amount) || 0;
    const truckId = e.truckId || tripMap.get(e.tripId)?.truckId;
    const partner = truckId ? partnerMap.get(truckMap.get(truckId)?.partnerId) : null;
    if (partner && partner.model !== "commission" && expenseChargedToPartner(e, partner)) return { amt, company: 0, truckId };
    return { amt, company: amt, truckId };
  };
  const perTruck = new Map(); // truckId → acumuladores
  const acc = (id) => { if (!perTruck.has(id)) perTruck.set(id, { truckId: id, km: 0, trips: 0, revenue: 0, companyRevenue: 0, fuel: 0, gallons: 0, driver: 0, helpers: 0, maintenance: 0, other: 0, fixed: 0, partnerRecovered: 0, kmBySource: { gps: 0, odometer: 0, estimated: 0, none: 0 } }); return perTruck.get(id); };
  const byRoute = new Map(), byDriver = new Map();
  const fuelPool = new Map(); // truckId → combustible del período sin viaje { amt, company, gallons }

  for (const tr of pTrips) {
    const a = acc(tr.truckId);
    const { km, source } = tripKm(tr, distances);
    const gross = Number(tr.revenue) || 0;
    const net = tripNetRevenue(tr, clientMap, brokerMap);
    a.trips++; a.km += km; a.revenue += net; a.kmBySource[source]++;
    const rk = `${tr.province}|${tr.municipality}`;
    if (!byRoute.has(rk)) byRoute.set(rk, { province: tr.province, municipality: tr.municipality, trips: 0, km: 0, revenue: 0, cost: 0 });
    const r = byRoute.get(rk); r.trips++; r.km += km; r.revenue += net;
    if (!byDriver.has(tr.driverId)) byDriver.set(tr.driverId, { driverId: tr.driverId, trips: 0, km: 0, fuel: 0, gallons: 0, pay: 0 });
    const d = byDriver.get(tr.driverId); d.trips++; d.km += km;
    void gross;
  }

  for (const e of expenses) {
    if (NOT_COST.has(e.category)) continue;
    const linkedTrip = e.tripId ? tripMap.get(e.tripId) : null;
    const applies = linkedTrip ? pTripIds.has(e.tripId) : (e.truckId && inRange(e.date, dateFrom, dateTo));
    if (!applies) continue;
    const { amt, company, truckId } = costOf(e);
    if (!truckId) continue;
    const a = acc(truckId);
    a.partnerRecovered += amt - company;
    if (e.category === "fuel") { a.fuel += company; a.gallons += Number(e.gallons) || 0; }
    else if (e.category === "driverPay") a.driver += company;
    else if (e.category === "helper") a.helpers += company;
    else if (["repair", "maintenance", "tire"].includes(e.category)) a.maintenance += company;
    else a.other += company;
    if (linkedTrip) {
      const r = byRoute.get(`${linkedTrip.province}|${linkedTrip.municipality}`); if (r) r.cost += company;
      const d = byDriver.get(linkedTrip.driverId);
      if (d) { if (e.category === "fuel") { d.fuel += amt; d.gallons += Number(e.gallons) || 0; } if (e.category === "driverPay" || e.category === "helper") d.pay += amt; }
    } else if (e.category === "fuel") {
      // Combustible cargado solo al camión (sin viaje): se reparte más abajo entre sus viajes del período
      if (!fuelPool.has(truckId)) fuelPool.set(truckId, { amt: 0, company: 0, gallons: 0 });
      const p = fuelPool.get(truckId); p.amt += amt; p.company += company; p.gallons += Number(e.gallons) || 0;
    }
  }

  // Combustible del camión sin viaje → a destinos y choferes, según los km de cada viaje del camión en el período
  // (sin km, en partes iguales). Solo afecta «Por destino» y «Por chofer»: el total por camión ya lo incluye.
  let fuelAllocated = 0, fuelUnallocated = 0;
  for (const [truckId, pool] of fuelPool) {
    const tTrips = pTrips.filter(t => t.truckId === truckId);
    if (tTrips.length === 0) { fuelUnallocated += pool.company; continue; }
    const kms = tTrips.map(t => tripKm(t, distances).km);
    const totalKm = kms.reduce((s, k) => s + k, 0);
    tTrips.forEach((tr, i) => {
      const w = totalKm > 0 ? kms[i] / totalKm : 1 / tTrips.length;
      const r = byRoute.get(`${tr.province}|${tr.municipality}`); if (r) r.cost += pool.company * w;
      const d = byDriver.get(tr.driverId); if (d) { d.fuel += pool.amt * w; d.gallons += pool.gallons * w; }
    });
    fuelAllocated += pool.company;
  }

  // Fijos por camión (plantillas mensuales prorrateadas por días)
  for (const tpl of fixedTemplates) {
    if (!tpl.truckId) continue;
    const a = acc(tpl.truckId);
    a.fixed += (Number(tpl.amount) || 0) * days / 30;
  }

  const byTruck = [...perTruck.values()].map(a => {
    const tk = truckMap.get(a.truckId);
    const variable = a.fuel + a.driver + a.helpers + a.maintenance + a.other;
    const cost = variable + a.fixed;
    const partner = tk?.partnerId ? partnerMap.get(tk.partnerId) : null;
    // Ingreso de la empresa: en camión propio todo el flete; en camión de socio, lo que retiene (comisión / parte)
    let companyRevenue = a.revenue;
    if (partner) {
      if (partner.model === "profit_share") companyRevenue = a.revenue * (100 - (Number(partner.partnerSharePct) || 0)) / 100;
      else companyRevenue = a.revenue * (Number(partner.companyPct) || 0) / 100;
    }
    const kmOk = a.km > 0;
    return { ...a, plate: tk?.plate || `#${a.truckId}`, size: tk?.size || "T1", partnerName: partner?.name || null, variable, cost, companyRevenue,
      costPerKm: kmOk ? cost / a.km : null, revenuePerKm: kmOk ? companyRevenue / a.km : null,
      marginPerKm: kmOk ? (companyRevenue - cost) / a.km : null, margin: companyRevenue - cost,
      kmPerGallon: a.gallons > 0 && kmOk ? a.km / a.gallons : null,
      status: !kmOk ? "nodata" : (companyRevenue - cost) / a.km >= targetMarginPerKm ? "ok" : "bad" };
  }).sort((x, y) => (y.km - x.km));

  const routes = [...byRoute.values()].map(r => ({ ...r, costPerKm: r.km > 0 ? r.cost / r.km : null, revenuePerKm: r.km > 0 ? r.revenue / r.km : null, marginPerKm: r.km > 0 ? (r.revenue - r.cost) / r.km : null })).sort((x, y) => y.trips - x.trips);
  const driversOut = [...byDriver.values()].map(d => ({ ...d, name: drivers.find(x => x.id === d.driverId)?.name || `#${d.driverId}`, kmPerGallon: d.gallons > 0 && d.km > 0 ? d.km / d.gallons : null, costPerKm: d.km > 0 ? (d.fuel + d.pay) / d.km : null })).sort((x, y) => y.km - x.km);

  const totals = byTruck.reduce((s, t) => ({ km: s.km + t.km, trips: s.trips + t.trips, revenue: s.revenue + t.companyRevenue, cost: s.cost + t.cost, fuel: s.fuel + t.fuel, gallons: s.gallons + t.gallons }), { km: 0, trips: 0, revenue: 0, cost: 0, fuel: 0, gallons: 0 });
  totals.costPerKm = totals.km > 0 ? totals.cost / totals.km : null;
  totals.revenuePerKm = totals.km > 0 ? totals.revenue / totals.km : null;
  totals.marginPerKm = totals.km > 0 ? (totals.revenue - totals.cost) / totals.km : null;
  const quality = pTrips.reduce((q, tr) => { q[tripKm(tr, distances).source]++; return q; }, { gps: 0, odometer: 0, estimated: 0, none: 0 });
  quality.fuelAllocated = fuelAllocated;     // combustible sin viaje repartido entre viajes del camión
  quality.fuelUnallocated = fuelUnallocated; // combustible sin viaje de camiones sin viajes en el período (solo en «Por camión»)
  quality.fuelWithoutGallons = expenses.filter(e => e.category === "fuel" && !(Number(e.gallons) > 0) && ((e.tripId && pTripIds.has(e.tripId)) || (!e.tripId && inRange(e.date, dateFrom, dateTo)))).length;
  return { byTruck, byRoute: routes, byDriver: driversOut, totals, quality, days };
}

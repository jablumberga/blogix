/**
 * Nómina por quincena (1–15 y 16–último día): una sola fuente para la asistente,
 * los PDF, el Excel para contabilidad y (más adelante) la pantalla de Nómina.
 */
import { calcDriverPay, normalizeDriver } from "./driverPay.js";
import { splitTripHelpers, isDirectLine, normalizeAyudante } from "./ayudantes.js";

/** Documentos físicos que la oficina recibe por cada viaje. */
export const TRIP_DOCS = [
  { key: "factura", label: "Factura / Ref. factura" },
  { key: "conduce", label: "Conduce" },
  { key: "pod",     label: "POD (recibido conforme)" },
];

export function docsRequired(client) {
  const r = client?.rules || {};
  return TRIP_DOCS.filter(d =>
    (d.key === "pod" && r.requiresPOD) ||
    (d.key === "factura" && (r.requiresInvoiceRef || r.requiresDocuments)) ||
    (d.key === "conduce" && r.requiresDocuments) ||
    (!r.requiresPOD && !r.requiresInvoiceRef && !r.requiresDocuments) // sin reglas: los tres
  );
}

export function docsComplete(trip, client) {
  const req = docsRequired(client);
  if (req.length === 0) return true;
  const got = trip.docs || {};
  return req.every(d => !!got[d.key]);
}

const inPeriod = (date, pd) => !!date && date >= pd.dateFrom && date <= pd.dateTo;

/**
 * ¿Este adelanto se descuenta en esta nómina? Solo los entregados (status paid). Reglas (en orden):
 *  - ya se aplicó en una nómina pagada (payrollKey) → solo en esa.
 *  - viene con viaje del chofer → se descuenta en la quincena en que se paga ESE viaje (docs recibidos);
 *    si el viaje ya se pagó en una quincena anterior y el adelanto se registró después, por su fecha.
 *    Sin documentos todavía, espera con el viaje.
 *  - sin viaje → por la fecha del adelanto, al chofer/ayudante que diga el gasto.
 * `paid` = viajes pagados en este período ({trip, payDate}); `mine` = todos los viajes de la persona.
 */
export function advanceApplies(e, { period, key, paid = [], mine = [] }) {
  if (e.status && e.status !== "paid") return false; // un adelanto que no se ha entregado no se descuenta
  if (e.payrollKey) return e.payrollKey === key;
  const linked = e.tripId != null ? mine.find(t => t.id === Number(e.tripId)) : null;
  if (linked) {
    const x = paid.find(p => p.trip.id === linked.id);
    if (x) return true;
    const pd = linked.payDate; // null = sin documentos: espera
    return !!pd && pd < period.dateFrom && inPeriod(e.date, period);
  }
  return inPeriod(e.date, period);
}

/** Fecha que decide en qué quincena se paga un viaje: la de recepción de documentos (o la del viaje si no se registró). */
export function payrollDate(trip, client) {
  if (!docsComplete(trip, client)) return null;
  return trip.docsReceivedAt || trip.date;
}

/**
 * Construye la nómina de un período.
 * Regla: un viaje se paga en la quincena en que la oficina RECIBIÓ sus documentos
 * (docsReceivedAt), no en la del viaje («lo que pasó pasó»). Los viajes sin
 * documentos quedan en `pendingTrips` bajo el período de su fecha de viaje, para
 * que la oficina los ubique; no se pagan ni salen en la relación hasta recibirlos
 * o hasta que el admin los cancele.
 * Devuelve { period, drivers: [{ driver, trips:[{trip, calc, client, truck}], base, dieta, helpers,
 *   discounts, advances, gross, net, helperNames, payType, fixedAmount }], totals }
 */
export function buildPayroll({ period, drivers = [], trips = [], trucks = [], clients = [], expenses = [], partners = [] }) {
  const truckMap = new Map(trucks.map(tk => [tk.id, tk]));
  const clientMap = new Map(clients.map(c => [c.id, c]));
  const rows = [];

  for (const raw of drivers) {
    const driver = normalizeDriver(raw);
    if (driver.partnerDriver) continue; // socio-chofer: cobra por liquidación, no sale en nómina
    if (driver.status === "inactive" && !trips.some(tr => tr.driverId === driver.id && inPeriod(tr.date, period))) continue;
    const mine = trips.filter(tr => tr.driverId === driver.id && tr.status !== "cancelled");
    const enrich = trip => {
      const truck = truckMap.get(trip.truckId);
      const client = clientMap.get(trip.clientId);
      const calc = calcDriverPay({ driver, trip, truck, clientId: trip.clientId });
      // Ayudantes: los directos se pagan aparte (nómina de ayudantes); al chofer solo los que van por él
      const split = splitTripHelpers(trip, calc);
      return { trip, calc, split, client, truck, docsOk: docsComplete(trip, client), payDate: payrollDate(trip, client) };
    };
    const byDate = (a, b) => (a.trip.date || "").localeCompare(b.trip.date || "");
    // Recibidos cuya fecha de recepción cae en el período → se pagan aquí
    const dTrips = mine.map(enrich).filter(x => x.docsOk && inPeriod(x.payDate, period)).sort(byDate);
    // Sin documentos, por fecha de viaje → esperan (no se pagan)
    const pendingTrips = mine.map(enrich).filter(x => !x.docsOk && inPeriod(x.trip.date, period)).sort(byDate);
    const allTrips = [...dTrips, ...pendingTrips].sort(byDate);
    // Adelantos: del chofer (driverId) o de un viaje suyo (tripId); los de ayudantes sin ayudanteId van por el chofer
    const key = payrollKey(period);
    const mineInfo = mine.map(tr => ({ id: tr.id, payDate: payrollDate(tr, clientMap.get(tr.clientId)) }));
    const isMineAdv = (e) => (e.driverId != null && Number(e.driverId) === driver.id) || (e.tripId != null && mine.some(tr => tr.id === Number(e.tripId)));
    const advExps = expenses.filter(e => e.category === "adelanto_conductor" && isMineAdv(e) && advanceApplies(e, { period, key, paid: dTrips, mine: mineInfo }));
    const helperAdvExps = expenses.filter(e => e.category === "adelanto_ayudante" && (e.ayudanteId == null || e.ayudanteId === "") && isMineAdv(e) && advanceApplies(e, { period, key, paid: dTrips, mine: mineInfo }));
    const advances = advExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const helperAdvances = helperAdvExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const base      = dTrips.reduce((s, x) => s + x.calc.base, 0);
    const dieta     = dTrips.reduce((s, x) => s + x.calc.dieta, 0);
    const discounts = dTrips.reduce((s, x) => s + x.calc.discounts, 0);
    const helpers   = dTrips.reduce((s, x) => s + x.split.viaDriver.amount, 0);
    const helperCount = dTrips.reduce((s, x) => s + x.split.viaDriver.count, 0);
    const directHelpers = dTrips.reduce((s, x) => s + x.split.directTotal, 0);
    const fixed = driver.payType === "fixed" ? (Number(driver.fixedAmount) || 0) : 0;
    const gross = driver.payType === "fixed" ? fixed : base + dieta;
    const net = Math.max(0, gross - discounts - advances);
    const helpersNet = Math.max(0, helpers - helperAdvances);
    const helperNames = [...new Set(dTrips.flatMap(x => (x.trip.helpers || []).filter(h => !isDirectLine(h)).map(h => h.name).filter(Boolean)))];
    const missingRates = dTrips.filter(x => driver.payType === "perTrip" && !x.calc.rateFound).length;
    if (allTrips.length === 0 && driver.payType !== "fixed") continue;
    rows.push({ driver, payType: driver.payType, fixedAmount: fixed, trips: dTrips, tripCount: dTrips.length,
      pendingTrips, pendingCount: pendingTrips.length, allTrips,
      base, dieta, discounts, advances, advExps, helpers, helperAdvances, helperAdvExps, helpersNet, helperCount, helperNames, directHelpers, gross, net, missingRates,
      docsPending: pendingTrips.length });
  }

  const totals = rows.reduce((acc, r) => ({
    trips: acc.trips + r.tripCount, gross: acc.gross + r.gross, discounts: acc.discounts + r.discounts,
    advances: acc.advances + r.advances, net: acc.net + r.net, helpers: acc.helpers + r.helpers, helperAdvances: acc.helperAdvances + r.helperAdvances, helpersNet: acc.helpersNet + r.helpersNet,
    total: acc.total + r.net + r.helpersNet,
  }), { trips: 0, gross: 0, discounts: 0, advances: 0, net: 0, helpers: 0, helperAdvances: 0, helpersNet: 0, total: 0 });

  return { period, drivers: rows, totals };
}

/** Clave estable de un período de nómina (se guarda en los gastos que lo pagan). */
export const payrollKey = (period) => `${period.mStr}-H${period.half}`;

/**
 * Estado de pago de una fila de nómina según los gastos registrados.
 * - líneas por viaje: monto efectivo (override por viaje si existe) y si ya está pagada
 * - override total (gasto `nominaTotalOverride` con payrollKey)
 * - fijo: gasto driverPay sin viaje con payrollKey
 * Devuelve { key, lines, override, driverTotal, grossEff, net, paid, partial, paidCount, payExps, helperExps, fixedExp }
 */
export function payrollPayment({ row, period, expenses = [] }) {
  const key = payrollKey(period);
  const tripIds = new Set(row.trips.map(x => x.trip.id));
  const payExps = expenses.filter(e => e.category === "driverPay" && (
    (e.tripId && tripIds.has(e.tripId)) || (!e.tripId && e.driverId === row.driver.id && e.payrollKey === key)));
  // Solo el gasto de ayudantes que va por el chofer (los directos tienen ayudanteId y su propia nómina)
  const helperExps = expenses.filter(e => e.category === "helper" && tripIds.has(e.tripId) && (e.ayudanteId == null || e.ayudanteId === ""));
  const override = expenses.find(e => e.category === "nominaTotalOverride" && e.driverId === row.driver.id && e.payrollKey === key) || null;
  const fixedExp = payExps.find(e => !e.tripId) || null;
  // Descuento que no cupo en su viaje (el pago de ese viaje llegó a 0): se sigue descontando de los demás viajes del corte
  let excess = row.trips.reduce((s, x) => s + Math.max(0, (Number(x.calc.discounts) || 0) - ((Number(x.calc.driverGross) || 0) - (Number(x.calc.driverNet) || 0))), 0);
  const lines = row.trips.map(x => {
    const exp = payExps.find(e => e.tripId === x.trip.id) || null;
    const overridden = !!exp && exp.calcAmount !== undefined && exp.calcAmount !== null && Number(exp.amount) !== Number(exp.calcAmount);
    let amount = overridden ? Number(exp.amount) || 0 : x.calc.driverNet;
    let carried = 0;
    // Solo en viajes todavía sin pagar (lo ya transferido no se cambia)
    if (!overridden && exp?.status !== "paid" && excess > 0 && amount > 0) { carried = Math.min(amount, excess); amount -= carried; excess -= carried; }
    // Sin nada que pagar y sin gasto: cuenta como pagado (no hay transferencia que hacer)
    return { ...x, exp, amount, overridden, carriedDiscount: carried, paid: exp?.status === "paid" || (!exp && amount <= 0) };
  });
  const driverTotal = row.payType === "fixed" ? row.gross : lines.reduce((s, l) => s + l.amount, 0);
  const grossEff = override ? Number(override.amount) || 0 : driverTotal;
  const net = Math.max(0, grossEff - row.advances);
  const paidCount = lines.filter(l => l.paid).length;
  const paid = row.payType === "fixed"
    ? fixedExp?.status === "paid"
    : lines.length > 0 && lines.every(l => l.paid) && (!override || override.status === "paid");
  const partial = !paid && (paidCount > 0 || fixedExp?.status === "paid");
  return { key, lines, override, driverTotal, grossEff, net, paid, partial, paidCount, payExps, helperExps, fixedExp, unappliedDiscount: excess };
}

/** Viajes del período en camiones de un socio (para la vista de la asistente). */
export function partnerTripsInPeriod({ partner, period, trips, trucks, clients = [], drivers = [] }) {
  const truckIds = new Set(trucks.filter(tk => tk.partnerId === partner.id).map(tk => tk.id));
  const clientMap = new Map(clients.map(c => [c.id, c]));
  return trips
    .filter(tr => truckIds.has(tr.truckId) && tr.status !== "cancelled" && inPeriod(tr.date, period))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .map(trip => ({ trip, client: clientMap.get(trip.clientId), truck: trucks.find(tk => tk.id === trip.truckId), driver: drivers.find(d => d.id === trip.driverId), docsOk: docsComplete(trip, clientMap.get(trip.clientId)) }));
}

/**
 * Nómina de ayudantes directos de un período (misma regla que los choferes: un viaje se paga en la
 * quincena en que la oficina recibió sus documentos; sin documentos, espera).
 * Monto por viaje = pago por ayudante del tarifario del chofer de ese viaje (calcDriverPay).
 * Adelantos: gastos «adelanto_ayudante» del ayudante con fecha en el período.
 * Devuelve { period, rows: [{ ayudante, trips:[{trip, calc, client, truck, driver, amount}], pendingTrips,
 *   tripCount, pendingCount, gross, advances, net }], totals }
 */
export function buildHelperPayroll({ period, ayudantes = [], drivers = [], trips = [], trucks = [], clients = [], expenses = [] }) {
  const truckMap = new Map(trucks.map(tk => [tk.id, tk]));
  const clientMap = new Map(clients.map(c => [c.id, c]));
  const driverMap = new Map(drivers.map(d => [d.id, d]));
  const byHelper = new Map(); // ayudanteId → { lines, pending }
  for (const trip of trips) {
    if (trip.status === "cancelled" || !Array.isArray(trip.helpers) || !trip.helpers.some(isDirectLine)) continue;
    const driver = driverMap.get(trip.driverId);
    if (!driver) continue;
    const truck = truckMap.get(trip.truckId), client = clientMap.get(trip.clientId);
    const calc = calcDriverPay({ driver, trip, truck, clientId: trip.clientId });
    const split = splitTripHelpers(trip, calc);
    if (split.direct.length === 0) continue;
    const docsOk = docsComplete(trip, client), payDate = payrollDate(trip, client);
    for (const d of split.direct) {
      if (!byHelper.has(d.ayudanteId)) byHelper.set(d.ayudanteId, { lines: [], pending: [] });
      const item = { trip, calc, client, truck, driver: normalizeDriver(driver), amount: d.amount, docsOk, payDate };
      if (docsOk && inPeriod(payDate, period)) byHelper.get(d.ayudanteId).lines.push(item);
      else if (!docsOk && inPeriod(trip.date, period)) byHelper.get(d.ayudanteId).pending.push(item);
    }
  }
  const byDate = (a, b) => (a.trip.date || "").localeCompare(b.trip.date || "");
  const rows = [];
  // Un directo que ya no está en la lista (borrado, o lista vieja en un teléfono) igual sale aquí para pagarse
  const known = new Set((ayudantes || []).filter(Boolean).map(a => Number(a.id)));
  const orphans = [...byHelper.keys()].filter(id => !known.has(id)).map(id => {
    const any = byHelper.get(id).lines[0] || byHelper.get(id).pending[0];
    const line = (any?.trip.helpers || []).find(h => Number(h?.ayudanteId) === id);
    return { id, name: `${line?.name || "Ayudante #" + id} (no está en la lista)`, payMode: "direct", status: "inactive", orphan: true };
  });
  for (const raw of [...(ayudantes || []).filter(Boolean), ...orphans]) {
    const ayudante = normalizeAyudante(raw);
    const got = byHelper.get(ayudante.id) || { lines: [], pending: [] };
    const key = payrollKey(period);
    const mineInfo = trips.filter(tr => (tr.helpers || []).some(h => Number(h?.ayudanteId) === ayudante.id)).map(tr => ({ id: tr.id, payDate: payrollDate(tr, clientMap.get(tr.clientId)) }));
    const advExps = expenses.filter(e => e.category === "adelanto_ayudante" && Number(e.ayudanteId) === ayudante.id && advanceApplies(e, { period, key, paid: got.lines, mine: mineInfo }));
    const advances = advExps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    if (got.lines.length === 0 && got.pending.length === 0 && advances === 0) continue;
    const tripsPaid = got.lines.sort(byDate), pendingTrips = got.pending.sort(byDate);
    const gross = tripsPaid.reduce((s, x) => s + x.amount, 0);
    rows.push({ ayudante, trips: tripsPaid, tripCount: tripsPaid.length, pendingTrips, pendingCount: pendingTrips.length,
      gross, advances, advExps, net: Math.max(0, gross - advances) });
  }
  rows.sort((a, b) => (a.ayudante.name || "").localeCompare(b.ayudante.name || ""));
  const totals = rows.reduce((t, r) => ({ trips: t.trips + r.tripCount, gross: t.gross + r.gross, advances: t.advances + r.advances, net: t.net + r.net }), { trips: 0, gross: 0, advances: 0, net: 0 });
  return { period, rows, totals };
}

/** Estado de pago de un ayudante en el período según sus gastos «helper» con su ayudanteId. */
export function helperPayrollPayment({ row, period, expenses = [] }) {
  const key = payrollKey(period);
  const id = row.ayudante.id;
  const exps = expenses.filter(e => e.category === "helper" && Number(e.ayudanteId) === id);
  const lines = row.trips.map(x => { const exp = exps.find(e => e.tripId === x.trip.id) || null; return { ...x, exp, paid: exp?.status === "paid" }; });
  const paidCount = lines.filter(l => l.paid).length;
  const paid = lines.length > 0 && paidCount === lines.length;
  return { key, lines, paid, partial: !paid && paidCount > 0, paidCount, exps: lines.map(l => l.exp).filter(Boolean) };
}

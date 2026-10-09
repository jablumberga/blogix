/**
 * Nómina por período (30/31→14 y 15→29): una sola fuente para la asistente,
 * los PDF, el Excel para contabilidad y (más adelante) la pantalla de Nómina.
 */
import { calcDriverPay, normalizeDriver } from "./driverPay.js";

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
    if (driver.status === "inactive" && !trips.some(tr => tr.driverId === driver.id && inPeriod(tr.date, period))) continue;
    const mine = trips.filter(tr => tr.driverId === driver.id && tr.status !== "cancelled");
    const enrich = trip => {
      const truck = truckMap.get(trip.truckId);
      const client = clientMap.get(trip.clientId);
      const calc = calcDriverPay({ driver, trip, truck, clientId: trip.clientId });
      return { trip, calc, client, truck, docsOk: docsComplete(trip, client), payDate: payrollDate(trip, client) };
    };
    const byDate = (a, b) => (a.trip.date || "").localeCompare(b.trip.date || "");
    // Recibidos cuya fecha de recepción cae en el período → se pagan aquí
    const dTrips = mine.map(enrich).filter(x => x.docsOk && inPeriod(x.payDate, period)).sort(byDate);
    // Sin documentos, por fecha de viaje → esperan (no se pagan)
    const pendingTrips = mine.map(enrich).filter(x => !x.docsOk && inPeriod(x.trip.date, period)).sort(byDate);
    const allTrips = [...dTrips, ...pendingTrips].sort(byDate);
    const advances = expenses.filter(e => e.category === "adelanto_conductor" && e.driverId === driver.id && inPeriod(e.date, period)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const base      = dTrips.reduce((s, x) => s + x.calc.base, 0);
    const dieta     = dTrips.reduce((s, x) => s + x.calc.dieta, 0);
    const discounts = dTrips.reduce((s, x) => s + x.calc.discounts, 0);
    const helpers   = dTrips.reduce((s, x) => s + x.calc.helpersTotal, 0);
    const helperCount = dTrips.reduce((s, x) => s + x.calc.numHelpers, 0);
    const fixed = driver.payType === "fixed" ? (Number(driver.fixedAmount) || 0) : 0;
    const gross = driver.payType === "fixed" ? fixed : base + dieta;
    const net = Math.max(0, gross - discounts - advances);
    const helperNames = [...new Set(dTrips.flatMap(x => (x.trip.helpers || []).map(h => h.name).filter(Boolean)))];
    const missingRates = dTrips.filter(x => driver.payType === "perTrip" && !x.calc.rateFound).length;
    if (allTrips.length === 0 && driver.payType !== "fixed") continue;
    rows.push({ driver, payType: driver.payType, fixedAmount: fixed, trips: dTrips, tripCount: dTrips.length,
      pendingTrips, pendingCount: pendingTrips.length, allTrips,
      base, dieta, discounts, advances, helpers, helperCount, helperNames, gross, net, missingRates,
      docsPending: pendingTrips.length });
  }

  const totals = rows.reduce((acc, r) => ({
    trips: acc.trips + r.tripCount, gross: acc.gross + r.gross, discounts: acc.discounts + r.discounts,
    advances: acc.advances + r.advances, net: acc.net + r.net, helpers: acc.helpers + r.helpers,
    total: acc.total + r.net + r.helpers,
  }), { trips: 0, gross: 0, discounts: 0, advances: 0, net: 0, helpers: 0, total: 0 });

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
  const helperExps = expenses.filter(e => e.category === "helper" && tripIds.has(e.tripId));
  const override = expenses.find(e => e.category === "nominaTotalOverride" && e.driverId === row.driver.id && e.payrollKey === key) || null;
  const fixedExp = payExps.find(e => !e.tripId) || null;
  const lines = row.trips.map(x => {
    const exp = payExps.find(e => e.tripId === x.trip.id) || null;
    const overridden = !!exp && exp.calcAmount !== undefined && exp.calcAmount !== null && Number(exp.amount) !== Number(exp.calcAmount);
    const amount = overridden ? Number(exp.amount) || 0 : x.calc.driverNet;
    return { ...x, exp, amount, overridden, paid: exp?.status === "paid" };
  });
  const driverTotal = row.payType === "fixed" ? row.gross : lines.reduce((s, l) => s + l.amount, 0);
  const grossEff = override ? Number(override.amount) || 0 : driverTotal;
  const net = Math.max(0, grossEff - row.advances);
  const paidCount = lines.filter(l => l.paid).length;
  const paid = row.payType === "fixed"
    ? fixedExp?.status === "paid"
    : lines.length > 0 && lines.every(l => l.paid) && (!override || override.status === "paid");
  const partial = !paid && (paidCount > 0 || fixedExp?.status === "paid");
  return { key, lines, override, driverTotal, grossEff, net, paid, partial, paidCount, payExps, helperExps, fixedExp };
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

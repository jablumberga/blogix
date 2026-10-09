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

/**
 * Construye la nómina de un período.
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
    const dTrips = trips
      .filter(tr => tr.driverId === driver.id && tr.status !== "cancelled" && inPeriod(tr.date, period))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .map(trip => {
        const truck = truckMap.get(trip.truckId);
        const client = clientMap.get(trip.clientId);
        const calc = calcDriverPay({ driver, trip, truck, clientId: trip.clientId });
        return { trip, calc, client, truck, docsOk: docsComplete(trip, client) };
      });
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
    if (dTrips.length === 0 && driver.payType !== "fixed") continue;
    rows.push({ driver, payType: driver.payType, fixedAmount: fixed, trips: dTrips, tripCount: dTrips.length,
      base, dieta, discounts, advances, helpers, helperCount, helperNames, gross, net, missingRates,
      docsPending: dTrips.filter(x => !x.docsOk).length });
  }

  const totals = rows.reduce((acc, r) => ({
    trips: acc.trips + r.tripCount, gross: acc.gross + r.gross, discounts: acc.discounts + r.discounts,
    advances: acc.advances + r.advances, net: acc.net + r.net, helpers: acc.helpers + r.helpers,
    total: acc.total + r.net + r.helpers,
  }), { trips: 0, gross: 0, discounts: 0, advances: 0, net: 0, helpers: 0, total: 0 });

  return { period, drivers: rows, totals };
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

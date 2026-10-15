/**
 * Viaje conjunto: dos camiones para una misma factura.
 * Un solo chofer (o el admin) registra el viaje y elige al compañero; aquí se
 * construye el viaje del compañero (misma fecha, cliente, destino y referencia,
 * tarifa según el tamaño de SU camión, pago según SU tarifario) y sus gastos.
 * Lo usan Viajes (admin, en el navegador) y el servidor (cuando lo registra un chofer).
 */
import { calcDriverPay, tripSize } from "./driverPay.js";
import { clientSkipsHelpers, crewSlots, buildHelperLines, helperExpensePlan, planToNewExpenses } from "./ayudantes.js";

/** Tarifa del cliente para el destino y tamaño del camión (0 si no hay). */
export function clientRateFor(client, trip, truck) {
  const rate = (client?.rates || []).find(r => r.province === trip.province && r.municipality === trip.municipality);
  if (!rate) return 0;
  const size = tripSize({ ...trip, tarifaOverride: null }, truck);
  const v = size === "T2" ? (rate.priceT2 ?? rate.price ?? rate.priceT1) : (rate.priceT1 ?? rate.price ?? rate.priceT2);
  return Number(v) || 0;
}

/** Campos que el compañero hereda del viaje original. */
const COPY_FIELDS = ["date", "province", "municipality", "clientId", "brokerId", "cargo", "weight", "status", "invoiceRef", "docStatus", "podDelivered", "docs", "docsReceivedAt", "docsReceivedBy", "docsReceivedTs"];

/**
 * Construye el viaje del compañero y sus gastos (pago chofer + ayudantes).
 * Devuelve { trip, expenses, revenueEstimated } o null si faltan datos.
 */
export function buildCompanionTrip({ trip, companionDriverId, companionTruckId, drivers = [], trucks = [], clients = [], ayudantes = [], nextTripId, nextExpenseId, createdBy }) {
  const driver = drivers.find(d => d.id === Number(companionDriverId));
  const truck = trucks.find(t => t.id === Number(companionTruckId));
  if (!driver || !truck || !trip) return null;
  const client = clients.find(c => c.id === trip.clientId);
  const rated = clientRateFor(client, trip, truck);
  const revenue = rated > 0 ? rated : (Number(trip.revenue) || 0);
  const companion = {
    ...Object.fromEntries(COPY_FIELDS.map(k => [k, trip[k]]).filter(([, v]) => v !== undefined)),
    id: nextTripId, driverId: driver.id, truckId: truck.id, revenue,
    numHelpers: null, helperPayEach: "", helperNames: [], helpers: [], discounts: [], tarifaOverride: null,
    joint: true, jointWith: trip.id, jointAuto: true, createdBy: createdBy || trip.createdBy || null,
    ...(rated > 0 ? {} : { revenueEstimated: true }),
  };
  // Cliente que no lleva ayudantes o los paga él: 0 ayudantes a cargo de la empresa
  if (clientSkipsHelpers(client)) companion.numHelpers = 0;
  const calc = calcDriverPay({ driver, trip: companion, truck, clientId: companion.clientId });
  companion.numHelpers = calc.numHelpers; companion.helperPayEach = null; // el tarifario del compañero decide; nunca se congela el valor de hoy
  // Tripulación fija del camión del compañero (si tiene); el resto, por el chofer como siempre
  const already = new Set((trip.helpers || []).map(h => Number(h?.ayudanteId)).filter(Boolean));
  const crew0 = crewSlots(truck, ayudantes);
  const keep = crew0.helperIds.map((id, i) => (already.has(id) ? -1 : i)).filter(i => i >= 0);
  const crew = { helperIds: keep.map(i => crew0.helperIds[i]), helperNames: keep.map(i => crew0.helperNames[i]) };
  companion.helpers = buildHelperLines({ count: calc.numHelpers, pay: calc.helperEach, ...crew, ayudantes });
  if (crew.helperIds.length) companion.helperNames = companion.helpers.map(h => h.name);
  const expenses = [];
  let eid = nextExpenseId;
  if (calc.payType !== "fixed" && calc.driverNet > 0) expenses.push({ id: eid++, tripId: companion.id, date: companion.date, category: "driverPay", amount: calc.driverNet, description: `Pago chofer ${driver.name} · ${companion.municipality || ""}`, paymentMethod: "transfer", driverId: driver.id, status: "pending", supplierId: null });
  const plan = helperExpensePlan({ trip: companion, calc, driverDescription: (n) => `Ayudantes (${n}) · ${companion.municipality || ""}` });
  for (const e of planToNewExpenses(plan, { tripId: companion.id, date: companion.date })) expenses.push({ id: eid++, ...e });
  return { trip: companion, expenses, revenueEstimated: rated <= 0 };
}

/** Ids del viaje y de su pareja (si la tiene): para marcar documentos a los dos a la vez. */
export function jointIds(tripId, trips = []) {
  const tr = trips.find(t => t.id === tripId);
  const ids = new Set([tripId]);
  if (tr?.jointWith) ids.add(tr.jointWith);
  for (const t of trips) if (t.jointWith === tripId) ids.add(t.id);
  return [...ids];
}

/**
 * Cambia la FECHA de recepción de documentos (viaje y su pareja). La fecha decide en qué quincena
 * se paga el viaje; sirve para cargar viajes viejos con la fecha real en que llegaron los papeles.
 * Si el viaje aún no estaba recibido, lo marca recibido con esa fecha. Conserva docsReceivedTs si ya existía.
 */
export function setReceivedDate(trips, tripId, date, { docKeys, by, now = new Date().toISOString() }) {
  if (!date) return trips;
  const ids = new Set(jointIds(tripId, trips));
  return trips.map(tr => {
    if (!ids.has(tr.id)) return tr;
    const docs = Object.fromEntries(docKeys.map(k => [k, true]));
    const status = (tr.status === "pending" || tr.status === "in_transit") ? "delivered" : tr.status;
    return { ...tr, status, docs, docStatus: "delivered", podDelivered: true, docsReceivedAt: date, docsReceivedBy: tr.docsReceivedBy || by || "",
      docsReceivedTs: tr.docsReceivedAt ? (tr.docsReceivedTs ?? null) : now };
  });
}

/**
 * Marca (o desmarca) documentos recibidos en un viaje y en su pareja de viaje conjunto.
 * docsReceivedTs = momento exacto de la recepción: agrupa la «entrega» (visita) para la constancia de entrega.
 */
export function applyReceived(trips, tripId, value, { docKeys, today, by, now = new Date().toISOString() }) {
  const ids = new Set(jointIds(tripId, trips));
  return trips.map(tr => {
    if (!ids.has(tr.id)) return tr;
    const docs = Object.fromEntries(docKeys.map(k => [k, value]));
    // Documentos recibidos = el viaje se entregó (cuenta para nómina, factura y liquidación del socio)
    const status = value && (tr.status === "pending" || tr.status === "in_transit") ? "delivered" : tr.status;
    return { ...tr, status, docs, docStatus: value ? "delivered" : "pending", podDelivered: value,
      docsReceivedAt: value ? (tr.docsReceivedAt || today) : null, docsReceivedBy: value ? (tr.docsReceivedBy || by || "") : "",
      docsReceivedTs: value ? (tr.docsReceivedAt ? (tr.docsReceivedTs ?? null) : now) : null };
  });
}

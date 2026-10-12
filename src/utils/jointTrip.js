/**
 * Viaje conjunto: dos camiones para una misma factura.
 * Un solo chofer (o el admin) registra el viaje y elige al compañero; aquí se
 * construye el viaje del compañero (misma fecha, cliente, destino y referencia,
 * tarifa según el tamaño de SU camión, pago según SU tarifario) y sus gastos.
 * Lo usan Viajes (admin, en el navegador) y el servidor (cuando lo registra un chofer).
 */
import { calcDriverPay, tripSize } from "./driverPay.js";

/** Tarifa del cliente para el destino y tamaño del camión (0 si no hay). */
export function clientRateFor(client, trip, truck) {
  const rate = (client?.rates || []).find(r => r.province === trip.province && r.municipality === trip.municipality);
  if (!rate) return 0;
  const size = tripSize({ ...trip, tarifaOverride: null }, truck);
  const v = size === "T2" ? (rate.priceT2 ?? rate.price ?? rate.priceT1) : (rate.priceT1 ?? rate.price ?? rate.priceT2);
  return Number(v) || 0;
}

/** Campos que el compañero hereda del viaje original. */
const COPY_FIELDS = ["date", "province", "municipality", "clientId", "brokerId", "cargo", "weight", "status", "invoiceRef", "docStatus", "podDelivered", "docs", "docsReceivedAt", "docsReceivedBy"];

/**
 * Construye el viaje del compañero y sus gastos (pago chofer + ayudantes).
 * Devuelve { trip, expenses, revenueEstimated } o null si faltan datos.
 */
export function buildCompanionTrip({ trip, companionDriverId, companionTruckId, drivers = [], trucks = [], clients = [], nextTripId, nextExpenseId, createdBy }) {
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
  const calc = calcDriverPay({ driver, trip: companion, truck, clientId: companion.clientId });
  companion.numHelpers = calc.numHelpers; companion.helperPayEach = calc.helperEach;
  companion.helpers = Array.from({ length: calc.numHelpers }, (_, i) => ({ name: `Ayudante ${i + 1}`, pay: calc.helperEach }));
  const expenses = [];
  let eid = nextExpenseId;
  if (calc.payType !== "fixed" && calc.driverNet > 0) expenses.push({ id: eid++, tripId: companion.id, date: companion.date, category: "driverPay", amount: calc.driverNet, description: `Pago chofer ${driver.name} · ${companion.municipality || ""}`, paymentMethod: "transfer", driverId: driver.id, status: "pending", supplierId: null });
  if (calc.helpersTotal > 0) expenses.push({ id: eid++, tripId: companion.id, date: companion.date, category: "helper", amount: calc.helpersTotal, description: `Ayudantes (${calc.numHelpers}) · ${companion.municipality || ""}`, paymentMethod: "transfer", driverId: driver.id, status: "pending", supplierId: null });
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

/** Marca (o desmarca) documentos recibidos en un viaje y en su pareja de viaje conjunto. */
export function applyReceived(trips, tripId, value, { docKeys, today, by }) {
  const ids = new Set(jointIds(tripId, trips));
  return trips.map(tr => {
    if (!ids.has(tr.id)) return tr;
    const docs = Object.fromEntries(docKeys.map(k => [k, value]));
    // Documentos recibidos = el viaje se entregó (cuenta para nómina, factura y liquidación del socio)
    const status = value && (tr.status === "pending" || tr.status === "in_transit") ? "delivered" : tr.status;
    return { ...tr, status, docs, docStatus: value ? "delivered" : "pending", podDelivered: value,
      docsReceivedAt: value ? (tr.docsReceivedAt || today) : null, docsReceivedBy: value ? (tr.docsReceivedBy || by || "") : "" };
  });
}

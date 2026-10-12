import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCompanionTrip, applyReceived, jointIds, clientRateFor } from "../src/utils/jointTrip.js";

const clients = [{ id: 1, companyName: "Bocel", rates: [{ province: "Dajabón", municipality: "Dajabón", priceT1: 30000, priceT2: 45000 }] }];
const trucks = [{ id: 1, plate: "A", size: "T1" }, { id: 2, plate: "B", size: "T2" }];
const drivers = [
  { id: 1, name: "Rober", payType: "perTrip", rateSheets: [{ id: 1, name: "General", clientId: null, rates: [{ province: "Dajabón", municipality: "Dajabón", priceT1: 2000, dietaT1: 500, helperT1: 1000, priceT2: 2500, dietaT2: 600, helperT2: 1200 }] }] },
  { id: 2, name: "Joan", payType: "perTrip", rateSheets: [{ id: 1, name: "General", clientId: null, rates: [{ province: "Dajabón", municipality: "Dajabón", priceT1: 2100, dietaT1: 500, helperT1: 1000, priceT2: 2600, dietaT2: 600, helperT2: 1200 }] }] },
];
const trip = { id: 10, date: "2026-10-08", clientId: 1, driverId: 1, truckId: 1, province: "Dajabón", municipality: "Dajabón", revenue: 30000, invoiceRef: "F-500", status: "pending", joint: true, jointDriverId: 2, jointTruckId: 2, cargo: "arroz" };

test("compañero: misma referencia/fecha/cliente/destino, tarifa de SU camión (T2), pago según SU tarifario, enlazado", () => {
  const b = buildCompanionTrip({ trip, companionDriverId: 2, companionTruckId: 2, drivers, trucks, clients, nextTripId: 11, nextExpenseId: 50 });
  assert.equal(b.trip.id, 11); assert.equal(b.trip.driverId, 2); assert.equal(b.trip.truckId, 2);
  assert.equal(b.trip.invoiceRef, "F-500"); assert.equal(b.trip.clientId, 1); assert.equal(b.trip.date, "2026-10-08"); assert.equal(b.trip.cargo, "arroz");
  assert.equal(b.trip.revenue, 45000, "T2 cobra la tarifa T2 del cliente"); assert.equal(b.revenueEstimated, false);
  assert.equal(b.trip.joint, true); assert.equal(b.trip.jointWith, 10); assert.equal(b.trip.jointAuto, true);
  assert.equal(b.trip.numHelpers, 2, "T2 → 2 ayudantes por defecto");
  assert.deepEqual(b.expenses.map(e => [e.id, e.category, e.amount, e.driverId, e.tripId]), [[50, "driverPay", 2600 + 600, 2, 11], [51, "helper", 2400, 2, 11]]);
  assert.equal(clientRateFor(clients[0], trip, trucks[0]), 30000);
});

test("compañero sin tarifa de cliente: copia la tarifa y lo marca estimado; datos faltantes → null", () => {
  const b = buildCompanionTrip({ trip: { ...trip, municipality: "Otro" }, companionDriverId: 2, companionTruckId: 2, drivers, trucks, clients, nextTripId: 11, nextExpenseId: 50 });
  assert.equal(b.trip.revenue, 30000); assert.equal(b.revenueEstimated, true);
  assert.equal(buildCompanionTrip({ trip, companionDriverId: 9, companionTruckId: 2, drivers, trucks, clients, nextTripId: 11, nextExpenseId: 50 }), null);
});

test("recibido en uno marca los dos; desmarcar también; sin pareja solo uno", () => {
  const trips = [{ ...trip, jointWith: 11 }, { id: 11, jointWith: 10, joint: true }, { id: 12 }];
  assert.deepEqual(jointIds(10, trips), [10, 11]); assert.deepEqual(jointIds(11, trips), [11, 10]); assert.deepEqual(jointIds(12, trips), [12]);
  const r = applyReceived(trips, 11, true, { docKeys: ["factura", "conduce", "pod"], today: "2026-10-09", by: "Ana" });
  assert.equal(r[0].docsReceivedAt, "2026-10-09"); assert.equal(r[1].docsReceivedAt, "2026-10-09"); assert.equal(r[1].docsReceivedBy, "Ana"); assert.equal(r[0].docs.pod, true);
  assert.equal(r[2].docs, undefined);
  const u = applyReceived(r, 10, false, { docKeys: ["factura", "conduce", "pod"], today: "2026-10-10", by: "Ana" });
  assert.equal(u[0].docsReceivedAt, null); assert.equal(u[1].docsReceivedAt, null); assert.equal(u[1].docStatus, "pending");
});

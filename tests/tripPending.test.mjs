/**
 * B-Logix – Viajes por completar (el chofer los registra sin tarifa del cliente; la oficina completa)
 * Run with: node --test tests/tripPending.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { needsRate, pendingInfoTrips, missingInfo } from "../src/utils/tripPending.js";

const trips = [
  { id: 1, date: "2026-10-12", revenue: 16500, status: "delivered", driverId: 4 },
  { id: 2, date: "2026-10-13", revenue: 0, status: "pending", driverId: 4 },
  { id: 3, date: "2026-10-11", revenue: "", status: "delivered", driverId: 5 },
  { id: 4, date: "2026-10-10", revenue: 0, status: "cancelled", driverId: 4 },
];

test("por completar: sin tarifa y no cancelado, del más viejo al más nuevo", () => {
  assert.equal(needsRate(trips[0]), false);
  assert.equal(needsRate(trips[1]), true);
  assert.equal(needsRate(trips[3]), false, "cancelado no cuenta");
  assert.deepEqual(pendingInfoTrips(trips).map(t => t.id), [3, 2]);
  assert.deepEqual(pendingInfoTrips([]), []);
});

test("qué le falta: tarifa del cliente y, si cobra por viaje sin pago registrado, el pago del chofer", () => {
  const drivers = [{ id: 4, salaryType: "perTrip" }, { id: 5, salaryType: "fixed" }];
  const expenses = [{ tripId: 1, category: "driverPay", amount: 2500 }];
  assert.deepEqual(missingInfo(trips[1], { drivers, expenses }), ["tarifa del cliente", "pago del chofer"]);
  assert.deepEqual(missingInfo(trips[2], { drivers, expenses }), ["tarifa del cliente"], "chofer fijo: no se espera pago por viaje");
  assert.deepEqual(missingInfo(trips[0], { drivers, expenses }), []);
});

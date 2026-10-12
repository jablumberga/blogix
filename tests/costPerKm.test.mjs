import { test } from "node:test";
import assert from "node:assert/strict";
import { costPerKm, tripKm } from "../src/utils/costPerKm.js";

const distances = [{ province: "Santiago", municipality: "Santiago de los Caballeros", km: 300 }];
const trucks = [{ id: 1, plate: "A", partnerId: null }, { id: 3, plate: "B", partnerId: 2 }];
const partners = [{ id: 2, name: "Eudy", model: "profit_share", partnerSharePct: 50 }];
const clients = [{ id: 1, rules: {} }];
const trips = [
  { id: 1, truckId: 1, driverId: 1, clientId: 1, date: "2026-10-05", status: "delivered", revenue: 5500, province: "Santiago", municipality: "Santiago de los Caballeros", odoStart: 1000, odoEnd: 1320 },
  { id: 2, truckId: 3, driverId: 2, clientId: 1, date: "2026-10-06", status: "delivered", revenue: 5500, province: "Santiago", municipality: "Santiago de los Caballeros" },
];
const expenses = [
  { id: 1, tripId: 1, category: "fuel", amount: 3200, gallons: 16, status: "paid" },
  { id: 2, tripId: 1, category: "driverPay", amount: 900, status: "paid" },
  { id: 3, tripId: 1, category: "helper", amount: 700, status: "paid" },
  { id: 4, tripId: 2, category: "fuel", amount: 3000, gallons: 15, status: "paid" },   // camión del socio: se le descuenta → no es costo nuestro
  { id: 5, tripId: 2, category: "driverPay", amount: 1500, status: "paid" },
];

test("km: odómetro manda sobre estimado; sin odómetro usa referencia", () => {
  assert.deepEqual(tripKm(trips[0], distances), { km: 320, source: "odometer" });
  assert.deepEqual(tripKm(trips[1], distances), { km: 300, source: "estimated" });
  assert.deepEqual(tripKm({ ...trips[1], km: 310, kmSource: "gps" }, distances), { km: 310, source: "gps" });
});

test("costo por km: camión propio vs camión de socio", () => {
  const r = costPerKm({ dateFrom: "2026-10-01", dateTo: "2026-10-15", trips, expenses, trucks, partners, clients, distances, fixedTemplates: [{ id: 1, truckId: 1, amount: 3000 }] });
  const own = r.byTruck.find(t => t.truckId === 1), part = r.byTruck.find(t => t.truckId === 3);
  // propio: 320 km, costo variable 4800 + fijo 3000*15/30 = 1500 → 6300 ; ingreso 5500
  assert.equal(own.km, 320); assert.equal(own.variable, 4800); assert.equal(own.fixed, 1500); assert.equal(own.cost, 6300);
  assert.ok(Math.abs(own.costPerKm - 6300 / 320) < 1e-9);
  assert.ok(Math.abs(own.kmPerGallon - 20) < 1e-9);
  // socio (reparto 50 %): gastos reembolsados por el socio → costo empresa 0; ingreso empresa = 50 % de 5500
  assert.equal(part.cost, 0); assert.equal(part.partnerRecovered, 4500); assert.equal(part.companyRevenue, 2750);
  assert.equal(part.km, 300);
  assert.equal(r.quality.odometer, 1); assert.equal(r.quality.estimated, 1);
  assert.equal(r.byRoute[0].trips, 2);
});

import { signParams, summarize, assignTripKm } from "../netlify/functions/gps.mjs";
test("GPS: firma Jimi, km diarios y asignación a viajes", () => {
  // firma: MD5(secret + "app_key"+"k" + "method"+"m" + secret) en mayúsculas
  const sig = signParams({ method: "m", app_key: "k", sign: "x" }, "s");
  assert.match(sig, /^[0-9A-F]{32}$/);
  const items = [{ imei: "1", startTime: "2026-10-05 07:00:00", totalMileage: "120.4" }, { imei: "1", startTime: "2026-10-05 13:00:00", totalMileage: "200" }, { imei: "2", startTime: "2026-10-06 08:00:00", totalMileage: "50" }];
  const daily = summarize(items);
  assert.deepEqual(daily, [{ imei: "1", date: "2026-10-05", km: 320.4 }, { imei: "2", date: "2026-10-06", km: 50 }]);
  const trucks = [{ id: 1, gpsImei: "1" }, { id: 2, gpsImei: "2" }, { id: 3 }];
  const trips = [{ id: 10, truckId: 1, date: "2026-10-05" }, { id: 11, truckId: 1, date: "2026-10-05" }, { id: 12, truckId: 3, date: "2026-10-06" }, { id: 13, truckId: 2, date: "2026-10-07" }];
  assert.deepEqual(assignTripKm(daily, trips, trucks), [{ tripId: 10, km: 160.2 }, { tripId: 11, km: 160.2 }]);
});

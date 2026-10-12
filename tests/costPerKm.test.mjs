import { test } from "node:test";
import assert from "node:assert/strict";
import { costPerKm, tripKm, fuelNeedsTruck } from "../src/utils/costPerKm.js";

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

// ── Combustible registrado solo al camión (sin viaje) ─────────────────────────
test("combustible: sin camión ni viaje no se puede guardar; con uno de los dos sí", () => {
  assert.equal(fuelNeedsTruck({ category: "fuel", amount: 5000 }), true);
  assert.equal(fuelNeedsTruck({ category: "fuel", amount: 5000, truckId: null, tripId: "" }), true);
  assert.equal(fuelNeedsTruck({ category: "fuel", amount: 5000, truckId: 1 }), false);
  assert.equal(fuelNeedsTruck({ category: "fuel", amount: 5000, tripId: "12" }), false);
  assert.equal(fuelNeedsTruck({ category: "repair", amount: 5000 }), false); // otras categorías no cambian
  assert.equal(fuelNeedsTruck(null), false);
});

const tTrucks = [{ id: 1, plate: "A", partnerId: null }, { id: 2, plate: "B", partnerId: null }, { id: 3, plate: "S", partnerId: 2 }];
const tTrips = [
  { id: 1, truckId: 1, driverId: 1, clientId: 1, date: "2026-10-03", status: "delivered", revenue: 10000, province: "Santiago", municipality: "Santiago de los Caballeros", odoStart: 1000, odoEnd: 1300 },
  { id: 2, truckId: 1, driverId: 2, clientId: 1, date: "2026-10-08", status: "delivered", revenue: 6000, province: "Dajabón", municipality: "Dajabón", odoStart: 2000, odoEnd: 2100 },
  { id: 3, truckId: 1, driverId: 2, clientId: 1, date: "2026-10-20", status: "delivered", revenue: 6000, province: "Dajabón", municipality: "Dajabón", odoStart: 3000, odoEnd: 3100 }, // otra quincena
];
const base = { dateFrom: "2026-10-01", dateTo: "2026-10-15", trips: tTrips, trucks: tTrucks, partners, clients, distances: [] };

test("combustible sin viaje: se reparte a destinos y choferes por km; el total por camión no cambia", () => {
  const linkedOnly = [{ id: 1, tripId: 1, category: "fuel", amount: 2000, gallons: 10, status: "paid" }];
  const withTruckFuel = [...linkedOnly, { id: 2, truckId: 1, date: "2026-10-10", category: "fuel", amount: 4000, gallons: 20, status: "paid" }];
  const a = costPerKm({ ...base, expenses: linkedOnly });
  const b = costPerKm({ ...base, expenses: withTruckFuel });
  // Por camión: el combustible sin viaje ya contaba (por la fecha) → 2000 + 4000
  const tk = b.byTruck.find(t => t.truckId === 1);
  assert.equal(tk.fuel, 6000); assert.equal(tk.gallons, 30); assert.equal(tk.km, 400);
  assert.equal(b.totals.cost, 6000); assert.equal(b.totals.fuel, 6000);
  // Reparto por km: viaje 1 = 300 km (75 %), viaje 2 = 100 km (25 %) → 3000 / 1000
  const stgo = b.byRoute.find(r => r.municipality === "Santiago de los Caballeros"), daja = b.byRoute.find(r => r.municipality === "Dajabón");
  assert.equal(stgo.cost, 2000 + 3000); assert.equal(daja.cost, 1000);
  assert.equal(a.byRoute.find(r => r.municipality === "Dajabón").cost, 0); // antes no le llegaba nada
  const d1 = b.byDriver.find(d => d.driverId === 1), d2 = b.byDriver.find(d => d.driverId === 2);
  assert.equal(d1.fuel, 2000 + 3000); assert.equal(d1.gallons, 10 + 15);
  assert.equal(d2.fuel, 1000); assert.equal(d2.gallons, 5);
  // La suma repartida cuadra con lo que tiene el camión
  assert.equal(b.byRoute.reduce((s, r) => s + r.cost, 0), tk.fuel);
  assert.equal(b.quality.fuelAllocated, 4000); assert.equal(b.quality.fuelUnallocated, 0);
});

test("combustible sin viaje: camión sin viajes en el período solo cuenta en «Por camión»; sin km se reparte igual", () => {
  const exps = [{ id: 1, truckId: 2, date: "2026-10-05", category: "fuel", amount: 3000, gallons: 15, status: "paid" }];
  const r = costPerKm({ ...base, expenses: exps });
  assert.equal(r.byTruck.find(t => t.truckId === 2).fuel, 3000);
  assert.equal(r.byRoute.reduce((s, x) => s + x.cost, 0), 0);
  assert.equal(r.quality.fuelUnallocated, 3000); assert.equal(r.quality.fuelAllocated, 0);
  // Viajes sin km (sin odómetro, GPS ni distancia): partes iguales
  const noKm = tTrips.map(t => ({ ...t, odoStart: null, odoEnd: null }));
  const r2 = costPerKm({ ...base, trips: noKm, expenses: [{ id: 1, truckId: 1, date: "2026-10-05", category: "fuel", amount: 3000, status: "paid" }] });
  assert.equal(r2.byRoute.find(x => x.municipality === "Dajabón").cost, 1500);
  assert.equal(r2.byRoute.find(x => x.municipality === "Santiago de los Caballeros").cost, 1500);
});

test("combustible sin viaje en camión de socio que se le descuenta: no es costo de la empresa, pero sí cuenta para km/gal del chofer", () => {
  const sTrips = [{ id: 7, truckId: 3, driverId: 5, clientId: 1, date: "2026-10-06", status: "delivered", revenue: 8000, province: "Santiago", municipality: "Santiago de los Caballeros", odoStart: 10, odoEnd: 310 }];
  const r = costPerKm({ ...base, trips: sTrips, expenses: [{ id: 1, truckId: 3, date: "2026-10-06", category: "fuel", amount: 5000, gallons: 25, status: "paid" }] });
  assert.equal(r.byTruck[0].cost, 0); assert.equal(r.byTruck[0].partnerRecovered, 5000);
  assert.equal(r.byRoute[0].cost, 0);
  assert.equal(r.byDriver[0].fuel, 5000); assert.equal(r.byDriver[0].gallons, 25); assert.equal(r.byDriver[0].kmPerGallon, 12);
});

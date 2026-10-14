import { test } from "node:test";
import assert from "node:assert/strict";
import { costPerKm, tripKm, fuelNeedsTruck, gpsPeriodKm } from "../src/utils/costPerKm.js";

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
  // socio (reparto 50 %): los gastos salen de la utilidad antes de repartir → la empresa carga el 50 % (2250)
  // y recibe el 50 % del flete (2750): margen 500 = 50 % de (5500 − 4500), igual que la liquidación
  assert.equal(part.cost, 2250); assert.equal(part.partnerRecovered, 2250); assert.equal(part.companyRevenue, 2750);
  assert.equal(part.margin, 500);
  assert.equal(part.km, 300);
  assert.equal(r.quality.odometer, 1); assert.equal(r.quality.estimated, 1);
  assert.equal(r.byRoute[0].trips, 2);
});

import { signParams, summarize, kmOf, localDate, utcRange, daysOf } from "../netlify/functions/gps.mjs";
test("GPS: firma Jimi y km diarios", () => {
  // firma: MD5(secret + "app_key"+"k" + "method"+"m" + secret) en mayúsculas
  const sig = signParams({ method: "m", app_key: "k", sign: "x" }, "s");
  assert.match(sig, /^[0-9A-F]{32}$/);
  const items = [{ imei: "1", startTime: "2026-10-05 07:00:00", totalMileage: "120.4" }, { imei: "1", startTime: "2026-10-05 13:00:00", totalMileage: "200" }, { imei: "2", startTime: "2026-10-06 08:00:00", totalMileage: "50" }];
  const daily = summarize(items);
  assert.deepEqual(daily, [{ imei: "1", date: "2026-10-05", km: 320.4 }, { imei: "2", date: "2026-10-06", km: 50 }]);
  assert.deepEqual(daysOf("2026-09-29", "2026-10-02"), ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
});

test("GPS real (Open API de TrackSolid): «distance» en metros y hora UTC → km del día en hora de RD", () => {
  // formato de la Open API: distance en METROS, startTime en UTC
  assert.equal(kmOf({ distance: 25000 }), 25);
  assert.equal(kmOf({ distance: "184500" }), 184.5);
  assert.equal(kmOf({ totalMileage: "120.4" }), 120.4, "otras versiones: totalMileage en km");
  assert.equal(kmOf({ totalMileage: "250000" }), 250, "un trayecto de 250,000 «km» es imposible: venía en metros");
  assert.equal(kmOf({ elapsed: 300, avgSpeed: 40 }), 0);
  // 9:30 pm del 12 en RD = 01:30 del 13 en UTC → cuenta para el 12
  assert.equal(localDate("2026-10-13 01:30:00"), "2026-10-12");
  assert.equal(localDate("2026-10-12 12:00:00"), "2026-10-12");
  // el día 12 de RD se pide a la API de 04:00 UTC del 12 a 03:59:59 UTC del 13; nunca después de ahora
  assert.deepEqual(utcRange("2026-10-12", "2026-10-12", { now: new Date("2026-11-01T00:00:00Z") }), { begin: "2026-10-12 04:00:00", end: "2026-10-13 03:59:59", empty: false });
  assert.equal(utcRange("2026-10-01", "2026-10-31", { now: new Date("2026-10-13T13:10:00Z") }).end, "2026-10-13 13:09:00");
  assert.equal(utcRange("2026-11-01", "2026-11-15", { now: new Date("2026-10-13T13:10:00Z") }).empty, true);
  const items = [
    { imei: "8288", startTime: "2026-10-12 11:05:00", endTime: "2026-10-12 14:00:00", distance: 152300 }, // ida (mañana del 12)
    { imei: "8288", startTime: "2026-10-12 18:20:00", endTime: "2026-10-12 21:00:00", distance: 149800 }, // vuelta
    { imei: "8288", startTime: "2026-10-13 01:30:00", endTime: "2026-10-13 01:50:00", distance: 4100 },   // 9:30 pm del 12 en RD
    { imei: "8288", startTime: "2026-10-13 13:00:00", endTime: "2026-10-13 13:05:00", distance: 0 },      // hoy, encendido sin moverse
  ];
  const daily = summarize(items);
  assert.deepEqual(daily, [{ imei: "8288", date: "2026-10-12", km: 306.2 }, { imei: "8288", date: "2026-10-13", km: 0 }]);
});

// ── Km del GPS: todos los km del camión en el período, haya viaje o no ──────────
const gTrucks = [{ id: 1, plate: "International", gpsImei: "A" }, { id: 2, plate: "Freightliner", gpsImei: "B" }, { id: 3, plate: "Ford" }, { id: 4, plate: "Hino", gpsImei: "C" }, { id: 5, plate: "Mack", gpsImei: "D" }];
const gRow = (imei, date, km) => ({ imei, date, km, syncedAt: "2026-10-20T00:00:00Z" });
const gDist = [{ province: "P", municipality: "Lejos", km: 600 }, { province: "P", municipality: "Cerca", km: 200 }];
const gTrip = (id, truckId, date, municipality, extra = {}) => ({ id, truckId, date, status: "delivered", revenue: 10000, clientId: 1, driverId: id, province: "P", municipality, ...extra });
const gGps = [gRow("A", "2026-09-30", 500), gRow("A", "2026-10-01", 300), gRow("A", "2026-10-02", 320), gRow("A", "2026-10-03", 0), gRow("A", "2026-10-04", 80),
  gRow("B", "2026-10-02", 315.5), gRow("B", "2026-10-03", 0.8), gRow("C", "2026-10-04", 109)];

test("GPS por período: suma todos los días del camión dentro del período y dice qué días faltan", () => {
  const m = gpsPeriodKm({ trucks: gTrucks, gpsKm: gGps, dateFrom: "2026-10-01", dateTo: "2026-10-15", today: "2026-10-04" });
  assert.deepEqual(m.get(1), { imei: "A", km: 700, synced: true, daysWithData: 4, daysExpected: 4, missing: [] }, "el 30/09 es de otro período");
  assert.deepEqual(m.get(2).missing, ["2026-10-01", "2026-10-04"]);
  assert.equal(m.get(4).km, 109);
  assert.deepEqual(m.get(5), { imei: "D", km: 0, synced: false, daysWithData: 0, daysExpected: 4, missing: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"] });
  assert.equal(m.has(3), false, "camión sin GPS no aparece");
  assert.equal(gpsPeriodKm({ trucks: gTrucks, gpsKm: gGps, dateFrom: "2026-11-01", dateTo: "2026-11-15", today: "2026-10-04" }).get(1).daysExpected, 0, "período futuro: no falta nada");
});

test("costo por km con GPS: el camión cuenta todos sus km; la fecha del viaje no importa; por destino se reparte por distancia", () => {
  const trips = [
    gTrip(1, 1, "2026-10-01", "Lejos"),
    gTrip(2, 1, "2026-10-02", "Cerca"),
    gTrip(3, 1, "2026-10-04", "SinDistancia", { km: 80, kmSource: "gps" }), // km viejo de un solo día: no cuenta
    gTrip(4, 2, "2026-10-04", "Lejos"),            // cargado el 02, registrado el 04: igual se lleva todos los km del camión
    gTrip(5, 3, "2026-10-02", "Cerca"),            // sin GPS: distancia de referencia
    gTrip(6, 1, "2026-10-03", "Lejos", { status: "cancelled" }),
  ];
  const expenses = [{ id: 1, truckId: 4, date: "2026-10-04", category: "fuel", amount: 3000, gallons: 10 }, { id: 2, tripId: 1, category: "fuel", amount: 7000, gallons: 30 }];
  const r = costPerKm({ dateFrom: "2026-10-01", dateTo: "2026-10-15", today: "2026-10-04", trips, expenses, trucks: gTrucks, clients: [{ id: 1, rules: {} }], distances: gDist, gpsKm: gGps });
  const by = (p) => r.byTruck.find(t => t.plate === p);
  assert.equal(by("International").km, 700); assert.equal(by("International").trips, 3); assert.equal(by("International").kmBySource.gps, 3);
  assert.equal(by("International").costPerKm, 7000 / 700);
  assert.equal(by("Freightliner").km, 316.3); assert.equal(by("Freightliner").gpsDaysMissing, 2);
  assert.equal(by("Ford").km, 200); assert.equal(by("Ford").kmBySource.estimated, 1);
  assert.equal(by("Hino").km, 109, "con km y sin viajes: entra igual"); assert.equal(by("Hino").trips, 0); assert.equal(by("Hino").costPerKm, 3000 / 109);
  assert.equal(by("Mack"), undefined, "sin traer y sin gastos: no aparece");
  assert.equal(r.totals.km, 700 + 316.3 + 200 + 109);
  // International: Lejos 600, Cerca 200, sin distancia = promedio (400) → 700 × 600/1200, 200/1200, 400/1200
  const route = (m) => r.byRoute.find(x => x.municipality === m).km;
  assert.ok(Math.abs(route("Lejos") - (350 + 316.3)) < 1e-9);
  assert.ok(Math.abs(route("Cerca") - (700 / 6 + 200)) < 1e-9);
  assert.ok(Math.abs(route("SinDistancia") - 700 / 3) < 1e-9);
  assert.deepEqual(r.quality.gpsMissing, [{ truckId: 2, plate: "Freightliner", days: 2 }, { truckId: 4, plate: "Hino", days: 3 }]);
  assert.deepEqual(r.quality.gpsNotSynced, ["Mack"]);
  // sin días del GPS el resultado es el de siempre
  const plain = costPerKm({ dateFrom: "2026-10-01", dateTo: "2026-10-15", trips, expenses, trucks: gTrucks, clients: [{ id: 1, rules: {} }], distances: gDist });
  assert.equal(plain.byTruck.find(t => t.plate === "International").km, 600 + 200 + 80);
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
  assert.equal(r.byTruck[0].cost, 2500); assert.equal(r.byTruck[0].partnerRecovered, 2500);
  assert.equal(r.byRoute[0].cost, 2500);
  assert.equal(r.byDriver[0].fuel, 5000); assert.equal(r.byDriver[0].gallons, 25); assert.equal(r.byDriver[0].kmPerGallon, 12);
});

test("reparto de utilidad: margen de la página = parte de la empresa en la liquidación; en pérdida la empresa carga todo", async () => {
  const { computeSettlement } = await import("../src/utils/partnerModels.js");
  const period = { dateFrom: "2026-10-01", dateTo: "2026-10-15" };
  const ps = [{ id: 2, name: "Eudy", model: "profit_share", partnerSharePct: 60 }];
  const tk = [{ id: 3, plate: "B", partnerId: 2 }];
  const tr = [{ id: 2, truckId: 3, driverId: 2, clientId: 1, date: "2026-10-06", status: "delivered", revenue: 10000, province: "Santiago", municipality: "Santiago de los Caballeros", odoStart: 0, odoEnd: 300 }];
  // utilidad: 10000 − 7000 = 3000 → empresa 40 % = 1200
  const ex = [{ id: 1, tripId: 2, category: "fuel", amount: 5000, gallons: 20, status: "paid" }, { id: 2, tripId: 2, category: "driverPay", amount: 2000, status: "paid" }];
  const r = costPerKm({ ...period, trips: tr, expenses: ex, trucks: tk, partners: ps, clients, distances });
  const s = computeSettlement({ partner: ps[0], period, trips: tr, expenses: ex, trucks: tk, clients });
  assert.equal(s.companyShare, 1200);
  assert.equal(r.byTruck[0].companyRevenue, 4000); assert.equal(r.byTruck[0].cost, 2800); assert.equal(r.byTruck[0].margin, 1200);
  assert.equal(r.byTruck[0].partnerRecovered, 4200);
  // en pérdida (gastos 12000 > flete 10000): la empresa se queda con el flete y carga con todos los gastos → −2000
  const exLoss = [{ id: 1, tripId: 2, category: "repair", amount: 12000, status: "paid" }];
  const r2 = costPerKm({ ...period, trips: tr, expenses: exLoss, trucks: tk, partners: ps, clients, distances });
  const s2 = computeSettlement({ partner: ps[0], period, trips: tr, expenses: exLoss, trucks: tk, clients });
  assert.equal(s2.truckLossOut, 2000); assert.equal(s2.partnerShare, 0);
  assert.equal(r2.byTruck[0].companyRevenue, 10000); assert.equal(r2.byTruck[0].cost, 12000); assert.equal(r2.byTruck[0].margin, -2000);
  assert.equal(r2.byTruck[0].partnerRecovered, 0);
  // gasto marcado "no descontar al socio" (chargeToPartner:false): costo 100 % de la empresa
  const exOwn = [{ id: 1, tripId: 2, category: "fuel", amount: 1000, gallons: 5, status: "paid", chargeToPartner: false }];
  const r3 = costPerKm({ ...period, trips: tr, expenses: exOwn, trucks: tk, partners: ps, clients, distances });
  assert.equal(r3.byTruck[0].cost, 1000); assert.equal(r3.byTruck[0].companyRevenue, 4000);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayroll, docsComplete, docsRequired } from "../src/utils/payroll.js";
import { driverPeriodReportHTML, payrollReportHTML } from "../src/utils/printReport.js";

const period = { dateFrom: "2026-09-30", dateTo: "2026-10-14", half: 1, label: "30 Sep–14 Oct" };
const drivers = [
  { id: 1, name: "Rober", payType: "perTrip", rateSheets: [{ id: 1, name: "General", clientId: null, rates: [{ province: "Dajabón", municipality: "Dajabón", priceT1: 2000, dietaT1: 500, helperT1: 1000, priceT2: 2500, dietaT2: 600, helperT2: 1200 }] }] },
  { id: 2, name: "Fijo", payType: "fixed", fixedAmount: 20000 },
  { id: 3, name: "SinViajes", payType: "perTrip", rateSheets: [] },
];
const trucks = [{ id: 1, plate: "A1", size: "T1" }, { id: 2, plate: "B2", size: "T2" }];
const clients = [{ id: 1, companyName: "Bocel", rules: { requiresPOD: true, requiresInvoiceRef: true } }];
const trips = [
  { id: 10, date: "2026-09-30", driverId: 1, truckId: 1, clientId: 1, province: "Dajabón", municipality: "Dajabón", status: "delivered", docs: { factura: true, pod: true }, docsReceivedAt: "2026-10-03", helpers: [{ name: "Miguel" }] },
  { id: 15, date: "2026-09-20", driverId: 1, truckId: 1, clientId: 1, province: "Dajabón", municipality: "Dajabón", status: "delivered", docs: { factura: true, pod: true }, docsReceivedAt: "2026-10-10" }, // viaje viejo, packing entregado en este período
  { id: 11, date: "2026-10-14", driverId: 1, truckId: 2, clientId: 1, province: "Dajabón", municipality: "Dajabón", status: "delivered", numHelpers: 1, discounts: [{ amount: 300 }] },
  { id: 12, date: "2026-10-15", driverId: 1, truckId: 1, clientId: 1, province: "Dajabón", municipality: "Dajabón", status: "delivered" }, // fuera
  { id: 13, date: "2026-10-02", driverId: 1, truckId: 1, clientId: 1, province: "Dajabón", municipality: "Dajabón", status: "cancelled" },
  { id: 14, date: "2026-10-03", driverId: 2, truckId: 1, clientId: 1, province: "Dajabón", municipality: "Dajabón", status: "delivered" },
];
const expenses = [{ id: 1, category: "adelanto_conductor", driverId: 1, date: "2026-10-05", amount: 700 }];

test("buildPayroll: solo viajes recibidos entran; los pendientes se listan aparte", () => {
  const p = buildPayroll({ period, drivers, trips, trucks, clients, expenses });
  const r = p.drivers.find(x => x.driver.id === 1);
  assert.equal(r.allTrips.length, 3);
  assert.equal(r.tripCount, 2, "el 10 (recibido el 3 oct) y el 15 (viaje de sept, packing entregado el 10 oct)");
  assert.deepEqual(r.trips.map(x => x.trip.id), [15, 10]);
  assert.equal(r.pendingCount, 1);
  assert.equal(r.pendingTrips[0].trip.id, 11);
  assert.equal(r.base, 4000); assert.equal(r.dieta, 1000);
  assert.equal(r.helpers, 2 * 1000);
  assert.equal(r.discounts, 0); assert.equal(r.advances, 700);
  assert.equal(r.net, 5000 - 700);
  assert.deepEqual(r.helperNames, ["Miguel"]);
  const f = p.drivers.find(x => x.driver.id === 2);
  assert.equal(f.gross, 20000); assert.equal(f.net, 20000);
  assert.ok(!p.drivers.find(x => x.driver.id === 3), "sin viajes y no fijo → no aparece");
  assert.equal(p.totals.total, p.totals.net + p.totals.helpers);
});

test("un viaje recibido después del cierre se paga en la quincena siguiente, no en la del viaje", () => {
  const next = { dateFrom: "2026-10-15", dateTo: "2026-10-29", half: 2, label: "15–29 Oct" };
  const late = trips.map(t => t.id === 11 ? { ...t, docs: { factura: true, pod: true }, docsReceivedAt: "2026-10-20" } : t);
  const cur = buildPayroll({ period, drivers, trips: late, trucks, clients, expenses }).drivers.find(x => x.driver.id === 1);
  const nxt = buildPayroll({ period: next, drivers, trips: late, trucks, clients, expenses }).drivers.find(x => x.driver.id === 1);
  assert.ok(!cur.trips.some(x => x.trip.id === 11), "no en la quincena del viaje");
  assert.equal(cur.pendingCount, 0, "ya no está pendiente");
  assert.ok(nxt.trips.some(x => x.trip.id === 11), "sí en la quincena en que se recibió");
});

test("documentos requeridos según reglas del cliente", () => {
  assert.deepEqual(docsRequired(clients[0]).map(d => d.key), ["factura", "pod"]);
  assert.equal(docsComplete(trips.find(t => t.id === 10), clients[0]), true);
  assert.equal(docsComplete(trips.find(t => t.id === 11), clients[0]), false);
  assert.deepEqual(docsRequired({ rules: {} }).map(d => d.key), ["factura", "conduce", "pod"]);
});

test("el PDF del chofer no contiene montos y escapa HTML; el de nómina sí tiene totales", () => {
  const p = buildPayroll({ period, drivers, trips: trips.map(t => t.id === 10 ? { ...t, invoiceRef: "<img src=x onerror=alert(1)>" } : t), trucks, clients, expenses });
  const html = driverPeriodReportHTML({ row: p.drivers[0], period, generatedBy: "Ana" });
  assert.ok(!html.includes("RD$"), "sin montos");
  assert.ok(html.includes("pendiente(s) de entrega"), "avisa de los pendientes");
  assert.ok(!html.includes(">B2<"), "el viaje pendiente (camión B2) no sale en la relación");
  assert.ok(!html.includes("<img src=x"), "escapado");
  assert.ok(html.includes("&lt;img"));
  const pay = payrollReportHTML({ payroll: p, generatedBy: "Ana" });
  assert.ok(pay.includes("Total nómina del período"));
  assert.ok(pay.includes("RD$"));
});

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
  { id: 10, date: "2026-09-30", driverId: 1, truckId: 1, clientId: 1, province: "Dajabón", municipality: "Dajabón", status: "delivered", docs: { factura: true, pod: true }, helpers: [{ name: "Miguel" }] },
  { id: 11, date: "2026-10-14", driverId: 1, truckId: 2, clientId: 1, province: "Dajabón", municipality: "Dajabón", status: "delivered", numHelpers: 1, discounts: [{ amount: 300 }] },
  { id: 12, date: "2026-10-15", driverId: 1, truckId: 1, clientId: 1, province: "Dajabón", municipality: "Dajabón", status: "delivered" }, // fuera
  { id: 13, date: "2026-10-02", driverId: 1, truckId: 1, clientId: 1, province: "Dajabón", municipality: "Dajabón", status: "cancelled" },
  { id: 14, date: "2026-10-03", driverId: 2, truckId: 1, clientId: 1, province: "Dajabón", municipality: "Dajabón", status: "delivered" },
];
const expenses = [{ id: 1, category: "adelanto_conductor", driverId: 1, date: "2026-10-05", amount: 700 }];

test("buildPayroll: período 30→14, dieta incluida, ayudantes variables, adelantos y fijo", () => {
  const p = buildPayroll({ period, drivers, trips, trucks, clients, expenses });
  const r = p.drivers.find(x => x.driver.id === 1);
  assert.equal(r.tripCount, 2);
  assert.equal(r.base, 2000 + 2500); assert.equal(r.dieta, 500 + 600);
  assert.equal(r.helpers, 1 * 1000 + 1 * 1200);
  assert.equal(r.discounts, 300); assert.equal(r.advances, 700);
  assert.equal(r.net, 5600 - 300 - 700);
  assert.deepEqual(r.helperNames, ["Miguel"]);
  assert.equal(r.docsPending, 1);
  const f = p.drivers.find(x => x.driver.id === 2);
  assert.equal(f.gross, 20000); assert.equal(f.net, 20000);
  assert.ok(!p.drivers.find(x => x.driver.id === 3), "sin viajes y no fijo → no aparece");
  assert.equal(p.totals.total, p.totals.net + p.totals.helpers);
});

test("documentos requeridos según reglas del cliente", () => {
  assert.deepEqual(docsRequired(clients[0]).map(d => d.key), ["factura", "pod"]);
  assert.equal(docsComplete(trips[0], clients[0]), true);
  assert.equal(docsComplete(trips[1], clients[0]), false);
  assert.deepEqual(docsRequired({ rules: {} }).map(d => d.key), ["factura", "conduce", "pod"]);
});

test("el PDF del chofer no contiene montos y escapa HTML; el de nómina sí tiene totales", () => {
  const p = buildPayroll({ period, drivers, trips: trips.map(t => t.id === 10 ? { ...t, invoiceRef: "<img src=x onerror=alert(1)>" } : t), trucks, clients, expenses });
  const html = driverPeriodReportHTML({ row: p.drivers[0], period, generatedBy: "Ana" });
  assert.ok(!html.includes("RD$"), "sin montos");
  assert.ok(!html.includes("onerror=alert"), "escapado");
  assert.ok(html.includes("&lt;img"));
  const pay = payrollReportHTML({ payroll: p, generatedBy: "Ana" });
  assert.ok(pay.includes("Total nómina del período"));
  assert.ok(pay.includes("RD$"));
});

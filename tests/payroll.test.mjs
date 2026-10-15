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
  // dieta 500 por viaje repartida con 1 ayudante: 250 al chofer, 250 al ayudante
  assert.equal(r.base, 4000); assert.equal(r.dieta, 500);
  assert.equal(r.helpers, 2 * 1250);
  assert.equal(r.discounts, 0); assert.equal(r.advances, 700);
  assert.equal(r.net, 4500 - 700);
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

// ── payrollPayment ─────────────────────────────────────────────────────────
import { payrollPayment, payrollKey } from "../src/utils/payroll.js";
const pdKey = { ...period, mStr: "2026-10" };

test("payrollPayment: pendiente sin gastos, pagado cuando todos los driverPay de los viajes están pagados", () => {
  const p = buildPayroll({ period: pdKey, drivers, trips, trucks, clients, expenses });
  const row = p.drivers.find(x => x.driver.id === 1);
  let pay = payrollPayment({ row, period: pdKey, expenses });
  assert.equal(pay.paid, false); assert.equal(pay.partial, false);
  assert.equal(pay.driverTotal, row.gross - row.discounts);
  assert.equal(pay.net, row.net);
  const paidExps = [...expenses,
    { id: 2, category: "driverPay", tripId: 15, driverId: 1, amount: 2500, status: "paid" },
    { id: 3, category: "driverPay", tripId: 10, driverId: 1, amount: 2500, status: "paid" }];
  pay = payrollPayment({ row, period: pdKey, expenses: paidExps });
  assert.equal(pay.paid, true);
  // uno solo pagado → parcial
  pay = payrollPayment({ row, period: pdKey, expenses: paidExps.slice(0, 2) });
  assert.equal(pay.paid, false); assert.equal(pay.partial, true); assert.equal(pay.paidCount, 1);
});

test("payrollPayment: override por viaje y override total", () => {
  const p = buildPayroll({ period: pdKey, drivers, trips, trucks, clients, expenses });
  const row = p.drivers.find(x => x.driver.id === 1);
  const withLine = [...expenses, { id: 2, category: "driverPay", tripId: 15, driverId: 1, amount: 1000, calcAmount: 2500, overrideNote: "daño", status: "pending" }];
  let pay = payrollPayment({ row, period: pdKey, expenses: withLine });
  const l = pay.lines.find(x => x.trip.id === 15);
  assert.equal(l.overridden, true); assert.equal(l.amount, 1000);
  assert.equal(pay.driverTotal, 1000 + 2250, "el otro viaje: 2000 + 250 de dieta (la otra mitad va al ayudante)");
  const withTotal = [...withLine, { id: 3, category: "nominaTotalOverride", driverId: 1, payrollKey: payrollKey(pdKey), amount: 9000, status: "pending" }];
  pay = payrollPayment({ row, period: pdKey, expenses: withTotal });
  assert.ok(pay.override); assert.equal(pay.grossEff, 9000); assert.equal(pay.net, 9000 - 700);
  // override de otro período no aplica
  const other = [...withLine, { id: 3, category: "nominaTotalOverride", driverId: 1, payrollKey: "2026-09-H2", amount: 9000 }];
  assert.equal(payrollPayment({ row, period: pdKey, expenses: other }).override, null);
});

test("payrollPayment: chofer fijo se paga con un driverPay sin viaje con payrollKey", () => {
  const p = buildPayroll({ period: pdKey, drivers, trips, trucks, clients, expenses });
  const row = p.drivers.find(x => x.driver.id === 2);
  assert.equal(payrollPayment({ row, period: pdKey, expenses }).paid, false);
  const paid = [...expenses, { id: 9, category: "driverPay", driverId: 2, tripId: null, payrollKey: payrollKey(pdKey), amount: 20000, status: "paid" }];
  const pay = payrollPayment({ row, period: pdKey, expenses: paid });
  assert.equal(pay.paid, true); assert.equal(pay.net, 20000);
});

test("adelantos: con viaje van a la quincena en que se paga ese viaje (sin driverId); los de ayudantes por el chofer bajan lo de ayudantes", () => {
  // Trip 10 se paga en este período (docs 3 oct). Trip 11 espera documentos. Trip 12 es de la quincena siguiente.
  const advs = [
    { id: 1, category: "adelanto_conductor", tripId: 10, date: "2026-10-15", amount: 343.33 },   // fecha fuera del período, pero el viaje se paga aquí
    { id: 2, category: "adelanto_ayudante", tripId: 10, date: "2026-10-15", amount: 343.33 },    // sin ayudanteId → por el chofer
    { id: 3, category: "adelanto_ayudante", tripId: 10, date: "2026-10-15", amount: 343.33 },
    { id: 4, category: "adelanto_conductor", tripId: 11, date: "2026-10-05", amount: 1000 },     // viaje sin documentos: espera
    { id: 5, category: "adelanto_conductor", driverId: 1, date: "2026-10-05", amount: 200 },     // sin viaje: por fecha
    { id: 6, category: "adelanto_conductor", driverId: 1, date: "2026-10-05", amount: 999, payrollKey: "2026-09-H2" }, // ya aplicado en otra nómina
  ];
  const r = buildPayroll({ period, drivers, trips, trucks, clients, expenses: advs }).drivers.find(x => x.driver.id === 1);
  assert.equal(r.advances, 343.33 + 200, "adelanto del viaje 10 + adelanto suelto por fecha; el del viaje 11 espera; el aplicado en otra quincena no");
  assert.deepEqual(r.advExps.map(e => e.id), [1, 5]);
  assert.equal(r.helperAdvances, 686.66); assert.deepEqual(r.helperAdvExps.map(e => e.id), [2, 3]);
  assert.equal(r.helpers, 2500); assert.equal(r.helpersNet, 2500 - 686.66);
  assert.equal(r.net, 4500 - 543.33);
  // La quincena siguiente: el adelanto del viaje 10 no se repite por fecha (el viaje ya se pagó antes y su fecha cae aquí → sí se descuenta solo si no se aplicó)
  const next = { dateFrom: "2026-10-15", dateTo: "2026-10-31", half: 2, label: "" };
  const r2 = buildPayroll({ period: next, drivers, trips, trucks, clients, expenses: advs }).drivers.find(x => x.driver.id === 1);
  assert.deepEqual(r2.advExps.map(e => e.id), [1], "sin payrollKey todavía: cae por fecha en la quincena en que se registró (viaje ya pagado antes)");
  const applied = advs.map(e => e.id === 1 || e.id === 2 || e.id === 3 ? { ...e, payrollKey: "2026-10-H1" } : e);
  const r3 = buildPayroll({ period: next, drivers, trips, trucks, clients, expenses: applied }).drivers.find(x => x.driver.id === 1);
  assert.deepEqual(r3.advExps.map(e => e.id), [], "una vez pagada la nómina de H1 con esos adelantos, no vuelven a salir");
});

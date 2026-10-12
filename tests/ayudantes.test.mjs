import { test } from "node:test";
import assert from "node:assert/strict";
import { splitTripHelpers, buildHelperLines, crewSlots, helperExpensePlan, applyHelperPlan, planToNewExpenses, clientHelpersMode, clientSkipsHelpers, normalizeAyudante } from "../src/utils/ayudantes.js";
import { buildPayroll, payrollPayment, buildHelperPayroll, helperPayrollPayment } from "../src/utils/payroll.js";
import { buildCompanionTrip } from "../src/utils/jointTrip.js";
import { calcDriverPay } from "../src/utils/driverPay.js";

const ayudantes = [
  { id: 1, name: "Pedro", payMode: "direct", status: "active" },
  { id: 2, name: "Juan", payMode: "driver", status: "active" },
  { id: 3, name: "Luis", payMode: "direct", status: "inactive" },
  { id: 4, name: "Ramón", status: "active" }, // sin payMode → directo
];
const driver = { id: 7, name: "Rober", payType: "perTrip", rateSheets: [{ id: 1, name: "General", clientId: null, rates: [{ province: "Santiago", municipality: "Santiago de los Caballeros", priceT1: 1000, dietaT1: 0, helperT1: 300, priceT2: 2000, dietaT2: 200, helperT2: 400 }] }] };
const trucks = [{ id: 1, plate: "L1", size: "T2", helperIds: [1, 2] }, { id: 2, plate: "L2", size: "T1" }];
const client = { id: 5, companyName: "Bocel", rules: {} };
const base = { driverId: 7, truckId: 1, clientId: 5, province: "Santiago", municipality: "Santiago de los Caballeros", revenue: 9000, status: "delivered" };

test("regla del cliente: normal / no lleva / los paga el cliente", () => {
  assert.equal(clientHelpersMode(client), "normal");
  assert.equal(clientHelpersMode({ rules: { helpersMode: "none" } }), "none");
  assert.equal(clientHelpersMode({ rules: { helpersMode: "client" } }), "client");
  assert.equal(clientHelpersMode({ rules: { helpersMode: "otra" } }), "normal");
  assert.equal(clientSkipsHelpers({ rules: { helpersMode: "client" } }), true);
  assert.equal(clientSkipsHelpers(undefined), false);
  assert.equal(normalizeAyudante({ id: 9 }).payMode, "direct");
});

test("viaje viejo (sin ayudantes de la lista): todo por el chofer, igual que antes", () => {
  const trip = { ...base, helpers: [{ name: "Ayudante 1", pay: 400 }, { name: "Ayudante 2", pay: 400 }] };
  const calc = calcDriverPay({ driver, trip, truck: trucks[0], clientId: 5 });
  const s = splitTripHelpers(trip, calc);
  assert.equal(calc.helpersTotal, 800);
  assert.deepEqual(s.direct, []); assert.equal(s.viaDriver.count, 2); assert.equal(s.viaDriver.amount, 800);
  // sin líneas en absoluto (viajes muy viejos)
  const s2 = splitTripHelpers({ ...base }, calc);
  assert.equal(s2.viaDriver.amount, 800);
});

test("tripulación del camión y líneas del viaje (directo / por el chofer / otro)", () => {
  assert.deepEqual(crewSlots(trucks[0], ayudantes), { helperIds: [1, 2], helperNames: ["Pedro", "Juan"] });
  assert.deepEqual(crewSlots({ helperIds: [3, 1] }, ayudantes), { helperIds: [1], helperNames: ["Pedro"] }); // inactivo no sale
  assert.deepEqual(crewSlots(trucks[1], ayudantes), { helperIds: [], helperNames: [] });
  const lines = buildHelperLines({ count: 3, pay: 400, helperIds: [1, 2, null], helperNames: ["", "", "Chichí"], ayudantes });
  assert.deepEqual(lines, [
    { name: "Pedro", pay: 400, ayudanteId: 1, direct: true },
    { name: "Juan", pay: 400, ayudanteId: 2, direct: false },
    { name: "Chichí", pay: 400 },
  ]);
  assert.deepEqual(buildHelperLines({ count: 1, pay: 300, ayudantes }), [{ name: "Ayudante 1", pay: 300 }]);
});

test("reparto: el directo cobra aparte, el resto va al chofer", () => {
  const trip = { ...base, helpers: buildHelperLines({ count: 2, pay: 400, helperIds: [1, 2], ayudantes }) };
  const calc = calcDriverPay({ driver, trip, truck: trucks[0], clientId: 5 });
  const s = splitTripHelpers(trip, calc);
  assert.deepEqual(s.direct, [{ ayudanteId: 1, name: "Pedro", amount: 400 }]);
  assert.equal(s.viaDriver.count, 1); assert.equal(s.viaDriver.amount, 400); assert.equal(s.directTotal, 400);
  // si el viaje lleva menos ayudantes que líneas, solo cuentan los primeros
  const s1 = splitTripHelpers({ ...trip, numHelpers: 1 }, calcDriverPay({ driver, trip: { ...trip, numHelpers: 1 }, truck: trucks[0], clientId: 5 }));
  assert.equal(s1.direct.length, 1); assert.equal(s1.viaDriver.count, 0);
});

test("gastos del viaje: crear, cambiar de ayudante, lo pagado no se toca, cancelado quita lo pendiente", () => {
  const trip = { id: 50, ...base, date: "2026-10-05", helpers: buildHelperLines({ count: 2, pay: 400, helperIds: [1, 2], ayudantes }) };
  const calc = calcDriverPay({ driver, trip, truck: trucks[0], clientId: 5 });
  const plan = helperExpensePlan({ trip, calc });
  let exps = applyHelperPlan([{ id: 1, tripId: 50, category: "driverPay", amount: 2200, status: "pending" }], { tripId: 50, date: trip.date, plan });
  const viaDriver = exps.find(e => e.category === "helper" && e.ayudanteId == null), pedro = exps.find(e => e.ayudanteId === 1);
  assert.equal(viaDriver.amount, 400); assert.equal(viaDriver.driverId, 7);
  assert.equal(pedro.amount, 400); assert.equal(pedro.driverId, undefined);
  assert.equal(exps.length, 3);
  // Cambian a Pedro por Ramón (también directo): el gasto de Pedro (pendiente) se quita, nace el de Ramón
  const trip2 = { ...trip, helpers: buildHelperLines({ count: 2, pay: 400, helperIds: [4, 2], ayudantes }) };
  exps = applyHelperPlan(exps, { tripId: 50, date: trip.date, plan: helperExpensePlan({ trip: trip2, calc }) });
  assert.equal(exps.some(e => e.ayudanteId === 1), false); assert.equal(exps.find(e => e.ayudanteId === 4).amount, 400);
  // Ramón ya pagado: si lo cambian, su gasto pagado se queda
  exps = exps.map(e => e.ayudanteId === 4 ? { ...e, status: "paid" } : e);
  const trip3 = { ...trip, helpers: buildHelperLines({ count: 2, pay: 400, helperIds: [1, 2], ayudantes }) };
  exps = applyHelperPlan(exps, { tripId: 50, date: trip.date, plan: helperExpensePlan({ trip: trip3, calc }) });
  assert.equal(exps.find(e => e.ayudanteId === 4).status, "paid"); assert.equal(exps.find(e => e.ayudanteId === 1).amount, 400);
  // Cancelado: se quitan los pendientes, el pagado se queda
  exps = applyHelperPlan(exps, { tripId: 50, date: trip.date, plan: helperExpensePlan({ trip: { ...trip3, status: "cancelled" }, calc }) });
  assert.deepEqual(exps.filter(e => e.category === "helper").map(e => e.ayudanteId), [4]);
  // Otro viaje no se toca
  const other = applyHelperPlan([{ id: 9, tripId: 99, category: "helper", amount: 300, ayudanteId: 1, status: "pending" }], { tripId: 50, date: "2026-10-05", plan: [] });
  assert.equal(other.length, 1);
});

test("viaje viejo: el plan da exactamente el mismo gasto de ayudantes que antes", () => {
  const trip = { id: 51, ...base, date: "2026-10-05", helpers: [{ name: "Ayudante 1", pay: 400 }, { name: "Ayudante 2", pay: 400 }] };
  const calc = calcDriverPay({ driver, trip, truck: trucks[0], clientId: 5 });
  const created = planToNewExpenses(helperExpensePlan({ trip, calc, driverDescription: (n) => `Ayudantes (${n}) · ${trip.municipality}` }), { tripId: 51, date: trip.date });
  assert.deepEqual(created, [{ tripId: 51, date: "2026-10-05", category: "helper", amount: 800, description: "Ayudantes (2) · Santiago de los Caballeros", paymentMethod: "transfer", status: "pending", supplierId: null, driverId: 7 }]);
});

const period = { mStr: "2026-10", half: 1, dateFrom: "2026-10-01", dateTo: "2026-10-15", label: "Oct 1–15" };
const mkTrip = (id, date, helperIds, extra = {}) => ({ id, ...base, date, docs: { factura: true, conduce: true, pod: true }, docsReceivedAt: date, helpers: buildHelperLines({ count: 2, pay: 400, helperIds, ayudantes }), ...extra });

test("nómina: al chofer solo los ayudantes que van por él; nómina aparte para los directos", () => {
  const trips = [
    mkTrip(1, "2026-10-03", [1, 2]),
    mkTrip(2, "2026-10-04", [1, null]),
    mkTrip(3, "2026-10-05", [null, null]),                                   // como antes
    mkTrip(4, "2026-10-06", [1, 2], { docs: {}, docsReceivedAt: null }),    // sin documentos: espera
    mkTrip(5, "2026-10-14", [1, 2], { docsReceivedAt: "2026-10-20" }),      // recibido en la otra quincena
  ];
  const expenses = [{ id: 1, category: "adelanto_ayudante", ayudanteId: 1, amount: 300, date: "2026-10-08", status: "paid" },
                    { id: 2, category: "adelanto_ayudante", ayudanteId: 1, amount: 999, date: "2026-10-20", status: "paid" }];
  const p = buildPayroll({ period, drivers: [driver], trips, trucks, clients: [client], expenses });
  const r = p.drivers[0];
  assert.equal(r.tripCount, 3);
  // viaje 1: 1 por chofer (Juan) · viaje 2: 1 por chofer (Ayudante 2) · viaje 3: 2 por chofer → 4 × 400
  assert.equal(r.helpers, 1600); assert.equal(r.helperCount, 4); assert.equal(r.directHelpers, 800);
  assert.equal(r.helperNames.includes("Pedro"), false);
  assert.equal(p.totals.helpers, 1600);
  const h = buildHelperPayroll({ period, ayudantes, drivers: [driver], trips, trucks, clients: [client], expenses });
  assert.equal(h.rows.length, 1);
  const pedro = h.rows[0];
  assert.equal(pedro.ayudante.name, "Pedro"); assert.equal(pedro.tripCount, 2); assert.equal(pedro.gross, 800);
  assert.equal(pedro.advances, 300); assert.equal(pedro.net, 500);
  assert.equal(pedro.pendingCount, 1); // el viaje 4 espera documentos
  assert.deepEqual(h.totals, { trips: 2, gross: 800, advances: 300, net: 500 });
  // Siguiente quincena: el viaje 5 (recibido el 20) y el adelanto del 20
  const h2 = buildHelperPayroll({ period: { ...period, half: 2, dateFrom: "2026-10-16", dateTo: "2026-10-31" }, ayudantes, drivers: [driver], trips, trucks, clients: [client], expenses });
  assert.equal(h2.rows[0].tripCount, 1); assert.equal(h2.rows[0].advances, 999); assert.equal(h2.rows[0].net, 0);
});

test("pago: el del chofer no toca los gastos de ayudantes directos y viceversa", () => {
  const trips = [mkTrip(1, "2026-10-03", [1, 2])];
  const expenses = [
    { id: 1, tripId: 1, category: "driverPay", amount: 2200, status: "paid", driverId: 7 },
    { id: 2, tripId: 1, category: "helper", amount: 400, status: "paid", driverId: 7 },
    { id: 3, tripId: 1, category: "helper", amount: 400, status: "pending", ayudanteId: 1 },
  ];
  const p = buildPayroll({ period, drivers: [driver], trips, trucks, clients: [client], expenses });
  const pay = payrollPayment({ row: p.drivers[0], period, expenses });
  assert.deepEqual(pay.helperExps.map(e => e.id), [2]);
  assert.equal(pay.paid, true);
  const h = buildHelperPayroll({ period, ayudantes, drivers: [driver], trips, trucks, clients: [client], expenses });
  const hp = helperPayrollPayment({ row: h.rows[0], period, expenses });
  assert.equal(hp.paid, false); assert.equal(hp.lines[0].exp.id, 3);
  const hp2 = helperPayrollPayment({ row: h.rows[0], period, expenses: expenses.map(e => e.id === 3 ? { ...e, status: "paid" } : e) });
  assert.equal(hp2.paid, true);
});

test("viaje conjunto: el compañero lleva la tripulación de su camión; cliente sin ayudantes → 0", () => {
  const trip = { id: 10, ...base, truckId: 2, date: "2026-10-05", invoiceRef: "X1" };
  const built = buildCompanionTrip({ trip, companionDriverId: 7, companionTruckId: 1, drivers: [driver], trucks, clients: [{ ...client, rates: [] }], ayudantes, nextTripId: 11, nextExpenseId: 100 });
  assert.deepEqual(built.trip.helpers.map(h => h.ayudanteId), [1, 2]);
  const helperExps = built.expenses.filter(e => e.category === "helper");
  assert.deepEqual(helperExps.map(e => [e.ayudanteId ?? null, e.amount]), [[null, 400], [1, 400]]);
  // sin lista de ayudantes: igual que antes
  const plain = buildCompanionTrip({ trip, companionDriverId: 7, companionTruckId: 1, drivers: [driver], trucks, clients: [{ ...client, rates: [] }], nextTripId: 11, nextExpenseId: 100 });
  assert.deepEqual(plain.trip.helpers, [{ name: "Ayudante 1", pay: 400 }, { name: "Ayudante 2", pay: 400 }]);
  assert.deepEqual(plain.trip.helperNames, []);
  assert.deepEqual(plain.expenses.filter(e => e.category === "helper").map(e => [e.amount, e.driverId]), [[800, 7]]);
  // cliente que paga los ayudantes
  const none = buildCompanionTrip({ trip, companionDriverId: 7, companionTruckId: 1, drivers: [driver], trucks, clients: [{ ...client, rates: [], rules: { helpersMode: "client" } }], ayudantes, nextTripId: 11, nextExpenseId: 100 });
  assert.equal(none.trip.numHelpers, 0); assert.equal(none.expenses.some(e => e.category === "helper"), false);
});

// ── Correcciones de la revisión independiente ─────────────────────────────────
import { tripHelpersPaid, linesUseList } from "../src/utils/ayudantes.js";

test("editar un viaje viejo no cambia cómo se le paga a un ayudante aunque cambie su forma de pago en la lista", () => {
  const prev = buildHelperLines({ count: 2, pay: 400, helperIds: [1, 2], ayudantes });
  assert.equal(prev[0].direct, true);
  const later = ayudantes.map(a => a.id === 1 ? { ...a, payMode: "driver" } : a); // Pedro pasó a «por el chofer»
  const again = buildHelperLines({ count: 2, pay: 400, helperIds: [1, 2], ayudantes: later, prevLines: prev });
  assert.equal(again[0].direct, true, "en ese viaje se le sigue pagando directo");
  const fresh = buildHelperLines({ count: 2, pay: 400, helperIds: [1, 2], ayudantes: later });
  assert.equal(fresh[0].direct, false, "en un viaje nuevo ya va por el chofer");
});

test("candado: se sabe si un viaje ya tiene ayudantes pagados y si usa la lista", () => {
  assert.equal(tripHelpersPaid([{ tripId: 1, category: "helper", status: "paid" }], 1), true);
  // si ya se pagó la nómina del chofer de ese viaje, también hay candado (mover un ayudante movería dinero ya pagado)
  assert.equal(tripHelpersPaid([{ tripId: 1, category: "helper", status: "pending" }, { tripId: 1, category: "driverPay", status: "paid" }], 1), true);
  assert.equal(tripHelpersPaid([{ tripId: 1, category: "helper", status: "pending" }, { tripId: 1, category: "driverPay", status: "pending" }, { tripId: 2, category: "helper", status: "paid" }], 1), false);
  assert.equal(linesUseList([{ name: "x", pay: 1 }]), false);
  assert.equal(linesUseList([{ name: "x", pay: 1, ayudanteId: 3 }]), true);
});

test("un directo que ya no está en la lista igual sale en la nómina de ayudantes (no se pierde el dinero)", () => {
  const trips = [mkTrip(1, "2026-10-03", [1, 2])];
  const sinPedro = ayudantes.filter(a => a.id !== 1);
  const p = buildPayroll({ period, drivers: [driver], trips, trucks, clients: [client], expenses: [] });
  const h = buildHelperPayroll({ period, ayudantes: [null, ...sinPedro], drivers: [driver], trips, trucks, clients: [client], expenses: [] });
  assert.equal(h.rows.length, 1); assert.equal(h.rows[0].ayudante.id, 1); assert.match(h.rows[0].ayudante.name, /no está en la lista/);
  assert.equal(p.drivers[0].helpers + h.totals.gross, 800, "chofer 400 + directo 400 = todo el pago de ayudantes");
});

test("viaje conjunto: quien ya va en el viaje original no se repite en el del compañero", () => {
  const trip = { id: 10, ...base, truckId: 2, date: "2026-10-05", helpers: [{ name: "Pedro", pay: 400, ayudanteId: 1, direct: true }] };
  const built = buildCompanionTrip({ trip, companionDriverId: 7, companionTruckId: 1, drivers: [driver], trucks, clients: [{ ...client, rates: [] }], ayudantes, nextTripId: 11, nextExpenseId: 100 });
  assert.deepEqual(built.trip.helpers.map(h => h.ayudanteId ?? null), [2, null]);
});

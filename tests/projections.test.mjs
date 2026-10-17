import { test } from "node:test";
import assert from "node:assert/strict";
import { runRate, cashFlow, breakEven, scenario, payrollPayDate, weekStart, shiftDays, projections } from "../src/utils/projections.js";

const today = "2026-10-17"; // sábado
const clients = [{ id: 1, companyName: "Bocel", rules: { billingCycle: "bimonthly_delayed", period1PayDay: 15, period2PayDay: 31, paymentTerms: 30 } }, { id: 2, companyName: "Pimco", rules: { billingCycle: "net", paymentTerms: 15 } }];
const trucks = [{ id: 1, plate: "Propio T1", size: "T1" }, { id: 2, plate: "Socio T2", size: "T2", partnerId: 1 }];
const partners = [{ id: 1, name: "Robinson", model: "commission_expenses", companyPct: 10, fondoDays: 30, status: "active" }];
// 4 semanas: 2 viajes por semana en el propio (10,000) + 1 en el del socio (20,000)
const trips = []; let id = 1;
for (let w = 0; w < 4; w++) { const base = shiftDays("2026-09-14", 7 * w); trips.push({ id: id++, date: base, truckId: 1, clientId: 2, revenue: 10000, status: "delivered", docsReceivedAt: base }, { id: id++, date: shiftDays(base, 2), truckId: 1, clientId: 1, revenue: 10000, status: "delivered", docsReceivedAt: shiftDays(base, 2) }, { id: id++, date: shiftDays(base, 3), truckId: 2, clientId: 1, revenue: 20000, status: "delivered", docsReceivedAt: shiftDays(base, 3) }); }
const expenses = trips.flatMap(t => [{ id: t.id * 10, tripId: t.id, date: t.date, category: "driverPay", amount: 2000, status: "pending" }, { id: t.id * 10 + 1, tripId: t.id, date: t.date, category: "fuel", amount: 3000, status: "paid", paymentMethod: "cash" }]);
const bankAccount = { name: "Cuenta", openingBalance: 0, openingDate: "2026-10-16", accounts: [{ id: "income", role: "income", name: "Income", active: true, openingBalance: 10000, openingDate: "2026-10-16" }, { id: "opex", role: "opex", name: "OpEx", active: true, openingBalance: 40000, openingDate: "2026-10-16" }, { id: "reserve", role: "reserve", name: "Reserva", active: true, openingBalance: 5000, openingDate: "2026-10-16" }] };
const base = { today, trips, expenses, trucks, clients, partners, brokers: [], drivers: [], suppliers: [], invoices: [], cobros: [], fixedTemplates: [{ id: 1, name: "Oficina", amount: 30000 }], settlementStatus: {}, bankAccount, bankTransfers: [], bankReconciliation: {}, pfSettings: { reservePct: 20 } };

test("ritmo: semanas completas, promedios por semana y por viaje, empresa vs socios", () => {
  const r = runRate({ ...base, weeks: 8 });
  assert.equal(weekStart(today), "2026-10-12");
  assert.equal(r.to, "2026-10-11"); assert.equal(r.weeks, 4, "solo hay 4 semanas con viajes");
  assert.equal(r.total.trips, 12); assert.equal(r.perWeek.trips, 3); assert.equal(r.perWeek.net, 40000);
  assert.equal(r.perWeek.company, 22000, "propio 20,000 + 10 % del socio 2,000"); assert.equal(r.perWeek.partnerPart, 18000);
  assert.equal(r.perWeek.payroll, 4000, "la nómina del camión del socio la paga el socio"); assert.equal(r.perWeek.opCost, 6000);
  assert.equal(r.byClient[0].label, "Bocel"); assert.equal(r.byTruck.find(t => t.label === "Socio T2").tripsPerWeek, 1);
  assert.ok(r.enough); assert.equal(r.trend.pct, 0);
});

test("nómina: se paga 2 días después de cerrar la quincena en que llegaron los docs", () => {
  assert.equal(payrollPayDate({ date: "2026-10-03", docsReceivedAt: "2026-10-05" }, today), "2026-10-17");
  assert.equal(payrollPayDate({ date: "2026-10-20", docsReceivedAt: "2026-10-21" }, today), "2026-11-02");
  assert.equal(payrollPayDate({ date: "2026-09-30" }, today), "2026-11-02", "sin docs y viaje viejo: como si llegaran hoy → quincena en curso");
});

test("flujo de caja: arranca de Income + OpEx; entradas por ciclo del cliente; nómina, socios, fijos y reserva salen", () => {
  const f = cashFlow({ ...base, mode: "committed", rate: runRate({ ...base, weeks: 8 }) });
  assert.equal(f.start, 50000); assert.equal(f.reserveNow, 5000);
  assert.equal(f.weeks.length, 8); assert.equal(f.weeks[0].from, "2026-10-12");
  const inTotal = f.weeks.reduce((s, w) => s + w.in.unbilled, 0);
  assert.equal(inTotal, 160000, "los 12 viajes sin facturar entran dentro del horizonte");
  const payroll = f.weeks.reduce((s, w) => s + w.out.payroll, 0); assert.equal(payroll, 24000);
  assert.ok(f.weeks[0].out.payroll >= 12000, "lo de quincenas ya cerradas se paga ya");
  const partnersOut = f.weeks.reduce((s, w) => s + w.out.partners, 0);
  assert.ok(partnersOut > 0 && partnersOut <= 72000, `socios: ${partnersOut}`);
  const fixed = f.weeks.reduce((s, w) => s + w.out.fixed, 0); assert.equal(fixed, 60000, "día 1 de nov y de dic");
  const reserve = f.weeks.reduce((s, w) => s + w.out.reserve, 0); assert.equal(reserve, 17600, "20 % de lo que es de la empresa (88,000)");
  assert.equal(f.end, Math.round((50000 + 160000 - 24000 - partnersOut - 60000 - 17600) * 100) / 100);
  assert.ok(typeof f.minBalance === "number"); assert.ok(Array.isArray(f.alerts));
  const rr = cashFlow({ ...base, mode: "runrate", rate: runRate({ ...base, weeks: 8 }) });
  assert.ok(rr.weeks.some(w => w.in.runRate > 0) && rr.weeks.some(w => w.out.runRate > 0), "el ritmo añade entradas y salidas estimadas");
});

test("flujo: facturas emitidas usan su vencimiento y las vencidas se cobran «ya»", () => {
  const invoices = [{ id: 1, clientId: 2, date: "2026-09-20", dueDate: "2026-10-05", amount: 10000, status: "sent", tripIds: [1] }, { id: 2, clientId: 2, date: "2026-10-10", dueDate: "2026-10-25", amount: 10000, status: "sent", tripIds: [4] }];
  const f = cashFlow({ ...base, invoices, cobros: [{ id: 1, invoiceId: 2, amount: 4000, status: "collected", method: "transfer", collectedDate: "2026-10-12" }], rate: runRate({ ...base, weeks: 8 }) });
  assert.equal(f.overdue, 10000); assert.equal(f.weeks[0].in.invoices, 10000);
  assert.equal(f.weeks[1].in.invoices, 6000, "la segunda entra por su saldo (10,000 − 4,000) en la semana del 19");
  assert.equal(f.weeks.reduce((s, w) => s + w.in.unbilled, 0), 160000 - 20000, "los viajes facturados ya no cuentan como sin facturar");
});

test("punto de equilibrio y escenario con camión extra", () => {
  const rate = runRate({ ...base, weeks: 8 });
  const truckRows = projections({ ...base, weeks: 8 }).trucks.rows;
  const be = breakEven({ rate, fixedTemplates: base.fixedTemplates, extraFixed: 10000, truckRows });
  assert.equal(be.fixed, 40000);
  assert.equal(be.contribPerTrip, 4000, "propio 5,000/viaje × 8 + socio 2,000/viaje × 4, ponderado");
  assert.equal(be.tripsPerMonth, Math.ceil(40000 / be.contribPerTrip));
  const s = scenario({ rate, fixedTemplates: base.fixedTemplates, inputs: { tripsPerWeek: 6, ratePct: 10, extraTruck: { size: "T1", fixedMonthly: 50000, tripsPerWeek: 4 } }, reservePct: 20 });
  assert.equal(s.base.trips, Math.round(6 * 30.44 / 7 * 100) / 100);
  assert.ok(s.base.revenue > s.base.opCost + s.base.payroll);
  assert.ok(s.extra && s.extra.fixed === 50000 && s.extra.breakEvenTrips > 0);
  assert.equal(s.total.result, Math.round((s.base.result + s.extra.result) * 100) / 100);
  const p = projections({ ...base, weeks: 8 });
  assert.ok(p.income.monthNet > 0 && p.trucks.rows.length === 2 && p.flow.weeks.length === 8);
});

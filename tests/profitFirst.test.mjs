import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateIncome, accountBalances, tripPassThrough, isOpexExpense, cobroAllocation, cobroPassThrough, allocateCobro, settlementRelease } from "../src/utils/profitFirst.js";

test("allocateIncome: 20 % a reserva y 80 % a OpEx sobre el ingreso real", () => {
  const a = allocateIncome({ amount: 100000 });
  assert.equal(a.real, 100000); assert.equal(a.reserve, 20000); assert.equal(a.opex, 80000);
});

test("allocateIncome: pass-through no se reparte; reembolso vuelve íntegro a OpEx", () => {
  const a = allocateIncome({ amount: 100000, passThrough: 40000, reimbursement: 10000 });
  assert.equal(a.passThrough, 40000); assert.equal(a.reimbursement, 10000);
  assert.equal(a.real, 50000); assert.equal(a.reserve, 10000); assert.equal(a.opex, 40000 + 10000);
  assert.equal(a.reserve + a.opex + a.passThrough, 100000);
});

test("allocateIncome: pass-through mayor que el cobro se recorta", () => {
  const a = allocateIncome({ amount: 1000, passThrough: 5000 });
  assert.equal(a.passThrough, 1000); assert.equal(a.real, 0); assert.equal(a.opex, 0);
});

test("tripPassThrough: camión de socio → se aparta TODO el flete neto (lo de la empresa se reparte al liquidar); broker", () => {
  const trip = { revenue: 10000, brokerId: 5 }; const truck = { id: 1, partnerId: 7 };
  assert.equal(tripPassThrough({ trip: { revenue: 10000 }, truck, partner: { id: 7, model: "commission", companyPct: 10 } }).partner, 10000);
  assert.equal(tripPassThrough({ trip: { revenue: 10000 }, truck, partner: { id: 7, model: "profit_share", partnerSharePct: 60 } }).partner, 10000);
  const b = tripPassThrough({ trip, truck, partner: { id: 7, model: "commission", companyPct: 10 }, broker: { id: 5, commissionPct: 10 } });
  assert.equal(b.broker, 1000); assert.equal(b.partner, 9000); assert.equal(b.total, 10000);
  const c = tripPassThrough({ trip, truck, partner: { id: 7, model: "commission", companyPct: 10 }, broker: { id: 5, commissionPct: 10 }, brokerPassThrough: true });
  assert.equal(c.broker, 0); assert.equal(c.partner, 9000);
  assert.equal(tripPassThrough({ trip, truck: { id: 1, partnerId: null }, partner: { id: 7, model: "commission", companyPct: 10 } }).partner, 0, "camión propio: nada al socio");
});

test("cobroPassThrough + allocateCobro: mezcla de camión propio y de socio", () => {
  const trips = [{ id: 1, revenue: 10000, truckId: 1, clientId: 1 }, { id: 2, revenue: 10000, truckId: 2, clientId: 1 }];
  const trucks = [{ id: 1, partnerId: null }, { id: 2, partnerId: 7 }];
  const partners = [{ id: 7, model: "commission", companyPct: 10 }];
  const pt = cobroPassThrough({ tripIds: [1, 2], trips, trucks, partners, clients: [], brokers: [] });
  assert.equal(pt.partner, 10000); assert.equal(pt.total, 10000);
  const pf = allocateCobro({ amount: 20000, tripIds: [1, 2], trips, trucks, partners, clients: [], brokers: [] });
  assert.equal(pf.real, 10000); assert.equal(pf.reserve, 2000); assert.equal(pf.opex, 8000); assert.equal(pf.passThroughPartner, 10000);
});

test("settlementRelease: 20 % solo del ingreso de la empresa; los reembolsos reponen OpEx completos", () => {
  // reparto 60/40: neto 100k, gastos 20k → utilidad 80k → socio 48k / empresa 32k → Reserva 6,400; OpEx 25,600 + 20k reembolso
  const r2 = settlementRelease({ model: "profit_share", netRevenue: 100000, partnerSharePct: 60, toTransfer: 48000, companyShare: 32000, reimbursement: 20000 });
  assert.equal(r2.pool, 100000); assert.equal(r2.released, 52000); assert.equal(r2.companyIncome, 32000); assert.equal(r2.reimbursement, 20000);
  assert.equal(r2.releasedToReserve, 6400); assert.equal(r2.releasedToOpex, 45600);
  // comisión + gastos 10 %: neto 100k, comisión 10k, reembolsables 25k + GPS 2k → transfiere 63k; ingreso empresa 12k → Reserva 2,400
  const r = settlementRelease({ model: "commission_expenses", netRevenue: 100000, commission: 10000, fixedTotal: 2000, reimbursement: 25000, toTransfer: 63000 });
  assert.equal(r.pool, 100000); assert.equal(r.released, 37000); assert.equal(r.companyIncome, 12000); assert.equal(r.releasedToReserve, 2400); assert.equal(r.releasedToOpex, 34600);
  // comisión simple 10 %: sin gastos; ingreso empresa = comisión → 20 %
  const c = settlementRelease({ model: "commission", netRevenue: 100000, commission: 10000, fixedTotal: 0, toTransfer: 90000 });
  assert.equal(c.released, 10000); assert.equal(c.releasedToReserve, 2000); assert.equal(c.releasedToOpex, 8000);
  // camión en pérdida (reparto): no se transfiere nada, utilidad 0 → Reserva 0, todo lo cobrado repone OpEx
  const loss = settlementRelease({ model: "profit_share", netRevenue: 10000, partnerSharePct: 60, toTransfer: 0, companyShare: 0, reimbursement: 12000 });
  assert.equal(loss.released, 10000); assert.equal(loss.releasedToReserve, 0); assert.equal(loss.releasedToOpex, 10000);
  assert.equal(settlementRelease({ model: "commission", netRevenue: 10000, commission: 1000, toTransfer: -500 }).released, 10000);
  assert.equal(settlementRelease({ model: "commission", netRevenue: 10000, commission: 1000, toTransfer: 9000 }, { reservePct: 30 }).releasedToReserve, 300);
});

test("accountBalances: suma asignaciones y resta gastos OpEx pagados; pass-through y override no cuentan", () => {
  const cobros = [
    { id: 1, status: "collected", collectedDate: "2026-10-01", amount: 100000 },
    { id: 2, status: "collected", collectedDate: "2026-10-05", amount: 50000, pf: { total: 50000, passThrough: 30000, reimbursement: 0, real: 20000, reserve: 4000, opex: 16000 } },
    { id: 3, status: "pending", amount: 999999 },
    { id: 4, status: "partial", amount: 10000, pf: { total: 10000, passThrough: 0, reimbursement: 0, real: 10000, reserve: 2000, opex: 8000, at: "2026-10-07" } },
  ];
  const expenses = [
    { id: 1, category: "driverPay", amount: 10000, status: "paid", paidDate: "2026-10-06" },
    { id: 2, category: "fuel", amount: 5000, status: "pending" },
    { id: 3, category: "partner_settlement", amount: 30000, status: "paid", paidDate: "2026-10-06", releasedToOpex: 3200, releasedToReserve: 800 },
    { id: 4, category: "nominaTotalOverride", amount: 7000, status: "paid" },
  ];
  const b = accountBalances({ cobros, expenses });
  assert.equal(b.income, 160000); assert.equal(b.reserve, 26000 + 800); assert.equal(b.opexIn, 104000 + 3200);
  assert.equal(b.opexOut, 10000); assert.equal(b.opexAvailable, 97200); assert.equal(b.opexCommitted, 5000);
  assert.equal(isOpexExpense(expenses[2]), false); assert.equal(isOpexExpense(expenses[3]), false);
  assert.equal(cobroAllocation(cobros[2]), null);
});

test("accountBalances: startDate ignora lo anterior al arranque de Profit First", () => {
  const b = accountBalances({ cobros: [{ status: "collected", collectedDate: "2026-09-01", amount: 1000 }, { status: "collected", collectedDate: "2026-10-01", amount: 1000 }],
    expenses: [{ category: "fuel", amount: 100, status: "paid", paidDate: "2026-09-02" }], settings: { reservePct: 20, startDate: "2026-10-01" } });
  assert.equal(b.income, 1000); assert.equal(b.opexOut, 0);
});

import { monthlyAllocations } from "../src/utils/profitFirst.js";
test("accountBalances: pass-through pendiente de transferir y asignación mensual", () => {
  const cobros = [
    { status: "collected", collectedDate: "2026-09-10", amount: 50000, pf: { total: 50000, passThrough: 20000, reimbursement: 0, real: 30000, reserve: 6000, opex: 24000 } },
    { status: "collected", collectedDate: "2026-10-02", amount: 10000 },
  ];
  const expenses = [{ category: "partner_settlement", amount: 15000, status: "paid", paidDate: "2026-10-05", releasedToOpex: 2400, releasedToReserve: 600 }];
  const b = accountBalances({ cobros, expenses });
  assert.equal(b.passThrough, 20000); assert.equal(b.passThroughOut, 15000); assert.equal(b.passThroughReleased, 3000); assert.equal(b.passThroughPending, 2000);
  assert.equal(b.opexIn, 24000 + 8000 + 2400); assert.equal(b.reserve, 6000 + 2000 + 600);
  const m = monthlyAllocations({ cobros });
  assert.deepEqual(m.map(x => [x.month, x.reserve, x.opex]), [["2026-09", 6000, 24000], ["2026-10", 2000, 8000]]);
});

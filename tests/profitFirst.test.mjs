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

test("tripPassThrough: comisión (empresa 10 % del bruto) → socio 90 %; reparto 60/40 → socio 60 %; broker", () => {
  const trip = { revenue: 10000, brokerId: 5 }; const truck = { id: 1, partnerId: 7 };
  assert.equal(tripPassThrough({ trip: { revenue: 10000 }, truck, partner: { id: 7, model: "commission", companyPct: 10 } }).partner, 9000);
  assert.equal(tripPassThrough({ trip: { revenue: 10000 }, truck, partner: { id: 7, model: "profit_share", partnerSharePct: 60 } }).partner, 6000);
  // broker normal: se aparta su comisión; socio sobre el neto menos comisión del bruto
  const b = tripPassThrough({ trip, truck, partner: { id: 7, model: "commission", companyPct: 10 }, broker: { id: 5, commissionPct: 10 } });
  assert.equal(b.broker, 1000); assert.equal(b.partner, 9000 - 1000); assert.equal(b.total, 9000);
  // broker pass-through (ya venía descontado): no se aparta, pero sí reduce la base del socio
  const c = tripPassThrough({ trip, truck, partner: { id: 7, model: "commission", companyPct: 10 }, broker: { id: 5, commissionPct: 10 }, brokerPassThrough: true });
  assert.equal(c.broker, 0); assert.equal(c.partner, 8000);
  assert.equal(tripPassThrough({ trip, truck: { id: 1, partnerId: null }, partner: { id: 7, model: "commission", companyPct: 10 } }).partner, 0, "camión propio: nada al socio");
});

test("cobroPassThrough + allocateCobro: mezcla de camión propio y de socio", () => {
  const trips = [{ id: 1, revenue: 10000, truckId: 1, clientId: 1 }, { id: 2, revenue: 10000, truckId: 2, clientId: 1 }];
  const trucks = [{ id: 1, partnerId: null }, { id: 2, partnerId: 7 }];
  const partners = [{ id: 7, model: "commission", companyPct: 10 }];
  const pt = cobroPassThrough({ tripIds: [1, 2], trips, trucks, partners, clients: [], brokers: [] });
  assert.equal(pt.partner, 9000); assert.equal(pt.total, 9000);
  const pf = allocateCobro({ amount: 20000, tripIds: [1, 2], trips, trucks, partners, clients: [], brokers: [] });
  assert.equal(pf.real, 11000); assert.equal(pf.reserve, 2200); assert.equal(pf.opex, 8800); assert.equal(pf.passThroughPartner, 9000);
});

test("settlementRelease: lo apartado menos lo transferido vuelve a OpEx (reembolsos y cargos fijos)", () => {
  // comisión 10 %: neto 100k, comisión 10k → pool 90k; gastos reembolsables 25k + GPS 2k → transfiere 63k
  const r = settlementRelease({ model: "commission", netRevenue: 100000, commission: 10000, toTransfer: 63000 });
  assert.equal(r.pool, 90000); assert.equal(r.releasedToOpex, 27000);
  // reparto 60/40: neto 100k → pool 60k; gastos 20k → utilidad 80k → socio 48k → vuelve 12k (= 60 % de los gastos que pagó la empresa)
  const r2 = settlementRelease({ model: "profit_share", netRevenue: 100000, partnerSharePct: 60, toTransfer: 48000 });
  assert.equal(r2.pool, 60000); assert.equal(r2.releasedToOpex, 12000);
  // socio debe (toTransfer negativo): todo el pool vuelve
  assert.equal(settlementRelease({ model: "commission", netRevenue: 10000, commission: 1000, toTransfer: -500 }).releasedToOpex, 9000);
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
    { id: 3, category: "partner_settlement", amount: 30000, status: "paid", paidDate: "2026-10-06", releasedToOpex: 4000 },
    { id: 4, category: "nominaTotalOverride", amount: 7000, status: "paid" },
  ];
  const b = accountBalances({ cobros, expenses });
  assert.equal(b.income, 160000); assert.equal(b.reserve, 26000); assert.equal(b.opexIn, 104000 + 4000);
  assert.equal(b.opexOut, 10000); assert.equal(b.opexAvailable, 98000); assert.equal(b.opexCommitted, 5000);
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
  const expenses = [{ category: "partner_settlement", amount: 15000, status: "paid", paidDate: "2026-10-05", releasedToOpex: 3000 }];
  const b = accountBalances({ cobros, expenses });
  assert.equal(b.passThrough, 20000); assert.equal(b.passThroughOut, 15000); assert.equal(b.passThroughReleased, 3000); assert.equal(b.passThroughPending, 2000);
  assert.equal(b.opexIn, 24000 + 8000 + 3000);
  const m = monthlyAllocations({ cobros });
  assert.deepEqual(m.map(x => [x.month, x.reserve, x.opex]), [["2026-09", 6000, 24000], ["2026-10", 2000, 8000]]);
});

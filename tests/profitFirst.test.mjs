import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateIncome, accountBalances, tripPassThrough, isOpexExpense, cobroAllocation } from "../src/utils/profitFirst.js";

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

test("tripPassThrough: comisión (empresa 10 %) → socio 90 %; reparto 60/40 → socio 60 %; broker histórico", () => {
  const trip = { revenue: 10000 }; const truck = { id: 1, partnerId: 7 };
  assert.equal(tripPassThrough({ trip, truck, partner: { id: 7, model: "commission", companyPct: 10 } }).partner, 9000);
  assert.equal(tripPassThrough({ trip, truck, partner: { id: 7, model: "profit_share", partnerSharePct: 60 } }).partner, 6000);
  const b = tripPassThrough({ trip, truck, partner: { id: 7, model: "commission", companyPct: 10 }, broker: { commissionPct: 10, passThrough: false } });
  assert.equal(b.broker, 1000); assert.equal(b.partner, 8100); assert.equal(b.total, 9100);
  assert.equal(tripPassThrough({ trip, truck: { id: 1, partnerId: null }, partner: { id: 7, model: "commission", companyPct: 10 } }).partner, 0, "camión propio: nada al socio");
});

test("accountBalances: suma asignaciones y resta gastos OpEx pagados; pass-through y override no cuentan", () => {
  const cobros = [
    { id: 1, status: "collected", collectedDate: "2026-10-01", amount: 100000 },
    { id: 2, status: "collected", collectedDate: "2026-10-05", amount: 50000, pf: { total: 50000, passThrough: 30000, reimbursement: 0, real: 20000, reserve: 4000, opex: 16000 } },
    { id: 3, status: "pending", amount: 999999 },
  ];
  const expenses = [
    { id: 1, category: "driverPay", amount: 10000, status: "paid", paidDate: "2026-10-06" },
    { id: 2, category: "fuel", amount: 5000, status: "pending" },
    { id: 3, category: "partner_settlement", amount: 30000, status: "paid", paidDate: "2026-10-06" },
    { id: 4, category: "nominaTotalOverride", amount: 7000, status: "paid" },
  ];
  const b = accountBalances({ cobros, expenses });
  assert.equal(b.income, 150000); assert.equal(b.reserve, 24000); assert.equal(b.opexIn, 96000);
  assert.equal(b.opexOut, 10000); assert.equal(b.opexAvailable, 86000); assert.equal(b.opexCommitted, 5000);
  assert.equal(isOpexExpense(expenses[2]), false); assert.equal(isOpexExpense(expenses[3]), false);
  assert.equal(cobroAllocation(cobros[2]), null);
});

test("accountBalances: startDate ignora lo anterior al arranque de Profit First", () => {
  const b = accountBalances({ cobros: [{ status: "collected", collectedDate: "2026-09-01", amount: 1000 }, { status: "collected", collectedDate: "2026-10-01", amount: 1000 }],
    expenses: [{ category: "fuel", amount: 100, status: "paid", paidDate: "2026-09-02" }], settings: { reservePct: 20, startDate: "2026-10-01" } });
  assert.equal(b.income, 1000); assert.equal(b.opexOut, 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSettlementChain, normalizePartner } from "../src/utils/partnerModels.js";

const partner = normalizePartner({ id: 1, name: "Socio", model: "commission_expenses", companyPct: 20, fondoDays: 30 });
const trucks = [{ id: 1, partnerId: 1, plate: "A1", size: "T1" }];
const clients = [{ id: 1, companyName: "C", rates: [] }];
const periods = [
  { year: 2026, month: 10, half: 1, mStr: "2026-10", dateFrom: "2026-10-01", dateTo: "2026-10-15", label: "Oct 1–15" },
  { year: 2026, month: 10, half: 2, mStr: "2026-10", dateFrom: "2026-10-16", dateTo: "2026-10-31", label: "Oct 16–31" },
];

test("saldo negativo pasa a la siguiente quincena", () => {
  const trips = [
    { id: 1, truckId: 1, clientId: 1, date: "2026-10-05", status: "delivered", revenue: 10000 },
    { id: 2, truckId: 1, clientId: 1, date: "2026-10-20", status: "delivered", revenue: 20000 },
  ];
  // gasto de 12000 en Q1: 10000 - 2000 comisión - 12000 = -4000 → el socio debe 4000
  const expenses = [{ id: 1, truckId: 1, tripId: 1, date: "2026-10-05", category: "fuel", amount: 12000, status: "paid", chargeTo: "partner" }];
  const chain = computeSettlementChain({ partner, periods: [...periods].reverse(), trips, expenses, trucks, clients });
  const q1 = chain.get("2026-10-1"), q2 = chain.get("2026-10-2");
  assert.equal(q1.previousBalance, 0);
  assert.ok(q1.toTransfer < 0);
  assert.equal(q1.carryOut, -q1.toTransfer);
  assert.equal(q2.previousBalance, q1.carryOut);
  // Q2: 20000 - 4000 comisión - 4000 arrastre = 12000
  assert.equal(q2.toTransfer, 20000 - 4000 - q1.carryOut);
  assert.equal(q2.carryOut, 0);
});

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

test("reparto de utilidad 60/40: la pérdida de agosto se recupera de la utilidad siguiente antes de repartir", () => {
  const ps = normalizePartner({ id: 1, name: "Socio", model: "profit_share", partnerSharePct: 60, fondoDays: 30 });
  const per = [
    { year: 2026, month: 8, half: 1, mStr: "2026-08", dateFrom: "2026-08-01", dateTo: "2026-08-15", label: "Ago 1–15" },
    { year: 2026, month: 8, half: 2, mStr: "2026-08", dateFrom: "2026-08-16", dateTo: "2026-08-31", label: "Ago 16–31" },
    { year: 2026, month: 9, half: 1, mStr: "2026-09", dateFrom: "2026-09-01", dateTo: "2026-09-15", label: "Sep 1–15" },
  ];
  const trips = [
    { id: 1, truckId: 1, clientId: 1, date: "2026-08-05", status: "delivered", revenue: 50000 },
    { id: 2, truckId: 1, clientId: 1, date: "2026-08-20", status: "delivered", revenue: 30000 },
    { id: 3, truckId: 1, clientId: 1, date: "2026-09-05", status: "delivered", revenue: 100000 },
  ];
  const expenses = [
    { id: 1, truckId: 1, tripId: 1, date: "2026-08-05", category: "repair", amount: 70000 }, // ago Q1: −20,000
    { id: 2, truckId: 1, tripId: 2, date: "2026-08-20", category: "fuel", amount: 25000 },   // ago Q2: +5,000 → recupera 5,000; quedan 15,000
    { id: 3, truckId: 1, tripId: 3, date: "2026-09-05", category: "fuel", amount: 60000 },   // sep Q1: +40,000 → recupera 15,000; reparte 25,000
  ];
  const chain = computeSettlementChain({ partner: ps, periods: per, trips, expenses, trucks, clients });
  const a1 = chain.get("2026-08-1"), a2 = chain.get("2026-08-2"), s1 = chain.get("2026-09-1");
  assert.deepEqual([a1.toTransfer, a1.partnerShare, a1.carryOut, a1.previousBalance], [0, 0, 20000, 0], "agosto: pérdida 20,000 en el camión; el socio no debe");
  assert.deepEqual([a2.periodResult, a2.truckLossIn, a2.truckLossRecovered, a2.toTransfer, a2.carryOut], [5000, 20000, 5000, 0, 15000]);
  assert.deepEqual([s1.periodResult, s1.truckLossRecovered, s1.net, s1.partnerShare, s1.companyShare, s1.toTransfer, s1.carryOut], [40000, 15000, 25000, 15000, 10000, 15000, 0]);
  assert.equal(s1.companyReceives, 100000 - 15000, "la empresa recupera los gastos, la pérdida y su 40 %");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSettlement, normalizePartner, fixedChargesForPeriod, settlementPayDate, expenseChargedToPartner } from "../src/utils/partnerModels.js";

const period = { dateFrom: "2026-10-01", dateTo: "2026-10-15", half: 1, label: "Octubre 1–15" };
const trucks = [{ id: 1, partnerId: 7 }, { id: 2, partnerId: 9 }];
const trips = [
  { id: 1, date: "2026-10-03", truckId: 1, clientId: 1, revenue: 10000, status: "delivered" },
  { id: 2, date: "2026-10-10", truckId: 1, clientId: 1, revenue: 20000, status: "delivered" },
  { id: 3, date: "2026-10-12", truckId: 1, clientId: 1, revenue: 5000, status: "in_transit" }, // no entregado
  { id: 4, date: "2026-10-20", truckId: 1, clientId: 1, revenue: 8000, status: "delivered" },  // otra quincena
  { id: 5, date: "2026-10-05", truckId: 2, clientId: 1, revenue: 9000, status: "delivered" },  // otro socio
];
const expenses = [
  { id: 1, tripId: 1, category: "fuel", amount: 3000 },
  { id: 2, tripId: 2, category: "driverPay", amount: 4000 },
  { id: 3, truckId: 1, date: "2026-10-08", category: "repair", amount: 2500 },
  { id: 4, truckId: 1, date: "2026-10-08", category: "maintenance", amount: 1500, chargeToPartner: false },
  { id: 5, tripId: 1, category: "adelanto_conductor", amount: 700 },
  { id: 6, truckId: 1, date: "2026-10-30", category: "fuel", amount: 999 }, // fuera del período
];

test("modelo 1: comisión sobre bruto, sin gastos, con cargos fijos", () => {
  const partner = { id: 7, model: "commission", companyPct: 10, fondoDays: 30,
    fixedCharges: [{ id: 1, name: "GPS", amount: 1500, frequency: "monthly" }, { id: 2, name: "Seguro", amount: 800, frequency: "biweekly" }] };
  const s = computeSettlement({ partner, period, trips, expenses, trucks });
  assert.equal(s.tripCount, 2);
  assert.equal(s.grossRevenue, 30000);
  assert.equal(s.commission, 3000);
  assert.equal(s.expensesTotal, 0);
  assert.equal(s.fixedTotal, 2300);
  assert.equal(s.toTransfer, 30000 - 3000 - 2300);
  assert.equal(s.payDate, "2026-11-14");
});

test("modelo 2: comisión + gastos cargados (respeta la casilla por gasto, excluye adelantos)", () => {
  const partner = { id: 7, model: "commission_expenses", companyPct: 10, fixedCharges: [{ id: 1, name: "GPS", amount: 1500, frequency: "monthly" }] };
  const s = computeSettlement({ partner, period, trips, expenses, trucks });
  assert.equal(s.expensesTotal, 3000 + 4000 + 2500); // sin el mantenimiento desmarcado, sin adelanto, sin el de fuera del período
  assert.equal(s.toTransfer, 30000 - 3000 - 9500 - 1500);
});

test("modelo 3: reparto de utilidad, el % es la parte del socio", () => {
  const partner = { id: 7, model: "profit_share", partnerSharePct: 40 };
  const s = computeSettlement({ partner, period, trips, expenses, trucks });
  assert.equal(s.net, 30000 - 9500);
  assert.equal(s.partnerShare, 8200);
  assert.equal(s.companyShare, 12300);
  assert.equal(s.toTransfer, 8200);
  assert.equal(s.fixedTotal, 0);
  assert.equal(s.reimbursement, 9500);
  assert.equal(s.companyReceives, 9500 + 12300);
  assert.equal(s.toTransfer + s.companyReceives, s.netRevenue, "ingreso = socio + empresa (reembolso + parte)");
});

test("modelo 3 con broker pass-through histórico descuenta el 10%", () => {
  const partner = { id: 7, model: "profit_share", partnerSharePct: 50 };
  const clients = [{ id: 1, rules: { brokerPassThrough: true } }];
  const brokers = [{ id: 1, commissionPct: 10 }];
  const tr = trips.map(t => ({ ...t, brokerId: 1 }));
  const s = computeSettlement({ partner, period, trips: tr, expenses: [], trucks, clients, brokers });
  assert.equal(s.brokerDeduction, 3000);
  assert.equal(s.toTransfer, 13500);
});

test("pérdida en reparto: el socio recibe su % del negativo", () => {
  const partner = { id: 7, model: "profit_share", partnerSharePct: 50 };
  const s = computeSettlement({ partner, period, trips, expenses: [{ id: 1, truckId: 1, date: "2026-10-02", category: "repair", amount: 50000 }], trucks });
  assert.equal(s.net, -20000);
  assert.equal(s.toTransfer, -10000);
});

test("normalizePartner migra el formato viejo a reparto de utilidad", () => {
  const p = normalizePartner({ id: 1, name: "Robinson", commissionPct: 40, negotiationType: "Net Profit %" });
  assert.equal(p.model, "profit_share");
  assert.equal(p.partnerSharePct, 40);
  assert.equal(p.fondoDays, 30);
});

test("cargos fijos: mensual solo en quincena 1, anual en su aniversario, nunca antes de startDate", () => {
  const partner = { id: 1, model: "commission", fixedCharges: [
    { id: 1, name: "GPS", amount: 1000, frequency: "monthly" },
    { id: 2, name: "Seguro anual", amount: 12000, frequency: "yearly", startDate: "2025-10-10" },
    { id: 3, name: "Nuevo", amount: 500, frequency: "biweekly", startDate: "2026-11-01" },
  ] };
  const h1 = fixedChargesForPeriod(partner, period).map(c => c.name);
  const h2 = fixedChargesForPeriod(partner, { dateFrom: "2026-10-16", dateTo: "2026-10-31", half: 2 }).map(c => c.name);
  assert.deepEqual(h1, ["GPS", "Seguro anual"]);
  assert.deepEqual(h2, []);
});

test("fecha de pago = cierre + fondoDays", () => {
  assert.equal(settlementPayDate({ dateTo: "2026-10-31" }, { fondoDays: 30 }), "2026-11-30");
  assert.equal(settlementPayDate({ dateTo: "2026-10-15" }, { fondoDays: 15 }), "2026-10-30");
});

test("casilla cargar al socio: default por modelo", () => {
  assert.equal(expenseChargedToPartner({}, { model: "commission" }), false);
  assert.equal(expenseChargedToPartner({}, { model: "commission_expenses" }), true);
  assert.equal(expenseChargedToPartner({ chargeToPartner: true }, { model: "commission" }), true);
});

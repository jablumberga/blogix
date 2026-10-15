import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInvoicePfReport, periodOfDate } from "../src/utils/pfReport.js";
import { buildAbono } from "../src/utils/cobros.js";

const trucks = [{ id: 1, plate: "A", partnerId: null }, { id: 2, plate: "B", partnerId: 7 }, { id: 3, plate: "C", partnerId: 8 }];
const partners = [{ id: 7, name: "Eudy", model: "profit_share", partnerSharePct: 60 }, { id: 8, name: "Felix", model: "commission_expenses", companyPct: 10, fixedCharges: [{ id: 1, name: "GPS", amount: 850, frequency: "biweekly", startDate: "2026-10-01" }] }];
const clients = [{ id: 1, companyName: "Bocel", rules: {} }];
const trips = [
  { id: 1, clientId: 1, truckId: 1, driverId: 1, date: "2026-10-05", status: "delivered", revenue: 10000, province: "Santiago", municipality: "Santiago de los Caballeros" },
  { id: 2, clientId: 1, truckId: 2, driverId: 2, date: "2026-10-06", status: "delivered", revenue: 10000, province: "Santiago", municipality: "Santiago de los Caballeros" },
  { id: 3, clientId: 1, truckId: 3, driverId: 3, date: "2026-10-07", status: "delivered", revenue: 10000, province: "Santiago", municipality: "Santiago de los Caballeros" },
];
const expenses = [
  { id: 1, tripId: 1, category: "driverPay", amount: 1000, status: "pending" },
  { id: 2, tripId: 2, category: "fuel", amount: 2000, status: "paid", paymentMethod: "transfer" },
  { id: 3, tripId: 2, category: "driverPay", amount: 1500, status: "paid", paymentMethod: "transfer" },
  { id: 4, tripId: 3, category: "tire", amount: 3000, status: "pending", paymentMethod: "credit", supplierId: 1 },
  { id: 5, tripId: 3, category: "driverPay", amount: 1200, status: "paid", paymentMethod: "transfer" },
];
const inv = { id: 1, invoiceNumber: "F-1", clientId: 1, tripIds: [1, 2, 3], amount: 30000, status: "sent", date: "2026-10-10" };

test("periodOfDate: quincena de una fecha", () => {
  assert.deepEqual(periodOfDate("2026-10-05").dateTo, "2026-10-15");
  assert.deepEqual([periodOfDate("2026-10-20").dateFrom, periodOfDate("2026-10-20").dateTo], ["2026-10-16", "2026-10-31"]);
});

test("reporte PF por factura: identidades (flete = apartado + real; apartado = transferido + retenido) y qué mover", () => {
  const a1 = buildAbono({ inv, amount: 12000, date: "2026-10-12", cobros: [], trips, trucks, partners, clients, nextId: 1 });
  const r = buildInvoicePfReport({ inv, trips, trucks, partners, clients, brokers: [], expenses, cobros: [a1], drivers: [], suppliers: [{ id: 1, name: "Gomas SRL" }], settlementStatus: {}, pfSettings: { reservePct: 20 } });
  // viajes: propio real 10000; camiones de socio → todo apartado hasta liquidar
  assert.deepEqual(r.tripRows.map(t => [t.model, t.partnerSetAside, t.real]), [["own", 0, 10000], ["profit_share", 10000, 0], ["commission_expenses", 10000, 0]]);
  assert.equal(r.totals.real, 10000); assert.equal(r.totals.partnerSetAside, 20000); assert.equal(r.totals.reserveFull, 2000);
  assert.equal(r.check.net, r.check.parts);
  // cobro parcial 12,000 de 30,000 = 40 %: apartado 8000, real 4000 → reserva 800 / opex 3200; pendiente 18,000 proyectado
  assert.equal(r.collected.passThrough, 8000); assert.equal(r.collected.reserve, 800); assert.equal(r.collected.opex, 3200);
  assert.equal(r.pending.amount, 18000); assert.equal(r.pending.reserve, 1200); assert.equal(r.pending.passThrough, 12000);
  // gastos: nómina pendiente 1000 (propio), suplidor a crédito 3000, descontables a socios: 2000+1500 (Eudy) + 3000+1200 (Felix)
  assert.equal(r.expTotals.payrollPending, 1000); assert.equal(r.expTotals.supplierCredit, 3000); assert.equal(r.expTotals.chargedToPartner, 7700); assert.equal(r.expTotals.companyCost, 1000);
  // liquidaciones (solo estos viajes): Eudy 10000 − 3500 = utilidad 6500 → socio 3900 / empresa 2600 → Reserva 520; reembolso 3500 a OpEx
  // Felix 10000 − comisión 1000 − 4200 = 4800 al socio; ingreso empresa 1000 → Reserva 200; reembolso 4200 a OpEx (GPS aparte)
  const e = r.settlements.find(s => s.partner.id === 7), f = r.settlements.find(s => s.partner.id === 8);
  assert.equal(e.s.toTransfer, 3900); assert.equal(e.rel.released, 10000 - 3900); assert.equal(e.rel.companyIncome, 2600); assert.equal(e.rel.reimbursement, 3500); assert.equal(e.rel.releasedToReserve, 520);
  assert.equal(f.s.toTransfer, 4800); assert.equal(f.fixedTotal, 850); assert.equal(f.rel.released, 10000 - 4800); assert.equal(f.rel.companyIncome, 1000); assert.equal(f.rel.reimbursement, 4200); assert.equal(f.rel.releasedToReserve, 200);
  assert.equal(r.check.setAside, r.check.setAsideParts, "lo apartado = lo transferido + lo retenido");
  // qué mover
  assert.equal(r.moves.onSettle.toPartners, 3900 + 4800); assert.equal(r.moves.onSettle.reserve, 520 + 200); assert.equal(r.moves.suppliers, 3000); assert.equal(r.moves.payrollPending, 1000);
  assert.equal(r.moves.totalReserve, 800 + 1200 + 720);
  // margen: ingreso empresa (10000 propio + 6100 + 5200 retenidos) − gastos 8700
  assert.equal(r.moves.margin, 10000 + 6100 + 5200 - 8700);
});

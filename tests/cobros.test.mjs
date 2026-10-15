import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceBalance, buildAbono } from "../src/utils/cobros.js";

const trips = [{ id: 1, clientId: 1, truckId: 1, revenue: 10000, status: "delivered", date: "2026-10-02" }, { id: 2, clientId: 1, truckId: 2, revenue: 20000, status: "delivered", date: "2026-10-03" }];
const trucks = [{ id: 1, partnerId: null }, { id: 2, partnerId: 7 }];
const partners = [{ id: 7, model: "commission", companyPct: 20 }];
const clients = [{ id: 1, rules: {} }];
const inv = { id: 5, clientId: 1, tripIds: [1, 2], amount: 30000, status: "sent" };

test("abonos parciales: saldo, tope y Profit First proporcional", () => {
  let cobros = [];
  const a1 = buildAbono({ inv, amount: 12000, date: "2026-10-10", cobros, trips, trucks, partners, clients, nextId: 1 });
  cobros = [a1];
  let b = invoiceBalance(inv, cobros, { trips, clients });
  assert.equal(b.paid, 12000); assert.equal(b.balance, 18000); assert.equal(b.partial, true); assert.equal(b.settled, false);
  // camión de socio: se aparta TODO su flete (20000) hasta liquidar; proporcional 40 % → 8000
  assert.equal(a1.pf.passThrough, 8000);
  assert.equal(a1.pf.real, 12000 - 8000);
  assert.equal(a1.pf.reserve, Math.round((12000 - 8000) * 0.2 * 100) / 100);
  assert.deepEqual(a1.collectedTripIds, [1, 2]);
  // segundo abono mayor que el saldo → se limita al saldo
  const a2 = buildAbono({ inv, amount: 50000, date: "2026-10-20", cobros, trips, trucks, partners, clients, nextId: 2 });
  assert.equal(a2.amount, 18000);
  cobros = [a1, a2];
  b = invoiceBalance(inv, cobros, { trips, clients });
  assert.equal(b.balance, 0); assert.equal(b.settled, true);
  // suma de pass-through de los abonos = pass-through total de la factura
  assert.equal(a1.pf.passThrough + a2.pf.passThrough, 20000, "todo el flete del camión del socio queda apartado entre los abonos");
  // sin saldo no se puede abonar más
  assert.equal(buildAbono({ inv, amount: 1, date: "2026-10-21", cobros, trips, trucks, partners, clients, nextId: 3 }), null);
});

test("invoiceCancelBlock: bloquea anular si el cobro ya se repartió en Banco, está conciliado o la liquidación del socio ya se transfirió", async () => {
  const { invoiceCancelBlock } = await import("../src/utils/cobros.js");
  const inv = { id: 1, tripIds: [10, 11], amount: 10000 };
  const cobros = [{ id: 5, invoiceId: 1, date: "2026-10-10", amount: 10000 }];
  const trips = [{ id: 10, date: "2026-10-05", truckId: 1 }, { id: 11, date: "2026-10-06", truckId: 3 }];
  const trucks = [{ id: 1, partnerId: null }, { id: 3, partnerId: 2 }];
  const partners = [{ id: 2, name: "Eudy" }];
  assert.equal(invoiceCancelBlock(inv, { cobros, trips, trucks, partners }), null, "sin reparto ni liquidación: se puede");
  assert.match(invoiceCancelBlock(inv, { cobros, bankTransfers: [{ id: 1, kind: "distribution", distKeys: ["cobro:5"] }] }), /repartió en Banco/);
  assert.match(invoiceCancelBlock(inv, { cobros, bankTransfers: [{ id: 2, kind: "deposit", cobroIds: [5] }] }), /repartió en Banco/);
  assert.match(invoiceCancelBlock(inv, { cobros, bankReconciliation: { "cobro-5": "reconciled" } }), /conciliado/);
  assert.match(invoiceCancelBlock(inv, { cobros, trips, trucks, partners, expenses: [{ category: "partner_settlement", status: "paid", settlementKey: "2-2026-10-1" }] }), /Eudy/);
  assert.equal(invoiceCancelBlock(inv, { cobros, trips, trucks, partners, expenses: [{ category: "partner_settlement", status: "paid", settlementKey: "2-2026-10-2" }] }), null, "otra quincena no bloquea");
});

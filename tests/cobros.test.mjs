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
  // pass-through del socio sobre toda la factura: 20000 - 20% de 20000 = 16000; proporcional 40 % → 6400
  assert.equal(a1.pf.passThrough, 6400);
  assert.equal(a1.pf.real, 12000 - 6400);
  assert.equal(a1.pf.reserve, Math.round((12000 - 6400) * 0.2 * 100) / 100);
  assert.deepEqual(a1.collectedTripIds, [1, 2]);
  // segundo abono mayor que el saldo → se limita al saldo
  const a2 = buildAbono({ inv, amount: 50000, date: "2026-10-20", cobros, trips, trucks, partners, clients, nextId: 2 });
  assert.equal(a2.amount, 18000);
  cobros = [a1, a2];
  b = invoiceBalance(inv, cobros, { trips, clients });
  assert.equal(b.balance, 0); assert.equal(b.settled, true);
  // suma de pass-through de los abonos = pass-through total de la factura
  assert.equal(a1.pf.passThrough + a2.pf.passThrough, 16000);
  // sin saldo no se puede abonar más
  assert.equal(buildAbono({ inv, amount: 1, date: "2026-10-21", cobros, trips, trucks, partners, clients, nextId: 3 }), null);
});

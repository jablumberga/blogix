/**
 * B-Logix – Banco con cuentas reales: Income, OpEx, Reserva, Suplidores, Caja (y las que se agreguen)
 * Run with: node --test tests/bankAccounts.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultAccounts, getAccounts, roleAccount, expenseAccountId, cobroAccountId, bankMovements, accountSummary,
  supplierDebt, opexCommitments, undistributed, suggestDistribution, buildDistribution, cashToDeposit,
  transferProblem, accountRemoval, accountProblem, nextTransferId,
} from "../src/utils/bankAccounts.js";

const accounts = defaultAccounts({ name: "Cuenta Principal", bank: "Popular", openingBalance: 50000, openingDate: "2026-10-01" }, "2026-10-13");
const pf = (amount, reserve, passThrough = 0) => ({ total: amount, reserve, opex: amount - reserve - passThrough, passThrough, real: amount - passThrough });
const cobros = [
  { id: 1, invoiceId: 1, clientId: 1, status: "collected", method: "transfer", amount: 10000, collectedDate: "2026-10-05", pf: pf(10000, 2000) },
  { id: 2, invoiceId: 2, clientId: 1, status: "collected", method: "cash", amount: 3000, collectedDate: "2026-10-06", pf: pf(3000, 600) },
  { id: 3, invoiceId: 3, clientId: 1, status: "collected", method: "transfer", amount: 20000, collectedDate: "2026-10-07", pf: pf(20000, 2000, 10000) }, // viaje de socio: 10,000 pass-through
  { id: 4, invoiceId: 4, clientId: 1, status: "collected", method: "transfer", amount: 999, collectedDate: "2026-09-20", pf: pf(999, 200) }, // antes del saldo inicial
];
const expenses = [
  { id: 1, category: "driverPay", amount: 2500, status: "paid", paymentMethod: "transfer", paidDate: "2026-10-08" },
  { id: 2, category: "repair", amount: 8000, status: "paid", paymentMethod: "credit", supplierId: 3, date: "2026-10-01", paidDate: "2026-10-09" },
  { id: 3, category: "fuel", amount: 1500, status: "paid", paymentMethod: "cash", date: "2026-10-08" },
  { id: 4, category: "reserve_withdrawal", amount: 1000, status: "paid", paymentMethod: "transfer", date: "2026-10-10" },
  { id: 5, category: "nominaTotalOverride", amount: 9999, status: "paid", paymentMethod: "transfer", date: "2026-10-10" },
  { id: 6, category: "tire", amount: 4000, status: "pending", paymentMethod: "credit", supplierId: 3, date: "2026-10-11" },
  { id: 7, category: "driverPay", amount: 3000, status: "pending", paymentMethod: "transfer", date: "2026-10-11" },
  { id: 8, category: "other", amount: 700, status: "paid", paymentMethod: "cash", accountId: "cash", date: "2026-10-11" }, // pagado de la caja a propósito
  { id: 9, category: "insurance", amount: 400, status: "paid", paymentMethod: "credit_card", date: "2026-10-11" },
];

test("cuentas por defecto: Income hereda la Cuenta Principal; Income, OpEx, Reserva, Suplidores y Caja", () => {
  assert.deepEqual(accounts.map(a => a.role), ["income", "opex", "reserve", "suppliers", "cash"]);
  assert.equal(accounts[0].openingBalance, 50000); assert.equal(accounts[0].bank, "Popular"); assert.equal(accounts[1].openingDate, "2026-10-01");
  assert.equal(getAccounts({ accounts: [{ id: "x", name: "X", role: "other" }] }).length, 1, "si ya hay cuentas guardadas se usan esas");
  assert.equal(getAccounts(null, "2026-10-13")[0].openingDate, "2026-10-13");
});

test("a qué cuenta va cada cobro y cada gasto", () => {
  assert.equal(cobroAccountId(cobros[0], accounts), "income");
  assert.equal(cobroAccountId(cobros[1], accounts), "cash", "efectivo → Caja");
  assert.equal(cobroAccountId({ ...cobros[0], accountId: "opex" }, accounts), "opex", "si se escoge una cuenta, esa");
  assert.equal(cobroAccountId({ ...cobros[0], status: "pending" }, accounts), null);
  assert.equal(expenseAccountId(expenses[0], accounts), "opex");
  assert.equal(expenseAccountId(expenses[1], accounts), "suppliers", "factura a crédito de suplidor → Suplidores");
  assert.equal(expenseAccountId(expenses[2], accounts), null, "efectivo no sale de ninguna cuenta");
  assert.equal(expenseAccountId(expenses[3], accounts), "reserve", "retiro de reserva → Reserva");
  assert.equal(expenseAccountId(expenses[4], accounts), null, "override de nómina es memoria, no dinero");
  assert.equal(expenseAccountId(expenses[7], accounts), "cash");
  assert.equal(expenseAccountId(expenses[8], accounts), null, "tarjeta de crédito no sale del banco");
  assert.equal(expenseAccountId({ category: "partner_settlement", amount: 1, status: "paid", paymentMethod: "transfer" }, accounts), "opex", "socios se pagan de OpEx");
  // Sin cuenta de Suplidores activa: lo de suplidores sale de OpEx
  const noSup = accounts.map(a => a.role === "suppliers" ? { ...a, active: false } : a);
  assert.equal(expenseAccountId(expenses[1], noSup), "opex");
});

test("movimientos, saldos y conciliación por cuenta (con transferencias)", () => {
  const transfers = [
    { id: 1, date: "2026-10-08", fromId: "income", toId: "opex", amount: 5000, kind: "transfer" },
    { id: 2, date: "2026-10-09", fromId: "cash", toId: "income", amount: 3000, kind: "deposit" },
  ];
  const mv = bankMovements({ accounts, expenses, cobros, transfers, invoices: [{ id: 1, invoiceNumber: "FAC-1" }], clients: [{ id: 1, companyName: "Bocel" }] });
  assert.deepEqual(mv.income.map(m => m.key).sort(), ["cobro-1", "cobro-3", "transfer-1-out", "transfer-2-in"].sort(), "el cobro del 20/09 es antes del saldo inicial");
  assert.equal(mv.income.find(m => m.key === "cobro-1").description, "Cobro FAC-1 — Bocel");
  const s = accountSummary(accounts[0], mv.income, { "cobro-1": "reconciled", "transfer-1-out": "reconciled" });
  assert.equal(s.balance, 50000 + 10000 + 20000 - 5000 + 3000);
  assert.equal(s.reconciled, 50000 + 10000 - 5000);
  assert.equal(s.pendingIn, 23000); assert.equal(s.pendingOut, 0);
  const opex = accountSummary(accounts[1], mv.opex, {});
  assert.equal(opex.balance, 5000 - 2500);
  assert.equal(accountSummary(accounts[3], mv.suppliers).balance, -8000, "pagó al suplidor sin haber apartado");
  assert.equal(accountSummary(accounts[4], mv.cash).balance, 3000 - 700 - 3000);
  const st = accountSummary({ ...accounts[0], stmtBalance: "55500" }, mv.income, { "cobro-1": "reconciled", "transfer-1-out": "reconciled" });
  assert.equal(st.stmtDiff, 500, "diferencia contra el estado de cuenta");
});

test("suplidores: todo lo pendiente a crédito; compromisos de OpEx", () => {
  assert.deepEqual(supplierDebt(expenses), { total: 4000, count: 1 });
  assert.equal(opexCommitments(expenses, accounts), 3000, "nómina pendiente sale de OpEx; la goma a crédito sale de Suplidores");
});

test("repartir Income: cobros por banco y depósitos de caja; Reserva por Profit First, socios a OpEx; lo que falta a Suplidores primero", () => {
  let transfers = [];
  let p = undistributed({ accounts, cobros, transfers });
  assert.deepEqual(p.items.map(i => i.key), ["cobro:1", "cobro:3"], "efectivo no (está en Caja); el de antes del saldo inicial no");
  assert.equal(p.total, 30000); assert.equal(p.reserve, 4000); assert.equal(p.opex, 26000, "los 10,000 del socio van a OpEx");
  const s = suggestDistribution({ pending: p, supplierShortfall: 4000 });
  assert.deepEqual(s, { reserve: 4000, suppliers: 4000, opex: 22000, total: 30000 });
  assert.deepEqual(suggestDistribution({ pending: p, supplierShortfall: 99999 }).suppliers, 26000, "nunca más de lo que va a OpEx");
  assert.deepEqual(suggestDistribution({ pending: p, supplierShortfall: 99999, opexShortfall: 20000 }), { reserve: 4000, suppliers: 6000, opex: 20000, total: 30000 }, "primero lo que OpEx ya debe pagar (nómina), después suplidores");
  assert.deepEqual(suggestDistribution({ pending: p, supplierShortfall: 0, opexShortfall: 50000 }).opex, 26000);
  const built = buildDistribution({ accounts, amounts: s, date: "2026-10-13", distKeys: p.items.map(i => i.key), nextId: 7, groupId: "g1" });
  assert.deepEqual(built.transfers.map(t => [t.id, t.fromId, t.toId, t.amount, t.kind]), [[7, "income", "reserve", 4000, "distribution"], [8, "income", "suppliers", 4000, "distribution"], [9, "income", "opex", 22000, "distribution"]]);
  transfers = built.transfers;
  assert.equal(undistributed({ accounts, cobros, transfers }).items.length, 0, "ya repartido");
  // depósito de toda la caja → se reparte con el Profit First de esos cobros
  const cash = cashToDeposit({ accounts, cobros, transfers });
  assert.deepEqual(cash.cobroIds, [2]); assert.equal(cash.cobrosTotal, 3000);
  transfers = [...transfers, { id: 10, date: "2026-10-13", fromId: "cash", toId: "income", amount: 3000, kind: "deposit", cobroIds: [2] }];
  assert.deepEqual(cashToDeposit({ accounts, cobros, transfers }).cobroIds, [], "ya depositado");
  p = undistributed({ accounts, cobros, transfers });
  assert.deepEqual(p.items.map(i => [i.key, i.reserve, i.opex]), [["deposit:10", 600, 2400]]);
  // depósito parcial sin cobros: % de reserva sobre el monto
  p = undistributed({ accounts, cobros, transfers: [{ id: 11, date: "2026-10-13", fromId: "cash", toId: "income", amount: 1000, kind: "deposit" }, ...built.transfers], settings: { reservePct: 25 } });
  assert.deepEqual(p.items.map(i => [i.key, i.reserve]), [["deposit:11", 250]]);
  assert.match(buildDistribution({ accounts: accounts.map(a => a.role === "income" ? { ...a, active: false } : a), amounts: s, date: "2026-10-13", nextId: 1 }).error, /Income/);
  assert.match(buildDistribution({ accounts, amounts: { reserve: 0, suppliers: 0, opex: 0 }, date: "2026-10-13", nextId: 1 }).error, /montos/);
});

test("validaciones: transferencia, cuenta nueva, borrar o desactivar", () => {
  const t = { date: "2026-10-13", fromId: "income", toId: "opex", amount: 100 };
  assert.equal(transferProblem(t, accounts), null);
  assert.match(transferProblem({ ...t, toId: "income" }, accounts), /misma/);
  assert.match(transferProblem({ ...t, amount: 0 }, accounts), /mayor que 0/);
  assert.match(transferProblem({ ...t, date: "13/10" }, accounts), /Fecha/);
  assert.match(transferProblem({ ...t, toId: "zz" }, accounts), /no existe/);
  assert.match(transferProblem(t, accounts.map(a => a.id === "opex" ? { ...a, active: false } : a)), /desactivada/);
  assert.equal(accountProblem({ id: "n", name: "Ahorro", role: "other", openingDate: "2026-10-13", openingBalance: 0, last4: "1234" }, accounts), null);
  assert.match(accountProblem({ id: "n", name: "income", role: "other", openingDate: "2026-10-13", openingBalance: 0 }, accounts), /ya hay/i);
  assert.match(accountProblem({ id: "n", name: "X", role: "other", openingDate: "2026-10-13", openingBalance: 0, last4: "12a" }, accounts), /4 números/);
  const mv = bankMovements({ accounts, expenses, cobros, transfers: [] });
  const ctx = { accounts, movements: mv, transfers: [], expenses, cobros };
  assert.deepEqual(accountRemoval(accounts[0], ctx).canDelete, false);
  assert.match(accountRemoval(accounts[0], ctx).reason, /al menos una cuenta Income/);
  const extra = { id: "x", name: "Ahorro", role: "other", openingBalance: 0, openingDate: "2026-10-13", active: true };
  assert.deepEqual(accountRemoval(extra, { ...ctx, accounts: [...accounts, extra] }), { canDelete: true, canDeactivate: true, reason: "" });
  const used = accountRemoval(accounts[2], ctx);
  assert.equal(used.canDelete, false); assert.equal(used.canDeactivate, true, "Reserva con retiro: se desactiva, no se borra");
  assert.equal(nextTransferId([{ id: 3 }, { id: 9 }]), 10);
  assert.equal(roleAccount(accounts, "cash").id, "cash");
});

test("nómina con adelanto aplicado: de OpEx sale solo lo que falta; el adelanto salió cuando se dio", () => {
  const exps = [
    { id: 20, category: "adelanto_conductor", amount: 500, status: "paid", paymentMethod: "transfer", date: "2026-10-05", payrollKey: "2026-10-H1" },
    { id: 21, category: "driverPay", amount: 2500, advanceApplied: 500, status: "paid", paymentMethod: "transfer", paidDate: "2026-10-08" },
    { id: 22, category: "helper", amount: 1000, advanceApplied: 1000, status: "paid", paymentMethod: "transfer", paidDate: "2026-10-08" }, // todo adelantado: no sale nada más
  ];
  const mv = bankMovements({ accounts, expenses: exps, cobros: [], transfers: [], invoices: [], clients: [] });
  assert.deepEqual(mv.opex.map(m => [m.key, m.amount]).sort(), [["expense-20", 500], ["expense-21", 2000]]);
});

test("saldo de cuenta = saldo al CIERRE de su fecha: lo de ese día ya está incluido, solo cuenta lo posterior", () => {
  const accs = defaultAccounts({ name: "Cuenta", bank: "", openingBalance: 0, openingDate: "2026-05-25" }, "2026-05-25").map(a => a.id === "income" ? { ...a, openingBalance: 88.96, openingDate: "2026-10-17" } : a);
  const transfers = [
    { id: 1, date: "2026-10-17", kind: "distribution", fromId: "income", toId: "opex", amount: 29000 }, // mismo día: ya está dentro de los 88.96
    { id: 2, date: "2026-10-18", kind: "transfer", fromId: "income", toId: "opex", amount: 50 },          // día siguiente: sí resta
  ];
  const mv = bankMovements({ accounts: accs, expenses: [], cobros: [], transfers });
  assert.equal(accountSummary(accs.find(a => a.id === "income"), mv.income).balance, 38.96);
  // Caja: cobro en efectivo del mismo día del saldo no vuelve a quedar «por depositar»
  const cobros = [{ id: 1, amount: 5000, method: "cash", status: "collected", collectedDate: "2026-10-17" }, { id: 2, amount: 700, method: "cash", status: "collected", collectedDate: "2026-10-18" }];
  const cashAccs = accs.map(a => a.id === "cash" ? { ...a, openingBalance: 0, openingDate: "2026-10-17" } : a);
  assert.deepEqual(cashToDeposit({ accounts: cashAccs, cobros, transfers: [] }).cobroIds, [2]);
});

/**
 * Banco con cuentas reales (Profit First de verdad, no solo calculado).
 *
 * Cuentas (se guardan en bankAccount.accounts; se pueden agregar, editar, desactivar o borrar si no tienen movimientos):
 *   income    → aquí entra todo lo cobrado por banco
 *   opex      → operación: nómina, ayudantes, socios, broker, gastos
 *   reserve   → Tax + Profit + Owner's Comp (retiros del dueño / impuestos)
 *   suppliers → lo que se le debe a los suplidores (facturas a crédito); de aquí se les paga
 *   cash      → Caja: cobros en efectivo, para saber exactamente qué depositar
 *   other     → cualquier otra cuenta
 *
 * Movimientos de cada cuenta (desde su fecha de saldo inicial):
 *   - cobros: a su cuenta escogida; si no, efectivo → Caja y lo demás → Income
 *   - gastos pagados: a su cuenta escogida; si no, retiro de reserva → Reserva, factura a crédito de suplidor →
 *     Suplidores, lo demás → OpEx. Efectivo y tarjeta de crédito no salen de ninguna cuenta (salvo que se escoja una).
 *   - transferencias entre cuentas (bl_bank_transfers): salida en una, entrada en la otra.
 * Conciliación por movimiento: claves «cobro-ID», «expense-ID», «transfer-ID-out», «transfer-ID-in».
 */
import { round2, cobroAllocation, COLLECTED, DEFAULT_PF_SETTINGS } from "./profitFirst.js";

export const ACCOUNT_ROLES = {
  income:    { label: "Income",          hint: "Aquí entra todo lo cobrado por banco" },
  opex:      { label: "OpEx",            hint: "Nómina, ayudantes, socios, broker y gastos" },
  reserve:   { label: "Reserva",         hint: "Tax + Profit + Owner's Comp" },
  suppliers: { label: "Suplidores",      hint: "Lo que se debe a suplidores; de aquí se les paga" },
  cash:      { label: "Caja (efectivo)", hint: "Cobros en efectivo por depositar" },
  other:     { label: "Otra",            hint: "" },
};
/** Siempre tiene que quedar una cuenta activa de estas. */
export const CORE_ROLES = ["income", "opex"];
export const TRANSFER_KINDS = { transfer: "Transferencia", distribution: "Reparto de Income", deposit: "Depósito de caja", set_aside: "Apartado para suplidores" };

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/** Cuentas por defecto (la primera vez): Income hereda el saldo de la «Cuenta Principal» de antes. */
export function defaultAccounts(legacy = null, todayStr = "") {
  const date = isDate(legacy?.openingDate) ? legacy.openingDate : todayStr;
  const base = { bank: "", last4: "", openingBalance: 0, openingDate: date, active: true };
  return [
    { ...base, id: "income", name: "Income", role: "income", bank: legacy?.bank || "", openingBalance: num(legacy?.openingBalance) },
    { ...base, id: "opex", name: "OpEx", role: "opex" },
    { ...base, id: "reserve", name: "Tax · Profit · Owner's Comp", role: "reserve" },
    { ...base, id: "suppliers", name: "Suplidores", role: "suppliers" },
    { ...base, id: "cash", name: "Caja (efectivo)", role: "cash" },
  ];
}
export function getAccounts(bankAccount, todayStr = "") {
  return Array.isArray(bankAccount?.accounts) && bankAccount.accounts.length ? bankAccount.accounts : defaultAccounts(bankAccount, todayStr);
}
export const activeAccounts = (accounts) => (accounts || []).filter(a => a.active !== false);
export const roleAccount = (accounts, role) => (accounts || []).find(a => a.active !== false && a.role === role) || null;
const exists = (accounts, id) => id != null && id !== "" && (accounts || []).some(a => a.id === id);

/** Gastos que no son dinero (memoria de nómina). */
const NOT_MONEY = new Set(["nominaTotalOverride"]);
/** Métodos que no salen de una cuenta de banco a menos que se escoja una. */
const OFF_BANK_METHODS = new Set(["cash", "credit_card"]);

/** Cuenta de la que sale (o saldrá) un gasto; null si no pasa por ninguna cuenta. */
export function expenseAccountId(e, accounts) {
  if (!e || NOT_MONEY.has(e.category)) return null;
  if (exists(accounts, e.accountId)) return e.accountId;
  if (OFF_BANK_METHODS.has(e.paymentMethod)) return null;
  const by = (r) => roleAccount(accounts, r)?.id || null;
  if (e.category === "reserve_withdrawal") return by("reserve") || by("opex");
  if (e.paymentMethod === "credit") return by("suppliers") || by("opex");
  return by("opex");
}

/** Cuenta a la que entra un cobro; null si no entra a ninguna. */
export function cobroAccountId(c, accounts) {
  if (!c || !COLLECTED.includes(c.status) || !(num(c.amount) > 0)) return null;
  if (exists(accounts, c.accountId)) return c.accountId;
  if (c.method === "cash") return roleAccount(accounts, "cash")?.id || null;
  return roleAccount(accounts, "income")?.id || null;
}

export const cobroDate = (c) => c?.collectedDate || c?.pf?.at || c?.date || "";
export const expenseDate = (e) => e?.paidDate || e?.date || "";

/**
 * Movimientos de todas las cuentas: { [accountId]: [{ key, accountId, type: "in"|"out", date, amount, description, source, refId, kind }] }
 * Solo desde la fecha de saldo inicial de cada cuenta; ordenados del más nuevo al más viejo.
 */
export function bankMovements({ accounts = [], expenses = [], cobros = [], transfers = [], invoices = [], clients = [], suppliers = [] }) {
  const out = Object.fromEntries(accounts.map(a => [a.id, []]));
  const acc = new Map(accounts.map(a => [a.id, a]));
  const push = (m) => { const a = acc.get(m.accountId); if (!a) return; if (a.openingDate && m.date && m.date < a.openingDate) return; out[a.id].push(m); };
  const invMap = new Map(invoices.map(i => [i.id, i])), clMap = new Map(clients.map(c => [c.id, c])), supMap = new Map(suppliers.map(s => [s.id, s]));
  for (const c of cobros) {
    const id = cobroAccountId(c, accounts); if (!id) continue;
    const inv = invMap.get(c.invoiceId), cl = clMap.get(c.clientId);
    push({ key: `cobro-${c.id}`, accountId: id, type: "in", date: cobroDate(c), amount: round2(num(c.amount)), source: "cobro", refId: c.id, kind: c.method === "cash" ? "cash" : "cobro",
      description: `Cobro${inv?.invoiceNumber ? ` ${inv.invoiceNumber}` : ""}${cl ? ` — ${cl.companyName}` : ""}${c.method === "cash" ? " (efectivo)" : ""}` });
  }
  for (const e of expenses) {
    if (e.status !== "paid" || !(num(e.amount) > 0)) continue;
    const id = expenseAccountId(e, accounts); if (!id) continue;
    const sup = supMap.get(e.supplierId);
    push({ key: `expense-${e.id}`, accountId: id, type: "out", date: expenseDate(e), amount: round2(num(e.amount)), source: "expense", refId: e.id, kind: e.category,
      description: e.description || (sup ? `Pago a ${sup.name}` : `Gasto #${e.id}`) });
  }
  for (const t of transfers) {
    const amt = round2(num(t.amount)); if (!(amt > 0)) continue;
    const from = acc.get(t.fromId), to = acc.get(t.toId);
    const label = TRANSFER_KINDS[t.kind] || TRANSFER_KINDS.transfer;
    if (from) push({ key: `transfer-${t.id}-out`, accountId: from.id, type: "out", date: t.date, amount: amt, source: "transfer", refId: t.id, kind: t.kind || "transfer", description: `${label} → ${to?.name || "?"}${t.note ? ` · ${t.note}` : ""}` });
    if (to) push({ key: `transfer-${t.id}-in`, accountId: to.id, type: "in", date: t.date, amount: amt, source: "transfer", refId: t.id, kind: t.kind || "transfer", description: `${label} ← ${from?.name || "?"}${t.note ? ` · ${t.note}` : ""}` });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (a.key < b.key ? 1 : -1));
  return out;
}

/** Saldos de una cuenta: con todo (proyectado) y solo lo conciliado; diferencia contra el estado de cuenta si lo puso. */
export function accountSummary(account, movements = [], reconciliation = {}) {
  const opening = round2(num(account?.openingBalance));
  let balance = opening, reconciled = opening, pendingIn = 0, pendingOut = 0, inTotal = 0, outTotal = 0;
  for (const m of movements) {
    const ok = reconciliation?.[m.key] === "reconciled";
    const sign = m.type === "in" ? 1 : -1;
    balance += sign * m.amount;
    if (m.type === "in") inTotal += m.amount; else outTotal += m.amount;
    if (ok) reconciled += sign * m.amount; else if (m.type === "in") pendingIn += m.amount; else pendingOut += m.amount;
  }
  const stmt = account?.stmtBalance === "" || account?.stmtBalance == null ? null : num(account.stmtBalance);
  return { opening, balance: round2(balance), reconciled: round2(reconciled), pendingIn: round2(pendingIn), pendingOut: round2(pendingOut),
    inTotal: round2(inTotal), outTotal: round2(outTotal), count: movements.length,
    stmtBalance: stmt, stmtDiff: stmt == null ? null : round2(stmt - reconciled) };
}

/** Lo que se le debe a suplidores (todo lo pendiente a crédito). */
export function supplierDebt(expenses = []) {
  const items = expenses.filter(e => e.paymentMethod === "credit" && e.status !== "paid" && num(e.amount) > 0);
  return { total: round2(items.reduce((s, e) => s + num(e.amount), 0)), count: items.length };
}

/** Gastos pendientes que saldrán de OpEx (nómina, ayudantes, etc.). */
export function opexCommitments(expenses = [], accounts = []) {
  const opex = roleAccount(accounts, "opex")?.id;
  let total = 0;
  for (const e of expenses) if (e.status !== "paid" && num(e.amount) > 0 && expenseAccountId({ ...e, status: "paid" }, accounts) === opex) total += num(e.amount);
  return round2(total);
}

/**
 * Dinero por repartir en Income: cobros que entraron por banco a una cuenta Income y depósitos de caja a Income
 * que todavía no están en ningún reparto. Cada uno con su parte de Reserva (Profit First del cobro) y el resto para OpEx
 * (lo de socios y broker va a OpEx: de ahí se les paga).
 */
export function undistributed({ accounts = [], cobros = [], transfers = [], settings = DEFAULT_PF_SETTINGS }) {
  const done = new Set(transfers.flatMap(t => t.distKeys || []));
  const isIncome = (id) => accounts.find(a => a.id === id)?.role === "income";
  const opening = (id) => accounts.find(a => a.id === id)?.openingDate || "";
  const pct = num(settings?.reservePct);
  const items = [];
  const cobroById = new Map(cobros.map(c => [c.id, c]));
  for (const c of cobros) {
    const id = cobroAccountId(c, accounts);
    if (!id || !isIncome(id) || done.has(`cobro:${c.id}`) || cobroDate(c) < opening(id)) continue;
    const a = cobroAllocation(c, settings);
    const reserve = round2(a?.reserve ?? num(c.amount) * pct / 100);
    items.push({ key: `cobro:${c.id}`, kind: "cobro", refId: c.id, date: cobroDate(c), amount: round2(num(c.amount)), reserve, opex: round2(num(c.amount) - reserve) });
  }
  for (const t of transfers) {
    if (t.kind !== "deposit" || !isIncome(t.toId) || done.has(`deposit:${t.id}`) || (t.date || "") < opening(t.toId)) continue;
    const amt = round2(num(t.amount));
    // Depósito de la caja completa: Reserva según el Profit First de esos cobros; si no, el % sobre el monto
    const cs = (t.cobroIds || []).map(id => cobroById.get(id)).filter(Boolean);
    const tot = cs.reduce((s, c) => s + num(c.amount), 0);
    const res = tot > 0 ? cs.reduce((s, c) => s + num(cobroAllocation(c, settings)?.reserve), 0) * (amt / tot) : amt * pct / 100;
    const reserve = round2(Math.min(amt, res));
    items.push({ key: `deposit:${t.id}`, kind: "deposit", refId: t.id, date: t.date, amount: amt, reserve, opex: round2(amt - reserve) });
  }
  items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const total = round2(items.reduce((s, i) => s + i.amount, 0));
  const reserve = round2(items.reduce((s, i) => s + i.reserve, 0));
  return { items, total, reserve, opex: round2(total - reserve) };
}

/**
 * Reparto sugerido: la Reserva según Profit First; del resto, primero lo que OpEx necesita para lo que ya debe pagar
 * (nómina y otros pendientes que no cubre su saldo), después lo que le falta a Suplidores, y lo que sobre a OpEx.
 */
export function suggestDistribution({ pending, supplierShortfall = 0, opexShortfall = 0 }) {
  const reserve = round2(pending?.reserve || 0);
  const opexPart = Math.max(0, round2((pending?.total || 0) - reserve));
  const opexFirst = Math.min(Math.max(0, opexShortfall), opexPart);
  const suppliers = round2(Math.min(Math.max(0, supplierShortfall), opexPart - opexFirst));
  return { reserve, suppliers, opex: round2(opexPart - suppliers), total: round2(pending?.total || 0) };
}

/** Transferencias de un reparto (una por destino con monto > 0), todas con las mismas claves repartidas. */
export function buildDistribution({ accounts, amounts, date, distKeys = [], nextId, groupId, by = "" }) {
  const income = roleAccount(accounts, "income");
  if (!income) return { error: "No hay una cuenta Income activa" };
  const dest = [["reserve", amounts.reserve], ["suppliers", amounts.suppliers], ["opex", amounts.opex]];
  const out = []; let id = nextId;
  for (const [role, amt] of dest) {
    const a = round2(num(amt)); if (!(a > 0)) continue;
    const to = roleAccount(accounts, role);
    if (!to) return { error: `No hay una cuenta ${ACCOUNT_ROLES[role].label} activa` };
    out.push({ id: id++, date, fromId: income.id, toId: to.id, amount: a, kind: "distribution", groupId, distKeys, note: "", createdAt: new Date().toISOString(), createdBy: by });
  }
  if (!out.length) return { error: "No hay montos para repartir" };
  return { transfers: out };
}

/** Caja: cobros en efectivo que todavía no se han depositado (para un depósito de toda la caja). */
export function cashToDeposit({ accounts = [], cobros = [], transfers = [] }) {
  const cash = roleAccount(accounts, "cash");
  if (!cash) return null;
  const deposited = new Set(transfers.filter(t => t.kind === "deposit").flatMap(t => t.cobroIds || []));
  const items = cobros.filter(c => cobroAccountId(c, accounts) === cash.id && !deposited.has(c.id) && cobroDate(c) >= (cash.openingDate || ""));
  return { account: cash, cobroIds: items.map(c => c.id), cobrosTotal: round2(items.reduce((s, c) => s + num(c.amount), 0)) };
}

/** Valida una transferencia antes de guardarla. */
export function transferProblem(t, accounts) {
  if (!t) return "Transferencia vacía";
  if (!isDate(t.date)) return "Fecha inválida";
  if (!(num(t.amount) > 0)) return "El monto debe ser mayor que 0";
  if (!t.fromId || !t.toId) return "Escoge la cuenta de salida y la de entrada";
  if (t.fromId === t.toId) return "La cuenta de salida y la de entrada son la misma";
  const from = accounts.find(a => a.id === t.fromId), to = accounts.find(a => a.id === t.toId);
  if (!from || !to) return "Cuenta no existe";
  if (from.active === false || to.active === false) return "Esa cuenta está desactivada";
  return null;
}

/** ¿Se puede borrar o desactivar? Borrar solo sin movimientos ni referencias; las básicas no se quedan sin una activa. */
export function accountRemoval(account, { accounts = [], movements = {}, transfers = [], expenses = [], cobros = [] }) {
  const used = (movements[account.id] || []).length > 0
    || transfers.some(t => t.fromId === account.id || t.toId === account.id)
    || expenses.some(e => e.accountId === account.id) || cobros.some(c => c.accountId === account.id)
    || num(account.openingBalance) !== 0;
  const lastCore = CORE_ROLES.includes(account.role) && activeAccounts(accounts).filter(a => a.role === account.role).length <= 1 && account.active !== false;
  return {
    canDelete: !used && !lastCore,
    canDeactivate: account.active !== false && !lastCore,
    reason: lastCore ? `Tiene que quedar al menos una cuenta ${ACCOUNT_ROLES[account.role].label} activa` : used ? "Tiene movimientos o saldo inicial: se puede desactivar, no borrar (así no se pierde el historial)" : "",
  };
}

/** Valida una cuenta nueva o editada. */
export function accountProblem(a, accounts) {
  if (!String(a?.name || "").trim()) return "Ponle nombre a la cuenta";
  if (!ACCOUNT_ROLES[a.role]) return "Escoge el tipo de cuenta";
  if (!isDate(a.openingDate)) return "Fecha del saldo inicial inválida";
  if (!Number.isFinite(Number(a.openingBalance))) return "Saldo inicial inválido";
  if (a.last4 && !/^\d{4}$/.test(String(a.last4))) return "Los últimos 4 dígitos deben ser 4 números";
  if (accounts.some(x => x.id !== a.id && x.name.trim().toLowerCase() === a.name.trim().toLowerCase())) return "Ya hay una cuenta con ese nombre";
  return null;
}

/** Nuevo id de transferencia (enteros como las demás tablas). */
export const nextTransferId = (transfers = []) => transfers.reduce((m, t) => Math.max(m, num(t.id)), 0) + 1;

/** Todo el Banco de una vez (para la página, el panel y nómina). */
export function bankOverview({ bankAccount, expenses = [], cobros = [], transfers = [], reconciliation = {}, settings = DEFAULT_PF_SETTINGS, invoices = [], clients = [], suppliers = [], todayStr = "" }) {
  const accounts = getAccounts(bankAccount, todayStr);
  const movements = bankMovements({ accounts, expenses, cobros, transfers, invoices, clients, suppliers });
  const summaries = Object.fromEntries(accounts.map(a => [a.id, accountSummary(a, movements[a.id], reconciliation)]));
  const pending = undistributed({ accounts, cobros, transfers, settings });
  const debt = supplierDebt(expenses);
  const sup = roleAccount(accounts, "suppliers");
  const supplierBalance = sup ? summaries[sup.id].balance : 0;
  const cash = cashToDeposit({ accounts, cobros, transfers });
  const opex = roleAccount(accounts, "opex"), reserve = roleAccount(accounts, "reserve");
  return {
    accounts, movements, summaries, pending, debt, supplierAccount: sup, supplierBalance,
    supplierShortfall: sup ? round2(Math.max(0, debt.total - supplierBalance)) : 0,
    cash, cashBalance: cash ? summaries[cash.account.id].balance : 0,
    opexBalance: opex ? summaries[opex.id].balance : 0, opexCommitted: opexCommitments(expenses, accounts),
    opexShortfall: opex ? round2(Math.max(0, opexCommitments(expenses, accounts) - summaries[opex.id].balance)) : 0,
    reserveBalance: reserve ? summaries[reserve.id].balance : 0,
  };
}

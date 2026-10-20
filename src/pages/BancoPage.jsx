import { useState, useMemo, useEffect } from "react";
import { Landmark, ArrowLeftRight, Plus, PiggyBank, Wallet, Banknote, Store, Inbox, Split, CheckCircle2, Circle, Pencil, Trash2, X, ArrowDownToLine, EyeOff, RotateCcw, Settings, CreditCard } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, today } from "../utils/helpers.js";
import { Card, PageHeader, Th, Td, Badge, Btn, Inp, Sel } from "../components/ui/index.jsx";
import {
  ACCOUNT_ROLES, bankOverview, activeAccounts, roleAccount, suggestDistribution, buildDistribution,
  transferProblem, accountRemoval, accountProblem, nextTransferId,
} from "../utils/bankAccounts.js";
import { nxId } from "../utils/helpers.js";

const PURPLE = "#9b7fe8";
const ROLE_STYLE = {
  income:    { color: colors.green,  icon: Inbox },
  opex:      { color: colors.cyan,   icon: Wallet },
  reserve:   { color: PURPLE,        icon: PiggyBank },
  suppliers: { color: colors.orange, icon: Store },
  cash:      { color: colors.yellow, icon: Banknote },
  card:      { color: colors.red,    icon: CreditCard },
  other:     { color: colors.accent, icon: Landmark },
};
const FILTERS = { todos: "Todos", pendientes: "Pendientes", conciliados: "Conciliados", in: "Entradas", out: "Salidas" };

function Modal({ title, onClose, children, width = 480, testId }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} data-bank-modal={testId} style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 18, width: "100%", maxWidth: width, maxHeight: "92vh", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        <button onClick={onClose} aria-label="Cerrar" style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", padding: 6 }}><X size={16} /></button>
      </div>
      {children}
    </div>
  </div>;
}

export default function BancoPage({ expenses = [], setExpenses, cobros = [], clients = [], invoices = [], suppliers = [], bankAccount, setBankAccount, bankReconciliation = {}, setBankReconciliation, bankTransfers = [], setBankTransfers, pfSettings, setPfSettings, user, isMobile }) {
  const todayStr = today();
  const reconciliation = bankReconciliation || {};
  const bank = useMemo(() => bankOverview({ bankAccount, expenses, cobros, transfers: bankTransfers, reconciliation, settings: pfSettings, invoices, clients, suppliers, todayStr }),
    [bankAccount, expenses, cobros, bankTransfers, reconciliation, pfSettings, invoices, clients, suppliers, todayStr]);
  const { accounts, movements, summaries } = bank;
  const active = activeAccounts(accounts);
  const inactive = accounts.filter(a => a.active === false);
  const [selId, setSelId] = useState(null);
  const sel = accounts.find(a => a.id === selId) || roleAccount(accounts, "income") || active[0] || accounts[0];
  const [filter, setFilter] = useState("todos");
  const [acctForm, setAcctForm] = useState(null);   // cuenta nueva o en edición
  const [tf, setTf] = useState(null);               // transferencia (también apartar y depositar)
  const [dist, setDist] = useState(null);           // reparto de Income
  const [wd, setWd] = useState(null);               // retiro (dueño / impuestos o a caja)
  const [showInactive, setShowInactive] = useState(false);
  const [showPct, setShowPct] = useState(false);
  const [pct, setPct] = useState(pfSettings?.reservePct ?? 20);
  const [err, setErr] = useState("");
  const by = user?.name || user?.username || "admin";
  const nameOf = (id) => accounts.find(a => a.id === id)?.name || "—";

  // Guarda la lista de cuentas (la primera vez se crean las de por defecto)
  const saveAccounts = (next) => setBankAccount(prev => ({ ...(prev || {}), accounts: next }));
  // La primera vez que se abre: se guardan las cuentas por defecto (así su fecha de saldo inicial no cambia)
  useEffect(() => { if (!Array.isArray(bankAccount?.accounts) && setBankAccount) saveAccounts(accounts); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cuentas ───────────────────────────────────────────────────────────────
  // Cuenta nueva: saldo al cierre de AYER, para que lo que se registre hoy ya cuente
  const yesterday = (() => { const d = new Date(`${todayStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const openNewAccount = () => { setErr(""); setAcctForm({ id: `acc-${Date.now()}`, name: "", role: "other", bank: "", last4: "", openingBalance: 0, openingDate: yesterday, active: true, _new: true }); };
  const saveAccount = () => {
    const { _new, ...a } = { ...acctForm, name: String(acctForm.name || "").trim(), openingBalance: Number(acctForm.openingBalance) || 0, last4: String(acctForm.last4 || "").trim() };
    const p = accountProblem(a, accounts); if (p) { setErr(p); return; }
    const exists = accounts.some(x => x.id === a.id);
    // Cambiar el tipo de una cuenta básica: no puede quedar sin Income ni OpEx activa
    if (exists) {
      const before = accounts.find(x => x.id === a.id);
      if (before.role !== a.role && ["income", "opex"].includes(before.role) && active.filter(x => x.role === before.role).length <= 1) { setErr(`Tiene que quedar al menos una cuenta ${ACCOUNT_ROLES[before.role].label} activa`); return; }
    }
    saveAccounts(exists ? accounts.map(x => x.id === a.id ? a : x) : [...accounts, a]);
    setAcctForm(null); setSelId(a.id); setErr("");
  };
  const removal = sel ? accountRemoval(sel, { accounts, movements, transfers: bankTransfers, expenses, cobros }) : null;
  const deleteAccount = () => {
    if (!removal?.canDelete) { window.alert(removal?.reason || "No se puede borrar"); return; }
    if (!window.confirm(`¿Borrar la cuenta «${sel.name}»? No tiene movimientos.`)) return;
    saveAccounts(accounts.filter(a => a.id !== sel.id)); setSelId(null);
  };
  const setActive = (acc, on) => {
    if (!on) {
      const r = accountRemoval(acc, { accounts, movements, transfers: bankTransfers, expenses, cobros });
      if (!r.canDeactivate) { window.alert(r.reason); return; }
      if (!window.confirm(`¿Desactivar «${acc.name}»? Su historial se conserva; ya no saldrá para escoger.`)) return;
    }
    saveAccounts(accounts.map(a => a.id === acc.id ? { ...a, active: on } : a));
    if (!on) setSelId(null);
  };
  const setStatement = (acc, value) => saveAccounts(accounts.map(a => a.id === acc.id ? { ...a, stmtBalance: value === "" ? null : Number(value), stmtDate: todayStr } : a));

  // ── Transferencias ────────────────────────────────────────────────────────
  const openTransfer = (preset = {}) => { setErr(""); setTf({ date: todayStr, fromId: preset.fromId || roleAccount(accounts, "income")?.id || "", toId: preset.toId || roleAccount(accounts, "opex")?.id || "", amount: preset.amount ?? "", note: preset.note || "", kind: preset.kind || "transfer", cobroIds: preset.cobroIds || [] }); };
  const saveTransfer = () => {
    const t = { ...tf, amount: Math.round((Number(tf.amount) || 0) * 100) / 100 };
    const p = transferProblem(t, accounts); if (p) { setErr(p); return; }
    const fromBal = summaries[t.fromId]?.balance ?? 0;
    if (t.amount > fromBal + 0.005 && !window.confirm(`«${nameOf(t.fromId)}» tiene ${fmt(fromBal)}: quedará en ${fmt(fromBal - t.amount)}. ¿Transferir igual?`)) return;
    // Depósito de toda la caja: guarda qué cobros en efectivo se depositaron (para repartirlos con su Profit First)
    const cobroIds = t.kind === "deposit" && Math.abs(t.amount - (bank.cashBalance || 0)) < 0.01 ? (bank.cash?.cobroIds || []) : [];
    const rec = { id: nextTransferId(bankTransfers), date: t.date, fromId: t.fromId, toId: t.toId, amount: t.amount, note: String(t.note || "").trim(), kind: t.kind || "transfer", ...(cobroIds.length ? { cobroIds } : {}), createdAt: new Date().toISOString(), createdBy: by };
    setBankTransfers(prev => [...prev, rec]);
    setTf(null); setErr("");
  };
  const deleteTransfer = (id) => {
    const t = bankTransfers.find(x => x.id === id); if (!t) return;
    const group = t.groupId ? bankTransfers.filter(x => x.groupId === t.groupId) : [t];
    if (group.some(x => reconciliation[`transfer-${x.id}-out`] === "reconciled" || reconciliation[`transfer-${x.id}-in`] === "reconciled")) { window.alert("Está conciliada: deshaz la conciliación primero."); return; }
    if (t.kind === "deposit" && bankTransfers.some(x => (x.distKeys || []).includes(`deposit:${t.id}`))) { window.alert("Ese depósito ya se repartió: borra primero el reparto."); return; }
    const msg = group.length > 1 ? `¿Borrar el reparto completo (${group.length} transferencias, ${fmt(group.reduce((s, x) => s + x.amount, 0))})? Lo cobrado vuelve a quedar por repartir.` : `¿Borrar la transferencia de ${fmt(t.amount)} (${nameOf(t.fromId)} → ${nameOf(t.toId)})?`;
    if (!window.confirm(msg)) return;
    const ids = new Set(group.map(x => x.id));
    setBankTransfers(prev => prev.filter(x => !ids.has(x.id)));
  };

  // ── Reparto de Income ─────────────────────────────────────────────────────
  const openDistribution = () => {
    setErr("");
    const s = suggestDistribution({ pending: bank.pending, supplierShortfall: bank.supplierShortfall, opexShortfall: bank.opexShortfall });
    setDist({ date: todayStr, reserve: s.reserve, suppliers: s.suppliers, opex: s.opex });
  };
  const saveDistribution = () => {
    const amounts = { reserve: Number(dist.reserve) || 0, suppliers: Number(dist.suppliers) || 0, opex: Number(dist.opex) || 0 };
    const sum = amounts.reserve + amounts.suppliers + amounts.opex;
    const incomeBal = summaries[roleAccount(accounts, "income")?.id]?.balance ?? 0;
    if (sum > incomeBal + 0.005 && !window.confirm(`Income tiene ${fmt(incomeBal)} y vas a repartir ${fmt(sum)}. ¿Repartir igual?`)) return;
    const r = buildDistribution({ accounts, amounts, date: dist.date, distKeys: bank.pending.items.map(i => i.key), nextId: nextTransferId(bankTransfers), groupId: `rep-${Date.now()}`, by });
    if (r.error) { setErr(r.error); return; }
    setBankTransfers(prev => [...prev, ...r.transfers]);
    setDist(null); setErr("");
  };

  // ── Retiros (dueño / impuestos de la Reserva, o a caja) ──────────────────
  const saveWithdrawal = () => {
    const amount = Number(wd?.amount) || 0;
    if (!(amount > 0) || !wd.date) { setErr("Indica fecha y monto mayor que 0."); return; }
    if (!wd.accountId) { setErr("Escoge de qué cuenta sale."); return; }
    const category = wd.kind === "reserve" ? "reserve_withdrawal" : "cash_withdrawal";
    setExpenses(prev => [...prev, { id: nxId(prev), category, amount, date: wd.date, paidDate: wd.date, status: "paid", paymentMethod: "transfer", accountId: wd.accountId, tripId: null, truckId: null, supplierId: null,
      description: wd.description || (wd.kind === "reserve" ? "Retiro de la Reserva (dueño / impuestos)" : "Retiro a caja") }]);
    setWd(null); setErr("");
  };

  // ── Conciliación ──────────────────────────────────────────────────────────
  const selMoves = (sel && movements[sel.id]) || [];
  const visible = selMoves.filter(m => filter === "todos" || (filter === "pendientes" ? reconciliation[m.key] !== "reconciled" : filter === "conciliados" ? reconciliation[m.key] === "reconciled" : m.type === filter));
  const toggle = (key) => setBankReconciliation(prev => { const next = { ...(prev || {}) }; if (next[key] === "reconciled") delete next[key]; else next[key] = "reconciled"; return next; });
  const reconcileVisible = () => setBankReconciliation(prev => { const next = { ...(prev || {}) }; visible.forEach(m => { next[m.key] = "reconciled"; }); return next; });

  const inp = { padding: "7px 9px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 14, width: "100%", boxSizing: "border-box" };
  const s = sel ? summaries[sel.id] : null;
  const st = sel ? (ROLE_STYLE[sel.role] || ROLE_STYLE.other) : ROLE_STYLE.other;
  const incomeAcc = roleAccount(accounts, "income"), opexAcc = roleAccount(accounts, "opex"), supAcc = bank.supplierAccount, cashAcc = bank.cash?.account;

  return <div>
    <PageHeader title="Banco" action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Btn onClick={() => openTransfer()} data-bank-transfer><ArrowLeftRight size={14} /> Transferir</Btn>
      <Btn variant="success" onClick={openDistribution} disabled={!bank.pending.items.length} data-bank-distribute><Split size={14} /> Repartir Income</Btn>
      <Btn variant="ghost" onClick={openNewAccount} data-bank-new-account><Plus size={14} /> Cuenta</Btn>
    </div>} />

    {/* ── Lo que hay que hacer ── */}
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
      {bank.pending.items.length > 0 && <div data-bank-alert="income" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${colors.green}50`, background: colors.green + "12", fontSize: 13, flexWrap: "wrap" }}>
        <Inbox size={16} color={colors.green} /><span style={{ flex: 1, minWidth: 200 }}><b>{fmt(bank.pending.total)}</b> en Income por repartir ({bank.pending.items.length} entrada{bank.pending.items.length > 1 ? "s" : ""}): Reserva sugerida {fmt(bank.pending.reserve)}</span>
        <Btn variant="success" onClick={openDistribution} style={{ fontSize: 12 }}>Repartir</Btn>
      </div>}
      {supAcc && bank.debt.total > 0 && <div data-bank-alert="suppliers" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${colors.orange}50`, background: colors.orange + "12", fontSize: 13, flexWrap: "wrap" }}>
        <Store size={16} color={colors.orange} /><span style={{ flex: 1, minWidth: 200 }}>Suplidores: debes <b>{fmt(bank.debt.total)}</b> ({bank.debt.count} factura{bank.debt.count > 1 ? "s" : ""} a crédito) · la cuenta tiene {fmt(bank.supplierBalance)}{bank.supplierShortfall > 0 ? <> · <b style={{ color: colors.orange }}>faltan {fmt(bank.supplierShortfall)}</b></> : " · cubierto ✓"}</span>
        {bank.supplierShortfall > 0 && opexAcc && <Btn variant="warning" onClick={() => openTransfer({ fromId: opexAcc.id, toId: supAcc.id, amount: bank.supplierShortfall, kind: "set_aside" })} style={{ fontSize: 12 }} data-bank-set-aside>Apartar</Btn>}
      </div>}
      {cashAcc && bank.cashBalance > 0 && <div data-bank-alert="cash" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${colors.yellow}50`, background: colors.yellow + "12", fontSize: 13, flexWrap: "wrap" }}>
        <Banknote size={16} color={colors.yellow} /><span style={{ flex: 1, minWidth: 200 }}><b>{fmt(bank.cashBalance)}</b> en efectivo por depositar ({bank.cash.cobroIds.length} cobro{bank.cash.cobroIds.length !== 1 ? "s" : ""} en efectivo)</span>
        {incomeAcc && <Btn variant="ghost" onClick={() => openTransfer({ fromId: cashAcc.id, toId: incomeAcc.id, amount: bank.cashBalance, kind: "deposit" })} style={{ fontSize: 12 }} data-bank-deposit>Depositar</Btn>}
      </div>}
      {(() => { const card = roleAccount(accounts, "card"); const debt = card ? -(bank.summaries[card.id]?.balance || 0) : 0;
        if (card && debt > 0) return <div data-bank-alert="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${colors.red}50`, background: colors.red + "12", fontSize: 13, flexWrap: "wrap" }}>
          <CreditCard size={16} color={colors.red} /><span style={{ flex: 1, minWidth: 200 }}><b>{fmt(debt)}</b> gastado con tarjeta ({card.name}) pendiente de pagar al banco</span>
          {opexAcc && <Btn variant="ghost" onClick={() => openTransfer({ fromId: opexAcc.id, toId: card.id, amount: debt, kind: "card_payment", note: "Pago estado de tarjeta" })} style={{ fontSize: 12 }} data-bank-pay-card-top>Pagar tarjeta</Btn>}
        </div>;
        const cardExp = (expenses || []).filter(e => e.paymentMethod === "credit_card" && e.status === "paid" && !e.accountId && !e.voided).length;
        if (!card && cardExp > 0) return <div data-bank-alert="card-missing" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${colors.orange}50`, background: colors.orange + "12", fontSize: 13, flexWrap: "wrap" }}>
          <CreditCard size={16} color={colors.orange} /><span style={{ flex: 1, minWidth: 200 }}>Hay {cardExp} gasto{cardExp !== 1 ? "s" : ""} con tarjeta que no caen en ninguna cuenta. Crea una cuenta de tipo «Tarjeta de crédito» y entrarán solos.</span>
          <Btn variant="ghost" onClick={() => { setErr(""); setAcctForm({ id: `acc-${Date.now()}`, name: "Tarjeta", role: "card", bank: "", last4: "", openingBalance: 0, openingDate: yesterday, active: true, _new: true }); }} style={{ fontSize: 12 }} data-bank-create-card>Crear cuenta Tarjeta</Btn>
        </div>;
        return null; })()}
    </div>

    {/* ── Cuentas ── */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, marginBottom: 12 }}>
      {active.map(a => { const S = ROLE_STYLE[a.role] || ROLE_STYLE.other; const Icon = S.icon; const sm = summaries[a.id]; const on = sel?.id === a.id;
        return <button key={a.id} onClick={() => setSelId(a.id)} data-bank-account={a.id} style={{ textAlign: "left", padding: "12px 12px", borderRadius: 12, cursor: "pointer", border: `1px solid ${on ? S.color : colors.border}`, background: on ? S.color + "14" : colors.card, color: colors.text, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: S.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}><Icon size={13} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ACCOUNT_ROLES[a.role]?.label || "Cuenta"}</span></div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}{a.last4 ? <span style={{ color: colors.textMuted, fontWeight: 400 }}> ••{a.last4}</span> : null}</div>
          <div data-bank-balance style={{ fontSize: 19, fontWeight: 800, marginTop: 4, color: sm.balance < 0 ? colors.red : colors.text }}>{fmt(sm.balance)}</div>
          <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>conciliado {fmt(sm.reconciled)}</div>
        </button>; })}
    </div>
    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap", fontSize: 12 }}>
      {inactive.length > 0 && <button onClick={() => setShowInactive(v => !v)} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><EyeOff size={12} /> {showInactive ? "Ocultar" : "Ver"} cuentas desactivadas ({inactive.length})</button>}
      <button onClick={() => { setShowPct(v => !v); setPct(pfSettings?.reservePct ?? 20); }} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }} data-bank-pct-toggle><Settings size={12} /> % a Reserva al repartir: {pfSettings?.reservePct ?? 20} %</button>
    </div>
    {showPct && <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: colors.textMuted, display: "flex", flexDirection: "column", gap: 4 }}>% del ingreso real a Reserva (Tax + Profit + Owner's Comp)
          <input type="number" min="0" max="100" value={pct} onChange={e => setPct(e.target.value)} style={{ ...inp, width: 110 }} data-bank-pct /></label>
        <Btn onClick={() => { setPfSettings(prev => ({ ...prev, reservePct: Math.min(100, Math.max(0, Number(pct) || 0)) })); setShowPct(false); }} data-bank-pct-save>Guardar</Btn>
        <span style={{ fontSize: 11, color: colors.textMuted, maxWidth: 420 }}>Se aplica a los cobros que se registren de aquí en adelante. Lo de socios y broker no cuenta como ingreso real: va completo a OpEx, que es de donde se les paga.</span>
      </div>
    </Card>}
    {showInactive && inactive.length > 0 && <Card style={{ marginBottom: 14 }}>
      {inactive.map(a => <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13, borderBottom: `1px solid ${colors.border}22` }}>
        <span style={{ flex: 1 }}>{a.name} <span style={{ color: colors.textMuted, fontSize: 11 }}>{ACCOUNT_ROLES[a.role]?.label} · saldo {fmt(summaries[a.id].balance)}</span></span>
        <button onClick={() => setSelId(a.id)} style={{ background: "none", border: `1px solid ${colors.border}`, color: colors.textMuted, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 11 }}>Ver</button>
        <button onClick={() => setActive(a, true)} style={{ background: "none", border: `1px solid ${colors.green}`, color: colors.green, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}><RotateCcw size={11} /> Reactivar</button>
      </div>)}
    </Card>}

    {/* ── Cuenta escogida: movimientos y conciliación ── */}
    {sel && s && <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }} data-bank-selected={sel.id}><st.icon size={16} color={st.color} /> {sel.name}{sel.active === false && <Badge label="Desactivada" color={colors.textMuted} />}</div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{ACCOUNT_ROLES[sel.role]?.hint}{sel.bank ? ` · ${sel.bank}` : ""}{sel.last4 ? ` ••${sel.last4}` : ""} · saldo {fmt(s.opening)} al cierre del {sel.openingDate}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(sel.role === "reserve" || sel.role === "opex" || sel.role === "other") && sel.active !== false && <Btn variant="ghost" onClick={() => { setErr(""); setWd({ date: todayStr, amount: "", kind: sel.role === "reserve" ? "reserve" : "cash", accountId: sel.id, description: "" }); }} style={{ fontSize: 12 }} data-bank-withdraw><ArrowDownToLine size={13} /> Retiro</Btn>}
          {sel.role === "card" && sel.active !== false && opexAcc && <Btn variant="warning" onClick={() => openTransfer({ fromId: opexAcc.id, toId: sel.id, amount: s.balance < 0 ? -s.balance : "", kind: "card_payment", note: "Pago estado de tarjeta" })} style={{ fontSize: 12 }} data-bank-pay-card><CreditCard size={13} /> Pagar tarjeta{s.balance < 0 ? ` ${fmt(-s.balance)}` : ""}</Btn>}
          <Btn variant="ghost" onClick={() => { setErr(""); setAcctForm({ ...sel }); }} style={{ fontSize: 12 }} data-bank-edit><Pencil size={13} /> Editar</Btn>
          {sel.active !== false && removal?.canDelete && <Btn variant="ghost" onClick={deleteAccount} style={{ fontSize: 12, color: colors.red }} data-bank-delete><Trash2 size={13} /> Borrar</Btn>}
          {sel.active !== false && !removal?.canDelete && <Btn variant="ghost" onClick={() => setActive(sel, false)} style={{ fontSize: 12 }} data-bank-deactivate title={removal?.reason}><EyeOff size={13} /> Desactivar</Btn>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 10, margin: "14px 0" }}>
        {[["Saldo", s.balance, s.balance < 0 ? colors.red : colors.text], ["Conciliado", s.reconciled, colors.accent], ["Entradas por conciliar", s.pendingIn, colors.green], ["Salidas por conciliar", s.pendingOut, colors.orange]].map(([l, v, c]) =>
          <div key={l} style={{ background: colors.inputBg, borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 700 }}>{l.toUpperCase()}</div><div style={{ fontSize: 16, fontWeight: 800, color: c }}>{fmt(v)}</div></div>)}
        <div style={{ background: colors.inputBg, borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 700 }}>SALDO DEL ESTADO DE CUENTA</div>
          <input type="number" placeholder="escríbelo" defaultValue={sel.stmtBalance ?? ""} key={`${sel.id}-${sel.stmtBalance ?? ""}`} onBlur={e => { if (String(e.target.value) !== String(sel.stmtBalance ?? "")) setStatement(sel, e.target.value); }} style={{ ...inp, padding: "4px 6px", marginTop: 2 }} data-bank-stmt />
          {s.stmtDiff != null && <div data-bank-stmt-diff style={{ fontSize: 11, marginTop: 3, fontWeight: 700, color: Math.abs(s.stmtDiff) < 0.01 ? colors.green : colors.red }}>{Math.abs(s.stmtDiff) < 0.01 ? "✓ cuadra con lo conciliado" : `diferencia ${fmt(s.stmtDiff)}`}</div>}
        </div>
      </div>

      {sel.role === "opex" && bank.opexCommitted > 0 && <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>Por pagar desde OpEx (nómina, ayudantes y otros pendientes): <b style={{ color: bank.opexCommitted > s.balance ? colors.red : colors.text }}>{fmt(bank.opexCommitted)}</b>{bank.opexCommitted > s.balance ? ` · faltan ${fmt(bank.opexCommitted - s.balance)}` : ""}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{Object.entries(FILTERS).map(([k, l]) => <button key={k} onClick={() => setFilter(k)} style={{ padding: "4px 11px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: filter === k ? colors.accent : colors.inputBg, color: filter === k ? "white" : colors.textMuted }}>{l}</button>)}</div>
        {visible.some(m => reconciliation[m.key] !== "reconciled") && <button onClick={reconcileVisible} data-bank-reconcile-all style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${colors.green}`, background: "transparent", color: colors.green, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>✓ Conciliar todos los visibles</button>}
      </div>
      {visible.length === 0 ? <div style={{ textAlign: "center", padding: 28, color: colors.textMuted, fontSize: 13 }}>Sin movimientos{filter !== "todos" ? " para este filtro" : ""}.</div>
        : <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Fecha</Th><Th>Descripción</Th><Th align="right">Entrada</Th><Th align="right">Salida</Th><Th align="center">Conciliación</Th><Th align="right"></Th></tr></thead>
          <tbody>{visible.map(m => { const ok = reconciliation[m.key] === "reconciled";
            return <tr key={m.key} data-bank-move={m.key} style={{ borderBottom: `1px solid ${colors.border}11`, opacity: ok ? 0.7 : 1 }}>
              <Td>{m.date}</Td>
              <Td>{m.description}</Td>
              <Td align="right" bold color={colors.green}>{m.type === "in" ? fmt(m.amount) : ""}</Td>
              <Td align="right" bold color={colors.orange}>{m.type === "out" ? fmt(m.amount) : ""}</Td>
              <Td align="center"><button onClick={() => toggle(m.key)} data-bank-reconcile={m.key} style={{ background: "transparent", border: `1px solid ${ok ? colors.textMuted : colors.green}`, color: ok ? colors.textMuted : colors.green, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>{ok ? <><CheckCircle2 size={11} /> Conciliado</> : <><Circle size={11} /> Conciliar</>}</button></Td>
              <Td align="right">{m.source === "transfer" && !ok && <button onClick={() => deleteTransfer(m.refId)} title={m.kind === "distribution" ? "Borrar el reparto" : "Borrar la transferencia"} data-bank-delete-transfer={m.refId} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer", padding: 4 }}><Trash2 size={13} /></button>}</Td>
            </tr>; })}</tbody>
        </table></div>}
    </Card>}

    {/* ── Formularios ── */}
    {acctForm && <Modal title={acctForm._new ? "Nueva cuenta" : `Editar · ${acctForm.name}`} onClose={() => setAcctForm(null)} testId="account">
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
        <Inp label="Nombre" value={acctForm.name} onChange={e => setAcctForm({ ...acctForm, name: e.target.value })} placeholder="Ej. Popular — Income" />
        <Sel label="Tipo" value={acctForm.role} onChange={e => setAcctForm({ ...acctForm, role: e.target.value })}>{Object.entries(ACCOUNT_ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Sel>
        <Inp label="Banco" value={acctForm.bank || ""} onChange={e => setAcctForm({ ...acctForm, bank: e.target.value })} placeholder="opcional" />
        <Inp label="Últimos 4 dígitos" value={acctForm.last4 || ""} onChange={e => setAcctForm({ ...acctForm, last4: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="opcional" />
        <Inp label="Saldo (DOP)" type="number" value={acctForm.openingBalance} onChange={e => setAcctForm({ ...acctForm, openingBalance: e.target.value })} />
        <Inp label="Al cierre del día" type="date" value={acctForm.openingDate} onChange={e => setAcctForm({ ...acctForm, openingDate: e.target.value })} />
        <div style={{ gridColumn: "1 / -1", fontSize: 11, color: colors.textMuted, marginTop: -4 }}>Pon lo que dice el banco al final de ese día (con todo lo de ese día ya incluido). A partir del día siguiente, los cobros, gastos y transferencias registrados lo suben o lo bajan.</div>
      </div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8 }}>{ACCOUNT_ROLES[acctForm.role]?.hint}. Los movimientos de ese día y de antes ya están dentro del saldo que pones; no se vuelven a contar.</div>
      {err && <div style={{ color: colors.red, fontSize: 12, marginTop: 8 }} data-bank-error>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}><Btn variant="ghost" onClick={() => setAcctForm(null)}>Cancelar</Btn><Btn onClick={saveAccount} data-bank-save-account>Guardar</Btn></div>
    </Modal>}

    {tf && <Modal title={tf.kind === "deposit" ? "Depositar efectivo de la caja" : tf.kind === "set_aside" ? "Apartar para suplidores" : tf.kind === "card_payment" ? "Pagar estado de la tarjeta" : "Transferir entre cuentas"} onClose={() => setTf(null)} testId="transfer">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Sel label="Sale de" value={tf.fromId} onChange={e => setTf({ ...tf, fromId: e.target.value })} data-tf-from>{active.map(a => <option key={a.id} value={a.id}>{a.name} ({fmt(summaries[a.id].balance)})</option>)}</Sel>
        <Sel label="Entra a" value={tf.toId} onChange={e => setTf({ ...tf, toId: e.target.value })} data-tf-to>{active.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Sel>
        <Inp label="Monto (DOP)" type="number" value={tf.amount} onChange={e => setTf({ ...tf, amount: e.target.value })} data-tf-amount />
        <Inp label="Fecha" type="date" value={tf.date} onChange={e => setTf({ ...tf, date: e.target.value })} />
      </div>
      <div style={{ marginTop: 10 }}><Inp label="Nota" value={tf.note} onChange={e => setTf({ ...tf, note: e.target.value })} placeholder="opcional" /></div>
      {err && <div style={{ color: colors.red, fontSize: 12, marginTop: 8 }} data-bank-error>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}><Btn variant="ghost" onClick={() => setTf(null)}>Cancelar</Btn><Btn onClick={saveTransfer} data-bank-save-transfer>{tf.kind === "deposit" ? "Depositar" : tf.kind === "set_aside" ? "Apartar" : "Transferir"}</Btn></div>
    </Modal>}

    {dist && <Modal title="Repartir Income" onClose={() => setDist(null)} width={560} testId="distribution">
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>Entró a Income y no se ha repartido: <b style={{ color: colors.text }}>{fmt(bank.pending.total)}</b> · Income tiene {fmt(summaries[incomeAcc?.id]?.balance ?? 0)}</div>
      <div style={{ maxHeight: 160, overflowY: "auto", border: `1px solid ${colors.border}`, borderRadius: 8, marginBottom: 12 }}>
        {bank.pending.items.map(i => { const c = i.kind === "cobro" ? cobros.find(x => x.id === i.refId) : null; const inv = c ? invoices.find(x => x.id === c.invoiceId) : null;
          return <div key={i.key} style={{ display: "flex", gap: 8, padding: "5px 10px", fontSize: 12, borderBottom: `1px solid ${colors.border}22` }}>
            <span style={{ color: colors.textMuted }}>{i.date}</span><span style={{ flex: 1 }}>{i.kind === "cobro" ? `Cobro ${inv?.invoiceNumber || `#${i.refId}`}` : "Depósito de caja"}</span>
            <span style={{ color: PURPLE }}>reserva {fmt(i.reserve)}</span><b>{fmt(i.amount)}</b></div>; })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
        <Inp label={`→ ${nameOf(roleAccount(accounts, "reserve")?.id)}`} type="number" value={dist.reserve} onChange={e => setDist({ ...dist, reserve: e.target.value })} data-dist-reserve />
        <Inp label={`→ ${supAcc ? supAcc.name : "Suplidores (no hay)"}`} type="number" value={dist.suppliers} onChange={e => setDist({ ...dist, suppliers: e.target.value })} disabled={!supAcc} data-dist-suppliers />
        <Inp label={`→ ${nameOf(opexAcc?.id)}`} type="number" value={dist.opex} onChange={e => setDist({ ...dist, opex: e.target.value })} data-dist-opex />
      </div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8 }}>
        Sugerido: Reserva = {pfSettings?.reservePct ?? 20} % del ingreso real de cada cobro; lo de socios y broker va a OpEx (de ahí se les paga).{bank.opexShortfall > 0 ? ` OpEx necesita ${fmt(bank.opexShortfall)} para lo que ya debe pagar (nómina y pendientes): eso va primero.` : ""}{bank.supplierShortfall > 0 ? ` A Suplidores le faltan ${fmt(bank.supplierShortfall)}: se aparta de lo que sobre.` : ""}
        {(() => { const sum = (Number(dist.reserve) || 0) + (Number(dist.suppliers) || 0) + (Number(dist.opex) || 0); const left = Math.round((bank.pending.total - sum) * 100) / 100;
          return Math.abs(left) >= 0.01 ? <div style={{ marginTop: 4, color: left > 0 ? colors.orange : colors.red, fontWeight: 700 }} data-dist-left>{left > 0 ? `Quedan ${fmt(left)} en Income` : `Repartes ${fmt(-left)} más de lo que entró`}</div> : null; })()}
      </div>
      <div style={{ marginTop: 10, maxWidth: 200 }}><Inp label="Fecha" type="date" value={dist.date} onChange={e => setDist({ ...dist, date: e.target.value })} /></div>
      {err && <div style={{ color: colors.red, fontSize: 12, marginTop: 8 }} data-bank-error>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}><Btn variant="ghost" onClick={() => setDist(null)}>Cancelar</Btn><Btn variant="success" onClick={saveDistribution} data-bank-save-distribution>Repartir</Btn></div>
    </Modal>}

    {wd && <Modal title="Retiro" onClose={() => setWd(null)} testId="withdrawal">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Sel label="Tipo" value={wd.kind} onChange={e => setWd({ ...wd, kind: e.target.value, accountId: e.target.value === "reserve" ? (roleAccount(accounts, "reserve")?.id || wd.accountId) : wd.accountId })} data-wd-kind><option value="reserve">Dueño / impuestos (de la Reserva)</option><option value="cash">A caja chica (efectivo para gastos)</option></Sel>
        <Sel label="Sale de" value={wd.accountId} onChange={e => setWd({ ...wd, accountId: e.target.value })}>{active.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</Sel>
        <Inp label="Monto (DOP)" type="number" value={wd.amount} onChange={e => setWd({ ...wd, amount: e.target.value })} data-wd-amount />
        <Inp label="Fecha" type="date" value={wd.date} onChange={e => setWd({ ...wd, date: e.target.value })} />
      </div>
      <div style={{ marginTop: 10 }}><Inp label="Concepto" value={wd.description} onChange={e => setWd({ ...wd, description: e.target.value })} placeholder="opcional" /></div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8 }}>A caja chica: es efectivo para gastos del día a día (no es la Caja de cobros). Dueño / impuestos: Profit First, solo retiros planificados.</div>
      {err && <div style={{ color: colors.red, fontSize: 12, marginTop: 8 }} data-bank-error>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}><Btn variant="ghost" onClick={() => setWd(null)}>Cancelar</Btn><Btn onClick={saveWithdrawal} data-bank-save-withdrawal>Guardar</Btn></div>
    </Modal>}
  </div>;
}

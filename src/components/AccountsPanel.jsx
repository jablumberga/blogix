import { useMemo } from "react";
import { Inbox, Wallet, PiggyBank, Store, Banknote, Landmark, ChevronRight } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, today } from "../utils/helpers.js";
import { bankOverview, activeAccounts, ACCOUNT_ROLES } from "../utils/bankAccounts.js";

const ICON = { income: [Inbox, colors.green], opex: [Wallet, colors.cyan], reserve: [PiggyBank, "#9b7fe8"], suppliers: [Store, colors.orange], cash: [Banknote, colors.yellow], other: [Landmark, colors.accent] };

/** Resumen de las cuentas del Banco (saldos reales) y lo que hay que hacer: repartir, apartar para suplidores, depositar la caja. */
export default function AccountsPanel({ bankAccount, expenses = [], cobros = [], bankTransfers = [], bankReconciliation = {}, pfSettings, setPage, compact = false, isMobile }) {
  const b = useMemo(() => bankOverview({ bankAccount, expenses, cobros, transfers: bankTransfers, reconciliation: bankReconciliation || {}, settings: pfSettings, todayStr: today() }),
    [bankAccount, expenses, cobros, bankTransfers, bankReconciliation, pfSettings]);
  const acc = activeAccounts(b.accounts);
  const todo = [
    b.pending.items.length > 0 && [`${fmt(b.pending.total)} en Income por repartir`, colors.green],
    b.supplierShortfall > 0 && [`Suplidores: faltan ${fmt(b.supplierShortfall)} por apartar`, colors.orange],
    b.cashBalance > 0 && [`${fmt(b.cashBalance)} en efectivo por depositar`, colors.yellow],
    b.opexCommitted > b.opexBalance && [`OpEx no cubre lo pendiente: faltan ${fmt(b.opexCommitted - b.opexBalance)}`, colors.red],
  ].filter(Boolean);
  return <div data-accounts-panel style={{ marginBottom: 16, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14, cursor: setPage ? "pointer" : "default" }} onClick={() => setPage?.("banco")}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, letterSpacing: ".06em" }}>CUENTAS DEL BANCO</div>
      {setPage && <span style={{ fontSize: 12, color: colors.accent, display: "flex", alignItems: "center", gap: 2 }}>Banco <ChevronRight size={13} /></span>}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${Math.min(acc.length, compact ? 5 : 6)}, minmax(0, 1fr))`, gap: 8 }}>
      {acc.map(a => { const [Icon, c] = ICON[a.role] || ICON.other; const bal = b.summaries[a.id].balance;
        return <div key={a.id} data-panel-account={a.id} style={{ background: colors.inputBg, borderRadius: 8, padding: "8px 10px", minWidth: 0 }}>
          <div style={{ fontSize: 10, color: c, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}><Icon size={11} /> {a.name}</div>
          <div style={{ fontSize: compact ? 15 : 17, fontWeight: 800, color: bal < 0 ? colors.red : colors.text }}>{fmt(bal)}</div>
          {!compact && <div style={{ fontSize: 9, color: colors.textMuted }}>{ACCOUNT_ROLES[a.role]?.label}</div>}
        </div>; })}
    </div>
    {todo.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>{todo.map(([t, c]) => <span key={t} data-panel-todo style={{ fontSize: 11, fontWeight: 600, color: c, background: c + "16", border: `1px solid ${c}40`, borderRadius: 12, padding: "3px 9px" }}>{t}</span>)}</div>}
  </div>;
}

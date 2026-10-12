import { useMemo, useState } from "react";
import { PiggyBank, Wallet, TrendingUp, AlertTriangle, Settings } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt } from "../utils/helpers.js";
import { accountBalances, monthlyAllocations, DEFAULT_PF_SETTINGS } from "../utils/profitFirst.js";

export const PF_PURPLE = "#9b7fe8";

function Account({ icon: Icon, label, value, color, lines = [] }) {
  return <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${color}44`, flex: 1, minWidth: 180 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, color, letterSpacing: ".04em" }}><Icon size={12} /> {label}</div>
    <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 2 }}>{fmt(value)}</div>
    {lines.map(([k, v, c], i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: colors.textMuted, marginTop: 2 }}><span>{k}</span><span style={{ color: c || colors.text, fontWeight: 600 }}>{typeof v === "number" ? fmt(v) : v}</span></div>)}
  </div>;
}

/**
 * Las tres cuentas Profit First: INCOME → RESERVA (20 %) + OPEX (80 %).
 * `compact` muestra solo las tres cuentas; sin él, también el mes y los ajustes.
 */
export default function ProfitFirstPanel({ cobros = [], expenses = [], pfSettings = DEFAULT_PF_SETTINGS, setPfSettings, setBankAccount, compact = false, isMobile }) {
  const b = useMemo(() => accountBalances({ cobros, expenses, settings: pfSettings }), [cobros, expenses, pfSettings]);
  const months = useMemo(() => monthlyAllocations({ cobros, settings: pfSettings }), [cobros, pfSettings]);
  const thisMonth = months[months.length - 1];
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ reservePct: pfSettings.reservePct, startDate: pfSettings.startDate || "", opening: (Number(pfSettings.openingReserve) || 0) + (Number(pfSettings.openingOpex) || 0), openingReserve: pfSettings.openingReserve || 0 });
  const pct = Number(pfSettings.reservePct) || 0;

  return <div style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: PF_PURPLE, letterSpacing: ".06em" }}>PROFIT FIRST · {pct} % RESERVA / {100 - pct} % OPEX{pfSettings.startDate ? ` · desde ${pfSettings.startDate}` : " · sin fecha de arranque"}{b.opening ? ` · balance inicial ${fmt(b.opening)}` : ""}</div>
      {setPfSettings && <button onClick={() => setEditing(e => !e)} style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.textMuted, borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Settings size={11} /> Ajustes</button>}
    </div>
    {editing && <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, color: colors.textMuted }}>% a Reserva (owner's comp + profit + tax)<input type="number" min="0" max="100" value={form.reservePct} onChange={e => setForm({ ...form, reservePct: e.target.value })} style={{ width: 90, padding: "5px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text }} /></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, color: colors.textMuted }}>Fecha de arranque<input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text }} /></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, color: colors.textMuted }}>Balance inicial en banco (ese día)<input type="number" min="0" value={form.opening} onChange={e => setForm({ ...form, opening: e.target.value })} style={{ width: 130, padding: "5px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text }} /></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, color: colors.textMuted }}>De ese balance, Reserva<input type="number" min="0" value={form.openingReserve} onChange={e => setForm({ ...form, openingReserve: e.target.value })} style={{ width: 110, padding: "5px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text }} /></label>
      <span style={{ fontSize: 11, color: colors.cyan, alignSelf: "center" }}>OpEx inicial: {fmt(Math.max(0, (Number(form.opening) || 0) - (Number(form.openingReserve) || 0)))}</span>
      <button onClick={() => {
        const opening = Math.max(0, Number(form.opening) || 0), openingReserve = Math.min(opening, Math.max(0, Number(form.openingReserve) || 0));
        setPfSettings({ reservePct: Math.min(100, Math.max(0, Number(form.reservePct) || 0)), startDate: form.startDate || null, openingReserve, openingOpex: opening - openingReserve });
        if (setBankAccount) setBankAccount(prev => ({ ...(prev || {}), openingBalance: opening, openingDate: form.startDate || prev?.openingDate }));
        setEditing(false);
      }} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: colors.green, color: "white", fontWeight: 700, cursor: "pointer" }}>Guardar</button>
      <span style={{ fontSize: 10, color: colors.textMuted, width: "100%" }}>Todo lo anterior a la fecha de arranque queda fuera de las cuentas. El balance inicial es el primer movimiento en Banco y arranca Reserva y OpEx; los cobros ya repartidos conservan su reparto.</span>
    </div>}
    <div style={{ display: "flex", gap: 12, flexWrap: isMobile ? "wrap" : "nowrap" }}>
      <Account icon={TrendingUp} label="INCOME · COBRADO" value={b.income} color={colors.green}
        lines={[["Ingreso real (tuyo)", b.real], ["Apartado socios/broker", b.passThrough, colors.orange], ...(b.passThroughPending > 0 ? [["Pendiente de transferir", b.passThroughPending, colors.orange]] : [])]} />
      <Account icon={PiggyBank} label={`RESERVA · ${pct} %`} value={b.reserve} color={PF_PURPLE}
        lines={[["Owner's comp + profit + tax", "no se toca"], ...(b.openingReserve ? [["Balance inicial", b.openingReserve]] : []), ...(thisMonth ? [[`Este mes (${thisMonth.month})`, thisMonth.reserve]] : []), ...(b.reserveOut ? [["Retirado (dueño / impuestos)", b.reserveOut, colors.orange]] : [])]} />
      <Account icon={Wallet} label="OPEX · DISPONIBLE" value={b.opexAvailable} color={b.opexAvailable >= 0 ? colors.cyan : colors.red}
        lines={[...(b.openingOpex ? [["Balance inicial", b.openingOpex]] : []), ["Entró (80 % de lo real)", b.opexIn - b.openingOpex], ["Pagado", b.opexOut, colors.orange], ["Compromisos pendientes", b.opexCommitted, b.opexCommitted > b.opexAvailable ? colors.red : colors.textMuted], ["Después de compromisos", b.opexAfterCommitments, b.opexAfterCommitments >= 0 ? colors.green : colors.red]]} />
    </div>
    {b.opexAfterCommitments < 0 && <div style={{ marginTop: 10, background: colors.red + "15", border: `1px solid ${colors.red}40`, borderRadius: 10, padding: "8px 12px", fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
      <AlertTriangle size={14} color={colors.red} /><span><b style={{ color: colors.red }}>OpEx no cubre los compromisos</b> (faltan {fmt(-b.opexAfterCommitments)}). Profit First: la Reserva no se toca; cobra CxC, renegocia plazos o recorta operación.</span>
    </div>}
    {!compact && months.length > 1 && <div style={{ marginTop: 12, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "10px 14px" }}>
      <div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 700, marginBottom: 6 }}>POR MES</div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ color: colors.textMuted, fontSize: 10 }}><th style={{ textAlign: "left", padding: 4 }}>Mes</th><th style={{ textAlign: "right", padding: 4 }}>Cobrado</th><th style={{ textAlign: "right", padding: 4 }}>Pass-through</th><th style={{ textAlign: "right", padding: 4 }}>Real</th><th style={{ textAlign: "right", padding: 4, color: PF_PURPLE }}>Reserva</th><th style={{ textAlign: "right", padding: 4, color: colors.cyan }}>OpEx</th></tr></thead>
        <tbody>{months.slice(-6).reverse().map(m => <tr key={m.month} style={{ borderTop: `1px solid ${colors.border}22` }}><td style={{ padding: 4 }}>{m.month}</td><td style={{ padding: 4, textAlign: "right" }}>{fmt(m.income)}</td><td style={{ padding: 4, textAlign: "right", color: colors.orange }}>{fmt(m.passThrough)}</td><td style={{ padding: 4, textAlign: "right" }}>{fmt(m.real)}</td><td style={{ padding: 4, textAlign: "right", color: PF_PURPLE, fontWeight: 600 }}>{fmt(m.reserve)}</td><td style={{ padding: 4, textAlign: "right", color: colors.cyan, fontWeight: 600 }}>{fmt(m.opex)}</td></tr>)}</tbody>
      </table></div>
    </div>}
  </div>;
}

import { useState } from "react";
import { X } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, today } from "../utils/helpers.js";
import { Inp, Sel, Btn } from "./ui/index.jsx";
import { COBRO_METHODS } from "../utils/cobros.js";

/** Registrar un cobro (abono total o parcial) a una factura. */
export default function CobroModal({ inv, balance, paid = 0, amount = 0, onSave, onClose }) {
  const [form, setForm] = useState({ date: today(), amount: balance, method: "transfer", reference: "", note: "" });
  const [err, setErr] = useState("");
  const submit = () => {
    const amt = Number(form.amount) || 0;
    if (!form.date) { setErr("Indica la fecha del cobro."); return; }
    if (!(amt > 0)) { setErr("El monto debe ser mayor que 0."); return; }
    if (amt > balance + 0.005) { setErr(`El monto supera el saldo pendiente (${fmt(balance)}).`); return; }
    onSave({ ...form, amount: amt });
  };
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 18, width: "100%", maxWidth: 440 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div><div style={{ fontWeight: 700, fontSize: 15 }}>Registrar cobro · {inv.invoiceNumber || `#${inv.id}`}</div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>Factura {fmt(amount)} · cobrado {fmt(paid)} · <b style={{ color: colors.orange }}>saldo {fmt(balance)}</b></div></div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer" }}><X size={16} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Inp label="Fecha" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        <Inp label="Monto (DOP)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
        <Sel label="Método" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>{Object.entries(COBRO_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Sel>
        <Inp label="Referencia / nº" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="opcional" />
      </div>
      <div style={{ marginTop: 10 }}><Inp label="Nota" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="opcional" /></div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, fontSize: 11 }}>
        <button onClick={() => setForm({ ...form, amount: balance })} style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.textMuted, borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Saldo completo</button>
        <button onClick={() => setForm({ ...form, amount: Math.round(balance / 2) })} style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.textMuted, borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>Mitad</button>
      </div>
      {err && <div style={{ color: colors.red, fontSize: 12, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn onClick={submit}>Registrar cobro</Btn></div>
    </div>
  </div>;
}

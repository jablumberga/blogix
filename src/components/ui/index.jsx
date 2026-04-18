import { useState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { colors } from "../../constants/theme.js";
import { DR_PROVINCES } from "../../constants/destinations.js";

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style }) {
  return (
    <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.border}`, padding: 16, ...style }}>
      {children}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ icon: Icon, label, value, color = colors.accent, sub }) {
  return (
    <Card style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ color: colors.textMuted, fontSize: 11, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: colors.textMuted }}>{sub}</div>}
      </div>
    </Card>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Inp({ label, ...p }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {label && <label style={{ fontSize: 11, color: colors.textMuted, fontWeight: 500 }}>{label}</label>}
      <input
        {...p}
        style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 13, outline: "none", ...(p.style || {}) }}
      />
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
export function Sel({ label, children, ...p }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {label && <label style={{ fontSize: 11, color: colors.textMuted, fontWeight: 500 }}>{label}</label>}
      <select
        {...p}
        style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 13, outline: "none", ...(p.style || {}) }}
      >
        {children}
      </select>
    </div>
  );
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────
export function Chk({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
      <div
        onClick={onChange}
        style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? colors.accent : colors.border}`, background: checked ? colors.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        {checked && <CheckCircle2 size={12} color="white" />}
      </div>
      <span>{label}</span>
    </label>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function Btn({ children, variant = "primary", ...p }) {
  const s = {
    primary: { background: colors.accent, color: "white" },
    danger:  { background: colors.red, color: "white" },
    ghost:   { background: "transparent", color: colors.textMuted, border: `1px solid ${colors.border}` },
    success: { background: colors.green, color: "white" },
    warning: { background: colors.orange, color: "white" },
  };
  return (
    <button
      {...p}
      style={{ padding: "7px 14px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, ...s[variant], ...(p.style || {}) }}
    >
      {children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ label, color, icon: Icon }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600, background: color + "18", color }}>
      {Icon && <Icon size={10} />} {label}
    </span>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status, t }) {
  const m = {
    delivered:  { c: colors.green,  l: t.delivered },
    in_transit: { c: colors.yellow, l: t.inTransit },
    pending:    { c: colors.accent, l: t.pending },
    cancelled:  { c: colors.red,    l: t.cancelled },
  };
  const s = m[status] || m.pending;
  return <Badge label={s.l} color={s.c} />;
}

// ─── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({ title, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{title}</h1>
      {action}
    </div>
  );
}

// ─── Table Cells ─────────────────────────────────────────────────────────────
export function Th({ children, align = "left" }) {
  return (
    <th style={{ textAlign: align, padding: "8px 4px", color: colors.textMuted, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}

export function Td({ children, align = "left", bold, color: c }) {
  return (
    <td style={{ padding: "10px 4px", textAlign: align, fontWeight: bold ? 600 : 400, color: c || colors.text, fontSize: 13 }}>
      {children}
    </td>
  );
}

// ─── DateFilter ───────────────────────────────────────────────────────────────
export function DateFilter({ t, onFilter }) {
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState("thisMonth");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const apply = (m) => {
    setMode(m);
    const now = new Date();
    let f, to2;
    if (m === "today") {
      f = todayStr(); to2 = todayStr();
    } else if (m === "thisWeek") {
      const d = new Date(); d.setDate(d.getDate() - d.getDay()); f = d.toISOString().slice(0, 10); to2 = todayStr();
    } else if (m === "thisMonth") {
      f = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; to2 = todayStr();
    } else {
      f = from; to2 = to;
    }
    onFilter(f, to2);
  };

  useEffect(() => { apply("thisMonth"); }, []);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {["today", "thisWeek", "thisMonth", "custom"].map(m => (
        <button
          key={m} onClick={() => apply(m)}
          style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${mode === m ? colors.accent : colors.border}`, background: mode === m ? colors.accent + "18" : "transparent", color: mode === m ? colors.accentLight : colors.textMuted, cursor: "pointer", fontSize: 11, fontWeight: 500 }}
        >
          {t[m]}
        </button>
      ))}
      {mode === "custom" && (
        <>
          <Inp type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ fontSize: 11, padding: "4px 8px" }} />
          <span style={{ color: colors.textMuted }}>→</span>
          <Inp type="date" value={to} onChange={e => setTo(e.target.value)} style={{ fontSize: 11, padding: "4px 8px" }} />
          <Btn onClick={() => apply("custom")} style={{ padding: "4px 10px", fontSize: 11 }}>{t.apply}</Btn>
        </>
      )}
    </div>
  );
}

// ─── DestinationSelect ────────────────────────────────────────────────────────
export function DestinationSelect({ t, province, municipality, onProvinceChange, onMunicipalityChange }) {
  const prov = DR_PROVINCES.find(p => p.province === province);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <Sel label={t.province} value={province} onChange={e => onProvinceChange(e.target.value)}>
        <option value="">--</option>
        {DR_PROVINCES.map(p => <option key={p.province} value={p.province}>{p.province}</option>)}
      </Sel>
      <Sel label={t.municipality} value={municipality} onChange={e => onMunicipalityChange(e.target.value)}>
        <option value="">--</option>
        {prov && prov.municipalities.map(m => <option key={m} value={m}>{m}</option>)}
      </Sel>
    </div>
  );
}

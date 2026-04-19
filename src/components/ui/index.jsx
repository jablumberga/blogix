import { useState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { colors, radius, font, space } from "../../constants/theme.js";
import { DR_PROVINCES } from "../../constants/destinations.js";

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style, onClick }) {
  const [hovered, setHovered] = useState(false);
  const isClickable = !!onClick;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => isClickable && setHovered(true)}
      onMouseLeave={() => isClickable && setHovered(false)}
      style={{
        background: hovered ? colors.cardHover : colors.card,
        borderRadius: radius.lg,
        border: `1px solid ${hovered ? colors.border : colors.border}`,
        padding: space.lg,
        transition: "background 0.15s",
        cursor: isClickable ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ icon: Icon, label, value, color = colors.accent, sub }) {
  return (
    <Card style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: radius.md, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ color: colors.textMuted, fontSize: font.xs, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: font.xl, fontWeight: 700 }}>{value}</div>
        {sub && <div style={{ fontSize: font.xs, color: colors.textMuted }}>{sub}</div>}
      </div>
    </Card>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Inp({ label, ...p }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {label && <label style={{ fontSize: font.xs, color: colors.textMuted, fontWeight: 500 }}>{label}</label>}
      <input
        {...p}
        onFocus={e => {
          e.target.style.borderColor = colors.accent;
          e.target.style.boxShadow  = `0 0 0 3px ${colors.accent}22`;
          p.onFocus?.(e);
        }}
        onBlur={e => {
          e.target.style.borderColor = colors.border;
          e.target.style.boxShadow   = "none";
          p.onBlur?.(e);
        }}
        style={{
          padding: "9px 12px",
          borderRadius: radius.sm,
          border: `1px solid ${colors.border}`,
          background: colors.inputBg,
          color: colors.text,
          fontSize: 16, // ≥16px prevents iOS Safari viewport zoom on focus
          outline: "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
          width: "100%",
          boxSizing: "border-box",
          ...(p.style || {}),
        }}
      />
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
export function Sel({ label, children, ...p }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {label && <label style={{ fontSize: font.xs, color: colors.textMuted, fontWeight: 500 }}>{label}</label>}
      <select
        {...p}
        onFocus={e => {
          e.target.style.borderColor = colors.accent;
          e.target.style.boxShadow   = `0 0 0 3px ${colors.accent}22`;
          p.onFocus?.(e);
        }}
        onBlur={e => {
          e.target.style.borderColor = colors.border;
          e.target.style.boxShadow   = "none";
          p.onBlur?.(e);
        }}
        style={{
          padding: "9px 12px",
          borderRadius: radius.sm,
          border: `1px solid ${colors.border}`,
          background: colors.inputBg,
          color: colors.text,
          fontSize: 16, // ≥16px prevents iOS Safari viewport zoom on focus
          outline: "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
          ...(p.style || {}),
        }}
      >
        {children}
      </select>
    </div>
  );
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────
export function Chk({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: font.base, userSelect: "none" }}>
      <div style={{ position: "relative", width: 18, height: 18, flexShrink: 0 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", margin: 0, cursor: "pointer" }}
        />
        <div style={{
          width: 18, height: 18,
          borderRadius: radius.sm,
          border: `2px solid ${checked ? colors.accent : colors.border}`,
          background: checked ? colors.accent : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
          transition: "border-color 0.15s, background 0.15s",
        }}>
          {checked && <CheckCircle2 size={11} color="white" />}
        </div>
      </div>
      {label && <span>{label}</span>}
    </label>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function Btn({ children, variant = "primary", ...p }) {
  const s = {
    primary: { background: colors.accent,  color: "white" },
    danger:  { background: colors.red,     color: "white" },
    ghost:   { background: "transparent",  color: colors.textMuted, border: `1px solid ${colors.border}` },
    success: { background: colors.green,   color: "white" },
    warning: { background: colors.orange,  color: "white" },
  };
  return (
    <button
      type={p.type || "button"}
      {...p}
      onMouseEnter={e => { if (!p.disabled) e.currentTarget.style.opacity = "0.85"; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
      onMouseDown={e => { if (!p.disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
      style={{
        padding: "9px 16px",
        borderRadius: radius.md,
        border: "none",
        fontSize: font.sm,
        fontWeight: 600,
        cursor: p.disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 36,
        transition: "opacity 0.15s, transform 0.1s",
        userSelect: "none",
        opacity: p.disabled ? 0.45 : 1,
        ...s[variant],
        ...(p.style || {}),
      }}
    >
      {children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ label, color, icon: Icon }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: radius.xl, fontSize: font.xs, fontWeight: 600, background: color + "18", color }}>
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
      <h1 style={{ fontSize: font.xxl, fontWeight: 700, margin: 0 }}>{title}</h1>
      {action}
    </div>
  );
}

// ─── Table Cells ─────────────────────────────────────────────────────────────
export function Th({ children, align = "left" }) {
  return (
    <th style={{
      textAlign: align,
      padding: "10px 12px",
      color: colors.textMuted,
      fontSize: font.xs,
      fontWeight: 600,
      whiteSpace: "nowrap",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    }}>
      {children}
    </th>
  );
}

export function Td({ children, align = "left", bold, color: c }) {
  return (
    <td style={{ padding: "11px 12px", textAlign: align, fontWeight: bold ? 600 : 400, color: c || colors.text, fontSize: font.base }}>
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
          type="button"
          key={m} onClick={() => apply(m)}
          style={{ padding: "5px 12px", borderRadius: radius.xl, border: `1px solid ${mode === m ? colors.accent : colors.border}`, background: mode === m ? colors.accent + "18" : "transparent", color: mode === m ? colors.accentLight : colors.textMuted, cursor: "pointer", fontSize: font.xs, fontWeight: 500 }}
        >
          {t[m]}
        </button>
      ))}
      {mode === "custom" && (
        <>
          <Inp type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ fontSize: font.xs, padding: "5px 8px" }} />
          <span style={{ color: colors.textMuted }}>→</span>
          <Inp type="date" value={to} onChange={e => setTo(e.target.value)} style={{ fontSize: font.xs, padding: "5px 8px" }} />
          <Btn onClick={() => apply("custom")} style={{ padding: "5px 12px", fontSize: font.xs }}>{t.apply}</Btn>
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

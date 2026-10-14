import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { colors } from "../constants/theme.js";

/** Selector «Ordenar por» + botón de dirección. options: [{ key, label }] ; value: { key, dir } */
export default function SortBar({ options = [], value, onChange, style }) {
  const dirLabel = value.dir === "desc" ? "Descendente (más reciente / mayor primero)" : "Ascendente (más antiguo / menor primero)";
  return <div style={{ display: "flex", alignItems: "center", gap: 4, ...style }} data-sort-bar>
    <span style={{ fontSize: 10, color: colors.textMuted, whiteSpace: "nowrap" }}>Ordenar por</span>
    <select value={value.key} onChange={e => onChange({ ...value, key: e.target.value })} data-sort-key
      style={{ fontSize: 11, padding: "4px 8px", borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text }}>
      {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
    <button type="button" onClick={() => onChange({ ...value, dir: value.dir === "desc" ? "asc" : "desc" })} title={dirLabel} data-sort-dir
      style={{ display: "flex", alignItems: "center", padding: "4px 7px", borderRadius: 8, border: `1px solid ${colors.border}`, background: "transparent", color: colors.text, cursor: "pointer" }}>
      {value.dir === "desc" ? <ArrowDownWideNarrow size={13} /> : <ArrowUpNarrowWide size={13} />}
    </button>
  </div>;
}

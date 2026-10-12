import { colors } from "../constants/theme.js";
import { activeAyudantes, normalizeAyudante } from "../utils/ayudantes.js";
import { Inp, Sel } from "./ui/index.jsx";

/**
 * Casillas de ayudantes de un viaje (Viajes y panel del chofer).
 * Cada casilla: un ayudante de la lista (directo o por el chofer) u «Otro» con el nombre escrito (se paga por el chofer).
 * Sin lista de ayudantes, solo se escribe el nombre, igual que antes.
 */
export default function HelperSlots({ n, helperIds = [], helperNames = [], ayudantes = [], onChange, labelPrefix = "Ayudante", prevLines = [] }) {
  const list = activeAyudantes(ayudantes);
  const all = (ayudantes || []).map(normalizeAyudante); // incluye inactivos que ya estaban en el viaje
  const ids = Array.from({ length: n }, (_, i) => (helperIds?.[i] != null && helperIds[i] !== "" ? Number(helperIds[i]) : null));
  const names = Array.from({ length: n }, (_, i) => helperNames?.[i] || "");
  const set = (i, patch) => {
    const nextIds = [...ids], nextNames = [...names];
    if ("id" in patch) { nextIds[i] = patch.id; const a = all.find(x => x.id === patch.id); nextNames[i] = a ? a.name : ""; }
    if ("name" in patch) nextNames[i] = patch.name;
    onChange({ helperIds: nextIds, helperNames: nextNames });
  };
  if (n <= 0) return null;
  if (list.length === 0) {
    return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginTop: 8 }}>
      {Array.from({ length: n }, (_, i) => <Inp key={i} label={`Nombre ${labelPrefix.toLowerCase()} ${i + 1} (opcional)`} value={names[i]} onChange={e => set(i, { name: e.target.value })} style={{ fontSize: 11 }} />)}
    </div>;
  }
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
    {Array.from({ length: n }, (_, i) => {
      const chosen = all.find(a => a.id === ids[i]);
      return <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Sel label={`${labelPrefix} ${i + 1}`} value={ids[i] ?? ""} onChange={e => set(i, { id: e.target.value ? Number(e.target.value) : null })} data-helper-slot={i}>
          <option value="">Otro (escribir nombre)</option>
          {[...list, ...(chosen && (chosen.status === "inactive" || chosen.status === "deleted") ? [chosen] : [])].filter(a => a.id === ids[i] || !ids.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}{a.payMode === "direct" ? " · directo" : ""}</option>)}
        </Sel>
        {chosen
          ? (() => { const fr = (prevLines || [])[i]; const direct = fr && fr.ayudanteId != null && Number(fr.ayudanteId) === chosen.id && typeof fr.direct === "boolean" ? fr.direct : chosen.payMode === "direct";
              return <span style={{ fontSize: 10, color: direct ? colors.cyan : colors.textMuted }}>{direct ? "Se le paga directo (su propia nómina)" : "Se le paga por el chofer"}</span>; })()
          : <Inp value={names[i]} placeholder="Nombre (opcional) · se paga por el chofer" onChange={e => set(i, { name: e.target.value })} style={{ fontSize: 11 }} />}
      </div>;
    })}
  </div>;
}

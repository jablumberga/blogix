import { useCallback, useEffect, useState } from "react";
import { Camera, Trash2, RotateCw } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt } from "../utils/helpers.js";
import { listReceipts, deleteReceipt, notifyReceiptsChanged } from "../utils/receiptsApi.js";
import { Card, Badge } from "./ui/index.jsx";
import ReceiptPhoto from "./ReceiptPhoto.jsx";

const CAT = { fuel: "Combustible", toll: "Peaje", tire: "Gomas", repair: "Reparación", maintenance: "Mantenimiento", other: "Otro" };
const STATUS = { pending: ["Por revisar", colors.yellow], approved: ["Aprobado", colors.green], rejected: ["Rechazado", colors.red] };

/** Recibos que subió el chofer, con su estado (por revisar / aprobado / rechazado y por qué). */
export default function MyReceipts({ onNew }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    setError("");
    listReceipts().then(r => setList(r.receipts || [])).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener("blogix:receipts-changed", h);
    return () => window.removeEventListener("blogix:receipts-changed", h);
  }, [load]);

  const remove = async (r) => {
    if (!window.confirm("¿Borrar este recibo? (todavía no lo ha revisado la oficina)")) return;
    try { await deleteReceipt(r.id); notifyReceiptsChanged(); } catch (e) { window.alert(e.message); }
  };

  return <Card style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
      <h3 style={{ margin: 0, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}><Camera size={16} color={colors.orange} /> Mis recibos</h3>
      <button onClick={load} title="Actualizar" style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", minWidth: 44, minHeight: 44 }}><RotateCw size={14} /></button>
    </div>
    {error && <div style={{ color: colors.red, fontSize: 12 }}>{error}</div>}
    {list && list.length === 0 && <div style={{ fontSize: 12, color: colors.textMuted }}>Todavía no has subido recibos. <button onClick={onNew} style={{ background: "none", border: "none", color: colors.accent, cursor: "pointer", padding: 0, fontSize: 12 }}>Subir el primero</button></div>}
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-my-receipts>
      {(list || []).slice(0, 12).map(r => {
        const f = r.fields || {};
        const [label, color] = STATUS[r.status] || STATUS.pending;
        return <div key={r.id} data-receipt-row={r.id} data-status={r.status} style={{ display: "flex", gap: 10, alignItems: "center", padding: 8, borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.inputBg }}>
          <ReceiptPhoto id={r.id} height={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(r.expense?.amount ?? f.amount)}</span>
              <span style={{ fontSize: 11, color: colors.textMuted }}>{CAT[f.category] || f.category} · {f.date}</span>
              <Badge label={label} color={color} />
            </div>
            <div style={{ fontSize: 11, color: colors.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.vendor}{f.gallons ? ` · ${f.gallons} gal` : ""}</div>
            {r.status === "rejected" && <div style={{ fontSize: 11, color: colors.red, marginTop: 2 }}>Motivo: {r.rejectReason}</div>}
          </div>
          {r.status === "pending" && <button onClick={() => remove(r)} title="Borrar" style={{ background: "none", border: "none", color: colors.red, cursor: "pointer", minWidth: 44, minHeight: 44 }}><Trash2 size={14} /></button>}
        </div>;
      })}
    </div>
  </Card>;
}

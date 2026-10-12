import { useMemo, useState } from "react";
import { ClipboardCheck, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { colors } from "../constants/theme.js";
import { today } from "../utils/helpers.js";
import { deliveryReceipt, deliveryReceiptText, quincenaOf, fmtTime, personTrips, payNote } from "../utils/deliveryReceipt.js";
import { docsComplete } from "../utils/payroll.js";
import { deliveryReceiptHTML, openPrintWindow } from "../utils/printReport.js";
import WhatsAppButton from "./WhatsAppButton.jsx";
import { COMPANY } from "../constants/company.js";
import { Btn, Badge } from "./ui/index.jsx";

const shiftQuincena = (date, dir) => {
  const q = quincenaOf(date);
  if (dir < 0) { const d = new Date(`${q.dateFrom}T12:00:00`); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }
  const d = new Date(`${q.dateTo}T12:00:00`); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
};
const dmy = (x) => { const [y, m, d] = String(x || "").split("-"); return y ? `${d}/${m}` : ""; };

/**
 * Entregas de documentos de un chofer o socio en la quincena, con su constancia (PDF y WhatsApp), sin montos.
 * Acumulada: cada constancia lleva lo de las entregas anteriores de la quincena + lo nuevo marcado.
 */
export default function DeliveryReceiptPanel({ kind, person, trips, trucks, clients, drivers, user, onMark }) {
  const [date, setDate] = useState(today());
  const [at, setAt] = useState(null); // null = última entrega
  const r = useMemo(() => deliveryReceipt({ kind, person, trips, trucks, clients, drivers, date, at }), [kind, person, trips, trucks, clients, drivers, date, at]);
  // Todo lo que le falta por entregar (de cualquier quincena): se marca aquí mismo lo que trae hoy
  const [showPend, setShowPend] = useState(false);
  const pendingNow = useMemo(() => {
    const cm = new Map(clients.map(c => [c.id, c])), tm = new Map(trucks.map(t => [t.id, t]));
    return personTrips({ kind, id: person.id, trips, trucks }).filter(t => !docsComplete(t, cm.get(t.clientId)) && (t.date || "") <= today())
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.id - b.id).map(t => ({ trip: t, client: cm.get(t.clientId), truck: tm.get(t.truckId) }));
  }, [kind, person, trips, trucks, clients]);
  const mark = (id) => { onMark?.(id, true); setDate(today()); setAt(null); };
  const isCurrent = quincenaOf(date).dateFrom === quincenaOf(today()).dateFrom;
  const last = r.visits[r.visits.length - 1];
  const todayVisit = isCurrent && last && last.date === today() ? last : null;

  const print = () => openPrintWindow(`Constancia ${person.name} ${r.period.label} entrega ${r.visit.no}`, deliveryReceiptHTML({ r, kind, person, generatedBy: user?.name, fmtTime, payNote: payNote(r, kind) }));
  const company = COMPANY.brand || "B-Logix";
  const dmyFull = (x) => { const [y, m, d] = String(x || "").split("-"); return y ? `${d}/${m}/${y}` : ""; };
  const waConstancia = r.visit ? { name: person.name, company, newCount: r.newCount, date: dmyFull(r.visit.date), visitNo: r.visit.no, period: r.period.label, totalCount: r.totalCount, pendingCount: r.pending.length, fullText: deliveryReceiptText(r, { name: person.name, company, kind }) } : null;

  return <div data-delivery-panel style={{ marginBottom: 12, padding: 10, borderRadius: 8, border: `1px solid ${colors.accent}40`, background: colors.accent + "0a" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <ClipboardCheck size={15} color={colors.accent} />
      <b style={{ fontSize: 13 }}>Constancia de entrega</b>
      <button onClick={() => { setDate(shiftQuincena(date, -1)); setAt(null); }} aria-label="Quincena anterior" style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, cursor: "pointer", padding: 4, minWidth: 32, minHeight: 32 }}><ChevronLeft size={13} /></button>
      <span style={{ fontSize: 12 }} data-delivery-quincena>{r.period.label}</span>
      <button onClick={() => { setDate(shiftQuincena(date, 1)); setAt(null); }} disabled={isCurrent} aria-label="Quincena siguiente" style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 6, color: isCurrent ? colors.textMuted : colors.text, cursor: isCurrent ? "default" : "pointer", padding: 4, minWidth: 32, minHeight: 32 }}><ChevronRight size={13} /></button>
      {todayVisit && <Badge label={`Hoy entregó ${todayVisit.tripIds.length}`} color={colors.green} />}
    </div>
    {r.visits.length === 0
      ? <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>No ha entregado documentos en esta quincena. Al marcar sus facturas como recibidas se arma su constancia.</div>
      : <>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }} data-delivery-visits>
          {r.visits.map(v => {
            const on = r.visit?.no === v.no;
            return <button key={v.no} onClick={() => setAt(v.no)} data-visit={v.no} style={{ padding: "6px 10px", borderRadius: 14, fontSize: 11, cursor: "pointer", border: `1px solid ${on ? colors.accent : colors.border}`, background: on ? colors.accent + "22" : "transparent", color: on ? colors.accentLight : colors.textMuted }}>
              Entrega {v.no} · {dmy(v.date)}{v.legacy ? "" : ` ${fmtTime(v.endTs)}`} · {v.tripIds.length} doc{v.tripIds.length > 1 ? "s" : ""}
            </button>;
          })}
        </div>
        <div style={{ fontSize: 12, marginTop: 8 }} data-delivery-summary>
          Entrega {r.visit.no}: <b>{r.newCount}</b> nuevo{r.newCount !== 1 ? "s" : ""} · acumulado de la quincena <b>{r.totalCount}</b> · pendientes por entregar <b style={{ color: r.pending.length ? colors.orange : colors.green }}>{r.pending.length}</b>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={print} style={{ fontSize: 11 }} data-delivery-print><Printer size={12} /> Constancia (PDF)</Btn>
          <WhatsAppButton phone={person.phone} name={person.name} template="constancia_entrega" data={waConstancia} label="Enviar por WhatsApp" testId="delivery" />
        </div>
      </>}
    {onMark && pendingNow.length > 0 && <div style={{ marginTop: 10, borderTop: `1px solid ${colors.border}55`, paddingTop: 8 }}>
      <button onClick={() => setShowPend(v => !v)} data-delivery-pending-toggle style={{ background: "none", border: "none", color: colors.orange, cursor: "pointer", fontSize: 12, padding: 0, fontWeight: 600 }}>
        {showPend ? "▾" : "▸"} Le faltan por entregar {pendingNow.length} (de cualquier quincena) — marca aquí lo que trae
      </button>
      <WhatsAppButton phone={person.phone} name={person.name} template="documentos_pendientes" compact label="Recordarle por WhatsApp" style={{ marginLeft: 10 }} testId="pending"
        data={{ name: person.name, company, count: pendingNow.length,
          list: pendingNow.slice(0, 8).map(({ trip, client }) => `${dmyFull(trip.date)} ${client?.companyName || ""}${trip.invoiceRef ? ` ref ${trip.invoiceRef}` : ""}`).join("; ") + (pendingNow.length > 8 ? ` y ${pendingNow.length - 8} más` : ""),
          lines: pendingNow.slice(0, 20).map(({ trip, client }) => `• ${dmyFull(trip.date)} · ${client?.companyName || "—"}${trip.invoiceRef ? ` · Ref ${trip.invoiceRef}` : ""} · ${trip.municipality || ""}`).concat(pendingNow.length > 20 ? [`… y ${pendingNow.length - 20} más`] : []) }} />
      {showPend && <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, maxHeight: 260, overflowY: "auto" }} data-delivery-pending>
        {pendingNow.map(({ trip, client, truck }) => <label key={trip.id} data-pending-trip={trip.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 8px", borderRadius: 6, background: colors.inputBg, cursor: "pointer", minHeight: 36 }}>
          <input type="checkbox" checked={false} onChange={() => mark(trip.id)} style={{ width: 16, height: 16 }} />
          <span style={{ color: colors.textMuted, minWidth: 74 }}>{trip.date}</span>
          <span style={{ flex: 1 }}>{client?.companyName || "—"}{trip.invoiceRef ? ` · Ref ${trip.invoiceRef}` : ""} · {trip.municipality}</span>
          <span style={{ color: colors.textMuted }}>{truck?.plate || ""}</span>
        </label>)}
      </div>}
    </div>}
  </div>;
}

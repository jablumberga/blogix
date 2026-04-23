import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, getPeriodInfo } from "../utils/helpers.js";
import { Card, PageHeader } from "../components/ui/index.jsx";

export default function CxCPage({ clients, trips, cobros, setCobros, trucks }) {
  const today = new Date().toISOString().slice(0, 10);
  const [expanded, setExpanded]         = useState({});
  const [filterClient, setFilterClient] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterYear,   setFilterYear]   = useState("all");
  const [groupByClient, setGroupByClient] = useState(false);

  // Build period groups from all trips
  const grouped = {};
  trips.forEach(tr => {
    if (!tr.clientId || !(tr.revenue > 0)) return;
    const client = clients.find(c => c.id === tr.clientId);
    if (!client) return;
    const { key, label, expectedDate } = getPeriodInfo(tr.date, client);
    const gKey = `${tr.clientId}::${key}`;
    if (!grouped[gKey]) grouped[gKey] = { clientId: tr.clientId, client, periodKey: key, label, expectedDate, trips: [], revenue: 0 };
    grouped[gKey].trips.push(tr);
    grouped[gKey].revenue += tr.revenue || 0;
  });

  const allPeriods = Object.values(grouped).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));

  const cobroMap = new Map(cobros.map(c => [`${c.clientId}::${c.periodKey}`, c]));
  const getCobro = (cid, pk) => cobroMap.get(`${cid}::${pk}`);

  // ── Per-trip helpers ──────────────────────────────────────────────────────
  const isTripCollected = (p, tripId) => {
    const cobro = getCobro(p.clientId, p.periodKey);
    if (!cobro) return false;
    if (cobro.status === "collected" && !cobro.collectedTripIds) return true; // legacy
    return (cobro.collectedTripIds || []).includes(tripId);
  };

  const isFullyCollected = (p) => {
    const cobro = getCobro(p.clientId, p.periodKey);
    if (!cobro) return false;
    if (cobro.status === "collected" && !cobro.collectedTripIds) return true; // legacy
    return (cobro.collectedTripIds || []).length >= p.trips.length;
  };

  const isPartiallyCollected = (p) => {
    const cobro = getCobro(p.clientId, p.periodKey);
    if (!cobro) return false;
    if (cobro.status === "collected" && !cobro.collectedTripIds) return false;
    const cnt = (cobro.collectedTripIds || []).length;
    return cnt > 0 && cnt < p.trips.length;
  };

  const getCollectedRevenue = (p) => {
    const cobro = getCobro(p.clientId, p.periodKey);
    if (!cobro) return 0;
    if (cobro.status === "collected" && !cobro.collectedTripIds) return p.revenue;
    const ids = new Set(cobro.collectedTripIds || []);
    return p.trips.filter(tr => ids.has(tr.id)).reduce((s, tr) => s + (tr.revenue || 0), 0);
  };

  const isOverdue = p => !isFullyCollected(p) && p.expectedDate < today;
  const daysUntil = p => Math.ceil((new Date(p.expectedDate) - new Date(today)) / 86400000);

  // Summary (unfiltered)
  const totalPending   = allPeriods.reduce((s, p) => s + (p.revenue - getCollectedRevenue(p)), 0);
  const totalOverdue   = allPeriods.filter(p => isOverdue(p)).reduce((s, p) => s + (p.revenue - getCollectedRevenue(p)), 0);
  const totalCollected = allPeriods.reduce((s, p) => s + getCollectedRevenue(p), 0);
  const nextDue        = allPeriods
    .filter(p => !isFullyCollected(p))
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))[0];

  const allYears = [...new Set(allPeriods.map(p => p.expectedDate.slice(0, 4)))].sort().reverse();

  // Apply filters
  let periods = allPeriods;
  if (filterClient !== "all") periods = periods.filter(p => p.clientId === Number(filterClient));
  if (filterYear   !== "all") periods = periods.filter(p => p.expectedDate.startsWith(filterYear));
  if (filterStatus === "notCollected") periods = periods.filter(p => !isFullyCollected(p));
  if (filterStatus === "overdue")      periods = periods.filter(p => isOverdue(p));
  if (filterStatus === "upcoming")     periods = periods.filter(p => !isFullyCollected(p) && !isOverdue(p));
  if (filterStatus === "collected")    periods = periods.filter(p => isFullyCollected(p));

  // ── Cobro actions ─────────────────────────────────────────────────────────
  const upsertCobro = (clientId, periodKey, patch) => {
    const existing = getCobro(clientId, periodKey);
    if (existing) {
      setCobros(cobros.map(c =>
        c.clientId === clientId && c.periodKey === periodKey ? { ...c, ...patch } : c
      ));
    } else {
      const newId = cobros.length > 0 ? Math.max(...cobros.map(c => c.id)) + 1 : 1;
      setCobros([...cobros, { id: newId, clientId, periodKey, status: "pending", collectedDate: null, amount: 0, collectedTripIds: [], ...patch }]);
    }
  };

  const markAllCollected = (p) => {
    upsertCobro(p.clientId, p.periodKey, {
      status: "collected",
      collectedDate: today,
      amount: p.revenue,
      collectedTripIds: p.trips.map(tr => tr.id),
    });
  };

  const markAllPending = (clientId, periodKey) => {
    upsertCobro(clientId, periodKey, { status: "pending", collectedDate: null, collectedTripIds: [] });
  };

  const toggleTrip = (p, tripId) => {
    const cobro = getCobro(p.clientId, p.periodKey);
    const currentIds = new Set(
      cobro
        ? (cobro.collectedTripIds || (cobro.status === "collected" ? p.trips.map(tr => tr.id) : []))
        : []
    );
    if (currentIds.has(tripId)) currentIds.delete(tripId);
    else currentIds.add(tripId);
    const collectedTripIds = [...currentIds];
    const allDone = collectedTripIds.length >= p.trips.length;
    upsertCobro(p.clientId, p.periodKey, {
      collectedTripIds,
      status: allDone ? "collected" : collectedTripIds.length > 0 ? "partial" : "pending",
      collectedDate: allDone ? today : null,
    });
  };

  // Group by client after filters
  const clientGroups = {};
  periods.forEach(p => {
    const cid = p.clientId;
    if (!clientGroups[cid]) clientGroups[cid] = { client: p.client, periods: [], pendingAmt: 0, collectedAmt: 0 };
    clientGroups[cid].periods.push(p);
    const col = getCollectedRevenue(p);
    clientGroups[cid].collectedAmt += col;
    clientGroups[cid].pendingAmt   += p.revenue - col;
  });

  const renderPeriod = (p) => {
    const fully   = isFullyCollected(p);
    const partial = isPartiallyCollected(p);
    const over    = isOverdue(p);
    const days    = daysUntil(p);
    const cobro   = getCobro(p.clientId, p.periodKey);
    const collectedRev = getCollectedRevenue(p);
    const pendingRev   = p.revenue - collectedRev;
    const expKey = `${p.clientId}-${p.periodKey}`;
    const borderColor = fully ? colors.green : partial ? colors.cyan : over ? colors.red : days <= 7 ? colors.orange : colors.border;

    return (
      <Card key={expKey} style={{ marginBottom: 8, borderLeft: `4px solid ${borderColor}`, opacity: fully ? 0.8 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{p.client.companyName}</span>
              <span style={{ fontSize: 11, color: colors.textMuted }}>·</span>
              <span style={{ fontSize: 12, color: colors.textMuted }}>{p.label}</span>
              {fully
                ? <span style={{ fontSize: 10, color: colors.green, background: colors.green+"18", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>✓ Cobrado</span>
                : partial
                  ? <span style={{ fontSize: 10, color: colors.cyan, background: colors.cyan+"18", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>Parcial</span>
                  : over
                    ? <span style={{ fontSize: 10, color: colors.red, background: colors.red+"18", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>⚠ Vencido</span>
                    : days <= 7
                      ? <span style={{ fontSize: 10, color: colors.orange, background: colors.orange+"18", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>Vence pronto</span>
                      : null}
            </div>
            <div style={{ fontSize: 11, color: fully ? colors.green : over ? colors.red : colors.textMuted }}>
              {fully
                ? `Cobrado el ${cobro?.collectedDate || today}`
                : over
                  ? `Venció ${p.expectedDate} · hace ${Math.abs(days)} día${Math.abs(days) !== 1 ? "s" : ""}`
                  : `Vence: ${p.expectedDate} · en ${days} día${days !== 1 ? "s" : ""}`
              }
              <span style={{ color: colors.textMuted, marginLeft: 8 }}>· {p.trips.length} viaje{p.trips.length !== 1 ? "s" : ""}</span>
              {partial && <span style={{ color: colors.cyan, marginLeft: 8 }}>· {fmt(collectedRev)} cobrado · {fmt(pendingRev)} pendiente</span>}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: fully ? colors.green : partial ? colors.cyan : over ? colors.red : colors.text }}>{fmt(p.revenue)}</div>
              <button onClick={() => setExpanded(e => ({ ...e, [expKey]: !e[expKey] }))}
                style={{ fontSize: 10, color: colors.textMuted, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
                {expanded[expKey] ? <ChevronDown size={10}/> : <ChevronRight size={10}/>} ver viajes
              </button>
            </div>
            {fully
              ? <button onClick={() => markAllPending(p.clientId, p.periodKey)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>
                  Desmarcar
                </button>
              : <button onClick={() => markAllCollected(p)}
                  style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: colors.green, color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                  ✓ Cobrar todo
                </button>
            }
          </div>
        </div>

        {expanded[expKey] && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${colors.border}33`, paddingTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <th style={{ width: 36, padding: "3px 8px" }} />
                  {["Fecha","Destino","Camión","NCF / Ref","Ingreso"].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 4 ? "right" : "left", padding: "3px 8px", color: colors.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.trips.slice().sort((a, b) => a.date.localeCompare(b.date)).map(tr => {
                  const truck      = trucks?.find(t => t.id === tr.truckId);
                  const tripCol    = isTripCollected(p, tr.id);
                  return (
                    <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11`, opacity: tripCol ? 0.65 : 1 }}>
                      <td style={{ padding: "5px 8px", textAlign: "center" }}>
                        <button
                          onClick={() => toggleTrip(p, tr.id)}
                          title={tripCol ? "Desmarcar cobrado" : "Marcar cobrado"}
                          style={{
                            width: 22, height: 22, borderRadius: "50%", border: `2px solid ${tripCol ? colors.green : colors.border}`,
                            background: tripCol ? colors.green : "transparent", color: "white",
                            cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                          {tripCol ? "✓" : ""}
                        </button>
                      </td>
                      <td style={{ padding: "5px 8px", textDecoration: tripCol ? "line-through" : "none", color: tripCol ? colors.textMuted : colors.text }}>{tr.date}</td>
                      <td style={{ padding: "5px 8px", color: colors.textMuted }}>{tr.municipality}, {tr.province}</td>
                      <td style={{ padding: "5px 8px", color: colors.textMuted }}>{truck?.plate || "—"}</td>
                      <td style={{ padding: "5px 8px", color: tr.invoiceRef ? colors.accentLight : colors.textMuted, fontWeight: tr.invoiceRef ? 600 : 400 }}>{tr.invoiceRef || "—"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: tripCol ? colors.green : colors.text }}>{fmt(tr.revenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `1px solid ${colors.border}44` }}>
                  <td colSpan={5} style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11, color: colors.textMuted }}>
                    Total — {p.trips.length} viaje{p.trips.length !== 1 ? "s" : ""}
                    {partial && <span style={{ marginLeft: 8, color: colors.cyan }}> · {fmt(collectedRev)} cobrado</span>}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800, fontSize: 13, color: fully ? colors.green : colors.text }}>
                    {fmt(p.revenue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div>
      <PageHeader title="Cuentas por Cobrar" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.orange}44` }}>
          <div style={{ fontSize: 10, color: colors.orange, fontWeight: 700, marginBottom: 4 }}>POR COBRAR</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: colors.orange }}>{fmt(totalPending)}</div>
          <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
            {allPeriods.filter(p => !isFullyCollected(p)).length} período{allPeriods.filter(p => !isFullyCollected(p)).length !== 1 ? "s" : ""} pendiente{allPeriods.filter(p => !isFullyCollected(p)).length !== 1 ? "s" : ""}
          </div>
        </div>

        {totalOverdue > 0 && (
          <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.red}55` }}>
            <div style={{ fontSize: 10, color: colors.red, fontWeight: 700, marginBottom: 4 }}>⚠ VENCIDO</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: colors.red }}>{fmt(totalOverdue)}</div>
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
              {allPeriods.filter(p => isOverdue(p)).length} período{allPeriods.filter(p => isOverdue(p)).length !== 1 ? "s" : ""} vencido{allPeriods.filter(p => isOverdue(p)).length !== 1 ? "s" : ""}
            </div>
          </div>
        )}

        {nextDue && (
          <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.border}` }}>
            <div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 700, marginBottom: 4 }}>PRÓXIMO VENCIMIENTO</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.cyan }}>{nextDue.expectedDate}</div>
            <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{nextDue.client.companyName} — {fmt(nextDue.revenue)}</div>
          </div>
        )}

        <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.green}33` }}>
          <div style={{ fontSize: 10, color: colors.green, fontWeight: 700, marginBottom: 4 }}>COBRADO</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: colors.green }}>{fmt(totalCollected)}</div>
          <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>
            {allPeriods.filter(p => isFullyCollected(p)).length} período{allPeriods.filter(p => isFullyCollected(p)).length !== 1 ? "s" : ""} cobrado{allPeriods.filter(p => isFullyCollected(p)).length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 16, cursor: "pointer" }}>
          <option value="all">Todos los clientes</option>
          {clients.filter(c => allPeriods.some(p => p.clientId === c.id)).map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
        </select>

        {[
          { key: "all",          label: "Todos",      color: colors.textMuted },
          { key: "notCollected", label: "Por cobrar", color: colors.orange },
          { key: "overdue",      label: "Vencidos",   color: colors.red },
          { key: "upcoming",     label: "Próximos",   color: colors.cyan },
          { key: "collected",    label: "Cobrados",   color: colors.green },
        ].map(({ key, label, color }) => {
          const active = filterStatus === key;
          return (
            <button key={key} onClick={() => setFilterStatus(key)}
              style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${active ? color : colors.border}`, background: active ? color + "18" : "transparent", color: active ? color : colors.textMuted, cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 400 }}>
              {label}
            </button>
          );
        })}

        {allYears.length > 1 && (
          <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 16, cursor: "pointer" }}>
            <option value="all">Todos los años</option>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {[{ val: false, label: "Por fecha" }, { val: true, label: "Por cliente" }].map(({ val, label }) => {
            const active = groupByClient === val;
            return (
              <button key={label} onClick={() => setGroupByClient(val)}
                style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${active ? colors.accent : colors.border}`, background: active ? colors.accent + "18" : "transparent", color: active ? colors.accent : colors.textMuted, cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 400 }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {periods.length === 0 && (
        <Card>
          <div style={{ textAlign: "center", padding: 40, color: colors.textMuted, fontSize: 13 }}>
            {allPeriods.length === 0
              ? "No hay viajes con clientes asignados aún."
              : "No hay períodos que coincidan con los filtros seleccionados."}
          </div>
        </Card>
      )}

      {groupByClient
        ? Object.values(clientGroups).map(cg => (
            <div key={cg.client.id} style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 4px", marginBottom: 10, borderBottom: `2px solid ${colors.border}` }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{cg.client.companyName}</span>
                <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                  {cg.pendingAmt   > 0 && <span style={{ color: colors.orange, fontWeight: 700 }}>{fmt(cg.pendingAmt)} pendiente</span>}
                  {cg.collectedAmt > 0 && <span style={{ color: colors.green,  fontWeight: 700 }}>{fmt(cg.collectedAmt)} cobrado</span>}
                </div>
              </div>
              {cg.periods.map(p => renderPeriod(p))}
            </div>
          ))
        : periods.map(p => renderPeriod(p))
      }
    </div>
  );
}

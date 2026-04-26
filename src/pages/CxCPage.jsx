import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, getPeriodInfo } from "../utils/helpers.js";
import { Card, PageHeader } from "../components/ui/index.jsx";

export default function CxCPage({ clients, trips, cobros, setCobros, trucks, invoices, setInvoices, setPage, isMobile }) {
  const today = new Date().toISOString().slice(0, 10);

  const [expandedInv,     setExpandedInv]     = useState({});
  const [expandedSinFact, setExpandedSinFact] = useState({});
  const [filterStatus,    setFilterStatus]    = useState("pending");
  const [filterClient,    setFilterClient]    = useState("all");
  const [showSinFacturar, setShowSinFacturar] = useState(true);

  // ── Compute invoice list with enriched fields ────────────────────────────
  const invAmt = (inv) =>
    (inv.tripIds || []).reduce((s, tid) => s + (trips.find(t => t.id === tid)?.revenue || 0), 0);

  const activeInvoices = useMemo(() =>
    (invoices || [])
      .filter(inv => inv.status !== "cancelled")
      .map(inv => {
        const cl = clients.find(c => c.id === inv.clientId);
        const amount = invAmt(inv);
        const isOverdue = inv.status !== "paid" && inv.dueDate && inv.dueDate < today;
        const daysLeft = inv.dueDate ? Math.ceil((new Date(inv.dueDate) - new Date(today)) / 86400000) : null;
        const invTrips = (inv.tripIds || []).map(tid => trips.find(t => t.id === tid)).filter(Boolean);
        return { ...inv, client: cl, amount, isOverdue, daysLeft, invTrips };
      })
      .sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        if (a.status === "paid" && b.status !== "paid") return 1;
        if (a.status !== "paid" && b.status === "paid") return -1;
        return (a.dueDate || "").localeCompare(b.dueDate || "");
      }),
    [invoices, clients, trips, today] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Trips not covered by any active invoice ──────────────────────────────
  const invoicedTripIds = useMemo(() => {
    const s = new Set();
    (invoices || []).forEach(inv => {
      if (inv.status !== "cancelled") (inv.tripIds || []).forEach(id => s.add(id));
    });
    return s;
  }, [invoices]);

  const sinFacturarTrips = useMemo(() =>
    trips.filter(tr =>
      tr.status !== "cancelled" &&
      (tr.revenue || 0) > 0 &&
      tr.docStatus === "delivered" &&
      !invoicedTripIds.has(tr.id)
    ),
    [trips, invoicedTripIds]
  );

  const sinFacturarByClient = useMemo(() => {
    const map = {};
    sinFacturarTrips.forEach(tr => {
      const cl = clients.find(c => c.id === tr.clientId);
      if (!cl) return;
      if (!map[tr.clientId]) map[tr.clientId] = { client: cl, trips: [], amount: 0 };
      map[tr.clientId].trips.push(tr);
      map[tr.clientId].amount += tr.revenue || 0;
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }, [sinFacturarTrips, clients]);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpiPending  = activeInvoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const kpiOverdue  = activeInvoices.filter(i => i.isOverdue).reduce((s, i) => s + i.amount, 0);
  const kpiCobrado  = activeInvoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const kpiSinFact  = sinFacturarTrips.reduce((s, tr) => s + (tr.revenue || 0), 0);
  const nextDueInv  = activeInvoices.filter(i => i.status !== "paid" && !i.isOverdue && i.dueDate)[0];

  // ── Cobro helpers ─────────────────────────────────────────────────────────
  const cobroMap = useMemo(() =>
    new Map(cobros.map(c => [`${c.clientId}::${c.periodKey}`, c])),
    [cobros]
  );

  const upsertCobro = (clientId, periodKey, patch) => {
    const existing = cobroMap.get(`${clientId}::${periodKey}`);
    if (existing) {
      setCobros(cobros.map(c =>
        c.clientId === clientId && c.periodKey === periodKey ? { ...c, ...patch } : c
      ));
    } else {
      const newId = cobros.length > 0 ? Math.max(...cobros.map(c => c.id)) + 1 : 1;
      setCobros([...cobros, { id: newId, clientId, periodKey, status: "pending", collectedDate: null, amount: 0, collectedTripIds: [], ...patch }]);
    }
  };

  // Mark all trips in invoice as cobrado + set invoice status = paid
  const cobrarInvoice = (inv) => {
    const cl = clients.find(c => c.id === inv.clientId);
    if (!cl) return;
    // Group trip ids by period
    const byPeriod = new Map();
    (inv.tripIds || []).forEach(tid => {
      const tr = trips.find(t => t.id === tid);
      if (!tr) return;
      const { key } = getPeriodInfo(tr.date, cl);
      if (!byPeriod.has(key)) byPeriod.set(key, []);
      byPeriod.get(key).push(tid);
    });
    // Batch-update cobros
    let newCobros = [...cobros];
    byPeriod.forEach((tripIds, periodKey) => {
      const idx = newCobros.findIndex(c => c.clientId === inv.clientId && c.periodKey === periodKey);
      const periodTrips = trips.filter(tr => {
        if (tr.clientId !== inv.clientId || !(tr.revenue > 0)) return false;
        const { key: k } = getPeriodInfo(tr.date, cl);
        return k === periodKey;
      });
      const merged = [...new Set([...(idx >= 0 ? newCobros[idx].collectedTripIds || [] : []), ...tripIds])];
      const allDone = periodTrips.every(tr => merged.includes(tr.id));
      const amt = merged.reduce((s, tid) => s + (trips.find(t => t.id === tid)?.revenue || 0), 0);
      const patch = { collectedTripIds: merged, status: allDone ? "collected" : "partial", collectedDate: allDone ? today : null, amount: amt };
      if (idx >= 0) newCobros[idx] = { ...newCobros[idx], ...patch };
      else newCobros.push({ id: newCobros.length > 0 ? Math.max(...newCobros.map(c => c.id)) + 1 : 1, clientId: inv.clientId, periodKey, ...patch });
    });
    setCobros(newCobros);
    setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: "paid" } : i));
  };

  const isTripCobrado = (tripId, clientId, tripDate) => {
    const cl = clients.find(c => c.id === clientId);
    if (!cl) return false;
    const { key: periodKey } = getPeriodInfo(tripDate, cl);
    const cobro = cobroMap.get(`${clientId}::${periodKey}`);
    if (!cobro) return false;
    if (cobro.status === "collected" && !cobro.collectedTripIds) return true;
    return (cobro.collectedTripIds || []).includes(tripId);
  };

  const toggleTripCobro = (tr) => {
    const cl = clients.find(c => c.id === tr.clientId);
    if (!cl) return;
    const { key: periodKey } = getPeriodInfo(tr.date, cl);
    const existing = cobroMap.get(`${tr.clientId}::${periodKey}`);
    const currentIds = new Set(
      existing ? (existing.collectedTripIds || (existing.status === "collected" ? [] : [])) : []
    );
    if (currentIds.has(tr.id)) currentIds.delete(tr.id);
    else currentIds.add(tr.id);
    const collected = [...currentIds];
    const periodTrips = trips.filter(t => {
      if (t.clientId !== tr.clientId || !(t.revenue > 0)) return false;
      const { key: k } = getPeriodInfo(t.date, cl);
      return k === periodKey;
    });
    const allDone = periodTrips.every(t => currentIds.has(t.id));
    upsertCobro(tr.clientId, periodKey, {
      collectedTripIds: collected,
      status: allDone ? "collected" : collected.length > 0 ? "partial" : "pending",
      collectedDate: allDone ? today : null,
    });
  };

  // ── Filters ───────────────────────────────────────────────────────────────
  let filteredInvoices = activeInvoices;
  if (filterStatus === "pending")  filteredInvoices = filteredInvoices.filter(i => i.status !== "paid");
  if (filterStatus === "overdue")  filteredInvoices = filteredInvoices.filter(i => i.isOverdue);
  if (filterStatus === "paid")     filteredInvoices = filteredInvoices.filter(i => i.status === "paid");
  if (filterClient !== "all")      filteredInvoices = filteredInvoices.filter(i => i.clientId === Number(filterClient));

  const allClientIds = new Set([
    ...activeInvoices.map(i => i.clientId),
    ...sinFacturarByClient.map(g => g.client.id),
  ]);
  const clientsWithData = clients.filter(c => allClientIds.has(c.id));

  // ── Invoice card render ───────────────────────────────────────────────────
  const renderInvoice = (inv) => {
    const isExp = !!expandedInv[inv.id];
    const borderColor =
      inv.status === "paid"   ? colors.green  :
      inv.isOverdue           ? colors.red     :
      inv.daysLeft !== null && inv.daysLeft <= 7 ? colors.orange :
      inv.status === "draft"  ? colors.border  : colors.accent;

    return (
      <Card key={inv.id} style={{ marginBottom: 8, borderLeft: `4px solid ${borderColor}`, opacity: inv.status === "paid" ? 0.8 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
              <FileText size={12} color={borderColor} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>{inv.invoiceNumber}</span>
              <span style={{ fontSize: 11, color: colors.textMuted }}>·</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{inv.client?.companyName || "—"}</span>
              {inv.status === "paid"   && <span style={{ fontSize: 10, color: colors.green,   background: colors.green+"18",   padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>✓ Cobrada</span>}
              {inv.status === "draft"  && <span style={{ fontSize: 10, color: colors.textMuted, background: colors.textMuted+"18", padding: "2px 8px", borderRadius: 10 }}>Borrador</span>}
              {inv.status === "sent" && !inv.isOverdue && <span style={{ fontSize: 10, color: colors.accent, background: colors.accent+"18", padding: "2px 8px", borderRadius: 10 }}>Enviada</span>}
              {inv.isOverdue           && <span style={{ fontSize: 10, color: colors.red,    background: colors.red+"18",    padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>⚠ Vencida</span>}
              {inv.status === "sent" && !inv.isOverdue && inv.daysLeft !== null && inv.daysLeft <= 7
                && <span style={{ fontSize: 10, color: colors.orange, background: colors.orange+"18", padding: "2px 8px", borderRadius: 10 }}>Vence pronto</span>}
            </div>
            <div style={{ fontSize: 11, color: colors.textMuted }}>
              {inv.date && <span>Emitida: {inv.date}</span>}
              {inv.dueDate && (
                <span style={{ marginLeft: 8, color: inv.isOverdue ? colors.red : inv.daysLeft !== null && inv.daysLeft <= 3 ? colors.orange : colors.textMuted }}>
                  · Vence: {inv.dueDate}
                  {inv.status !== "paid" && inv.daysLeft !== null
                    ? ` (${inv.daysLeft >= 0 ? `${inv.daysLeft}d` : `${Math.abs(inv.daysLeft)}d vencida`})`
                    : ""}
                </span>
              )}
              <span style={{ marginLeft: 8 }}>· {(inv.tripIds || []).length} viaje{(inv.tripIds || []).length !== 1 ? "s" : ""}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: inv.status === "paid" ? colors.green : inv.isOverdue ? colors.red : colors.text }}>
                {fmt(inv.amount)}
              </div>
              <button onClick={() => setExpandedInv(e => ({ ...e, [inv.id]: !e[inv.id] }))}
                style={{ fontSize: 10, color: colors.textMuted, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
                {isExp ? <ChevronDown size={10}/> : <ChevronRight size={10}/>} ver viajes
              </button>
            </div>
            {inv.status === "sent" && (
              <button onClick={() => cobrarInvoice(inv)}
                style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: colors.green, color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                ✓ Cobrar
              </button>
            )}
          </div>
        </div>

        {isExp && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${colors.border}33`, paddingTop: 10 }}>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <th style={{ width: 36, padding: "3px 8px" }} />
                    {["Fecha", "Destino", "Camión", "Ingreso"].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 3 ? "right" : "left", padding: "3px 8px", color: colors.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inv.invTrips.slice().sort((a, b) => a.date.localeCompare(b.date)).map(tr => {
                    const truck = trucks?.find(t => t.id === tr.truckId);
                    const cobrado = isTripCobrado(tr.id, tr.clientId, tr.date);
                    return (
                      <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11`, opacity: cobrado ? 0.65 : 1 }}>
                        <td style={{ padding: "5px 8px", textAlign: "center" }}>
                          <button onClick={() => toggleTripCobro(tr)}
                            title={cobrado ? "Desmarcar cobrado" : "Marcar cobrado"}
                            style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${cobrado ? colors.green : colors.border}`, background: cobrado ? colors.green : "transparent", color: "white", cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            {cobrado ? "✓" : ""}
                          </button>
                        </td>
                        <td style={{ padding: "5px 8px", textDecoration: cobrado ? "line-through" : "none", color: cobrado ? colors.textMuted : colors.text }}>{tr.date}</td>
                        <td style={{ padding: "5px 8px", color: colors.textMuted }}>{tr.municipality}{tr.province ? `, ${tr.province}` : ""}</td>
                        <td style={{ padding: "5px 8px", color: colors.textMuted }}>{truck?.plate || "—"}</td>
                        <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: cobrado ? colors.green : colors.text }}>{fmt(tr.revenue || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `1px solid ${colors.border}44` }}>
                    <td colSpan={4} style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11, color: colors.textMuted }}>
                      Total — {inv.invTrips.length} viaje{inv.invTrips.length !== 1 ? "s" : ""}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800, fontSize: 13, color: inv.status === "paid" ? colors.green : colors.text }}>
                      {fmt(inv.amount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Card>
    );
  };

  const showSinFact = (filterStatus === "pending" || filterStatus === "all") &&
    sinFacturarByClient.filter(g => filterClient === "all" || g.client.id === Number(filterClient)).length > 0;

  return (
    <div>
      <PageHeader title="Cuentas por Cobrar" />

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.orange}44` }}>
          <div style={{ fontSize: 10, color: colors.orange, fontWeight: 700, marginBottom: 4 }}>POR COBRAR</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: colors.orange }}>{fmt(kpiPending)}</div>
          <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{activeInvoices.filter(i => i.status !== "paid").length} factura{activeInvoices.filter(i => i.status !== "paid").length !== 1 ? "s" : ""} pendiente{activeInvoices.filter(i => i.status !== "paid").length !== 1 ? "s" : ""}</div>
        </div>

        {kpiOverdue > 0 && (
          <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.red}55` }}>
            <div style={{ fontSize: 10, color: colors.red, fontWeight: 700, marginBottom: 4 }}>⚠ VENCIDAS</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: colors.red }}>{fmt(kpiOverdue)}</div>
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{activeInvoices.filter(i => i.isOverdue).length} factura{activeInvoices.filter(i => i.isOverdue).length !== 1 ? "s" : ""} vencida{activeInvoices.filter(i => i.isOverdue).length !== 1 ? "s" : ""}</div>
          </div>
        )}

        {nextDueInv && (
          <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.border}` }}>
            <div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 700, marginBottom: 4 }}>PRÓXIMA FACTURA</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.cyan }}>{nextDueInv.dueDate}</div>
            <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{nextDueInv.client?.companyName} — {fmt(nextDueInv.amount)}</div>
          </div>
        )}

        {kpiSinFact > 0 && (
          <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.yellow}44`, cursor: "pointer" }}
            onClick={() => { setFilterStatus("pending"); setShowSinFacturar(true); }}>
            <div style={{ fontSize: 10, color: colors.yellow, fontWeight: 700, marginBottom: 4 }}>SIN FACTURAR</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: colors.yellow }}>{fmt(kpiSinFact)}</div>
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{sinFacturarTrips.length} viaje{sinFacturarTrips.length !== 1 ? "s" : ""} con docs OK</div>
          </div>
        )}

        <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.green}33` }}>
          <div style={{ fontSize: 10, color: colors.green, fontWeight: 700, marginBottom: 4 }}>COBRADO</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: colors.green }}>{fmt(kpiCobrado)}</div>
          <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{activeInvoices.filter(i => i.status === "paid").length} factura{activeInvoices.filter(i => i.status === "paid").length !== 1 ? "s" : ""} cobrada{activeInvoices.filter(i => i.status === "paid").length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 16, cursor: "pointer" }}>
          <option value="all">Todos los clientes</option>
          {clientsWithData.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
        </select>

        {[
          { key: "pending", label: "Por cobrar", color: colors.orange },
          { key: "overdue", label: "Vencidas",   color: colors.red },
          { key: "paid",    label: "Cobradas",   color: colors.green },
          { key: "all",     label: "Todas",      color: colors.textMuted },
        ].map(({ key, label, color }) => {
          const active = filterStatus === key;
          return (
            <button key={key} onClick={() => setFilterStatus(key)}
              style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${active ? color : colors.border}`, background: active ? color + "18" : "transparent", color: active ? color : colors.textMuted, cursor: "pointer", fontSize: 11, fontWeight: active ? 700 : 400 }}>
              {label}
            </button>
          );
        })}

        {setPage && (
          <button onClick={() => setPage("invoices")}
            style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 16, border: `1px solid ${colors.accent}`, background: "transparent", color: colors.accent, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>
            + Nueva Factura
          </button>
        )}
      </div>

      {/* Invoice list */}
      {filteredInvoices.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: 40, color: colors.textMuted, fontSize: 13 }}>
            {activeInvoices.length === 0
              ? "No hay facturas — crea tu primera factura en la página de Facturas"
              : "No hay facturas que coincidan con el filtro seleccionado"}
          </div>
        </Card>
      ) : (
        filteredInvoices.map(inv => renderInvoice(inv))
      )}

      {/* ── Sin Facturar section ────────────────────────────────────────────── */}
      {showSinFact && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setShowSinFacturar(s => !s)}
                style={{ background: "none", border: "none", cursor: "pointer", color: colors.yellow, display: "flex", alignItems: "center" }}>
                {showSinFacturar ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
              </button>
              <span style={{ fontWeight: 700, fontSize: 13, color: colors.yellow }}>Sin Facturar — Docs Entregados</span>
              <span style={{ fontSize: 11, color: colors.textMuted }}>
                ({sinFacturarTrips.length} viaje{sinFacturarTrips.length !== 1 ? "s" : ""} · {fmt(kpiSinFact)})
              </span>
            </div>
            {setPage && (
              <button onClick={() => setPage("invoices")}
                style={{ fontSize: 11, color: colors.accent, background: "transparent", border: `1px solid ${colors.accent}33`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
                Ir a Facturas →
              </button>
            )}
          </div>

          {showSinFacturar && sinFacturarByClient
            .filter(g => filterClient === "all" || g.client.id === Number(filterClient))
            .map(g => (
              <Card key={g.client.id} style={{ marginBottom: 8, borderLeft: `4px solid ${colors.yellow}66`, opacity: 0.9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{g.client.companyName}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted }}>
                      {g.trips.length} viaje{g.trips.length !== 1 ? "s" : ""} con docs OK · pendiente de facturar
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: colors.yellow }}>{fmt(g.amount)}</div>
                    <button onClick={() => setExpandedSinFact(e => ({ ...e, [g.client.id]: !e[g.client.id] }))}
                      style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 7, padding: "5px 10px", cursor: "pointer", color: colors.textMuted, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                      {expandedSinFact[g.client.id] ? <ChevronDown size={10}/> : <ChevronRight size={10}/>} viajes
                    </button>
                  </div>
                </div>

                {expandedSinFact[g.client.id] && (
                  <div style={{ marginTop: 10, borderTop: `1px solid ${colors.border}33`, paddingTop: 8 }}>
                    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                            <th style={{ width: 36, padding: "3px 8px" }} />
                            {["Fecha", "Destino", "Camión", "Ingreso"].map((h, i) => (
                              <th key={h} style={{ textAlign: i === 3 ? "right" : "left", padding: "3px 8px", color: colors.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.trips.slice().sort((a, b) => a.date.localeCompare(b.date)).map(tr => {
                            const truck = trucks?.find(t => t.id === tr.truckId);
                            const cobrado = isTripCobrado(tr.id, tr.clientId, tr.date);
                            return (
                              <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11`, opacity: cobrado ? 0.65 : 1 }}>
                                <td style={{ padding: "5px 8px", textAlign: "center" }}>
                                  <button onClick={() => toggleTripCobro(tr)}
                                    title={cobrado ? "Desmarcar cobrado" : "Marcar cobrado"}
                                    style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${cobrado ? colors.green : colors.border}`, background: cobrado ? colors.green : "transparent", color: "white", cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                    {cobrado ? "✓" : ""}
                                  </button>
                                </td>
                                <td style={{ padding: "5px 8px" }}>{tr.date}</td>
                                <td style={{ padding: "5px 8px", color: colors.textMuted }}>{tr.municipality}{tr.province ? `, ${tr.province}` : ""}</td>
                                <td style={{ padding: "5px 8px", color: colors.textMuted }}>{truck?.plate || "—"}</td>
                                <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: cobrado ? colors.green : colors.text }}>{fmt(tr.revenue || 0)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            ))
          }
        </div>
      )}
    </div>
  );
}

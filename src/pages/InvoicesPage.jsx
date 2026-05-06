import { useState, useMemo } from "react";
import { Plus, X, Pencil, Trash2, FileText, CheckCircle2, Clock, Send, Ban, AlertCircle, Lock } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, nxId, getPeriodInfo } from "../utils/helpers.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, StatCard, Th, Td } from "../components/ui/index.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
function nextInvoiceNumber(invoices) {
  const y = new Date().getFullYear();
  const prefix = `FAC-${y}-`;
  const nums = invoices
    .filter(inv => inv.invoiceNumber?.startsWith(prefix))
    .map(inv => parseInt(inv.invoiceNumber.slice(prefix.length)) || 0);
  const n = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

function calcDueDate(date, client) {
  const terms = client?.rules?.paymentTerms || 30;
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + terms);
  return d.toISOString().slice(0, 10);
}

const STATUS_CONFIG = {
  draft:     { label: "Borrador",   color: colors.textMuted, icon: FileText },
  sent:      { label: "Enviada",    color: colors.accent,    icon: Send },
  paid:      { label: "Cobrada",    color: colors.green,     icon: CheckCircle2 },
  cancelled: { label: "Anulada",    color: colors.red,       icon: Ban },
};

// ── Trip row inside the modal ─────────────────────────────────────────────────
function TripSelectRow({ trip, client, drivers, trucks, isSelected, isIneligible, ineligibleReason, isInOtherInvoice, otherInvoiceNum, onToggle, brokerDeduction }) {
  const driver = drivers.find(d => d.id === trip.driverId);
  const truck  = trucks.find(tk => tk.id === trip.truckId);
  const docsOk = trip.docStatus === "delivered";
  const gross  = trip.revenue || 0;
  const ded    = brokerDeduction || 0;
  const net    = gross - ded;

  if (isInOtherInvoice) return null; // completely hidden

  const disabled = isIneligible;
  return (
    <div
      onClick={() => !disabled && onToggle(trip.id)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px",
        borderBottom: `1px solid ${colors.border}22`,
        background: isSelected ? colors.accent + "10" : "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        borderLeft: `3px solid ${isSelected ? colors.accent : "transparent"}`,
      }}
    >
      <div style={{ marginTop: 2, flexShrink: 0 }}>
        <div style={{
          width: 17, height: 17, borderRadius: 4,
          border: `2px solid ${isSelected ? colors.accent : colors.border}`,
          background: isSelected ? colors.accent : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {isSelected && <div style={{ width: 8, height: 8, borderRadius: 2, background: "white" }}/>}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 12 }}>#{trip.id}</span>
          <span style={{ fontSize: 12, color: colors.text }}>{trip.municipality}{trip.province ? `, ${trip.province}` : ""}</span>
          <span style={{ fontSize: 11, color: colors.textMuted }}>{trip.date}</span>
          {truck && <span style={{ fontSize: 10, color: colors.textMuted }}>{truck.plate}</span>}
          {driver && <span style={{ fontSize: 10, color: colors.textMuted }}>· {driver.name}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: colors.green }}>
            {ded > 0 ? fmt(net) : fmt(gross)}
          </span>
          {ded > 0 && <span style={{ fontSize: 10, color: colors.orange }}>−{fmt(ded)} broker</span>}
          {trip.cargo && <span style={{ fontSize: 10, color: colors.textMuted }}>{trip.cargo}</span>}
          {/* Doc status */}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: docsOk ? colors.green : colors.orange }}>
            {docsOk ? <><CheckCircle2 size={10}/> Docs OK</> : <><Clock size={10}/> Docs pendientes</>}
          </span>
          {/* Ineligible reason */}
          {disabled && ineligibleReason && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: colors.red }}>
              <Lock size={10}/> {ineligibleReason}
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {ded > 0 ? (
          <>
            <div style={{ fontSize: 11, color: colors.textMuted, textDecoration: "line-through" }}>{fmt(gross)}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: isSelected ? colors.accent : colors.green }}>{fmt(net)}</div>
          </>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? colors.accent : colors.text }}>{fmt(gross)}</span>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InvoicesPage({ t, invoices, setInvoices, trips, clients, brokers, drivers, trucks, cobros, setCobros, isMobile }) {

  const today = new Date().toISOString().slice(0, 10);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterClient, setFilterClient] = useState("all");

  const emptyForm = {
    invoiceNumber: "",
    date: today,
    clientId: "",
    tripIds: [],
    status: "draft",
    notes: "",
    dueDate: "",
  };
  const [form, setForm] = useState(emptyForm);

  // Map of tripId → invoice (excluding the invoice being edited and cancelled invoices)
  const invoicedTripMap = useMemo(() => {
    const m = new Map();
    invoices.forEach(inv => {
      if (inv.id === editId) return;
      if (inv.status === "cancelled") return;
      (inv.tripIds || []).forEach(tid => m.set(tid, inv));
    });
    return m;
  }, [invoices, editId]);

  // Trips for the selected client (filtered by eligibility)
  const clientId = form.clientId ? Number(form.clientId) : null;
  const selectedClient = clients.find(c => c.id === clientId);

  const clientTrips = useMemo(() => {
    if (!clientId) return [];
    return trips
      .filter(tr => tr.clientId === clientId && tr.status !== "cancelled" && (tr.revenue || 0) > 0)
      .sort((a, b) => (b.date||"").localeCompare(a.date||""));
  }, [clientId, trips]);

  // Per-trip broker deductions for pass-through clients (shown in trip selector)
  const tripBrokerDeductions = useMemo(() => {
    const m = new Map();
    if (!selectedClient?.rules?.brokerPassThrough) return m;
    clientTrips.forEach(tr => {
      if (!tr.brokerId) return;
      const broker = brokers.find(b => b.id === tr.brokerId);
      if (!broker) return;
      m.set(tr.id, Math.round((tr.revenue || 0) * (broker.commissionPct || 10) / 100));
    });
    return m;
  }, [clientTrips, selectedClient, brokers]);

  const openNew = () => {
    const num = nextInvoiceNumber(invoices);
    setForm({ ...emptyForm, invoiceNumber: num });
    setEditId(null);
    setShowModal(true);
  };

  const openEdit = (inv) => {
    setForm({ ...inv, clientId: String(inv.clientId), tripIds: [...(inv.tripIds || [])] });
    setEditId(inv.id);
    setShowModal(true);
  };

  const handleClientChange = (val) => {
    const cl = clients.find(c => c.id === Number(val));
    const due = cl ? calcDueDate(form.date, cl) : "";
    setForm(prev => ({ ...prev, clientId: val, tripIds: [], dueDate: due }));
  };

  const handleDateChange = (val) => {
    const due = selectedClient ? calcDueDate(val, selectedClient) : "";
    setForm(prev => ({ ...prev, date: val, dueDate: due }));
  };

  const toggleTrip = (tripId) => {
    setForm(prev => {
      const ids = prev.tripIds.includes(tripId)
        ? prev.tripIds.filter(id => id !== tripId)
        : [...prev.tripIds, tripId];
      return { ...prev, tripIds: ids };
    });
  };

  const { invoiceGross, invoiceBrokerDeduction, invoiceTotal } = useMemo(() => {
    const isPassThrough = selectedClient?.rules?.brokerPassThrough === true;
    let gross = 0;
    let deduction = 0;
    form.tripIds.forEach(tid => {
      const tr = trips.find(t => t.id === tid);
      if (!tr) return;
      gross += tr.revenue || 0;
      if (isPassThrough && tr.brokerId) {
        const broker = brokers.find(b => b.id === tr.brokerId);
        if (broker) deduction += Math.round((tr.revenue || 0) * (broker.commissionPct || 10) / 100);
      }
    });
    return { invoiceGross: gross, invoiceBrokerDeduction: deduction, invoiceTotal: gross - deduction };
  }, [form.tripIds, trips, selectedClient, brokers]);

  const save = () => {
    if (!form.clientId || form.tripIds.length === 0) {
      alert("Selecciona un cliente y al menos un viaje.");
      return;
    }
    const cl = clients.find(c => c.id === Number(form.clientId));
    const data = {
      ...form,
      clientId: Number(form.clientId),
      dueDate: form.dueDate || calcDueDate(form.date, cl),
      amount: invoiceTotal,
      brokerDeduction: invoiceBrokerDeduction > 0 ? invoiceBrokerDeduction : undefined,
    };
    if (editId !== null) {
      setInvoices(prev => prev.map(inv => inv.id === editId ? { ...inv, ...data } : inv));
    } else {
      setInvoices(prev => [...prev, { id: nxId(prev), ...data }]);
    }
    setShowModal(false);
    setEditId(null);
  };

  const deleteInvoice = (id) => {
    if (!window.confirm("¿Eliminar esta factura? Los viajes quedarán disponibles para facturar de nuevo.")) return;
    setInvoices(prev => prev.filter(inv => inv.id !== id));
    setCobros(prev => prev.filter(c => c.invoiceId !== id));
  };

  const setStatus = (id, status) => {
    const inv = invoices.find(x => x.id === id); // read before queuing update
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    if (status === "paid" && inv) markInvoicePaid(inv);
  };

  const markInvoicePaid = (inv) => {
    const cl = clients.find(c => c.id === inv.clientId);
    if (!cl) return;
    const isPassThrough = cl?.rules?.brokerPassThrough === true;
    // Net amount per trip (gross minus broker commission for pass-through clients)
    const tripNetAmt = (tr) => {
      const gross = tr?.revenue || 0;
      if (!isPassThrough || !tr?.brokerId) return gross;
      const broker = brokers.find(b => b.id === tr.brokerId);
      if (!broker) return gross;
      return gross - Math.round(gross * (broker.commissionPct || 10) / 100);
    };
    // Group invoice trips by periodKey
    const byPeriod = new Map();
    (inv.tripIds || []).forEach(tid => {
      const tr = trips.find(t => t.id === tid);
      if (!tr) return;
      const { key } = getPeriodInfo(tr.date, cl);
      if (!byPeriod.has(key)) byPeriod.set(key, []);
      byPeriod.get(key).push(tid);
    });
    // Update cobros — mark these trips as collected in each period
    setCobros(prev => {
      let next = [...prev];
      byPeriod.forEach((tripIds, periodKey) => {
        const idx = next.findIndex(c => c.clientId === inv.clientId && c.periodKey === periodKey);
        if (idx >= 0) {
          const existing = next[idx];
          const merged = [...new Set([...(existing.collectedTripIds || []), ...tripIds])];
          const allTripsInPeriod = trips.filter(tr => {
            if (tr.clientId !== inv.clientId || !(tr.revenue > 0)) return false;
            const { key } = getPeriodInfo(tr.date, cl);
            return key === periodKey;
          });
          const allCollected = allTripsInPeriod.every(tr => merged.includes(tr.id));
          next[idx] = { ...existing, collectedTripIds: merged, status: allCollected ? "collected" : "partial", collectedDate: allCollected ? inv.date : existing.collectedDate };
        } else {
          const tripRevenue = tripIds.reduce((s, tid) => {
            const tr = trips.find(t => t.id === tid);
            return s + tripNetAmt(tr);
          }, 0);
          next.push({ id: nxId(next), clientId: inv.clientId, periodKey, status: "partial", collectedDate: null, amount: tripRevenue, collectedTripIds: tripIds });
        }
      });
      return next;
    });
  };

  // Prefer stored net amount (broker pass-through deducted at save time).
  // Fall back to gross recompute for invoices created before this field existed.
  const tripRevMap = useMemo(() => new Map(trips.map(t => [t.id, t.revenue || 0])), [trips]);
  const invAmt = (inv) => inv.amount != null
    ? inv.amount
    : (inv.tripIds || []).reduce((s, tid) => s + (tripRevMap.get(tid) || 0), 0);

  // ── Summary stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = invoices.filter(inv => inv.status !== "cancelled");
    const pending = active.filter(inv => inv.status !== "paid");
    const overdue = pending.filter(inv => inv.dueDate && inv.dueDate < today);
    return {
      totalInvoiced: active.reduce((s, inv) => s + invAmt(inv), 0),
      totalPending:  pending.reduce((s, inv) => s + invAmt(inv), 0),
      totalOverdue:  overdue.reduce((s, inv) => s + invAmt(inv), 0),
      count: active.length,
    };
  }, [invoices, tripRevMap, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered list ────────────────────────────────────────────────────────
  let filtered = [...invoices].sort((a, b) => (b.date||"").localeCompare(a.date||""));
  if (filterStatus !== "all") filtered = filtered.filter(inv => inv.status === filterStatus);
  if (filterClient !== "all") filtered = filtered.filter(inv => inv.clientId === Number(filterClient));

  return <div>
    <PageHeader title="Facturas" action={<Btn onClick={openNew}><Plus size={14}/> Nueva Factura</Btn>} />

    {/* Stats */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
      <StatCard icon={FileText}      label="Total Facturado"  value={fmt(stats.totalInvoiced)} color={colors.accent} />
      <StatCard icon={Clock}         label="Por Cobrar"       value={fmt(stats.totalPending)}  color={colors.orange} />
      <StatCard icon={AlertCircle}   label="Vencidas"         value={fmt(stats.totalOverdue)}  color={colors.red} />
      <StatCard icon={CheckCircle2}  label="Facturas Activas" value={String(stats.count)}      color={colors.green} />
    </div>

    {/* Filters */}
    <Card style={{ marginBottom: 12, padding: "10px 14px" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 11, padding: "4px 9px", borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text }}>
          <option value="all">Todos los estados</option>
          {Object.entries(STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ fontSize: 11, padding: "4px 9px", borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text }}>
          <option value="all">Todos los clientes</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
        </select>
      </div>
    </Card>

    {/* Invoice list */}
    <Card>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              <Th>Factura #</Th>
              <Th>Fecha</Th>
              <Th>Cliente</Th>
              <Th style={{ display: isMobile ? "none" : undefined }}>Viajes</Th>
              <Th align="right">Monto</Th>
              <Th style={{ display: isMobile ? "none" : undefined }}>Vence</Th>
              <Th>Estado</Th>
              <Th align="right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(inv => {
              const cl = clients.find(c => c.id === inv.clientId);
              const amount = invAmt(inv);
              const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft;
              const isOverdue = inv.status !== "paid" && inv.status !== "cancelled" && inv.dueDate && inv.dueDate < today;
              const daysLeft = inv.dueDate ? Math.ceil((new Date(inv.dueDate) - new Date(today)) / 86400000) : null;
              return (
                <tr key={inv.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                  <Td bold>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <FileText size={12} color={cfg.color}/>
                      {inv.invoiceNumber}
                    </span>
                  </Td>
                  <Td>{inv.date}</Td>
                  <Td>{cl?.companyName || "—"}</Td>
                  <Td style={{ display: isMobile ? "none" : undefined }}>{(inv.tripIds||[]).length} viajes</Td>
                  <Td align="right" bold color={colors.green}>
                    {fmt(amount)}
                    {inv.brokerDeduction > 0 && (
                      <div style={{ fontSize: 9, color: colors.orange, fontWeight: 400 }}>−{fmt(inv.brokerDeduction)} broker</div>
                    )}
                  </Td>
                  <Td style={{ display: isMobile ? "none" : undefined }}>
                    {inv.dueDate
                      ? <span style={{ fontSize: 11, color: isOverdue ? colors.red : daysLeft <= 7 ? colors.orange : colors.textMuted, fontWeight: isOverdue ? 700 : 400 }}>
                          {inv.dueDate} {isOverdue ? "⚠️" : daysLeft !== null && daysLeft <= 7 && inv.status !== "paid" ? `(${daysLeft}d)` : ""}
                        </span>
                      : <span style={{ color: colors.textMuted, fontSize: 11 }}>—</span>}
                  </Td>
                  <Td>
                    <Badge label={cfg.label} color={cfg.color}/>
                  </Td>
                  <Td align="right">
                    <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", alignItems: "center" }}>
                      {/* Quick status transitions */}
                      {inv.status === "draft" && (
                        <button onClick={() => setStatus(inv.id, "sent")} title="Marcar enviada" style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${colors.accent}`, background: "transparent", color: colors.accent, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
                          <Send size={10}/>
                        </button>
                      )}
                      {inv.status === "sent" && (
                        <button onClick={() => setStatus(inv.id, "paid")} title="Marcar cobrada" style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${colors.green}`, background: colors.green+"18", color: colors.green, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
                          ✓ Cobrar
                        </button>
                      )}
                      <button onClick={() => openEdit(inv)} title="Editar" style={{ background: "none", border: "none", color: colors.accent, cursor: "pointer", padding: 4 }}><Pencil size={13}/></button>
                      <button onClick={() => deleteInvoice(inv.id)} title="Eliminar" style={{ background: "none", border: "none", color: colors.red, cursor: "pointer", padding: 4 }}><Trash2 size={13}/></button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: colors.textMuted }}>
          <FileText size={28} style={{ margin: "0 auto 10px", opacity: 0.3, display: "block" }}/>
          <div style={{ fontSize: 13 }}>No hay facturas{filterStatus !== "all" || filterClient !== "all" ? " para este filtro" : " — crea tu primera factura"}</div>
        </div>
      )}
    </Card>

    {/* ── Modal ──────────────────────────────────────────────────────────── */}
    {showModal && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "20px 12px" }}>
        <div style={{ background: colors.card, borderRadius: 14, width: "min(680px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
          {/* Modal header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${colors.border}` }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{editId !== null ? "Editar Factura" : "Nueva Factura"}</div>
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{form.invoiceNumber}</div>
            </div>
            <button onClick={() => { setShowModal(false); setEditId(null); }} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer" }}><X size={18}/></button>
          </div>

          <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px" }}>
            {/* Form fields */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <Sel label="Cliente *" value={form.clientId} onChange={e => handleClientChange(e.target.value)}>
                <option value="">— Seleccionar cliente —</option>
                {clients.filter(c => c.status === "active" || !c.status).map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </Sel>
              <Inp label="Fecha Factura" type="date" value={form.date} onChange={e => handleDateChange(e.target.value)} />
              <Sel label="Estado" value={form.status} onChange={e => setForm(prev => ({...prev, status: e.target.value}))}>
                {Object.entries(STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </Sel>
              <div>
                <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Fecha Vencimiento</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: form.dueDate < today && form.status !== "paid" ? colors.red : colors.text, padding: "7px 0" }}>
                  {form.dueDate || (selectedClient ? calcDueDate(form.date, selectedClient) : "—")}
                  {selectedClient?.rules?.paymentTerms ? <span style={{ fontSize: 10, color: colors.textMuted, fontWeight: 400 }}> ({selectedClient.rules.paymentTerms} días)</span> : null}
                </div>
              </div>
            </div>
            <Inp label="Notas (opcional)" value={form.notes} onChange={e => setForm(prev => ({...prev, notes: e.target.value}))} placeholder="Ej: Factura correspondiente al mes de abril" style={{ marginBottom: 16, width: "100%" }} />

            {/* Trip selector */}
            {form.clientId ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    Viajes del cliente ({form.tripIds.length} seleccionados)
                  </div>
                  {form.tripIds.length > 0 && (
                    <div style={{ textAlign: "right" }}>
                      {invoiceBrokerDeduction > 0 && (
                        <div style={{ fontSize: 10, color: colors.textMuted }}>
                          Bruto: {fmt(invoiceGross)} — Deducción broker: −{fmt(invoiceBrokerDeduction)}
                        </div>
                      )}
                      <div style={{ fontSize: 13, fontWeight: 700, color: colors.green }}>
                        Total{invoiceBrokerDeduction > 0 ? " neto" : ""}: {fmt(invoiceTotal)}
                      </div>
                    </div>
                  )}
                </div>

                {clientTrips.length === 0 ? (
                  <div style={{ padding: "20px 0", textAlign: "center", color: colors.textMuted, fontSize: 12 }}>
                    Este cliente no tiene viajes con ingresos registrados
                  </div>
                ) : (
                  <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "hidden", maxHeight: 360, overflowY: "auto" }}>
                    {clientTrips.map(trip => {
                      const isInOther = invoicedTripMap.has(trip.id);
                      const docsOk = trip.docStatus === "delivered";
                      const ineligible = !docsOk;
                      const reason = !docsOk ? "Docs pendientes — entrega primero los documentos" : null;
                      return (
                        <TripSelectRow
                          key={trip.id}
                          trip={trip}
                          client={selectedClient}
                          drivers={drivers}
                          trucks={trucks}
                          isSelected={form.tripIds.includes(trip.id)}
                          isIneligible={ineligible}
                          ineligibleReason={reason}
                          isInOtherInvoice={isInOther}
                          otherInvoiceNum={isInOther ? invoicedTripMap.get(trip.id)?.invoiceNumber : null}
                          onToggle={toggleTrip}
                          brokerDeduction={tripBrokerDeductions.get(trip.id) || 0}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Legend */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                  <span style={{ fontSize: 10, color: colors.textMuted, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={10} color={colors.green}/> Docs entregados — seleccionable</span>
                  <span style={{ fontSize: 10, color: colors.textMuted, display: "flex", alignItems: "center", gap: 4 }}><Clock size={10} color={colors.orange}/> Docs pendientes — no disponible</span>
                  <span style={{ fontSize: 10, color: colors.textMuted }}>Viajes ya facturados no aparecen</span>
                </div>
              </>
            ) : (
              <div style={{ padding: "24px 0", textAlign: "center", color: colors.textMuted, fontSize: 12 }}>
                Selecciona un cliente para ver sus viajes disponibles
              </div>
            )}
          </div>

          {/* Modal footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderTop: `1px solid ${colors.border}` }}>
            <div style={{ fontSize: 12, color: colors.textMuted }}>
              {form.tripIds.length > 0 ? (
                <span style={{ color: colors.green, fontWeight: 600 }}>
                  {invoiceBrokerDeduction > 0
                    ? `${fmt(invoiceGross)} − ${fmt(invoiceBrokerDeduction)} broker = ${fmt(invoiceTotal)}`
                    : `Total: ${fmt(invoiceTotal)}`}
                </span>
              ) : "Selecciona viajes para facturar"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowModal(false); setEditId(null); }}>Cancelar</Btn>
              <Btn onClick={save} disabled={!form.clientId || form.tripIds.length === 0}>
                {editId !== null ? "Guardar Cambios" : "Crear Factura"}
              </Btn>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>;
}

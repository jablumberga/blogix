import { useState } from "react";
import { TrendingUp, ChevronDown, ChevronRight } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt } from "../utils/helpers.js";
import { Card, PageHeader } from "../components/ui/index.jsx";

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const pad = n => String(n).padStart(2, "0");

function getPeriodInfo(date, client) {
  const [y, m, d] = date.split("-").map(Number);
  const billing = client?.rules?.billingCycle;

  if (billing === "bimonthly_delayed") {
    const half = d <= 15 ? 1 : 2;
    const key = `${y}-${pad(m)}-h${half}`;
    if (half === 1) {
      const payDay = client.rules.period1PayDay || 30;
      return { key, label: `${MONTHS_ES[m-1]} 1–15, ${y}`, expectedDate: `${y}-${pad(m)}-${pad(payDay)}` };
    } else {
      const payDay = client.rules.period2PayDay || 15;
      const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
      return { key, label: `${MONTHS_ES[m-1]} 16–31, ${y}`, expectedDate: `${ny}-${pad(nm)}-${pad(payDay)}` };
    }
  } else {
    const key = `${y}-${pad(m)}`;
    const terms = client?.rules?.paymentTerms || 30;
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + terms);
    return { key, label: `${MONTHS_ES[m-1]} ${y}`, expectedDate: dt.toISOString().slice(0, 10) };
  }
}

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

  const getCobro    = (cid, pk) => cobros.find(c => c.clientId === cid && c.periodKey === pk);
  const isCollected = p => getCobro(p.clientId, p.periodKey)?.status === "collected";
  const isOverdue   = p => !isCollected(p) && p.expectedDate < today;
  const daysUntil   = p => Math.ceil((new Date(p.expectedDate) - new Date(today)) / 86400000);

  // Summary (unfiltered)
  const totalPending   = allPeriods.filter(p => !isCollected(p)).reduce((s, p) => s + p.revenue, 0);
  const totalOverdue   = allPeriods.filter(p => isOverdue(p)).reduce((s, p) => s + p.revenue, 0);
  const totalCollected = allPeriods.filter(p => isCollected(p)).reduce((s, p) => s + p.revenue, 0);
  const nextDue        = allPeriods.filter(p => !isCollected(p))
                          .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))[0];

  const allYears = [...new Set(allPeriods.map(p => p.expectedDate.slice(0, 4)))].sort().reverse();

  // Apply filters
  let periods = allPeriods;
  if (filterClient !== "all") periods = periods.filter(p => p.clientId === Number(filterClient));
  if (filterYear   !== "all") periods = periods.filter(p => p.expectedDate.startsWith(filterYear));
  if (filterStatus === "notCollected") periods = periods.filter(p => !isCollected(p));
  if (filterStatus === "overdue")      periods = periods.filter(p => isOverdue(p));
  if (filterStatus === "upcoming")     periods = periods.filter(p => !isCollected(p) && !isOverdue(p));
  if (filterStatus === "collected")    periods = periods.filter(p => isCollected(p));

  const markCollected = (clientId, periodKey, amount) => {
    const existing = getCobro(clientId, periodKey);
    if (existing) {
      setCobros(cobros.map(c =>
        c.clientId === clientId && c.periodKey === periodKey
          ? { ...c, status: "collected", collectedDate: today } : c));
    } else {
      const newId = cobros.length > 0 ? Math.max(...cobros.map(c => c.id)) + 1 : 1;
      setCobros([...cobros, { id: newId, clientId, periodKey, status: "collected", collectedDate: today, amount }]);
    }
  };

  const markPending = (clientId, periodKey) => {
    setCobros(cobros.map(c =>
      c.clientId === clientId && c.periodKey === periodKey
        ? { ...c, status: "pending", collectedDate: null } : c));
  };

  // Group by client after filters
  const clientGroups = {};
  periods.forEach(p => {
    const cid = p.clientId;
    if (!clientGroups[cid]) clientGroups[cid] = { client: p.client, periods: [], pendingAmt: 0, collectedAmt: 0 };
    clientGroups[cid].periods.push(p);
    if (isCollected(p)) clientGroups[cid].collectedAmt += p.revenue;
    else                clientGroups[cid].pendingAmt   += p.revenue;
  });

  const renderPeriod = (p) => {
    const col   = isCollected(p);
    const over  = isOverdue(p);
    const days  = daysUntil(p);
    const cobro = getCobro(p.clientId, p.periodKey);
    const expKey = `${p.clientId}-${p.periodKey}`;
    const borderColor = col ? colors.green : over ? colors.red : days <= 7 ? colors.orange : colors.border;

    return (
      <Card key={expKey} style={{ marginBottom: 8, borderLeft: `4px solid ${borderColor}`, opacity: col ? 0.8 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{p.client.companyName}</span>
              <span style={{ fontSize: 11, color: colors.textMuted }}>·</span>
              <span style={{ fontSize: 12, color: colors.textMuted }}>{p.label}</span>
              {col
                ? <span style={{ fontSize: 10, color: colors.green, background: colors.green+"18", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>✓ Cobrado</span>
                : over
                  ? <span style={{ fontSize: 10, color: colors.red, background: colors.red+"18", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>⚠ Vencido</span>
                  : days <= 7
                    ? <span style={{ fontSize: 10, color: colors.orange, background: colors.orange+"18", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>Vence pronto</span>
                    : null}
            </div>
            <div style={{ fontSize: 11, color: col ? colors.green : over ? colors.red : colors.textMuted }}>
              {col
                ? `Cobrado el ${cobro.collectedDate}`
                : over
                  ? `Venció ${p.expectedDate} · hace ${Math.abs(days)} día${Math.abs(days) !== 1 ? "s" : ""}`
                  : `Vence: ${p.expectedDate} · en ${days} día${days !== 1 ? "s" : ""}`
              }
              <span style={{ color: colors.textMuted, marginLeft: 8 }}>· {p.trips.length} viaje{p.trips.length !== 1 ? "s" : ""}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: col ? colors.green : over ? colors.red : colors.text }}>{fmt(p.revenue)}</div>
              <button onClick={() => setExpanded(e => ({ ...e, [expKey]: !e[expKey] }))}
                style={{ fontSize: 10, color: colors.textMuted, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
                {expanded[expKey] ? <ChevronDown size={10}/> : <ChevronRight size={10}/>} ver viajes
              </button>
            </div>
            {col
              ? <button onClick={() => markPending(p.clientId, p.periodKey)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>
                  Desmarcar
                </button>
              : <button onClick={() => markCollected(p.clientId, p.periodKey, p.revenue)}
                  style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: colors.green, color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                  ✓ Cobrado
                </button>
            }
          </div>
        </div>

        {expanded[expKey] && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${colors.border}33`, paddingTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  {["Fecha","Destino","Camión","NCF / Ref","Ingreso"].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 4 ? "right" : "left", padding: "3px 8px", color: colors.textMuted, fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.trips.slice().sort((a, b) => a.date.localeCompare(b.date)).map(tr => {
                  const truck = trucks?.find(t => t.id === tr.truckId);
                  return (
                    <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                      <td style={{ padding: "5px 8px" }}>{tr.date}</td>
                      <td style={{ padding: "5px 8px", color: colors.textMuted }}>{tr.municipality}, {tr.province}</td>
                      <td style={{ padding: "5px 8px", color: colors.textMuted }}>{truck?.plate || "—"}</td>
                      <td style={{ padding: "5px 8px", color: tr.invoiceRef ? colors.accentLight : colors.textMuted, fontWeight: tr.invoiceRef ? 600 : 400 }}>{tr.invoiceRef || "—"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: colors.green }}>{fmt(tr.revenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `1px solid ${colors.border}44` }}>
                  <td colSpan={4} style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11, color: colors.textMuted }}>
                    Total — {p.trips.length} viaje{p.trips.length !== 1 ? "s" : ""}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800, fontSize: 13, color: col ? colors.green : colors.text }}>
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
            {allPeriods.filter(p => !isCollected(p)).length} período{allPeriods.filter(p => !isCollected(p)).length !== 1 ? "s" : ""} pendiente{allPeriods.filter(p => !isCollected(p)).length !== 1 ? "s" : ""}
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
            {allPeriods.filter(p => isCollected(p)).length} período{allPeriods.filter(p => isCollected(p)).length !== 1 ? "s" : ""} cobrado{allPeriods.filter(p => isCollected(p)).length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 12, cursor: "pointer" }}>
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
            style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 12, cursor: "pointer" }}>
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

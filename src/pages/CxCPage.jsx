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

export default function CxCPage({ clients, trips, cobros, setCobros }) {
  const today = new Date().toISOString().slice(0, 10);
  const [expanded, setExpanded] = useState({});

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

  const periods = Object.values(grouped).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
  const getCobro = (cid, pk) => cobros.find(c => c.clientId === cid && c.periodKey === pk);

  const markCollected = (clientId, periodKey, amount) => {
    const existing = getCobro(clientId, periodKey);
    if (existing) {
      setCobros(cobros.map(c => c.clientId === clientId && c.periodKey === periodKey ? { ...c, status: "collected", collectedDate: today } : c));
    } else {
      const newId = cobros.length > 0 ? Math.max(...cobros.map(c => c.id)) + 1 : 1;
      setCobros([...cobros, { id: newId, clientId, periodKey, status: "collected", collectedDate: today, amount }]);
    }
  };

  const markPending = (clientId, periodKey) => {
    setCobros(cobros.map(c => c.clientId === clientId && c.periodKey === periodKey ? { ...c, status: "pending", collectedDate: null } : c));
  };

  const isCollected = p => getCobro(p.clientId, p.periodKey)?.status === "collected";
  const isOverdue   = p => !isCollected(p) && p.expectedDate < today;
  const daysUntil   = p => Math.ceil((new Date(p.expectedDate) - new Date(today)) / 86400000);

  const totalPending   = periods.filter(p => !isCollected(p)).reduce((s, p) => s + p.revenue, 0);
  const totalOverdue   = periods.filter(p => isOverdue(p)).reduce((s, p) => s + p.revenue, 0);
  const totalCollected = periods.filter(p => isCollected(p)).reduce((s, p) => s + p.revenue, 0);
  const nextDue        = periods.filter(p => !isCollected(p)).sort((a,b) => a.expectedDate.localeCompare(b.expectedDate))[0];

  return <div>
    <PageHeader title="Cuentas por Cobrar" />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
      <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.orange}44` }}>
        <div style={{ fontSize: 10, color: colors.orange, fontWeight: 600, marginBottom: 4 }}>POR COBRAR</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: colors.orange }}>{fmt(totalPending)}</div>
        <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{periods.filter(p => !isCollected(p)).length} período{periods.filter(p=>!isCollected(p)).length!==1?"s":""} pendiente{periods.filter(p=>!isCollected(p)).length!==1?"s":""}</div>
      </div>
      {totalOverdue > 0 && <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.red}55` }}>
        <div style={{ fontSize: 10, color: colors.red, fontWeight: 600, marginBottom: 4 }}>⚠ VENCIDO</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: colors.red }}>{fmt(totalOverdue)}</div>
        <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{periods.filter(p=>isOverdue(p)).length} período{periods.filter(p=>isOverdue(p)).length!==1?"s":""} vencido{periods.filter(p=>isOverdue(p)).length!==1?"s":""}</div>
      </div>}
      {nextDue && <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.border}` }}>
        <div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 600, marginBottom: 4 }}>PRÓXIMO VENCIMIENTO</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.cyan }}>{nextDue.expectedDate}</div>
        <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{nextDue.client.companyName} — {fmt(nextDue.revenue)}</div>
      </div>}
      <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.green}33` }}>
        <div style={{ fontSize: 10, color: colors.green, fontWeight: 600, marginBottom: 4 }}>COBRADO</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: colors.green }}>{fmt(totalCollected)}</div>
        <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{periods.filter(p=>isCollected(p)).length} período{periods.filter(p=>isCollected(p)).length!==1?"s":""} cobrado{periods.filter(p=>isCollected(p)).length!==1?"s":""}</div>
      </div>
    </div>
    {periods.length === 0 && <Card><div style={{ textAlign: "center", padding: 40, color: colors.textMuted, fontSize: 13 }}>No hay viajes con clientes asignados aún.</div></Card>}
    {periods.map(p => {
      const col = isCollected(p), over = isOverdue(p), days = daysUntil(p);
      const borderColor = col ? colors.green : over ? colors.red : colors.orange;
      const cobro = getCobro(p.clientId, p.periodKey);
      const expKey = `${p.clientId}-${p.periodKey}`;
      return <Card key={expKey} style={{ marginBottom: 10, borderLeft: `4px solid ${borderColor}`, opacity: col ? 0.75 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{p.client.companyName}</span>
              {col ? <span style={{ fontSize: 10, color: colors.green, background: colors.green+"18", padding: "2px 7px", borderRadius: 10 }}>✓ Cobrado</span>
                : over ? <span style={{ fontSize: 10, color: colors.red, background: colors.red+"18", padding: "2px 7px", borderRadius: 10 }}>⚠ Vencido</span>
                : days <= 5 ? <span style={{ fontSize: 10, color: colors.orange, background: colors.orange+"18", padding: "2px 7px", borderRadius: 10 }}>Vence pronto</span> : null}
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted }}>{p.label} · {p.trips.length} viaje{p.trips.length!==1?"s":""}</div>
            <div style={{ fontSize: 11, marginTop: 3, color: col ? colors.green : over ? colors.red : colors.textMuted }}>
              {col ? `Cobrado el ${cobro.collectedDate}`
                : over ? `Venció el ${p.expectedDate} · ${Math.abs(days)} día${Math.abs(days)!==1?"s":""} atrás`
                : `Vence: ${p.expectedDate} · en ${days} día${days!==1?"s":""}`}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: borderColor }}>{fmt(p.revenue)}</div>
              <button onClick={() => setExpanded(e => ({ ...e, [expKey]: !e[expKey] }))}
                style={{ fontSize: 10, color: colors.textMuted, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
                {expanded[expKey] ? <ChevronDown size={10}/> : <ChevronRight size={10}/>} {p.trips.length} viajes
              </button>
            </div>
            {col
              ? <button onClick={() => markPending(p.clientId, p.periodKey)} style={{ padding: "6px 11px", borderRadius: 8, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>Desmarcar</button>
              : <button onClick={() => markCollected(p.clientId, p.periodKey, p.revenue)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: colors.green, color: "white", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>✓ Cobrado</button>
            }
          </div>
        </div>
        {expanded[expKey] && <div style={{ marginTop: 12, borderTop: `1px solid ${colors.border}33`, paddingTop: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              <th style={{ textAlign: "left", padding: "3px 8px", color: colors.textMuted, fontWeight: 600, fontSize: 11 }}>Fecha</th>
              <th style={{ textAlign: "left", padding: "3px 8px", color: colors.textMuted, fontWeight: 600, fontSize: 11 }}>Ruta</th>
              <th style={{ textAlign: "left", padding: "3px 8px", color: colors.textMuted, fontWeight: 600, fontSize: 11 }}>Ref</th>
              <th style={{ textAlign: "right", padding: "3px 8px", color: colors.textMuted, fontWeight: 600, fontSize: 11 }}>Ingreso</th>
            </tr></thead>
            <tbody>{p.trips.slice().sort((a,b) => a.date.localeCompare(b.date)).map(tr => (
              <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                <td style={{ padding: "5px 8px" }}>{tr.date}</td>
                <td style={{ padding: "5px 8px", color: colors.textMuted }}>{tr.municipality}, {tr.province}</td>
                <td style={{ padding: "5px 8px", color: colors.textMuted }}>{tr.invoiceRef || "—"}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, color: colors.green }}>{fmt(tr.revenue)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
      </Card>;
    })}
  </div>;
                                      }

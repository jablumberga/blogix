import { useState } from "react";
import { Clock, ChevronDown, ChevronRight, CheckCircle2, Users } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt } from "../utils/helpers.js";
import { Card, PageHeader, Badge, Th, Td } from "../components/ui/index.jsx";

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function genPeriods(expenses) {
  const pad = n => String(n).padStart(2, "0");
  const lastDayOf = (y, m) => new Date(y, m, 0).getDate();
  const now = new Date(); const day = now.getDate();
  let y = now.getFullYear(), m = now.getMonth() + 1, h;
  if (day >= 30) { if (m === 12) { y++; m = 1; } else { m++; } h = 1; }
  else { h = day >= 15 ? 2 : 1; }
  const allDates = expenses.filter(e => e.category === "driverPay").map(e => e.date).sort();
  const earliest = allDates[0] || `${y}-${pad(m)}-01`;
  const buildPd = (py, pm, ph) => {
    const mStr = `${py}-${pad(pm)}`;
    if (ph === 1) {
      const prevM = pm === 1 ? 12 : pm - 1, prevY = pm === 1 ? py - 1 : py;
      const startDay = Math.min(30, lastDayOf(prevY, prevM));
      return { year: py, month: pm, half: ph, mStr,
        dateFrom: `${prevY}-${pad(prevM)}-${startDay}`, dateTo: `${mStr}-14`,
        label: `${MONTHS_ES[prevM-1]} ${startDay} – ${MONTHS_ES[pm-1]} 14, ${py}` };
    }
    return { year: py, month: pm, half: ph, mStr,
      dateFrom: `${mStr}-15`, dateTo: `${mStr}-29`,
      label: `${MONTHS_ES[pm-1]} 15–29, ${py}` };
  };
  const periods = [];
  for (let i = 0; i < 60; i++) {
    const pd = buildPd(y, m, h); periods.push(pd);
    if (pd.dateTo < earliest) break;
    if (h === 2) { h = 1; } else { h = 2; if (m === 1) { m = 12; y--; } else { m--; } }
  }
  return periods;
}

function NominaDriverCard({ driver, exps, pending, paid, pendingTotal, paidTotal, trips, allExpenses, periodDateFrom, periodDateTo, onMarkPaid }) {
  const [showDetail, setShowDetail] = useState(false);
  const adelantoExps = (allExpenses||[]).filter(e =>
    e.category === "adelanto_conductor" &&
    (e.driverId === driver.id || (!e.driverId && e.description && e.description.includes(driver.name))) &&
    e.date >= periodDateFrom && e.date <= periodDateTo
  );
  const adelantos = adelantoExps.reduce((s, e) => s + e.amount, 0);
  const netoAPagar = Math.max(0, pendingTotal - adelantos);

  return <Card style={{ marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: colors.accent+"22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Users size={16} color={colors.accent} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{driver.name}</div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>
            {exps.length} viaje{exps.length !== 1 ? "s" : ""} • {driver.salaryType === "fixed" ? `Fijo: ${fmt(driver.fixedAmount||0)}` : driver.salaryType === "porcentaje" ? `${driver.percentageAmount||20}%` : "20% por viaje"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setShowDetail(d => !d)} style={{ fontSize: 11, color: colors.accent, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "4px 8px" }}>
          {showDetail ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {showDetail ? "Ocultar" : "Ver detalle"}
        </button>
        {pending.length > 0
          ? <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {paidTotal > 0 && <span style={{ fontSize: 11, color: colors.green }}>Pagado: {fmt(paidTotal)}</span>}
              <div style={{ textAlign: "right" }}>
                {adelantos > 0
                  ? <>
                      <div style={{ fontSize: 10, color: colors.textMuted }}>Bruto: {fmt(pendingTotal)}</div>
                      <div style={{ fontSize: 10, color: colors.orange }}>Adelanto: –{fmt(adelantos)}</div>
                      <div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 700 }}>A TRANSFERIR</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: colors.orange }}>{fmt(netoAPagar)}</div>
                    </>
                  : <>
                      <div style={{ fontSize: 10, color: colors.textMuted }}>A PAGAR</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: colors.orange }}>{fmt(pendingTotal)}</div>
                    </>
                }
              </div>
              <button onClick={onMarkPaid} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: "none", background: colors.green, color: "white", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
                <CheckCircle2 size={13} /> Marcar Pagado
              </button>
            </div>
          : <div style={{ display: "flex", alignItems: "center", gap: 6, color: colors.green, background: colors.green+"18", padding: "6px 12px", borderRadius: 20 }}>
              <CheckCircle2 size={13} /><span style={{ fontSize: 12, fontWeight: 600 }}>Pagado · {fmt(paidTotal)}</span>
            </div>
        }
      </div>
    </div>
    {showDetail && <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>Fecha</Th><Th>Viaje #</Th><Th>Ruta</Th><Th align="right">Ingreso</Th><Th align="right">Pago Conductor</Th><Th align="right">Estado</Th>
        </tr></thead>
        <tbody>{exps.map(exp => {
          const trip = trips.find(tr => tr.id === exp.tripId);
          const isPaid = exp.status === "paid";
          return <tr key={exp.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
            <Td>{exp.date}</Td>
            <Td>{exp.tripId ? `#${exp.tripId}` : "—"}</Td>
            <Td>{trip ? `${trip.origin} → ${trip.destination || trip.municipality || ""}` : exp.description}</Td>
            <Td align="right">{trip ? fmt(trip.revenue) : "—"}</Td>
            <Td align="right" bold color={isPaid ? colors.green : colors.orange}>{fmt(exp.amount)}</Td>
            <Td align="right"><Badge label={isPaid ? "✓ Pagado" : "Pendiente"} color={isPaid ? colors.green : colors.orange} /></Td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </Card>;
}

function NominaPeriodGroup({ pd, driverCards, periodPending, periodPaid, trips, allExpenses, markPaid, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const allPaid = periodPending === 0;

  return <div style={{ marginBottom: 20 }}>
    <button onClick={() => setOpen(o => !o)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 6px", marginBottom: open ? 10 : 0, borderBottom: `2px solid ${colors.border}`, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {open ? <ChevronDown size={15} color={colors.textMuted} /> : <ChevronRight size={15} color={colors.textMuted} />}
        <span style={{ fontWeight: 700, fontSize: 14 }}>{pd.label}</span>
        <span style={{ fontSize: 11, color: colors.textMuted }}>{driverCards.length} conductor{driverCards.length !== 1 ? "es" : ""}</span>
        {allPaid
          ? <span style={{ fontSize: 11, color: colors.green, background: colors.green+"18", padding: "2px 8px", borderRadius: 10 }}>✓ Pagado</span>
          : <span style={{ fontSize: 11, color: colors.orange, background: colors.orange+"18", padding: "2px 8px", borderRadius: 10 }}>Pendiente</span>
        }
      </div>
      <div style={{ textAlign: "right" }}>
        {periodPending > 0 && <div style={{ fontSize: 17, fontWeight: 800, color: colors.orange }}>{fmt(periodPending)}</div>}
        {allPaid && <div style={{ fontSize: 15, fontWeight: 700, color: colors.green }}>✓ {fmt(periodPaid)}</div>}
        {periodPaid > 0 && periodPending > 0 && <div style={{ fontSize: 11, color: colors.green }}>Ya pagado: {fmt(periodPaid)}</div>}
      </div>
    </button>
    {open && driverCards.map(g => (
      <NominaDriverCard key={g.driver.id} {...g} trips={trips} allExpenses={allExpenses}
        periodDateFrom={pd.dateFrom} periodDateTo={pd.dateTo}
        onMarkPaid={() => markPaid(g.driver, pd)} />
    ))}
  </div>;
}

export default function NominaPage({ t, expenses, setExpenses, trips, drivers }) {
  const markPaid = (driver, pd) => {
    setExpenses(prev => prev.map(e => {
      const inPeriod = e.date >= pd.dateFrom && e.date <= pd.dateTo;
      const isThisDriver = e.driverId === driver.id || (!e.driverId && e.description && e.description.includes(driver.name));
      if (e.category === "driverPay" && inPeriod && isThisDriver && (!e.status || e.status === "pending")) {
        return { ...e, status: "paid", paidDate: new Date().toISOString().slice(0,10) };
      }
      return e;
    }));
  };

  const periods = genPeriods(expenses);
  const periodGroups = periods.map(pd => {
    const pdExps = expenses.filter(e => e.category === "driverPay" && e.date >= pd.dateFrom && e.date <= pd.dateTo);
    if (pdExps.length === 0) return null;
    const driverCards = drivers.map(driver => {
      const exps = pdExps.filter(e =>
        e.driverId === driver.id || (!e.driverId && e.description && e.description.includes(driver.name))
      );
      if (exps.length === 0) return null;
      const pending = exps.filter(e => !e.status || e.status === "pending");
      const paid    = exps.filter(e => e.status === "paid");
      return { driver, exps, pending, paid,
        pendingTotal: pending.reduce((s,e) => s+e.amount,0),
        paidTotal:    paid.reduce((s,e) => s+e.amount,0) };
    }).filter(Boolean);
    if (driverCards.length === 0) return null;
    return { pd, driverCards,
      periodPending: driverCards.reduce((s,g) => s+g.pendingTotal, 0),
      periodPaid:    driverCards.reduce((s,g) => s+g.paidTotal, 0) };
  }).filter(Boolean);

  const grandPending = periodGroups.reduce((s,g) => s+g.periodPending, 0);

  return <div>
    <PageHeader title="Nómina" />
    {grandPending > 0 && (
      <div style={{ background: colors.orange + "15", border: `1px solid ${colors.orange}40`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <Clock size={18} color={colors.orange} />
        <div>
          <div style={{ fontSize: 11, color: colors.orange, fontWeight: 600 }}>TOTAL PENDIENTE DE PAGO</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: colors.orange }}>{fmt(grandPending)}</div>
        </div>
      </div>
    )}
    {periodGroups.length === 0 && <Card><div style={{ textAlign: "center", padding: 40, color: colors.textMuted, fontSize: 13 }}>No hay nómina registrada aún.</div></Card>}
    {periodGroups.map(({ pd, driverCards, periodPending, periodPaid }, idx) => (
      <NominaPeriodGroup key={`${pd.mStr}-${pd.half}`} pd={pd} driverCards={driverCards}
        periodPending={periodPending} periodPaid={periodPaid} trips={trips}
        allExpenses={expenses} markPaid={markPaid} defaultOpen={idx === 0} />
    ))}
  </div>;
}

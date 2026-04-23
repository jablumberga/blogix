import { useState } from "react";
import { Truck, Route, TrendingUp, TrendingDown, CircleDollarSign } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, pad, MONTHS_ES } from "../utils/helpers.js";
import { Card, StatCard, PageHeader, Sel, Badge, Th, Td, StatusBadge } from "../components/ui/index.jsx";

export default function PartnerDashboard({ t, trips, trucks, expenses, partner, partnerTruckIds, clients, settlementStatus, setSettlementStatus }) {
  const [truckFilter, setTruckFilter] = useState("all");
  const now = new Date();
  const lastDayOf = (y, m) => new Date(y, m, 0).getDate();

  const _initCorte = () => {
    const day = now.getDate(), y = now.getFullYear(), m = now.getMonth() + 1;
    if (day >= 30) { const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y; return { year: ny, month: nm, half: 1 }; }
    return { year: y, month: m, half: day >= 15 ? 2 : 1 };
  };
  const _init = _initCorte();
  const [year, setYear]   = useState(_init.year);
  const [month, setMonth] = useState(_init.month);
  const [half, setHalf]   = useState(_init.half);

  const mStr = `${year}-${pad(month)}`;
  const prevM = month === 1 ? 12 : month - 1, prevY = month === 1 ? year - 1 : year;
  const dateFrom = half === 1 ? `${prevY}-${pad(prevM)}-${pad(Math.min(30, lastDayOf(prevY, prevM)))}` : `${mStr}-15`;
  const dateTo   = half === 1 ? `${mStr}-14` : `${mStr}-29`;
  const periodLabel = half === 1
    ? `${MONTHS_ES[prevM-1]} ${Math.min(30, lastDayOf(prevY, prevM))} – ${MONTHS_ES[month-1]} 14, ${year}`
    : `${MONTHS_ES[month-1]} 15–29, ${year}`;

  const prevCorte = () => {
    if (half === 2) { setHalf(1); }
    else { setHalf(2); if (month === 1) { setMonth(12); setYear(y => y - 1); } else { setMonth(m => m - 1); } }
  };
  const nextCorte = () => {
    if (half === 1) { setHalf(2); }
    else { setHalf(1); if (month === 12) { setMonth(1); setYear(y => y + 1); } else { setMonth(m => m + 1); } }
  };

  const myTrucks = trucks.filter(tk => (partnerTruckIds||[]).includes(tk.id));
  let filtered = trips.filter(tr => (partnerTruckIds||[]).includes(tr.truckId) && tr.date >= dateFrom && tr.date <= dateTo);
  if (truckFilter !== "all") filtered = filtered.filter(tr => tr.truckId === Number(truckFilter));

  const tripIdSet      = new Set(filtered.map(tr => tr.id));
  const tripDriverMap  = new Map(filtered.map(tr => [tr.id, tr.driverId]).filter(([,d]) => d));

  // Collect driver IDs from both trips and driverPay expenses (covers trips without driverId)
  const tripDriverPayExps  = expenses.filter(e => e.category === "driverPay" && tripIdSet.has(e.tripId));
  const driverIdsFromTrips = new Set(filtered.map(tr => tr.driverId).filter(Boolean));
  const driverIdsFromPay   = new Set(tripDriverPayExps.map(e => e.driverId).filter(Boolean));
  const allDriverIds       = new Set([...driverIdsFromTrips, ...driverIdsFromPay]);

  // nominaTotalOverride replaces individual driverPay for that driver in this period
  const overrideExps   = expenses.filter(e =>
    e.category === "nominaTotalOverride" &&
    allDriverIds.has(e.driverId) &&
    e.date >= dateFrom && e.date <= dateTo
  );
  const overriddenDriverIds = new Set(overrideExps.map(e => e.driverId));

  const tripExpenses   = [
    ...expenses.filter(e => {
      if (!tripIdSet.has(e.tripId)) return false;
      if (e.category === "driverPay") {
        const dId = e.driverId || tripDriverMap.get(e.tripId);
        if (dId && overriddenDriverIds.has(dId)) return false;
      }
      return true;
    }),
    ...overrideExps,
  ];
  const retenciones    = tripExpenses.filter(e => e.category === "broker_commission").reduce((s,e) => s+e.amount, 0);
  const otrosGastos    = tripExpenses.filter(e => e.category !== "broker_commission").reduce((s,e) => s+e.amount, 0);
  const rev  = filtered.reduce((s,tr) => s+tr.revenue, 0);
  const net  = rev - retenciones - otrosGastos;
  const adminComm = Math.round(net * ((partner?.commissionPct||0) / 100));
  const toReceive = net - adminComm;

  return <div>
    <PageHeader title={`Mi Dashboard — ${partner?.name || ""}`} />

    <Card style={{ marginBottom: 16, padding: "10px 14px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={prevCorte} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 13 }}>‹</button>
          <span style={{ fontWeight: 600, fontSize: 13, minWidth: 200, textAlign: "center" }}>{periodLabel}</span>
          <button onClick={nextCorte} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 13 }}>›</button>
        </div>
        <Sel value={truckFilter} onChange={e => setTruckFilter(e.target.value)} style={{ fontSize: 11 }}>
          <option value="all">Todos Mis Camiones</option>
          {myTrucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}
        </Sel>
      </div>
    </Card>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12, marginBottom: 16 }}>
      <StatCard icon={Truck} label="Mis Camiones" value={myTrucks.length} color={colors.accent} />
      <StatCard icon={Route} label={t.totalTrips} value={filtered.length} color={colors.cyan} />
      <StatCard icon={TrendingUp} label="Ingreso Bruto" value={fmt(rev)} color={colors.green} />
      <StatCard icon={TrendingDown} label="Total Deducciones" value={fmt(retenciones + otrosGastos)} color={colors.orange} />
      <StatCard icon={CircleDollarSign} label="A Recibir esta Quincena" value={fmt(toReceive)} color={toReceive >= 0 ? colors.green : colors.red} />
    </div>

    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Viajes del Período</h3>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: colors.textMuted }}>{periodLabel}</span>
          {truckFilter !== "all" && <Badge label={myTrucks.find(tk => tk.id === Number(truckFilter))?.plate || ""} color={colors.accent} />}
          <Badge label={`${filtered.length} viajes`} color={colors.cyan} />
        </div>
      </div>
      {filtered.length === 0
        ? <div style={{ textAlign: "center", padding: 32, color: colors.textMuted }}>Sin viajes para el filtro seleccionado.</div>
        : <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            <Th>{t.date}</Th><Th>Ruta</Th><Th>{t.client}</Th><Th>{t.truck}</Th><Th align="right">{t.revenue}</Th><Th align="right">Retenciones</Th><Th align="center">{t.status}</Th><Th align="center">{t.document}</Th>
          </tr></thead>
          <tbody>{filtered.slice().sort((a,b) => a.date.localeCompare(b.date)).map(tr => {
            const cl = clients.find(c => c.id === tr.clientId);
            const tk = trucks.find(t2 => t2.id === tr.truckId);
            const tripRet = expenses.filter(e => e.tripId === tr.id && e.category === "broker_commission").reduce((s,e) => s+e.amount, 0);
            return <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
              <Td>{tr.date}</Td>
              <Td>{tr.municipality}{tr.province ? `, ${tr.province}` : ""}</Td>
              <Td>{cl?.companyName || "—"}</Td>
              <Td>{tk?.plate || "—"}</Td>
              <Td align="right" bold color={colors.green}>{fmt(tr.revenue)}</Td>
              <Td align="right" color={tripRet > 0 ? colors.orange : colors.textMuted}>{tripRet > 0 ? `− ${fmt(tripRet)}` : "—"}</Td>
              <Td align="center"><StatusBadge status={tr.status} t={t} /></Td>
              <Td align="center"><Badge label={tr.docStatus === "delivered" ? t.deliveredDocs : t.pendingDocs} color={tr.docStatus === "delivered" ? colors.green : colors.orange} /></Td>
            </tr>;
          })}</tbody>
        </table>}
    </Card>
  </div>;
}

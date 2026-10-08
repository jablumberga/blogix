import { useState, useMemo } from "react";
import { Truck, Route, TrendingUp, TrendingDown, CircleDollarSign } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, pad, MONTHS_ES } from "../utils/helpers.js";
import { Card, StatCard, PageHeader, Sel, Badge, Th, Td, StatusBadge } from "../components/ui/index.jsx";

const MODES = ["quincena", "mes", "dia", "ano", "custom"];
const MODE_LABELS = { quincena: "Quincena", mes: "Mes", dia: "Día", ano: "Año", custom: "Personalizado" };

export default function PartnerDashboard({ t, trips, trucks, expenses, drivers, partner, partnerTruckIds, clients, brokers, settlementStatus, setSettlementStatus, isMobile }) {
  const now = new Date();
  const lastDayOf = (y, m) => new Date(y, m, 0).getDate();
  const todayStr = now.toISOString().slice(0, 10);

  const [truckFilter, setTruckFilter] = useState("all");
  const [viewMode, setViewMode] = useState("quincena");

  // Quincena state — new cutoffs: half-1 = 1–15, half-2 = 16–30
  const _initCorte = () => {
    const day = now.getDate(), y = now.getFullYear(), m = now.getMonth() + 1;
    if (day > 30) { const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y; return { year: ny, month: nm, half: 1 }; }
    return { year: y, month: m, half: day >= 16 ? 2 : 1 };
  };
  const _init = _initCorte();
  const [qYear, setQYear]   = useState(_init.year);
  const [qMonth, setQMonth] = useState(_init.month);
  const [qHalf, setQHalf]   = useState(_init.half);

  // Mes state
  const [mYear, setMYear]   = useState(now.getFullYear());
  const [mMonth, setMMonth] = useState(now.getMonth() + 1);

  // Día state
  const [dDate, setDDate] = useState(todayStr);

  // Año state
  const [aYear, setAYear] = useState(now.getFullYear());

  // Custom state
  const [cFrom, setCFrom] = useState(todayStr);
  const [cTo, setCTo]     = useState(todayStr);

  const { dateFrom, dateTo, periodLabel } = useMemo(() => {
    if (viewMode === "quincena") {
      const mStr = `${qYear}-${pad(qMonth)}`;
      const endDay = Math.min(30, lastDayOf(qYear, qMonth));
      if (qHalf === 1) {
        const prevM = qMonth === 1 ? 12 : qMonth - 1;
        const prevY = qMonth === 1 ? qYear - 1 : qYear;
        const dateFrom = lastDayOf(prevY, prevM) === 31 ? `${prevY}-${pad(prevM)}-31` : `${mStr}-01`;
        return { dateFrom, dateTo: `${mStr}-15`, periodLabel: `${MONTHS_ES[qMonth-1]} 1–15, ${qYear}` };
      }
      return { dateFrom: `${mStr}-16`, dateTo: `${mStr}-${pad(endDay)}`, periodLabel: `${MONTHS_ES[qMonth-1]} 16–${endDay}, ${qYear}` };
    }
    if (viewMode === "mes") {
      const mStr = `${mYear}-${pad(mMonth)}`;
      const lastDay = lastDayOf(mYear, mMonth);
      return { dateFrom: `${mStr}-01`, dateTo: `${mStr}-${pad(lastDay)}`, periodLabel: `${MONTHS_ES[mMonth-1]} ${mYear}` };
    }
    if (viewMode === "dia") {
      return { dateFrom: dDate, dateTo: dDate, periodLabel: dDate };
    }
    if (viewMode === "ano") {
      return { dateFrom: `${aYear}-01-01`, dateTo: `${aYear}-12-31`, periodLabel: `Año ${aYear}` };
    }
    return { dateFrom: cFrom, dateTo: cTo, periodLabel: `${cFrom} → ${cTo}` };
  }, [viewMode, qYear, qMonth, qHalf, mYear, mMonth, dDate, aYear, cFrom, cTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevCorte = () => {
    if (qHalf === 2) { setQHalf(1); }
    else { setQHalf(2); if (qMonth === 1) { setQMonth(12); setQYear(y => y - 1); } else { setQMonth(m => m - 1); } }
  };
  const nextCorte = () => {
    if (qHalf === 1) { setQHalf(2); }
    else { setQHalf(1); if (qMonth === 12) { setQMonth(1); setQYear(y => y + 1); } else { setQMonth(m => m + 1); } }
  };

  const clientMap = new Map((clients || []).map(c => [c.id, c]));
  const brokerMap = new Map((brokers || []).map(b => [b.id, b]));
  const pTruckSet = new Set(partnerTruckIds || []);

  const myTrucks = trucks.filter(tk => pTruckSet.has(tk.id));
  let filtered = trips.filter(tr => pTruckSet.has(tr.truckId) && tr.date >= dateFrom && tr.date <= dateTo && tr.status !== "cancelled");
  if (truckFilter !== "all") filtered = filtered.filter(tr => tr.truckId === Number(truckFilter));

  const activeTruckSet = truckFilter === "all" ? pTruckSet : new Set([Number(truckFilter)]);

  const tripIdSet     = new Set(filtered.map(tr => tr.id));
  const tripDriverMap = new Map(filtered.map(tr => [tr.id, tr.driverId]).filter(([,d]) => d));

  const tripDriverPayExps  = expenses.filter(e => e.category === "driverPay" && tripIdSet.has(e.tripId));
  const driverIdsFromTrips = new Set(filtered.map(tr => tr.driverId).filter(Boolean));
  const driverIdsFromPay   = new Set(tripDriverPayExps.map(e => e.driverId).filter(Boolean));
  const allDriverIds       = new Set([...driverIdsFromTrips, ...driverIdsFromPay]);

  // Include fixed-salary drivers whose nómina arrives only via nominaTotalOverride
  expenses.forEach(e => {
    if (e.category !== "nominaTotalOverride") return;
    if (!e.driverId || allDriverIds.has(e.driverId)) return;
    if (!(e.date >= dateFrom && e.date <= dateTo)) return;
    const driverTruckId = (drivers || []).find(d => d.id === e.driverId)?.truckId;
    if ((e.truckId && pTruckSet.has(e.truckId)) || (driverTruckId && pTruckSet.has(driverTruckId))) {
      allDriverIds.add(e.driverId);
    }
  });

  const overrideExps = expenses.filter(e =>
    e.category === "nominaTotalOverride" &&
    allDriverIds.has(e.driverId) &&
    e.date >= dateFrom && e.date <= dateTo
  );
  const overriddenDriverIds = new Set(overrideExps.map(e => e.driverId));

  const allExpenses = [
    ...expenses.filter(e => {
      if (!tripIdSet.has(e.tripId)) return false;
      if (e.category === "driverPay") {
        const dId = e.driverId || tripDriverMap.get(e.tripId);
        if (dId && overriddenDriverIds.has(dId)) return false;
      }
      return true;
    }),
    ...overrideExps,
    // Non-trip expenses linked to partner's active truck(s) by truckId
    ...expenses.filter(e =>
      !e.tripId && e.truckId && activeTruckSet.has(e.truckId) &&
      e.date >= dateFrom && e.date <= dateTo
    ),
  ];

  const retenciones = allExpenses.filter(e => e.category === "broker_commission").reduce((s,e) => s+e.amount, 0);
  const otrosGastos = allExpenses.filter(e => e.category !== "broker_commission").reduce((s,e) => s+e.amount, 0);

  const passThruDeduction = filtered.reduce((s, tr) => {
    const cl = clientMap.get(tr.clientId);
    if (!cl?.rules?.brokerPassThrough || !tr.brokerId) return s;
    const br = brokerMap.get(tr.brokerId);
    if (!br) return s;
    return s + Math.round((tr.revenue || 0) * (br.commissionPct || 10) / 100);
  }, 0);

  const grossRev         = filtered.reduce((s,tr) => s+(tr.revenue||0), 0);
  const rev              = grossRev - passThruDeduction;
  const totalDeducciones = passThruDeduction + retenciones + otrosGastos;
  const net              = rev - retenciones - otrosGastos;
  const adminComm        = Math.max(0, Math.round(net * ((partner?.commissionPct||0) / 100)));
  const toReceive        = net - adminComm;

  const inputStyle = { padding: "4px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 12 };

  return <div>
    <PageHeader title={`Mi Dashboard — ${partner?.name || ""}`} />

    <Card style={{ marginBottom: 16, padding: "10px 14px" }}>
      {/* Mode selector pills */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {MODES.map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            padding: "4px 11px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
            background: viewMode === mode ? colors.accent : colors.inputBg,
            color: viewMode === mode ? "white" : colors.textMuted,
            transition: "background 0.15s",
          }}>
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      {/* Date controls + truck filter */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {viewMode === "quincena" && <>
            <button onClick={prevCorte} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 13 }}>‹</button>
            <span style={{ fontWeight: 600, fontSize: 13, minWidth: 180, textAlign: "center" }}>{periodLabel}</span>
            <button onClick={nextCorte} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 13 }}>›</button>
          </>}
          {viewMode === "mes" && <>
            <Sel value={mMonth} onChange={e => setMMonth(Number(e.target.value))} style={{ fontSize: 11 }}>
              {MONTHS_ES.map((mn, i) => <option key={i+1} value={i+1}>{mn}</option>)}
            </Sel>
            <input type="number" value={mYear} onChange={e => setMYear(Number(e.target.value))} style={{ ...inputStyle, width: 72 }} />
          </>}
          {viewMode === "dia" && (
            <input type="date" value={dDate} onChange={e => setDDate(e.target.value)} style={inputStyle} />
          )}
          {viewMode === "ano" && (
            <input type="number" value={aYear} onChange={e => setAYear(Number(e.target.value))} style={{ ...inputStyle, width: 88 }} />
          )}
          {viewMode === "custom" && <>
            <input type="date" value={cFrom} onChange={e => setCFrom(e.target.value)} style={inputStyle} />
            <span style={{ color: colors.textMuted, fontSize: 11 }}>→</span>
            <input type="date" value={cTo} onChange={e => setCTo(e.target.value)} style={inputStyle} />
          </>}
        </div>
        <Sel value={truckFilter} onChange={e => setTruckFilter(e.target.value)} style={{ fontSize: 11 }}>
          <option value="all">Todos Mis Camiones</option>
          {myTrucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}
        </Sel>
      </div>
    </Card>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12, marginBottom: 16 }}>
      <StatCard icon={Truck}           label="Mis Camiones"  value={myTrucks.length}  color={colors.accent} />
      <StatCard icon={Route}           label={t.totalTrips}  value={filtered.length}  color={colors.cyan} />
      <StatCard icon={TrendingUp}      label={passThruDeduction > 0 ? "Ingreso Neto" : "Ingreso Bruto"} value={fmt(rev)} color={colors.green} />
      <StatCard icon={TrendingDown}    label="Total Deducciones" value={fmt(totalDeducciones)} color={colors.orange} />
      <StatCard icon={CircleDollarSign} label="A Recibir"   value={fmt(toReceive)}   color={toReceive >= 0 ? colors.green : colors.red} />
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
        : <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              <Th>{t.date}</Th><Th>Ruta</Th><Th>{t.client}</Th><Th>{t.truck}</Th>
              <Th align="right">{t.revenue}</Th><Th align="right">Retenciones</Th>
              <Th align="center">{t.status}</Th><Th align="center">{t.document}</Th>
            </tr></thead>
            <tbody>{filtered.slice().sort((a,b) => a.date.localeCompare(b.date)).map(tr => {
              const cl = clientMap.get(tr.clientId);
              const tk = trucks.find(t2 => t2.id === tr.truckId);
              const tripRet = expenses.filter(e => e.tripId === tr.id && e.category === "broker_commission").reduce((s,e) => s+e.amount, 0);
              const isPassThru = cl?.rules?.brokerPassThrough && tr.brokerId;
              const passThruTripDed = isPassThru ? (() => {
                const br = brokerMap.get(tr.brokerId);
                return br ? Math.round((tr.revenue || 0) * (br.commissionPct || 10) / 100) : 0;
              })() : 0;
              const totalTripDed = tripRet + passThruTripDed;
              return <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                <Td>{tr.date}</Td>
                <Td>{tr.municipality}{tr.province ? `, ${tr.province}` : ""}</Td>
                <Td>{cl?.companyName || "—"}</Td>
                <Td>{tk?.plate || "—"}</Td>
                <Td align="right" bold color={colors.green}>{fmt(tr.revenue)}</Td>
                <Td align="right" color={totalTripDed > 0 ? colors.orange : colors.textMuted}>
                  {totalTripDed > 0 ? `− ${fmt(totalTripDed)}` : "—"}
                </Td>
                <Td align="center"><StatusBadge status={tr.status} t={t} /></Td>
                <Td align="center"><Badge label={tr.docStatus === "delivered" ? t.deliveredDocs : t.pendingDocs} color={tr.docStatus === "delivered" ? colors.green : colors.orange} /></Td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
    </Card>
  </div>;
}

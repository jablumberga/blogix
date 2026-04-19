import { useState } from "react";
import { AlertCircle, AlertTriangle, Bell, CheckCircle2, Calendar, Banknote } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, monthStr, getPeriodInfo } from "../utils/helpers.js";
import { Card, PageHeader, Th, Td, StatusBadge } from "../components/ui/index.jsx";

// ── Mini stat block ─────────────────────────────────────────────────────────
function Stat({ label, value, color, sub, onClick }) {
  return (
    <div onClick={onClick}
      style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.border}`, cursor: onClick ? "pointer" : "default", transition: "border-color 0.15s" }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = color || colors.accent)}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = colors.border)}>
      <div style={{ fontSize: 10, color: color || colors.textMuted, fontWeight: 700, marginBottom: 4, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || colors.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Row in a mini table ─────────────────────────────────────────────────────
function MiniRow({ label, value, color, pct, bar }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${colors.border}11` }}>
      <div style={{ flex: 1, fontSize: 12, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      {bar !== undefined && (
        <div style={{ width: 60, height: 4, background: colors.border, borderRadius: 2, flexShrink: 0 }}>
          <div style={{ width: `${Math.min(100, bar)}%`, height: "100%", background: color || colors.accent, borderRadius: 2 }} />
        </div>
      )}
      {pct !== undefined && <div style={{ fontSize: 10, color: colors.textMuted, width: 32, textAlign: "right", flexShrink: 0 }}>{pct.toFixed(0)}%</div>}
      <div style={{ fontSize: 12, fontWeight: 700, color: color || colors.text, flexShrink: 0 }}>{value}</div>
    </div>
  );
}
export default function AdminDashboard({ t, trips, trucks, expenses, clients, drivers, partners, brokers, suppliers, cobros, alerts, setPage }) {
  const cm = monthStr();
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(`${cm}-01`);
  const [dateTo,   setDateTo]   = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(new Date(n.getFullYear(),n.getMonth()+1,0).getDate()).padStart(2,"0")}`; });

  const lastDay = (year, month) => String(new Date(year, month, 0).getDate()).padStart(2, "0");

  const setPreset = (preset) => {
    const now = new Date();
    const y = now.getFullYear(), mn = now.getMonth() + 1;
    const mo = String(mn).padStart(2, "0"), d = String(now.getDate()).padStart(2, "0");
    if (preset === "thisMonth")  { setDateFrom(`${y}-${mo}-01`); setDateTo(`${y}-${mo}-${lastDay(y, mn)}`); }
    else if (preset === "lastMonth") {
      const lm = new Date(y, mn - 2, 1);
      const ly = lm.getFullYear(), lmn = lm.getMonth() + 1, lmo = String(lmn).padStart(2, "0");
      setDateFrom(`${ly}-${lmo}-01`); setDateTo(`${ly}-${lmo}-${lastDay(ly, lmn)}`);
    } else if (preset === "quincena") {
      if (now.getDate() <= 15) { setDateFrom(`${y}-${mo}-01`); setDateTo(`${y}-${mo}-15`); }
      else { setDateFrom(`${y}-${mo}-16`); setDateTo(`${y}-${mo}-${lastDay(y, mn)}`); }
    } else if (preset === "last30") {
      const from = new Date(now); from.setDate(from.getDate() - 30);
      setDateFrom(from.toISOString().slice(0, 10)); setDateTo(`${y}-${mo}-${d}`);
    } else if (preset === "year") { setDateFrom(`${y}-01-01`); setDateTo(`${y}-12-31`); }
  };

  // ── Period trips ─────────────────────────────────────────────────────────
  const mt = trips.filter(tr => tr.date >= dateFrom && tr.date <= dateTo && tr.status !== "cancelled");
  const revenue = mt.reduce((s, tr) => s + (tr.revenue || 0), 0);

  // ── Expenses in period (trip-linked by trip date, non-trip by expense date) ──
  const periodTripIds = new Set(mt.map(tr => tr.id));
  const periodExpenses = expenses.filter(e =>
    (e.tripId && periodTripIds.has(e.tripId)) ||
    (!e.tripId && e.date >= dateFrom && e.date <= dateTo)
  );

  const nomina       = periodExpenses.filter(e => e.category === "driverPay").reduce((s,e) => s + e.amount, 0);
  const brokerFees   = periodExpenses.filter(e => e.category === "broker_commission").reduce((s,e) => s + e.amount, 0);
  const operExp      = periodExpenses.filter(e => !["driverPay","broker_commission"].includes(e.category)).reduce((s,e) => s + e.amount, 0);
  const totalExp     = nomina + brokerFees + operExp;
  const grossProfit  = revenue - totalExp;
  const margin       = revenue > 0 ? (grossProfit / revenue * 100) : 0;

  // ── CxC (accounts receivable) ───────────────────────────────────────────
  const cxcGrouped = {};
  trips.forEach(tr => {
    if (!tr.clientId || !(tr.revenue > 0)) return;
    const client = clients.find(c => c.id === tr.clientId);
    if (!client) return;
    const { key, expectedDate } = getPeriodInfo(tr.date, client);
    const gKey = `${tr.clientId}::${key}`;
    if (!cxcGrouped[gKey]) cxcGrouped[gKey] = { clientId: tr.clientId, periodKey: key, expectedDate, revenue: 0 };
    cxcGrouped[gKey].revenue += tr.revenue || 0;
  });
  const cobroMap     = new Map(cobros.map(c => [`${c.clientId}::${c.periodKey}`, c]));
  const getCobro     = (cid, pk) => cobroMap.get(`${cid}::${pk}`);
  const cxcPeriods   = Object.values(cxcGrouped);
  const cxcCollected = cxcPeriods.filter(p => getCobro(p.clientId, p.periodKey)?.status === "collected");
  const cxcPending   = cxcPeriods.filter(p => getCobro(p.clientId, p.periodKey)?.status !== "collected");
  const cxcOverdue   = cxcPending.filter(p => p.expectedDate < today);
  const cxcUpcoming  = cxcPending.filter(p => p.expectedDate >= today).sort((a,b) => a.expectedDate.localeCompare(b.expectedDate));
  const totalCxC     = cxcPending.reduce((s, p) => s + p.revenue, 0);
  const totalOverdue = cxcOverdue.reduce((s, p) => s + p.revenue, 0);
  const totalCollected = cxcCollected.reduce((s, p) => s + p.revenue, 0);
  const nextDue      = cxcUpcoming[0];

  // ── CxP (accounts payable — all pending expenses) ──────────────────────
  const allPending   = expenses.filter(e => !e.status || e.status === "pending");
  const cxpNomina    = allPending.filter(e => e.category === "driverPay").reduce((s,e) => s + e.amount, 0);
  const cxpSupplier  = allPending.filter(e => ["fuel","repair","maintenance","tire","helper","other","toll"].includes(e.category)).reduce((s,e) => s + e.amount, 0);
  const cxpFijos     = allPending.filter(e => ["loan","insurance"].includes(e.category)).reduce((s,e) => s + e.amount, 0);
  const totalCxP     = cxpNomina + cxpSupplier + cxpFijos;

  // ── Net cash position ───────────────────────────────────────────────────
  const cashPosition = totalCxC - totalCxP;

  // ── Broker commissions in period ────────────────────────────────────────
  const brokerBreakdown = brokers.map(br => {
    const brTrips = mt.filter(tr => tr.brokerId === br.id);
    const brRev   = brTrips.reduce((s, tr) => s + (tr.revenue || 0), 0);
    const brFee   = periodExpenses.filter(e => e.category === "broker_commission" && brTrips.some(tr => tr.id === e.tripId)).reduce((s,e) => s + e.amount, 0);
    return { broker: br, trips: brTrips.length, revenue: brRev, fee: brFee };
  }).filter(b => b.trips > 0 || b.fee > 0).sort((a,b) => b.fee - a.fee);

  // ── Rentabilidad por camion (period) ────────────────────────────────────
  const truckStats = trucks.map(tk => {
    const tkTrips   = mt.filter(tr => tr.truckId === tk.id);
    const tkRev     = tkTrips.reduce((s, tr) => s + (tr.revenue || 0), 0);
    const tkTripIds = new Set(tkTrips.map(tr => tr.id));
    const tkExp     = periodExpenses.filter(e => e.tripId && tkTripIds.has(e.tripId)).reduce((s,e) => s + e.amount, 0);
    const tkNet     = tkRev - tkExp;
    const tkMargin  = tkRev > 0 ? tkNet / tkRev * 100 : 0;
    const partner     = tk.owner === "partner" ? partners.find(p => p.id === tk.partnerId) : null;
    const partnerComm = partner ? Math.max(0, tkNet) * ((partner.commissionPct || 0) / 100) : 0;
    const adminNet    = tkNet - partnerComm;
    const adminMargin = tkRev > 0 ? adminNet / tkRev * 100 : 0;
    return { truck: tk, trips: tkTrips.length, revenue: tkRev, expenses: tkExp, net: tkNet, margin: tkMargin, partner, partnerComm, adminNet, adminMargin };
  }).filter(t => t.trips > 0).sort((a,b) => b.revenue - a.revenue);

  const totalPartnerComm = truckStats.reduce((s, ts) => s + ts.partnerComm, 0);
  const realProfit  = grossProfit - totalPartnerComm;
  const realMargin  = revenue > 0 ? realProfit / revenue * 100 : 0;
  const maxTruckRev = truckStats[0]?.revenue || 1;

  // ── Top clientes (period) ───────────────────────────────────────────────
  const clientStats = clients.map(cl => {
    const clTrips = mt.filter(tr => tr.clientId === cl.id);
    const clRev   = clTrips.reduce((s, tr) => s + (tr.revenue || 0), 0);
    return { client: cl, trips: clTrips.length, revenue: clRev };
  }).filter(c => c.trips > 0).sort((a,b) => b.revenue - a.revenue);
  const maxClientRev = clientStats[0]?.revenue || 1;

  // ── Trip pipeline ───────────────────────────────────────────────────────
  const allActive = trips.filter(tr => tr.status !== "cancelled");
  const pending_trips   = allActive.filter(tr => tr.status === "pending").length;
  const transit_trips   = allActive.filter(tr => tr.status === "in_transit").length;
  const delivered_trips = allActive.filter(tr => tr.status === "delivered").length;

  // ── Alerts ──────────────────────────────────────────────────────────────
  const errCount  = alerts.filter(a => a.severity === "error").length;
  const warnCount = alerts.filter(a => a.severity === "warning").length;
  const infoCount = alerts.filter(a => a.severity === "info").length;

  const SectionTitle = ({ label, color }) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: color || colors.textMuted, letterSpacing: "0.06em", marginBottom: 10, textTransform: "uppercase" }}>{label}</div>
  );

  return (
    <div>
      <PageHeader title="Dashboard — B-Logix" />

      {/* ── Date filter ── */}
      <Card style={{ marginBottom: 16, padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Calendar size={14} color={colors.textMuted} />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 12 }} />
          <span style={{ fontSize: 12, color: colors.textMuted }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 12 }} />
          {[
            { key: "thisMonth", label: "Este mes" },
            { key: "lastMonth", label: "Mes anterior" },
            { key: "quincena", label: "Quincena" },
            { key: "last30",   label: "Ultimos 30d" },
            { key: "year",     label: "Este año" },
          ].map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              style={{ padding: "4px 10px", borderRadius: 14, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      {/* ── Row 1: KPIs financieros ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="INGRESOS" value={fmt(revenue)} color={colors.green}
          sub={`${mt.length} viaje${mt.length !== 1 ? "s" : ""}`} />
        <Stat label="GASTOS TOTALES" value={fmt(totalExp)} color={colors.red}
          sub={`Nomina + brokers + oper.`} />
        <Stat label="BENEFICIO REAL" value={fmt(realProfit)} color={realProfit >= 0 ? colors.green : colors.red}
          sub={`${realMargin.toFixed(1)}% · tras socios`} />
        <Stat label="CxC POR COBRAR" value={fmt(totalCxC)} color={colors.orange}
          sub={`${cxcPending.length} periodo${cxcPending.length !== 1 ? "s" : ""} pendiente${cxcPending.length !== 1 ? "s" : ""} (historico)`}
          onClick={() => setPage("cxc")} />
        <Stat label="CxP PENDIENTE" value={fmt(totalCxP)} color={colors.red}
          sub={`Nomina + suplidores + fijos`}
          onClick={() => setPage("cxp")} />
        <Stat label="POSICION DE CAJA" value={fmt(cashPosition)} color={cashPosition >= 0 ? colors.cyan : colors.red}
          sub={cashPosition >= 0 ? "CxC supera CxP ok" : "CxP supera CxC alerta"} />
      </div>

      {/* ── Row 2: CxC · CxP · Brokers ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>

        {/* CxC */}
        <Card style={{ cursor: "pointer" }} onClick={() => setPage("cxc")}>
          <SectionTitle label="Cuentas por Cobrar" color={colors.orange} />
          <MiniRow label="Vencido" value={fmt(totalOverdue)} color={totalOverdue > 0 ? colors.red : colors.textMuted} />
          <MiniRow label="Pendiente total" value={fmt(totalCxC)} color={colors.orange} />
          {nextDue && (
            <MiniRow
              label={`Prox: ${clients.find(c => c.id === nextDue.clientId)?.companyName?.split(" ")[0] || "—"} (${nextDue.expectedDate})`}
              value={fmt(nextDue.revenue)} color={colors.cyan} />
          )}
          <MiniRow label="Cobrado" value={fmt(totalCollected)} color={colors.green} />
          <div style={{ marginTop: 10, fontSize: 10, color: colors.accent, textAlign: "right" }}>Ver Cuentas x Cobrar</div>
        </Card>

        {/* CxP */}
        <Card style={{ cursor: "pointer" }} onClick={() => setPage("cxp")}>
          <SectionTitle label="Cuentas por Pagar" color={colors.red} />
          <MiniRow label="Nomina conductores" value={fmt(cxpNomina)} color={colors.accent} />
          <MiniRow label="Suplidores / Oper." value={fmt(cxpSupplier)} color={colors.orange} />
          <MiniRow label="Fijos (prestamos+seg.)" value={fmt(cxpFijos)} color={colors.red} />
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted }}>TOTAL PENDIENTE</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: colors.red }}>{fmt(totalCxP)}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: colors.accent, textAlign: "right" }}>Ver Cuentas x Pagar</div>
        </Card>

        {/* Brokers */}
        <Card>
          <SectionTitle label="Comisiones Brokers" color={colors.yellow} />
          {brokerBreakdown.length === 0
            ? <div style={{ fontSize: 12, color: colors.textMuted, padding: "10px 0" }}>Sin viajes con broker en el periodo</div>
            : brokerBreakdown.map(b => (
                <MiniRow key={b.broker.id}
                  label={`${b.broker.name} (${b.broker.commissionPct}%) · ${b.trips} v.`}
                  value={fmt(b.fee)} color={colors.yellow} />
              ))
          }
          {brokerFees > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted }}>TOTAL COMISIONES</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: colors.yellow }}>{fmt(brokerFees)}</span>
            </div>
          )}
        </Card>
      </div>

      {/* ── Row 3: P&L desglose · Rentabilidad camiones ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>

        {/* P&L desglose */}
        <Card>
          <SectionTitle label="Desglose de Gastos del Periodo" color={colors.red} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { label: "Ingresos brutos", value: revenue, color: colors.green, icon: "up" },
              { label: `Nomina conductores (${revenue > 0 ? (nomina/revenue*100).toFixed(0) : 0}%)`, value: -nomina, color: colors.accent, icon: "dn" },
              { label: `Comisiones brokers (${revenue > 0 ? (brokerFees/revenue*100).toFixed(0) : 0}%)`, value: -brokerFees, color: colors.yellow, icon: "dn" },
              { label: `Gastos operativos (${revenue > 0 ? (operExp/revenue*100).toFixed(0) : 0}%)`, value: -operExp, color: colors.orange, icon: "dn" },
              ...(totalPartnerComm > 0 ? [{ label: `Liquidaciones socios (${revenue > 0 ? (totalPartnerComm/revenue*100).toFixed(0) : 0}%)`, value: -totalPartnerComm, color: colors.purple, icon: "dn" }] : []),
            ].map(({ label, value, color, icon }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${colors.border}11` }}>
                <span style={{ fontSize: 12, color: colors.textMuted }}>{icon === "up" ? "+" : "-"} {label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color }}>{fmt(Math.abs(value))}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 0", marginTop: 4, borderTop: `2px solid ${colors.border}` }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Beneficio real admin</span>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: realProfit >= 0 ? colors.green : colors.red }}>{fmt(realProfit)}</span>
                <span style={{ fontSize: 11, color: colors.textMuted, marginLeft: 8 }}>{realMargin.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Rentabilidad por camion */}
        <Card>
          <SectionTitle label="Rentabilidad por Camion" color={colors.accent} />
          {truckStats.length === 0
            ? <div style={{ fontSize: 12, color: colors.textMuted, padding: "10px 0" }}>Sin viajes en el periodo</div>
            : truckStats.map(ts => {
                const isPartner = !!ts.partner;
                const dispNet    = isPartner ? ts.adminNet    : ts.net;
                const dispMargin = isPartner ? ts.adminMargin : ts.margin;
                return (
                  <div key={ts.truck.id} style={{ padding: "7px 0", borderBottom: `1px solid ${colors.border}11` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        {ts.truck.plate}
                        <span style={{ fontSize: 10, color: colors.textMuted, marginLeft: 5 }}>{ts.truck.size || "T1"} · {ts.trips} v.</span>
                        {isPartner && <span style={{ fontSize: 9, background: colors.purple+"22", color: colors.purple, borderRadius: 4, padding: "1px 5px", marginLeft: 5 }}>{ts.partner.name.split(" ")[0]} {ts.partner.commissionPct}%</span>}
                      </span>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: dispNet >= 0 ? colors.green : colors.red }}>{fmt(dispNet)}</span>
                        <span style={{ fontSize: 10, color: colors.textMuted, marginLeft: 6 }}>{dispMargin.toFixed(0)}%</span>
                      </div>
                    </div>
                    {isPartner && (
                      <div style={{ fontSize: 10, color: colors.textMuted, marginBottom: 3 }}>
                        Bruto: <span style={{ color: colors.accent }}>{fmt(ts.net)}</span>
                        {" · "}Socio: <span style={{ color: colors.purple }}>−{fmt(ts.partnerComm)}</span>
                        {" · "}Tu parte: <span style={{ color: colors.green, fontWeight: 600 }}>{fmt(ts.adminNet)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <div style={{ flex: 1, height: 4, background: colors.border, borderRadius: 2 }}>
                        <div style={{ width: `${ts.revenue / maxTruckRev * 100}%`, height: "100%", background: dispNet >= 0 ? colors.green : colors.red, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 10, color: colors.textMuted, width: 70, textAlign: "right" }}>Rev: {fmt(ts.revenue)}</span>
                    </div>
                  </div>
                );
              })
          }
        </Card>
      </div>

      {/* ── Row 4: Top clientes · Pipeline · Alertas ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>

        {/* Top clientes */}
        <Card>
          <SectionTitle label="Top Clientes (Periodo)" color={colors.purple} />
          {clientStats.length === 0
            ? <div style={{ fontSize: 12, color: colors.textMuted, padding: "10px 0" }}>Sin datos en el periodo</div>
            : clientStats.slice(0, 8).map(cs => (
                <MiniRow key={cs.client.id}
                  label={`${cs.client.companyName} · ${cs.trips}v`}
                  value={fmt(cs.revenue)}
                  color={colors.purple}
                  bar={cs.revenue / maxClientRev * 100}
                  pct={revenue > 0 ? cs.revenue / revenue * 100 : 0} />
              ))
          }
        </Card>

        {/* Pipeline de viajes */}
        <Card>
          <SectionTitle label="Pipeline de Viajes" color={colors.cyan} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { label: "Pendientes", count: pending_trips, color: colors.textMuted },
              { label: "En transito", count: transit_trips, color: colors.cyan },
              { label: "Entregados", count: delivered_trips, color: colors.green },
              { label: "Total activos", count: allActive.length, color: colors.accent },
            ].map(({ label, count, color }) => (
              <div key={label} style={{ background: colors.inputBg, borderRadius: 8, padding: "10px 12px", cursor: "pointer" }} onClick={() => setPage("trips")}>
                <div style={{ fontSize: 10, color, fontWeight: 700, marginBottom: 2 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color }}>{count}</div>
              </div>
            ))}
          </div>
          <SectionTitle label="Ultimos viajes" color={colors.textMuted} />
          {[...trips].sort((a,b) => b.date.localeCompare(a.date)).slice(0,4).map(tr => {
            const cl = clients.find(c => c.id === tr.clientId);
            return (
              <div key={tr.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${colors.border}11`, fontSize: 11 }}>
                <span style={{ color: colors.textMuted }}>{tr.date}</span>
                <span style={{ fontWeight: 600, flex: 1, marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cl?.companyName || "—"}</span>
                <span style={{ color: colors.green, fontWeight: 700 }}>{fmt(tr.revenue)}</span>
              </div>
            );
          })}
          <div style={{ marginTop: 8, fontSize: 10, color: colors.accent, textAlign: "right", cursor: "pointer" }} onClick={() => setPage("trips")}>Ver todos los viajes</div>
        </Card>

        {/* Alertas */}
        <Card style={{ cursor: "pointer" }} onClick={() => setPage("agents")}>
          <SectionTitle label="Alertas del Sistema" color={colors.red} />
          {alerts.length === 0
            ? <div style={{ display: "flex", alignItems: "center", gap: 8, color: colors.green, fontSize: 13, padding: "10px 0" }}>
                <CheckCircle2 size={16} /> Todo en orden
              </div>
            : <>
                {errCount > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: colors.red+"12", borderRadius: 8, border: `1px solid ${colors.red}30`, marginBottom: 8 }}>
                    <AlertCircle size={15} color={colors.red} />
                    <span style={{ fontWeight: 700, color: colors.red, fontSize: 18 }}>{errCount}</span>
                    <span style={{ color: colors.red, fontSize: 12 }}>error{errCount !== 1 ? "s" : ""} critico{errCount !== 1 ? "s" : ""}</span>
                  </div>
                )}
                {warnCount > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: colors.orange+"12", borderRadius: 8, border: `1px solid ${colors.orange}30`, marginBottom: 8 }}>
                    <AlertTriangle size={15} color={colors.orange} />
                    <span style={{ fontWeight: 700, color: colors.orange, fontSize: 18 }}>{warnCount}</span>
                    <span style={{ color: colors.orange, fontSize: 12 }}>advertencia{warnCount !== 1 ? "s" : ""}</span>
                  </div>
                )}
                {infoCount > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: colors.accent+"12", borderRadius: 8, border: `1px solid ${colors.accent}30`, marginBottom: 8 }}>
                    <Bell size={15} color={colors.accent} />
                    <span style={{ fontWeight: 700, color: colors.accent, fontSize: 18 }}>{infoCount}</span>
                    <span style={{ color: colors.accent, fontSize: 12 }}>notificacion{infoCount !== 1 ? "es" : ""}</span>
                  </div>
                )}
                {alerts.filter(a => a.severity === "error").slice(0,2).map(a => (
                  <div key={a.id} style={{ fontSize: 10, color: colors.red, padding: "3px 0", borderBottom: `1px solid ${colors.border}11` }}>
                    {a.msg}
                  </div>
                ))}
              </>
          }
          <div style={{ marginTop: 10, fontSize: 10, color: colors.accent, textAlign: "right" }}>Ver Agentes</div>
        </Card>
      </div>

      {/* ── Nomina pendiente banner ── */}
      {cxpNomina > 0 && (
        <Card style={{ background: `linear-gradient(135deg, ${colors.accent}10, ${colors.green}08)`, cursor: "pointer", marginBottom: 0 }} onClick={() => setPage("nomina")}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Banknote size={20} color={colors.accent} />
              <div>
                <div style={{ fontSize: 11, color: colors.accent, fontWeight: 700 }}>NOMINA PENDIENTE DE PAGO</div>
                <div style={{ fontSize: 11, color: colors.textMuted }}>Conductores con pagos por procesar</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: colors.orange }}>{fmt(cxpNomina)}</div>
              <span style={{ fontSize: 11, color: colors.accent }}>Ir a Nomina</span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

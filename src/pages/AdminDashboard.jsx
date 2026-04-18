import { useState } from "react";
import { Truck, Route, TrendingUp, TrendingDown, DollarSign, Building2, ShieldCheck, AlertCircle, AlertTriangle, Bell, CheckCircle2, Calendar } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, monthStr } from "../utils/helpers.js";
import { Card, StatCard, PageHeader, Th, Td, StatusBadge } from "../components/ui/index.jsx";

export default function AdminDashboard({ t, trips, trucks, expenses, clients, partners, suppliers, alerts, setPage }) {
  const cm = monthStr();
  const [dateFrom, setDateFrom] = useState(`${cm}-01`);
  const [dateTo,   setDateTo]   = useState(`${cm}-31`);

  const setPreset = (preset) => {
    const now = new Date();
    const y = now.getFullYear(), mo = String(now.getMonth()+1).padStart(2,"0"), d = String(now.getDate()).padStart(2,"0");
    if (preset === "thisMonth") { setDateFrom(`${y}-${mo}-01`); setDateTo(`${y}-${mo}-31`); }
    else if (preset === "lastMonth") {
      const lm = new Date(now.getFullYear(), now.getMonth()-1, 1);
      const ly = lm.getFullYear(), lmo = String(lm.getMonth()+1).padStart(2,"0");
      setDateFrom(`${ly}-${lmo}-01`); setDateTo(`${ly}-${lmo}-31`);
    } else if (preset === "quincena") {
      if (now.getDate() <= 15) { setDateFrom(`${y}-${mo}-01`); setDateTo(`${y}-${mo}-15`); }
      else { setDateFrom(`${y}-${mo}-16`); setDateTo(`${y}-${mo}-31`); }
    } else if (preset === "last30") {
      const from = new Date(now); from.setDate(from.getDate()-30);
      const fy = from.getFullYear(), fm = String(from.getMonth()+1).padStart(2,"0"), fd = String(from.getDate()).padStart(2,"0");
      setDateFrom(`${fy}-${fm}-${fd}`); setDateTo(`${y}-${mo}-${d}`);
    } else if (preset === "year") { setDateFrom(`${y}-01-01`); setDateTo(`${y}-12-31`); }
  };

  const mt = trips.filter(tr => tr.date >= dateFrom && tr.date <= dateTo);
  const rev = mt.reduce((s, tr) => s + tr.revenue, 0);
  const exp = expenses.filter(e => mt.some(tr => tr.id === e.tripId)).reduce((s, e) => s + e.amount, 0);
  const errCount = alerts.filter(a => a.severity === "error").length;
  const warnCount = alerts.filter(a => a.severity === "warning").length;
  const infoCount = alerts.filter(a => a.severity === "info").length;

  return <div>
    <PageHeader title={`${t.dashboard} — B-Logix`} />

    <Card style={{ marginBottom: 16, padding: "10px 14px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Calendar size={14} color={colors.textMuted} />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 12 }} />
        <span style={{ fontSize: 12, color: colors.textMuted }}>—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 12 }} />
        {[
          { key: "thisMonth", label: "Este mes" },
          { key: "lastMonth", label: "Mes anterior" },
          { key: "quincena", label: "Esta quincena" },
          { key: "last30", label: "Últimos 30 días" },
          { key: "year", label: "Este año" },
        ].map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)} style={{ padding: "4px 10px", borderRadius: 14, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}>{p.label}</button>
        ))}
      </div>
    </Card>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
      <StatCard icon={Truck} label={t.activeTrucks} value={trucks.length} color={colors.accent} />
      <StatCard icon={Building2} label={t.activeClients} value={clients.filter(c => c.status === "active").length} color={colors.purple} />
      <StatCard icon={Route} label="Viajes" value={String(mt.length)} color={colors.accent} />
      <StatCard icon={TrendingUp} label={t.monthRevenue} value={fmt(rev)} color={colors.green} />
      <StatCard icon={TrendingDown} label={t.monthExpenses} value={fmt(exp)} color={colors.orange} />
      <StatCard icon={DollarSign} label={t.monthProfit} value={fmt(rev - exp)} color={rev - exp >= 0 ? colors.green : colors.red} />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
      <Card style={{ cursor: "pointer" }} onClick={() => setPage("agents")}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={16} color={colors.accent} /> {t.agentsTitle}</h3>
        {alerts.length === 0
          ? <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", color: colors.green, fontSize: 13 }}><CheckCircle2 size={16} /> {t.allClear}</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {errCount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: colors.red + "12", borderRadius: 8, border: `1px solid ${colors.red}30` }}>
                <AlertCircle size={16} color={colors.red} />
                <span style={{ fontWeight: 700, color: colors.red, fontSize: 14 }}>{errCount}</span>
                <span style={{ color: colors.red, fontSize: 13 }}>{t.agentError}{errCount > 1 ? "s" : ""}</span>
              </div>}
              {warnCount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: colors.orange + "12", borderRadius: 8, border: `1px solid ${colors.orange}30` }}>
                <AlertTriangle size={16} color={colors.orange} />
                <span style={{ fontWeight: 700, color: colors.orange, fontSize: 14 }}>{warnCount}</span>
                <span style={{ color: colors.orange, fontSize: 13 }}>{t.agentWarning}{warnCount > 1 ? "s" : ""}</span>
              </div>}
              {infoCount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: colors.accent + "12", borderRadius: 8, border: `1px solid ${colors.accent}30` }}>
                <Bell size={16} color={colors.accent} />
                <span style={{ fontWeight: 700, color: colors.accent, fontSize: 14 }}>{infoCount}</span>
                <span style={{ color: colors.accent, fontSize: 13 }}>{t.agentInfo}</span>
              </div>}
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>→ {t.agents} para ver detalles</div>
            </div>}
      </Card>

      <Card>
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{t.recentTrips}</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            <Th>{t.date}</Th><Th>{t.client}</Th><Th>{t.destination}</Th><Th align="right">{t.rate}</Th><Th align="center">{t.status}</Th>
          </tr></thead>
          <tbody>
            {trips.slice(-5).reverse().map(tr => {
              const cl = clients.find(c => c.id === tr.clientId);
              return <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                <Td>{tr.date}</Td><Td bold>{cl?.companyName || "—"}</Td><Td>{tr.municipality}</Td>
                <Td align="right" bold color={colors.green}>{fmt(tr.revenue)}</Td>
                <Td align="center"><StatusBadge status={tr.status} t={t} /></Td>
              </tr>;
            })}
          </tbody>
        </table>
      </Card>
    </div>
  </div>;
}

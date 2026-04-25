import { useState, useEffect } from "react";
import { AlertCircle, AlertTriangle, Bell, CheckCircle2 } from "lucide-react";
import { colors } from "../constants/theme.js";
import { Card, PageHeader } from "../components/ui/index.jsx";

export default function AgentsPage({ t, alerts }) {
  const [filter, setFilter] = useState("all");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const severityColor  = { error: colors.red, warning: colors.orange, info: colors.accent };
  const severityIcon   = { error: AlertCircle, warning: AlertTriangle, info: Bell };
  const severityBg     = { error: colors.red + "10", warning: colors.orange + "10", info: colors.accent + "10" };
  const severityBorder = { error: colors.red + "30", warning: colors.orange + "30", info: colors.accent + "30" };

  const errCount  = alerts.filter(a => a.severity === "error").length;
  const warnCount = alerts.filter(a => a.severity === "warning").length;
  const infoCount = alerts.filter(a => a.severity === "info").length;

  const visible = filter === "all" ? alerts : alerts.filter(a => a.severity === filter);

  const grouped = {};
  visible.forEach(a => {
    if (!grouped[a.category]) grouped[a.category] = [];
    grouped[a.category].push(a);
  });

  return <div>
    <PageHeader title={t.agentsTitle} />

    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
      {[
        { key: "all",     label: "Total",        count: alerts.length, color: colors.textMuted },
        { key: "error",   label: t.agentError,   count: errCount,      color: colors.red },
        { key: "warning", label: t.agentWarning, count: warnCount,     color: colors.orange },
        { key: "info",    label: t.agentInfo,    count: infoCount,     color: colors.accent },
      ].map(s => (
        <button key={s.key} onClick={() => setFilter(s.key)} style={{ padding: "10px 14px", borderRadius: 10, border: `2px solid ${filter === s.key ? s.color : colors.border}`, background: filter === s.key ? s.color + "12" : colors.card, cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>{s.label}</div>
        </button>
      ))}
    </div>

    {visible.length === 0
      ? <Card><div style={{ display: "flex", alignItems: "center", gap: 10, padding: 20, color: colors.green, fontSize: 14 }}><CheckCircle2 size={20} /> {t.allClear}</div></Card>
      : Object.entries(grouped).map(([cat, catAlerts]) => {
          const severity = catAlerts[0].severity;
          const Icon = severityIcon[severity];
          return <Card key={cat} style={{ marginBottom: 12, border: `1px solid ${severityBorder[severity]}`, background: severityBg[severity] }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Icon size={15} color={severityColor[severity]} />
              <span style={{ fontWeight: 700, fontSize: 13, color: severityColor[severity] }}>{t.agentCat?.[cat] || cat}</span>
              <span style={{ background: severityColor[severity] + "22", color: severityColor[severity], borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "2px 8px" }}>{catAlerts.length}</span>
            </div>
            {catAlerts.map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderTop: `1px solid ${severityColor[severity]}18` }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: severityColor[severity], marginTop: 5, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: colors.text, lineHeight: 1.5 }}>{a.msg}</span>
              </div>
            ))}
          </Card>;
        })}
  </div>;
}

import { useState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt } from "../utils/helpers.js";
import { Card, PageHeader, Badge, Th, Td } from "../components/ui/index.jsx";

export default function CxPPage({ t, expenses, setExpenses, drivers, brokers, suppliers, trips }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const pending = expenses.filter(e => !e.status || e.status === "pending");

  const groups = [
    {
      key: "nomina", label: "💰 Nómina — Conductores", color: colors.accent,
      exps: pending.filter(e => e.category === "driverPay" || e.category === "salary"),
      getLabel: (e) => { const d = drivers.find(x => x.id === e.driverId); return d ? d.name : e.description; }
    },
    {
      key: "suplidores", label: "🔧 Suplidores — Facturas", color: colors.orange,
      exps: pending.filter(e => ["fuel","repair","maintenance","tire","helper","other","toll"].includes(e.category)),
      getLabel: (e) => { const s = suppliers.find(x => x.id === e.supplierId); return s ? s.name : e.description; }
    },
    {
      key: "fijos", label: "🚛 Fijos — Préstamos y Seguros", color: colors.red,
      exps: pending.filter(e => ["loan","insurance"].includes(e.category)),
      getLabel: (e) => e.description
    },
  ];

  const markGroupPaid = (keys) => {
    const ids = new Set(keys);
    setExpenses(prev => prev.map(e => ids.has(e.id) ? { ...e, status: "paid", paidDate: new Date().toISOString().slice(0,10) } : e));
  };

  const grandTotal = pending.reduce((s, e) => s + e.amount, 0);

  return <div>
    <PageHeader title="Cuentas por Pagar" />

    {/* Grand total banner */}
    <div style={{ background: `linear-gradient(135deg, ${colors.accent}22, ${colors.red}18)`, border: `1px solid ${colors.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>TOTAL PENDIENTE DE PAGO</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: colors.orange }}>{fmt(grandTotal)}</div>
      </div>
      <div style={{ textAlign: "right", fontSize: 12, color: colors.textMuted }}>
        <div>{pending.length} obligaciones pendientes</div>
        <div style={{ marginTop: 4, color: colors.green }}>{fmt(expenses.filter(e => e.status === "paid").reduce((s,e) => s+e.amount, 0))} pagado en total</div>
      </div>
    </div>

    {groups.map(grp => {
      if (grp.exps.length === 0) return null;
      const total = grp.exps.reduce((s, e) => s + e.amount, 0);
      const ids = grp.exps.map(e => e.id);
      return <Card key={grp.key} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{grp.label}</div>
            <div style={{ fontSize: 11, color: colors.textMuted }}>{grp.exps.length} ítem{grp.exps.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: grp.color }}>{fmt(total)}</div>
            <button onClick={() => markGroupPaid(ids)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "none", background: colors.green, color: "white", cursor: "pointer", fontWeight: 600, fontSize: 11 }}>
              <CheckCircle2 size={12}/> Marcar Todo Pagado
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              <Th>Fecha</Th><Th>Descripción</Th><Th>Categoría</Th><Th>Viaje</Th><Th align="right">Monto</Th><Th align="right"></Th>
            </tr></thead>
            <tbody>{grp.exps.sort((a,b) => (b.date||"").localeCompare(a.date||"")).map(e => (
              <tr key={e.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                <Td>{e.date||"—"}</Td>
                <Td bold>{grp.getLabel(e) || e.description}</Td>
                <Td><Badge label={t[e.category]||e.category} color={colors.textMuted}/></Td>
                <Td>{e.tripId ? `#${e.tripId}` : "—"}</Td>
                <Td align="right" bold color={grp.color}>{fmt(e.amount)}</Td>
                <Td align="right">
                  <button onClick={() => setExpenses(prev => prev.map(x => x.id === e.id ? { ...x, status: "paid", paidDate: new Date().toISOString().slice(0,10) } : x))} style={{ padding: "2px 8px", borderRadius: 8, border: `1px solid ${colors.green}`, background: "transparent", color: colors.green, cursor: "pointer", fontSize: 10 }}>✓ Pagar</button>
                </Td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8, borderTop: `1px solid ${colors.border}`, marginTop: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: grp.color }}>Subtotal: {fmt(total)}</span>
        </div>
      </Card>;
    })}

    {grandTotal === 0 && <Card><div style={{ textAlign: "center", padding: 40, color: colors.green, fontSize: 14 }}>✅ Todo pagado — sin obligaciones pendientes.</div></Card>}
  </div>;
}

import { useMemo } from "react";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, getSupplierDueDate } from "../utils/helpers.js";
import { Card, PageHeader, Badge, Th, Td } from "../components/ui/index.jsx";

export default function CxPPage({ t, expenses, setExpenses, drivers, brokers, suppliers, trips, isMobile }) {
  const today = new Date().toISOString().slice(0, 10);

  const supplierMap = useMemo(() => new Map((suppliers || []).map(s => [s.id, s])), [suppliers]);
  const brokerMap   = useMemo(() => new Map((brokers  || []).map(b => [b.id, b])), [brokers]);
  const driverMap   = useMemo(() => new Map((drivers  || []).map(d => [d.id, d])), [drivers]);

  // Compute due date: uses getSupplierDueDate which handles both invoice_date and cutoff_period cycles
  const getExpDueDate = (e) => {
    if (e.dueDate) return e.dueDate;
    const sup = supplierMap.get(e.supplierId);
    if (sup?.paymentCondition === "credit" && sup.creditDays > 0) {
      return getSupplierDueDate(e.date || today, sup);
    }
    return e.date || today;
  };

  // Enrich pending expenses with due date + overdue/urgency flags
  const pending = useMemo(() => {
    return expenses
      .filter(e => !e.status || e.status === "pending")
      .map(e => {
        const due = getExpDueDate(e);
        const daysLeft = Math.ceil((new Date(due) - new Date(today)) / 86400000);
        return { ...e, _dueDate: due, _daysLeft: daysLeft, _isOverdue: daysLeft < 0 };
      })
      .sort((a, b) => a._dueDate.localeCompare(b._dueDate));
  }, [expenses, supplierMap, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const markGroupPaid = (keys) => {
    const ids = new Set(keys);
    setExpenses(prev => prev.map(e => ids.has(e.id) ? { ...e, status: "paid", paidDate: today } : e));
  };

  const markOnePaid = (id) => {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: "paid", paidDate: today } : e));
  };

  // ── Group definitions ─────────────────────────────────────────────────────
  const groups = [
    {
      key: "nomina",
      label: "💰 Nómina — Conductores",
      color: colors.accent,
      exps: pending.filter(e => e.category === "driverPay" || e.category === "salary" || e.category === "nominaTotalOverride"),
      getLabel: (e) => { const d = driverMap.get(e.driverId); return d ? d.name : e.description; },
      getSubLabel: (e) => e.tripId ? `Viaje #${e.tripId}` : null,
      getCreditBadge: () => null,
    },
    {
      key: "brokers",
      label: "🤝 Brokers — Comisiones",
      color: colors.yellow,
      exps: pending.filter(e => e.category === "broker_commission"),
      getLabel: (e) => { const b = brokerMap.get(e.brokerId); return b ? b.name : e.description; },
      getSubLabel: (e) => e.tripId ? `Viaje #${e.tripId}` : null,
      getCreditBadge: () => null,
    },
    {
      key: "suplidores",
      label: "🔧 Suplidores — Facturas",
      color: colors.orange,
      exps: pending.filter(e => ["fuel","repair","maintenance","tire","helper","other","toll"].includes(e.category)),
      getLabel: (e) => { const s = supplierMap.get(e.supplierId); return s ? s.name : e.description; },
      getSubLabel: (e) => {
        const sup = supplierMap.get(e.supplierId);
        if (sup?.paymentCondition === "credit" && sup.creditDays > 0) {
          if (sup.billingCycle === "cutoff_period") return `Corte quincenal · ${sup.creditDays}d`;
          return `${sup.creditDays}d crédito`;
        }
        return null;
      },
      getCreditBadge: (e) => {
        const sup = supplierMap.get(e.supplierId);
        return sup?.paymentCondition === "credit" ? sup : null;
      },
    },
    {
      key: "fijos",
      label: "🏦 Fijos — Préstamos y Seguros",
      color: colors.red,
      exps: pending.filter(e => ["loan","insurance"].includes(e.category)),
      getLabel: (e) => e.description,
      getSubLabel: () => null,
      getCreditBadge: () => null,
    },
  ];

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const grandTotal   = pending.reduce((s, e) => s + e.amount, 0);
  const overdueTotal = pending.filter(e => e._isOverdue).reduce((s, e) => s + e.amount, 0);
  const dueSoon      = pending.filter(e => !e._isOverdue && e._daysLeft <= 7);
  const dueSoonTotal = dueSoon.reduce((s, e) => s + e.amount, 0);
  const paidTotal    = expenses.filter(e => e.status === "paid").reduce((s, e) => s + e.amount, 0);

  // ── Due date cell render ───────────────────────────────────────────────────
  const DueDateCell = ({ e }) => {
    if (e._isOverdue) return (
      <span style={{ color: colors.red, fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
        <AlertCircle size={10}/> {e._dueDate} ({Math.abs(e._daysLeft)}d vencida)
      </span>
    );
    if (e._daysLeft <= 3) return (
      <span style={{ color: colors.red, fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
        <Clock size={10}/> {e._dueDate} ({e._daysLeft}d)
      </span>
    );
    if (e._daysLeft <= 7) return (
      <span style={{ color: colors.orange, fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
        <Clock size={10}/> {e._dueDate} ({e._daysLeft}d)
      </span>
    );
    return <span style={{ color: colors.textMuted, fontSize: 11 }}>{e._dueDate}</span>;
  };

  return <div>
    <PageHeader title="Cuentas por Pagar" />

    {/* KPI cards */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12, marginBottom: 16 }}>
      <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.orange}44` }}>
        <div style={{ fontSize: 10, color: colors.orange, fontWeight: 700, marginBottom: 4 }}>TOTAL PENDIENTE</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: colors.orange }}>{fmt(grandTotal)}</div>
        <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{pending.length} obligacione{pending.length !== 1 ? "s" : ""}</div>
      </div>

      {overdueTotal > 0 && (
        <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.red}55` }}>
          <div style={{ fontSize: 10, color: colors.red, fontWeight: 700, marginBottom: 4 }}>⚠ VENCIDAS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: colors.red }}>{fmt(overdueTotal)}</div>
          <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{pending.filter(e => e._isOverdue).length} ítem{pending.filter(e => e._isOverdue).length !== 1 ? "s" : ""} vencido{pending.filter(e => e._isOverdue).length !== 1 ? "s" : ""}</div>
        </div>
      )}

      {dueSoonTotal > 0 && (
        <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.yellow}44` }}>
          <div style={{ fontSize: 10, color: colors.yellow, fontWeight: 700, marginBottom: 4 }}>VENCE EN 7 DÍAS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: colors.yellow }}>{fmt(dueSoonTotal)}</div>
          <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{dueSoon.length} ítem{dueSoon.length !== 1 ? "s" : ""}</div>
        </div>
      )}

      <div style={{ background: colors.card, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.green}33` }}>
        <div style={{ fontSize: 10, color: colors.green, fontWeight: 700, marginBottom: 4 }}>PAGADO</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: colors.green }}>{fmt(paidTotal)}</div>
        <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{expenses.filter(e => e.status === "paid").length} pago{expenses.filter(e => e.status === "paid").length !== 1 ? "s" : ""} registrado{expenses.filter(e => e.status === "paid").length !== 1 ? "s" : ""}</div>
      </div>
    </div>

    {/* Groups */}
    {groups.map(grp => {
      if (grp.exps.length === 0) return null;
      const total = grp.exps.reduce((s, e) => s + e.amount, 0);
      const overdueInGroup = grp.exps.filter(e => e._isOverdue);
      const ids = grp.exps.map(e => e.id);

      return <Card key={grp.key} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
              {grp.label}
              {overdueInGroup.length > 0 && (
                <span style={{ fontSize: 10, color: colors.red, background: colors.red + "18", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>
                  ⚠ {overdueInGroup.length} vencida{overdueInGroup.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
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
              <Th>Descripción</Th>
              {!isMobile && <Th>Categoría</Th>}
              {!isMobile && <Th>Fecha</Th>}
              <Th>Vence</Th>
              <Th align="right">Monto</Th>
              <Th align="right"></Th>
            </tr></thead>
            <tbody>{grp.exps.map(e => {
              const label = grp.getLabel(e) || e.description;
              const sub   = grp.getSubLabel(e);
              const creditSup = grp.getCreditBadge(e);
              return (
                <tr key={e.id} style={{ borderBottom: `1px solid ${colors.border}11`, background: e._isOverdue ? colors.red + "07" : "transparent" }}>
                  <Td>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{label}</div>
                    {sub && <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}>{sub}</div>}
                    {creditSup && (
                      <div style={{ fontSize: 10, color: colors.orange, marginTop: 1 }}>
                        Crédito {creditSup.creditDays}d
                      </div>
                    )}
                  </Td>
                  {!isMobile && <Td><Badge label={t[e.category] || e.category} color={colors.textMuted}/></Td>}
                  {!isMobile && <Td style={{ fontSize: 11, color: colors.textMuted }}>{e.date || "—"}</Td>}
                  <Td><DueDateCell e={e} /></Td>
                  <Td align="right" bold color={e._isOverdue ? colors.red : grp.color}>{fmt(e.amount)}</Td>
                  <Td align="right">
                    <button onClick={() => markOnePaid(e.id)} style={{ padding: "2px 8px", borderRadius: 8, border: `1px solid ${colors.green}`, background: "transparent", color: colors.green, cursor: "pointer", fontSize: 10 }}>✓ Pagar</button>
                  </Td>
                </tr>
              );
            })}</tbody>
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

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Printer, PiggyBank, FileText } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, genSettlementPeriods, today, nxId } from "../utils/helpers.js";
import { computeSettlement, normalizePartner, PARTNER_MODELS } from "../utils/partnerModels.js";
import { settlementRelease } from "../utils/profitFirst.js";
import { companyHeaderHTML, openPrintWindow, esc } from "../utils/printReport.js";
import { COMPANY } from "../constants/company.js";
const COMPANY_LEGAL = COMPANY.legalName, COMPANY_RNC = COMPANY.rnc;
import { Card, PageHeader, Th, Td, StatusBadge, Badge } from "../components/ui/index.jsx";

const PURPLE = "#9b7fe8";
export const settlementKeyOf = (partnerId, pd) => `${partnerId}-${pd.mStr}-${pd.half}`;

function FRow({ label, value, minus, plus, valueColor, bold, divider, size, hint }) {
  let st = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 };
  if (divider === "single") st = { ...st, paddingTop: 10, marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.12)" };
  if (divider === "double") st = { ...st, paddingTop: 12, marginTop: 8, borderTop: "2px solid rgba(255,255,255,0.22)" };
  const prefix = minus && value > 0 ? "− " : plus && value > 0 ? "+ " : "";
  return <div style={st}>
    <span style={{ color: bold ? colors.text : colors.textMuted, fontWeight: bold ? 700 : 400, fontSize: size || 13 }}>{label}{hint && <span style={{ fontSize: 10, color: colors.textMuted, marginLeft: 6 }}>{hint}</span>}</span>
    <span style={{ fontWeight: bold ? (size ? 800 : 700) : 500, fontSize: size || 13, color: valueColor || colors.text }}>{prefix}{fmt(value)}</span>
  </div>;
}

function Collapsible({ title, right, children }) {
  const [open, setOpen] = useState(false);
  return <div style={{ marginTop: 12 }}>
    <button onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: colors.textMuted, cursor: "pointer", fontSize: 12, padding: "4px 0" }}>
      {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{title} — {right}
    </button>
    {open && <div style={{ overflowX: "auto", marginTop: 6 }}>{children}</div>}
  </div>;
}

/** Liquidación imprimible para entregar al socio. */
export function settlementHTML({ s, partner, t, clients = [], trucks = [], status }) {
  const model = PARTNER_MODELS[s.model]?.label || s.model;
  const cm = new Map(clients.map(c => [c.id, c])), tm = new Map(trucks.map(x => [x.id, x]));
  const transfer = Math.max(0, s.toTransfer);
  const charges = s.expensesTotal + s.fixedTotal;
  const rows = [...s.trips].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((tr, i) =>
    `<tr><td class="small">${i + 1}</td><td>${esc(tr.date)}</td><td>${esc(cm.get(tr.clientId)?.companyName || "—")}</td><td>${esc(tr.municipality)}, ${esc(tr.province)}</td><td>${esc(tr.invoiceRef || "")}</td><td>${esc(tm.get(tr.truckId)?.plate || "")}</td><td class="right">${fmt(tr.revenue || 0)}</td></tr>`).join("");
  const exp = [...s.expenseLines].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(e =>
    `<tr><td>${esc(e.date)}</td><td>${esc(t?.[e.category] || e.category)}</td><td>${esc(e.description)}</td><td>${esc(tm.get(e.truckId)?.plate || "")}</td><td class="right">${fmt(e.amount)}</td></tr>`).join("");
  const fixed = s.fixedLines.map(c => `<tr><td>—</td><td>Cargo fijo</td><td>${esc(c.name)} (${esc({ biweekly: "quincenal", monthly: "mensual", yearly: "anual" }[c.frequency] || c.frequency)})</td><td></td><td class="right">${fmt(c.amount)}</td></tr>`).join("");
  const r = (l, v, cls = "") => `<tr class="${cls}"><td class="lbl">${l}</td><td class="right">${v}</td></tr>`;
  const summary = s.model === "profit_share"
    ? r("Ingreso neto", fmt(s.netRevenue)) + (s.reimbursement ? r("Gastos reembolsados a la empresa", "− " + fmt(s.reimbursement)) : "") +
      r("Utilidad a repartir", fmt(s.net), "sep") + r(`Parte del socio (${s.partnerSharePct} %)`, fmt(s.partnerShare)) + r(`Parte de la empresa (${100 - s.partnerSharePct} %)`, fmt(s.companyShare))
    : r("Ingreso neto", fmt(s.netRevenue)) + r(`Comisión empresa (${s.commissionPct} % del bruto)`, "− " + fmt(s.commission)) +
      (s.reimbursement ? r("Gastos reembolsados a la empresa", "− " + fmt(s.reimbursement)) : "") + (s.fixedTotal ? r("Cargos fijos", "− " + fmt(s.fixedTotal)) : "");
  return `${companyHeaderHTML("LIQUIDACIÓN DE SOCIO")}
    <div class="info">
      <div class="col"><div class="k">Socio</div><div class="v">${esc(partner.name)}</div><div class="k">Modelo</div><div class="v">${esc(model)}</div></div>
      <div class="col"><div class="k">Período</div><div class="v">${esc(s.period.label)}</div><div class="k">Del / al</div><div class="v">${esc(s.period.dateFrom)} — ${esc(s.period.dateTo)}</div></div>
      <div class="col" style="text-align:right"><div class="k">Fecha de pago</div><div class="v">${esc(s.payDate || "—")} ${status ? `<span class="pill ${status === "paid" ? "ok" : "no"}">${status === "paid" ? "TRANSFERIDO" : "PENDIENTE"}</span>` : ""}</div><div class="k">Emitido</div><div class="v">${new Date().toLocaleDateString("es-DO")}</div></div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="k">Viajes entregados</div><div class="v">${s.tripCount}</div></div>
      <div class="kpi"><div class="k">Ingreso bruto</div><div class="v">${fmt(s.grossRevenue)}</div></div>
      <div class="kpi"><div class="k">Cargos descontados</div><div class="v">${charges ? "− " + fmt(charges) : "—"}</div></div>
      <div class="kpi hi"><div class="k">A transferir al socio</div><div class="v">${fmt(transfer)}</div></div>
    </div>

    <div class="section">1 · Ingresos — viajes entregados en el período</div>
    <table><thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Destino</th><th>Referencia</th><th>Camión</th><th class="right">Flete</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="muted">Sin viajes entregados en el período</td></tr>`}</tbody>
      <tfoot><tr class="tot"><td colspan="6" class="right">Ingreso bruto</td><td class="right">${fmt(s.grossRevenue)}</td></tr>
      ${s.brokerDeduction ? `<tr><td colspan="6" class="right">Broker (pass-through, descontado por el cliente)</td><td class="right">− ${fmt(s.brokerDeduction)}</td></tr><tr class="tot"><td colspan="6" class="right">Ingreso neto</td><td class="right">${fmt(s.netRevenue)}</td></tr>` : ""}</tfoot></table>

    <div class="section">2 · Cargos — gastos pagados por la empresa y cargos fijos</div>
    ${(exp || fixed) ? `<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Camión</th><th class="right">Monto</th></tr></thead><tbody>${exp}${fixed}</tbody>
      <tfoot><tr class="tot"><td colspan="4" class="right">Total descontado (se reembolsa primero a la empresa)</td><td class="right">− ${fmt(charges)}</td></tr></tfoot></table>`
      : `<div class="muted small" style="padding:6px 0 2px">Sin cargos en este período.</div>`}

    <div class="section">3 · Resumen de la liquidación</div>
    <table class="sum"><tbody>${summary}
      <tr class="total"><td class="lbl">A TRANSFERIR AL SOCIO</td><td class="right">${fmt(transfer)}</td></tr>
      ${s.toTransfer < 0 ? r("Saldo que el socio debe a la empresa", fmt(-s.toTransfer)) : ""}
    </tbody></table>

    <div class="sig"><div>Entregado por</div><div>Recibí conforme: ${esc(partner.name)}</div><div>Fecha</div></div>
    <div class="foot">${esc(COMPANY_LEGAL)} · RNC ${esc(COMPANY_RNC)} · Liquidación ${esc(s.period.label)} · ${esc(partner.name)}</div>`;
}

function SettlementCard({ s, partner, status, notDelivered = 0, isPartnerView, onToggle, onPrint, clients, trucks, t, isMobile }) {
  const [open, setOpen] = useState(false);
  const isPaid = status === "paid";
  const model = PARTNER_MODELS[s.model] || {};
  const rel = settlementRelease(s);
  const transfer = Math.max(0, s.toTransfer);
  return <Card style={{ marginBottom: 14, borderLeft: `4px solid ${isPaid ? colors.green : colors.orange}` }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{isPartnerView ? "Mi liquidación" : partner.name} <Badge label={model.short || s.model} color={colors.accent} /></div>
        <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{s.period.label} · {s.tripCount} viaje{s.tripCount !== 1 ? "s" : ""} entregado{s.tripCount !== 1 ? "s" : ""} · pago {s.payDate}{notDelivered > 0 && <span style={{ color: colors.orange }}> · {notDelivered} sin entregar (entran al entregarse)</span>}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {!isPartnerView && <div style={{ textAlign: "right", fontSize: 11, color: colors.textMuted }}>
          <div>Empresa retiene</div><div style={{ fontWeight: 700, color: colors.cyan, fontSize: 14 }}>{fmt(s.companyReceives)}</div>
        </div>}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: colors.textMuted }}>{isPartnerView ? "RECIBES" : "A TRANSFERIR"}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: isPaid ? colors.green : s.toTransfer < 0 ? colors.red : colors.orange }}>{fmt(transfer)}</div>
          {s.toTransfer < 0 && <div style={{ fontSize: 10, color: colors.red }}>el socio debe {fmt(-s.toTransfer)}</div>}
        </div>
        {!isPartnerView && <>
          <button onClick={onPrint} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><Printer size={13} /> PDF</button>
          <button onClick={onToggle} style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", background: isPaid ? colors.green : colors.orange, color: "white", display: "flex", alignItems: "center", gap: 4 }}>
            <CheckCircle2 size={13} /> {isPaid ? "Transferido" : "Marcar transferido"}
          </button>
        </>}
        {isPartnerView && <>
          <Badge label={isPaid ? "✓ Recibido" : "Pendiente"} color={isPaid ? colors.green : colors.orange} />
          <button onClick={onPrint} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: colors.accent, color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}><FileText size={13} /> Ver detalle</button>
        </>}
      </div>
    </div>

    {!isPartnerView && <button onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: colors.textMuted, cursor: "pointer", fontSize: 12, padding: "4px 0", marginTop: 8 }}>
      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{open ? "Ocultar detalle" : "Ver detalle"}
    </button>}

    {open && !isPartnerView && <>
      <div style={{ background: colors.inputBg, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.border}`, marginTop: 10, display: "flex", flexDirection: "column", gap: 6, fontSize: isMobile ? 15 : 13 }}>
        <FRow label="Ingreso bruto (fletes)" value={s.grossRevenue} plus valueColor={colors.green} />
        {s.brokerDeduction > 0 && <FRow label="Broker (pass-through, ya descontado)" value={s.brokerDeduction} minus valueColor={colors.orange} />}
        {s.brokerDeduction > 0 && <FRow label="Ingreso neto" value={s.netRevenue} bold />}
        {s.model !== "profit_share" && <FRow label={`Comisión empresa ${s.commissionPct}% del bruto`} value={s.commission} minus valueColor={PURPLE} />}
        {s.reimbursement > 0 && <FRow label="Gastos pagados por la empresa (reembolso primero)" value={s.reimbursement} minus valueColor={colors.orange} hint={`${s.expenseLines.length} gasto(s)`} />}
        {s.fixedTotal > 0 && <FRow label="Cargos fijos (GPS, seguro…)" value={s.fixedTotal} minus valueColor={colors.orange} />}
        {s.model === "profit_share" && <>
          <FRow label="Utilidad a repartir" value={s.net} bold divider="single" valueColor={s.net >= 0 ? colors.green : colors.red} />
          <FRow label={`Socio ${s.partnerSharePct}%`} value={s.partnerShare} />
          <FRow label={`Empresa ${100 - s.partnerSharePct}%`} value={s.companyShare} valueColor={colors.cyan} />
        </>}
        <FRow label={isPartnerView ? "Recibes" : "A transferir al socio"} value={transfer} bold divider="double" valueColor={isPaid ? colors.green : colors.orange} size={18} />
        {!isPartnerView && <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: PURPLE + "14", fontSize: 11, color: colors.textMuted, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <PiggyBank size={12} color={PURPLE} /><b style={{ color: PURPLE }}>Profit First:</b> apartado para el socio al cobrar {fmt(rel.pool)} · se transfiere {fmt(rel.transfer)} · <span style={{ color: colors.cyan }}>vuelve a OpEx {fmt(rel.releasedToOpex)}</span> (gastos reembolsados y cargos, sin 20/80: ya habían salido de OpEx).
        </div>}
      </div>

      <Collapsible title="Viajes" right={<span style={{ color: colors.green, fontWeight: 600 }}>+ {fmt(s.grossRevenue)}</span>}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Fecha</Th><Th>Ruta</Th><Th>Cliente</Th><Th>{t.truck}</Th><Th align="center">Estado</Th><Th align="right">Flete</Th></tr></thead>
          <tbody>{[...s.trips].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(tr => {
            const cl = clients.find(c => c.id === tr.clientId); const tk = trucks.find(x => x.id === tr.truckId);
            return <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}><Td>{tr.date}</Td><Td>{tr.municipality}{tr.province ? `, ${tr.province}` : ""}</Td><Td>{cl?.companyName || "—"}</Td><Td>{tk?.plate || "—"}</Td><Td align="center"><StatusBadge status={tr.status} t={t} /></Td><Td align="right" bold color={colors.green}>{fmt(tr.revenue || 0)}</Td></tr>;
          })}</tbody>
        </table>
      </Collapsible>
      {(s.expenseLines.length > 0 || s.fixedLines.length > 0) && <Collapsible title="Gastos descontados" right={<span style={{ color: colors.orange, fontWeight: 600 }}>− {fmt(s.expensesTotal + s.fixedTotal)}</span>}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Fecha</Th><Th>Categoría</Th><Th>Concepto</Th><Th align="right">Monto</Th></tr></thead>
          <tbody>
            {s.expenseLines.map(e => <tr key={e.id} style={{ borderBottom: `1px solid ${colors.border}11` }}><Td>{e.date}</Td><Td color={colors.textMuted}>{t[e.category] || e.category}</Td><Td>{e.description}</Td><Td align="right" color={colors.orange}>− {fmt(e.amount)}</Td></tr>)}
            {s.fixedLines.map(c => <tr key={`f${c.id}`} style={{ borderBottom: `1px solid ${colors.border}11` }}><Td></Td><Td color={colors.textMuted}>Cargo fijo</Td><Td>{c.name}</Td><Td align="right" color={colors.orange}>− {fmt(c.amount)}</Td></tr>)}
          </tbody>
        </table>
      </Collapsible>}
    </>}
  </Card>;
}

/**
 * Liquidaciones de socios por quincena (1–15 / 16–30), con los 3 modelos.
 * Profit First: lo transferido es pass-through (gasto `partner_settlement`);
 * lo que la empresa retiene por gastos reembolsados vuelve a OpEx (releasedToOpex).
 */
export default function SettlementsPage({ t, trips = [], trucks = [], expenses = [], setExpenses, clients = [], partners = [], brokers = [], drivers = [], settlementStatus = {}, setSettlementStatus, user, partner, isMobile }) {
  const isPartnerView = user?.role === "partner";
  const periods = useMemo(() => genSettlementPeriods(trips.map(tr => tr.date)), [trips]);
  const list = isPartnerView ? [partner].filter(Boolean) : partners;

  const groups = useMemo(() => periods.map(pd => {
    const cards = list.map(raw => {
      const p = normalizePartner(raw);
      const s = computeSettlement({ partner: p, period: pd, trips, expenses, trucks, clients, brokers, drivers });
      const truckIds = new Set(trucks.filter(tk => tk.partnerId === p.id).map(tk => tk.id));
      const notDelivered = trips.filter(tr => truckIds.has(tr.truckId) && tr.date >= pd.dateFrom && tr.date <= pd.dateTo && tr.status !== "delivered" && tr.status !== "cancelled").length;
      if (s.tripCount === 0 && s.fixedTotal === 0 && notDelivered === 0) return null;
      return { p, s, notDelivered, key: settlementKeyOf(p.id, pd), status: settlementStatus[settlementKeyOf(p.id, pd)] || "unpaid" };
    }).filter(Boolean);
    if (cards.length === 0) return null;
    return { pd, cards, total: cards.reduce((a, c) => a + Math.max(0, c.s.toTransfer), 0), pending: cards.filter(c => c.status !== "paid").reduce((a, c) => a + Math.max(0, c.s.toTransfer), 0) };
  }).filter(Boolean), [periods, list, trips, expenses, trucks, clients, brokers, drivers, settlementStatus]);

  const toggle = ({ p, s, key, status }) => {
    const paid = status === "paid";
    setSettlementStatus(prev => ({ ...prev, [key]: paid ? "unpaid" : "paid" }));
    if (!setExpenses) return;
    if (paid) { setExpenses(prev => prev.filter(e => !(e.category === "partner_settlement" && e.settlementKey === key))); return; }
    const rel = settlementRelease(s);
    setExpenses(prev => [...prev.filter(e => !(e.category === "partner_settlement" && e.settlementKey === key)), {
      id: nxId(prev), category: "partner_settlement", partnerId: p.id, settlementKey: key, tripId: null, supplierId: null,
      date: today(), paidDate: today(), status: "paid", paymentMethod: "transfer",
      amount: rel.transfer, description: `Liquidación ${p.name} · ${s.period.label}`,
      passThroughPool: rel.pool, releasedToOpex: rel.releasedToOpex, reimbursement: s.reimbursement, companyShare: s.companyShare,
    }]);
  };

  const print = ({ p, s, status }) => openPrintWindow(`Liquidación ${p.name} ${s.period.label}`, settlementHTML({ s, partner: p, t, clients, trucks, status }));

  return <div>
    <PageHeader title={t.settlements} />
    {!isPartnerView && <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>Los gastos que la empresa pagó por el camión del socio se reembolsan primero; después se aplica la comisión o el reparto. La primera quincena se paga a los {normalizePartner(partners[0] || {}).fondoDays || 30} días y luego cada 15.</div>}
    {groups.length === 0 && <Card><div style={{ textAlign: "center", padding: 40, color: colors.textMuted }}>{isPartnerView ? "Tus liquidaciones aparecen aquí al cerrar cada quincena." : t.noSettlements}</div></Card>}
    {groups.map(({ pd, cards, total, pending }) => <div key={`${pd.mStr}-${pd.half}`} style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "10px 4px", marginBottom: 10, borderBottom: `2px solid ${colors.border}` }}>
        <div><span style={{ fontWeight: 700, fontSize: 15 }}>{pd.label}</span><span style={{ marginLeft: 12, fontSize: 12, color: colors.textMuted }}>{cards.length} socio{cards.length !== 1 ? "s" : ""} · {cards.reduce((a, c) => a + c.s.tripCount, 0)} viajes</span></div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: colors.textMuted }}>{isPartnerView ? "RECIBES" : "A TRANSFERIR"}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: pending > 0 ? colors.orange : colors.green }}>{fmt(total)}</div>
          {!isPartnerView && pending > 0 && pending !== total && <div style={{ fontSize: 10, color: colors.orange }}>pendiente {fmt(pending)}</div>}
        </div>
      </div>
      {cards.map(c => <SettlementCard key={c.key} s={c.s} partner={c.p} status={c.status} notDelivered={c.notDelivered} isPartnerView={isPartnerView} onToggle={() => toggle(c)} onPrint={() => print(c)} clients={clients} trucks={trucks} t={t} isMobile={isMobile} />)}
    </div>)}
  </div>;
}

import { useState } from "react";

import { Clock, ChevronDown, ChevronRight, CheckCircle2, Users, Wrench, FileText } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, nxId } from "../utils/helpers.js";
import { Card, PageHeader, Badge, Th, Td } from "../components/ui/index.jsx";

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function genPeriods(expenses) {
  const pad = n => String(n).padStart(2, "0");
  const lastDayOf = (y, m) => new Date(y, m, 0).getDate();
  const now = new Date(); const day = now.getDate();
  let y = now.getFullYear(), m = now.getMonth() + 1, h;
  // Cortes: A = día 30 mes anterior → día 14  |  B = día 15 → día 29
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

function NominaDriverCard({ driver, exps, pending, paid, pendingTotal, paidTotal, trips, allExpenses, periodDateFrom, periodDateTo, periodLabel, onMarkPaid }) {
  const [showDetail, setShowDetail] = useState(false);
  // Adelantos: expenses with category "adelanto_conductor" for this driver in this period
  const adelantoExps = (allExpenses||[]).filter(e =>
    e.category === "adelanto_conductor" &&
    (e.driverId === driver.id || (!e.driverId && e.description && e.description.includes(driver.name))) &&
    e.date >= periodDateFrom && e.date <= periodDateTo
  );
  const adelantos = adelantoExps.reduce((s, e) => s + e.amount, 0);
  const netoAPagar = Math.max(0, pendingTotal - adelantos);

  const generateReport = () => {
    const tripRowsHTML = exps.map(exp => {
      const trip = trips.find(tr => tr.id === exp.tripId);
      const route = trip ? `${trip.municipality || trip.destination || "—"}, ${trip.province || ""}` : "—";
      const revenue = trip ? fmt(trip.revenue) : "—";
      const tripDiscounts = trip ? (trip.discounts || []).filter(d => d.amount > 0) : [];
      const discsHTML = tripDiscounts.length > 0
        ? tripDiscounts.map(d => `<div style="font-size:11px;color:#c0392b;padding-left:8px">↳ Desc: ${d.desc || "—"} − ${fmt(d.amount)}</div>`).join("")
        : "";
      const isPaid = exp.status === "paid";
      return `<tr>
        <td>${exp.date}</td>
        <td style="color:#666">${exp.tripId ? `#${exp.tripId}` : "—"}</td>
        <td>${route}</td>
        <td style="text-align:right">${revenue}</td>
        <td style="text-align:right;font-weight:600;color:${isPaid ? "#27ae60" : "#e67e22"}">${fmt(exp.amount)}</td>
        <td style="font-size:12px">${discsHTML || "—"}</td>
      </tr>`;
    }).join("");
    const adelantoRowsHTML = adelantoExps.map(a => `<tr style="color:#c0392b">
      <td>${a.date}</td>
      <td colspan="3" style="font-style:italic">Adelanto recibido</td>
      <td style="text-align:right;font-weight:700">− ${fmt(a.amount)}</td>
      <td></td>
    </tr>`).join("");
    const safeName = driver.name.replace(/\s+/g, "-").toLowerCase();
    const safeLabel = (periodLabel || "").replace(/[^a-zA-Z0-9]/g, "-");
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Reporte Nómina — ${driver.name}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:24px;color:#1a1a2e;background:#fff}
  h1{font-size:24px;margin:0 0 4px;color:#1a1a2e}
  .sub{color:#888;font-size:13px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px}
  th{background:#f0f4ff;padding:9px 10px;text-align:left;font-size:12px;border-bottom:2px solid #c8d6f8;color:#555}
  td{padding:8px 10px;border-bottom:1px solid #f0f0f0;vertical-align:top}
  .right{text-align:right}
  .sep{border-top:2px solid #dde4f5}
  .total-lbl{text-align:right;font-weight:700;font-size:13px;color:#555;padding-top:10px}
  .total-val{text-align:right;font-weight:700;font-size:13px;padding-top:10px}
  .neto-lbl{text-align:right;font-weight:800;font-size:15px;color:#e67e22;padding-top:6px}
  .neto-val{text-align:right;font-weight:800;font-size:18px;color:#e67e22;padding-top:6px}
  .green{color:#27ae60}
  .red{color:#c0392b}
  .footer{font-size:11px;color:#bbb;text-align:center;margin-top:28px;border-top:1px solid #eee;padding-top:12px}
  @media print{body{padding:10px}}
</style>
</head>
<body>
<h1>📋 Reporte de Nómina</h1>
<div class="sub"><strong>${driver.name}</strong> &nbsp;·&nbsp; Corte: ${periodLabel || ""}</div>
<table>
  <thead>
    <tr>
      <th>Fecha</th><th>Viaje</th><th>Ruta</th><th class="right">Ingreso</th><th class="right">Pago conductor</th><th>Descuentos</th>
    </tr>
  </thead>
  <tbody>
    ${tripRowsHTML}
    ${adelantoExps.length > 0 ? `<tr><td colspan="6" style="padding:4px 10px;font-size:11px;color:#999;font-style:italic">— Adelantos —</td></tr>${adelantoRowsHTML}` : ""}
    <tr class="sep">
      <td colspan="4" class="total-lbl">Bruto a pagar:</td>
      <td class="total-val" style="color:#e67e22">${fmt(pendingTotal)}</td>
      <td></td>
    </tr>
    ${adelantos > 0 ? `<tr>
      <td colspan="4" class="total-lbl red">Adelantos a descontar:</td>
      <td class="total-val red">− ${fmt(adelantos)}</td>
      <td></td>
    </tr>` : ""}
    <tr>
      <td colspan="4" class="neto-lbl">💰 NETO A TRANSFERIR:</td>
      <td class="neto-val">${fmt(netoAPagar)}</td>
      <td></td>
    </tr>
    ${paidTotal > 0 ? `<tr>
      <td colspan="4" class="total-lbl green">Ya pagado este corte:</td>
      <td class="total-val green">${fmt(paidTotal)}</td>
      <td></td>
    </tr>` : ""}
  </tbody>
</table>
<div class="footer">Generado por B-Logix &nbsp;·&nbsp; ${new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}</div>
</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nomina-${safeName}-${safeLabel}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <button onClick={generateReport} style={{ fontSize: 11, color: colors.green, background: colors.green+"14", border: `1px solid ${colors.green}40`, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "4px 9px" }}>
          <FileText size={12} /> Reporte
        </button>
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
            <Td>{trip ? `${trip.municipality || trip.destination || "—"}, ${trip.province || ""}` : exp.description}</Td>
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
        periodDateFrom={pd.dateFrom} periodDateTo={pd.dateTo} periodLabel={pd.label}
        onMarkPaid={() => markPaid(g.driver, pd)} />
    ))}
  </div>;
}

export default function NominaPage({ t, expenses, setExpenses, trips, drivers, trucks }) {
  const [repairMsg, setRepairMsg] = useState("");

  const repairNomina = () => {
    const toAdd = [];
    trips.forEach(tr => {
      if (!tr.driverId) return;
      const driver = drivers.find(d => d.id === tr.driverId);
      if (!driver || driver.salaryType === "fixed") return;
      const alreadyExists = expenses.some(e => e.category === "driverPay" && e.tripId === tr.id);
      if (alreadyExists) return;
      let driverPay = 0;
      if (driver.salaryType === "porcentaje") {
        driverPay = Math.round((tr.revenue || 0) * (driver.percentageAmount || 20) / 100);
      } else if (driver.salaryType === "perTrip") {
        const rate = (driver.rates || []).find(r => r.province === tr.province && r.municipality === tr.municipality);
        if (rate) {
          const tk = (trucks || []).find(t2 => t2.id === tr.truckId);
          const size = tr.tarifaOverride || tk?.size || "T1";
          driverPay = size === "T2" ? (rate.priceT2 ?? rate.price ?? 0) : (rate.priceT1 ?? rate.price ?? 0);
        }
      } else {
        driverPay = Math.round((tr.revenue || 0) * 0.20);
      }
      // Deduct trip discounts from driver pay
      const tripDiscounts = (tr.discounts || []).reduce((s, d) => s + (d.amount || 0), 0);
      driverPay = Math.max(0, driverPay - tripDiscounts);
      if (driverPay > 0) {
        const pct = driver.salaryType === "porcentaje" ? (driver.percentageAmount || 20) : 20;
        const discNote = tripDiscounts > 0 ? ` (−${fmt(tripDiscounts)} desc.)` : "";
        toAdd.push({ tripId: tr.id, date: tr.date, category: "driverPay", amount: driverPay, description: `Nómina ${pct}%: ${driver.name}${discNote}`, paymentMethod: "transfer", driverId: driver.id, status: "pending", supplierId: null });
      }
    });
    if (toAdd.length > 0) {
      setExpenses(prev => {
        let next = [...prev];
        toAdd.forEach(exp => { next = [...next, { id: nxId(next), ...exp }]; });
        return next;
      });
      setRepairMsg(`✅ Se crearon ${toAdd.length} entrada${toAdd.length !== 1 ? "s" : ""} de nómina que faltaba${toAdd.length !== 1 ? "n" : ""}.`);
    } else {
      setRepairMsg("✅ Todo correcto — no hay entradas faltantes.");
    }
    setTimeout(() => setRepairMsg(""), 6000);
  };

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
    <PageHeader title="Nómina" action={
      <button onClick={repairNomina} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 12 }}>
        <Wrench size={13} /> Sincronizar Nómina
      </button>
    } />
    {repairMsg && <div style={{ background: colors.green + "18", border: `1px solid ${colors.green}40`, borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 13, color: colors.green, fontWeight: 600 }}>{repairMsg}</div>}
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

import { useState } from "react";

import { Clock, ChevronDown, ChevronRight, CheckCircle2, Users, FileText, Pencil, X, Check } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, genPeriods } from "../utils/helpers.js";
import { Card, PageHeader, Badge, Th, Td } from "../components/ui/index.jsx";

function OverrideInline({ exp, onSave, onCancel }) {
  const [amount, setAmount] = useState(exp.amount);
  const [note, setNote] = useState(exp.overrideNote || "");

  const inputStyle = {
    background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 5,
    color: colors.text, padding: "3px 6px", fontSize: 12,
  };

  return (
    <tr style={{ background: colors.accent + "0a" }}>
      <td colSpan={5} style={{ padding: "8px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: colors.textMuted }}>Override pago:</span>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(Number(e.target.value))}
            style={{ ...inputStyle, width: 90 }}
          />
          <input
            placeholder="Nota (ej: ajuste por daño, bono, etc.)"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ ...inputStyle, width: 220 }}
          />
          <button onClick={() => onSave(amount, note)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 5, border: "none", background: colors.green, color: "white", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
            <Check size={11} /> Guardar
          </button>
          <button onClick={onCancel} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 5, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 11 }}>
            <X size={11} /> Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
}

function TotalOverrideInline({ current, note, onSave, onCancel }) {
  const [amount, setAmount] = useState(current);
  const [n, setN] = useState(note || "");
  const inp = { background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 5, color: colors.text, padding: "4px 8px", fontSize: 12 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8, padding: "8px 10px", background: "#7c3aed18", borderRadius: 7, border: `1px solid #7c3aed40` }}>
      <span style={{ fontSize: 11, color: "#9b7fe8", fontWeight: 600 }}>✏️ Override total:</span>
      <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} style={{ ...inp, width: 100 }} />
      <input placeholder="Nota (ej: acuerdo especial, descuento...)" value={n} onChange={e => setN(e.target.value)} style={{ ...inp, width: 230 }} />
      <button onClick={() => onSave(amount, n)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 5, border: "none", background: colors.green, color: "white", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
        <Check size={11} /> Guardar
      </button>
      <button onClick={onCancel} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 5, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 11 }}>
        <X size={11} /> Cancelar
      </button>
    </div>
  );
}

function NominaDriverCard({ driver, exps, pending, paid, pendingTotal, paidTotal, trips, allExpenses, periodDateFrom, periodDateTo, periodLabel, onMarkPaid, setExpenses }) {
  const [showDetail, setShowDetail] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTotal, setEditingTotal] = useState(false);

  const adelantoExps = (allExpenses||[]).filter(e =>
    e.category === "adelanto_conductor" &&
    (e.driverId === driver.id || (!e.driverId && e.description && e.description.includes(driver.name))) &&
    e.date >= periodDateFrom && e.date <= periodDateTo
  );
  const adelantos = adelantoExps.reduce((s, e) => s + e.amount, 0);

  // Total override: a special expense entry that replaces the sum of all individual entries
  const totalOverrideExp = (allExpenses||[]).find(e =>
    e.category === "nominaTotalOverride" &&
    e.driverId === driver.id &&
    e.date >= periodDateFrom && e.date <= periodDateTo
  );
  const effectivePendingTotal = totalOverrideExp ? totalOverrideExp.amount : pendingTotal;
  const netoAPagar = Math.max(0, effectivePendingTotal - adelantos);

  const saveTotalOverride = (amount, note) => {
    setExpenses(prev => {
      const existing = prev.find(e =>
        e.category === "nominaTotalOverride" && e.driverId === driver.id &&
        e.date >= periodDateFrom && e.date <= periodDateTo
      );
      if (existing) {
        return prev.map(e => e.id === existing.id
          ? { ...e, amount, overrideNote: note || undefined, calcAmount: pendingTotal }
          : e);
      }
      const newId = Math.max(0, ...prev.map(e => e.id)) + 1;
      return [...prev, {
        id: newId, category: "nominaTotalOverride", driverId: driver.id,
        amount, overrideNote: note || undefined, calcAmount: pendingTotal,
        date: periodDateFrom, description: note || "Override total nómina",
        paymentMethod: "transfer", status: "pending", supplierId: null, tripId: null,
      }];
    });
    setEditingTotal(false);
  };

  const clearTotalOverride = () => {
    setExpenses(prev => prev.filter(e =>
      !(e.category === "nominaTotalOverride" && e.driverId === driver.id &&
        e.date >= periodDateFrom && e.date <= periodDateTo)
    ));
  };

  const handleOverrideSave = (exp, newAmount, note) => {
    setExpenses(prev => prev.map(e => {
      if (e.id !== exp.id) return e;
      return {
        ...e,
        amount: newAmount,
        overrideNote: note || undefined,
        calcAmount: e.calcAmount ?? e.amount, // preserve original calculated amount
      };
    }));
    setEditingId(null);
  };

  const generateReport = () => {
    const tripRowsHTML = exps.map(exp => {
      const trip = trips.find(tr => tr.id === exp.tripId);
      const route = trip ? `${trip.municipality || trip.destination || "—"}, ${trip.province || ""}` : "—";
      const tripDiscounts = trip ? (trip.discounts || []).filter(d => d.amount > 0) : [];
      const linkedAdel = adelantoExps.find(a => a.tripId === exp.tripId);
      const isOverridden = exp.calcAmount !== undefined && exp.calcAmount !== exp.amount;
      const deductionsHTML = [
        ...tripDiscounts.map(d => `<div style="font-size:11px;color:#c0392b;padding-left:8px">↳ Desc: ${d.desc || "—"} − ${fmt(d.amount)}</div>`),
        ...(linkedAdel ? [`<div style="font-size:11px;color:#e67e22;padding-left:8px">↳ Adelanto: − ${fmt(linkedAdel.amount)}</div>`] : []),
        ...(isOverridden ? [`<div style="font-size:11px;color:#7c5cbf;padding-left:8px">✏️ Override (calc: ${fmt(exp.calcAmount)})${exp.overrideNote ? ` — ${exp.overrideNote}` : ""}</div>`] : []),
      ].join("");
      const isPaid = exp.status === "paid";
      return `<tr>
        <td>${exp.date}</td>
        <td style="color:#666">${exp.tripId ? `#${exp.tripId}` : "—"}</td>
        <td>${route}</td>
        <td style="text-align:right;font-weight:600;color:${isPaid ? "#27ae60" : "#e67e22"}">${fmt(exp.amount)}</td>
        <td style="font-size:12px">${deductionsHTML || "—"}</td>
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Reporte Nómina — ${driver.name}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:24px;color:#1a1a2e;background:#fff}
  .header{display:flex;justify-content:space-between;border-bottom:3px solid #1a3d7c;padding-bottom:15px;margin-bottom:20px}
  .logo{font-size:24px;font-weight:bold;color:#1a3d7c}
  .subtitle{color:#888;font-size:12px}
  h2{font-size:16px;margin:0 0 4px;color:#1a3d7c}
  .sub{color:#888;font-size:13px;margin-bottom:20px}
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
<div class="header">
  <div>
    <div class="logo">B-Logix</div>
    <div class="subtitle">Logística y Distribución</div>
  </div>
  <div style="text-align:right">
    <h2>Reporte de Nómina</h2>
    <div class="subtitle"><strong>${driver.name}</strong></div>
    <div class="subtitle">Corte: ${periodLabel || ""}</div>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th>Fecha</th><th>Viaje</th><th>Ruta</th><th class="right">Tu Pago</th><th>Descuentos / Notas</th>
    </tr>
  </thead>
  <tbody>
    ${tripRowsHTML}
    <tr class="sep">
      <td colspan="3" class="total-lbl">Bruto calculado:</td>
      <td class="total-val" style="color:#e67e22">${fmt(pendingTotal)}</td>
      <td></td>
    </tr>
    ${totalOverrideExp ? `<tr>
      <td colspan="3" class="total-lbl" style="color:#7c3aed">✏️ Override total${totalOverrideExp.overrideNote ? ` (${totalOverrideExp.overrideNote})` : ""}:</td>
      <td class="total-val" style="color:#7c3aed">${fmt(totalOverrideExp.amount)}</td>
      <td></td>
    </tr>` : ""}
    ${adelantos > 0 ? `<tr>
      <td colspan="3" class="total-lbl red">Adelantos a descontar:</td>
      <td class="total-val red">− ${fmt(adelantos)}</td>
      <td></td>
    </tr>` : ""}
    <tr>
      <td colspan="3" class="neto-lbl">💰 NETO A TRANSFERIR:</td>
      <td class="neto-val">${fmt(netoAPagar)}</td>
      <td></td>
    </tr>
    ${paidTotal > 0 ? `<tr>
      <td colspan="3" class="total-lbl green">Ya pagado este corte:</td>
      <td class="total-val green">${fmt(paidTotal)}</td>
      <td></td>
    </tr>` : ""}
  </tbody>
</table>
<div class="footer">Generado por B-Logix &nbsp;·&nbsp; ${new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}</div>
</body></html>`;
    const w = window.open("", "_blank", "width=820,height=700");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
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
                {totalOverrideExp
                  ? <>
                      <div style={{ fontSize: 10, color: colors.textMuted, textDecoration: "line-through" }}>{fmt(pendingTotal)}</div>
                      <div style={{ fontSize: 10, color: "#9b7fe8", fontWeight: 600 }}>✏️ OVERRIDE</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#9b7fe8" }}>{fmt(netoAPagar)}</div>
                      {totalOverrideExp.overrideNote && <div style={{ fontSize: 10, color: "#9b7fe8" }}>{totalOverrideExp.overrideNote}</div>}
                    </>
                  : adelantos > 0
                    ? <>
                        <div style={{ fontSize: 10, color: colors.textMuted }}>Bruto: {fmt(pendingTotal)}</div>
                        <div style={{ fontSize: 10, color: colors.orange }}>Adelanto: –{fmt(adelantos)}</div>
                        <div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 700 }}>A TRANSFERIR</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: colors.orange }}>{fmt(netoAPagar)}</div>
                      </>
                    : <>
                        <div style={{ fontSize: 10, color: colors.textMuted }}>A PAGAR</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: colors.orange }}>{fmt(effectivePendingTotal)}</div>
                      </>
                }
              </div>
              <button
                onClick={() => setEditingTotal(t => !t)}
                title="Override total"
                style={{ background: totalOverrideExp ? "#7c3aed22" : "transparent", border: `1px solid ${totalOverrideExp ? "#7c3aed60" : colors.border}`, color: totalOverrideExp ? "#9b7fe8" : colors.textMuted, borderRadius: 6, padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
              >
                <Pencil size={11} /> Total
              </button>
              {totalOverrideExp && (
                <button onClick={clearTotalOverride} title="Quitar override" style={{ background: "transparent", border: "none", color: colors.textMuted, cursor: "pointer", padding: 4 }}>
                  <X size={12} />
                </button>
              )}
              <button onClick={() => onMarkPaid(effectivePendingTotal)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: "none", background: colors.green, color: "white", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
                <CheckCircle2 size={13} /> Marcar Pagado
              </button>
            </div>
          : <div style={{ display: "flex", alignItems: "center", gap: 6, color: colors.green, background: colors.green+"18", padding: "6px 12px", borderRadius: 20 }}>
              <CheckCircle2 size={13} /><span style={{ fontSize: 12, fontWeight: 600 }}>Pagado · {fmt(paidTotal)}</span>
            </div>
        }
      </div>
    </div>
    {editingTotal && (
      <TotalOverrideInline
        current={totalOverrideExp ? totalOverrideExp.amount : pendingTotal}
        note={totalOverrideExp?.overrideNote || ""}
        onSave={saveTotalOverride}
        onCancel={() => setEditingTotal(false)}
      />
    )}
    {showDetail && <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>Fecha</Th><Th>Viaje #</Th><Th>Ruta</Th><Th align="right">Pago</Th><Th align="right">Estado</Th>
        </tr></thead>
        <tbody>{exps.map(exp => {
          const trip = trips.find(tr => tr.id === exp.tripId);
          const isPaid = exp.status === "paid";
          const linkedAdel = adelantoExps.find(a => a.tripId === exp.tripId);
          const tripDiscounts = trip ? (trip.discounts || []).filter(d => d.amount > 0) : [];
          const isOverridden = exp.calcAmount !== undefined && exp.calcAmount !== exp.amount;
          const isEditing = editingId === exp.id;
          return <>
            <tr key={exp.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
              <Td>{exp.date}</Td>
              <Td>{exp.tripId ? `#${exp.tripId}` : "—"}</Td>
              <Td>{trip ? `${trip.municipality || trip.destination || "—"}, ${trip.province || ""}` : exp.description}</Td>
              <Td align="right">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                  {isOverridden && (
                    <span style={{ fontSize: 10, color: colors.textMuted, textDecoration: "line-through" }}>{fmt(exp.calcAmount)}</span>
                  )}
                  <span style={{ fontWeight: 700, color: isOverridden ? "#9b7fe8" : (isPaid ? colors.green : colors.orange) }}>{fmt(exp.amount)}</span>
                  {!isPaid && (
                    <button
                      onClick={() => setEditingId(isEditing ? null : exp.id)}
                      title="Override pago"
                      style={{ background: "none", border: "none", cursor: "pointer", color: isOverridden ? "#9b7fe8" : colors.textMuted, padding: 2, lineHeight: 1, display: "flex" }}
                    >
                      <Pencil size={11} />
                    </button>
                  )}
                </div>
                {isOverridden && exp.overrideNote && (
                  <div style={{ fontSize: 10, color: "#9b7fe8", marginTop: 2 }}>✏️ {exp.overrideNote}</div>
                )}
              </Td>
              <Td align="right"><Badge label={isPaid ? "✓ Pagado" : "Pendiente"} color={isPaid ? colors.green : colors.orange} /></Td>
            </tr>
            {isEditing && (
              <OverrideInline
                key={`edit-${exp.id}`}
                exp={exp}
                onSave={(amt, note) => handleOverrideSave(exp, amt, note)}
                onCancel={() => setEditingId(null)}
              />
            )}
            {tripDiscounts.map((d, i) => (
              <tr key={`d-${exp.id}-${i}`} style={{ background: "#c0392b08" }}>
                <Td></Td><Td colSpan={2} style={{ fontSize: 11, color: "#c0392b", paddingLeft: 20 }}>↳ Desc: {d.desc || "—"}</Td>
                <Td align="right" style={{ fontSize: 11, color: "#c0392b" }}>− {fmt(d.amount)}</Td><Td></Td>
              </tr>
            ))}
            {linkedAdel && (
              <tr key={`a-${exp.id}`} style={{ background: "#e67e2208" }}>
                <Td></Td><Td colSpan={2} style={{ fontSize: 11, color: "#e67e22", paddingLeft: 20 }}>↳ Adelanto vinculado</Td>
                <Td align="right" style={{ fontSize: 11, color: "#e67e22" }}>− {fmt(linkedAdel.amount)}</Td><Td></Td>
              </tr>
            )}
          </>;
        })}</tbody>
      </table>
    </div>}
  </Card>;
}

function NominaPeriodGroup({ pd, driverCards, periodPending, periodPaid, trips, allExpenses, markPaid, defaultOpen, setExpenses }) {
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
        onMarkPaid={(effectiveTotal) => markPaid(g.driver, pd, effectiveTotal)} setExpenses={setExpenses} />
    ))}
  </div>;
}

export default function NominaPage({ t, expenses, setExpenses, trips, drivers, trucks }) {
  const markPaid = (driver, pd, effectiveTotal) => {
    setExpenses(prev => prev.map(e => {
      const inPeriod = e.date >= pd.dateFrom && e.date <= pd.dateTo;
      const isThisDriver = e.driverId === driver.id || (!e.driverId && e.description && e.description.includes(driver.name));
      const isPayEntry = (e.category === "driverPay" || e.category === "nominaTotalOverride") && inPeriod && isThisDriver;
      if (isPayEntry && (!e.status || e.status === "pending")) {
        return { ...e, status: "paid", paidDate: new Date().toISOString().slice(0,10) };
      }
      return e;
    }));
  };

  const periods = genPeriods(expenses.filter(e => e.category === "driverPay").map(e => e.date));
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
        allExpenses={expenses} markPaid={markPaid} defaultOpen={idx === 0}
        setExpenses={setExpenses} />
    ))}
  </div>;
}

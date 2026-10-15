/**
 * Reportes imprimibles (PDF vía diálogo de impresión del navegador).
 * Todo texto que viene de los datos pasa por esc() — nunca HTML crudo.
 */
import { fmt } from "./helpers.js";
import { TRIP_DOCS } from "./payroll.js";
import { isDirectLine } from "./ayudantes.js";
import { tripCrew } from "./driverPay.js";
import { COMPANY } from "../constants/company.js";
import { t_es } from "../constants/translations.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS = `
  * { box-sizing: border-box; } body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 24px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 18px 0 6px; } .muted { color: #666; } .right { text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; } th, td { border-bottom: 1px solid #ddd; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; } tfoot td { font-weight: 700; border-top: 2px solid #333; }
  .box { border: 1px solid #ccc; border-radius: 6px; padding: 10px 12px; margin-top: 10px; display: inline-block; min-width: 260px; }
  .sig { margin-top: 36px; display: flex; gap: 40px; } .sig div { flex: 1; border-top: 1px solid #333; padding-top: 4px; font-size: 11px; }
  .ok { color: #16a34a; } .no { color: #dc2626; } .small { font-size: 10px; }
  .hdr { text-align: center; margin-bottom: 8px; } .hdr img { height: 54px; } .hdr .legal { font-weight: 700; font-size: 12px; margin-top: 2px; } .hdr .rnc { font-size: 10px; color: #444; }
  .title { text-align: center; font-size: 16px; font-weight: 700; letter-spacing: .04em; margin: 8px 0 4px; } .rule { border: 0; border-top: 2px solid #f26522; margin: 4px 0 14px; }
  .fields { width: 60%; margin: 0 auto 12px; } .fields td { border: 0; padding: 3px 6px; } .fields td:first-child { text-align: right; font-weight: 700; width: 90px; } .fields td:last-child { border-bottom: 1px solid #333; }
  table.grid th, table.grid td { border: 1px solid #333; } table.grid th { background: #fff; text-align: center; } table.grid td { height: 22px; }
  .info { display: flex; justify-content: space-between; gap: 16px; margin: 6px 0 14px; } .info .col { flex: 1; } .info .k { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .04em; } .info .v { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
  .kpis { display: flex; gap: 10px; margin: 10px 0 16px; } .kpi { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px 10px; } .kpi .k { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: .04em; } .kpi .v { font-size: 15px; font-weight: 800; margin-top: 2px; } .kpi.hi { border-color: #f26522; background: #fff7f2; } .kpi.hi .v { color: #f26522; }
  .section { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #f26522; border-bottom: 1px solid #f26522; padding-bottom: 3px; margin: 18px 0 6px; }
  table.sum { width: 60%; margin-left: auto; } table.sum td { border: 0; padding: 4px 6px; } table.sum tr.sep td { border-top: 1px solid #ccc; padding-top: 6px; } table.sum tr.total td { border-top: 2px solid #111; font-size: 14px; font-weight: 800; padding-top: 8px; } table.sum td.lbl { color: #444; } table.sum tr.total td.lbl { color: #111; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; } .pill.ok { background: #e7f7ec; color: #16a34a; } .pill.no { background: #fff1e6; color: #f26522; }
  .foot { margin-top: 24px; font-size: 9px; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 6px; }
  tr.tot td { font-weight: 700; background: #fafafa; }
  @media print { body { margin: 12mm; } .noprint { display: none; } .kpi, .section, table { page-break-inside: avoid; } }
`;

export function companyHeaderHTML(title) {
  const logo = typeof location !== "undefined" ? `${location.origin}${COMPANY.logo}` : COMPANY.logo;
  return `<div class="hdr"><img src="${esc(logo)}" alt="${esc(COMPANY.brand)}" onerror="this.style.display='none'"><div class="legal">${esc(COMPANY.legalName)}</div><div class="rnc">RNC: ${esc(COMPANY.rnc)}</div></div>
    <div class="title">${esc(title)}</div><hr class="rule">`;
}

export function openPrintWindow(title, bodyHtml) {
  const w = window.open("", "_blank");
  if (!w) { alert("El navegador bloqueó la ventana. Permite ventanas emergentes para imprimir."); return; }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${bodyHtml}<script>window.onload=function(){setTimeout(function(){window.print();},200);};</script></body></html>`);
  w.document.close();
}

const docsCell = (trip, client) => TRIP_DOCS.map(d => `<span class="${trip.docs?.[d.key] ? "ok" : "no"}">${trip.docs?.[d.key] ? "✓" : "✗"} ${esc(d.label.split(" ")[0])}</span>`).join(" &nbsp; ");

/** Relación de viajes de un chofer en un período (formato «Factura» de la empresa, sin montos). */
export function driverPeriodReportHTML({ row, period, generatedBy, minRows = 14 }) {
  const d = row.driver;
  const plates = [...new Set(row.trips.map(x => x.truck?.plate).filter(Boolean))].join(", ");
  const lines = row.trips.map((x) => { const { trip, client, truck, calc } = x; return `
    <tr>
      <td>${esc(trip.date)}</td>
      <td>${esc(client?.companyName || "—")}</td>
      <td>${esc(trip.invoiceRef || "")}</td>
      <td>${esc(trip.municipality)}, ${esc(trip.province)}</td>
      <td style="text-align:center">${esc(calc?.size || (truck?.size || ""))}</td>
      <td style="text-align:center">1</td>
      <td style="text-align:center" class="${x.docsOk ? "ok" : "no"}">${x.docsOk ? "✓" : "—"}</td>
    </tr>`; });
  while (lines.length < minRows) lines.push(`<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`);
  return `
    ${companyHeaderHTML("FACTURA — RELACIÓN DE VIAJES")}
    <table class="fields">
      <tr><td>Nombre:</td><td>${esc(d.name)}</td></tr>
      <tr><td>Período:</td><td>${esc(period.label)} (${esc(period.dateFrom)} a ${esc(period.dateTo)})</td></tr>
      <tr><td>Fecha:</td><td>${new Date().toLocaleDateString("es-DO")}</td></tr>
      <tr><td>Camión:</td><td>${esc(plates || "—")}</td></tr>
      <tr><td>Contacto:</td><td>${esc(d.phone || "")}</td></tr>
    </table>
    <table class="grid">
      <thead><tr><th>Fecha</th><th>Cliente</th><th>Referencia</th><th>Destino</th><th>Tarifa (T1/T2)</th><th>Cantidad</th><th>Recibido</th></tr></thead>
      <tbody>${lines.join("")}</tbody>
      <tfoot><tr><td colspan="5" class="right"><b>Total :</b></td><td style="text-align:center"><b>${row.tripCount}</b></td><td style="text-align:center">✓</td></tr></tfoot>
    </table>
    ${row.pendingCount ? `<div class="small muted" style="margin-top:6px">${row.pendingCount} viaje(s) de este período pendiente(s) de entrega de documentos: no incluidos; se liquidan en la quincena en que se entreguen.</div>` : ""}
    <div class="sig"><div>Entregado por: ${esc(generatedBy || "")}</div><div>Recibí conforme: ${esc(d.name)}</div><div>Fecha</div></div>`;
}

/**
 * Constancia de entrega de documentos (sin montos), acumulada por quincena: lo de entregas anteriores de la quincena
 * + lo nuevo de esta entrega (marcado), y lo que falta por entregar. r = deliveryReceipt(...).
 */
export function deliveryReceiptHTML({ r, kind, person, generatedBy, fmtTime = () => "", payNote = "" }) {
  const isPartner = kind === "partner";
  const d = (x) => { const [y, m, dd] = String(x || "").split("-"); return y ? `${dd}/${m}/${y}` : ""; };
  const lines = r.items.map((x, i) => `
    <tr style="${x.isNew ? "background:#fff7f2" : ""}">
      <td style="text-align:center">${i + 1}</td>
      <td>${esc(d(x.trip.date))}</td>
      <td>${esc(x.client?.companyName || "—")}</td>
      <td>${esc(x.trip.invoiceRef || "")}</td>
      <td>${esc(x.trip.municipality || "")}${x.trip.province ? `, ${esc(x.trip.province)}` : ""}</td>
      <td>${esc(x.truck?.plate || "")}</td>
      ${isPartner ? `<td>${esc(x.driver?.name || "")}</td>` : ""}
      <td style="text-align:center">${x.isNew ? `<span class="pill no">NUEVO · esta entrega</span>` : `<span class="small muted">entrega ${x.visitNo} · ${esc(d(x.receivedDate))}</span>`}</td>
    </tr>`).join("");
  const pend = r.pending.map(x => `<tr><td>${esc(d(x.trip.date))}</td><td>${esc(x.client?.companyName || "—")}</td><td>${esc(x.trip.invoiceRef || "")}</td><td>${esc(x.trip.municipality || "")}</td><td>${esc(x.truck?.plate || "")}</td>${isPartner ? `<td>${esc(x.driver?.name || "")}</td>` : ""}</tr>`).join("");
  const cols = isPartner ? 8 : 7;
  return `
    ${companyHeaderHTML("CONSTANCIA DE ENTREGA DE DOCUMENTOS")}
    <table class="fields">
      <tr><td>${isPartner ? "Socio" : "Chofer"}:</td><td>${esc(person.name)}</td></tr>
      <tr><td>Quincena:</td><td>${esc(r.period.label)}</td></tr>
      <tr><td>Entrega:</td><td>N.º ${r.visit.no} de la quincena · ${esc(d(r.visit.date))}${r.visit.legacy ? "" : ` · ${esc(fmtTime(r.visit.endTs))}`}</td></tr>
      <tr><td>Recibió:</td><td>${esc(r.visit.by || generatedBy || "")}</td></tr>
    </table>
    <div class="kpis">
      <div class="kpi hi"><div class="k">Entregados en esta visita</div><div class="v">${r.newCount}</div></div>
      <div class="kpi"><div class="k">Acumulado de la quincena</div><div class="v">${r.totalCount}</div></div>
      <div class="kpi"><div class="k">Pendientes por entregar</div><div class="v">${r.pending.length}</div></div>
    </div>
    <div class="section">Documentos recibidos en la quincena</div>
    <table class="grid">
      <thead><tr><th>#</th><th>Fecha viaje</th><th>Cliente</th><th>Referencia</th><th>Destino</th><th>Camión</th>${isPartner ? "<th>Chofer</th>" : ""}<th>Recibido</th></tr></thead>
      <tbody>${lines}</tbody>
      <tfoot><tr><td colspan="${cols - 1}" class="right"><b>Total recibido en la quincena:</b></td><td style="text-align:center"><b>${r.totalCount}</b></td></tr></tfoot>
    </table>
    ${r.pending.length ? `<div class="section">Pendientes por entregar</div>
    <table><thead><tr><th>Fecha viaje</th><th>Cliente</th><th>Referencia</th><th>Destino</th><th>Camión</th>${isPartner ? "<th>Chofer</th>" : ""}</tr></thead><tbody>${pend}</tbody></table>` : `<div class="small ok" style="margin-top:10px">No tiene documentos pendientes hasta esta fecha.</div>`}
    <div class="small muted" style="margin-top:10px">${esc(payNote || `Los viajes recibidos se pagan en la quincena ${r.period.label}.`)} Este documento no incluye montos.</div>
    <div class="sig"><div>Entregó: ${esc(person.name)}</div><div>Recibió: ${esc(r.visit.by || generatedBy || "")}</div><div>Fecha: ${esc(d(r.visit.date))}</div></div>`;
}

/** Relación de pago de un ayudante directo en un período (con montos: es lo que se le entrega a él). */
export function helperPeriodReportHTML({ row, period, generatedBy, minRows = 10 }) {
  const a = row.ayudante;
  const lines = row.trips.map(x => `
    <tr>
      <td>${esc(x.trip.date)}</td>
      <td>${esc(x.client?.companyName || "—")}</td>
      <td>${esc(x.trip.municipality)}, ${esc(x.trip.province)}</td>
      <td>${esc(x.truck?.plate || "")}</td>
      <td>${esc(x.driver?.name || "")}</td>
      <td class="right">${fmt(x.amount)}</td>
    </tr>`);
  while (lines.length < minRows) lines.push(`<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>`);
  return `
    ${companyHeaderHTML("RELACIÓN DE PAGO — AYUDANTE")}
    <table class="fields">
      <tr><td>Nombre:</td><td>${esc(a.name)}</td></tr>
      ${a.cedula ? `<tr><td>Cédula:</td><td>${esc(a.cedula)}</td></tr>` : ""}
      <tr><td>Período:</td><td>${esc(period.label)} (${esc(period.dateFrom)} a ${esc(period.dateTo)})</td></tr>
      <tr><td>Fecha:</td><td>${new Date().toLocaleDateString("es-DO")}</td></tr>
      ${a.phone ? `<tr><td>Contacto:</td><td>${esc(a.phone)}</td></tr>` : ""}
      ${a.bank || a.account ? `<tr><td>Cuenta:</td><td>${esc([a.bank, a.account].filter(Boolean).join(" · "))}</td></tr>` : ""}
    </table>
    <table class="grid">
      <thead><tr><th>Fecha</th><th>Cliente</th><th>Destino</th><th>Camión</th><th>Chofer</th><th>Pago</th></tr></thead>
      <tbody>${lines.join("")}</tbody>
      <tfoot><tr><td colspan="5" class="right"><b>Total viajes (${row.tripCount}):</b></td><td class="right"><b>${fmt(row.gross)}</b></td></tr></tfoot>
    </table>
    <table class="sum">
      <tr><td class="lbl">Pago por viajes</td><td class="right">${fmt(row.gross)}</td></tr>
      ${row.advances ? `<tr><td class="lbl">Adelantos recibidos</td><td class="right">− ${fmt(row.advances)}</td></tr>` : ""}
      <tr class="total"><td class="lbl">Neto a recibir</td><td class="right">${fmt(row.net)}</td></tr>
    </table>
    ${row.pendingCount ? `<div class="small muted" style="margin-top:6px">${row.pendingCount} viaje(s) de este período todavía sin documentos en la oficina: no incluidos; se pagan en la quincena en que se entreguen.</div>` : ""}
    <div class="sig"><div>Entregado por: ${esc(generatedBy || "")}</div><div>Recibí conforme: ${esc(a.name)}</div><div>Fecha</div></div>`;
}

/**
 * Nómina del período de UN chofer: sus viajes con chofer + dieta, ayudantes + dieta, descuentos, adelantos y neto.
 * row = fila de buildPayroll; pay = payrollPayment(row) (opcional: overrides, pagado/pendiente).
 */
export function driverPayrollHTML({ row, pay = null, period, generatedBy }) {
  const d = row.driver;
  const plates = [...new Set(row.trips.map(x => x.truck?.plate).filter(Boolean))].join(", ");
  const lineOf = (x) => pay?.lines?.find(l => l.trip.id === x.trip.id) || null;
  const tripRows = row.trips.map((x) => { const { trip, client, calc } = x; const l = lineOf(x); const crew = tripCrew(trip, calc, d);
    const chofer = crew[0], ayud = crew.slice(1);
    return `
    <tr>
      <td>${esc(trip.date)}<br><span class="small muted">#${esc(trip.id)} · rec. ${esc(trip.docsReceivedAt || "—")}</span></td>
      <td>${esc(client?.companyName || "—")}<br><span class="small muted">${esc(trip.invoiceRef || "")}</span></td>
      <td>${esc(trip.municipality)}, ${esc(trip.province)}</td>
      <td style="text-align:center">${esc(calc?.size || "")}${!calc?.rateFound && row.payType === "perTrip" ? `<br><span class="no small">sin tarifa</span>` : ""}</td>
      <td class="right">${fmt(chofer?.base || 0)}</td>
      <td class="right">${chofer?.dieta ? fmt(chofer.dieta) : "—"}</td>
      <td class="right">${calc?.discounts ? "−" + fmt(calc.discounts) : "—"}</td>
      <td class="right"><b>${fmt(l ? l.amount : calc?.driverNet || 0)}</b>${l?.overridden ? `<br><span class="small muted">ajustado${l.exp?.overrideNote ? ": " + esc(l.exp.overrideNote) : ""}</span>` : ""}</td>
      <td class="small">${ayud.length ? ayud.map(a => `${esc(a.name)}: ${fmt(a.base)}${a.dieta ? " + dieta " + fmt(a.dieta) : ""} = <b>${fmt(a.total)}</b>${a.direct ? " (directo)" : ""}`).join("<br>") : "—"}</td>
      <td class="right">${fmt(ayud.filter(a => !a.direct).reduce((s, a) => s + a.total, 0))}</td>
      <td class="small">${l ? (l.paid ? `<span class="ok">pagado</span>` : "pendiente") : ""}</td>
    </tr>`; });
  const driverTotal = pay ? pay.driverTotal : row.net + row.advances;
  const grossEff = pay ? pay.grossEff : driverTotal;
  const net = pay ? pay.net : Math.max(0, driverTotal - row.advances);
  const helpersViaDriver = row.helpers;
  return `
    ${companyHeaderHTML("NÓMINA DEL CHOFER")}
    <table class="fields">
      <tr><td>Chofer:</td><td>${esc(d.name)}</td></tr>
      <tr><td>Período:</td><td>${esc(period.label)} (${esc(period.dateFrom)} a ${esc(period.dateTo)})</td></tr>
      <tr><td>Pago:</td><td>${row.payType === "fixed" ? "Salario fijo" : row.payType === "percentage" ? `${esc(d.percentageAmount)}% del flete` : "Por viaje (tarifario)"}</td></tr>
      <tr><td>Camión:</td><td>${esc(plates || "—")}</td></tr>
      <tr><td>Generado:</td><td>${new Date().toLocaleString("es-DO")}${generatedBy ? ` por ${esc(generatedBy)}` : ""}</td></tr>
    </table>
    <table class="grid">
      <thead><tr><th>Fecha</th><th>Cliente</th><th>Destino</th><th>Tarifa</th><th class="right">Chofer</th><th class="right">Dieta</th><th class="right">Desc.</th><th class="right">Neto chofer</th><th>Ayudantes (base + dieta)</th><th class="right">Ayud. por el chofer</th><th>Estado</th></tr></thead>
      <tbody>${tripRows.join("") || `<tr><td colspan="11" class="muted">Sin viajes recibidos en el período</td></tr>`}</tbody>
      <tfoot><tr><td colspan="4"><b>Totales (${row.tripCount} viaje${row.tripCount !== 1 ? "s" : ""})</b></td><td class="right">${fmt(row.base)}</td><td class="right">${fmt(row.dieta)}</td><td class="right">${row.discounts ? "−" + fmt(row.discounts) : "—"}</td><td class="right"><b>${fmt(driverTotal)}</b></td><td></td><td class="right"><b>${fmt(helpersViaDriver)}</b></td><td></td></tr></tfoot>
    </table>
    <div class="box">
      ${pay?.override ? `<div>Total ajustado: <b>${fmt(grossEff)}</b>${pay.override.overrideNote ? ` <span class="small muted">(${esc(pay.override.overrideNote)})</span>` : ""}</div>` : `<div>Bruto chofer (chofer + su parte de dieta − descuentos): <b>${fmt(grossEff)}</b></div>`}
      <div>Adelantos del período: <b>−${fmt(row.advances)}</b></div>
      <div style="font-size:15px">NETO A TRANSFERIR AL CHOFER: <b>${fmt(net)}</b>${pay?.paid ? ` <span class="ok">✓ PAGADO</span>` : ""}</div>
      <div>Ayudantes que cobran por el chofer: <b>${fmt(helpersViaDriver)}</b> (${row.helperCount})${row.directHelpers ? ` · ayudantes con pago directo (no van al chofer): ${fmt(row.directHelpers)}` : ""}</div>
      <div style="font-size:14px">TOTAL A TRANSFERIR (chofer + ayudantes por él): <b>${fmt(net + helpersViaDriver)}</b></div>
    </div>
    <div class="small muted" style="margin-top:6px">La dieta del tarifario es del equipo y se reparte en partes iguales entre chofer y ayudantes. Cada viaje se paga en la quincena en que la oficina recibió sus documentos.${row.pendingCount ? ` ${row.pendingCount} viaje(s) pendiente(s) de documentos no incluido(s).` : ""}</div>
    <div class="sig"><div>Preparado por: ${esc(generatedBy || "")}</div><div>Recibí conforme: ${esc(d.name)}</div><div>Fecha</div></div>`;
}

/** Reporte de nómina del período con todos los choferes y ayudantes (para contabilidad). */
export function payrollReportHTML({ payroll, helperPayroll = null, company = "B-Logix", generatedBy }) {
  const { period, drivers, totals } = payroll;
  const rows = drivers.map(r => `
    <tr>
      <td>${esc(r.driver.name)}</td><td>${r.payType === "fixed" ? "Fijo" : r.payType === "percentage" ? `${esc(r.driver.percentageAmount)}%` : "Por viaje"}</td>
      <td class="right">${r.tripCount}</td>
      <td class="right">${fmt(r.gross)}</td><td class="right">${r.discounts ? "−" + fmt(r.discounts) : "—"}</td><td class="right">${r.advances ? "−" + fmt(r.advances) : "—"}</td>
      <td class="right"><b>${fmt(r.net)}</b></td>
      <td class="right">${r.helperCount}</td><td class="right">${fmt(r.helpers)}</td>
      <td class="small">${r.pendingCount ? `<span class="no">${r.pendingCount} pendiente(s), no pagados</span>` : `<span class="ok">todo recibido</span>`}${r.missingRates ? ` <span class="no">${r.missingRates} sin tarifa</span>` : ""}</td>
    </tr>`).join("");
  const viaOf = (x) => x.split ? x.split.viaDriver : { count: x.calc.numHelpers, amount: x.calc.helpersTotal };
  const helperDetail = drivers.flatMap(r => r.trips.filter(x => viaOf(x).count > 0).map((x) => { const { trip, calc } = x; const v = viaOf(x); return `<tr><td>${esc(trip.date)}</td><td>#${esc(trip.id)} ${esc(trip.municipality)}</td><td>${esc(r.driver.name)}</td><td>${esc((trip.helpers || []).filter(h => !isDirectLine(h)).map(h => h.name).filter(Boolean).join(", ") || "—")}</td><td class="right">${v.count}</td><td class="right">${fmt(calc.helperEach)}</td><td class="right">${fmt(v.amount)}</td></tr>`; })).join("");
  const crewRows = drivers.flatMap(r => r.trips.flatMap(({ trip, calc }) => tripCrew(trip, calc, r.driver).map(c => `<tr><td>${esc(trip.date)}</td><td>#${esc(trip.id)} ${esc(trip.municipality)}</td><td>${esc(c.name)}</td><td>${c.role === "chofer" ? "Chofer" : `Ayudante ${c.idx}`}</td><td class="right">${fmt(c.base)}</td><td class="right">${c.dieta ? fmt(c.dieta) : "—"}</td><td class="right"><b>${fmt(c.total)}</b></td><td class="small">${c.role === "chofer" ? "al chofer" : c.direct ? "directo al ayudante" : "por el chofer"}</td></tr>`))).join("");
  const hp = helperPayroll && helperPayroll.rows.length ? helperPayroll : null;
  const directRows = hp ? hp.rows.map(h => `<tr><td>${esc(h.ayudante.name)}</td><td>${esc(h.ayudante.cedula || "")}</td><td class="right">${h.tripCount}</td><td class="right">${fmt(h.gross)}</td><td class="right">${h.advances ? "−" + fmt(h.advances) : "—"}</td><td class="right"><b>${fmt(h.net)}</b></td><td class="small">${esc([h.ayudante.bank, h.ayudante.account].filter(Boolean).join(" · "))}</td><td class="small">${h.pendingCount ? `<span class="no">${h.pendingCount} pendiente(s), no pagados</span>` : `<span class="ok">todo recibido</span>`}</td></tr>`).join("") : "";
  return `
    ${companyHeaderHTML("NÓMINA DEL PERÍODO")}
    <div class="muted">${esc(period.label)} (${esc(period.dateFrom)} a ${esc(period.dateTo)})${generatedBy ? ` · Generado por ${esc(generatedBy)}` : ""} · ${new Date().toLocaleString("es-DO")}</div>
    <h2>Choferes</h2>
    <table>
      <thead><tr><th>Chofer</th><th>Pago</th><th class="right">Viajes</th><th class="right">Bruto</th><th class="right">Desc.</th><th class="right">Adelantos</th><th class="right">Neto a pagar</th><th class="right">Ayud.</th><th class="right">Pago ayudantes</th><th>Estado</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2">Totales</td><td class="right">${totals.trips}</td><td class="right">${fmt(totals.gross)}</td><td class="right">−${fmt(totals.discounts)}</td><td class="right">−${fmt(totals.advances)}</td><td class="right">${fmt(totals.net)}</td><td></td><td class="right">${fmt(totals.helpers)}</td><td></td></tr></tfoot>
    </table>
    <div class="small muted" style="margin-top:6px">Cada viaje se paga en la quincena en que la oficina recibió sus documentos. Los pendientes se liquidan cuando se entreguen.</div>
    ${hp ? `<h2>Ayudantes con pago directo</h2>
    <table>
      <thead><tr><th>Ayudante</th><th>Cédula</th><th class="right">Viajes</th><th class="right">Bruto</th><th class="right">Adelantos</th><th class="right">Neto a pagar</th><th>Cuenta</th><th>Estado</th></tr></thead>
      <tbody>${directRows}</tbody>
      <tfoot><tr><td colspan="2">Totales</td><td class="right">${hp.totals.trips}</td><td class="right">${fmt(hp.totals.gross)}</td><td class="right">−${fmt(hp.totals.advances)}</td><td class="right">${fmt(hp.totals.net)}</td><td></td><td></td></tr></tfoot>
    </table>
    ` : ""}<div class="box"><div>Total choferes: <b>${fmt(totals.net)}</b></div><div>Total ayudantes${hp ? " (por el chofer)" : ""}: <b>${fmt(totals.helpers)}</b></div>${hp ? `<div>Total ayudantes directos: <b>${fmt(hp.totals.net)}</b></div>` : ""}<div style="font-size:15px;margin-top:6px">Total nómina del período: <b>${fmt(totals.total + (hp ? hp.totals.net : 0))}</b></div></div>
    <h2>Tripulación por viaje (chofer, ayudantes y dieta repartida)</h2>
    <table><thead><tr><th>Fecha</th><th>Viaje</th><th>Persona</th><th>Rol</th><th class="right">Base</th><th class="right">Dieta</th><th class="right">Total</th><th>Se paga</th></tr></thead>
      <tbody>${crewRows || `<tr><td colspan="8" class="muted">Sin viajes en el período</td></tr>`}</tbody></table>
    <h2>Detalle de ayudantes por viaje${hp ? " (pagados por el chofer)" : ""}</h2>
    <table><thead><tr><th>Fecha</th><th>Viaje</th><th>Chofer</th><th>Ayudantes</th><th class="right">Cant.</th><th class="right">Pago c/u</th><th class="right">Total</th></tr></thead>
      <tbody>${helperDetail || `<tr><td colspan="7" class="muted">Sin ayudantes en el período</td></tr>`}</tbody></table>`;
}

/** Filas para el Excel de contabilidad. */
export function payrollSheets(payroll, helperPayroll = null) {
  const { drivers } = payroll;
  const resumen = [["Chofer", "Tipo de pago", "Viajes pagados", "Bruto (chofer+dieta)", "Descuentos", "Adelantos", "Neto a pagar", "Ayudantes (cant.)", "Pago ayudantes", "Viajes pendientes (no pagados)"],
    ...drivers.map(r => [r.driver.name, r.payType, r.tripCount, r.gross, r.discounts, r.advances, r.net, r.helperCount, r.helpers, r.pendingCount])];
  const detalle = [["Fecha", "Viaje", "Chofer", "Cliente", "Destino", "Camión", "Tamaño", "Pago chofer", "Dieta", "Ayudantes", "Pago c/u", "Total ayudantes", "Descuentos", "Neto chofer", "Factura", "Conduce", "POD"],
    ...drivers.flatMap(r => r.trips.map(({ trip, calc, client, truck, split }) => [trip.date, trip.id, r.driver.name, client?.companyName || "", `${trip.municipality}, ${trip.province}`, truck?.plate || "", calc.size, calc.base, calc.dieta, split ? split.viaDriver.count : calc.numHelpers, calc.helperEach, split ? split.viaDriver.amount : calc.helpersTotal, calc.discounts, calc.driverNet, trip.docs?.factura ? "Sí" : "No", trip.docs?.conduce ? "Sí" : "No", trip.docs?.pod ? "Sí" : "No"]))];
  const hp = helperPayroll && helperPayroll.rows.length ? helperPayroll : null;
  const ayudantes = hp ? [["Ayudante", "Cédula", "Banco", "Cuenta", "Viajes pagados", "Bruto", "Adelantos", "Neto a pagar", "Viajes pendientes (no pagados)"],
    ...hp.rows.map(h => [h.ayudante.name, h.ayudante.cedula || "", h.ayudante.bank || "", h.ayudante.account || "", h.tripCount, h.gross, h.advances, h.net, h.pendingCount]),
    [], ["Fecha", "Viaje", "Ayudante", "Chofer", "Cliente", "Destino", "Camión", "Monto"],
    ...hp.rows.flatMap(h => h.trips.map(x => [x.trip.date, x.trip.id, h.ayudante.name, x.driver?.name || "", x.client?.companyName || "", `${x.trip.municipality}, ${x.trip.province}`, x.truck?.plate || "", x.amount]))] : null;
  const tripulacion = [["Fecha", "Viaje", "Chofer del viaje", "Cliente", "Destino", "Tamaño", "Persona", "Rol", "Base", "Dieta", "Total", "Se paga"],
    ...drivers.flatMap(r => r.trips.flatMap(({ trip, calc, client }) => tripCrew(trip, calc, r.driver).map(c => [trip.date, trip.id, r.driver.name, client?.companyName || "", `${trip.municipality}, ${trip.province}`, calc.size, c.name, c.role === "chofer" ? "Chofer" : `Ayudante ${c.idx}`, c.base, c.dieta, c.total, c.role === "chofer" ? "al chofer" : c.direct ? "directo al ayudante" : "por el chofer"])))];
  return { resumen, detalle, ayudantes, tripulacion };
}

/** Tamaño del camión como lo lee el cliente: T1 = 16 pies, T2 = 26 pies. */
export const SIZE_LABEL = { T1: "16 pies", T2: "26 pies" };
const sizeOf = (tr, tk) => (tr?.tarifaOverride && tr.tarifaOverride !== "custom") ? tr.tarifaOverride : (tk?.size || "");
export const sizeLabel = (tr, tk) => SIZE_LABEL[sizeOf(tr, tk)] || sizeOf(tr, tk) || "";

/** Líneas y totales de una factura (una sola fuente para el PDF y el Excel). */
export function invoiceLines({ inv, client, trips = [], trucks = [], brokers = [] }) {
  const items = (inv.tripIds || []).map(id => trips.find(t => t.id === id)).filter(Boolean).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const lines = items.map((tr, i) => { const tk = trucks.find(t => t.id === tr.truckId); return { n: i + 1, date: tr.date, ref: tr.invoiceRef || "", destination: `${tr.municipality}, ${tr.province}`, size: sizeLabel(tr, tk), qty: 1, amount: Number(tr.revenue) || 0, joint: !!tr.joint }; });
  const gross = lines.reduce((s, l) => s + l.amount, 0);
  const passThrough = client?.rules?.brokerPassThrough === true;
  const brokerDed = Number(inv.brokerDeduction) || (passThrough ? items.reduce((s, tr) => { const b = brokers.find(x => x.id === tr.brokerId); return s + (b ? Math.round((Number(tr.revenue) || 0) * (Number(b.commissionPct) || 0) / 100) : 0); }, 0) : 0);
  const total = inv.amount != null ? Number(inv.amount) : gross - brokerDed;
  const status = inv.status === "paid" ? "COBRADA" : inv.status === "cancelled" ? "ANULADA" : "POR COBRAR";
  return { lines, gross, brokerDed, total, status };
}

/** Factura al cliente (formato FACTURA de la empresa: logo, razón social, RNC, datos del cliente y cuadro de viajes). */
export function invoiceHTML({ inv, client, trips = [], trucks = [], brokers = [], minRows = 10 }) {
  const { lines, gross, brokerDed, total, status } = invoiceLines({ inv, client, trips, trucks, brokers });
  const rows = lines.map(l => `<tr><td style="text-align:center">${l.n}</td><td>${esc(l.date)}</td><td>${esc(l.ref)}</td><td>${esc(l.destination)}</td><td style="text-align:center">${esc(l.size)}${l.joint ? " ⛓" : ""}</td><td style="text-align:center">${l.qty}</td><td class="right">${fmt(l.amount)}</td></tr>`);
  while (rows.length < minRows) rows.push(`<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`);
  return `
    ${companyHeaderHTML("FACTURA")}
    <div class="info">
      <div class="col"><div class="k">Nombre</div><div class="v" style="font-size:14px">${esc(client?.companyName || "—")}</div><div class="k">Contacto</div><div class="v">${esc([client?.contactPerson, client?.phone].filter(Boolean).join(" · ") || "—")}</div></div>
      <div class="col" style="text-align:right"><div class="k">Factura No.</div><div class="v" style="font-size:14px">${esc(inv.invoiceNumber || inv.id)}</div><div class="k">Fecha</div><div class="v">${esc(inv.date || "")} <span class="pill ${inv.status === "paid" ? "ok" : "no"}">${status}</span></div></div>
    </div>
    <table class="grid">
      <thead><tr><th style="width:28px">#</th><th style="width:80px">Fecha</th><th>Referencia</th><th>Destino</th><th style="width:70px">Tarifa</th><th style="width:60px">Cantidad</th><th style="width:100px" class="right">Total</th></tr></thead>
      <tbody>${rows.join("")}</tbody>
      <tfoot>
        ${brokerDed > 0 ? `<tr><td colspan="6" class="right">Subtotal</td><td class="right">${fmt(gross)}</td></tr><tr><td colspan="6" class="right">Comisión broker (deducida)</td><td class="right">− ${fmt(brokerDed)}</td></tr>` : ""}
        <tr class="tot"><td colspan="6" class="right" style="font-size:13px">TOTAL</td><td class="right" style="font-size:14px">${fmt(total)}</td></tr>
      </tfoot>
    </table>
    <div class="small muted" style="margin-top:6px">Tarifa: 16 pies = camión T1 · 26 pies = camión T2${lines.some(l => l.joint) ? " · ⛓ viaje conjunto: dos camiones bajo la misma referencia" : ""}.</div>
    ${inv.notes ? `<div class="small" style="margin-top:8px">${esc(inv.notes)}</div>` : ""}
    <div class="sig"><div>Entregado por</div><div>Recibido por: ${esc(client?.companyName || "")}</div><div>Fecha</div></div>
    <div class="foot">${esc(COMPANY.legalName)} · RNC ${esc(COMPANY.rnc)}</div>`;
}

/** La misma factura como filas para Excel. */
export function invoiceSheet({ inv, client, trips = [], trucks = [], brokers = [] }) {
  const { lines, gross, brokerDed, total, status } = invoiceLines({ inv, client, trips, trucks, brokers });
  const rows = [
    [COMPANY.legalName], [`RNC: ${COMPANY.rnc}`], ["FACTURA"], [],
    ["Nombre:", client?.companyName || ""], ["Contacto:", [client?.contactPerson, client?.phone].filter(Boolean).join(" · ")], ["Factura No.:", inv.invoiceNumber || inv.id], ["Fecha:", inv.date || ""], ["Estado:", status], [],
    ["#", "Fecha", "Referencia", "Destino", "Tarifa", "Cantidad", "Total"],
    ...lines.map(l => [l.n, l.date, l.ref, l.destination, l.size + (l.joint ? " (conjunto)" : ""), l.qty, l.amount]),
  ];
  if (brokerDed > 0) rows.push(["", "", "", "", "", "Subtotal", gross], ["", "", "", "", "", "Comisión broker", -brokerDed]);
  rows.push(["", "", "", "", "", "TOTAL", total]);
  return rows;
}

/** Reporte Profit First de una factura (r = buildInvoicePfReport): una página, de lo general a "qué mover". */
export function invoicePfReportHTML({ r, generatedBy }) {
  if (!r) return "";
  const { inv, client, tripRows, totals, collected, pending, balance, expTotals, settlements, brokerPayouts, moves, settings } = r;
  const pct = settings.reservePct, rest = 100 - pct;
  const m = (n) => fmt(Math.round((Number(n) || 0) * 100) / 100);
  const stateLabel = inv.status === "paid" ? "COBRADA" : inv.status === "cancelled" ? "ANULADA" : "POR COBRAR";
  const trucksHtml = tripRows.map(t => `<tr><td>${esc(t.truck?.plate || "—")} <span class="small muted">#${esc(t.trip.id)} ${esc(t.trip.date)} · ${esc(t.trip.municipality)}</span></td>
    <td>${esc(t.modelLabel)}${t.partner ? ` · ${esc(t.partner.name)}` : ""}<br><span class="small muted">${esc(t.modelDetail)}</span></td>
    <td class="right">${m(t.net)}</td><td class="right">${t.partnerSetAside + t.brokerSetAside ? m(t.partnerSetAside + t.brokerSetAside) : "—"}</td><td class="right"><b>${m(t.real)}</b></td></tr>`).join("");
  const partnersHtml = settlements.map(x => { const s = x.s, rel = x.rel; const ps = s.model === "profit_share";
    const how = ps ? `flete ${m(s.netRevenue)} − gastos que pagó la empresa ${m(s.reimbursement)} = utilidad ${m(s.periodResult)} → socio ${s.partnerSharePct} %`
      : `flete ${m(s.netRevenue)} − comisión ${s.commissionPct} % ${m(s.commission)}${s.reimbursement ? ` − gastos que pagó la empresa ${m(s.reimbursement)}` : ""}`;
    return `<tr><td><b>${esc(x.partner.name)}</b> <span class="small muted">${esc(MODEL_LABEL_PF[s.model] || s.model)} · quincena ${esc(x.period.label)} · ${x.status === "paid" ? "ya transferida" : "pendiente"}</span><br><span class="small muted">${how}${x.fixedTotal ? ` · cargos fijos de la quincena aparte: ${m(x.fixedTotal)}` : ""}</span></td>
      <td class="right"><b>${m(rel.transfer)}</b></td><td class="right">${m(rel.released)}</td><td class="right"><b>${m(rel.releasedToReserve)}</b></td><td class="right">${m(rel.releasedToOpex)}</td></tr>`; }).join("");
  const brokersHtml = brokerPayouts.map(b => `<tr><td><b>${esc(b.broker.name)}</b> <span class="small muted">broker</span></td><td class="right"><b>${m(b.amount - b.paid)}</b></td><td class="right">—</td><td class="right">—</td><td class="right">—</td></tr>`).join("");
  return `
    ${companyHeaderHTML("PROFIT FIRST — FACTURA")}
    <table class="fields">
      <tr><td>Factura:</td><td><b>${esc(inv.invoiceNumber || "#" + inv.id)}</b> · ${esc(client?.companyName || "—")} · ${esc(inv.date || "")} · ${stateLabel}</td></tr>
      <tr><td>Monto:</td><td>${m(r.invoiceAmount)} · cobrado ${m(balance.paid)} · saldo ${m(balance.balance)}</td></tr>
      <tr><td>Regla:</td><td>lo de socios y brokers se aparta; del resto (ingreso real) ${pct} % a Reserva y ${rest} % a OpEx. Al liquidar, lo que no se le transfiere al socio es ingreso real y se reparte igual.</td></tr>
    </table>

    <h2>1. De dónde sale el dinero</h2>
    <table><thead><tr><th>Camión · viaje</th><th>Modelo</th><th class="right">Flete</th><th class="right">Apartado</th><th class="right">Ingreso real</th></tr></thead>
      <tbody>${trucksHtml}</tbody>
      <tfoot><tr><td colspan="2">Factura</td><td class="right">${m(totals.net)}</td><td class="right">${m(totals.partnerSetAside + totals.brokerSetAside)}</td><td class="right"><b>${m(totals.real)}</b></td></tr></tfoot>
    </table>

    <h2>2. Qué mover</h2>
    <table><thead><tr><th style="width:34%">Al cobrar</th><th class="right">Cobrado ${m(collected.amount)}</th>${pending.amount > 0 ? `<th class="right">Falta ${m(pending.amount)}</th>` : ""}<th class="right">Factura completa</th></tr></thead><tbody>
      <tr><td>Income → <b>Reserva</b> (${pct} % del ingreso real)</td><td class="right"><b>${m(collected.reserve)}</b></td>${pending.amount > 0 ? `<td class="right muted">${m(pending.reserve)}</td>` : ""}<td class="right">${m(totals.reserveFull)}</td></tr>
      <tr><td>Income → <b>OpEx</b> (${rest} % del ingreso real)</td><td class="right"><b>${m(collected.opex)}</b></td>${pending.amount > 0 ? `<td class="right muted">${m(pending.opex)}</td>` : ""}<td class="right">${m(totals.opexFull)}</td></tr>
      <tr><td>Income → OpEx, <b>apartado</b> para socios y brokers (no se gasta)</td><td class="right">${m(collected.passThrough)}</td>${pending.amount > 0 ? `<td class="right muted">${m(pending.passThrough)}</td>` : ""}<td class="right">${m(totals.partnerSetAside + totals.brokerSetAside)}</td></tr>
    </tbody></table>

    ${settlements.length || brokerPayouts.length ? `<table style="margin-top:10px"><thead><tr><th style="width:34%">Al liquidar la quincena (de lo apartado)</th><th class="right">Transferir al socio</th><th class="right">La empresa retiene</th><th class="right">→ Reserva ${pct} %</th><th class="right">→ OpEx</th></tr></thead>
      <tbody>${partnersHtml}${brokersHtml}</tbody>
      <tfoot><tr><td>Total</td><td class="right"><b>${m(moves.onSettle.toPartners + moves.onSettle.toBrokers)}</b></td><td class="right">${m(moves.onSettle.reserve + moves.onSettle.opex)}</td><td class="right"><b>${m(moves.onSettle.reserve)}</b></td><td class="right">${m(moves.onSettle.opex)}</td></tr></tfoot>
    </table>
    <div class="small muted" style="margin-top:4px">Lo apartado ya está en OpEx: de ahí se transfiere al socio y el "→ Reserva" se mueve a mano en Banco (OpEx → Reserva).</div>` : `<div class="small muted">Todos los viajes son de camiones propios: no hay liquidación de socios.</div>`}

    <table style="margin-top:10px"><thead><tr><th style="width:34%">Pendiente de pagar por estos viajes (sale de OpEx)</th><th class="right">Monto</th></tr></thead><tbody>
      <tr><td>Nómina de choferes y ayudantes</td><td class="right">${m(moves.payrollPending)}</td></tr>
      <tr><td><b>Suplidores</b> a crédito (apartar en la cuenta Suplidores)</td><td class="right"><b>${m(moves.suppliers)}</b></td></tr>
      <tr><td>Otros gastos pendientes</td><td class="right">${m(moves.otherPending)}</td></tr>
      <tr><td class="muted">Ya pagado por estos viajes</td><td class="right muted">${m(expTotals.paid)}</td></tr>
    </tbody></table>

    <div class="box" style="margin-top:10px">
      <div>Reserva que genera esta factura (al cobrar ${m(collected.reserve + pending.reserve)} + al liquidar ${m(moves.onSettle.reserve)}): <b>${m(moves.totalReserve)}</b></div>
      <div>Gastos de la empresa en estos viajes: ${m(expTotals.total)} (${m(expTotals.chargedToPartner)} se recuperan de los socios)</div>
      <div style="font-size:14px">Margen de la empresa en esta factura: <b>${m(moves.margin)}</b></div>
    </div>
    <div class="small muted" style="margin-top:6px">Generado ${new Date().toLocaleString("es-DO")}${generatedBy ? ` por ${esc(generatedBy)}` : ""} · verificación: flete ${m(r.check.net)} = apartado ${m(totals.partnerSetAside + totals.brokerSetAside)} + ingreso real ${m(totals.real)}.</div>`;
}
const MODEL_LABEL_PF = { own: "Camión propio", commission: "Comisión", commission_expenses: "Comisión + gastos", profit_share: "Reparto de utilidad" };

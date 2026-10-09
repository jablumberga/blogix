/**
 * Reportes imprimibles (PDF vía diálogo de impresión del navegador).
 * Todo texto que viene de los datos pasa por esc() — nunca HTML crudo.
 */
import { fmt } from "./helpers.js";
import { TRIP_DOCS } from "./payroll.js";
import { COMPANY } from "../constants/company.js";

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
  @media print { body { margin: 12mm; } .noprint { display: none; } }
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
  const lines = row.trips.map(({ trip, client, truck, calc }) => `
    <tr>
      <td>${esc(trip.date)}</td>
      <td>${esc(client?.companyName || "—")}</td>
      <td>${esc(trip.invoiceRef || "")}</td>
      <td>${esc(trip.municipality)}, ${esc(trip.province)}</td>
      <td style="text-align:center">${esc(calc?.size || (truck?.size || ""))}</td>
      <td style="text-align:center">1</td>
      <td class="small">${docsCell(trip, client)}</td>
    </tr>`);
  while (lines.length < minRows) lines.push(`<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`);
  const docsOk = row.trips.filter(x => x.docsOk).length;
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
      <thead><tr><th>Fecha</th><th>Cliente</th><th>Referencia</th><th>Destino</th><th>Tarifa (T1/T2)</th><th>Cantidad</th><th>Docs</th></tr></thead>
      <tbody>${lines.join("")}</tbody>
      <tfoot><tr><td colspan="5" class="right"><b>Total :</b></td><td style="text-align:center"><b>${row.tripCount}</b></td><td class="small">${docsOk}/${row.tripCount} completos</td></tr></tfoot>
    </table>
    <div class="sig"><div>Entregado por: ${esc(generatedBy || "")}</div><div>Recibí conforme: ${esc(d.name)}</div><div>Fecha</div></div>`;
}

/** Reporte de nómina del período con todos los choferes y ayudantes (para contabilidad). */
export function payrollReportHTML({ payroll, company = "B-Logix", generatedBy }) {
  const { period, drivers, totals } = payroll;
  const rows = drivers.map(r => `
    <tr>
      <td>${esc(r.driver.name)}</td><td>${r.payType === "fixed" ? "Fijo" : r.payType === "percentage" ? `${esc(r.driver.percentageAmount)}%` : "Por viaje"}</td>
      <td class="right">${r.tripCount}</td>
      <td class="right">${fmt(r.gross)}</td><td class="right">${r.discounts ? "−" + fmt(r.discounts) : "—"}</td><td class="right">${r.advances ? "−" + fmt(r.advances) : "—"}</td>
      <td class="right"><b>${fmt(r.net)}</b></td>
      <td class="right">${r.helperCount}</td><td class="right">${fmt(r.helpers)}</td>
      <td class="small">${r.docsPending ? `<span class="no">${r.docsPending} sin docs</span>` : `<span class="ok">docs ✓</span>`}${r.missingRates ? ` <span class="no">${r.missingRates} sin tarifa</span>` : ""}</td>
    </tr>`).join("");
  const helperDetail = drivers.flatMap(r => r.trips.filter(x => x.calc.numHelpers > 0).map(({ trip, calc }) =>
    `<tr><td>${esc(trip.date)}</td><td>#${esc(trip.id)} ${esc(trip.municipality)}</td><td>${esc(r.driver.name)}</td><td>${esc((trip.helpers || []).map(h => h.name).filter(Boolean).join(", ") || "—")}</td><td class="right">${calc.numHelpers}</td><td class="right">${fmt(calc.helperEach)}</td><td class="right">${fmt(calc.helpersTotal)}</td></tr>`)).join("");
  return `
    ${companyHeaderHTML("NÓMINA DEL PERÍODO")}
    <div class="muted">${esc(period.label)} (${esc(period.dateFrom)} a ${esc(period.dateTo)})${generatedBy ? ` · Generado por ${esc(generatedBy)}` : ""} · ${new Date().toLocaleString("es-DO")}</div>
    <h2>Choferes</h2>
    <table>
      <thead><tr><th>Chofer</th><th>Pago</th><th class="right">Viajes</th><th class="right">Bruto</th><th class="right">Desc.</th><th class="right">Adelantos</th><th class="right">Neto a pagar</th><th class="right">Ayud.</th><th class="right">Pago ayudantes</th><th>Estado</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2">Totales</td><td class="right">${totals.trips}</td><td class="right">${fmt(totals.gross)}</td><td class="right">−${fmt(totals.discounts)}</td><td class="right">−${fmt(totals.advances)}</td><td class="right">${fmt(totals.net)}</td><td></td><td class="right">${fmt(totals.helpers)}</td><td></td></tr></tfoot>
    </table>
    <div class="box"><div>Total choferes: <b>${fmt(totals.net)}</b></div><div>Total ayudantes: <b>${fmt(totals.helpers)}</b></div><div style="font-size:15px;margin-top:6px">Total nómina del período: <b>${fmt(totals.total)}</b></div></div>
    <h2>Detalle de ayudantes por viaje</h2>
    <table><thead><tr><th>Fecha</th><th>Viaje</th><th>Chofer</th><th>Ayudantes</th><th class="right">Cant.</th><th class="right">Pago c/u</th><th class="right">Total</th></tr></thead>
      <tbody>${helperDetail || `<tr><td colspan="7" class="muted">Sin ayudantes en el período</td></tr>`}</tbody></table>`;
}

/** Filas para el Excel de contabilidad. */
export function payrollSheets(payroll) {
  const { drivers } = payroll;
  const resumen = [["Chofer", "Tipo de pago", "Viajes", "Bruto (chofer+dieta)", "Descuentos", "Adelantos", "Neto a pagar", "Ayudantes (cant.)", "Pago ayudantes", "Docs pendientes"],
    ...drivers.map(r => [r.driver.name, r.payType, r.tripCount, r.gross, r.discounts, r.advances, r.net, r.helperCount, r.helpers, r.docsPending])];
  const detalle = [["Fecha", "Viaje", "Chofer", "Cliente", "Destino", "Camión", "Tamaño", "Pago chofer", "Dieta", "Ayudantes", "Pago c/u", "Total ayudantes", "Descuentos", "Neto chofer", "Factura", "Conduce", "POD"],
    ...drivers.flatMap(r => r.trips.map(({ trip, calc, client, truck }) => [trip.date, trip.id, r.driver.name, client?.companyName || "", `${trip.municipality}, ${trip.province}`, truck?.plate || "", calc.size, calc.base, calc.dieta, calc.numHelpers, calc.helperEach, calc.helpersTotal, calc.discounts, calc.driverNet, trip.docs?.factura ? "Sí" : "No", trip.docs?.conduce ? "Sí" : "No", trip.docs?.pod ? "Sí" : "No"]))];
  return { resumen, detalle };
}

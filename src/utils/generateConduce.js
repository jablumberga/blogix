import { fmt } from "./helpers.js";

export function generateConduce(trip, client, truck, driver) {
  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) return;
  const helpers = (trip.helpers || [])
    .map((h, i) => `<tr><td>Ayudante ${i + 1}</td><td>${h.name}</td></tr>`)
    .join("");

  w.document.write(`<!DOCTYPE html><html><head><title>Conduce #${trip.id}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:40px;color:#222}
    .header{display:flex;justify-content:space-between;border-bottom:3px solid #1a3d7c;padding-bottom:15px;margin-bottom:20px}
    .logo{font-size:28px;font-weight:bold;color:#1a3d7c}
    .subtitle{color:#666;font-size:12px}
    table{width:100%;border-collapse:collapse;margin:15px 0}
    th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:13px}
    th{background:#f0f4f8;font-weight:600;color:#1a3d7c}
    .section{margin:20px 0;font-size:16px;font-weight:bold;color:#1a3d7c;border-bottom:1px solid #1a3d7c;padding-bottom:5px}
    .footer{margin-top:40px;display:flex;justify-content:space-between}
    .sig{border-top:1px solid #333;width:200px;text-align:center;padding-top:5px;font-size:12px}
    @media print{body{padding:20px}}
  </style></head><body>
  <div class="header">
    <div>
      <div class="logo">B-Logix</div>
      <div class="subtitle">Logística y Distribución | RNC: 000-000000-0</div>
      <div class="subtitle">Santo Domingo, República Dominicana</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:20px;font-weight:bold;color:#1a3d7c">CONDUCE</div>
      <div style="font-size:14px"># ${String(trip.id).padStart(6, "0")}</div>
      <div class="subtitle">Fecha: ${trip.date}</div>
    </div>
  </div>
  <div class="section">Información del Viaje</div>
  <table>
    <tr><th>Destino</th><td>${trip.municipality}, ${trip.province}</td></tr>
    <tr><th>Cliente</th><td>${client?.companyName || "—"}</td></tr>
    <tr><th>Camión</th><td>${truck?.plate || "—"} (${truck?.type || ""})</td></tr>
    <tr><th>Conductor</th><td>${driver?.name || "—"} | Lic: ${driver?.license || "—"}</td></tr>
    <tr><th>Carga</th><td>${trip.cargo}</td></tr>
    <tr><th>Peso</th><td>${trip.weight} tons</td></tr>
    <tr><th>Tarifa</th><td>${fmt(trip.revenue)}</td></tr>
    ${trip.invoiceRef ? `<tr><th>Ref. Factura</th><td>${trip.invoiceRef}</td></tr>` : ""}
    ${helpers ? `<tr><th colspan="2" style="text-align:center">Personal</th></tr>${helpers}` : ""}
  </table>
  <div class="footer">
    <div class="sig">Despachador</div>
    <div class="sig">Conductor</div>
    <div class="sig">Recibido por</div>
  </div>
  <script>setTimeout(()=>window.print(),500)</script>
  </body></html>`);
  w.document.close();
}

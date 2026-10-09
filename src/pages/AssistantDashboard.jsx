import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Printer, FileSpreadsheet, ClipboardCheck, Users, UserCog, AlertTriangle } from "lucide-react";
import { colors } from "../constants/theme.js";
import { genPeriods, today } from "../utils/helpers.js";
import { buildPayroll, partnerTripsInPeriod, TRIP_DOCS } from "../utils/payroll.js";
import { driverPeriodReportHTML, payrollReportHTML, payrollSheets, openPrintWindow } from "../utils/printReport.js";
import { Card, Btn, Badge, Th, Td } from "../components/ui/index.jsx";

/**
 * Panel de la asistente administrativa:
 *  - choferes y socios con sus viajes del período de nómina (30/31→14, 15→29)
 *  - checklist de documentos físicos recibidos por viaje
 *  - relación de viajes por chofer (PDF, sin montos)
 *  - nómina del período para contabilidad (PDF y Excel)
 */
export default function AssistantDashboard({ user, trips, setTrips, drivers = [], partners = [], trucks = [], clients = [], expenses = [], isMobile }) {
  const periods = useMemo(() => genPeriods([...trips.map(t => t.date), today()]), [trips]);
  const [pIdx, setPIdx] = useState(0);            // 0 = período en curso
  const period = periods[pIdx] || periods[0];
  const [sel, setSel] = useState(null);            // { kind: "driver"|"partner", id }

  const payroll = useMemo(() => buildPayroll({ period, drivers, trips, trucks, clients, expenses, partners }), [period, drivers, trips, trucks, clients, expenses, partners]);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  const activePartners = partners.filter(p => p.status !== "inactive");
  const partnerRows = activePartners.map(p => ({ partner: p, items: partnerTripsInPeriod({ partner: p, period, trips, trucks, clients, drivers }) })).filter(r => r.items.length > 0);

  const selectedDriver = sel?.kind === "driver" ? payroll.drivers.find(r => r.driver.id === sel.id) : null;
  const selectedPartner = sel?.kind === "partner" ? partnerRows.find(r => r.partner.id === sel.id) : null;
  const detailItems = selectedDriver ? selectedDriver.trips : selectedPartner ? selectedPartner.items : [];

  // ── Documentos físicos recibidos (una sola marca por viaje) ────────────
  const setReceived = (tripId, value) => setTrips(prev => prev.map(tr => {
    if (tr.id !== tripId) return tr;
    const docs = Object.fromEntries(TRIP_DOCS.map(d => [d.key, value]));
    return { ...tr, docs, docStatus: value ? "delivered" : "pending", podDelivered: value,
      docsReceivedAt: value ? (tr.docsReceivedAt || today()) : null, docsReceivedBy: value ? (tr.docsReceivedBy || user?.name || "") : "" };
  }));
  const setAllReceived = (items, value) => items.forEach(({ trip }) => setReceived(trip.id, value));

  // ── Reportes ────────────────────────────────────────────────────────────
  const printDriver = (row) => openPrintWindow(`Viajes ${row.driver.name} ${period.label}`, driverPeriodReportHTML({ row, period, generatedBy: user?.name }));
  const printPayroll = () => openPrintWindow(`Nómina ${period.label}`, payrollReportHTML({ payroll, generatedBy: user?.name }));
  const exportPayrollXlsx = async () => {
    const XLSX = await import("xlsx");
    const { resumen, detalle } = payrollSheets(payroll);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalle), "Detalle viajes");
    XLSX.writeFile(wb, `nomina-${period.dateFrom}-a-${period.dateTo}.xlsx`);
  };

  const totalTrips = payroll.totals.trips;
  const totalDocsPending = payroll.drivers.reduce((s, r) => s + r.docsPending, 0);


  return <div>
    {/* ── Período ── */}
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setPIdx(i => Math.min(periods.length - 1, i + 1))} style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, cursor: "pointer", padding: 6 }}><ChevronLeft size={14} /></button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{period.label}{pIdx === 0 && <Badge label="En curso" color={colors.green} />}</div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>{period.dateFrom} a {period.dateTo} · {totalTrips} viajes · {payroll.drivers.length} choferes · {partnerRows.length} socios con viajes</div>
        </div>
        <button onClick={() => setPIdx(i => Math.max(0, i - 1))} disabled={pIdx === 0} style={{ background: "none", border: `1px solid ${colors.border}`, borderRadius: 8, color: pIdx === 0 ? colors.textMuted : colors.text, cursor: pIdx === 0 ? "default" : "pointer", padding: 6 }}><ChevronRight size={14} /></button>
        <span style={{ flex: 1 }} />
        {totalDocsPending > 0 && <span style={{ fontSize: 11, color: colors.orange }}><AlertTriangle size={12} style={{ verticalAlign: "middle" }} /> {totalDocsPending} viaje(s) con documentos pendientes</span>}
        <Btn variant="ghost" onClick={printPayroll} style={{ fontSize: 11 }}><Printer size={12} /> Nómina del período (PDF)</Btn>
        <Btn onClick={exportPayrollXlsx} style={{ fontSize: 11 }}><FileSpreadsheet size={12} /> Nómina para contabilidad (Excel)</Btn>
      </div>
    </Card>

    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "320px 1fr", gap: 14 }}>
      {/* ── Lista de choferes y socios ── */}
      <div>
        <Card style={{ marginBottom: 14 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Users size={14} color={colors.green} /> Choferes</h3>
          {payroll.drivers.length === 0 && <div style={{ fontSize: 12, color: colors.textMuted }}>Sin viajes en este período.</div>}
          {payroll.drivers.map(r => {
            const on = sel?.kind === "driver" && sel.id === r.driver.id;
            return <button key={r.driver.id} type="button" onClick={() => setSel({ kind: "driver", id: r.driver.id })}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 4, borderRadius: 8, cursor: "pointer", textAlign: "left", border: `1px solid ${on ? colors.accent : colors.border}`, background: on ? colors.accent + "18" : "transparent", color: colors.text }}>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{r.driver.name}</span>
              <span style={{ fontSize: 11, color: colors.textMuted }}>{r.tripCount} viajes</span>
              {r.docsPending > 0 ? <Badge label={`${r.docsPending} sin docs`} color={colors.orange} /> : <Badge label="docs ✓" color={colors.green} />}
            </button>;
          })}
        </Card>
        <Card>
          <h3 style={{ margin: "0 0 8px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><UserCog size={14} color={colors.orange} /> Socios</h3>
          {partnerRows.length === 0 && <div style={{ fontSize: 12, color: colors.textMuted }}>Sin viajes de camiones de socios en este período.</div>}
          {partnerRows.map(r => {
            const on = sel?.kind === "partner" && sel.id === r.partner.id;
            const pend = r.items.filter(x => !x.docsOk).length;
            return <button key={r.partner.id} type="button" onClick={() => setSel({ kind: "partner", id: r.partner.id })}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 4, borderRadius: 8, cursor: "pointer", textAlign: "left", border: `1px solid ${on ? colors.orange : colors.border}`, background: on ? colors.orange + "18" : "transparent", color: colors.text }}>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{r.partner.name}</span>
              <span style={{ fontSize: 11, color: colors.textMuted }}>{r.items.length} viajes</span>
              {pend > 0 ? <Badge label={`${pend} sin docs`} color={colors.orange} /> : <Badge label="docs ✓" color={colors.green} />}
            </button>;
          })}
        </Card>
      </div>

      {/* ── Detalle ── */}
      <Card>
        {!sel && <div style={{ textAlign: "center", padding: 40, color: colors.textMuted, fontSize: 13 }}>Elige un chofer o socio para ver sus viajes del período y marcar los documentos recibidos.</div>}
        {sel && <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{selectedDriver ? selectedDriver.driver.name : selectedPartner?.partner.name}</h3>
            <span style={{ fontSize: 11, color: colors.textMuted }}>{detailItems.length} viajes · {period.label}</span>
            <span style={{ flex: 1 }} />
            {detailItems.length > 0 && <Btn variant="ghost" onClick={() => setAllReceived(detailItems, !detailItems.every(x => x.docsOk))} style={{ fontSize: 11 }}><ClipboardCheck size={12} /> {detailItems.every(x => x.docsOk) ? "Desmarcar todos" : "Marcar todos como recibidos"}</Btn>}
            {selectedDriver && <Btn variant="ghost" onClick={() => printDriver(selectedDriver)} style={{ fontSize: 11 }}><Printer size={12} /> Relación de viajes (PDF)</Btn>}
          </div>
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              <Th>Fecha</Th><Th>Cliente</Th><Th>Referencia</Th><Th>Ciudad</Th>{selectedPartner && <Th>Chofer</Th>}<Th>Camión</Th><Th align="center">Recibido</Th>
            </tr></thead>
            <tbody>{detailItems.map(({ trip, client, truck, driver: drv, docsOk }) =>
              <tr key={trip.id} style={{ borderBottom: `1px solid ${colors.border}11`, background: docsOk ? colors.green + "0a" : "transparent" }}>
                <Td>{trip.date}</Td><Td>{client?.companyName || "—"}</Td><Td>{trip.invoiceRef || <span style={{ color: colors.textMuted }}>—</span>}</Td>
                <Td>{trip.municipality}<span style={{ color: colors.textMuted }}>, {trip.province}</span></Td>
                {selectedPartner && <Td>{drv?.name || "—"}</Td>}
                <Td>{truck?.plate || "—"}</Td>
                <Td align="center">
                  <label title={trip.docsReceivedAt ? `Recibido el ${trip.docsReceivedAt}${trip.docsReceivedBy ? ` por ${trip.docsReceivedBy}` : ""}` : "Marcar cuando llegue la factura física"} style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: docsOk ? colors.green : colors.textMuted }}>
                    <input type="checkbox" checked={docsOk} onChange={e => setReceived(trip.id, e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                    {docsOk ? "Sí" : "No"}
                  </label>
                </Td>
              </tr>
            )}</tbody>
          </table>
          </div>
          {detailItems.length === 0 && <div style={{ textAlign: "center", padding: 24, color: colors.textMuted, fontSize: 12 }}>Sin viajes en este período.</div>}
        </>}
      </Card>
    </div>
  </div>;
}

import { useState, useMemo, Fragment } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, Clock, Users, FileText, Pencil, X, Check, Printer, FileSpreadsheet, PiggyBank, AlertTriangle, HardHat } from "lucide-react";
import WhatsAppButton from "../components/WhatsAppButton.jsx";
import { helperWaData } from "../utils/whatsappData.js";
import { COMPANY } from "../constants/company.js";
import { colors } from "../constants/theme.js";
import { fmt, genPeriods, today, nxId } from "../utils/helpers.js";
import { buildPayroll, payrollPayment, payrollKey, buildHelperPayroll, helperPayrollPayment } from "../utils/payroll.js";
import { tripCrew } from "../utils/driverPay.js";
import { DEFAULT_PF_SETTINGS } from "../utils/profitFirst.js";
import { bankOverview } from "../utils/bankAccounts.js";
import { driverPeriodReportHTML, driverPayrollHTML, payrollReportHTML, payrollSheets, openPrintWindow, helperPeriodReportHTML } from "../utils/printReport.js";
import { Card, PageHeader, Badge, Btn, Th, Td } from "../components/ui/index.jsx";

const PURPLE = "#9b7fe8";
const inp = { background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 5, color: colors.text, padding: "4px 8px", fontSize: 12 };
const smallBtn = (bg, color, border) => ({ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 5, border: border || "none", background: bg, color, cursor: "pointer", fontSize: 11, fontWeight: 600 });

function OverrideBox({ label, current, note, onSave, onCancel, color = PURPLE }) {
  const [amount, setAmount] = useState(current);
  const [n, setN] = useState(note || "");
  return <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", background: color + "18", borderRadius: 7, border: `1px solid ${color}40` }}>
    <span style={{ fontSize: 11, color, fontWeight: 600 }}>✏️ {label}:</span>
    <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} style={{ ...inp, width: 100 }} />
    <input placeholder="Nota (acuerdo especial, bono, daño…)" value={n} onChange={e => setN(e.target.value)} style={{ ...inp, width: 230 }} />
    <button onClick={() => onSave(amount, n)} style={smallBtn(colors.green, "white")}><Check size={11} /> Guardar</button>
    <button onClick={onCancel} style={smallBtn("transparent", colors.textMuted, `1px solid ${colors.border}`)}><X size={11} /> Cancelar</button>
  </div>;
}

function DriverCard({ row, pay, period, onMarkPaid, onMarkUnpaid, onLineOverride, onTotalOverride, onClearTotalOverride, onPrint, onPrintPayroll, isMobile }) {
  const [open, setOpen] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [editingTotal, setEditingTotal] = useState(false);
  const d = row.driver;
  const payLabel = row.payType === "fixed" ? `Fijo ${fmt(row.fixedAmount)}` : row.payType === "percentage" ? `${d.percentageAmount || 0}% del flete` : "Por viaje (tarifario)";
  const totalOut = pay.net + row.helpers;

  return <Card style={{ marginBottom: 10, borderLeft: `4px solid ${pay.paid ? colors.green : pay.partial ? colors.orange : colors.border}` }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: colors.accent + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Users size={16} color={colors.accent} /></div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>
            {row.tripCount} viaje{row.tripCount !== 1 ? "s" : ""} recibido{row.tripCount !== 1 ? "s" : ""} · {payLabel}
            {row.pendingCount > 0 && <span style={{ color: colors.orange, marginLeft: 6 }}>· {row.pendingCount} sin documentos (no se paga aún)</span>}
            {row.missingRates > 0 && <span style={{ color: colors.red, marginLeft: 6 }}>· {row.missingRates} sin tarifa</span>}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={onPrintPayroll} title="Nómina de este chofer en PDF (viajes, chofer + dieta, ayudantes + dieta, adelantos, neto)" style={smallBtn(colors.accent + "14", colors.accent, `1px solid ${colors.accent}40`)} data-driver-payroll-pdf><Printer size={12} /> Nómina PDF</button>
        <button onClick={onPrint} style={smallBtn(colors.green + "14", colors.green, `1px solid ${colors.green}40`)}><FileText size={12} /> Relación</button>
        <WhatsAppButton phone={d.phone} name={d.name} template="pago_quincena" compact label="WhatsApp" testId={`pay-${d.id}`}
          data={{ name: d.name, period: period?.label || "", company: COMPANY.brand || "B-Logix", trips: row.tripCount, advances: row.advances, net: pay.net, paid: pay.paid }} />
        <button onClick={() => setOpen(o => !o)} style={smallBtn("transparent", colors.accent)}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{open ? "Ocultar" : "Detalle"}</button>
        <div style={{ textAlign: "right", minWidth: 120 }}>
          {pay.override && <div style={{ fontSize: 10, color: colors.textMuted, textDecoration: "line-through" }}>{fmt(pay.driverTotal)}</div>}
          {pay.override && <div style={{ fontSize: 10, color: PURPLE, fontWeight: 600 }}>✏️ OVERRIDE {pay.override.overrideNote ? `· ${pay.override.overrideNote}` : ""}</div>}
          {!pay.override && row.advances > 0 && <div style={{ fontSize: 10, color: colors.textMuted }}>Bruto {fmt(pay.driverTotal)} · adelantos −{fmt(row.advances)}</div>}
          <div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 700 }}>{pay.paid ? "PAGADO" : "A TRANSFERIR"}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: pay.paid ? colors.green : pay.override ? PURPLE : colors.orange }}>{fmt(pay.net)}</div>
          {row.helpers > 0 && <div style={{ fontSize: 10, color: colors.cyan }}>+ ayudantes {fmt(row.helpers)} ({row.helperCount})</div>}
        </div>
        {!pay.paid && <>
          <button onClick={() => setEditingTotal(t => !t)} title="Override del total" style={smallBtn(pay.override ? PURPLE + "22" : "transparent", pay.override ? PURPLE : colors.textMuted, `1px solid ${pay.override ? PURPLE + "60" : colors.border}`)}><Pencil size={11} /> Total</button>
          {pay.override && <button onClick={onClearTotalOverride} title="Quitar override" style={{ background: "transparent", border: "none", color: colors.textMuted, cursor: "pointer", padding: 4 }}><X size={12} /></button>}
          {(totalOut > 0 || row.payType === "fixed") && <button onClick={onMarkPaid} style={{ ...smallBtn(colors.green, "white"), padding: "7px 12px", fontSize: 12 }}><CheckCircle2 size={13} /> Marcar pagado {fmt(totalOut)}</button>}
        </>}
        {pay.paid && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge label={`✓ Pagado ${fmt(totalOut)}`} color={colors.green} />
          <button onClick={onMarkUnpaid} style={smallBtn("transparent", colors.textMuted, `1px solid ${colors.border}`)}>Desmarcar</button>
        </div>}
      </div>
    </div>
    {editingTotal && <div style={{ marginTop: 8 }}><OverrideBox label="Override total" current={pay.override ? pay.override.amount : pay.driverTotal} note={pay.override?.overrideNote} onSave={(a, n) => { onTotalOverride(a, n); setEditingTotal(false); }} onCancel={() => setEditingTotal(false)} /></div>}
    {open && <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}`, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>Viaje</Th><Th>Recibido</Th><Th>Cliente</Th><Th>Destino</Th><Th align="center">Tarifa</Th><Th align="right">Chofer</Th><Th align="right">Dieta</Th><Th align="right">Desc.</Th><Th align="right">Neto chofer</Th><Th align="right">Ayudantes</Th><Th align="right">Estado</Th>
        </tr></thead>
        <tbody>
          {pay.lines.map(l => {
            const { trip, calc, client } = l;
            const editing = editingLine === trip.id;
            return <Fragment key={trip.id}>
              <tr style={{ borderBottom: `1px solid ${colors.border}11` }}>
                <Td>{trip.date} <span style={{ color: colors.textMuted }}>#{trip.id}</span></Td>
                <Td>{trip.docsReceivedAt || "—"}</Td>
                <Td>{client?.companyName || "—"}{calc.sheetName && calc.sheetName !== "General" ? <div style={{ fontSize: 10, color: colors.textMuted }}>tarifario {calc.sheetName}</div> : null}</Td>
                <Td>{trip.municipality}, {trip.province}</Td>
                <Td align="center">{calc.size}{!calc.rateFound && row.payType === "perTrip" && <div style={{ fontSize: 10, color: colors.red }}>sin tarifa</div>}</Td>
                <Td align="right">{fmt(calc.base)}</Td>
                <Td align="right" color={calc.dieta ? colors.accent : colors.textMuted}>{calc.dieta ? fmt(calc.dieta) : "—"}</Td>
                <Td align="right" color={calc.discounts ? colors.red : colors.textMuted}>{calc.discounts ? "−" + fmt(calc.discounts) : "—"}</Td>
                <Td align="right">
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
                    {l.overridden && <span style={{ fontSize: 10, color: colors.textMuted, textDecoration: "line-through" }}>{fmt(calc.driverNet)}</span>}
                    <b style={{ color: l.overridden ? PURPLE : colors.text }}>{fmt(l.amount)}</b>
                    {!l.paid && row.payType !== "fixed" && <button onClick={() => setEditingLine(editing ? null : trip.id)} title="Override de este viaje" style={{ background: "none", border: "none", cursor: "pointer", color: l.overridden ? PURPLE : colors.textMuted, padding: 2, display: "flex" }}><Pencil size={11} /></button>}
                  </div>
                  {l.overridden && l.exp?.overrideNote && <div style={{ fontSize: 10, color: PURPLE }}>✏️ {l.exp.overrideNote}</div>}
                </Td>
                <Td align="right" color={l.split.viaDriver.amount ? colors.cyan : colors.textMuted}>{l.split.viaDriver.amount ? `${fmt(l.split.viaDriver.amount)} (${l.split.viaDriver.count})` : "—"}{l.split.direct.length > 0 && <div style={{ fontSize: 10, color: colors.textMuted }}>+ directo: {l.split.direct.map(d => d.name).join(", ")}</div>}</Td>
                <Td align="right"><Badge label={l.paid ? "✓ Pagado" : "Pendiente"} color={l.paid ? colors.green : colors.orange} /></Td>
              </tr>
              {row.payType === "perTrip" && calc.rateFound && <tr style={{ background: colors.accent + "06" }}><Td></Td><Td colSpan={10} style={{ fontSize: 11, color: colors.textMuted, paddingLeft: 20 }} data-crew>
                ↳ {tripCrew(trip, calc, row.driver).map((c, i) => <span key={i} style={{ marginRight: 14, whiteSpace: "nowrap" }}><b style={{ color: c.role === "chofer" ? colors.text : colors.cyan }}>{c.role === "chofer" ? "Chofer" : `Ayudante ${c.idx}`}{c.role === "ayudante" && c.name && !/^Ayudante \d+$/.test(c.name) ? ` (${c.name})` : ""}</b>: {fmt(c.base)}{c.dieta ? ` + dieta ${fmt(c.dieta)}` : ""} = <b>{fmt(c.total)}</b>{c.direct ? <span style={{ color: colors.purple }}> · directo</span> : ""}</span>)}
              </Td></tr>}
              {editing && <tr><td colSpan={11} style={{ padding: "6px 10px" }}><OverrideBox label="Override de este viaje" current={l.amount} note={l.exp?.overrideNote} onSave={(a, n) => { onLineOverride(l, a, n); setEditingLine(null); }} onCancel={() => setEditingLine(null)} /></td></tr>}
              {(trip.discounts || []).filter(x => x.amount > 0).map((x, i) => <tr key={`d${i}`} style={{ background: colors.red + "08" }}><Td></Td><Td colSpan={7} style={{ fontSize: 11, color: colors.red, paddingLeft: 20 }}>↳ Descuento: {x.desc || "—"}</Td><Td align="right" color={colors.red}>−{fmt(x.amount)}</Td><Td></Td><Td></Td></tr>)}
            </Fragment>;
          })}
          {row.pendingTrips.map(({ trip, client }) => <tr key={`p${trip.id}`} style={{ opacity: 0.55 }}>
            <Td>{trip.date} <span style={{ color: colors.textMuted }}>#{trip.id}</span></Td><Td color={colors.orange}>Pendiente</Td><Td>{client?.companyName || "—"}</Td><Td>{trip.municipality}, {trip.province}</Td>
            <Td colSpan={7} style={{ fontSize: 11, color: colors.orange }}>Sin documentos: se paga en la quincena en que la oficina los reciba.</Td>
          </tr>)}
        </tbody>
        <tfoot><tr style={{ borderTop: `2px solid ${colors.border}` }}>
          <Td colSpan={5} bold>Totales</Td><Td align="right">{fmt(row.base)}</Td><Td align="right">{fmt(row.dieta)}</Td><Td align="right" color={colors.red}>{row.discounts ? "−" + fmt(row.discounts) : "—"}</Td><Td align="right" bold>{fmt(pay.driverTotal)}</Td><Td align="right" bold color={colors.cyan}>{fmt(row.helpers)}</Td><Td></Td>
        </tr></tfoot>
      </table>
      {row.advances > 0 && <div style={{ fontSize: 11, color: colors.orange, marginTop: 6 }}>Adelantos del período: −{fmt(row.advances)} (ya pagados en efectivo; se descuentan del neto).</div>}
      {row.helperNames.length > 0 && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>Ayudantes: {row.helperNames.join(", ")}</div>}
      {row.directHelpers > 0 && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>Ayudantes con pago directo en sus viajes: {fmt(row.directHelpers)} (se pagan en la sección Ayudantes, no al chofer).</div>}
    </div>}
  </Card>;
}

function HelperCard({ row, pay, period, onMarkPaid, onMarkUnpaid, onPrint }) {
  const [open, setOpen] = useState(false);
  const a = row.ayudante;
  return <Card style={{ marginBottom: 10, borderLeft: `4px solid ${pay.paid ? colors.green : pay.partial ? colors.orange : colors.border}` }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: colors.orange + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><HardHat size={16} color={colors.orange} /></div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>
            {row.tripCount} viaje{row.tripCount !== 1 ? "s" : ""} recibido{row.tripCount !== 1 ? "s" : ""} · ayudante, pago directo{[a.bank, a.account].filter(Boolean).length ? ` · ${[a.bank, a.account].filter(Boolean).join(" ")}` : ""}
            {row.pendingCount > 0 && <span style={{ color: colors.orange, marginLeft: 6 }}>· {row.pendingCount} sin documentos (no se paga aún)</span>}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={onPrint} style={smallBtn(colors.green + "14", colors.green, `1px solid ${colors.green}40`)}><FileText size={12} /> Su relación</button>
        <WhatsAppButton phone={a.phone} name={a.name} template="pago_ayudante" compact label="WhatsApp" testId={`helper-${a.id}`} data={helperWaData(row, pay, period)} />
        <button onClick={() => setOpen(o => !o)} style={smallBtn("transparent", colors.accent)}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{open ? "Ocultar" : "Detalle"}</button>
        <div style={{ textAlign: "right", minWidth: 120 }}>
          {row.advances > 0 && <div style={{ fontSize: 10, color: colors.textMuted }}>Bruto {fmt(row.gross)} · adelantos −{fmt(row.advances)}</div>}
          <div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 700 }}>{pay.paid ? "PAGADO" : "A TRANSFERIR"}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: pay.paid ? colors.green : colors.orange }}>{fmt(row.net)}</div>
        </div>
        {!pay.paid && row.tripCount > 0 && <button onClick={onMarkPaid} style={{ ...smallBtn(colors.green, "white"), padding: "7px 12px", fontSize: 12 }}><CheckCircle2 size={13} /> Marcar pagado {fmt(row.net)}</button>}
        {pay.paid && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge label={`✓ Pagado ${fmt(row.net)}`} color={colors.green} />
          <button onClick={onMarkUnpaid} style={smallBtn("transparent", colors.textMuted, `1px solid ${colors.border}`)}>Desmarcar</button>
        </div>}
      </div>
    </div>
    {open && <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}`, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Viaje</Th><Th>Recibido</Th><Th>Cliente</Th><Th>Destino</Th><Th>Camión / chofer</Th><Th align="right">Pago</Th><Th align="right">Estado</Th></tr></thead>
        <tbody>
          {pay.lines.map(l => <tr key={l.trip.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
            <Td>{l.trip.date} <span style={{ color: colors.textMuted }}>#{l.trip.id}</span></Td><Td>{l.trip.docsReceivedAt || "—"}</Td><Td>{l.client?.companyName || "—"}</Td><Td>{l.trip.municipality}, {l.trip.province}</Td>
            <Td>{l.truck?.plate || "—"} · {l.driver?.name || "—"}</Td><Td align="right" bold>{fmt(l.amount)}</Td>
            <Td align="right"><Badge label={l.paid ? "✓ Pagado" : "Pendiente"} color={l.paid ? colors.green : colors.orange} /></Td>
          </tr>)}
          {row.pendingTrips.map(x => <tr key={`p${x.trip.id}`} style={{ opacity: 0.55 }}>
            <Td>{x.trip.date} <span style={{ color: colors.textMuted }}>#{x.trip.id}</span></Td><Td color={colors.orange}>Pendiente</Td><Td>{x.client?.companyName || "—"}</Td><Td>{x.trip.municipality}, {x.trip.province}</Td>
            <Td colSpan={3} style={{ fontSize: 11, color: colors.orange }}>Sin documentos: se paga en la quincena en que la oficina los reciba.</Td>
          </tr>)}
        </tbody>
        <tfoot><tr style={{ borderTop: `2px solid ${colors.border}` }}><Td colSpan={5} bold>Total</Td><Td align="right" bold>{fmt(row.gross)}</Td><Td></Td></tr></tfoot>
      </table>
      {row.advances > 0 && <div style={{ fontSize: 11, color: colors.orange, marginTop: 6 }}>Adelantos del período: −{fmt(row.advances)} (ya pagados; se descuentan del neto).</div>}
    </div>}
  </Card>;
}

/**
 * Nómina (admin). Fuente única: buildPayroll → un viaje se paga en la quincena en que
 * la oficina recibió sus documentos. Profit First: la nómina sale de OpEx.
 */
export default function NominaPage({ t, expenses, setExpenses, trips, drivers, trucks, clients = [], cobros = [], ayudantes = [], pfSettings = DEFAULT_PF_SETTINGS, bankAccount = null, bankTransfers = [], user, isMobile }) {
  const periods = useMemo(() => genPeriods([...trips.map(x => x.date), ...trips.map(x => x.docsReceivedAt).filter(Boolean), ...expenses.filter(e => e.category === "driverPay").map(e => e.date), today()]), [trips, expenses]);
  const [pIdx, setPIdx] = useState(0);
  const [method, setMethod] = useState("transfer");
  const period = periods[pIdx] || periods[0];
  const payroll = useMemo(() => buildPayroll({ period, drivers, trips, trucks, clients, expenses }), [period, drivers, trips, trucks, clients, expenses]);
  const rows = useMemo(() => payroll.drivers.map(row => ({ row, pay: payrollPayment({ row, period, expenses }) })), [payroll, period, expenses]);
  const key = payrollKey(period);
  // Ayudantes con pago directo (su propia nómina)
  const helperPayroll = useMemo(() => buildHelperPayroll({ period, ayudantes, drivers, trips, trucks, clients, expenses }), [period, ayudantes, drivers, trips, trucks, clients, expenses]);
  const helperRows = useMemo(() => helperPayroll.rows.map(row => ({ row, pay: helperPayrollPayment({ row, period, expenses }) })), [helperPayroll, period, expenses]);

  const pendingTotal = rows.filter(r => !r.pay.paid).reduce((s, r) => s + r.pay.net + r.row.helpers, 0) + helperRows.filter(r => !r.pay.paid).reduce((s, r) => s + r.row.net, 0);
  const paidTotal = rows.filter(r => r.pay.paid).reduce((s, r) => s + r.pay.net + r.row.helpers, 0) + helperRows.filter(r => r.pay.paid).reduce((s, r) => s + r.row.net, 0);
  // Saldos reales de las cuentas del Banco: la nómina sale de OpEx
  const pf = useMemo(() => { const b = bankOverview({ bankAccount, expenses, cobros, transfers: bankTransfers, settings: pfSettings, todayStr: today() }); return { opexAvailable: b.opexBalance, opexCommitted: b.opexCommitted, reserve: b.reserveBalance }; }, [bankAccount, expenses, cobros, bankTransfers, pfSettings]);
  const afterPay = pf.opexAvailable - pendingTotal;

  // ── Gastos que respaldan la nómina ───────────────────────────────────────
  const upsert = (list, match, make, patch) => {
    const ex = list.find(match);
    if (ex) return list.map(e => e === ex ? { ...e, ...patch(e) } : e);
    return [...list, { id: nxId(list), ...make(), ...patch({}) }];
  };

  const markPaid = ({ row, pay }) => {
    const date = today();
    setExpenses(prev => {
      let next = prev;
      const d = row.driver;
      if (row.payType === "fixed") {
        next = upsert(next, e => e.category === "driverPay" && !e.tripId && e.driverId === d.id && e.payrollKey === key,
          () => ({ category: "driverPay", driverId: d.id, tripId: null, supplierId: null, date: period.dateTo, description: `Nómina fija ${d.name} · ${period.label}` }),
          () => ({ amount: pay.grossEff, status: "paid", paidDate: date, paymentMethod: method, payrollKey: key }));
      } else {
        // Con override total: se reparte proporcionalmente entre los viajes para que los gastos sumen lo pagado
        const factor = pay.override && pay.driverTotal > 0 ? pay.grossEff / pay.driverTotal : 1;
        let acc = 0;
        pay.lines.forEach((l, i) => {
          const last = i === pay.lines.length - 1;
          const amount = pay.override ? (last ? Math.round((pay.grossEff - acc) * 100) / 100 : Math.round(l.amount * factor * 100) / 100) : l.amount;
          acc += amount;
          if (amount <= 0 && !l.exp) return;
          next = upsert(next, e => e.category === "driverPay" && e.tripId === l.trip.id,
            () => ({ category: "driverPay", tripId: l.trip.id, driverId: d.id, supplierId: null, date: l.trip.date, description: `Pago chofer ${d.name} · ${l.trip.municipality}` }),
            e => ({ amount, calcAmount: e.calcAmount ?? l.calc.driverNet, status: "paid", paidDate: date, paymentMethod: method, payrollKey: key, driverId: d.id }));
        });
        if (pay.override && pay.lines.length === 0 && pay.grossEff > 0) {
          next = upsert(next, e => e.category === "driverPay" && !e.tripId && e.driverId === d.id && e.payrollKey === key,
            () => ({ category: "driverPay", driverId: d.id, tripId: null, supplierId: null, date: period.dateTo, description: `Nómina ${d.name} · ${period.label}` }),
            () => ({ amount: pay.grossEff, status: "paid", paidDate: date, paymentMethod: method, payrollKey: key }));
        }
        if (pay.override) next = next.map(e => e === pay.override || e.id === pay.override.id ? { ...e, status: "paid", paidDate: date } : e);
      }
      // Ayudantes que van por el chofer (los directos se pagan en su propia sección)
      row.trips.forEach(x => {
        if (x.split.viaDriver.amount <= 0) return;
        next = upsert(next, e => e.category === "helper" && e.tripId === x.trip.id && (e.ayudanteId == null || e.ayudanteId === ""),
          () => ({ category: "helper", tripId: x.trip.id, driverId: d.id, supplierId: null, date: x.trip.date, description: `Ayudantes (${x.split.viaDriver.count}) · ${x.trip.municipality}` }),
          e => (e.status === "paid" ? {} : { amount: x.split.viaDriver.amount, status: "paid", paidDate: date, paymentMethod: method, payrollKey: key }));
      });
      return next;
    });
  };

  const markUnpaid = ({ pay }) => {
    const ids = new Set([...pay.payExps, ...pay.helperExps, ...(pay.override ? [pay.override] : [])].filter(e => e.payrollKey === key || e.tripId).map(e => e.id));
    setExpenses(prev => prev.map(e => ids.has(e.id) && e.status === "paid" ? { ...e, status: "pending", paidDate: null } : e));
  };

  // ── Ayudantes directos: un gasto «helper» con su ayudanteId por viaje ────────
  const markHelperPaid = ({ row }) => {
    const date = today();
    const a = row.ayudante;
    setExpenses(prev => {
      let next = prev;
      row.trips.forEach(x => {
        if (!(x.amount > 0)) return;
        next = upsert(next, e => e.category === "helper" && e.tripId === x.trip.id && Number(e.ayudanteId) === a.id,
          () => ({ category: "helper", tripId: x.trip.id, ayudanteId: a.id, supplierId: null, date: x.trip.date, description: `Ayudante ${a.name} · ${x.trip.municipality}` }),
          e => (e.status === "paid" ? {} : { amount: x.amount, status: "paid", paidDate: date, paymentMethod: method, payrollKey: key }));
      });
      return next;
    });
  };
  const markHelperUnpaid = ({ pay }) => {
    const ids = new Set(pay.exps.filter(e => e.payrollKey === key || e.tripId).map(e => e.id));
    setExpenses(prev => prev.map(e => ids.has(e.id) && e.status === "paid" ? { ...e, status: "pending", paidDate: null } : e));
  };
  const printHelper = (row) => openPrintWindow(`Pago ${row.ayudante.name} ${period.label}`, helperPeriodReportHTML({ row, period, generatedBy: user?.name }));

  const lineOverride = (row, l, amount, note) => setExpenses(prev => upsert(prev, e => e.category === "driverPay" && e.tripId === l.trip.id,
    () => ({ category: "driverPay", tripId: l.trip.id, driverId: row.driver.id, supplierId: null, date: l.trip.date, status: "pending", paymentMethod: "transfer", description: `Pago chofer ${row.driver.name} · ${l.trip.municipality}` }),
    e => ({ amount: Number(amount) || 0, calcAmount: e.calcAmount ?? l.calc.driverNet, overrideNote: note || undefined, driverId: row.driver.id })));

  const totalOverride = (row, pay, amount, note) => setExpenses(prev => upsert(prev, e => e.category === "nominaTotalOverride" && e.driverId === row.driver.id && e.payrollKey === key,
    () => ({ category: "nominaTotalOverride", driverId: row.driver.id, tripId: null, supplierId: null, date: period.dateFrom, status: "pending", paymentMethod: "transfer", description: note || "Override total nómina" }),
    () => ({ amount: Number(amount) || 0, overrideNote: note || undefined, calcAmount: pay.driverTotal, payrollKey: key })));
  const clearTotalOverride = (row) => setExpenses(prev => prev.filter(e => !(e.category === "nominaTotalOverride" && e.driverId === row.driver.id && e.payrollKey === key)));

  // ── Reportes ──────────────────────────────────────────────────────────────
  const printDriver = (row) => openPrintWindow(`Viajes ${row.driver.name} ${period.label}`, driverPeriodReportHTML({ row, period, generatedBy: user?.name }));
  const printDriverPayroll = (row, pay) => openPrintWindow(`Nómina ${row.driver.name} ${period.label}`, driverPayrollHTML({ row, pay, period, generatedBy: user?.name }));
  const printPayroll = () => openPrintWindow(`Nómina ${period.label}`, payrollReportHTML({ payroll, helperPayroll, generatedBy: user?.name }));
  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const { resumen, detalle, ayudantes: ayud, tripulacion } = payrollSheets(payroll, helperPayroll);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalle), "Detalle viajes");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tripulacion), "Tripulación");
    if (ayud) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ayud), "Ayudantes directos");
    XLSX.writeFile(wb, `nomina-${period.dateFrom}-a-${period.dateTo}.xlsx`);
  };

  const navBtn = { background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, cursor: "pointer", padding: "6px 10px", display: "flex", alignItems: "center" };

  return <div>
    <PageHeader title="Nómina" action={<div style={{ display: "flex", gap: 8 }}>
      <Btn variant="ghost" onClick={printPayroll}><Printer size={14} /> PDF del período</Btn>
      <Btn variant="ghost" onClick={exportXlsx}><FileSpreadsheet size={14} /> Excel contabilidad</Btn>
    </div>} />

    {/* ── Período ── */}
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setPIdx(i => Math.min(periods.length - 1, i + 1))} style={navBtn}><ChevronLeft size={14} /></button>
          <select value={pIdx} onChange={e => setPIdx(Number(e.target.value))} style={{ ...inp, fontSize: 14, fontWeight: 700, padding: "6px 10px" }}>
            {periods.map((p, i) => <option key={`${p.mStr}-${p.half}`} value={i}>{p.label}{i === 0 ? " (en curso)" : ""}</option>)}
          </select>
          <button onClick={() => setPIdx(i => Math.max(0, i - 1))} disabled={pIdx === 0} style={{ ...navBtn, opacity: pIdx === 0 ? 0.4 : 1 }}><ChevronRight size={14} /></button>
          <span style={{ fontSize: 11, color: colors.textMuted }}>{period.dateFrom} → {period.dateTo}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ color: colors.textMuted }}>Pagar por</span>
          <select value={method} onChange={e => setMethod(e.target.value)} style={inp}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="check">Cheque</option></select>
        </div>
      </div>
    </Card>

    {/* ── Profit First: la nómina sale de OpEx ── */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
      <Card><div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 700 }}>OPEX DISPONIBLE</div><div style={{ fontSize: 20, fontWeight: 800, color: pf.opexAvailable >= 0 ? colors.cyan : colors.red }}>{fmt(pf.opexAvailable)}</div><div style={{ fontSize: 10, color: colors.textMuted }}>saldo de la cuenta OpEx</div></Card>
      <Card><div style={{ fontSize: 10, color: colors.orange, fontWeight: 700 }}>NÓMINA PENDIENTE · ESTE CORTE</div><div style={{ fontSize: 20, fontWeight: 800, color: colors.orange }}>{fmt(pendingTotal)}</div><div style={{ fontSize: 10, color: colors.textMuted }}>choferes + ayudantes</div></Card>
      <Card><div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 700 }}>OPEX DESPUÉS DE PAGAR</div><div style={{ fontSize: 20, fontWeight: 800, color: afterPay >= 0 ? colors.green : colors.red }}>{fmt(afterPay)}</div><div style={{ fontSize: 10, color: colors.textMuted }}>{pf.opexCommitted > 0 ? `otros compromisos: ${fmt(pf.opexCommitted - rows.filter(r => !r.pay.paid).reduce((s, r) => s + r.pay.payExps.filter(e => e.status !== "paid").reduce((a, e) => a + e.amount, 0), 0))}` : "sin otros compromisos"}</div></Card>
      <Card><div style={{ fontSize: 10, color: PURPLE, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><PiggyBank size={11} /> RESERVA (TAX · PROFIT · OWNER'S COMP)</div><div style={{ fontSize: 20, fontWeight: 800, color: PURPLE }}>{fmt(pf.reserve)}</div><div style={{ fontSize: 10, color: colors.textMuted }}>no se toca para nómina</div></Card>
    </div>
    {afterPay < 0 && pendingTotal > 0 && <div style={{ background: colors.red + "15", border: `1px solid ${colors.red}40`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 10, alignItems: "center", fontSize: 12 }}>
      <AlertTriangle size={16} color={colors.red} /><div><b style={{ color: colors.red }}>OpEx no alcanza para esta nómina.</b> Faltan {fmt(-afterPay)}. Profit First: no se toca la Reserva; primero cobra lo pendiente en CxC o reduce gastos de operación.</div>
    </div>}

    {/* ── Resumen del período ── */}
    <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12, fontSize: 12, color: colors.textMuted, flexWrap: "wrap" }}>
      <span><Clock size={12} style={{ verticalAlign: "middle" }} /> {payroll.totals.trips} viajes recibidos en el corte</span>
      <span>Bruto choferes {fmt(payroll.totals.gross)}</span>
      <span>Ayudantes {helperRows.length ? "por el chofer " : ""}{fmt(payroll.totals.helpers)}</span>
      {helperRows.length > 0 && <span>Ayudantes directos {fmt(helperPayroll.totals.net)}</span>}
      {paidTotal > 0 && <span style={{ color: colors.green }}>✓ Ya pagado {fmt(paidTotal)}</span>}
      {payroll.drivers.reduce((s, r) => s + r.pendingCount, 0) > 0 && <span style={{ color: colors.orange }}>{payroll.drivers.reduce((s, r) => s + r.pendingCount, 0)} viaje(s) con documentos pendientes (no se pagan hasta recibirlos)</span>}
    </div>

    {rows.length === 0 && helperRows.length === 0 && <Card><div style={{ textAlign: "center", padding: 40, color: colors.textMuted, fontSize: 13 }}>No hay viajes recibidos ni salarios fijos en este corte.</div></Card>}
    {rows.map(({ row, pay }) => <DriverCard key={row.driver.id} row={row} pay={pay} period={period} isMobile={isMobile}
      onMarkPaid={() => markPaid({ row, pay })} onMarkUnpaid={() => markUnpaid({ pay })}
      onLineOverride={(l, a, n) => lineOverride(row, l, a, n)} onTotalOverride={(a, n) => totalOverride(row, pay, a, n)} onClearTotalOverride={() => clearTotalOverride(row)}
      onPrint={() => printDriver(row)} onPrintPayroll={() => printDriverPayroll(row, pay)} />)}
    {helperRows.length > 0 && <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 8px" }}><HardHat size={15} color={colors.orange} /><b style={{ fontSize: 14 }}>Ayudantes (pago directo)</b><span style={{ fontSize: 11, color: colors.textMuted }}>· se les paga a ellos, no al chofer · misma regla: viaje con documentos recibidos en el corte</span></div>
      {helperRows.map(({ row, pay }) => <HelperCard key={row.ayudante.id} row={row} pay={pay} period={period}
        onMarkPaid={() => markHelperPaid({ row })} onMarkUnpaid={() => markHelperUnpaid({ pay })} onPrint={() => printHelper(row)} />)}
    </>}
  </div>;
}

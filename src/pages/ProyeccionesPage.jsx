import { Fragment, useMemo, useState } from "react";
import { TrendingUp, Wallet, Truck, Scale, FlaskConical, AlertTriangle, Info } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt as fmtRaw, today } from "../utils/helpers.js";
const fmt = (n) => fmtRaw(Math.round(Number(n) || 0));
import { Card, StatCard, PageHeader, Th, Td, Inp, Sel } from "../components/ui/index.jsx";
import { projections } from "../utils/projections.js";

const PURPLE = "#9b7fe8";
const dm = (d) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "";
const n1 = (n) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });
const signColor = (n) => n > 0 ? colors.green : n < 0 ? colors.red : colors.textMuted;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/**
 * Proyecciones (solo admin): flujo de caja, ingresos al ritmo actual, camiones, punto de equilibrio y escenarios.
 * Todo sale de los datos de la app y se afina solo a medida que entran viajes, facturas, cobros y gastos.
 */
export default function ProyeccionesPage({ trips = [], expenses = [], invoices = [], cobros = [], clients = [], trucks = [], drivers = [], partners = [], brokers = [], suppliers = [], fixedTemplates = [], settlementStatus = {}, bankAccount = null, bankTransfers = [], bankReconciliation = {}, pfSettings = null, distances = [], gpsKm = [], isMobile }) {
  const todayStr = today();
  const [tab, setTab] = useState("flujo");
  const [weeks, setWeeks] = useState(() => lsGet("bl_proj_weeks", 8));
  const [mode, setMode] = useState(() => lsGet("bl_proj_mode", "committed"));
  const [extraFixed, setExtraFixed] = useState(() => lsGet("bl_proj_extra_fixed", 0));
  const [sc, setSc] = useState(() => lsGet("bl_proj_scenario", { tripsPerWeek: "", ratePct: 0, fuelPct: 0, reservePct: "", extraOn: false, extraSize: "T2", extraFixed: 0, extraTrips: 0 }));
  const [openWeek, setOpenWeek] = useState(null);
  const setW = (v) => { setWeeks(v); lsSet("bl_proj_weeks", v); };
  const setM = (v) => { setMode(v); lsSet("bl_proj_mode", v); };
  const setXF = (v) => { setExtraFixed(v); lsSet("bl_proj_extra_fixed", v); };
  const setS = (patch) => { const v = { ...sc, ...patch }; setSc(v); lsSet("bl_proj_scenario", v); };

  const scenarioInputs = useMemo(() => ({
    tripsPerWeek: sc.tripsPerWeek === "" || sc.tripsPerWeek == null ? undefined : Number(sc.tripsPerWeek),
    ratePct: Number(sc.ratePct) || 0, fuelPct: Number(sc.fuelPct) || 0,
    reservePct: sc.reservePct === "" || sc.reservePct == null ? undefined : Number(sc.reservePct),
    extraTruck: sc.extraOn ? { size: sc.extraSize, fixedMonthly: Number(sc.extraFixed) || 0, tripsPerWeek: Number(sc.extraTrips) || 0 } : null,
  }), [sc]);

  const p = useMemo(() => projections({ today: todayStr, weeks: Number(weeks) || 8, horizonWeeks: 8, mode, extraFixed: Number(extraFixed) || 0, scenarioInputs,
    trips, expenses, invoices, cobros, clients, trucks, drivers, partners, brokers, suppliers, fixedTemplates, settlementStatus, bankAccount, bankTransfers, bankReconciliation, pfSettings, distances, gpsKm }),
    [todayStr, weeks, mode, extraFixed, scenarioInputs, trips, expenses, invoices, cobros, clients, trucks, drivers, partners, brokers, suppliers, fixedTemplates, settlementStatus, bankAccount, bankTransfers, bankReconciliation, pfSettings, distances, gpsKm]);
  const { rate, income, flow, breakEven: be, scenario: scn } = p;

  const btn = (active) => ({ padding: "5px 12px", borderRadius: 14, border: `1px solid ${active ? colors.accent : colors.border}`, background: active ? colors.accent : "transparent", color: active ? "white" : colors.textMuted, cursor: "pointer", fontSize: 12 });
  const basis = `Basado en ${rate.weeks} semana${rate.weeks !== 1 ? "s" : ""} (${dm(rate.from)}–${dm(rate.to)}) · ${rate.total.trips} viajes`;
  const Note = ({ children, color = colors.textMuted, icon: Icon = Info }) => <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color, marginBottom: 10 }}><Icon size={14} style={{ flexShrink: 0, marginTop: 1 }} /><span>{children}</span></div>;

  return <div>
    <PageHeader title="Proyecciones" />
    <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>Hacia dónde va el negocio con lo que ya está en la app. Lo <b>comprometido</b> (facturas, viajes, nómina, socios) es lo que ya existe; lo <b>estimado</b> supone que sigues al ritmo de las últimas semanas. Cada dato nuevo que entra afina la proyección.</div>

    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: colors.textMuted }}>Ritmo de las últimas</span>
        {[4, 8, 12].map(w => <button key={w} onClick={() => setW(w)} style={btn(Number(weeks) === w)} data-proj-weeks={w}>{w} sem.</button>)}
        <span style={{ fontSize: 12, color: colors.textMuted, marginLeft: "auto" }} data-proj-basis>{basis}{!rate.enough ? " · pocos datos todavía: las estimaciones son orientativas" : ""}</span>
      </div>
    </Card>

    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
      {[["flujo", "Flujo de caja", Wallet], ["ingresos", "Ingresos", TrendingUp], ["camiones", "Camiones", Truck], ["equilibrio", "Punto de equilibrio", Scale], ["escenarios", "Escenarios", FlaskConical]].map(([k, l, I]) => <button key={k} onClick={() => setTab(k)} style={{ ...btn(tab === k), display: "flex", alignItems: "center", gap: 6 }} data-proj-tab={k}><I size={13} /> {l}</button>)}
    </div>

    {/* ── Flujo de caja ───────────────────────────────────────────────── */}
    {tab === "flujo" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
        <StatCard icon={Wallet} label="Caja hoy (Income + OpEx)" value={fmt(flow.start)} color={colors.accent} sub={`Reserva aparte: ${fmt(flow.reserveNow)}`} />
        <StatCard icon={TrendingUp} label="Punto más bajo" value={fmt(flow.minBalance)} color={flow.minBalance < 0 ? colors.red : colors.green} sub={flow.minWeek ? `semana del ${dm(flow.minWeek.from)}` : "no baja de hoy"} />
        <StatCard icon={Wallet} label="Caja en 8 semanas" value={fmt(flow.end)} color={signColor(flow.end)} sub={`entra ${fmt(flow.totals.in)} · sale ${fmt(flow.totals.out)}`} />
        <StatCard icon={AlertTriangle} label="Facturas vencidas" value={fmt(flow.overdue)} color={flow.overdue > 0 ? colors.orange : colors.textMuted} sub={flow.overdue > 0 ? "por cobrar ya" : "nada vencido"} />
      </div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <button onClick={() => setM("committed")} style={btn(mode === "committed")} data-proj-mode="committed">Solo lo comprometido</button>
          <button onClick={() => setM("runrate")} style={btn(mode === "runrate")} data-proj-mode="runrate">+ al ritmo actual</button>
          <span style={{ fontSize: 11, color: colors.textMuted }}>{mode === "runrate" ? `Añade ${n1(rate.perWeek.trips)} viajes/semana (${fmt(rate.perWeek.net)}) que se cobran a ~${Math.round(rate.collectDays)} días, con su nómina, combustible y socios.` : "Solo facturas, viajes ya hechos, nómina, socios, suplidores y fijos que ya existen en la app."}</span>
        </div>
        {flow.alerts.length > 0 && <Note color={colors.red} icon={AlertTriangle}>{flow.alerts[0]}{flow.alerts.length > 1 ? ` (y ${flow.alerts.length - 1} semana(s) más)` : ""}. Adelanta cobros, aplaza salidas o baja de ritmo esa semana.</Note>}
        <Note>Si en la lista sale nómina o una liquidación que ya pagaste, márcala como pagada en Nómina o Liquidaciones y desaparece de aquí.</Note>
        {/* barras */}
        {(() => { const max = Math.max(1, ...flow.weeks.map(w => Math.max(Math.abs(w.balance), w.inTotal, w.outTotal))); return <div style={{ display: "grid", gridTemplateColumns: `repeat(${flow.weeks.length}, 1fr)`, gap: 6, alignItems: "end", height: 120, marginBottom: 6 }} data-proj-chart>
          {flow.weeks.map(w => <div key={w.from} title={`Semana del ${dm(w.from)}: entra ${fmt(w.inTotal)}, sale ${fmt(w.outTotal)}, caja ${fmt(w.balance)}`} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", gap: 2 }}>
            <div style={{ fontSize: 10, textAlign: "center", color: signColor(w.balance), fontWeight: 700 }}>{Math.round(w.balance / 1000)}k</div>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 90 }}>
              <div style={{ flex: 1, background: colors.green, height: `${Math.max(2, w.inTotal / max * 90)}px`, borderRadius: 3 }} />
              <div style={{ flex: 1, background: colors.red, height: `${Math.max(2, w.outTotal / max * 90)}px`, borderRadius: 3 }} />
            </div>
          </div>)}
        </div>; })()}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${flow.weeks.length}, 1fr)`, gap: 6, fontSize: 10, color: colors.textMuted, textAlign: "center", marginBottom: 12 }}>{flow.weeks.map(w => <div key={w.from}>{dm(w.from)}</div>)}</div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }} data-proj-flow>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Semana</Th><Th align="right">Facturas</Th><Th align="right">Sin facturar</Th>{mode === "runrate" && <Th align="right">Estimado</Th>}<Th align="right">Nómina</Th><Th align="right">Socios</Th><Th align="right">Suplidores</Th><Th align="right">Fijos</Th><Th align="right">Reserva</Th><Th align="right">Otros</Th>{mode === "runrate" && <Th align="right">Est. salidas</Th>}<Th align="right">Neto</Th><Th align="right">Caja</Th></tr></thead>
          <tbody>{flow.weeks.map(w => <Fragment key={w.from}>
            <tr onClick={() => setOpenWeek(openWeek === w.from ? null : w.from)} style={{ borderBottom: `1px solid ${colors.border}11`, cursor: "pointer", background: w.balance < 0 ? colors.red + "10" : "transparent" }}>
              <Td bold>{dm(w.from)}–{dm(w.to)}</Td><Td align="right" color={colors.green}>{w.in.invoices ? fmt(w.in.invoices) : "—"}</Td><Td align="right" color={colors.green}>{w.in.unbilled ? fmt(w.in.unbilled) : "—"}</Td>{mode === "runrate" && <Td align="right" color={colors.green}>{w.in.runRate ? fmt(w.in.runRate) : "—"}</Td>}
              <Td align="right">{w.out.payroll ? fmt(w.out.payroll) : "—"}</Td><Td align="right">{w.out.partners ? fmt(w.out.partners) : "—"}</Td><Td align="right">{w.out.suppliers ? fmt(w.out.suppliers) : "—"}</Td><Td align="right">{w.out.fixed ? fmt(w.out.fixed) : "—"}</Td><Td align="right">{w.out.reserve ? fmt(w.out.reserve) : "—"}</Td><Td align="right">{w.out.other ? fmt(w.out.other) : "—"}</Td>{mode === "runrate" && <Td align="right">{w.out.runRate ? fmt(w.out.runRate) : "—"}</Td>}
              <Td align="right" bold color={signColor(w.net)}>{fmt(w.net)}</Td><Td align="right" bold color={signColor(w.balance)}>{fmt(w.balance)}</Td>
            </tr>
            {openWeek === w.from && <tr><Td colSpan={14}><div style={{ fontSize: 11, color: colors.textMuted, padding: "4px 0 6px 12px" }}>{w.items.length === 0 ? "Sin movimientos previstos." : w.items.map((it, i) => <div key={i} style={{ display: "flex", gap: 8 }}><span style={{ width: 44 }}>{dm(it.date)}</span><span style={{ width: 14, color: it.side === "in" ? colors.green : colors.red }}>{it.side === "in" ? "+" : "−"}</span><span style={{ width: 90, textAlign: "right" }}>{fmt(it.amount)}</span><span style={{ color: it.late ? colors.orange : colors.textMuted }}>{it.label}</span></div>)}</div></Td></tr>}
          </Fragment>)}</tbody>
        </table></div>
      </Card>
    </>}

    {/* ── Ingresos ────────────────────────────────────────────────────── */}
    {tab === "ingresos" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
        <StatCard icon={TrendingUp} label="Flete por semana" value={fmt(rate.perWeek.net)} color={colors.accent} sub={`${n1(rate.perWeek.trips)} viajes/sem · ${fmt(rate.perTrip.net)} por viaje`} />
        <StatCard icon={TrendingUp} label="De la empresa / semana" value={fmt(rate.perWeek.company)} color={colors.green} sub={`socios ${fmt(rate.perWeek.partnerPart)}/sem`} />
        <StatCard icon={TrendingUp} label={`Cierre ${income.month}`} value={fmt(income.monthNet)} color={PURPLE} sub={`van ${fmt(income.mtdNet)} (${income.mtdTrips} viajes) · faltan ${income.daysLeft} días`} data-proj-month />
        <StatCard icon={TrendingUp} label={`Proyección ${income.nextMonth}`} value={fmt(income.nextNet)} color={PURPLE} sub={`≈ ${income.nextTrips} viajes`} />
        <StatCard icon={TrendingUp} label="Tendencia" value={rate.trend?.pct == null ? "—" : `${rate.trend.pct > 0 ? "+" : ""}${n1(rate.trend.pct)}%`} color={rate.trend?.pct > 0 ? colors.green : rate.trend?.pct < 0 ? colors.red : colors.textMuted} sub={rate.trend ? `${fmt(rate.trend.before)} → ${fmt(rate.trend.after)}/sem` : "faltan semanas"} />
        <StatCard icon={Wallet} label="Reserva por mes" value={fmt(income.reservePerMonth)} color={colors.yellow} sub={`en 6 meses ≈ ${fmt(flow.reserveNow + income.reservePerMonth * 6)}`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card><div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Por semana</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Semana</Th><Th align="right">Viajes</Th><Th align="right">Flete</Th><Th align="right">Empresa</Th></tr></thead>
            <tbody>{rate.byWeek.map(w => <tr key={w.week} style={{ borderBottom: `1px solid ${colors.border}11` }}><Td>{dm(w.week)}</Td><Td align="right">{w.trips}</Td><Td align="right">{fmt(w.net)}</Td><Td align="right">{fmt(w.company)}</Td></tr>)}</tbody></table></Card>
        <Card><div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Por cliente</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Cliente</Th><Th align="right">Viajes/sem</Th><Th align="right">Flete/sem</Th><Th align="right">% del total</Th></tr></thead>
            <tbody>{rate.byClient.map(c => <tr key={c.key} style={{ borderBottom: `1px solid ${colors.border}11` }}><Td bold>{c.label}</Td><Td align="right">{n1(c.tripsPerWeek)}</Td><Td align="right">{fmt(c.netPerWeek)}</Td><Td align="right">{rate.total.net ? n1(c.net / rate.total.net * 100) : 0}%</Td></tr>)}</tbody></table>
          {rate.byClient[0] && rate.total.net > 0 && rate.byClient[0].net / rate.total.net > 0.6 && <Note color={colors.orange} icon={AlertTriangle}>{rate.byClient[0].label} es más del 60 % del flete: si baja, baja todo.</Note>}
        </Card>
      </div>
      <Card><div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Por camión</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Camión</Th><Th align="right">Viajes/sem</Th><Th align="right">Flete/sem</Th><Th align="right">Empresa/sem</Th></tr></thead>
          <tbody>{rate.byTruck.map(c => <tr key={c.key} style={{ borderBottom: `1px solid ${colors.border}11` }}><Td bold>{c.label}</Td><Td align="right">{n1(c.tripsPerWeek)}</Td><Td align="right">{fmt(c.netPerWeek)}</Td><Td align="right">{fmt(c.companyPerWeek)}</Td></tr>)}</tbody></table></Card>
    </>}

    {/* ── Camiones ────────────────────────────────────────────────────── */}
    {tab === "camiones" && <Card>
      <Note>Margen = ingreso de la empresa − combustible, nómina, mantenimiento y fijos del camión en la ventana (motor de Costo por km), proyectado a 30 días. «Viajes para fijos» usa las plantillas de gastos fijos del camión.</Note>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }} data-proj-trucks>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Camión</Th><Th align="right">Viajes/sem</Th><Th align="right">Ingreso empresa</Th><Th align="right">Variable</Th><Th align="right">Fijos</Th><Th align="right">Margen (ventana)</Th><Th align="right">Margen/viaje</Th><Th align="right">Margen/mes</Th><Th align="right">Viajes para fijos</Th></tr></thead>
        <tbody>{p.trucks.rows.map(t => <tr key={t.truckId} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td bold>{t.plate} <span style={{ color: colors.textMuted, fontWeight: 400 }}>{t.size}{t.partner ? " · socio" : ""}</span></Td><Td align="right">{n1(t.tripsPerWeek)}</Td><Td align="right">{fmt(t.companyRevenue)}</Td><Td align="right">{fmt(t.variable)}</Td><Td align="right">{fmt(t.fixed)}</Td>
          <Td align="right" bold color={signColor(t.margin)}>{fmt(t.margin)}</Td><Td align="right" color={signColor(t.marginPerTrip)}>{fmt(t.marginPerTrip)}</Td><Td align="right" bold color={signColor(t.monthMargin)}>{fmt(t.monthMargin)}</Td><Td align="right">{t.fixedMonth > 0 ? (t.breakEvenTrips ? `${t.breakEvenTrips}/mes` : "no cubre") : "sin fijos"}</Td>
        </tr>)}{p.trucks.rows.length === 0 && <tr><Td colSpan={9}><span style={{ color: colors.textMuted }}>Sin viajes en la ventana.</span></Td></tr>}</tbody>
      </table></div>
    </Card>}

    {/* ── Punto de equilibrio ─────────────────────────────────────────── */}
    {tab === "equilibrio" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
        <StatCard icon={Scale} label="Fijos al mes" value={fmt(be.fixed)} color={colors.orange} sub={`${fixedTemplates.length} plantilla(s) + ${fmt(extraFixed)} extra`} />
        <StatCard icon={Scale} label="Contribución por viaje" value={fmt(be.contribPerTrip)} color={colors.accent} sub="empresa − nómina − gastos de ruta" />
        <StatCard icon={Scale} label="Viajes para empatar" value={be.tripsPerMonth ? `${be.tripsPerMonth}/mes` : "—"} color={PURPLE} sub={be.tripsPerMonth ? `≈ ${n1(be.tripsPerWeek)} por semana` : be.fixed ? "la contribución no cubre" : "sin fijos registrados"} data-proj-breakeven />
        <StatCard icon={TrendingUp} label="Ritmo actual" value={`${n1(be.currentPerMonth)}/mes`} color={be.cushion >= 0 ? colors.green : colors.red} sub={be.fixed ? `${be.cushion >= 0 ? "+" : ""}${n1(be.cushion)} viajes de colchón` : "—"} />
        <StatCard icon={Wallet} label="Resultado mensual" value={fmt(be.monthlyResult)} color={signColor(be.monthlyResult)} sub={`contribución ${fmt(be.monthlyContribution)} − fijos`} />
      </div>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "260px 1fr", gap: 14, alignItems: "end", marginBottom: 12 }}>
          <Inp label="Otros fijos mensuales no registrados (RD$)" type="number" value={extraFixed} onChange={e => setXF(Number(e.target.value) || 0)} data-proj-extra-fixed />
          <div style={{ fontSize: 11, color: colors.textMuted }}>Seguros, oficina, préstamos, tu sueldo… lo que pagas cada mes y no está como plantilla de gasto fijo. Lo ideal es registrarlo en Gastos → Fijos para que entre solo.</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Tamaño</Th><Th align="right">Viajes/sem (ritmo)</Th><Th align="right">Contribución/viaje</Th><Th align="right">Viajes para empatar (si todos fueran así)</Th></tr></thead>
          <tbody>{be.bySize.map(s => <tr key={s.size} style={{ borderBottom: `1px solid ${colors.border}11` }}><Td bold>{s.size}</Td><Td align="right">{n1(s.tripsPerWeek)}</Td><Td align="right" color={signColor(s.contribPerTrip)}>{fmt(s.contribPerTrip)}</Td><Td align="right">{s.tripsPerMonth ? `${s.tripsPerMonth}/mes` : "—"}</Td></tr>)}</tbody></table>
      </Card>
    </>}

    {/* ── Escenarios ──────────────────────────────────────────────────── */}
    {tab === "escenarios" && <>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, alignItems: "end" }}>
          <Inp label={`Viajes por semana (ahora ${n1(rate.perWeek.trips)})`} type="number" value={sc.tripsPerWeek} placeholder={n1(rate.perWeek.trips)} onChange={e => setS({ tripsPerWeek: e.target.value })} data-sc-trips />
          <Inp label="Tarifa ±%" type="number" value={sc.ratePct} onChange={e => setS({ ratePct: e.target.value })} data-sc-rate />
          <Inp label="Combustible ±%" type="number" value={sc.fuelPct} onChange={e => setS({ fuelPct: e.target.value })} data-sc-fuel />
          <Inp label={`% Reserva (ahora ${scn.inputs.reservePct})`} type="number" value={sc.reservePct} placeholder={String(scn.inputs.reservePct)} onChange={e => setS({ reservePct: e.target.value })} />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", paddingBottom: 8 }}><input type="checkbox" checked={!!sc.extraOn} onChange={e => setS({ extraOn: e.target.checked })} data-sc-extra /> Agregar un camión</label>
          {sc.extraOn && <>
            <Sel label="Tamaño" value={sc.extraSize} onChange={e => setS({ extraSize: e.target.value })}><option value="T1">T1</option><option value="T2">T2</option></Sel>
            <Inp label="Fijo mensual (cuota, seguro…)" type="number" value={sc.extraFixed} onChange={e => setS({ extraFixed: e.target.value })} data-sc-extra-fixed />
            <Inp label="Viajes por semana" type="number" value={sc.extraTrips} onChange={e => setS({ extraTrips: e.target.value })} data-sc-extra-trips />
          </>}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : scn.extra ? "1fr 1fr 1fr" : "1fr", gap: 14 }}>
        {[["Operación actual", scn.base], ...(scn.extra ? [[`Camión nuevo ${scn.extra.size}`, scn.extra], ["Total", scn.total]] : [])].map(([title, r]) => <Card key={title}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{title} <span style={{ color: colors.textMuted, fontWeight: 400 }}>· {n1(r.trips)} viajes/mes</span></div>
          {[["Ingreso de la empresa", r.revenue, colors.green], ["Combustible y ruta", -r.opCost], ["Nómina", -r.payroll], ["Fijos", -r.fixed], ["Resultado", r.result, signColor(r.result), true], [`Reserva ${scn.inputs.reservePct}%`, -r.reserve, colors.yellow], ["Queda en OpEx", r.resultAfterReserve, signColor(r.resultAfterReserve), true]].map(([l, v, c, b]) => <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderTop: b ? `1px solid ${colors.border}` : "none", fontWeight: b ? 700 : 400 }}><span>{l}</span><span style={{ color: c || colors.text }} data-sc-val={l}>{fmt(v)}</span></div>)}
          {r.breakEvenTrips != null && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 6 }}>Cubre su fijo con {r.breakEvenTrips} viajes/mes.</div>}
        </Card>)}
      </div>
      <Note>Usa los promedios reales por viaje de la ventana (ingreso de la empresa, nómina, combustible y ruta). El combustible se toma como ~60 % del gasto de ruta.</Note>
    </>}
  </div>;
}

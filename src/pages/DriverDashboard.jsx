import { useState, Fragment } from "react";
import { Plus, X, Route, Banknote, CheckCircle2, Clock, FileText, ChevronDown } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, nxId, today } from "../utils/helpers.js";
import { Card, StatCard, PageHeader, Inp, Sel, Btn, Th, Td, DestinationSelect } from "../components/ui/index.jsx";

export default function DriverDashboard({ t, user, trips, trucks, expenses, clients, drivers, driverObj, setTrips, setExpenses, brokers }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const [rateMsg, setRateMsg] = useState("");

  const emptyForm = { date: today(), province: "", municipality: "", truckId: driverObj?.truckId || trucks[0]?.id || "", driverId: driverObj?.id || "", clientId: "", brokerId: "", cargo: "", weight: "", revenue: "", status: "pending", invoiceRef: "", docStatus: "pending", podDelivered: false, numHelpers: 0, helperPayEach: "", discounts: [] };

  const openNew = () => { setForm({ ...emptyForm, createdBy: user?.name || driverObj?.name || "" }); setShowForm(true); setRateMsg(""); };

  const handleClientChange = (cid) => {
    const cl = clients.find(c => c.id === Number(cid));
    const f = { ...form, clientId: Number(cid) || "" };
    if (cl) {
      if (cl.rules.defaultBrokerId) f.brokerId = cl.rules.defaultBrokerId;
      tryApplyRate(f, cl);
    }
    setForm(f);
  };

  const tryApplyRate = (f, cl) => {
    if (!cl) cl = clients.find(c => c.id === Number(f.clientId));
    if (cl && f.province && f.municipality) {
      const rate = cl.rates.find(r => r.province === f.province && r.municipality === f.municipality);
      if (rate) {
        const tk = trucks.find(t2 => t2.id === Number(f.truckId));
        const size = tk?.size || "T1";
        const price = size === "T2" ? (rate.priceT2 ?? rate.price ?? 0) : (rate.priceT1 ?? rate.price ?? 0);
        f.revenue = price; setRateMsg(`${t.rateApplied} (${size}): ${fmt(price)}`); return;
      }
    }
    setRateMsg("");
  };

  const handleDestChange = (field, val) => {
    const f = { ...form, [field]: val };
    if (field === "province") { f.municipality = ""; setRateMsg(""); }
    else tryApplyRate(f, null);
    setForm(f);
  };

  const saveTrip = () => {
    if (!form.province || !form.municipality) return;
    const cl = clients.find(c => c.id === Number(form.clientId));
    if (cl?.rules.requiresInvoiceRef && !form.invoiceRef) { alert(t.invoiceRefRequired); return; }
    const helpersPay = Number(form.helperPayEach) || 0;
    const helpersArr = Array.from({ length: Number(form.numHelpers) || 0 }, (_, i) => ({ name: `Ayudante ${i + 1}`, pay: helpersPay }));
    const data = { ...form, truckId: Number(form.truckId), driverId: driverObj?.id, clientId: Number(form.clientId) || null, brokerId: Number(form.brokerId) || null, weight: Number(form.weight) || 0, revenue: Number(form.revenue) || 0, helpers: helpersArr };
    const newId = nxId(trips);
    setTrips([...trips, { ...data, id: newId }]);
    const broker = data.brokerId ? brokers.find(b => b.id === data.brokerId) : null;
    if (broker && data.revenue > 0) {
      const fee = Math.round(data.revenue * broker.commissionPct / 100);
      setExpenses(prev => [...prev, { id: nxId(prev), tripId: newId, date: data.date, category: "broker_commission", amount: fee, paymentMethod: "transfer", description: `${t.brokerAutoDeducted}: ${broker.name} (${broker.commissionPct}%)`, supplierId: null }]);
    }
    setShowForm(false);
  };

  const allMyTrips = trips.filter(tr => tr.driverId === driverObj?.id);

  const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const genPeriods = () => {
    const pad = n => String(n).padStart(2, "0");
    const lastDayOf = (y, m) => new Date(y, m, 0).getDate();
    const now = new Date(); const day = now.getDate();
    let y = now.getFullYear(), m = now.getMonth() + 1, h;
    if (day >= 30) { if (m === 12) { y++; m = 1; } else { m++; } h = 1; }
    else { h = day >= 15 ? 2 : 1; }
    const allDates = allMyTrips.map(tr => tr.date).sort();
    const earliest = allDates[0] || `${y}-${pad(m)}-01`;
    const buildPd = (py, pm, ph) => {
      const mStr = `${py}-${pad(pm)}`;
      if (ph === 1) {
        const prevM = pm === 1 ? 12 : pm - 1, prevY = pm === 1 ? py - 1 : py;
        const startDay = Math.min(30, lastDayOf(prevY, prevM));
        return { year: py, month: pm, half: ph, mStr, dateFrom: `${prevY}-${pad(prevM)}-${pad(startDay)}`, dateTo: `${mStr}-14`, label: `${MONTHS_ES[prevM-1]} ${startDay} – ${MONTHS_ES[pm-1]} 14, ${py}` };
      }
      return { year: py, month: pm, half: ph, mStr, dateFrom: `${mStr}-15`, dateTo: `${mStr}-29`, label: `${MONTHS_ES[pm-1]} 15–29, ${py}` };
    };
    const periods = [];
    for (let i = 0; i < 60; i++) {
      const pd = buildPd(y, m, h); periods.push(pd);
      if (pd.dateTo < earliest) break;
      if (h === 2) { h = 1; } else { h = 2; if (m === 1) { m = 12; y--; } else { m--; } }
    }
    return periods;
  };

  const allPeriods = genPeriods();
  const activePeriods = allPeriods.filter(pd => allMyTrips.some(tr => tr.date >= pd.dateFrom && tr.date <= pd.dateTo));

  const pendingDocs = allMyTrips.filter(tr => tr.docStatus === "pending").length;
  const completed = allMyTrips.filter(tr => tr.status === "delivered").length;
  const selectedClient = clients.find(c => c.id === Number(form.clientId));

  const calcPay = (tr) => {
    if (driverObj?.salaryType === "perTrip") {
      const rate = (driverObj.rates || []).find(r => r.province === tr.province && r.municipality === tr.municipality);
      if (!rate) return 0;
      const tk = trucks.find(t2 => t2.id === tr.truckId);
      const size = tr.tarifaOverride || tk?.size || "T1";
      return size === "T2" ? (rate.priceT2 ?? rate.price ?? 0) : (rate.priceT1 ?? rate.price ?? 0);
    }
    if (driverObj?.salaryType === "porcentaje") return (tr.revenue || 0) * ((driverObj.percentageAmount || 0) / 100);
    return 0;
  };
  const totalBruto = driverObj?.salaryType === "fixed" ? (driverObj.fixedAmount || 0) : allMyTrips.reduce((s, tr) => s + calcPay(tr), 0);
  const totalHelpers = allMyTrips.reduce((s, tr) => s + (tr.helpers || []).reduce((h, x) => h + (x.pay || 0), 0), 0);
  const totalDescuentos = allMyTrips.reduce((s, tr) => s + (tr.discounts || []).reduce((d, x) => d + (x.amount || 0), 0), 0);
  const totalAdelantos = (expenses || []).filter(e => e.category === "adelanto_conductor" && (e.driverId === driverObj?.id || (e.tripId && allMyTrips.some(tr => tr.id === e.tripId)))).reduce((s, e) => s + (e.amount || 0), 0);
  const totalNeto = Math.max(0, totalBruto - totalHelpers - totalDescuentos - totalAdelantos);

  return <div>
    <PageHeader title={`${t.dashboard} — ${driverObj?.name || ""}`} action={<Btn onClick={openNew}><Plus size={14} /> {t.newTrip}</Btn>} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, margin: "16px 0" }}>
      <StatCard icon={Route} label={t.totalTrips} value={allMyTrips.length} color={colors.accent} />
      <StatCard icon={CheckCircle2} label={t.delivered} value={completed} color={colors.green} />
      <StatCard icon={Clock} label={t.pending} value={allMyTrips.filter(tr => tr.status === "pending" || tr.status === "in_transit").length} color={colors.yellow} />
      <StatCard icon={FileText} label={t.pendingDocs} value={pendingDocs} color={colors.orange} />
    </div>

    <Card style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}><Banknote size={16} color={colors.green} /> {t.payrollSummary}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
        <div><div style={{ fontSize: 11, color: colors.textMuted }}>{driverObj?.salaryType === "fixed" ? "Salario Fijo" : driverObj?.salaryType === "porcentaje" ? `Comisión (${driverObj.percentageAmount || 0}%)` : "Pago por Viaje"}</div><div style={{ fontSize: 20, fontWeight: 700, color: colors.green }}>{fmt(totalBruto)}</div></div>
        {totalHelpers > 0 && <div><div style={{ fontSize: 11, color: colors.textMuted }}>Ayudantes</div><div style={{ fontSize: 20, fontWeight: 700, color: colors.orange }}>− {fmt(totalHelpers)}</div></div>}
        {totalAdelantos > 0 && <div><div style={{ fontSize: 11, color: colors.textMuted }}>Adelantos</div><div style={{ fontSize: 20, fontWeight: 700, color: colors.red }}>− {fmt(totalAdelantos)}</div></div>}
        {totalDescuentos > 0 && <div><div style={{ fontSize: 11, color: colors.textMuted }}>Descuentos</div><div style={{ fontSize: 20, fontWeight: 700, color: colors.red }}>− {fmt(totalDescuentos)}</div></div>}
        <div><div style={{ fontSize: 11, color: colors.textMuted }}>{t.netPay}</div><div style={{ fontSize: 20, fontWeight: 700, color: colors.cyan }}>{fmt(totalNeto)}</div></div>
      </div>
    </Card>

    {showForm && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
      <div onClick={e => e.stopPropagation()} style={{ background: colors.card, borderRadius: 14, padding: 24, width: 560, maxHeight: "88vh", overflowY: "auto", border: `1px solid ${colors.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}><Route size={18} color={colors.accent} /> {t.newTrip}</h3>
          <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 10 }}>
          <Inp label={t.date} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Sel label={t.client} value={form.clientId} onChange={e => handleClientChange(e.target.value)}>
            <option value="">{t.selectClient}</option>
            {clients.filter(c => c.status === "active").map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </Sel>
        </div>
        <DestinationSelect t={t} province={form.province} municipality={form.municipality} onProvinceChange={v => handleDestChange("province", v)} onMunicipalityChange={v => handleDestChange("municipality", v)} />
        <div style={{ marginTop: 10 }}>
          <Sel label={t.truck} value={form.truckId} onChange={e => setForm({ ...form, truckId: e.target.value })}>
            {trucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}
          </Sel>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
          <Sel label={t.status} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="pending">{t.pending}</option>
            <option value="in_transit">{t.inTransit}</option>
            <option value="delivered">{t.delivered}</option>
          </Sel>
          {selectedClient?.rules.requiresInvoiceRef && <Inp label={t.invoiceRef + " *"} value={form.invoiceRef} onChange={e => setForm({ ...form, invoiceRef: e.target.value })} style={{ borderColor: !form.invoiceRef ? colors.red : colors.border }} />}
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}22` }}>
          <Sel label={t.numHelpers} value={form.numHelpers ?? 0} onChange={e => setForm({ ...form, numHelpers: Number(e.target.value) })}>
            {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n === 0 ? "0 — " + t.none : `${n} ayudante${n > 1 ? "s" : ""}`}</option>)}
          </Sel>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}33` }}>
          <Btn onClick={saveTrip} style={{ flex: 1, justifyContent: "center" }}>{t.save}</Btn>
          <Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn>
        </div>
      </div>
    </div>}

    {activePeriods.length === 0
      ? <Card><div style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", padding: 32 }}>{t.noTrips}</div></Card>
      : activePeriods.map((pd, idx) => (
        <DriverCorteCard key={`${pd.mStr}-${pd.half}`} pd={pd} driverObj={driverObj} myTrips={allMyTrips} expenses={expenses} trucks={trucks} clients={clients} t={t} defaultOpen={idx === 0} setTrips={setTrips} allTrips={trips} />
      ))
    }
  </div>;
}

function DriverCorteCard({ pd, driverObj, myTrips, expenses, trucks, clients, t, defaultOpen, setTrips, allTrips }) {
  const [open, setOpen] = useState(defaultOpen);
  const periodTrips = myTrips.filter(tr => tr.date >= pd.dateFrom && tr.date <= pd.dateTo);

  const calcDriverPay = (tr) => {
    if (driverObj?.salaryType === "perTrip") {
      const rate = (driverObj.rates || []).find(r => r.province === tr.province && r.municipality === tr.municipality);
      if (!rate) return 0;
      const tk = trucks.find(t2 => t2.id === tr.truckId);
      const size = tr.tarifaOverride || tk?.size || "T1";
      return size === "T2" ? (rate.priceT2 ?? rate.price ?? 0) : (rate.priceT1 ?? rate.price ?? 0);
    }
    if (driverObj?.salaryType === "porcentaje") return (tr.revenue || 0) * ((driverObj.percentageAmount || 0) / 100);
    return 0;
  };

  const brutoPay = driverObj?.salaryType === "fixed"
    ? (driverObj.fixedAmount || 0)
    : periodTrips.reduce((s, tr) => s + calcDriverPay(tr), 0);

  const helperPay = periodTrips.reduce((s, tr) => s + (tr.helpers || []).reduce((h, x) => h + (x.pay || 0), 0), 0);
  const discountsTotal = periodTrips.reduce((s, tr) => s + (tr.discounts || []).reduce((d, x) => d + (x.amount || 0), 0), 0);

  const adelantoExps = (expenses || []).filter(e =>
    e.category === "adelanto_conductor" &&
    (e.driverId === driverObj?.id || (e.tripId && periodTrips.some(tr => tr.id === e.tripId))) &&
    e.date >= pd.dateFrom && e.date <= pd.dateTo
  );
  const adelantos = adelantoExps.reduce((s, e) => s + (e.amount || 0), 0);

  const isPaid = (expenses || []).some(e =>
    e.category === "driverPay" &&
    e.date >= pd.dateFrom && e.date <= pd.dateTo &&
    periodTrips.some(tr => tr.id === e.tripId)
  );

  const netoAPagar = Math.max(0, brutoPay - helperPay - adelantos - discountsTotal);
  const statusColor = isPaid ? colors.green : colors.yellow;
  const statusLabel = isPaid ? "Pagado" : "Pendiente";

  return (
    <Card style={{ marginBottom: 12 }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: colors.textMuted }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{pd.label}</div>
            <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{periodTrips.length} viaje{periodTrips.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: colors.cyan }}>{fmt(netoAPagar)}</div>
            <div style={{ fontSize: 10, color: colors.textMuted }}>Neto a recibir</div>
          </div>
          <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: statusColor + "22", color: statusColor }}>{statusLabel}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}33` }}>
          {periodTrips.length > 0 && <>
            <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Viajes</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
              <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <Th>{t.date}</Th><Th>{t.destination}</Th><Th>{t.client}</Th><Th align="right">Mi Pago</Th><Th align="right">Ayudantes</Th><Th align="right">Descuentos</Th><Th align="center">{t.status}</Th>
              </tr></thead>
              <tbody>
                {periodTrips.slice().sort((a, b) => a.date.localeCompare(b.date)).map(tr => {
                  const cl = clients.find(c => c.id === tr.clientId);
                  const pay = calcDriverPay(tr);
                  const tripHelpers = (tr.helpers || []).reduce((s, x) => s + (x.pay || 0), 0);
                  const tripDiscounts = (tr.discounts || []).reduce((s, x) => s + (x.amount || 0), 0);
                  const stColor = tr.status === "delivered" ? colors.green : tr.status === "in_transit" ? colors.yellow : colors.accent;
                  const nextStatus = { pending: "in_transit", in_transit: "delivered", delivered: "pending" };
                  return <Fragment key={tr.id}>
                    <tr style={{ borderBottom: `1px solid ${colors.border}11` }}>
                      <Td>{tr.date}</Td>
                      <Td>{tr.municipality}, {tr.province}</Td>
                      <Td>{cl?.companyName || "—"}</Td>
                      <Td align="right" bold color={colors.green}>
                        {driverObj?.salaryType === "fixed" ? <span style={{ fontSize: 10, color: colors.textMuted }}>Fijo</span> : pay > 0 ? fmt(pay) : <span style={{ fontSize: 10, color: colors.orange }}>—</span>}
                      </Td>
                      <Td align="right" color={tripHelpers > 0 ? colors.orange : colors.textMuted}>{tripHelpers > 0 ? `− ${fmt(tripHelpers)}` : "—"}</Td>
                      <Td align="right" color={tripDiscounts > 0 ? colors.red : colors.textMuted}>{tripDiscounts > 0 ? `− ${fmt(tripDiscounts)}` : "—"}</Td>
                      <Td align="center">
                        <button onClick={() => setTrips(allTrips.map(x => x.id === tr.id ? { ...x, status: nextStatus[x.status] || "pending" } : x))}
                          style={{ padding: "3px 8px", borderRadius: 10, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", background: stColor + "18", color: stColor }}>
                          {tr.status === "delivered" ? t.delivered : tr.status === "in_transit" ? t.inTransit : t.pending}
                        </button>
                      </Td>
                    </tr>
                    {(tr.discounts || []).filter(d => d.amount > 0).map((d, i) => (
                      <tr key={`disc-${tr.id}-${i}`} style={{ background: colors.red + "08" }}>
                        <Td></Td><Td colSpan={4} style={{ fontSize: 11, color: colors.red, paddingLeft: 20 }}>↳ Descuento: {d.desc || "—"}</Td>
                        <Td align="right" style={{ fontSize: 11, color: colors.red }}>− {fmt(d.amount)}</Td><Td></Td>
                      </tr>
                    ))}
                  </Fragment>;
                })}
              </tbody>
            </table>
          </>}

          {adelantoExps.length > 0 && <>
            <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Adelantos Recibidos</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 14 }}>
              <tbody>
                {adelantoExps.map(e => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                    <Td>{e.date}</Td>
                    <Td>{e.description || "Adelanto"}</Td>
                    <Td align="right" bold color={colors.red}>− {fmt(e.amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>}

          <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${colors.border}33`, paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: colors.textMuted }}>{driverObj?.salaryType === "fixed" ? "Salario Fijo" : driverObj?.salaryType === "porcentaje" ? `Comisión (${driverObj.percentageAmount || 0}%)` : "Pago por Viajes"}</span><span style={{ color: colors.green, fontWeight: 600 }}>{fmt(brutoPay)}</span></div>
            {helperPay > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: colors.textMuted }}>Ayudantes</span><span style={{ color: colors.orange, fontWeight: 600 }}>− {fmt(helperPay)}</span></div>}
            {adelantos > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: colors.textMuted }}>Adelantos</span><span style={{ color: colors.red, fontWeight: 600 }}>− {fmt(adelantos)}</span></div>}
            {discountsTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: colors.textMuted }}>Descuentos</span><span style={{ color: colors.red, fontWeight: 600 }}>− {fmt(discountsTotal)}</span></div>}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, borderTop: `1px solid ${colors.border}44`, paddingTop: 8, marginTop: 2 }}>
              <span>Neto a Recibir</span><span style={{ color: colors.cyan }}>{fmt(netoAPagar)}</span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

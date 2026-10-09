import { useState, useMemo } from "react";
import { Plus, X, Search, Route, Receipt, Printer, CheckCircle2, Pencil, Trash2, Calendar, FileCheck, FileText, Handshake, Hash, Zap, RotateCw } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, nxId, today } from "../utils/helpers.js";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "../constants/categories.js";
import { calcDriverPay, describeDriverPay, normalizeDriver, tripSize, DEFAULT_HELPERS } from "../utils/driverPay.js";
import { TRIP_DOCS, docsComplete } from "../utils/payroll.js";
import { checkTripRef, linkJoint, sameRefTrips } from "../utils/tripRef.js";
import { generateConduce } from "../utils/generateConduce.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td, StatusBadge, DestinationSelect } from "../components/ui/index.jsx";

export default function TripsPage({ t, user, trips, setTrips, trucks, drivers, clients, expenses, setExpenses, brokers, invoices, cobros = [], isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [expModal, setExpModal] = useState(null);
  const [expForm, setExpForm] = useState({ date: today(), category: "fuel", amount: "", paymentMethod: "cash", description: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  const [filterDriver, setFilterDriver] = useState("all");
  const [filterTruck, setFilterTruck] = useState("all");
  const [rateMsg, setRateMsg] = useState("");
  const [formError, setFormError] = useState("");

  const invoicedTripMap = useMemo(() => {
    const m = new Map();
    (invoices || []).forEach(inv => {
      if (inv.status === "cancelled") return;
      (inv.tripIds || []).forEach(tid => m.set(Number(tid), inv));
    });
    return m;
  }, [invoices]);

  const emptyForm = { date: today(), province: "", municipality: "", truckId: "", driverId: "", clientId: "", brokerId: "", cargo: "", weight: "", revenue: "", status: "pending", invoiceRef: "", docStatus: "pending", podDelivered: false, numHelpers: null, helperPayEach: "", helperNames: [], discounts: [], tarifaOverride: null, joint: false, jointWith: null };

  // Viajes ya cobrados (en algún cobro registrado): no se pueden borrar ni cambiar de monto
  const collectedTripIds = useMemo(() => new Set((cobros || []).flatMap(c => (c.collectedTripIds || []).map(Number))), [cobros]);
  const isLocked = (id) => invoicedTripMap.has(Number(id)) || collectedTripIds.has(Number(id));

  // Pago del chofer calculado en vivo con la función única (misma que usa Nómina y Oficina)
  const payPreview = useMemo(() => {
    const driver = drivers.find(d => d.id === Number(form.driverId));
    if (!driver) return null;
    const truck = trucks.find(tk => tk.id === Number(form.truckId));
    const trip = { ...form, revenue: Number(form.revenue) || 0, numHelpers: form.numHelpers === null || form.numHelpers === "" ? null : Number(form.numHelpers), helperPayEach: form.helperPayEach === "" ? null : Number(form.helperPayEach) };
    return calcDriverPay({ driver, trip, truck, clientId: Number(form.clientId) || null });
  }, [form, drivers, trucks]);

  const openNew = () => { setForm({ ...emptyForm, createdBy: user.name }); setEditId(null); setShowForm(true); setRateMsg(""); setFormError(""); };
  const openEdit = (tr) => { setForm({ ...tr }); setEditId(tr.id); setShowForm(true); setRateMsg(""); setFormError(""); };

  const handleClientChange = (cid) => {
    const cl = clients.find(c => c.id === Number(cid));
    const f = { ...form, clientId: Number(cid) || "" };
    if (cl) {
      if (cl.rules?.requiresDocuments) f.docStatus = "pending";
      if (cl.rules?.defaultBrokerId) f.brokerId = cl.rules.defaultBrokerId;
      tryApplyRate(f, cl);
    }
    setForm(f);
  };

  const tryApplyRate = (f, cl) => {
    if (!cl) cl = clients.find(c => c.id === Number(f.clientId));
    if (cl && f.province && f.municipality) {
      if (f.tarifaOverride === "custom") { setRateMsg("✏️ Monto personalizado"); return; }
      const rate = (cl.rates || []).find(r => r.province === f.province && r.municipality === f.municipality);
      if (rate) {
        const size = tripSize(f, trucks.find(t2 => t2.id === Number(f.truckId)));
        const price = size === "T2" ? (rate.priceT2 ?? rate.price ?? 0) : (rate.priceT1 ?? rate.price ?? 0);
        const label = f.tarifaOverride ? `⚡ Override ${size}` : size;
        f.revenue = price;
        setRateMsg(price > 0 ? `${t.rateApplied} (${label}): ${fmt(price)}` : `⚠️ ${cl.companyName} no tiene tarifa ${size} para ${f.municipality}; escribe el monto o cambia el tamaño`);
        return;
      }
      f.revenue = ""; setRateMsg(`⚠️ ${cl.companyName} no tiene tarifa para ${f.municipality}, ${f.province}; agrégala en Clientes o usa Custom`);
      return;
    }
    setRateMsg("");
  };

  const handleTarifaOverride = (val) => {
    if (val === "custom") {
      setForm({ ...form, tarifaOverride: "custom" });
      setRateMsg("✏️ Monto personalizado");
      return;
    }
    const override = val === "auto" ? null : val;
    const f = { ...form, tarifaOverride: override };
    const cl = clients.find(c => c.id === Number(f.clientId));
    if (cl && f.province && f.municipality) {
      const rate = cl.rates.find(r => r.province === f.province && r.municipality === f.municipality);
      if (rate) {
        const tk = trucks.find(t2 => t2.id === Number(f.truckId));
        const size = override || tk?.size || "T1";
        const price = size === "T2" ? (rate.priceT2 ?? rate.price ?? 0) : (rate.priceT1 ?? rate.price ?? 0);
        f.revenue = price; setRateMsg(`${t.rateApplied} (⚡ ${size}): ${fmt(price)}`);
      }
    }
    setForm(f);
  };

  const handleTruckChange = (tid) => {
    const f = { ...form, truckId: tid };
    tryApplyRate(f, null);
    setForm(f);
  };

  const handleDestChange = (field, val) => {
    const f = { ...form, [field]: val };
    if (field === "province") { f.municipality = ""; setRateMsg(""); }
    else {
      tryApplyRate(f, null);
    }
    setForm(f);
  };

  // Genera/actualiza los gastos automáticos del viaje: nómina del chofer y pago de ayudantes
  const syncTripExpenses = (tripId, data, prev) => {
    const driver = drivers.find(d => d.id === data.driverId);
    const truck = trucks.find(tk => tk.id === data.truckId);
    const calc = driver ? calcDriverPay({ driver, trip: data, truck, clientId: data.clientId }) : null;
    const cancelled = data.status === "cancelled";
    const driverAmt = !calc || cancelled || normalizeDriver(driver).payType === "fixed" ? 0 : calc.driverNet;
    const helperAmt = !calc || cancelled ? 0 : calc.helpersTotal;
    setExpenses(prevExp => {
      let next = [...prevExp];
      const upsert = (category, amount, description, extra) => {
        const existing = next.find(e => e.tripId === tripId && e.category === category);
        if (existing) {
          if (existing.status === "paid" && existing.amount !== amount) return; // ya pagado: no se toca
          next = amount > 0 ? next.map(e => e === existing ? { ...e, amount, description, date: data.date, ...extra } : e) : next.filter(e => e !== existing);
        } else if (amount > 0) {
          next = [...next, { id: nxId(next), tripId, date: data.date, category, amount, description, paymentMethod: "transfer", status: "pending", supplierId: null, ...extra }];
        }
      };
      upsert("driverPay", driverAmt, calc ? describeDriverPay(calc, driver) : "", { driverId: data.driverId });
      upsert("helper", helperAmt, calc ? `Ayudantes (${calc.numHelpers} × ${fmt(calc.helperEach)}): ${(data.helperNames || []).filter(Boolean).join(", ") || driver?.name || ""}` : "", { driverId: data.driverId });
      // Comisión de broker (solo clientes que NO son pass-through)
      const cl = clients.find(c => c.id === data.clientId);
      const broker = data.brokerId ? brokers.find(b => b.id === data.brokerId) : null;
      const fee = broker && !cl?.rules?.brokerPassThrough && !cancelled ? Math.round((data.revenue || 0) * (broker.commissionPct || 0) / 100) : 0;
      upsert("broker_commission", fee, broker ? `${t.brokerAutoDeducted}: ${broker.name} (${broker.commissionPct}%)` : "", { brokerId: data.brokerId || null });
      return next;
    });
  };

  const saveTrip = () => {
    if (!form.province || !form.municipality) { setFormError("Destino requerido"); return; }
    if (!form.clientId) { setFormError("Cliente requerido"); return; }
    if (!form.truckId) { setFormError("Camión requerido"); return; }
    if (!form.driverId) { setFormError("Chofer requerido"); return; }
    const revNum = Number(form.revenue);
    const cancelled = form.status === "cancelled";
    if (!cancelled && !(revNum > 0)) { setFormError("La tarifa del viaje debe ser mayor que 0. Si el cliente no tiene tarifa para este destino, agrégala en Clientes o usa «Custom»."); return; }
    const cl = clients.find(c => c.id === Number(form.clientId));
    if (cl?.rules?.requiresInvoiceRef && !form.invoiceRef && !cancelled) { setFormError(t.invoiceRefRequired || "Referencia de factura requerida"); return; }
    const refCheck = checkTripRef({ ...form, id: editId, clientId: Number(form.clientId), truckId: Number(form.truckId), status: form.status }, trips, { drivers, trucks });
    if (!refCheck.ok) { setFormError(refCheck.error); return; }
    if (payPreview && payPreview.payType === "perTrip" && !payPreview.rateFound && !cancelled) {
      if (!window.confirm("El chofer no tiene tarifa para este destino: el viaje se guardará SIN pago de chofer. ¿Continuar?")) return;
    }
    const numHelpers = form.numHelpers === null || form.numHelpers === "" ? (payPreview?.numHelpers ?? 0) : Number(form.numHelpers);
    const helperPayEach = form.helperPayEach === "" ? (payPreview?.helperEach ?? 0) : Number(form.helperPayEach);
    const helperNames = (form.helperNames || []).slice(0, numHelpers);
    const helpersArr = Array.from({ length: numHelpers }, (_, i) => ({ name: helperNames[i] || `Ayudante ${i + 1}`, pay: helperPayEach }));
    const data = { ...form, truckId: Number(form.truckId), driverId: Number(form.driverId), clientId: Number(form.clientId) || null, brokerId: Number(form.brokerId) || null,
      weight: Number(form.weight) || 0, revenue: Number(form.revenue) || 0, numHelpers, helperPayEach, helperNames, helpers: helpersArr,
      discounts: (form.discounts || []).filter(d => Number(d.amount) > 0) };
    if (editId) {
      const prevTrip = trips.find(tr => tr.id === editId);
      if (isLocked(editId) && prevTrip && (prevTrip.revenue !== data.revenue || prevTrip.clientId !== data.clientId || prevTrip.province !== data.province || prevTrip.municipality !== data.municipality)) {
        setFormError("Este viaje ya está facturado o cobrado: no se puede cambiar cliente, destino ni tarifa. Anula la factura o el cobro primero."); return;
      }
      let saved = { ...data, id: editId }, linked = null;
      if (refCheck.linkWith) { const l = linkJoint(saved, refCheck.linkWith); saved = l.trip; linked = l.other; }
      setTrips(trips.map(tr => tr.id === editId ? saved : (linked && tr.id === linked.id ? linked : tr)));
      syncTripExpenses(editId, data, prevTrip);
    } else {
      const newId = nxId(trips);
      let saved = { ...data, id: newId }, linked = null;
      if (refCheck.linkWith) { const l = linkJoint(saved, refCheck.linkWith); saved = l.trip; linked = l.other; }
      setTrips([...trips.map(tr => linked && tr.id === linked.id ? linked : tr), saved]);
      syncTripExpenses(newId, data, null);
    }
    setShowForm(false);
  };

  const deleteTrip = (tr) => {
    if (isLocked(tr.id)) { window.alert("Este viaje está facturado o cobrado y no se puede eliminar. Márcalo como cancelado o anula la factura/cobro primero."); return; }
    const paid = expenses.filter(e => e.tripId === tr.id && e.status === "paid");
    const msg = `¿Eliminar viaje del ${tr.date} a ${tr.municipality}?` + (paid.length ? `\n\nOJO: tiene ${paid.length} gasto(s) ya PAGADOS que se conservarán sin viaje.` : "\nSe eliminarán también sus gastos pendientes.");
    if (!window.confirm(msg)) return;
    setTrips(trips.filter(x => x.id !== tr.id));
    setExpenses(expenses.filter(e => !(e.tripId === tr.id && e.status !== "paid")));
  };

  // Documentos recibidos (misma lógica que el panel de Oficina)
  const setReceived = (tripId, value) => setTrips(prev => prev.map(tr => tr.id !== tripId ? tr : {
    ...tr, docs: Object.fromEntries(TRIP_DOCS.map(d => [d.key, value])), docStatus: value ? "delivered" : "pending", podDelivered: value,
    docsReceivedAt: value ? (tr.docsReceivedAt || today()) : null, docsReceivedBy: value ? (tr.docsReceivedBy || user?.name || "") : "" }));

  const addExpense = () => {
    if (!expForm.amount || !expModal) return;
    const instant = ["cash", "credit_card"].includes(expForm.paymentMethod);
    setExpenses(prev => [...prev, { id: nxId(prev), tripId: expModal, date: expForm.date, category: expForm.category, amount: Number(expForm.amount), paymentMethod: expForm.paymentMethod, description: expForm.description, supplierId: null, status: instant ? "paid" : "pending", ...(instant ? { paidDate: expForm.date } : {}) }]);
    setExpForm({ date: today(), category: "fuel", amount: "", paymentMethod: "cash", description: "" });
  };

  const addDiscountRow = () => setForm({ ...form, discounts: [...(form.discounts || []), { desc: "", amount: 0 }] });

  let filtered = [...trips].sort((a, b) => b.date.localeCompare(a.date));
  if (filterStatus !== "all") filtered = filtered.filter(tr => tr.status === filterStatus);
  if (filterClient !== "all") filtered = filtered.filter(tr => tr.clientId === Number(filterClient));
  if (filterDriver !== "all") filtered = filtered.filter(tr => tr.driverId === Number(filterDriver));
  if (filterTruck !== "all") filtered = filtered.filter(tr => tr.truckId === Number(filterTruck));
  const clientMap = new Map(clients.map(c => [c.id, c]));
  const driverMap = new Map(drivers.map(d => [d.id, d]));
  const truckMap  = new Map(trucks.map(tk => [tk.id, tk]));
  const tripExpMap = expenses.reduce((m, e) => { if (e.tripId && e.category !== "adelanto_conductor") m.set(e.tripId, (m.get(e.tripId) || 0) + e.amount); return m; }, new Map());

  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(tr => {
      const cl = clientMap.get(tr.clientId);
      const dk = driverMap.get(tr.driverId);
      const tk = truckMap.get(tr.truckId);
      return [tr.date, tr.municipality, tr.province, cl?.companyName, dk?.name, tk?.plate, tr.invoiceRef, tr.createdBy, tr.cargo].some(x => x && x.toLowerCase().includes(s));
    });
  }

  const selectedClient = clients.find(c => c.id === Number(form.clientId));

  return <div>
    <PageHeader title={t.trips} action={<Btn onClick={openNew}><Plus size={14} /> {t.newTrip}</Btn>} />

    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: colors.textMuted }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchPlaceholder} style={{ width: "100%", padding: "7px 10px 7px 30px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 16, outline: "none" }} />
      </div>
      {["all", "pending", "in_transit", "delivered", "cancelled"].map(s => (
        <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${filterStatus === s ? colors.accent : colors.border}`, background: filterStatus === s ? colors.accent + "18" : "transparent", color: filterStatus === s ? colors.accentLight : colors.textMuted, cursor: "pointer", fontSize: 11 }}>
          {s === "all" ? t.all : s === "in_transit" ? t.inTransit : t[s]}
        </button>
      ))}
      <Sel value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ fontSize: 11 }}>
        <option value="all">{t.all} {t.clients}</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
      </Sel>
      <Sel value={filterDriver} onChange={e => setFilterDriver(e.target.value)} style={{ fontSize: 11 }}>
        <option value="all">{t.all} {t.drivers || "Choferes"}</option>
        {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </Sel>
      <Sel value={filterTruck} onChange={e => setFilterTruck(e.target.value)} style={{ fontSize: 11 }}>
        <option value="all">{t.all} {t.fleet || "Camiones"}</option>
        {trucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}
      </Sel>
    </div>

    {/* Trip Modal */}
    {showForm && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
      <div onClick={e => e.stopPropagation()} style={{ background: colors.card, borderRadius: 14, padding: 24, width: "min(620px, calc(100vw - 32px))", maxHeight: "90vh", overflowY: "auto", overflowX: "hidden", border: `1px solid ${colors.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}><Route size={18} color={colors.accent} /> {editId ? t.editTrip : t.newTrip}</h3>
          <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 12, marginBottom: 10 }}>
          <Inp label={t.date} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Sel label={t.client + (editId && isLocked(editId) ? " 🔒" : "")} value={form.clientId} onChange={e => handleClientChange(e.target.value)} disabled={!!editId && isLocked(editId)}>
            <option value="">{t.selectClient}</option>
            {clients.filter(c => c.status === "active").map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </Sel>
          <Sel label={t.status} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="pending">{t.pending}</option><option value="in_transit">{t.inTransit}</option><option value="delivered">{t.delivered}</option><option value="cancelled">{t.cancelled}</option>
          </Sel>
        </div>
        <DestinationSelect t={t} province={form.province} municipality={form.municipality} onProvinceChange={v => handleDestChange("province", v)} onMunicipalityChange={v => handleDestChange("municipality", v)} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 10 }}>
          <div>
            <Sel label={t.truck} value={form.truckId} onChange={e => handleTruckChange(e.target.value)}>
              <option value="">— {t.selectTruck || "Seleccionar camión"} —</option>
              {trucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate} ({tk.size || "T1"})</option>)}
            </Sel>
            {(() => {
              const cl = clients.find(c => c.id === Number(form.clientId));
              const rate = cl?.rates?.find(r => r.province === form.province && r.municipality === form.municipality);
              const tk = trucks.find(t2 => t2.id === Number(form.truckId));
              if (!rate || !tk) return null;
              const activeSize = form.tarifaOverride === "custom" ? null : tripSize(form, tk);
              return (
                <div style={{ marginTop: 4, fontSize: 10, display: "flex", gap: 6 }}>
                  {rate.priceT1 > 0 && <span style={{ padding: "2px 6px", borderRadius: 4, background: activeSize === "T1" ? colors.green+"22" : colors.bg, border: `1px solid ${activeSize === "T1" ? colors.green : colors.border}`, color: activeSize === "T1" ? colors.green : colors.textMuted, fontWeight: activeSize === "T1" ? 700 : 400 }}>T1 {fmt(rate.priceT1)}</span>}
                  {rate.priceT2 > 0 && <span style={{ padding: "2px 6px", borderRadius: 4, background: activeSize === "T2" ? colors.accent+"22" : colors.bg, border: `1px solid ${activeSize === "T2" ? colors.accent : colors.border}`, color: activeSize === "T2" ? colors.accent : colors.textMuted, fontWeight: activeSize === "T2" ? 700 : 400 }}>T2 {fmt(rate.priceT2)}</span>}
                </div>
              );
            })()}
          </div>
          <Sel label={t.driver} value={form.driverId} onChange={e => setForm({ ...form, driverId: e.target.value })}>
            <option value="">— {t.selectDriver || "Seleccionar chofer"} —</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Sel>
          <Sel label={t.broker + " (opt.)"} value={form.brokerId || ""} onChange={e => setForm({ ...form, brokerId: e.target.value })}><option value="">{t.none}</option>{brokers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.commissionPct}%)</option>)}</Sel>
          <div>
            <Inp label={t.rate + (editId && isLocked(editId) ? " 🔒 facturado/cobrado" : "")} type="number" value={form.revenue} onChange={e => setForm({ ...form, revenue: e.target.value })} disabled={!!editId && isLocked(editId)} />
            {rateMsg && <div style={{ fontSize: 10, color: form.tarifaOverride === "custom" ? "#9b7fe8" : form.tarifaOverride ? colors.orange : colors.green, marginTop: 3 }}><CheckCircle2 size={10} /> {rateMsg}</div>}
          </div>
        </div>
        <div style={{ marginTop: 10, padding: "10px 14px", background: form.tarifaOverride ? colors.orange + "10" : "transparent", borderRadius: 8, border: `1px dashed ${form.tarifaOverride ? colors.orange + "80" : colors.border}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: form.tarifaOverride ? colors.orange : colors.textMuted }}>⚡ Tarifa Override</span>
          <select value={form.tarifaOverride || "auto"} onChange={e => handleTarifaOverride(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${form.tarifaOverride ? colors.orange : colors.border}`, background: colors.inputBg, color: form.tarifaOverride ? colors.orange : colors.text, fontSize: 16, cursor: "pointer", fontWeight: form.tarifaOverride ? 700 : 400 }}>
            <option value="auto">Auto — usar tamaño del camión</option>
            <option value="T1">T1 — tarifa estándar</option>
            <option value="T2">T2 — tarifa premium ↑</option>
            <option value="custom">✏️ Custom — monto manual</option>
          </select>
          {form.tarifaOverride === "custom"
            ? <Inp type="number" placeholder="Monto personalizado RD$" value={form.revenue} onChange={e => setForm({ ...form, revenue: e.target.value })} style={{ width: 180, fontSize: 12 }} />
            : form.tarifaOverride
              ? <span style={{ fontSize: 11, color: colors.orange, fontWeight: 700 }}>⚡ Override activo: tarifa {form.tarifaOverride} aplicada</span>
              : <span style={{ fontSize: 11, color: colors.textMuted }}>Camión registrado como {trucks.find(t2 => t2.id === Number(form.truckId))?.size || "T1"} — auto</span>
          }
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginTop: 10 }}>
          <Inp label={t.cargo} value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} />
          <Inp label={t.weight} type="number" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} />
          <Inp label={t.invoiceRef + (selectedClient?.rules?.requiresInvoiceRef ? " *" : "")} value={form.invoiceRef} onChange={e => setForm({ ...form, invoiceRef: e.target.value })} style={{ borderColor: selectedClient?.rules?.requiresInvoiceRef && !form.invoiceRef ? colors.red : colors.border }} />
        </div>
        {form.invoiceRef && (() => {
          const probe = { ...form, id: editId, clientId: Number(form.clientId), truckId: Number(form.truckId) };
          const others = sameRefTrips(probe, trips);
          return <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${others.length ? colors.orange + "80" : colors.border}`, background: others.length ? colors.orange + "0d" : "transparent", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="checkbox" checked={!!form.joint} onChange={e => setForm({ ...form, joint: e.target.checked })} /> Viaje conjunto (2 camiones para la misma factura)</label>
            {others.length > 0 && <span style={{ color: colors.orange }}>Esta referencia ya está en el viaje #{others[0].id} ({others[0].date}, {trucks.find(x => x.id === others[0].truckId)?.plate || "—"}, {drivers.find(x => x.id === others[0].driverId)?.name || "—"}). {form.joint || others[0].joint ? "Se enlazará como viaje conjunto: la factura paga los dos camiones." : "Marca «Viaje conjunto» si fueron dos camiones; si no, no se puede guardar."}</span>}
          </div>; })()}
        {selectedClient && selectedClient.rules && <div style={{ margin: "10px 0", padding: 10, background: colors.purple + "08", borderRadius: 8, border: `1px solid ${colors.purple}30`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
          <Badge label={`${selectedClient.rules?.paymentTerms}d`} color={colors.accent} icon={Calendar} />
          {selectedClient.rules?.requiresPOD && <Badge label="POD" color={colors.orange} icon={FileCheck} />}
          {selectedClient.rules?.requiresInvoiceRef && <Badge label={t.invoiceRef} color={colors.red} icon={Hash} />}
          {selectedClient.rules?.requiresDocuments && <Badge label={t.document} color={colors.purple} icon={FileText} />}
          {selectedClient.rules?.defaultBrokerId && (() => { const b = brokers.find(x => x.id === selectedClient.rules.defaultBrokerId); return b ? <Badge label={`${t.broker}: ${b.name} ${b.commissionPct}%`} color={colors.yellow} icon={Handshake} /> : null; })()}
        </div>}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}22` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted, marginBottom: 6 }}>Chofer y ayudantes</div>
          {(() => {
            const sz = tripSize(form, trucks.find(tk => tk.id === Number(form.truckId)));
            const n = form.numHelpers === null || form.numHelpers === "" ? (payPreview?.numHelpers ?? DEFAULT_HELPERS[sz]) : Number(form.numHelpers);
            return <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                <Sel label={`Ayudantes (por defecto ${DEFAULT_HELPERS[sz]} en ${sz})`} value={n} onChange={e => setForm({ ...form, numHelpers: Number(e.target.value) })}>
                  {[0,1,2,3,4,5].map(k => <option key={k} value={k}>{k === 0 ? "0 — sin ayudantes" : `${k} ayudante${k > 1 ? "s" : ""}`}</option>)}
                </Sel>
                {n > 0 && <Inp label={`Pago por ayudante${payPreview && form.helperPayEach === "" ? " (tarifario)" : ""}`} type="number" placeholder={payPreview ? String(payPreview.helperEach) : "RD$"} value={form.helperPayEach} onChange={e => setForm({ ...form, helperPayEach: e.target.value })} />}
              </div>
              {n > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginTop: 8 }}>
                {Array.from({ length: n }, (_, i) => <Inp key={i} label={`Nombre ayudante ${i + 1} (opcional)`} value={form.helperNames?.[i] || ""} onChange={e => { const names = [...(form.helperNames || [])]; names[i] = e.target.value; setForm({ ...form, helperNames: names }); }} style={{ fontSize: 11 }} />)}
              </div>}
              {payPreview && <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, fontSize: 12, background: payPreview.rateFound ? colors.green + "10" : colors.orange + "12", border: `1px solid ${payPreview.rateFound ? colors.green : colors.orange}40` }}>
                {payPreview.payType === "perTrip" && !payPreview.rateFound
                  ? <span style={{ color: colors.orange }}>⚠️ El chofer no tiene tarifa para este destino{payPreview.sheetName ? ` en el tarifario «${payPreview.sheetName}»` : ""}. Agrégala en Choferes.</span>
                  : <span>
                      <b>Chofer</b> {fmt(payPreview.base)}{payPreview.dieta ? ` + dieta ${fmt(payPreview.dieta)}` : ""}{payPreview.discounts ? ` − desc. ${fmt(payPreview.discounts)}` : ""} = <b>{fmt(payPreview.driverNet)}</b>
                      {payPreview.numHelpers > 0 && <> · <b>Ayudantes</b> {payPreview.numHelpers} × {fmt(payPreview.helperEach)} = <b>{fmt(payPreview.helpersTotal)}</b></>}
                      {" "}· Total nómina del viaje <b>{fmt(payPreview.total)}</b>
                      {payPreview.sheetName && <span style={{ color: colors.textMuted }}> · tarifario «{payPreview.sheetName}»</span>}
                    </span>}
              </div>}
            </>;
          })()}
        </div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.border}22` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted }}>{t.discounts}</span>
            <Btn onClick={addDiscountRow} style={{ padding: "3px 8px", fontSize: 10 }}><Plus size={10} /></Btn>
          </div>
          {(form.discounts || []).map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
              <Inp placeholder={t.discountDesc} value={d.desc} onChange={e => { const ds = [...form.discounts]; ds[i] = { ...d, desc: e.target.value }; setForm({ ...form, discounts: ds }); }} style={{ flex: 1, fontSize: 11 }} />
              <Inp type="number" placeholder="$" value={d.amount} onChange={e => { const ds = [...form.discounts]; ds[i] = { ...d, amount: Number(e.target.value) }; setForm({ ...form, discounts: ds }); }} style={{ width: 80, fontSize: 11 }} />
              <button onClick={() => setForm({ ...form, discounts: form.discounts.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}><X size={12} /></button>
            </div>
          ))}
        </div>
        {formError && <div style={{ color: colors.red, fontSize: 12, marginTop: 8, padding: "6px 10px", background: colors.red + "12", borderRadius: 6, border: `1px solid ${colors.red}33` }}>{formError}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}33` }}>
          <Btn onClick={saveTrip} style={{ flex: 1, justifyContent: "center" }}>{t.save}</Btn>
          <Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn>
        </div>
      </div>
    </div>}

    {/* Expense Modal */}
    {expModal && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setExpModal(null)}>
      <div onClick={e => e.stopPropagation()} style={{ background: colors.card, borderRadius: 12, padding: 24, width: "min(460px, calc(100vw - 24px))", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${colors.border}` }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}><Receipt size={18} color={colors.orange} /> {t.addExpense} — #{expModal}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 10 }}>
          <Inp label={t.expenseDate} type="date" value={expForm.date} onChange={e => setExpForm({ ...expForm, date: e.target.value })} />
          <Sel label={t.expenseCategory} value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })}>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{t[c] || c}</option>)}
          </Sel>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 10 }}>
          <Inp label={t.expenseAmount} type="number" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} />
          <Sel label={t.paymentMethod} value={expForm.paymentMethod} onChange={e => setExpForm({ ...expForm, paymentMethod: e.target.value })}>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t[m] || m}</option>)}
          </Sel>
        </div>
        <Inp label={t.expenseDesc} value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />
        {expenses.filter(e => e.tripId === expModal).length > 0 && <div style={{ maxHeight: 120, overflow: "auto", marginBottom: 10 }}>
          {expenses.filter(e => e.tripId === expModal).map(e => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${colors.border}11`, fontSize: 11 }}>
              <span><Badge label={t[e.category] || e.category} color={colors.textMuted} /> {e.description}</span>
              <span style={{ fontWeight: 600, color: colors.red }}>{fmt(e.amount)}</span>
            </div>
          ))}
        </div>}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={addExpense}><Plus size={14} /> {t.addExpense}</Btn>
          <Btn variant="ghost" onClick={() => setExpModal(null)}>{t.cancel}</Btn>
        </div>
      </div>
    </div>}

    {filtered.length === 0
      ? <Card><div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noTrips}</div></Card>
      : isMobile
        ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(tr => {
              const cl = clientMap.get(tr.clientId);
              const dk = driverMap.get(tr.driverId);
              const tk = truckMap.get(tr.truckId);
              const tripExp = tripExpMap.get(tr.id) || 0;
              return <Card key={tr.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>{tr.municipality}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted }}>{tr.province}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{tr.date}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <StatusBadge status={tr.status} t={t} />
                    <div style={{ fontSize: 16, fontWeight: 800, color: colors.green }}>{fmt(tr.revenue)}</div>
                    {(() => {
                      const inv = invoicedTripMap.get(tr.id);
                      if (inv) return <span style={{ fontSize: 9, fontWeight: 600, color: colors.green, background: colors.green+"18", padding: "1px 7px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 2 }}><FileText size={8} /> {inv.invoiceNumber}</span>;
                      if ((tr.revenue || 0) > 0) return <span style={{ fontSize: 9, color: colors.textMuted, background: colors.border+"44", padding: "1px 7px", borderRadius: 8 }}>Sin facturar</span>;
                      return null;
                    })()}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11, color: colors.textMuted, marginBottom: 10 }}>
                  <div><span style={{ color: colors.text, fontWeight: 600 }}>{cl?.companyName || "—"}</span></div>
                  <div>{dk?.name || "—"} · {tk?.plate || "—"}</div>
                  {tripExp > 0 && <div style={{ color: colors.red }}>Gastos: {fmt(tripExp)}</div>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => openEdit(tr)} style={{ flex: 1, minHeight: 44, borderRadius: 8, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 12 }}><Pencil size={13} /> {t.edit || "Editar"}</button>
                  <button onClick={() => setExpModal(tr.id)} style={{ flex: 1, minHeight: 44, borderRadius: 8, border: `1px solid ${colors.orange}40`, background: colors.orange+"10", color: colors.orange, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 12 }}><Receipt size={13} /> {t.expenses}</button>
                  <button onClick={() => generateConduce(tr, cl, tk, dk)} style={{ flex: 1, minHeight: 44, borderRadius: 8, border: `1px solid ${colors.cyan}40`, background: colors.cyan+"10", color: colors.cyan, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 12 }}><Printer size={13} /> PDF</button>
                  <button onClick={() => deleteTrip(tr)} style={{ minHeight: 44, minWidth: 44, borderRadius: 8, border: "none", background: "transparent", color: colors.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={16} /></button>
                </div>
              </Card>;
            })}
          </div>
        : <Card>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
              <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <Th>{t.date}</Th><Th>{t.destination}</Th><Th>{t.status}</Th><Th>{t.client}</Th>
                <Th>{t.createdBy}</Th>
                <Th>{t.driver}</Th><Th>{t.truck}</Th>
                <Th align="center">{t.conduce}</Th>
                <Th align="center">{t.document}</Th>
                <Th align="center">{t.expenses}</Th><Th align="right">{t.rate}</Th><Th align="right">{t.actions}</Th>
              </tr></thead>
              <tbody>
                {filtered.map(tr => {
                  const cl = clientMap.get(tr.clientId);
                  const dk = driverMap.get(tr.driverId);
                  const tk = truckMap.get(tr.truckId);
                  const tripExp = tripExpMap.get(tr.id) || 0;
                  return <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}
                    onMouseEnter={e => e.currentTarget.style.background = colors.cardHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <Td>{tr.date}</Td>
                    <Td><span style={{ fontSize: 12 }}>{tr.municipality}</span><br /><span style={{ fontSize: 10, color: colors.textMuted }}>{tr.province}</span></Td>
                    <Td><StatusBadge status={tr.status} t={t} /></Td>
                    <Td bold>{cl?.companyName || "—"}{tr.invoiceRef && <><br /><span style={{ fontSize: 9, color: colors.textMuted }}>#{tr.invoiceRef}</span></>}{tr.joint && <><br /><span style={{ fontSize: 9, color: colors.purple, fontWeight: 700 }}>⛓ conjunto{tr.jointWith ? ` con #${tr.jointWith}` : ""}</span></>}</Td>
                    <Td><span style={{ fontSize: 11, color: colors.textMuted }}>{tr.createdBy}</span></Td>
                    <Td>{dk?.name || "—"}</Td>
                    <Td>{tk?.plate || "—"}</Td>
                    <Td align="center">
                      <button onClick={() => generateConduce(tr, cl, tk, dk)} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${colors.cyan}40`, background: colors.cyan + "10", color: colors.cyan, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
                        <Printer size={10} /> PDF
                      </button>
                    </Td>
                    <Td align="center">
                      {(() => { const ok = docsComplete(tr, cl); return <button onClick={() => setReceived(tr.id, !ok)} title={ok ? `Recibido el ${tr.docsReceivedAt || "—"}${tr.docsReceivedBy ? ` por ${tr.docsReceivedBy}` : ""}` : "Documentos físicos pendientes (no entra en nómina)"}
                        style={{ padding: "3px 8px", borderRadius: 10, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", background: ok ? colors.green + "18" : colors.orange + "18", color: ok ? colors.green : colors.orange }}>
                        {ok ? `Recibido ${tr.docsReceivedAt ? tr.docsReceivedAt.slice(5) : ""}` : "Pendiente"}
                      </button>; })()}
                    </Td>
                    <Td align="center">
                      <button onClick={() => setExpModal(tr.id)} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${colors.orange}40`, background: colors.orange + "10", color: colors.orange, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
                        <Receipt size={10} /> {fmt(tripExp)}
                      </button>
                    </Td>
                    <Td align="right" bold color={colors.green}>
                      {fmt(tr.revenue)}
                      {tr.tarifaOverride && <><br /><span style={{ fontSize: 11, fontWeight: 700, color: colors.orange, background: colors.orange+"15", padding: "1px 6px", borderRadius: 5, display: "inline-flex", alignItems: "center", gap: 2 }}><Zap size={9} /> {tr.tarifaOverride}</span></>}
                      <br />
                      {(() => {
                        const inv = invoicedTripMap.get(tr.id);
                        if (inv) return <span style={{ fontSize: 9, fontWeight: 600, color: colors.green, background: colors.green+"18", padding: "1px 6px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 2 }}><FileText size={8} /> {inv.invoiceNumber}</span>;
                        if ((tr.revenue || 0) === 0) return null;
                        return <span style={{ fontSize: 9, color: colors.textMuted, background: colors.border+"44", padding: "1px 6px", borderRadius: 8 }}>Sin facturar</span>;
                      })()}
                    </Td>
                    <Td align="right">
                      <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                        <button onClick={() => openEdit(tr)} style={{ padding: "10px", borderRadius: 5, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={12} /></button>
                        <button onClick={() => deleteTrip(tr)} title={isLocked(tr.id) ? "Facturado o cobrado: no se puede eliminar" : "Eliminar"} style={{ opacity: isLocked(tr.id) ? 0.35 : 1, padding: "10px", borderRadius: 5, border: "none", background: "transparent", color: colors.red, cursor: "pointer", minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={12} /></button>
                      </div>
                    </Td>
                  </tr>;
                })}
              </tbody>
            </table>
            </div>
          </Card>
    }
  </div>;
          }

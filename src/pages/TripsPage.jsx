import { useState, useMemo, useEffect } from "react";
import HelperSlots from "../components/HelperSlots.jsx";
import { syncTripPayExpenses } from "../utils/tripExpenses.js";
import { normalizeAyudante, crewSlots, buildHelperLines, helperExpensePlan, applyHelperPlan, isDirectLine, clientHelpersMode, clientSkipsHelpers, tripHelpersPaid, linesUseList } from "../utils/ayudantes.js";
import { Plus, X, Search, Route, Receipt, Printer, CheckCircle2, Pencil, Trash2, Calendar, FileCheck, FileText, Handshake, Hash, Zap, RotateCw } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, nxId, today } from "../utils/helpers.js";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "../constants/categories.js";
import { calcDriverPay, describeDriverPay, normalizeDriver, tripSize, paySize, DEFAULT_HELPERS } from "../utils/driverPay.js";
import { TRIP_DOCS, docsComplete } from "../utils/payroll.js";
import { checkTripRef, linkJoint, sameRefTrips } from "../utils/tripRef.js";
import { needsRate, takeTripsFilter } from "../utils/tripPending.js";
import { buildCompanionTrip, applyReceived, setReceivedDate, jointIds } from "../utils/jointTrip.js";
import SortBar from "../components/SortBar.jsx";
import { sortRecords, DEFAULT_SORT } from "../utils/sortList.js";
import { tripPassThrough } from "../utils/profitFirst.js";
import { checkRef } from "../api.js";
import { generateConduce } from "../utils/generateConduce.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td, StatusBadge, DestinationSelect } from "../components/ui/index.jsx";

export default function TripsPage({ t, user, trips, setTrips, trucks, drivers, clients, expenses, setExpenses, brokers, invoices, cobros = [], partners = [], settlementStatus = {}, ayudantes = [], isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [expModal, setExpModal] = useState(null);
  const [expForm, setExpForm] = useState({ date: today(), category: "fuel", amount: "", gallons: "", paymentMethod: "cash", description: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterExtra, setFilterExtra] = useState(() => takeTripsFilter() === "pending" ? "pending" : "all");   // all | nodocs | uninvoiced | pending
  const [refInfo, setRefInfo] = useState(null);           // verificación de referencia en vivo (servidor)
  const [filterClient, setFilterClient] = useState("all");
  const [filterDriver, setFilterDriver] = useState("all");
  const [filterTruck, setFilterTruck] = useState("all");
  const [sort, setSort] = useState(DEFAULT_SORT); // por defecto: fecha, más reciente primero
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

  const PURPLE_T = "#9b7fe8";
  const emptyForm = { date: today(), province: "", municipality: "", truckId: "", driverId: "", clientId: "", brokerId: "", cargo: "", weight: "", revenue: "", status: "pending", invoiceRef: "", docStatus: "pending", podDelivered: false, numHelpers: null, helperPayEach: "", driverPayOverride: "", helperNames: [], discounts: [], tarifaOverride: null, joint: false, jointWith: null, jointDriverId: "", jointTruckId: "" };

  // Viajes ya cobrados (en algún cobro registrado): no se pueden borrar ni cambiar de monto
  const collectedTripIds = useMemo(() => new Set((cobros || []).flatMap(c => (c.collectedTripIds || []).map(Number))), [cobros]);
  const isLocked = (id) => invoicedTripMap.has(Number(id)) || collectedTripIds.has(Number(id));
  // Viaje en camión de socio cuya quincena ya se marcó como transferida: no se cancela ni se borra sin desmarcarla
  const settledReason = (tr) => {
    if (!tr?.date) return null;
    const tk = trucks.find(x => x.id === Number(tr.truckId));
    if (!tk?.partnerId) return null;
    const half = Number(tr.date.slice(8, 10)) <= 15 ? 1 : 2;
    const key = `${tk.partnerId}-${tr.date.slice(0, 7)}-${half}`;
    if ((settlementStatus || {})[key] !== "paid") return null;
    const p = (partners || []).find(x => x.id === tk.partnerId);
    return `Este viaje ya está en la liquidación de ${p?.name || "el socio"} (${tr.date.slice(0, 7)}, quincena ${half}) marcada como TRANSFERIDA. Desmárcala primero en Liquidaciones.`;
  };
  // Explica exactamente qué hay que anular primero (factura y/o cobro de qué quincena)
  const lockReason = (id) => {
    const parts = [];
    const inv = invoicedTripMap.get(Number(id));
    if (inv) parts.push(`la factura ${inv.invoiceNumber || "#" + inv.id} (${inv.status === "paid" ? "cobrada" : inv.status === "sent" ? "enviada" : "borrador"})`);
    const cobro = (cobros || []).find(c => (c.collectedTripIds || []).map(Number).includes(Number(id)));
    if (cobro) { const cinv = (invoices || []).find(i => i.id === cobro.invoiceId); parts.push((cobro.invoiceId ? `el cobro del ${cobro.date} de la factura ${cinv?.invoiceNumber || "#" + cobro.invoiceId}` : `el cobro del período ${cobro.periodKey}`) + (cobro.pf ? " (ya repartido con Profit First)" : "")); }
    return parts.length ? `Este viaje está en ${parts.join(" y en ")}. Anula primero ${parts.length > 1 ? "ambos" : "eso"} en ${inv ? "Facturas" : ""}${inv && cobro ? " / " : ""}${cobro ? "CxC" : ""}.` : null;
  };

  // Pago del chofer calculado en vivo con la función única (misma que usa Nómina y Oficina)
  const payPreview = useMemo(() => {
    const driver = drivers.find(d => d.id === Number(form.driverId));
    if (!driver) return null;
    const truck = trucks.find(tk => tk.id === Number(form.truckId));
    const trip = { ...form, revenue: Number(form.revenue) || 0, numHelpers: form.numHelpers === null || form.numHelpers === "" ? null : Number(form.numHelpers), helperPayEach: form.helperPayEach === "" ? null : Number(form.helperPayEach), driverPayOverride: form.driverPayOverride === "" || form.driverPayOverride == null ? null : Number(form.driverPayOverride) };
    return calcDriverPay({ driver, trip, truck, clientId: Number(form.clientId) || null });
  }, [form, drivers, trucks]);

  // Referencia de factura: verificación en vivo contra el servidor (misma que ve el chofer)
  useEffect(() => {
    const ref = String(form.invoiceRef || "").trim(), clientId = Number(form.clientId), truckId = Number(form.truckId);
    if (!showForm || !ref || !clientId) { setRefInfo(null); return; }
    let alive = true;
    setRefInfo(r => ({ ...(r || {}), checking: true }));
    const h = setTimeout(async () => { const info = await checkRef({ clientId, ref, truckId, tripId: editId }); if (alive) setRefInfo({ ...info, checking: false }); }, 400);
    return () => { alive = false; clearTimeout(h); };
  }, [form.invoiceRef, form.clientId, form.truckId, showForm, editId]);

  const stamp = (obj, action) => {
    const at = new Date().toISOString();
    const history = [...(obj.history || []), { at, by: user?.name || "", action }].slice(-20);
    return action === "creado" ? { ...obj, createdBy: obj.createdBy || user?.name, createdAt: obj.createdAt || at, history }
      : { ...obj, updatedBy: user?.name, updatedAt: at, history };
  };
  const openNew = () => { setForm({ ...emptyForm, createdBy: user.name }); setEditId(null); setShowForm(true); setRateMsg(""); setFormError(""); };
  const openEdit = (tr) => {
    // Casillas de ayudantes desde las líneas guardadas; un viaje sin ayudantes de la lista queda exactamente como estaba
    const usesList = linesUseList(tr.helpers);
    setForm({ ...tr, helperPayEach: tr.helperPayEach == null ? "" : tr.helperPayEach, driverPayOverride: tr.driverPayOverride == null ? "" : tr.driverPayOverride, helperIds: usesList ? (tr.helpers || []).map(h => (h?.ayudanteId != null ? Number(h.ayudanteId) : null)) : [],
      ...(usesList && !tr.helperNames ? { helperNames: (tr.helpers || []).map(h => (h?.ayudanteId != null ? h.name : "")) } : {}) });
    setEditId(tr.id); setShowForm(true); setRateMsg(""); setFormError("");
    if (needsRate(tr)) {
      const f = { ...tr, helperIds: usesList ? (tr.helpers || []).map(h => (h?.ayudanteId != null ? Number(h.ayudanteId) : null)) : [],
        ...(usesList && !tr.helperNames ? { helperNames: (tr.helpers || []).map(h => (h?.ayudanteId != null ? h.name : "")) } : {}) };
      tryApplyRate(f, null);
      setForm(f);
      if (!(Number(f.revenue) > 0)) setFormError("Este viaje se registró sin tarifa: agrégala en Clientes (y vuelve a abrirlo) o escribe el monto con «Custom».");
    }
  };

  const handleClientChange = (cid) => {
    const cl = clients.find(c => c.id === Number(cid));
    const f = { ...form, clientId: Number(cid) || "" };
    if (cl) {
      if (cl.rules?.requiresDocuments) f.docStatus = "pending";
      if (cl.rules?.defaultBrokerId) f.brokerId = cl.rules.defaultBrokerId;
      tryApplyRate(f, cl);
    }
    // Ayudantes según el cliente: si no lleva o los paga él → 0; al volver a un cliente normal, por defecto otra vez
    const prevCl = clients.find(c => c.id === Number(form.clientId));
    if (clientSkipsHelpers(cl)) f.numHelpers = 0;
    else if (clientSkipsHelpers(prevCl) && Number(form.numHelpers) === 0) f.numHelpers = null;
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
    // Tripulación fija del camión: sale puesta (se puede cambiar abajo)
    const crew = crewSlots(trucks.find(tk => tk.id === Number(tid)), ayudantes);
    if (crew.helperIds.length || (form.helperIds || []).some(Boolean)) { f.helperIds = crew.helperIds; f.helperNames = crew.helperNames; }
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
    const cancelled = data.status === "cancelled";
    setExpenses(prevExp => {
      let next = syncTripPayExpenses(prevExp, { trip: { ...data, id: tripId }, driver, truck });
      const upsert = (category, amount, description, extra) => {
        const existing = next.find(e => e.tripId === tripId && e.category === category);
        if (existing) {
          if (existing.status === "paid" && existing.amount !== amount) return; // ya pagado: no se toca
          next = amount > 0 ? next.map(e => e === existing ? { ...e, amount, description, date: data.date, ...extra } : e) : next.filter(e => e !== existing);
        } else if (amount > 0) {
          next = [...next, { id: nxId(next), tripId, date: data.date, category, amount, description, paymentMethod: "transfer", status: "pending", supplierId: null, ...extra }];
        }
      };
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
    const wantsCompanion = form.joint && !refCheck.linkWith && !form.jointWith && !cancelled;
    if (wantsCompanion) {
      if (!form.jointDriverId || !form.jointTruckId) { setFormError("Viaje conjunto: elige el chofer y el camión que van con él."); return; }
      if (Number(form.jointDriverId) === Number(form.driverId)) { setFormError("El compañero no puede ser el mismo chofer."); return; }
      if (Number(form.jointTruckId) === Number(form.truckId)) { setFormError("El camión del compañero debe ser distinto."); return; }
    }
    if (payPreview && payPreview.payType === "perTrip" && !payPreview.rateFound && !cancelled) {
      if (!window.confirm("El chofer no tiene tarifa para este destino: el viaje se guardará SIN pago de chofer. ¿Continuar?")) return;
    }
    const numHelpers = form.numHelpers === null || form.numHelpers === "" ? (payPreview?.numHelpers ?? 0) : Number(form.numHelpers);
    // Sin monto escrito: el tarifario del chofer decide (se guarda null, nunca se congela el 0 de "sin tarifa");
    // las líneas de ayudantes llevan el valor de hoy sólo como referencia.
    const helperOverride = form.helperPayEach !== "" && form.helperPayEach != null;
    const helperPayEach = helperOverride ? Number(form.helperPayEach) : (payPreview?.helperEach ?? 0);
    // Con ayudantes de la lista: líneas con su id (directo o por el chofer); sin ellos, exactamente como antes
    const usesList = (form.helperIds || []).slice(0, numHelpers).some(Boolean);
    const prevSaved = editId ? trips.find(tr => tr.id === editId) : null;
    // Candado: si ya se pagó algo de ayudantes en este viaje, no se puede pasar a (ni sacar de) la lista: movería dinero ya pagado
    if (prevSaved && tripHelpersPaid(expenses, editId) && (usesList || linesUseList(prevSaved.helpers))) {
      const money = (ls) => JSON.stringify((ls || []).map(l => [l.ayudanteId ?? null, !!l.direct, Number(l.pay) || 0])); // el nombre no mueve dinero
      const sameLines = money(buildHelperLines({ count: numHelpers, pay: helperPayEach, helperIds: form.helperIds, helperNames: form.helperNames, ayudantes, prevLines: prevSaved.helpers })) === money(prevSaved.helpers);
      if (!sameLines) { setFormError("Los ayudantes de este viaje ya se pagaron en Nómina: no se pueden cambiar. Desmarca ese pago en Nómina si hay que corregirlo."); return; }
    }
    const helpersArr = usesList
      ? buildHelperLines({ count: numHelpers, pay: helperPayEach, helperIds: form.helperIds, helperNames: form.helperNames, ayudantes, prevLines: prevSaved?.helpers })
      : Array.from({ length: numHelpers }, (_, i) => ({ name: (form.helperNames || []).slice(0, numHelpers)[i] || `Ayudante ${i + 1}`, pay: helperPayEach }));
    const helperNames = usesList ? helpersArr.map((h, i) => (form.helperIds?.[i] ? h.name : (form.helperNames?.[i] || ""))) : (form.helperNames || []).slice(0, numHelpers);
    const { helperIds: _hIds, ...formData } = form; // las casillas no se guardan: el viaje guarda sus líneas
    const data = { ...formData, truckId: Number(form.truckId), driverId: Number(form.driverId), clientId: Number(form.clientId) || null, brokerId: Number(form.brokerId) || null,
      odoStart: Number(form.odoStart) || null, odoEnd: Number(form.odoEnd) || null,
      weight: Number(form.weight) || 0, revenue: Number(form.revenue) || 0, numHelpers, helperPayEach: helperOverride ? helperPayEach : null, helperNames, helpers: helpersArr,
      driverPayOverride: form.driverPayOverride === "" || form.driverPayOverride == null ? null : Number(form.driverPayOverride),
      discounts: (form.discounts || []).filter(d => Number(d.amount) > 0).map(d => ({ ...d, who: d.who && d.who !== "driver" ? d.who : undefined })),
      jointDriverId: form.joint && form.jointDriverId ? Number(form.jointDriverId) : null, jointTruckId: form.joint && form.jointTruckId ? Number(form.jointTruckId) : null };
    // Viaje conjunto registrado aquí: se crea el viaje del compañero y sus gastos
    const makeCompanion = (saved, list) => {
      if (!wantsCompanion) return { saved, list };
      const built = buildCompanionTrip({ trip: saved, companionDriverId: saved.jointDriverId, companionTruckId: saved.jointTruckId, drivers, trucks, clients, ayudantes, nextTripId: nxId(list), nextExpenseId: nxId(expenses), createdBy: user?.name });
      if (!built) return { saved, list };
      if (built.revenueEstimated) window.alert(`El cliente no tiene tarifa para ese destino con el camión del compañero: se usó la misma tarifa (${fmt(saved.revenue)}). Ajústala en el viaje #${built.trip.id} si hace falta.`);
      if (built.expenses.length) setExpenses(prev => [...prev, ...built.expenses.map((e, i) => ({ ...e, id: nxId(prev) + i }))]);
      return { saved: { ...saved, jointWith: built.trip.id }, list: [...list, built.trip] };
    };
    if (editId) {
      const prevTrip = trips.find(tr => tr.id === editId);
      // Viaje conjunto: al cancelar uno, preguntar por la pareja
      let cancelPair = false;
      if (cancelled && prevTrip && prevTrip.status !== "cancelled") {
        const pairIds = jointIds(editId, trips).filter(id => id !== editId);
        if (pairIds.length && window.confirm(`Este viaje es conjunto con #${pairIds.join(", #")}. ¿Cancelar también la pareja?`)) cancelPair = true;
      }
      if (isLocked(editId) && prevTrip && (prevTrip.revenue !== data.revenue || prevTrip.clientId !== data.clientId || prevTrip.province !== data.province || prevTrip.municipality !== data.municipality)) {
        setFormError(`No se puede cambiar cliente, destino ni tarifa. ${lockReason(editId)}`); return;
      }
      const settled = prevTrip && settledReason(prevTrip);
      if (settled && (cancelled !== (prevTrip.status === "cancelled") || prevTrip.revenue !== data.revenue || prevTrip.truckId !== data.truckId || prevTrip.date !== data.date)) {
        setFormError(`No se puede cancelar ni cambiar monto, camión o fecha. ${settled}`); return;
      }
      let saved = { ...data, id: editId }, linked = null;
      if (refCheck.linkWith) { const l = linkJoint(saved, refCheck.linkWith); saved = l.trip; linked = l.other; }
      saved = stamp(saved, "editado");
      const pairIds = cancelPair ? jointIds(editId, trips).filter(id => id !== editId) : [];
      const c = makeCompanion(saved, trips.map(tr => tr.id === editId ? saved : (linked && tr.id === linked.id ? linked : (pairIds.includes(tr.id) ? stamp({ ...tr, status: "cancelled" }, "cancelado (pareja)") : tr))));
      const recvDate = data.docsReceivedAt && data.docsReceivedAt !== prevTrip?.docsReceivedAt && !(prevTrip && paidInPayroll(editId)) ? data.docsReceivedAt : null;
      setTrips(recvDate ? setReceivedDate(c.list.map(tr => tr.id === editId ? c.saved : tr), editId, recvDate, { docKeys: TRIP_DOCS.map(d => d.key), by: user?.name }) : c.list.map(tr => tr.id === editId ? c.saved : tr));
      syncTripExpenses(editId, data, prevTrip);
      pairIds.forEach(id => { const o = trips.find(x => x.id === id); if (o) syncTripExpenses(id, { ...o, status: "cancelled" }, o); });
    } else {
      const newId = nxId(trips);
      let saved = stamp({ ...data, id: newId }, "creado"), linked = null;
      if (refCheck.linkWith) { const l = linkJoint(saved, refCheck.linkWith); saved = l.trip; linked = l.other; }
      const c = makeCompanion(saved, [...trips.map(tr => linked && tr.id === linked.id ? linked : tr), saved]);
      setTrips(data.docsReceivedAt ? setReceivedDate(c.list.map(tr => tr.id === newId ? c.saved : tr), newId, data.docsReceivedAt, { docKeys: TRIP_DOCS.map(d => d.key), by: user?.name }) : c.list.map(tr => tr.id === newId ? c.saved : tr));
      syncTripExpenses(newId, data, null);
    }
    setShowForm(false);
  };

  const deleteTrip = (tr) => {
    if (isLocked(tr.id)) { window.alert(`No se puede eliminar. ${lockReason(tr.id)}`); return; }
    const settled = settledReason(tr);
    if (settled && tr.status !== "cancelled") { window.alert(`No se puede eliminar. ${settled}`); return; }
    const paid = expenses.filter(e => e.tripId === tr.id && e.status === "paid");
    const paidTotal = paid.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    if (!window.confirm(`¿Eliminar viaje del ${tr.date} a ${tr.municipality}?` + (paid.length ? `\n\nTiene ${paid.length} pago(s) ya hechos por ${fmt(paidTotal)}.` : "\nSe eliminarán también sus gastos pendientes."))) return;
    // Pagos ya hechos: el dinero ya salió. O se conservan como gasto suelto, o se borran (viaje por error).
    let keepPaid = false;
    if (paid.length) keepPaid = window.confirm(`¿Conservar esos ${paid.length} pago(s) como gastos sueltos (sin viaje)?\n\nAceptar = conservar (el dinero sí salió)\nCancelar = borrar todo, incluidos los pagos (el viaje fue un error)`);
    setTrips(trips.filter(x => x.id !== tr.id));
    setExpenses(expenses.flatMap(e => {
      if (e.tripId !== tr.id) return [e];
      if (e.status === "paid" && keepPaid) return [{ ...e, tripId: null, description: `(viaje eliminado ${tr.date} ${tr.municipality || ""}) ${e.description || ""}`.trim() }];
      return [];
    }));
  };

  // Documentos recibidos (misma lógica que el panel de Oficina)
  const setReceived = (tripId, value) => setTrips(prev => applyReceived(prev, tripId, value, { docKeys: TRIP_DOCS.map(d => d.key), today: today(), by: user?.name }));
  // ¿El pago de chofer de este viaje ya salió en una nómina? Entonces la fecha de recepción no se mueve (cambiaría la quincena pagada)
  const paidInPayroll = (tripId) => expenses.some(e => e.tripId === tripId && (e.category === "driverPay" || e.category === "helper") && e.status === "paid");
  const changeReceivedDate = (tripId, date) => {
    if (!date) return;
    if (paidInPayroll(tripId)) { window.alert("Este viaje ya se pagó en nómina con la fecha de recepción actual. Para moverlo de quincena, primero desmarca el pago en Nómina."); return; }
    setTrips(prev => setReceivedDate(prev, tripId, date, { docKeys: TRIP_DOCS.map(d => d.key), by: user?.name }));
  };

  const addExpense = () => {
    if (!expForm.amount || !expModal) return;
    const instant = ["cash", "credit_card"].includes(expForm.paymentMethod);
    setExpenses(prev => [...prev, { id: nxId(prev), tripId: expModal, date: expForm.date, category: expForm.category, amount: Number(expForm.amount), gallons: expForm.category === "fuel" ? (Number(expForm.gallons) || null) : null, paymentMethod: expForm.paymentMethod, description: expForm.description, supplierId: null, status: instant ? "paid" : "pending", ...(instant ? { paidDate: expForm.date } : {}) }]);
    setExpForm({ date: today(), category: "fuel", amount: "", gallons: "", paymentMethod: "cash", description: "" });
  };

  const addDiscountRow = () => setForm({ ...form, discounts: [...(form.discounts || []), { desc: "", amount: 0 }] });

  let filtered = [...trips];
  if (filterStatus !== "all") filtered = filtered.filter(tr => tr.status === filterStatus);
  if (filterClient !== "all") filtered = filtered.filter(tr => tr.clientId === Number(filterClient));
  if (filterDriver !== "all") filtered = filtered.filter(tr => tr.driverId === Number(filterDriver));
  if (filterTruck !== "all") filtered = filtered.filter(tr => tr.truckId === Number(filterTruck));
  const clientMap = new Map(clients.map(c => [c.id, c]));
  const driverMap = new Map(drivers.map(d => [d.id, d]));
  const truckMap  = new Map(trucks.map(tk => [tk.id, tk]));
  const TRIP_SORTS = [["date", "Fecha"], ["id", "# viaje"], ["invoiceRef", "Ref. factura"], ["client", "Cliente"], ["destination", "Destino"], ["driver", "Chofer"], ["truck", "Camión"], ["revenue", "Flete"], ["status", "Estado"], ["docsReceivedAt", "Docs recibidos"]].map(([key, label]) => ({ key, label }));
  const tripSortGetters = {
    client: tr => clientMap.get(tr.clientId)?.companyName, driver: tr => driverMap.get(tr.driverId)?.name, truck: tr => truckMap.get(tr.truckId)?.plate,
    destination: tr => `${tr.province || ""} ${tr.municipality || ""}`.trim(), revenue: tr => Number(tr.revenue) || 0, id: tr => Number(tr.id),
  };
  filtered = sortRecords(filtered, sort, tripSortGetters);
  const tripExpMap = expenses.reduce((m, e) => { if (e.tripId && !["adelanto_conductor", "adelanto_ayudante", "nominaTotalOverride", "partner_settlement"].includes(e.category)) m.set(e.tripId, (m.get(e.tripId) || 0) + e.amount); return m; }, new Map());
  if (filterExtra === "nodocs") filtered = filtered.filter(tr => tr.status !== "cancelled" && !docsComplete(tr, clientMap.get(tr.clientId)));
  if (filterExtra === "uninvoiced") filtered = filtered.filter(tr => tr.status !== "cancelled" && (tr.revenue || 0) > 0 && !invoicedTripMap.has(tr.id));
  if (filterExtra === "pending") filtered = filtered.filter(needsRate);
  const pendingCount = trips.filter(needsRate).length;
  // Margen por viaje: tarifa − chofer − ayudantes − gastos del viaje; en camión de socio, lo que le toca al socio
  const partnerMap = new Map(partners.map(p => [p.id, p]));
  const brokerMap = new Map((brokers || []).map(b => [b.id, b]));
  const marginOf = (tr) => {
    if (tr.status === "cancelled") return null;
    const tk = truckMap.get(tr.truckId); const revenue = Number(tr.revenue) || 0;
    const costs = tripExpMap.get(tr.id) || 0;
    const partner = tk?.partnerId ? partnerMap.get(tk.partnerId) : null;
    const pt = tripPassThrough({ trip: tr, truck: tk, partner, broker: tr.brokerId ? brokerMap.get(tr.brokerId) : null, brokerPassThrough: clientMap.get(tr.clientId)?.rules?.brokerPassThrough === true });
    const mine = revenue - pt.total;                     // ingreso real de la empresa
    const net = mine - costs;                             // lo que queda después de la operación pagada por la empresa
    return { revenue, costs, partnerPart: pt.partner, brokerPart: pt.broker, mine, net, pct: revenue > 0 ? net / revenue * 100 : 0, partner };
  };
  const summary = filtered.reduce((a, tr) => {
    const m = marginOf(tr); const cl = clientMap.get(tr.clientId);
    a.trips += 1; a.revenue += Number(tr.revenue) || 0;
    if (tr.status !== "cancelled") {
      if (invoicedTripMap.has(tr.id)) { a.invoiced += 1; a.invoicedAmt += Number(tr.revenue) || 0; } else if ((tr.revenue || 0) > 0) { a.uninvoiced += 1; a.uninvoicedAmt += Number(tr.revenue) || 0; }
      if (collectedTripIds.has(tr.id)) { a.collected += 1; a.collectedAmt += Number(tr.revenue) || 0; }
      if (!docsComplete(tr, cl)) a.nodocs += 1;
      if (m) { a.net += m.net; a.partner += m.partnerPart; }
    }
    return a;
  }, { trips: 0, revenue: 0, invoiced: 0, invoicedAmt: 0, uninvoiced: 0, uninvoicedAmt: 0, collected: 0, collectedAmt: 0, nodocs: 0, net: 0, partner: 0 });

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
      {["all", "pending", "delivered", "cancelled"].map(s => (
        <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${filterStatus === s ? colors.accent : colors.border}`, background: filterStatus === s ? colors.accent + "18" : "transparent", color: filterStatus === s ? colors.accentLight : colors.textMuted, cursor: "pointer", fontSize: 11 }}>
          {s === "all" ? t.all : s === "in_transit" ? t.inTransit : t[s]}
        </button>
      ))}
      <span style={{ width: 1, height: 22, background: colors.border }} />
      {[["all", "Todos"], ["nodocs", "Sin documentos"], ["uninvoiced", "Sin facturar"], ...(pendingCount > 0 || filterExtra === "pending" ? [["pending", `⚠ Por completar (${pendingCount})`]] : [])].map(([k, label]) => (
        <button key={k} onClick={() => setFilterExtra(k)} style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${filterExtra === k ? colors.orange : colors.border}`, background: filterExtra === k ? colors.orange + "18" : "transparent", color: filterExtra === k ? colors.orange : colors.textMuted, cursor: "pointer", fontSize: 11, fontWeight: filterExtra === k ? 700 : 400 }}>{label}</button>
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
      <SortBar options={TRIP_SORTS} value={sort} onChange={setSort} style={{ marginLeft: isMobile ? 0 : "auto" }} />
    </div>

    {/* Resumen del filtro activo */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(6, 1fr)", gap: 8, marginBottom: 14 }}>
      {[
        ["Viajes", summary.trips, fmt(summary.revenue), colors.text],
        ["Facturados", summary.invoiced, fmt(summary.invoicedAmt), colors.green],
        ["Cobrados", summary.collected, fmt(summary.collectedAmt), colors.cyan],
        ["Sin facturar", summary.uninvoiced, fmt(summary.uninvoicedAmt), colors.orange],
        ["Sin documentos", summary.nodocs, "no entran en nómina ni factura", colors.red],
        ["Margen", fmt(summary.net), summary.partner > 0 ? `socios ${fmt(summary.partner)}` : "tarifa − operación", summary.net >= 0 ? colors.green : colors.red],
      ].map(([k, v, sub, c]) => <div key={k} style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "8px 12px" }}>
        <div style={{ fontSize: 10, color: colors.textMuted, fontWeight: 700 }}>{k.toUpperCase()}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
        <div style={{ fontSize: 10, color: colors.textMuted }}>{sub}</div>
      </div>)}
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
            <option value="pending">{t.pending}</option>{form.status === "in_transit" && <option value="in_transit">{t.inTransit}</option>}<option value="delivered">{t.delivered}</option><option value="cancelled">{t.cancelled}</option>
          </Sel>
        </div>
        <DestinationSelect t={t} province={form.province} municipality={form.municipality} onProvinceChange={v => handleDestChange("province", v)} onMunicipalityChange={v => handleDestChange("municipality", v)} extra={(form.clientId ? clients.filter(c => c.id === Number(form.clientId)) : clients).flatMap(c => c.rates || [])} />
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
          <Inp label="Documentos recibidos el (quincena de nómina)" type="date" value={form.docsReceivedAt || ""} onChange={e => setForm({ ...form, docsReceivedAt: e.target.value || null })} disabled={!!editId && paidInPayroll(editId)} />
          <Inp label="Odómetro salida (km)" type="number" value={form.odoStart ?? ""} onChange={e => setForm({ ...form, odoStart: e.target.value })} />
          <Inp label={`Odómetro llegada (km)${Number(form.odoEnd) > Number(form.odoStart) && Number(form.odoStart) > 0 ? ` · ${Number(form.odoEnd) - Number(form.odoStart)} km` : ""}`} type="number" value={form.odoEnd ?? ""} onChange={e => setForm({ ...form, odoEnd: e.target.value })} />
          <Inp label={t.invoiceRef + (selectedClient?.rules?.requiresInvoiceRef ? " *" : "")} value={form.invoiceRef} onChange={e => setForm({ ...form, invoiceRef: e.target.value })} style={{ borderColor: selectedClient?.rules?.requiresInvoiceRef && !form.invoiceRef ? colors.red : colors.border }} />
        </div>
        {form.invoiceRef && (() => {
          const probe = { ...form, id: editId, clientId: Number(form.clientId), truckId: Number(form.truckId) };
          const others = sameRefTrips(probe, trips);
          return <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${others.length ? colors.orange + "80" : colors.border}`, background: others.length ? colors.orange + "0d" : "transparent", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="checkbox" checked={!!form.joint} onChange={e => setForm({ ...form, joint: e.target.checked })} /> Viaje conjunto (2 camiones para la misma factura)</label>
            {form.joint && others.length === 0 && !form.jointWith && <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", width: "100%" }}>
              <Sel label="Chofer que va con él" value={form.jointDriverId} onChange={e => { const d = drivers.find(x => x.id === Number(e.target.value)); setForm({ ...form, jointDriverId: e.target.value, jointTruckId: d?.truckId || form.jointTruckId || "" }); }}>
                <option value="">— elegir —</option>
                {drivers.filter(d => d.id !== Number(form.driverId) && d.status !== "inactive").map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Sel>
              <Sel label="Su camión" value={form.jointTruckId} onChange={e => setForm({ ...form, jointTruckId: e.target.value })}>
                <option value="">— elegir —</option>
                {trucks.filter(tk => tk.id !== Number(form.truckId)).map(tk => <option key={tk.id} value={tk.id}>{tk.plate} ({tk.size})</option>)}
              </Sel>
              <span style={{ fontSize: 11, color: colors.textMuted, maxWidth: 340 }}>Se crea el viaje del compañero con la misma referencia, la tarifa del cliente para su camión y su pago según su tarifario.</span>
            </div>}
            {form.jointWith && <span style={{ color: colors.purple, display: "flex", alignItems: "center", gap: 6 }}>Enlazado con el viaje #{form.jointWith}{form.jointAuto ? " (este se creó automáticamente)" : ""}.
              <button type="button" onClick={() => { const o = trips.find(x => x.id === form.jointWith); if (o) openEdit(o); }} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${colors.purple}60`, background: "transparent", color: colors.purple, cursor: "pointer", fontSize: 11 }}>Ir al viaje #{form.jointWith}</button></span>}
            {refInfo?.checking && <span style={{ color: colors.textMuted }}>Verificando referencia…</span>}
            {!refInfo?.checking && refInfo && !refInfo.found && !refInfo.offline && others.length === 0 && <span style={{ color: colors.green }}>Referencia disponible ✓</span>}
            {!refInfo?.checking && refInfo?.found && others.length === 0 && refInfo.found.id !== form.jointWith && <span style={{ color: colors.orange }}>El servidor ya tiene esta referencia en el viaje #{refInfo.found.id} ({refInfo.found.date}{refInfo.found.plate ? `, ${refInfo.found.plate}` : ""}{refInfo.found.driverName ? `, ${refInfo.found.driverName}` : ""}). Pulsa Sincronizar para traerlo.</span>}
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
            const sz = paySize(form, trucks.find(tk => tk.id === Number(form.truckId)));
            const n = form.numHelpers === null || form.numHelpers === "" ? (payPreview?.numHelpers ?? DEFAULT_HELPERS[sz]) : Number(form.numHelpers);
            return <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                <Sel label={`Ayudantes (por defecto ${DEFAULT_HELPERS[sz]} en ${sz})`} value={n} onChange={e => setForm({ ...form, numHelpers: Number(e.target.value) })}>
                  {[0,1,2,3,4,5].map(k => <option key={k} value={k}>{k === 0 ? "0 — sin ayudantes" : `${k} ayudante${k > 1 ? "s" : ""}`}</option>)}
                </Sel>
                <Inp label={`Pago chofer${payPreview && (form.driverPayOverride === "" || form.driverPayOverride == null) ? " (tarifario)" : " (fijado)"}`} type="number" placeholder={payPreview ? String(payPreview.base + payPreview.dieta) : "RD$"} value={form.driverPayOverride ?? ""} onChange={e => setForm({ ...form, driverPayOverride: e.target.value })} title="Déjalo vacío para usar el tarifario. Si escribes un monto, es chofer + su dieta." />
                {n > 0 && <Inp label={`Pago por ayudante${payPreview && form.helperPayEach === "" ? " (tarifario)" : ""}`} type="number" placeholder={payPreview ? String(payPreview.helperEach) : "RD$"} value={form.helperPayEach} onChange={e => setForm({ ...form, helperPayEach: e.target.value })} />}
              </div>
              {n > 0 && <HelperSlots n={n} helperIds={form.helperIds} helperNames={form.helperNames} ayudantes={ayudantes} prevLines={editId ? trips.find(tr => tr.id === editId)?.helpers : []} onChange={({ helperIds, helperNames }) => setForm({ ...form, helperIds, helperNames })} />}
              {editId && tripHelpersPaid(expenses, editId) && (linesUseList(trips.find(tr => tr.id === editId)?.helpers) || (form.helperIds || []).some(Boolean)) && <div style={{ marginTop: 6, fontSize: 11, color: colors.orange }}>🔒 Los ayudantes de este viaje ya se pagaron en Nómina: no se pueden cambiar (desmarca ese pago primero si hay que corregirlo).</div>}
              {clientHelpersMode(selectedClient) !== "normal" && <div style={{ marginTop: 6, fontSize: 11, color: colors.cyan }}>{clientHelpersMode(selectedClient) === "none" ? "Este cliente no lleva ayudantes" : "A los ayudantes de este cliente los paga el cliente"}: el viaje sale con 0 ayudantes a tu cargo. Si en este viaje sí van por tu cuenta, cambia la cantidad arriba.</div>}
              {payPreview && <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, fontSize: 12, background: payPreview.rateFound ? colors.green + "10" : colors.orange + "12", border: `1px solid ${payPreview.rateFound ? colors.green : colors.orange}40` }}>
                {payPreview.partnerDriver
                  ? <span style={{ color: colors.cyan }}>Socio-chofer: este viaje no genera nómina (ni chofer ni ayudantes). La empresa cobra su comisión en la liquidación del socio.</span>
                  : payPreview.payType === "perTrip" && !payPreview.rateFound
                  ? <span style={{ color: colors.orange }}>⚠️ El chofer no tiene tarifa para este destino{payPreview.sheetName ? ` en el tarifario «${payPreview.sheetName}»` : ""}. Agrégala en Choferes.</span>
                  : <span>
                      <b>Chofer</b> {payPreview.driverFixed ? <span style={{ color: PURPLE_T }}>fijado {fmt(payPreview.driverGross)}</span> : fmt(payPreview.base)}{payPreview.dieta && !payPreview.driverFixed ? ` + dieta ${fmt(payPreview.dieta)}${payPreview.dietaEach ? ` (su parte de ${fmt(payPreview.dietaTotal)})` : ""}` : ""}{payPreview.sizeFallback ? ` (tarifa ${payPreview.size === "T2" ? "T1" : "T2"}: el destino no tiene ${payPreview.size})` : ""}{payPreview.discounts ? ` − desc. ${fmt(payPreview.discounts)}` : ""} = <b>{fmt(payPreview.driverNet)}</b>
                      {payPreview.numHelpers > 0 && <> · <b>Ayudantes</b> {payPreview.numHelpers} × {fmt(payPreview.helperEach)}{payPreview.dietaEach && form.helperPayEach === "" ? ` (incl. dieta ${fmt(payPreview.dietaEach)})` : ""}{payPreview.helperDiscounts ? ` − desc. ${fmt(payPreview.helperDiscounts)}` : ""} = <b>{fmt(payPreview.helpersTotal)}</b>{(() => { const dn = (form.helperIds || []).slice(0, payPreview.numHelpers).some(Boolean) ? buildHelperLines({ count: payPreview.numHelpers, pay: payPreview.helperEach, helperIds: form.helperIds, helperNames: form.helperNames, ayudantes, prevLines: editId ? trips.find(tr => tr.id === editId)?.helpers : [] }).filter(isDirectLine).length : 0; return dn > 0 ? <span style={{ color: colors.cyan }}> ({dn} directo{dn > 1 ? "s" : ""}: {fmt(dn * payPreview.helperEach)} no van al chofer)</span> : null; })()}</>}
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
              <select value={d.who || "driver"} onChange={e => { const ds = [...form.discounts]; ds[i] = { ...d, who: e.target.value }; setForm({ ...form, discounts: ds }); }} title="¿A quién se le descuenta?" style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 5, color: colors.text, padding: "4px 6px", fontSize: 11 }}>
                <option value="driver">Chofer</option>
                {Array.from({ length: Number(form.numHelpers ?? payPreview?.numHelpers ?? 0) || 0 }, (_, k) => <option key={k} value={`helper:${k}`}>{(form.helperNames || [])[k] ? `Ayud. ${(form.helperNames || [])[k]}` : `Ayudante ${k + 1}`}</option>)}
              </select>
              <Inp type="number" placeholder="$" value={d.amount} onChange={e => { const ds = [...form.discounts]; ds[i] = { ...d, amount: Number(e.target.value) }; setForm({ ...form, discounts: ds }); }} style={{ width: 80, fontSize: 11 }} />
              <button onClick={() => setForm({ ...form, discounts: form.discounts.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}><X size={12} /></button>
            </div>
          ))}
        </div>
        {formError && <div style={{ color: colors.red, fontSize: 12, marginTop: 8, padding: "6px 10px", background: colors.red + "12", borderRadius: 6, border: `1px solid ${colors.red}33` }}>{formError}</div>}
        {editId && (form.createdBy || form.updatedBy) && <div style={{ fontSize: 10, color: colors.textMuted, margin: "8px 0" }}>
          Creado por {form.createdBy || "—"}{form.createdAt ? ` el ${form.createdAt.slice(0, 16).replace("T", " ")}` : ""}{form.updatedBy ? ` · última edición: ${form.updatedBy} el ${(form.updatedAt || "").slice(0, 16).replace("T", " ")}` : ""}{(form.history || []).length > 2 ? ` · ${form.history.length} cambios` : ""}
        </div>}
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
          {expForm.category === "fuel" && <Inp label="Galones (para km/gal)" type="number" value={expForm.gallons ?? ""} onChange={e => setExpForm({ ...expForm, gallons: e.target.value })} />}
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
                    {needsRate(tr) ? <span data-trip-pending={tr.id} style={{ fontSize: 11, fontWeight: 700, color: colors.orange, background: colors.orange + "18", padding: "2px 8px", borderRadius: 8 }}>⚠ falta tarifa</span> : <div style={{ fontSize: 16, fontWeight: 800, color: colors.green }}>{fmt(tr.revenue)}</div>}
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
                <Th align="center">{t.expenses}</Th><Th align="right">{t.rate}</Th><Th align="right">Margen</Th><Th align="right">{t.actions}</Th>
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
                    <Td bold>{cl?.companyName || "—"}{tr.invoiceRef && <><br /><span style={{ fontSize: 9, color: colors.textMuted }}>#{tr.invoiceRef}</span></>}{tr.joint && <><br /><span style={{ fontSize: 9, color: colors.purple, fontWeight: 700 }}>⛓ conjunto{tr.jointWith ? ` con #${tr.jointWith}` : ""}{tr.jointAuto ? " · creado automáticamente" : ""}</span></>}</Td>
                    <Td><span title={`Creado por ${tr.createdBy || "—"}${tr.createdAt ? " el " + tr.createdAt.slice(0, 16).replace("T", " ") : ""}${tr.updatedBy ? `\nÚltima edición: ${tr.updatedBy} el ${(tr.updatedAt || "").slice(0, 16).replace("T", " ")}` : ""}`} style={{ fontSize: 11, color: colors.textMuted, cursor: "help" }}>{tr.createdBy}{tr.updatedBy && <span style={{ color: colors.accent }}> ✎</span>}</span></Td>
                    <Td>{dk?.name || "—"}</Td>
                    <Td>{tk?.plate || "—"}</Td>
                    <Td align="center">
                      <button onClick={() => generateConduce(tr, cl, tk, dk)} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${colors.cyan}40`, background: colors.cyan + "10", color: colors.cyan, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
                        <Printer size={10} /> PDF
                      </button>
                    </Td>
                    <Td align="center">
                      {(() => { const ok = docsComplete(tr, cl); return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <button onClick={() => setReceived(tr.id, !ok)} title={ok ? `Recibido el ${tr.docsReceivedAt || "—"}${tr.docsReceivedBy ? ` por ${tr.docsReceivedBy}` : ""} · se paga en la quincena de esa fecha` : "Documentos físicos pendientes (no entra en nómina). Clic = recibido hoy; luego puedes cambiar la fecha."}
                          style={{ padding: "3px 8px", borderRadius: 10, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", background: ok ? colors.green + "18" : colors.orange + "18", color: ok ? colors.green : colors.orange }}>
                          {ok ? "Recibido" : "Pendiente"}
                        </button>
                        {ok && <input type="date" value={tr.docsReceivedAt || ""} onChange={e => changeReceivedDate(tr.id, e.target.value)} title="Fecha en que llegaron los documentos (decide la quincena de nómina)" disabled={paidInPayroll(tr.id)}
                          style={{ fontSize: 10, padding: "1px 4px", borderRadius: 5, border: `1px solid ${colors.border}`, background: colors.inputBg, color: paidInPayroll(tr.id) ? colors.textMuted : colors.text, width: 112 }} />}
                      </div>; })()}
                    </Td>
                    <Td align="center">
                      <button onClick={() => setExpModal(tr.id)} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${colors.orange}40`, background: colors.orange + "10", color: colors.orange, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
                        <Receipt size={10} /> {fmt(tripExp)}
                      </button>
                    </Td>
                    <Td align="right" bold color={colors.green}>
                      {needsRate(tr) ? <span data-trip-pending={tr.id} style={{ fontSize: 10, fontWeight: 700, color: colors.orange, background: colors.orange + "18", padding: "2px 7px", borderRadius: 8, whiteSpace: "nowrap" }}>⚠ falta tarifa</span> : fmt(tr.revenue)}
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
                      {(() => { const m = marginOf(tr); if (!m) return <span style={{ color: colors.textMuted }}>—</span>;
                        const c = m.net < 0 ? colors.red : m.pct < 15 ? colors.orange : colors.green;
                        return <div title={`Tarifa ${fmt(m.revenue)} − operación ${fmt(m.costs)}${m.partnerPart ? ` − socio ${fmt(m.partnerPart)}` : ""}${m.brokerPart ? ` − broker ${fmt(m.brokerPart)}` : ""}`} style={{ cursor: "help" }}>
                          <div style={{ fontWeight: 700, color: c }}>{fmt(m.net)}</div>
                          <div style={{ fontSize: 9, color: colors.textMuted }}>{m.pct.toFixed(0)} %{m.partner ? ` · socio ${fmt(m.partnerPart)}` : ""}</div>
                        </div>; })()}
                    </Td>
                    <Td align="right">
                      <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                        <button onClick={() => openEdit(tr)} title={t.edit || "Editar"} style={{ padding: "10px", borderRadius: 5, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={12} /></button>
                        <button onClick={() => deleteTrip(tr)} title={isLocked(tr.id) ? lockReason(tr.id) : "Eliminar"} style={{ opacity: isLocked(tr.id) ? 0.35 : 1, padding: "10px", borderRadius: 5, border: "none", background: "transparent", color: colors.red, cursor: "pointer", minHeight: 44, minWidth: 44, display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={12} /></button>
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

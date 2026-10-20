import { useState, useMemo, useEffect, useCallback } from "react";
import { Plus, X, Pencil, Trash2, Landmark, ChevronDown, ChevronRight, Receipt, Clock, CheckCircle2, Truck, HandCoins, Camera, AlertTriangle } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, nxId, expenseTruckId, getSupplierDueDate, today } from "../utils/helpers.js";
import { normalizePartner, expenseChargedToPartner, PARTNER_MODELS } from "../utils/partnerModels.js";
import { fuelNeedsTruck } from "../utils/costPerKm.js";
import { activeAyudantes } from "../utils/ayudantes.js";
import { getAccounts, activeAccounts, expenseAccountId } from "../utils/bankAccounts.js";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, PAID_ON_ENTRY_METHODS } from "../constants/categories.js";
import SortBar from "../components/SortBar.jsx";
import { sortRecords, DEFAULT_SORT } from "../utils/sortList.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, StatCard, Th, Td, Chk } from "../components/ui/index.jsx";
import { receiptToExpenseForm, receiptDuplicates } from "../utils/receipts.js";
import { listReceipts, rejectReceipt, approveReceipt, notifyReceiptsChanged } from "../utils/receiptsApi.js";
import ReceiptPhoto from "../components/ReceiptPhoto.jsx";
import ReceiptCapture from "../components/ReceiptCapture.jsx";
import { fuelGallons, fuelPriceAt, fuelLabel } from "../utils/fuel.js";
import WhatsAppButton from "../components/WhatsAppButton.jsx";

const RC_CAT = { fuel: "Combustible", toll: "Peaje", tire: "Gomas", repair: "Reparación", maintenance: "Mantenimiento", other: "Otro" };
const RC_FIELD = { category: "tipo", amount: "monto", currency: "moneda", date: "fecha", vendor: "negocio", gallons: "galones", ncf: "NCF" };

// Métodos que se pagan en el momento: el gasto nace como pagado
const INSTANT_METHODS = PAID_ON_ENTRY_METHODS;
// Clave de quincena de liquidación de socio (misma que usa Liquidaciones)
const settlementKey = (partnerId, date) => `${partnerId}-${(date || "").slice(0, 7)}-${parseInt((date || "").slice(8, 10) || "0", 10) <= 15 ? 1 : 2}`;

// Categories where a direct truck link makes sense
const TRUCK_CATEGORIES = ["fuel", "repair", "maintenance", "insurance", "tire", "loan", "other", "toll", "salary"];

export default function ExpensesPage({ t, expenses, setExpenses, trips, trucks, clients, suppliers, drivers, partners = [], settlementStatus = {}, fixedTemplates, setFixedTemplates, ayudantes = [], isMobile, bankAccount = null, pfSettings = null }) {
  const bankAccounts = useMemo(() => getAccounts(bankAccount, today()), [bankAccount]);

  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTruck, setFilterTruck] = useState("all");
  const [sort, setSort] = useState(DEFAULT_SORT); // por defecto: fecha, más reciente primero
  const [filterPartner, setFilterPartner] = useState(false); // solo gastos reembolsables por socios
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [form, setForm] = useState({ date: today(), category: "fuel", amount: "", paymentMethod: "cash", description: "", tripId: "", truckId: null, supplierId: null, status: "pending", driverId: null });
  const [tplForm, setTplForm] = useState({ name: "", category: "loan", amount: "", paymentMethod: "transfer", truckId: null });

  // ── Recibos por foto que mandan los choferes (por revisar) ──
  const [receipts, setReceipts] = useState([]);
  const [rcError, setRcError] = useState("");
  const [rejecting, setRejecting] = useState(null); // { id, reason }
  const [photoId, setPhotoId] = useState(null);     // foto de un gasto aprobado
  const [showCapture, setShowCapture] = useState(false);
  const [lastRejected, setLastRejected] = useState(null); // { r, reason } para avisarle al chofer
  const loadReceipts = useCallback(() => { listReceipts().then(r => { setReceipts(r.receipts || []); setRcError(""); }).catch(e => setRcError(e.message)); }, []);
  useEffect(() => {
    loadReceipts(); window.addEventListener("blogix:receipts-changed", loadReceipts);
    const iv = setInterval(loadReceipts, 60000); // otro usuario pudo aprobar o el chofer pudo borrar
    return () => { window.removeEventListener("blogix:receipts-changed", loadReceipts); clearInterval(iv); };
  }, [loadReceipts]);
  const approvedReceiptIds = useMemo(() => new Set((expenses || []).filter(e => e.receiptId).map(e => Number(e.receiptId))), [expenses]);
  const pendingReceipts = receipts.filter(r => r.status === "pending" && !approvedReceiptIds.has(r.id));
  const reviewing = form.receiptId ? receipts.find(r => r.id === form.receiptId) || null : null;
  const driverNameOf = (r) => (drivers || []).find(d => d.id === r.driverId)?.name || r.createdByName || "Oficina";
  const openReview = (r) => {
    setForm({ date: today(), category: "fuel", amount: "", paymentMethod: "cash", description: "", tripId: "", truckId: null, supplierId: null, status: "pending", driverId: null, ...receiptToExpenseForm(r, { suppliers, driverName: driverNameOf(r) }) });
    setEditId(null); setShowForm(true);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* */ }
  };
  const doReject = async () => {
    if (!rejecting?.reason?.trim()) { window.alert("Escribe el motivo para que el chofer sepa qué corregir."); return; }
    try {
      await rejectReceipt(rejecting.id, rejecting.reason.trim());
      setLastRejected({ r: receipts.find(x => x.id === rejecting.id), reason: rejecting.reason.trim() });
      setRejecting(null); notifyReceiptsChanged();
    } catch (e) { window.alert(e.message); }
  };

  const tripMap = useMemo(() => new Map((trips||[]).map(tr => [tr.id, tr])), [trips]);
  const truckMap = useMemo(() => new Map((trucks||[]).map(tk => [tk.id, tk])), [trucks]);
  const partnerMap = useMemo(() => new Map((partners||[]).map(p => [p.id, normalizePartner(p)])), [partners]);

  // Socio dueño del camión de un gasto (directo o vía viaje), o null si es camión propio
  const partnerOfExpense = (e) => {
    const tid = expenseTruckId(e, tripMap);
    const tk = tid ? truckMap.get(tid) : null;
    return tk?.partnerId ? partnerMap.get(tk.partnerId) || null : null;
  };
  // ¿Este gasto se le descuenta al socio en su liquidación (reembolso a la empresa)?
  const isChargedToPartner = (e) => {
    if (["driverPay", "nominaTotalOverride", "adelanto_conductor", "adelanto_ayudante", "broker_commission", "partner_settlement", "cash_withdrawal", "reserve_withdrawal"].includes(e.category)) return false;
    const p = partnerOfExpense(e);
    return !!p && expenseChargedToPartner(e, p);
  };
  // En los tres modelos la empresa paga el gasto y se lo reembolsa del ingreso del camión en la liquidación
  const isReimbursable = (e) => isChargedToPartner(e);
  const isSettled = (e) => { const p = partnerOfExpense(e); return !!p && settlementStatus[settlementKey(p.id, e.date)] === "paid"; };

  // Exclude nominaTotalOverride from Gastos — it's an internal NominaPage marker, not a payable expense
  const visibleExp   = expenses.filter(e => e.category !== "nominaTotalOverride");
  const byCategory = EXPENSE_CATEGORIES.map(c => ({ cat: c, label: t[c] || c, total: visibleExp.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const total        = visibleExp.reduce((s, e) => s + e.amount, 0);
  const pendingTotal = visibleExp.filter(e => !e.status || e.status === "pending").reduce((s, e) => s + e.amount, 0);
  const paidTotal    = visibleExp.filter(e => e.status === "paid").reduce((s, e) => s + e.amount, 0);
  const reimbursable = visibleExp.filter(isReimbursable);
  const reimbPending = reimbursable.filter(e => !isSettled(e)).reduce((s, e) => s + e.amount, 0);

  let filtered = filterCat === "all" ? visibleExp : visibleExp.filter(e => e.category === filterCat);
  if (filterStatus !== "all") filtered = filtered.filter(e => filterStatus === "pending" ? (!e.status || e.status === "pending") : e.status === filterStatus);
  if (filterTruck !== "all") filtered = filtered.filter(e => expenseTruckId(e, tripMap) === Number(filterTruck));
  if (filterPartner) filtered = filtered.filter(isReimbursable);
  const EXPENSE_SORTS = [["date", "Fecha"], ["id", "# gasto"], ["category", "Categoría"], ["amount", "Monto"], ["truck", "Camión"], ["tripId", "# viaje"], ["supplier", "Suplidor"], ["status", "Estado"], ["dueDate", "Vence"]].map(([key, label]) => ({ key, label }));
  const expenseSortGetters = {
    id: e => Number(e.id), amount: e => Number(e.amount) || 0, category: e => t[e.category] || e.category, tripId: e => e.tripId ? Number(e.tripId) : null,
    truck: e => { const id = expenseTruckId(e, tripMap); return id ? (trucks || []).find(tk => tk.id === id)?.plate : null; },
    supplier: e => e.supplierId ? (suppliers || []).find(s => s.id === e.supplierId)?.name : null, status: e => e.status || "pending",
  };
  filtered = sortRecords(filtered, sort, expenseSortGetters);

  // Socio del camión elegido en el formulario (para la casilla «cargar al socio»)
  const formTruckId = form.truckId || (form.tripId ? tripMap.get(Number(form.tripId))?.truckId : null);
  const formPartner = formTruckId ? (truckMap.get(Number(formTruckId))?.partnerId ? partnerMap.get(truckMap.get(Number(formTruckId)).partnerId) : null) : null;
  const formCharge = formPartner ? expenseChargedToPartner(form, formPartner) : false;

  const openNew = () => { setForm({ date: today(), category: "fuel", amount: "", paymentMethod: "cash", description: "", tripId: "", truckId: null, supplierId: null, status: "pending", driverId: null }); setEditId(null); setShowForm(true); };
  const openEdit = (e) => {
    if (isSettled(e)) { window.alert("Este gasto ya se descontó en una liquidación transferida al socio. Para cambiarlo, desmarca esa liquidación primero."); return; } setForm({ ...e, amount: String(e.amount), tripId: e.tripId ? String(e.tripId) : "", truckId: e.truckId || null, supplierId: e.supplierId || null }); setEditId(e.id); setShowForm(true); };
  const AUTO = ["driverPay", "helper", "partner_settlement", "nominaTotalOverride"];
  const deleteExpense = (id) => {
    const e = expenses.find(x => x.id === id); if (!e) return;
    if (e.status === "paid") { window.alert("Este gasto ya está PAGADO: eliminarlo borraría dinero que salió. Si fue un error, desmárcalo como pagado primero o registra un ajuste."); return; }
    if (AUTO.includes(e.category)) { window.alert("Este gasto lo genera la app (nómina, ayudantes o liquidación). Cambia el viaje o la nómina en su página; no se borra a mano."); return; }
    if (isSettled(e)) { window.alert("Este gasto ya se descontó en una liquidación transferida al socio. Desmarca esa liquidación primero."); return; }
    if (!window.confirm("¿Eliminar este gasto?")) return; setExpenses(prev => prev.filter(x => x.id !== id));
  };

  const save = () => {
    if (!form.amount || !form.date) return;
    if (form.category === "adelanto_conductor" && !form.driverId) { alert("Selecciona el conductor para el adelanto."); return; }
    if (form.category === "adelanto_ayudante" && !form.ayudanteId) { alert("Selecciona el ayudante para el adelanto."); return; }
    if (fuelNeedsTruck(form)) { alert("Selecciona el camión (o el viaje) de este combustible. Sin camión no cuenta en el costo por km."); return; }
    if (form.receiptId && editId === null && expenses.some(e => Number(e.receiptId) === Number(form.receiptId))) { alert("Este recibo ya se aprobó (ya tiene su gasto)."); setShowForm(false); return; }
    if (form.receiptId && editId === null && form.receiptCurrency && !window.confirm(`El recibo está en ${form.receiptCurrency}. ¿El monto (${form.amount}) ya está convertido a pesos (RD$)?`)) return;
    if (form.receiptId && editId === null) {
      // La liquidación del socio cuenta un gasto con viaje en la quincena del VIAJE; sin viaje, en la de su fecha
      const trip = form.tripId ? tripMap.get(Number(form.tripId)) : null;
      const probe = { ...form, tripId: trip ? trip.id : null, truckId: form.truckId ? Number(form.truckId) : null, date: trip ? trip.date : form.date };
      if (isSettled(probe)) {
        alert(trip
          ? `El viaje #${trip.id} (${trip.date}) es de una quincena que ya se le liquidó al socio de ese camión. Quita el viaje (queda solo el camión y cuenta en la quincena de la fecha del recibo) o desmarca esa liquidación primero.`
          : "La fecha de este recibo cae en una liquidación que ya se le transfirió al socio de ese camión. Cambia la fecha a la quincena actual (así se le descuenta en la próxima) o desmarca esa liquidación primero.");
        return;
      }
    }
    const instant = INSTANT_METHODS.includes(form.paymentMethod);
    const status = form.category === "adelanto_conductor" || form.category === "adelanto_ayudante" || instant ? "paid" : form.status;
    const supplierId = form.supplierId ? Number(form.supplierId) : null;
    const sup = supplierId ? (suppliers || []).find(s => s.id === supplierId) : null;
    const dueDate = getSupplierDueDate(form.date, sup);
    const data = { ...form, amount: Number(form.amount), gallons: form.category === "fuel" ? fuelGallons({ amount: form.amount, gallons: form.gallons, pricePerGallon: fuelPriceAt(pfSettings, form.date) }).gallons : null, tripId: form.tripId ? Number(form.tripId) : null, truckId: form.truckId ? Number(form.truckId) : null, driverId: form.driverId || null, supplierId, dueDate, status,
      ...(status === "paid" && !form.paidDate ? { paidDate: form.date } : {}) };
    // La casilla solo tiene sentido en camiones de socios; en los demás se limpia
    if (formPartner) data.chargeToPartner = formCharge; else delete data.chargeToPartner;
    if (editId !== null) {
      setExpenses(prev => prev.map(e => e.id === editId ? { ...e, ...data } : e));
    } else {
      setExpenses(prev => [...prev, { id: nxId(prev), ...data }]);
      if (data.receiptId) approveReceipt(data.receiptId, nxId(expenses)).catch(() => {}).finally(notifyReceiptsChanged);
    }
    setShowForm(false); setEditId(null);
  };

  const togglePaid = (id) => setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: e.status === "paid" ? "pending" : "paid", paidDate: e.status === "paid" ? null : today() } : e));

  const saveTpl = () => {
    if (!tplForm.name || !tplForm.amount) return;
    setFixedTemplates(prev => [...prev, { id: nxId(prev), ...tplForm, amount: Number(tplForm.amount), truckId: tplForm.truckId || null }]);
    setTplForm({ name: "", category: "loan", amount: "", paymentMethod: "transfer", truckId: null });
  };

  // Genera los gastos fijos del mes UNA sola vez: cada gasto lleva templateId + mes (YYYY-MM);
  // si ya existe para ese mes, se salta (así «Generar este mes» no duplica).
  const genFromTemplates = () => {
    const todayStr = today(); const month = todayStr.slice(0, 7);
    const have = new Set(expenses.filter(e => e.templateId && e.templateMonth).map(e => `${e.templateId}|${e.templateMonth}`));
    const pending = (fixedTemplates || []).filter(tpl => !have.has(`${tpl.id}|${month}`));
    const skipped = (fixedTemplates || []).length - pending.length;
    if (pending.length === 0) { window.alert(`Los gastos fijos de ${month} ya están generados (${skipped}).`); return; }
    if (!window.confirm(`Generar ${pending.length} gasto(s) fijo(s) de ${month}` + (skipped ? ` (${skipped} ya existían y se omiten)` : "") + "?")) return;
    const newExps = pending.map(tpl => ({ id: null, date: todayStr, category: tpl.category, amount: tpl.amount, paymentMethod: tpl.paymentMethod, description: tpl.name, tripId: null, truckId: tpl.truckId || null, supplierId: null, status: "pending", templateId: tpl.id, templateMonth: month }));
    setExpenses(prev => { let next = [...prev]; newExps.forEach(e => next.push({ ...e, id: nxId(next) })); return next; });
  };

  // When a trip is selected, auto-fill truck from that trip
  const handleTripChange = (val) => {
    const tr = (trips||[]).find(t => t.id === Number(val));
    setForm(prev => ({ ...prev, tripId: val, truckId: tr?.truckId || prev.truckId }));
  };

  return <div>
    <PageHeader title={t.expenses} action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Btn variant="ghost" onClick={() => setShowCapture(true)}><Camera size={14} /> Subir foto</Btn><Btn onClick={openNew}><Plus size={14} /> {t.addExpense}</Btn></div>} />
    {showCapture && <ReceiptCapture trucks={(trucks || []).filter(tk => tk.status !== "inactive")} trips={trips || []} fuelSettings={pfSettings} onClose={() => setShowCapture(false)} onSubmitted={() => loadReceipts()} />}
    {photoId && <div onClick={() => setPhotoId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}><div onClick={e => e.stopPropagation()}><ReceiptPhoto id={photoId} height={Math.min(600, Math.round(window.innerHeight * 0.8))} /></div></div>}

    {/* Recibos por foto por revisar */}
    {lastRejected?.r && (() => { const r = lastRejected.r, f = r.fields || {}, drv = (drivers || []).find(d => d.id === r.driverId);
      return <Card style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12 }}>Recibo de <b>{driverNameOf(r)}</b> rechazado: {lastRejected.reason}</span>
        {drv && <WhatsAppButton phone={drv.phone} name={drv.name} template="recibo_rechazado" label={`Avisarle a ${drv.name}`} testId="reject"
          data={{ name: drv.name, category: (RC_CAT[f.category] || "gasto").toLowerCase(), amount: f.amount, date: f.date, reason: lastRejected.reason }} />}
        <button onClick={() => setLastRejected(null)} aria-label="Cerrar" style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", marginLeft: "auto" }}><X size={14} /></button>
      </Card>; })()}
    {(pendingReceipts.length > 0 || rcError) && <Card style={{ marginBottom: 16, border: `1px solid ${colors.orange}55` }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}><Camera size={15} color={colors.orange} /> Recibos por revisar <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 400 }}>({pendingReceipts.length}) · al aprobar se crea el gasto con su foto</span></h3>
      {rcError && <div style={{ fontSize: 12, color: colors.red, marginBottom: 6 }}>No se pudieron cargar los recibos: {rcError}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-review-list>
        {pendingReceipts.map(r => {
          const f = r.fields || {};
          const dups = receiptDuplicates(r, { receipts, expenses });
          const tk = (trucks || []).find(x => x.id === f.truckId);
          const flags = [
            ...dups.map(d => ["⚠ " + d, colors.red]),
            ...(r.changes || []).map(c => [`El chofer cambió ${RC_FIELD[c.field] || c.field}: ${c.read} → ${c.sent ?? "—"}`, colors.orange]),
            ...(r.ai?.failed ? [["Sin lectura automática (falló): compara con la foto", colors.orange]] : !r.read ? [["Sin lectura automática: compara con la foto", colors.textMuted]] : []),
            ...(r.photoMetrics?.sharpness && r.photoMetrics.sharpness < 90 ? [["Foto algo borrosa", colors.textMuted]] : []),
            ...(f.currency && f.currency !== "DOP" ? [[`⚠ Recibo en ${f.currency}: convierte el monto a RD$ al aprobar`, colors.red]] : []),
          ];
          return <div key={r.id} data-review-row={r.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 10, borderRadius: 8, background: colors.inputBg, border: `1px solid ${colors.border}`, flexWrap: isMobile ? "wrap" : "nowrap" }}>
            <ReceiptPhoto id={r.id} height={84} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>{fmt(f.amount)}</span>
                <Badge label={RC_CAT[f.category] || f.category} color={colors.accent} />
                <span style={{ fontSize: 11, color: colors.textMuted }}>{f.date} · {driverNameOf(r)}{tk ? ` · ${tk.plate}` : ""}{f.tripId ? ` · viaje #${f.tripId}` : ""}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 2 }}>{f.vendor}{f.gallons ? ` · ${f.gallons} gal` : ""}{f.ncf ? ` · NCF ${f.ncf}` : ""}{f.note ? ` — ${f.note}` : ""}</div>
              {flags.map(([txt, c]) => <div key={txt} style={{ fontSize: 11, color: c, marginTop: 2 }}>{txt}</div>)}
              {rejecting?.id === r.id && <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <input autoFocus value={rejecting.reason} onChange={e => setRejecting({ ...rejecting, reason: e.target.value })} placeholder="Motivo (lo verá el chofer)" data-reject-reason style={{ flex: 1, minWidth: 160, padding: "8px 10px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.card, color: colors.text, fontSize: 14 }} />
                <Btn variant="danger" onClick={doReject} data-reject-confirm>Rechazar</Btn>
                <Btn variant="ghost" onClick={() => setRejecting(null)}>Cancelar</Btn>
              </div>}
            </div>
            {rejecting?.id !== r.id && <div style={{ display: "flex", gap: 6, flexDirection: isMobile ? "row" : "column" }}>
              <Btn variant="success" onClick={() => openReview(r)} data-review-approve>Revisar y aprobar</Btn>
              <Btn variant="ghost" onClick={() => setRejecting({ id: r.id, reason: "" })} data-review-reject>Rechazar</Btn>
            </div>}
          </div>;
        })}
      </div>
    </Card>}

    {/* New expense form */}
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{editId !== null ? "Editar Gasto" : t.addExpense}</h3>
        <button onClick={() => { setShowForm(false); setEditId(null); }} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer" }}><X size={16} /></button>
      </div>
      {form.receiptId && <div style={{ display: "flex", gap: 12, marginBottom: 12, padding: 10, borderRadius: 8, background: colors.orange + "0d", border: `1px solid ${colors.orange}40`, flexWrap: "wrap" }} data-review-panel>
        <ReceiptPhoto id={form.receiptId} height={220} />
        <div style={{ flex: 1, minWidth: 200, fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: colors.orange, marginBottom: 4 }}>Recibo de {reviewing ? driverNameOf(reviewing) : "chofer"} — revisa contra la foto y guarda para aprobar</div>
          {form.vendorName && <div>Negocio: <b>{form.vendorName}</b>{form.rnc ? ` · RNC ${form.rnc}` : ""}</div>}
          {form.ncf && <div>NCF: <b>{form.ncf}</b>{form.itbis ? ` · ITBIS ${fmt(form.itbis)}` : ""}</div>}
          {(reviewing?.changes || []).map(c => <div key={c.field} style={{ color: colors.orange }}>El chofer cambió {RC_FIELD[c.field] || c.field}: {String(c.read)} → {String(c.sent ?? "—")}</div>)}
          {reviewing && receiptDuplicates(reviewing, { receipts, expenses }).map(d => <div key={d} style={{ color: colors.red, display: "flex", gap: 4, alignItems: "center" }}><AlertTriangle size={12} /> {d}</div>)}
          {form.receiptCurrency && <div style={{ color: colors.red, fontWeight: 700 }}>⚠ Recibo en {form.receiptCurrency}: escribe el monto convertido a RD$ antes de guardar.</div>}
          <div style={{ color: colors.textMuted, marginTop: 4 }}>Pagado con dinero de la empresa (efectivo). Si fue a crédito en la bomba, cambia el método (queda pendiente) y el suplidor.</div>
        </div>
      </div>}
      {form.category === "adelanto_ayudante" && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: colors.orange + "12", border: `1px solid ${colors.orange}40`, borderRadius: 8, fontSize: 12, color: colors.orange, fontWeight: 600 }}>
          💵 Adelanto al Ayudante — se registra como pagado y se descuenta de su pago en la nómina de ayudantes del corte correspondiente.
        </div>
      )}
      {form.category === "adelanto_conductor" && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: colors.orange + "12", border: `1px solid ${colors.orange}40`, borderRadius: 8, fontSize: 12, color: colors.orange, fontWeight: 600 }}>
          💵 Adelanto al Conductor — se registra como pagado y se descuenta automáticamente de su nómina en el corte correspondiente.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 10 }}>
        <Inp label={t.expenseDate} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        <Sel label={t.expenseCategory} value={form.category} onChange={e => {
          const cat = e.target.value;
          setForm({ ...form, category: cat, status: cat === "adelanto_conductor" || cat === "adelanto_ayudante" ? "paid" : form.status, driverId: cat === "adelanto_conductor" ? form.driverId : null, ...(cat !== "adelanto_ayudante" && form.category === "adelanto_ayudante" ? { ayudanteId: null } : {}) });
        }}>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{t[c] || c}</option>)}
        </Sel>
        <Inp label={t.expenseAmount} type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
        {form.category === "fuel" && <Inp label={fuelLabel({ amount: form.amount, gallons: form.gallons, date: form.date, settings: pfSettings })} type="number" value={form.gallons ?? ""} onChange={e => setForm({ ...form, gallons: e.target.value })} placeholder={fuelPriceAt(pfSettings, form.date) ? "automático" : ""} data-fuel-gallons />}
        <Sel label={t.paymentMethod} value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value, ...(form.receiptId && !INSTANT_METHODS.includes(e.target.value) ? { status: "pending" } : {}) })}>
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t[m] || m}</option>)}
        </Sel>
        {(() => { const auto = expenseAccountId({ ...form, accountId: null, status: "paid", amount: 1 }, bankAccounts);
          return <Sel label="Sale de la cuenta" value={form.accountId || ""} onChange={e => setForm({ ...form, accountId: e.target.value || null })} data-expense-account>
            <option value="">Automático ({auto ? bankAccounts.find(a => a.id === auto)?.name : form.paymentMethod === "credit_card" ? "ninguna: crea una cuenta Tarjeta en Banco" : form.paymentMethod === "cash" ? "ninguna: no hay Caja activa" : "ninguna"})</option>
            {activeAccounts(bankAccounts).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Sel>; })()}
        {form.category === "adelanto_ayudante"
          ? <Sel label="Ayudante *" value={form.ayudanteId || ""} onChange={e => setForm({ ...form, ayudanteId: Number(e.target.value) || null })}>
              <option value="">— Seleccionar ayudante —</option>
              {activeAyudantes(ayudantes).filter(a => a.payMode === "direct" || a.id === Number(form.ayudanteId)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Sel>
          : form.category === "adelanto_conductor"
          ? <Sel label="Conductor *" value={form.driverId || ""} onChange={e => setForm({ ...form, driverId: Number(e.target.value) || null })}>
              <option value="">— Seleccionar chofer —</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Sel>
          : INSTANT_METHODS.includes(form.paymentMethod)
          ? <Sel label="Estado" value="paid" disabled title="Con efectivo, transferencia, cheque o tarjeta el dinero ya salió: queda pagado y sale de su cuenta en Banco"><option value="paid">Pagado (el dinero ya salió)</option></Sel>
          : <Sel label="Estado" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="pending">Pendiente</option>
              <option value="paid">Pagado</option>
            </Sel>
        }
        <Sel label="Viaje (opcional)" value={form.tripId} onChange={e => handleTripChange(e.target.value)}>
          <option value="">— Sin viaje —</option>
          {(trips||[]).slice().reverse().map(tr => {
            const dk = drivers.find(d => d.id === tr.driverId);
            return <option key={tr.id} value={tr.id}>#{tr.id} {tr.municipality} {dk ? `· ${dk.name}` : ""}</option>;
          })}
        </Sel>
        {TRUCK_CATEGORIES.includes(form.category) && (
          <Sel label={form.category === "fuel" ? "Camión *" : "Camión (opcional)"} value={form.truckId || ""} onChange={e => setForm({ ...form, truckId: Number(e.target.value) || null })}>
            <option value="">— Sin camión —</option>
            {(trucks||[]).map(tk => <option key={tk.id} value={tk.id}>{tk.plate} ({tk.type})</option>)}
          </Sel>
        )}
        <Inp label={t.expenseDesc} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={form.category === "adelanto_conductor" ? "Ej: Dieta + ayudantes Dajabón" : ""} />
      </div>

      {/* Cargar al socio (camión de socio) */}
      {formPartner && form.category !== "adelanto_conductor" && form.category !== "adelanto_ayudante" && (() => {
        const m = PARTNER_MODELS[formPartner.model] || PARTNER_MODELS.profit_share;
        return <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: formCharge ? colors.orange + "12" : colors.inputBg, border: `1px solid ${formCharge ? colors.orange + "55" : colors.border}` }}>
          <Chk label={`Reembolsar de la liquidación de ${formPartner.name} (modelo: ${m.label})`} checked={formCharge} onChange={() => setForm({ ...form, chargeToPartner: !formCharge })} />
          <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 4, marginLeft: 22 }}>
            {formPartner.model === "profit_share"
              ? (formCharge
                  ? `Lo paga la empresa y se reembolsa primero del ingreso del camión; el beneficio que queda se reparte ${formPartner.partnerSharePct}/${100 - formPartner.partnerSharePct}.`
                  : "Desmarcado: lo absorbe la empresa al 100% y no se descuenta antes del reparto.")
              : formCharge
                ? `Lo paga la empresa y se descuenta en la liquidación de ${formPartner.name}: es un reembolso, no un gasto tuyo.`
                : formPartner.model === "commission"
                  ? "En «solo comisión» el socio corre con sus gastos; márcalo solo si pagaste algo por él y quieres descontárselo."
                  : "Este gasto lo absorbe la empresa; no se le descuenta al socio."}
          </div>
        </div>;
      })()}

      {/* Supplier row — always visible, full width */}
      {form.category !== "adelanto_conductor" && form.category !== "adelanto_ayudante" && (() => {
        const selSup = (suppliers||[]).find(s => s.id === Number(form.supplierId));
        const dueDate = getSupplierDueDate(form.date, selSup);
        const isCutoff = selSup?.billingCycle === "cutoff_period";
        const isCredit = selSup?.paymentCondition === "credit" && selSup?.creditDays > 0;
        return (
          <div style={{ marginBottom: 10 }}>
            <Sel label="Suplidor" value={form.supplierId || ""} onChange={e => setForm({ ...form, supplierId: Number(e.target.value) || null })}>
              <option value="">— Sin suplidor —</option>
              {(suppliers||[]).map(s => {
                const tag = s.paymentCondition === "credit"
                  ? (s.billingCycle === "cutoff_period" ? ` · Corte ${s.period1CutDay||15}d · ${s.creditDays}d` : ` · ${s.creditDays}d crédito`)
                  : " · Contado";
                return <option key={s.id} value={s.id}>{s.name}{tag}</option>;
              })}
            </Sel>
            {isCredit && dueDate && (
              <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 8, background: isCutoff ? colors.accent + "14" : colors.green + "12", border: `1px solid ${isCutoff ? colors.accent : colors.green}30`, fontSize: 11, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, color: isCutoff ? colors.accent : colors.green }}>
                  {isCutoff ? "Corte quincenal" : `Crédito ${selSup.creditDays}d`}
                </span>
                <span style={{ color: colors.textMuted }}>·</span>
                <span style={{ color: colors.textMuted }}>
                  {isCutoff
                    ? `Q1: días 1–${selSup.period1CutDay||15}, Q2: días ${(selSup.period1CutDay||15)+1}–fin de mes`
                    : `Fecha de factura + ${selSup.creditDays} días`}
                </span>
                <span style={{ color: colors.textMuted }}>·</span>
                <span style={{ fontWeight: 700, color: colors.orange }}>Vence: {dueDate}</span>
              </div>
            )}
          </div>
        );
      })()}

      {form.truckId && form.tripId && (() => {
        const tr = (trips||[]).find(t => t.id === Number(form.tripId));
        return tr?.truckId !== form.truckId ? (
          <div style={{ marginBottom: 8, padding: "6px 10px", background: colors.orange + "12", border: `1px solid ${colors.orange}30`, borderRadius: 6, fontSize: 11, color: colors.orange }}>
            ⚠️ El camión seleccionado difiere del camión del viaje #{form.tripId}
          </div>
        ) : (
          <div style={{ marginBottom: 8, padding: "6px 10px", background: colors.green + "10", border: `1px solid ${colors.green}30`, borderRadius: 6, fontSize: 11, color: colors.green }}>
            ✓ Camión auto-enlazado desde el viaje
          </div>
        );
      })()}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}

    {/* Fixed templates section */}
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setShowTemplates(!showTemplates)}>
        <h3 style={{ margin: 0, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Landmark size={14} color={colors.accent} /> Gastos Fijos Recurrentes <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 400 }}>({(fixedTemplates||[]).length} plantillas)</span></h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {(fixedTemplates||[]).length > 0 && <button onClick={e => { e.stopPropagation(); genFromTemplates(); }} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: colors.accent, color: "white", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>⚡ Generar este mes</button>}
          {showTemplates ? <ChevronDown size={14} color={colors.textMuted}/> : <ChevronRight size={14} color={colors.textMuted}/>}
        </div>
      </div>
      {showTemplates && <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {(fixedTemplates||[]).map(tpl => {
            const tk = (trucks||[]).find(x => x.id === tpl.truckId);
            return <div key={tpl.id} style={{ display: "flex", alignItems: "center", gap: 6, background: colors.inputBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>{tpl.name}</span>
              <span style={{ color: colors.orange }}>{fmt(tpl.amount)}</span>
              <span style={{ color: colors.textMuted, fontSize: 10 }}>{t[tpl.category] || tpl.category}</span>
              {tk && <span style={{ display: "flex", alignItems: "center", gap: 3, color: colors.accent, fontSize: 10 }}><Truck size={9}/>{tk.plate}</span>}
              <button onClick={() => setFixedTemplates(prev => prev.filter(x => x.id !== tpl.id))} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer", padding: 0 }}><X size={10}/></button>
            </div>;
          })}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Inp label="Nombre" value={tplForm.name} onChange={e => setTplForm({...tplForm, name: e.target.value})} style={{ width: 160 }} />
          <Sel label="Categoría" value={tplForm.category} onChange={e => setTplForm({...tplForm, category: e.target.value})} style={{ width: 140 }}>
            {["loan","insurance","salary","maintenance","other","fuel","repair","tire"].map(c => <option key={c} value={c}>{t[c]||c}</option>)}
          </Sel>
          <Inp label="Monto" type="number" value={tplForm.amount} onChange={e => setTplForm({...tplForm, amount: e.target.value})} style={{ width: 100 }} />
          <Sel label="Método" value={tplForm.paymentMethod} onChange={e => setTplForm({...tplForm, paymentMethod: e.target.value})} style={{ width: 120 }}>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t[m]||m}</option>)}
          </Sel>
          <Sel label="Camión" value={tplForm.truckId || ""} onChange={e => setTplForm({...tplForm, truckId: Number(e.target.value) || null})} style={{ width: 120 }}>
            <option value="">— Todos —</option>
            {(trucks||[]).map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}
          </Sel>
          <Btn onClick={saveTpl} style={{ marginBottom: 2 }}><Plus size={12}/> Agregar</Btn>
        </div>
      </div>}
    </Card>

    {/* Summary stats */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
      <StatCard icon={Receipt} label={t.totalExpenses} value={fmt(total)} color={colors.red} />
      <StatCard icon={Clock} label="Pendiente de Pago" value={fmt(pendingTotal)} color={colors.orange} />
      <StatCard icon={CheckCircle2} label="Pagado" value={fmt(paidTotal)} color={colors.green} />
      <StatCard icon={HandCoins} label="Por reembolsar de socios" value={fmt(reimbPending)} color={colors.purple} />
    </div>

    {/* Filters */}
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={() => setFilterCat("all")} style={{ padding: "4px 12px", borderRadius: 14, border: `1px solid ${filterCat==="all" ? colors.accent : colors.border}`, background: filterCat==="all" ? colors.accent+"18" : "transparent", color: filterCat==="all" ? colors.accentLight : colors.textMuted, cursor: "pointer", fontSize: 11 }}>{t.all} ({fmt(total)})</button>
        {byCategory.map(c => <button key={c.cat} onClick={() => setFilterCat(c.cat)} style={{ padding: "4px 12px", borderRadius: 14, border: `1px solid ${filterCat===c.cat ? colors.accent : colors.border}`, background: filterCat===c.cat ? colors.accent+"18" : "transparent", color: filterCat===c.cat ? colors.accentLight : colors.textMuted, cursor: "pointer", fontSize: 11 }}>{c.label} ({fmt(c.total)})</button>)}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {["all","pending","paid"].map(s => <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "3px 10px", borderRadius: 12, border: `1px solid ${filterStatus===s ? colors.orange : colors.border}`, background: filterStatus===s ? colors.orange+"18" : "transparent", color: filterStatus===s ? colors.orange : colors.textMuted, cursor: "pointer", fontSize: 10 }}>{s==="all"?"Todos":s==="pending"?"Pendientes":"Pagados"}</button>)}
        <button onClick={() => setFilterPartner(v => !v)} style={{ padding: "3px 10px", borderRadius: 12, border: `1px solid ${filterPartner ? colors.purple : colors.border}`, background: filterPartner ? colors.purple+"18" : "transparent", color: filterPartner ? colors.purple : colors.textMuted, cursor: "pointer", fontSize: 10 }}>Reembolsables por socios ({reimbursable.length})</button>
        <select value={filterTruck} onChange={e => setFilterTruck(e.target.value)} style={{ marginLeft: 6, fontSize: 11, padding: "3px 8px", borderRadius: 8, border: `1px solid ${filterTruck !== "all" ? colors.accent : colors.border}`, background: colors.inputBg, color: filterTruck !== "all" ? colors.accent : colors.textMuted, cursor: "pointer" }}>
          <option value="all">Todos los camiones</option>
          {(trucks||[]).map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}
        </select>
        <SortBar options={EXPENSE_SORTS} value={sort} onChange={setSort} style={{ marginLeft: isMobile ? 0 : "auto" }} />
      </div>
    </Card>

    <Card>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            <Th>{t.date}</Th>
            <Th>{t.expenseCategory}</Th>
            <Th>{t.expenseDesc}</Th>
            <Th style={{ display: isMobile ? "none" : undefined }}>{t.paymentMethod}</Th>
            <Th>Viaje</Th>
            <Th style={{ display: isMobile ? "none" : undefined }}>Camión</Th>
            <Th>Socio</Th>
            <Th align="right">Estado</Th>
            <Th align="right">{t.expenseAmount}</Th>
            <Th></Th>
          </tr></thead>
          <tbody>{filtered.map(e => {
            const isPaid = e.status === "paid";
            const resolvedTruckId = expenseTruckId(e, tripMap);
            const tk = resolvedTruckId ? (trucks||[]).find(x => x.id === resolvedTruckId) : null;
            return <tr key={e.id} style={{ borderBottom: `1px solid ${colors.border}11`, opacity: isPaid ? 0.7 : 1 }}>
              <Td>{e.date||"—"}</Td>
              <Td><Badge label={t[e.category]||e.category} color={colors.textMuted}/></Td>
              <Td>{e.receiptId ? <button onClick={() => setPhotoId(e.receiptId)} title="Ver foto del recibo" data-expense-photo={e.id} style={{ background: "none", border: "none", color: colors.orange, cursor: "pointer", padding: "0 4px 0 0", verticalAlign: "middle" }}><Camera size={13} /></button> : null}{e.description}</Td>
              <Td style={{ display: isMobile ? "none" : undefined }}><Badge label={t[e.paymentMethod]||e.paymentMethod} color={e.paymentMethod==="credit" ? colors.red : colors.green}/></Td>
              <Td>{e.tripId ? `#${e.tripId}` : "—"}</Td>
              <Td style={{ display: isMobile ? "none" : undefined }}>
                {tk
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: colors.accent }}>
                      <Truck size={11}/> {tk.plate}
                      {!e.truckId && e.tripId && <span style={{ fontSize: 9, color: colors.textMuted }}>(viaje)</span>}
                    </span>
                  : <span style={{ color: colors.textMuted, fontSize: 11 }}>—</span>}
              </Td>
              <Td>{(() => {
                const p = partnerOfExpense(e);
                if (!p) return <span style={{ color: colors.textMuted, fontSize: 11 }}>—</span>;
                if (!isChargedToPartner(e)) return <span style={{ fontSize: 10, color: colors.textMuted }} title={`Camión de ${p.name}, lo absorbe la empresa`}>Empresa</span>;
                const settled = isSettled(e);
                return <span title={settled ? "Ya descontado en la liquidación" : "Pendiente de descontar en la liquidación"} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: settled ? colors.green : colors.purple }}><HandCoins size={10} /> {p.name.split(" ")[0]}{settled ? " ✓" : ""}</span>;
              })()}</Td>
              <Td align="right">
                <button onClick={() => togglePaid(e.id)} title={isPaid ? "Marcar pendiente" : "Marcar pagado"} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, border: `1px solid ${isPaid ? colors.green : colors.orange}`, background: isPaid ? colors.green+"18" : colors.orange+"18", color: isPaid ? colors.green : colors.orange, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
                  {isPaid ? <><CheckCircle2 size={10}/> Pagado</> : <><Clock size={10}/> Pendiente</>}
                </button>
              </Td>
              <Td align="right" bold color={isPaid ? colors.green : colors.red}>{fmt(e.amount)}</Td>
              <Td align="right">
                <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <button onClick={() => openEdit(e)} title="Editar" style={{ background: "none", border: "none", color: colors.accent, cursor: "pointer", padding: 3 }}><Pencil size={13}/></button>
                  <button onClick={() => deleteExpense(e.id)} title="Eliminar" style={{ background: "none", border: "none", color: colors.red, cursor: "pointer", padding: 3 }}><Trash2 size={13}/></button>
                </div>
              </Td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {filtered.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>Sin gastos para este filtro.</div>}
    </Card>
  </div>;
}

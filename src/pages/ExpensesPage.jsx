import { useState } from "react";
import { Plus, X, Pencil, Trash2, Landmark, ChevronDown, ChevronRight, Receipt, Clock, CheckCircle2 } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, nxId } from "../utils/helpers.js";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "../constants/categories.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, StatCard, Th, Td } from "../components/ui/index.jsx";

export default function ExpensesPage({ t, expenses, setExpenses, trips, trucks, clients, suppliers, drivers, fixedTemplates, setFixedTemplates }) {
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), category: "fuel", amount: "", paymentMethod: "cash", description: "", tripId: "", status: "pending", driverId: null });
  const [tplForm, setTplForm] = useState({ name: "", category: "loan", amount: "", paymentMethod: "transfer" });

  const byCategory = EXPENSE_CATEGORIES.map(c => ({ cat: c, label: t[c] || c, total: expenses.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const total        = expenses.reduce((s, e) => s + e.amount, 0);
  const pendingTotal = expenses.filter(e => !e.status || e.status === "pending").reduce((s, e) => s + e.amount, 0);
  const paidTotal    = expenses.filter(e => e.status === "paid").reduce((s, e) => s + e.amount, 0);

  let filtered = filterCat === "all" ? expenses : expenses.filter(e => e.category === filterCat);
  if (filterStatus !== "all") filtered = filtered.filter(e => filterStatus === "pending" ? (!e.status || e.status === "pending") : e.status === filterStatus);

  const openNew = () => { setForm({ date: new Date().toISOString().slice(0,10), category: "fuel", amount: "", paymentMethod: "cash", description: "", tripId: "", status: "pending", driverId: null }); setEditId(null); setShowForm(true); };
  const openEdit = (e) => { setForm({ ...e, amount: String(e.amount), tripId: e.tripId ? String(e.tripId) : "" }); setEditId(e.id); setShowForm(true); };
  const deleteExpense = (id) => { if (!window.confirm("¿Eliminar este gasto?")) return; setExpenses(prev => prev.filter(e => e.id !== id)); };
  const save = () => {
    if (!form.amount || !form.date) return;
    if (form.category === "adelanto_conductor" && !form.driverId) { alert("Selecciona el conductor para el adelanto."); return; }
    const status = form.category === "adelanto_conductor" ? "paid" : form.status;
    const data = { ...form, amount: Number(form.amount), tripId: form.tripId ? Number(form.tripId) : null, driverId: form.driverId || null, status };
    if (editId !== null) {
      setExpenses(prev => prev.map(e => e.id === editId ? { ...e, ...data } : e));
    } else {
      setExpenses(prev => [...prev, { id: nxId(prev), ...data }]);
    }
    setShowForm(false); setEditId(null);
  };
  const togglePaid = (id) => setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: e.status === "paid" ? "pending" : "paid", paidDate: e.status === "paid" ? null : new Date().toISOString().slice(0,10) } : e));

  const saveTpl = () => { if (!tplForm.name || !tplForm.amount) return; setFixedTemplates(prev => [...prev, { id: nxId(prev), ...tplForm, amount: Number(tplForm.amount) }]); setTplForm({ name: "", category: "loan", amount: "", paymentMethod: "transfer" }); };
  const genFromTemplates = () => {
    const today = new Date().toISOString().slice(0,10);
    const newExps = (fixedTemplates || []).map(tpl => ({ id: null, date: today, category: tpl.category, amount: tpl.amount, paymentMethod: tpl.paymentMethod, description: tpl.name, tripId: null, supplierId: null, status: "pending" }));
    if (newExps.length === 0) return;
    setExpenses(prev => { let next = [...prev]; newExps.forEach(e => next.push({ ...e, id: nxId(next) })); return next; });
  };

  return <div>
    <PageHeader title={t.expenses} action={<Btn onClick={openNew}><Plus size={14} /> {t.addExpense}</Btn>} />

    {/* New expense form */}
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{editId !== null ? "Editar Gasto" : t.addExpense}</h3>
        <button onClick={() => { setShowForm(false); setEditId(null); }} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer" }}><X size={16} /></button>
      </div>
      {/* Adelanto banner */}
      {form.category === "adelanto_conductor" && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: colors.orange + "12", border: `1px solid ${colors.orange}40`, borderRadius: 8, fontSize: 12, color: colors.orange, fontWeight: 600 }}>
          💵 Adelanto al Conductor — se registra como pagado y se descuenta automáticamente de su nómina en el corte correspondiente.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 10 }}>
        <Inp label={t.expenseDate} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        <Sel label={t.expenseCategory} value={form.category} onChange={e => {
          const cat = e.target.value;
          setForm({ ...form, category: cat, status: cat === "adelanto_conductor" ? "paid" : form.status, driverId: cat === "adelanto_conductor" ? form.driverId : null });
        }}>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{t[c] || c}</option>)}
        </Sel>
        <Inp label={t.expenseAmount} type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
        <Sel label={t.paymentMethod} value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t[m] || m}</option>)}
        </Sel>
        {form.category === "adelanto_conductor"
          ? <Sel label="Conductor *" value={form.driverId || ""} onChange={e => setForm({ ...form, driverId: Number(e.target.value) || null })}>
              <option value="">— Seleccionar chofer —</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Sel>
          : <Sel label="Estado" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="pending">Pendiente</option>
              <option value="paid">Pagado</option>
            </Sel>
        }
        <Sel label="Viaje (opcional)" value={form.tripId} onChange={e => setForm({ ...form, tripId: e.target.value })}>
          <option value="">— Sin viaje —</option>
          {trips.slice().reverse().map(tr => {
            const dk = drivers.find(d => d.id === tr.driverId);
            return <option key={tr.id} value={tr.id}>#{tr.id} {tr.municipality} {dk ? `· ${dk.name}` : ""}</option>;
          })}
        </Sel>
        <Inp label={t.expenseDesc} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={form.category === "adelanto_conductor" ? "Ej: Dieta + ayudantes Dajabón" : ""} />
      </div>
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
          {(fixedTemplates||[]).map(tpl => <div key={tpl.id} style={{ display: "flex", alignItems: "center", gap: 6, background: colors.inputBg, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>{tpl.name}</span>
            <span style={{ color: colors.orange }}>{fmt(tpl.amount)}</span>
            <span style={{ color: colors.textMuted, fontSize: 10 }}>{t[tpl.category] || tpl.category}</span>
            <button onClick={() => setFixedTemplates(prev => prev.filter(x => x.id !== tpl.id))} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer", padding: 0 }}><X size={10}/></button>
          </div>)}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Inp label="Nombre" value={tplForm.name} onChange={e => setTplForm({...tplForm, name: e.target.value})} style={{ width: 160 }} />
          <Sel label="Categoría" value={tplForm.category} onChange={e => setTplForm({...tplForm, category: e.target.value})} style={{ width: 140 }}>
            {["loan","insurance","salary","maintenance","other"].map(c => <option key={c} value={c}>{t[c]||c}</option>)}
          </Sel>
          <Inp label="Monto" type="number" value={tplForm.amount} onChange={e => setTplForm({...tplForm, amount: e.target.value})} style={{ width: 100 }} />
          <Sel label="Método" value={tplForm.paymentMethod} onChange={e => setTplForm({...tplForm, paymentMethod: e.target.value})} style={{ width: 120 }}>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t[m]||m}</option>)}
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
    </div>

    {/* Filters */}
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={() => setFilterCat("all")} style={{ padding: "4px 12px", borderRadius: 14, border: `1px solid ${filterCat==="all" ? colors.accent : colors.border}`, background: filterCat==="all" ? colors.accent+"18" : "transparent", color: filterCat==="all" ? colors.accentLight : colors.textMuted, cursor: "pointer", fontSize: 11 }}>{t.all} ({fmt(total)})</button>
        {byCategory.map(c => <button key={c.cat} onClick={() => setFilterCat(c.cat)} style={{ padding: "4px 12px", borderRadius: 14, border: `1px solid ${filterCat===c.cat ? colors.accent : colors.border}`, background: filterCat===c.cat ? colors.accent+"18" : "transparent", color: filterCat===c.cat ? colors.accentLight : colors.textMuted, cursor: "pointer", fontSize: 11 }}>{c.label} ({fmt(c.total)})</button>)}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {["all","pending","paid"].map(s => <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "3px 10px", borderRadius: 12, border: `1px solid ${filterStatus===s ? colors.orange : colors.border}`, background: filterStatus===s ? colors.orange+"18" : "transparent", color: filterStatus===s ? colors.orange : colors.textMuted, cursor: "pointer", fontSize: 10 }}>{s==="all"?"Todos":s==="pending"?"Pendientes":"Pagados"}</button>)}
      </div>
    </Card>

    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>{t.date}</Th><Th>{t.expenseCategory}</Th><Th>{t.expenseDesc}</Th><Th>{t.paymentMethod}</Th><Th>Viaje</Th><Th align="right">Estado</Th><Th align="right">{t.expenseAmount}</Th><Th></Th>
        </tr></thead>
        <tbody>{filtered.sort((a, b) => (b.date||"").localeCompare(a.date||"")).map(e => {
          const isPaid = e.status === "paid";
          return <tr key={e.id} style={{ borderBottom: `1px solid ${colors.border}11`, opacity: isPaid ? 0.7 : 1 }}>
            <Td>{e.date||"—"}</Td>
            <Td><Badge label={t[e.category]||e.category} color={colors.textMuted}/></Td>
            <Td>{e.description}</Td>
            <Td><Badge label={t[e.paymentMethod]||e.paymentMethod} color={e.paymentMethod==="credit" ? colors.red : colors.green}/></Td>
            <Td>{e.tripId ? `#${e.tripId}` : "—"}</Td>
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
      {filtered.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>Sin gastos para este filtro.</div>}
    </Card>
  </div>;
}

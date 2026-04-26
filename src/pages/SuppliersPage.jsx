import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { colors } from "../constants/theme.js";
import { nxId } from "../utils/helpers.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td } from "../components/ui/index.jsx";

export default function SuppliersPage({ t, suppliers, setSuppliers, isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", contactPerson: "", phone: "", email: "", paymentCondition: "cash", creditDays: 0, notes: "" });

  const openNew = () => { setForm({ name: "", contactPerson: "", phone: "", email: "", paymentCondition: "cash", creditDays: 0, notes: "" }); setEditId(null); setShowForm(true); };
  const openEdit = (s) => { setForm({ ...s }); setEditId(s.id); setShowForm(true); };
  const save = () => {
    if (!form.name) return;
    const d = { ...form, creditDays: Number(form.creditDays) || 0 };
    if (editId) setSuppliers(suppliers.map(s => s.id === editId ? { ...d, id: editId } : s));
    else setSuppliers([...suppliers, { ...d, id: nxId(suppliers) }]);
    setShowForm(false);
  };

  return <div>
    <PageHeader title={t.suppliers} action={<Btn onClick={openNew}><Plus size={14} /> {t.addSupplier}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.supplierName} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Inp label={t.contactPerson} value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} />
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.email} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Sel label={t.paymentCondition} value={form.paymentCondition} onChange={e => setForm({ ...form, paymentCondition: e.target.value })}>
          <option value="cash">{t.cash}</option>
          <option value="credit">{t.credit}</option>
        </Sel>
        {form.paymentCondition === "credit" && <Inp label={t.creditDays} type="number" value={form.creditDays} onChange={e => setForm({ ...form, creditDays: e.target.value })} />}
      </div>
      <Inp label={t.notes} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: "100%", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>{t.supplierName}</Th><Th>{t.contactPerson}</Th><Th>{t.phone}</Th><Th>{t.paymentCondition}</Th><Th>{t.creditDays}</Th><Th align="right">{t.actions}</Th>
        </tr></thead>
        <tbody>{suppliers.map(s => <tr key={s.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td bold>{s.name}</Td><Td>{s.contactPerson}</Td><Td>{s.phone}</Td>
          <Td><Badge label={s.paymentCondition === "credit" ? t.credit : t.cash} color={s.paymentCondition === "credit" ? colors.orange : colors.green} /></Td>
          <Td>{s.paymentCondition === "credit" ? `${s.creditDays}d` : "—"}</Td>
          <Td align="right">
            <button onClick={() => openEdit(s)} style={{ padding: "8px 10px", border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
            <button onClick={() => setSuppliers(suppliers.filter(x => x.id !== s.id))} style={{ padding: "8px 10px", border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
          </Td>
        </tr>)}</tbody>
      </table>
      </div>
      {suppliers.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noSuppliers}</div>}
    </Card>
  </div>;
}

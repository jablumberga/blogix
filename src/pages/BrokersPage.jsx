import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { colors } from "../constants/theme.js";
import { nxId } from "../utils/helpers.js";
import { Card, PageHeader, Inp, Btn, Badge, Th, Td } from "../components/ui/index.jsx";

export default function BrokersPage({ t, brokers, setBrokers }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", contactPerson: "", phone: "", email: "", commissionPct: "", notes: "" });

  const openNew = () => { setForm({ name: "", contactPerson: "", phone: "", email: "", commissionPct: "", notes: "" }); setEditId(null); setShowForm(true); };
  const openEdit = (b) => { setForm({ ...b }); setEditId(b.id); setShowForm(true); };
  const save = () => {
    if (!form.name) return;
    const d = { ...form, commissionPct: Number(form.commissionPct) || 0 };
    if (editId) setBrokers(brokers.map(b => b.id === editId ? { ...d, id: editId } : b));
    else setBrokers([...brokers, { ...d, id: nxId(brokers) }]);
    setShowForm(false);
  };

  return <div>
    <PageHeader title={t.brokers} action={<Btn onClick={openNew}><Plus size={14} /> {t.addBroker}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.brokerName} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Inp label={t.contactPerson} value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} />
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Inp label={t.brokerCommission + " %"} type="number" value={form.commissionPct} onChange={e => setForm({ ...form, commissionPct: e.target.value })} />
      </div>
      <Inp label={t.notes} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: "100%", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>{t.brokerName}</Th><Th>{t.contactPerson}</Th><Th>{t.phone}</Th><Th align="center">{t.commissionPct}</Th><Th align="right">{t.actions}</Th>
        </tr></thead>
        <tbody>{brokers.map(b => <tr key={b.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td bold>{b.name}</Td><Td>{b.contactPerson}</Td><Td>{b.phone}</Td>
          <Td align="center"><Badge label={`${b.commissionPct}%`} color={colors.orange} /></Td>
          <Td align="right">
            <button onClick={() => openEdit(b)} style={{ padding: "8px 10px", border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
            <button onClick={() => setBrokers(brokers.filter(x => x.id !== b.id))} style={{ padding: "8px 10px", border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
          </Td>
        </tr>)}</tbody>
      </table>
      </div>
      {brokers.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noBrokers}</div>}
    </Card>
  </div>;
}

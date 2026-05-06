import { useState } from "react";
import { Plus, Pencil, Trash2, UserCog } from "lucide-react";
import { colors } from "../constants/theme.js";
import { nxId } from "../utils/helpers.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td } from "../components/ui/index.jsx";

export default function PartnersPage({ t, partners, setPartners, trucks, setTrucks, isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", commissionPct: "", negotiationType: "Net Profit %", notes: "", username: "", password: "" });
  const [error, setError] = useState("");

  const openNew = () => { setForm({ name: "", phone: "", email: "", commissionPct: "", negotiationType: "Net Profit %", notes: "", username: "", password: "" }); setEditId(null); setError(""); setShowForm(true); };
  const openEdit = (p) => { setForm({ ...p }); setEditId(p.id); setError(""); setShowForm(true); };
  const save = () => {
    if (!form.name) return;
    if (form.username) {
      const duplicate = partners.some(p => p.username === form.username && p.id !== (editId || -1));
      if (duplicate) { setError("Este usuario ya existe"); return; }
    }
    const commission = Number(form.commissionPct) || 0;
    if (commission < 0 || commission > 100) { setError("Comisión debe estar entre 0 y 100"); return; }
    const d = { ...form, commissionPct: commission };
    if (editId) setPartners(partners.map(p => p.id === editId ? { ...d, id: editId } : p));
    else setPartners([...partners, { ...d, id: nxId(partners) }]);
    setShowForm(false);
  };

  return <div>
    <PageHeader title={t.partners} action={<Btn onClick={openNew}><Plus size={14} /> {t.addPartner}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{editId ? t.editPartner : t.addPartner}</h3>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.partnerName || t.name || "Nombre"} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" />
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Inp label={t.email} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 2fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.commissionPct || "Comisión %"} type="number" value={form.commissionPct} onChange={e => setForm({ ...form, commissionPct: e.target.value })} />
        <Sel label={t.negotiationType || "Tipo Negociación"} value={form.negotiationType} onChange={e => setForm({ ...form, negotiationType: e.target.value })}>
          <option value="Net Profit %">Net Profit %</option>
          <option value="Revenue %">Revenue %</option>
          <option value="Fixed">Fijo</option>
        </Sel>
        <Inp label={t.notes} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Inp label={t.username} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Usuario login" />
        <Inp label={t.password} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Contraseña login" />
      </div>
      {error && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>Nombre</Th><Th>{t.phone}</Th><Th>{t.email}</Th><Th align="center">Comisión</Th><Th align="center">Negociación</Th><Th>{t.username}</Th><Th align="right">{t.actions}</Th>
        </tr></thead>
        <tbody>{partners.map(p => <tr key={p.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td bold><UserCog size={12} color={colors.orange} style={{ marginRight: 4, verticalAlign: "middle" }} />{p.name}</Td>
          <Td>{p.phone}</Td>
          <Td>{p.email}</Td>
          <Td align="center"><Badge label={`${p.commissionPct}%`} color={colors.green} /></Td>
          <Td align="center"><Badge label={p.negotiationType || "Net Profit %"} color={colors.accent} /></Td>
          <Td>{p.username}</Td>
          <Td align="right">
            <button onClick={() => openEdit(p)} style={{ padding: "10px", minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Pencil size={12} /></button>
            <button onClick={() => {
              const truckCount = (trucks || []).filter(tk => tk.partnerId === p.id).length;
              if (!window.confirm(`Eliminar ${p.name}? Tiene ${truckCount} camión(es) registrado(s). Esta acción no se puede deshacer.`)) return;
              if (setTrucks) setTrucks(prev => prev.map(tk => tk.partnerId === p.id ? { ...tk, partnerId: null } : tk));
              setPartners(partners.filter(x => x.id !== p.id));
            }} style={{ padding: "10px", minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.red, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={12} /></button>
          </Td>
        </tr>)}</tbody>
      </table>
      </div>
      {partners.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noPartners}</div>}
    </Card>
  </div>;
}

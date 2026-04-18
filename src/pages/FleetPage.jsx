import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { colors } from "../constants/theme.js";
import { nxId } from "../utils/helpers.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td } from "../components/ui/index.jsx";

export default function FleetPage({ t, trucks, setTrucks, partners }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ plate: "", type: "Flatbed", size: "T1", owner: "own", partnerId: "" });

  const openNew = () => { setForm({ plate: "", type: "Flatbed", size: "T1", owner: "own", partnerId: "" }); setEditId(null); setShowForm(true); };
  const openEdit = (tk) => { setForm({ ...tk, partnerId: tk.partnerId || "" }); setEditId(tk.id); setShowForm(true); };
  const save = () => {
    if (!form.plate) return;
    const d = { ...form, partnerId: form.owner === "partner" ? Number(form.partnerId) || null : null };
    if (editId) setTrucks(trucks.map(t2 => t2.id === editId ? { ...d, id: editId } : t2));
    else setTrucks([...trucks, { ...d, id: nxId(trucks) }]);
    setShowForm(false);
  };

  return <div>
    <PageHeader title={t.fleet} action={<Btn onClick={openNew}><Plus size={14} /> {t.addTruck}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Inp label={t.truckPlate} value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} />
        <Sel label={t.truckType} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
          <option>Flatbed</option><option>Refrigerated</option><option>Dry Van</option><option>Tanker</option><option>Lowboy</option>
        </Sel>
        <Sel label={t.truckSize} value={form.size || "T1"} onChange={e => setForm({ ...form, size: e.target.value })}>
          <option value="T1">T1 — Pequeño</option><option value="T2">T2 — Grande</option>
        </Sel>
        <Sel label={t.ownerType} value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })}>
          <option value="own">{t.ownTruck}</option><option value="partner">{t.partnerTruck}</option>
        </Sel>
      </div>
      {form.owner === "partner" && <Sel label={t.partnerName} value={form.partnerId} onChange={e => setForm({ ...form, partnerId: e.target.value })} style={{ marginBottom: 12 }}>
        <option value="">{t.none}</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Sel>}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>{t.truckPlate}</Th><Th>{t.truckType}</Th><Th>{t.truckSize}</Th><Th>{t.ownerType}</Th><Th>{t.partnerName}</Th><Th align="right">{t.actions}</Th>
        </tr></thead>
        <tbody>{trucks.map(tk => {
          const pt = partners.find(p => p.id === tk.partnerId);
          return <tr key={tk.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
            <Td bold>{tk.plate}</Td><Td>{tk.type}</Td>
            <Td><Badge label={tk.size || "T1"} color={(tk.size || "T1") === "T2" ? colors.orange : colors.accent} /></Td>
            <Td><Badge label={tk.owner === "own" ? t.ownTruck : t.partnerTruck} color={tk.owner === "own" ? colors.accent : colors.orange} /></Td>
            <Td>{pt?.name || "—"}</Td>
            <Td align="right">
              <button onClick={() => openEdit(tk)} style={{ padding: 4, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
              <button onClick={() => setTrucks(trucks.filter(x => x.id !== tk.id))} style={{ padding: 4, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
            </Td>
          </tr>;
        })}</tbody>
      </table>
    </Card>
  </div>;
}

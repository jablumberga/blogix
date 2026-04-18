import { useState } from "react";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, nxId } from "../utils/helpers.js";
import { DR_PROVINCES } from "../constants/destinations.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td } from "../components/ui/index.jsx";

export default function DriversPage({ t, drivers, setDrivers, trucks }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", license: "", truckId: "", salaryType: "perTrip", fixedAmount: 0, percentageAmount: 0, username: "", password: "", rates: [] });
  const [rForm, setRForm] = useState({ province: "", municipality: "", priceT1: "", priceT2: "" });

  const openNew = () => { setForm({ name: "", phone: "", license: "", truckId: "", salaryType: "perTrip", fixedAmount: 0, percentageAmount: 0, username: "", password: "", rates: [] }); setEditId(null); setShowForm(true); };
  const openEdit = (d) => { setForm({ ...d }); setEditId(d.id); setShowForm(true); };
  const save = () => {
    if (!form.name) return;
    const d = { ...form, truckId: Number(form.truckId) || null, fixedAmount: Number(form.fixedAmount) || 0, percentageAmount: Number(form.percentageAmount) || 0 };
    if (editId) setDrivers(drivers.map(x => x.id === editId ? { ...d, id: editId } : x));
    else setDrivers([...drivers, { ...d, id: nxId(drivers) }]);
    setShowForm(false);
  };
  const addRate = () => {
    if (!rForm.province || !rForm.municipality || !rForm.priceT1 || !rForm.priceT2) return;
    setForm({ ...form, rates: [...(form.rates || []), { id: nxId(form.rates || []), province: rForm.province, municipality: rForm.municipality, priceT1: Number(rForm.priceT1), priceT2: Number(rForm.priceT2) }] });
    setRForm({ province: "", municipality: "", priceT1: "", priceT2: "" });
  };

  return <div>
    <PageHeader title={t.drivers} action={<Btn onClick={openNew}><Plus size={14} /> {t.addDriver}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.driverName} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Inp label={t.license} value={form.license} onChange={e => setForm({ ...form, license: e.target.value })} />
        <Sel label={t.assignedTruck} value={form.truckId} onChange={e => setForm({ ...form, truckId: e.target.value })}>
          <option value="">{t.none}</option>{trucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}
        </Sel>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Sel label={t.salaryType} value={form.salaryType} onChange={e => setForm({ ...form, salaryType: e.target.value })}>
          <option value="fixed">{t.fixedSalary}</option><option value="perTrip">{t.perTrip}</option><option value="porcentaje">{t.porcentaje}</option>
        </Sel>
        {form.salaryType === "fixed" && <Inp label={t.fixedAmount} type="number" value={form.fixedAmount} onChange={e => setForm({ ...form, fixedAmount: e.target.value })} />}
        {form.salaryType === "porcentaje" && <Inp label={t.percentageAmount} type="number" min="0" max="100" value={form.percentageAmount} onChange={e => setForm({ ...form, percentageAmount: e.target.value })} />}
        <Inp label={t.username} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
        <Inp label={t.password} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
      </div>
      {form.salaryType === "perTrip" && <div style={{ background: colors.inputBg, borderRadius: 8, padding: 10, marginBottom: 10, border: `1px solid ${colors.border}` }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 12, color: colors.green }}>{t.driverRateSheet} (T1 / T2)</h4>
        {(form.rates || []).map(r => <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 11 }}>
          <span style={{ flex: 1 }}>{r.municipality}, {r.province}</span>
          <span style={{ fontWeight: 600, color: colors.accent }}>T1: {fmt(r.priceT1 ?? r.price ?? 0)}</span>
          <span style={{ fontWeight: 600, color: colors.orange }}>T2: {fmt(r.priceT2 ?? r.price ?? 0)}</span>
          <button onClick={() => setForm({ ...form, rates: form.rates.filter(x => x.id !== r.id) })} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}><X size={10} /></button>
        </div>)}
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "flex-end" }}>
          <Sel value={rForm.province} onChange={e => setRForm({ ...rForm, province: e.target.value, municipality: "" })} style={{ flex: 2, fontSize: 10 }}>
            <option value="">Prov.</option>{DR_PROVINCES.map(p => <option key={p.province} value={p.province}>{p.province}</option>)}
          </Sel>
          <Sel value={rForm.municipality} onChange={e => setRForm({ ...rForm, municipality: e.target.value })} style={{ flex: 2, fontSize: 10 }}>
            <option value="">Mun.</option>{(DR_PROVINCES.find(p => p.province === rForm.province)?.municipalities || []).map(m => <option key={m} value={m}>{m}</option>)}
          </Sel>
          <Inp type="number" placeholder="T1 $" value={rForm.priceT1} onChange={e => setRForm({ ...rForm, priceT1: e.target.value })} style={{ width: 70, fontSize: 10 }} />
          <Inp type="number" placeholder="T2 $" value={rForm.priceT2} onChange={e => setRForm({ ...rForm, priceT2: e.target.value })} style={{ width: 70, fontSize: 10 }} />
          <Btn onClick={addRate} style={{ padding: "5px 8px", fontSize: 10 }}><Plus size={10} /></Btn>
        </div>
      </div>}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>{t.driverName}</Th><Th>{t.phone}</Th><Th>{t.license}</Th><Th>{t.assignedTruck}</Th><Th>{t.salaryType}</Th><Th align="right">{t.actions}</Th>
        </tr></thead>
        <tbody>{drivers.map(d => {
          const tk = trucks.find(t2 => t2.id === d.truckId);
          return <tr key={d.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
            <Td bold>{d.name}</Td><Td>{d.phone}</Td><Td>{d.license}</Td><Td>{tk?.plate || "—"}</Td>
            <Td><Badge label={d.salaryType === "fixed" ? `${t.fixedSalary}: ${fmt(d.fixedAmount)}` : d.salaryType === "porcentaje" ? `${t.porcentaje}: ${d.percentageAmount || 0}%` : t.perTrip} color={d.salaryType === "fixed" ? colors.accent : d.salaryType === "porcentaje" ? colors.cyan : colors.green} /></Td>
            <Td align="right">
              <button onClick={() => openEdit(d)} style={{ padding: 4, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
              <button onClick={() => setDrivers(drivers.filter(x => x.id !== d.id))} style={{ padding: 4, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
            </Td>
          </tr>;
        })}</tbody>
      </table>
    </Card>
  </div>;
}

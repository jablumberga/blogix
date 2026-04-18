import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { colors } from "../constants/theme.js";
import { nxId } from "../utils/helpers.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td } from "../components/ui/index.jsx";

export default function FleetPage({ t, trucks, setTrucks, partners, trips, setTrips, clients, setExpenses, drivers }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ plate: "", type: "Flatbed", size: "T1", owner: "own", partnerId: "" });
  const [recalcInfo, setRecalcInfo] = useState(null);

  const openNew = () => { setForm({ plate: "", type: "Flatbed", size: "T1", owner: "own", partnerId: "" }); setEditId(null); setShowForm(true); setRecalcInfo(null); };
  const openEdit = (tk) => { setForm({ ...tk, partnerId: tk.partnerId || "" }); setEditId(tk.id); setShowForm(true); setRecalcInfo(null); };

  const handleSizeChange = (newSize) => {
    const f = { ...form, size: newSize };
    if (editId && trips && clients) {
      const affected = trips.filter(tr => tr.truckId === editId && !tr.tarifaOverride);
      setRecalcInfo(affected.length > 0 ? { count: affected.length, oldSize: form.size || "T1", newSize } : null);
    }
    setForm(f);
  };

  const save = () => {
    if (!form.plate) return;
    const d = { ...form, partnerId: form.owner === "partner" ? Number(form.partnerId) || null : null };
    if (editId) {
      const prevTruck = trucks.find(t2 => t2.id === editId);
      const sizeChanged = prevTruck && (prevTruck.size || "T1") !== (form.size || "T1");
      setTrucks(trucks.map(t2 => t2.id === editId ? { ...d, id: editId } : t2));

      if (sizeChanged && trips && setTrips && clients) {
        const newSize = form.size || "T1";
        const updatedRevenues = {};
        setTrips(prev => prev.map(tr => {
          if (tr.truckId !== editId || tr.tarifaOverride) return tr;
          const cl = clients.find(c => c.id === tr.clientId);
          if (!cl || !tr.province || !tr.municipality) return tr;
          const rate = cl.rates?.find(r => r.province === tr.province && r.municipality === tr.municipality);
          if (!rate) return tr;
          const newRevenue = newSize === "T2" ? (rate.priceT2 ?? rate.price ?? 0) : (rate.priceT1 ?? rate.price ?? 0);
          if (!newRevenue) return tr;
          updatedRevenues[tr.id] = { oldRevenue: tr.revenue, newRevenue, driverId: tr.driverId };
          return { ...tr, revenue: newRevenue };
        }));

        if (setExpenses && drivers && Object.keys(updatedRevenues).length > 0) {
          setExpenses(prev => prev.map(e => {
            if (e.category !== "driverPay" || !updatedRevenues[e.tripId]) return e;
            const { newRevenue, driverId } = updatedRevenues[e.tripId];
            const driver = drivers.find(d => d.id === driverId);
            const pct = driver?.salaryType === "porcentaje" ? (driver.percentageAmount || 20) : 20;
            const newPay = Math.round(newRevenue * pct / 100);
            return { ...e, amount: newPay, description: `Nómina ${pct}%: ${driver?.name || ''}` };
          }));
        }
      }
    } else {
      setTrucks([...trucks, { ...d, id: nxId(trucks) }]);
    }
    setShowForm(false);
    setRecalcInfo(null);
  };

  return <div>
    <PageHeader title={t.fleet} action={<Btn onClick={openNew}><Plus size={14} /> {t.addTruck}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Inp label={t.truckPlate} value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} />
        <Sel label={t.truckType} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
          <option>Flatbed</option><option>Refrigerated</option><option>Dry Van</option><option>Tanker</option><option>Lowboy</option>
        </Sel>
        <Sel label={t.truckSize} value={form.size || "T1"} onChange={e => handleSizeChange(e.target.value)}>
          <option value="T1">T1 — Pequeño</option><option value="T2">T2 — Grande</option>
        </Sel>
        <Sel label={t.ownerType} value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })}>
          <option value="own">{t.ownTruck}</option><option value="partner">{t.partnerTruck}</option>
        </Sel>
      </div>
      {form.owner === "partner" && <Sel label={t.partnerName} value={form.partnerId} onChange={e => setForm({ ...form, partnerId: e.target.value })} style={{ marginBottom: 12 }}>
        <option value="">{t.none}</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Sel>}
      {recalcInfo && (
        <div style={{ marginBottom: 10, padding: "8px 12px", background: colors.orange + "15", border: `1px solid ${colors.orange}40`, borderRadius: 8, fontSize: 12, color: colors.orange }}>
          ⚠️ Se actualizará la tarifa de <strong>{recalcInfo.count} viaje{recalcInfo.count !== 1 ? "s" : ""}</strong> de {recalcInfo.oldSize} → {recalcInfo.newSize} (solo los que no tienen Override manual).
        </div>
      )}
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

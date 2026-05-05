import { useState } from "react";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, nxId } from "../utils/helpers.js";
import { DR_PROVINCES } from "../constants/destinations.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td } from "../components/ui/index.jsx";

const TARIFARIO_T1T2 = [
  { province: "Santiago",               municipality: "Santiago de los Caballeros", priceT1: 900,  helperT1: 700,  dietaT1: 0,   priceT2: 1200, helperT2: 750,  dietaT2: 0    },
  { province: "Espaillat",              municipality: "Moca",                       priceT1: 1000, helperT1: 700,  dietaT1: 0,   priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Santiago",               municipality: "Navarrete",                  priceT1: 1000, helperT1: 700,  dietaT1: 0,   priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "La Vega",                municipality: "La Vega",                    priceT1: 1000, helperT1: 700,  dietaT1: 0,   priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Valverde",               municipality: "Esperanza",                  priceT1: 1100, helperT1: 700,  dietaT1: 300, priceT2: 1300, helperT2: 800,  dietaT2: 0    },
  { province: "Hermanas Mirabal",       municipality: "Salcedo",                    priceT1: 1100, helperT1: 700,  dietaT1: 300, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Monseñor Nouel",         municipality: "Bonao",                      priceT1: 1300, helperT1: 800,  dietaT1: 300, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "La Vega",                municipality: "Jarabacoa",                  priceT1: 1400, helperT1: 800,  dietaT1: 300, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Sánchez Ramírez",        municipality: "Cotuí",                      priceT1: 1400, helperT1: 800,  dietaT1: 300, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Duarte",                 municipality: "San Francisco de Macorís",   priceT1: 1400, helperT1: 800,  dietaT1: 300, priceT2: 1700, helperT2: 900,  dietaT2: 300  },
  { province: "Valverde",               municipality: "Mao",                        priceT1: 1400, helperT1: 800,  dietaT1: 300, priceT2: 1600, helperT2: 900,  dietaT2: 300  },
  { province: "Puerto Plata",           municipality: "Puerto Plata",               priceT1: 1700, helperT1: 900,  dietaT1: 400, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Puerto Plata",           municipality: "Cabarete",                   priceT1: 1800, helperT1: 900,  dietaT1: 400, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "María Trinidad Sánchez", municipality: "Nagua",                      priceT1: 1800, helperT1: 900,  dietaT1: 400, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "La Vega",                municipality: "Constanza",                  priceT1: 1900, helperT1: 1000, dietaT1: 400, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Dajabón",                municipality: "Dajabón",                    priceT1: 2000, helperT1: 1000, dietaT1: 500, priceT2: 2500, helperT2: 1200, dietaT2: 600  },
  { province: "Samaná",                 municipality: "Santa Bárbara de Samaná",    priceT1: 2200, helperT1: 1000, dietaT1: 500, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Independencia",          municipality: "Jimaní",                     priceT1: 0,    helperT1: 0,    dietaT1: 0,   priceT2: 4000, helperT2: 1500, dietaT2: 1000 },
];
const TARGET_NAMES = ["luis alberto", "joan", "emil", "rober"];

export default function DriversPage({ t, drivers, setDrivers, trucks, setTrucks, trips, isMobile, expenses, setExpenses }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", license: "", truckId: "", salaryType: "perTrip", fixedAmount: 0, percentageAmount: 0, username: "", password: "", rates: [] });
  const [rForm, setRForm] = useState({ province: "", municipality: "", priceT1: "", priceT2: "", helperT1: "", helperT2: "", dietaT1: "", dietaT2: "" });
  const [error, setError] = useState("");
  const [patchMsg, setPatchMsg] = useState("");

  const applyTarifario = () => {
    const rates = TARIFARIO_T1T2.map((r, i) => ({ ...r, id: i + 1 }));
    const log = [];
    let emilId = null;
    const newDrivers = drivers.map(driver => {
      const n = (driver.name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (!TARGET_NAMES.some(t => n.includes(t))) return driver;
      if (n.includes("emil")) emilId = driver.id;
      log.push(driver.name);
      return { ...driver, salaryType: "perTrip", rates };
    });
    setDrivers(newDrivers);
    let expMsg = "";
    if (emilId !== null && setExpenses) {
      const emilDriver = newDrivers.find(d => d.id === emilId);
      const emilTrips = (trips || []).filter(tr => tr.driverId === emilId && String(tr.date || "").endsWith("-30"));
      emilTrips.forEach(trip => {
        const rate = (emilDriver.rates || []).find(r => r.province === trip.province && r.municipality === trip.municipality);
        if (!rate) return;
        const tk = trucks.find(t2 => t2.id === trip.truckId);
        const size = (trip.tarifaOverride && trip.tarifaOverride !== "custom") ? trip.tarifaOverride : (tk?.size || "T1");
        const newAmount = size === "T2" ? (rate.priceT2 + rate.dietaT2) : (rate.priceT1 + rate.dietaT1);
        let found = false;
        setExpenses(prev => prev.map(exp => {
          if (exp.tripId === trip.id && exp.category === "driverPay" && exp.driverId === emilId) { found = true; return { ...exp, amount: newAmount, description: `Nómina por viaje: ${emilDriver.name}` }; }
          return exp;
        }));
        if (!found) setExpenses(prev => [...prev, { id: Math.max(0, ...prev.map(e => e.id)) + 1, tripId: trip.id, driverId: emilId, date: trip.date, category: "driverPay", amount: newAmount, description: `Nómina por viaje: ${emilDriver.name}`, paymentMethod: "transfer", status: "pending", supplierId: null }]);
        expMsg = ` | Viaje Emil día 30 → ${fmt(newAmount)}`;
      });
    }
    setPatchMsg(log.length > 0 ? `✅ Tarifario aplicado a: ${log.join(", ")}${expMsg}` : `⚠️ No se encontraron conductores. Nombres en sistema: ${drivers.map(d => d.name).join(", ")}`);
  };

  const openNew = () => { setForm({ name: "", phone: "", license: "", truckId: "", salaryType: "perTrip", fixedAmount: 0, percentageAmount: 0, username: "", password: "", rates: [] }); setEditId(null); setError(""); setShowForm(true); };
  const openEdit = (d) => { setForm({ ...d }); setEditId(d.id); setError(""); setShowForm(true); };
  const save = () => {
    if (!form.name) return;
    if (form.username) {
      const duplicate = drivers.some(d => d.username === form.username && d.id !== (editId || -1));
      if (duplicate) { setError("Este usuario ya existe"); return; }
    }
    const newTruckId = Number(form.truckId) || null;
    const d = { ...form, truckId: newTruckId, fixedAmount: Number(form.fixedAmount) || 0, percentageAmount: Number(form.percentageAmount) || 0 };
    const savedId = editId || nxId(drivers);
    if (editId) {
      setDrivers(drivers.map(x => x.id === editId ? { ...d, id: editId } : x));
    } else {
      setDrivers([...drivers, { ...d, id: savedId }]);
    }
    // Keep truck.driverId in sync with driver.truckId
    if (setTrucks) {
      const prevTruckId = editId ? (drivers.find(x => x.id === editId)?.truckId ?? null) : null;
      if (prevTruckId !== newTruckId) {
        setTrucks(prev => prev.map(tk => {
          if (tk.id === prevTruckId) return { ...tk, driverId: null };
          if (tk.id === newTruckId)  return { ...tk, driverId: savedId };
          return tk;
        }));
      }
    }
    setShowForm(false);
  };
  const addRate = () => {
    if (!rForm.province || !rForm.municipality || !rForm.priceT1) return;
    setForm({ ...form, rates: [...(form.rates || []), { id: nxId(form.rates || []), province: rForm.province, municipality: rForm.municipality, priceT1: Number(rForm.priceT1), priceT2: Number(rForm.priceT2) || 0, helperT1: Number(rForm.helperT1) || 0, helperT2: Number(rForm.helperT2) || 0, dietaT1: Number(rForm.dietaT1) || 0, dietaT2: Number(rForm.dietaT2) || 0 }] });
    setRForm({ province: "", municipality: "", priceT1: "", priceT2: "", helperT1: "", helperT2: "", dietaT1: "", dietaT2: "" });
  };

  return <div>
    <PageHeader title={t.drivers} action={<div style={{ display: "flex", gap: 8 }}><Btn onClick={applyTarifario} style={{ background: colors.orange, fontSize: 12 }}>⚡ Cargar Tarifario T1+T2</Btn><Btn onClick={openNew}><Plus size={14} /> {t.addDriver}</Btn></div>} />
    {patchMsg && <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: patchMsg.startsWith("✅") ? colors.green + "18" : colors.orange + "18", border: `1px solid ${patchMsg.startsWith("✅") ? colors.green : colors.orange}40`, color: patchMsg.startsWith("✅") ? colors.green : colors.orange, fontSize: 13, fontWeight: 600 }}>{patchMsg}</div>}
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.driverName} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Inp label={t.license} value={form.license} onChange={e => setForm({ ...form, license: e.target.value })} />
        <Sel label={t.assignedTruck} value={form.truckId} onChange={e => setForm({ ...form, truckId: e.target.value })}>
          <option value="">{t.none}</option>{trucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}
        </Sel>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
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
          <span style={{ fontWeight: 600, color: colors.accent }}>T1: {fmt(r.priceT1 ?? r.price ?? 0)}{r.dietaT1 > 0 ? `+${fmt(r.dietaT1)}` : ""}</span>
          <span style={{ fontWeight: 600, color: colors.cyan }}>Ay: {fmt(r.helperT1 ?? 0)}</span>
          <span style={{ fontWeight: 600, color: colors.orange }}>T2: {fmt(r.priceT2 ?? 0)}</span>
          <button onClick={() => setForm({ ...form, rates: form.rates.filter(x => x.id !== r.id) })} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}><X size={10} /></button>
        </div>)}
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "flex-end" }}>
          <Sel value={rForm.province} onChange={e => setRForm({ ...rForm, province: e.target.value, municipality: "" })} style={{ flex: 2, fontSize: 10 }}>
            <option value="">Prov.</option>{DR_PROVINCES.map(p => <option key={p.province} value={p.province}>{p.province}</option>)}
          </Sel>
          <Sel value={rForm.municipality} onChange={e => setRForm({ ...rForm, municipality: e.target.value })} style={{ flex: 2, fontSize: 10 }}>
            <option value="">Mun.</option>{(DR_PROVINCES.find(p => p.province === rForm.province)?.municipalities || []).map(m => <option key={m} value={m}>{m}</option>)}
          </Sel>
          <Inp type="number" placeholder="T1 $" value={rForm.priceT1} onChange={e => setRForm({ ...rForm, priceT1: e.target.value })} style={{ width: 58, fontSize: 10 }} />
          <Inp type="number" placeholder="Dieta1" value={rForm.dietaT1} onChange={e => setRForm({ ...rForm, dietaT1: e.target.value })} style={{ width: 58, fontSize: 10 }} />
          <Inp type="number" placeholder="Ay1 $" value={rForm.helperT1} onChange={e => setRForm({ ...rForm, helperT1: e.target.value })} style={{ width: 58, fontSize: 10 }} />
          <Inp type="number" placeholder="T2 $" value={rForm.priceT2} onChange={e => setRForm({ ...rForm, priceT2: e.target.value })} style={{ width: 58, fontSize: 10 }} />
          <Inp type="number" placeholder="Dieta2" value={rForm.dietaT2} onChange={e => setRForm({ ...rForm, dietaT2: e.target.value })} style={{ width: 58, fontSize: 10 }} />
          <Inp type="number" placeholder="Ay2 $" value={rForm.helperT2} onChange={e => setRForm({ ...rForm, helperT2: e.target.value })} style={{ width: 58, fontSize: 10 }} />
          <Btn onClick={addRate} style={{ padding: "5px 8px", fontSize: 10 }}><Plus size={10} /></Btn>
        </div>
      </div>}
      {error && <div style={{ color: colors.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
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
              <button onClick={() => openEdit(d)} style={{ padding: "10px", minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Pencil size={12} /></button>
              <button onClick={() => {
                const tripCount = (trips || []).filter(tr => tr.driverId === d.id).length;
                if (!window.confirm(`Eliminar ${d.name}? Tiene ${tripCount} viaje(s) registrado(s). Esta acción no se puede deshacer.`)) return;
                setDrivers(drivers.filter(x => x.id !== d.id));
              }} style={{ padding: "10px", minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.red, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={12} /></button>
            </Td>
          </tr>;
        })}</tbody>
      </table>
      </div>
    </Card>
  </div>;
}

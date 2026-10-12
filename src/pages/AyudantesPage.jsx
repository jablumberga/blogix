import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, HardHat } from "lucide-react";
import { colors } from "../constants/theme.js";
import { today } from "../utils/helpers.js";
import { HELPER_PAY_MODES, normalizeAyudante } from "../utils/ayudantes.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td } from "../components/ui/index.jsx";

const emptyForm = () => ({ name: "", cedula: "", phone: "", bank: "", account: "", payMode: "direct", status: "active", notes: "", truckId: "" });

/**
 * Ayudantes como personas (solo admin).
 * «Directo»: cobra su propia nómina (sección Ayudantes en Nómina, su reporte y adelantos).
 * «Por el chofer»: se le paga a través del chofer, como siempre.
 * La tripulación fija va en el camión (aquí o en Flota): sale puesta en sus viajes y se puede cambiar en cada uno.
 */
export default function AyudantesPage({ t, ayudantes = [], setAyudantes, trucks = [], setTrucks, trips = [], expenses = [], isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState("");

  const all = useMemo(() => (ayudantes || []).filter(Boolean).map(normalizeAyudante), [ayudantes]);
  const list = useMemo(() => all.filter(a => a.status !== "deleted"), [all]); // los borrados quedan como marca para no reusar su número
  const truckOf = (id) => trucks.find(tk => (tk.helperIds || []).map(Number).includes(Number(id))) || null;
  // Viajes y gastos (pagos, adelantos) en los que aparece: así no se borra a alguien que ya tiene historia
  const usedIn = useMemo(() => {
    const m = new Map();
    for (const tr of trips) for (const h of tr.helpers || []) if (h?.ayudanteId != null) m.set(Number(h.ayudanteId), (m.get(Number(h.ayudanteId)) || 0) + 1);
    for (const e of expenses) if (e?.ayudanteId != null && e.ayudanteId !== "") m.set(Number(e.ayudanteId), (m.get(Number(e.ayudanteId)) || 0) + 1);
    return m;
  }, [trips, expenses]);
  // Número nuevo: nunca uno que ya se usó (ni de un ayudante borrado), para que nadie herede pagos o adelantos de otro
  const nextAyudanteId = () => Math.max(0, ...all.map(a => Number(a.id) || 0), ...[...usedIn.keys()]) + 1;
  const monthStart = today().slice(0, 7) + "-01";
  const tripsThisMonth = (id) => trips.filter(tr => tr.status !== "cancelled" && tr.date >= monthStart && (tr.helpers || []).some(h => h?.ayudanteId != null && Number(h.ayudanteId) === id)).length;

  const openNew = () => { setForm(emptyForm()); setEditId(null); setError(""); setShowForm(true); };
  const openEdit = (a) => { setForm({ ...emptyForm(), ...a, truckId: truckOf(a.id)?.id || "" }); setEditId(a.id); setError(""); setShowForm(true); };

  const save = () => {
    const name = String(form.name || "").trim();
    if (!name) { setError("El nombre es obligatorio"); return; }
    if (list.some(a => a.id !== editId && a.name.trim().toLowerCase() === name.toLowerCase())) { setError("Ya hay un ayudante con ese nombre"); return; }
    const { truckId, ...rest } = form;
    const rec = { ...rest, name, cedula: String(form.cedula || "").trim(), phone: String(form.phone || "").trim(), bank: String(form.bank || "").trim(), account: String(form.account || "").trim() };
    const id = editId || nextAyudanteId();
    setAyudantes(editId ? all.map(a => a.id === editId ? { ...a, ...rec, id } : a) : [...all, { ...rec, id }]);
    // Camión fijo: se quita de los demás camiones y se agrega al elegido (al final de su tripulación)
    const target = Number(truckId) || null;
    const current = truckOf(id)?.id || null;
    if (setTrucks && target !== current) {
      setTrucks(trucks.map(tk => {
        const ids = (tk.helperIds || []).map(Number).filter(x => x !== id);
        if (tk.id === target) ids.push(id);
        return (tk.helperIds || []).length === ids.length && tk.id !== target && tk.id !== current ? tk : { ...tk, helperIds: ids };
      }));
    }
    setShowForm(false);
  };

  const remove = (a) => {
    if (usedIn.get(a.id)) { window.alert(`${a.name} ya tiene viajes, pagos o adelantos registrados. Para que no salga más, ponlo «Inactivo» en vez de borrarlo.`); return; }
    if (!window.confirm(`¿Eliminar a ${a.name} de la lista?`)) return;
    setAyudantes(all.map(x => x.id === a.id ? { id: a.id, name: a.name, status: "deleted" } : x));
    if (setTrucks && truckOf(a.id)) setTrucks(trucks.map(tk => (tk.helperIds || []).map(Number).includes(a.id) ? { ...tk, helperIds: tk.helperIds.map(Number).filter(x => x !== a.id) } : tk));
  };

  return <div>
    <PageHeader title="Ayudantes" action={<Btn onClick={openNew}><Plus size={14} /> Agregar ayudante</Btn>} />
    <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
      <b>Directo</b>: se le paga a él (sección Ayudantes en Nómina, con su propio reporte y adelantos). <b>Por el chofer</b>: va en la nómina del chofer, como siempre.
      Si le pones un camión fijo, sale puesto en los viajes de ese camión y se puede cambiar en cada viaje. Un ayudante de un día no hace falta registrarlo: en el viaje se escribe su nombre y se paga por el chofer.
    </div>
    {showForm && <Card style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{editId ? "Editar ayudante" : "Nuevo ayudante"}</h3>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label="Nombre *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Inp label="Cédula" value={form.cedula} onChange={e => setForm({ ...form, cedula: e.target.value })} />
        <Inp label={t?.phone || "Teléfono"} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Sel label="Cómo se le paga" value={form.payMode} onChange={e => setForm({ ...form, payMode: e.target.value })}>
          {Object.entries(HELPER_PAY_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Sel>
        <Inp label="Banco (para depositarle)" value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} />
        <Inp label="Cuenta" value={form.account} onChange={e => setForm({ ...form, account: e.target.value })} />
        <Sel label="Camión fijo (tripulación)" value={form.truckId || ""} onChange={e => setForm({ ...form, truckId: e.target.value })}>
          <option value="">— Ninguno —</option>
          {trucks.filter(tk => tk.status !== "inactive").map(tk => <option key={tk.id} value={tk.id}>{tk.plate} ({tk.size || "T1"})</option>)}
        </Sel>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 3fr", gap: 12, marginBottom: 12 }}>
        <Sel label="Estado" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">{t?.active || "Activo"}</option><option value="inactive">{t?.inactive || "Inactivo"}</option></Sel>
        <Inp label="Notas" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      </div>
      {form.payMode === "driver" && <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 10 }}>Por el chofer: su pago sigue sumándose a la nómina del chofer del viaje (no tiene nómina propia ni adelantos).</div>}
      {error && <div style={{ color: colors.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t?.save || "Guardar"}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t?.cancel || "Cancelar"}</Btn></div>
    </Card>}
    <Card>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Nombre</Th><Th>Pago</Th><Th>Camión fijo</Th><Th>{t?.phone || "Teléfono"}</Th><Th>Cuenta</Th><Th align="right">Viajes este mes</Th><Th align="center">Estado</Th><Th align="right">{t?.actions || "Acciones"}</Th></tr></thead>
          <tbody>{list.slice().sort((a, b) => (a.status === "inactive") - (b.status === "inactive") || a.name.localeCompare(b.name)).map(a => {
            const tk = truckOf(a.id);
            return <tr key={a.id} style={{ borderBottom: `1px solid ${colors.border}11`, opacity: a.status === "inactive" ? 0.55 : 1 }}>
              <Td bold><HardHat size={12} color={colors.orange} style={{ marginRight: 4, verticalAlign: "middle" }} />{a.name}{a.cedula && <div style={{ fontSize: 10, color: colors.textMuted }}>{a.cedula}</div>}</Td>
              <Td><Badge label={a.payMode === "direct" ? "Directo" : "Por el chofer"} color={a.payMode === "direct" ? colors.cyan : colors.textMuted} /></Td>
              <Td>{tk ? `${tk.plate} (${tk.size || "T1"})` : <span style={{ color: colors.textMuted }}>—</span>}</Td>
              <Td>{a.phone || "—"}</Td>
              <Td style={{ fontSize: 11 }}>{[a.bank, a.account].filter(Boolean).join(" · ") || "—"}</Td>
              <Td align="right">{tripsThisMonth(a.id)}</Td>
              <Td align="center"><Badge label={a.status === "inactive" ? (t?.inactive || "Inactivo") : (t?.active || "Activo")} color={a.status === "inactive" ? colors.red : colors.green} /></Td>
              <Td align="right">
                <button onClick={() => openEdit(a)} title="Editar" style={{ padding: 10, minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
                <button onClick={() => remove(a)} title="Eliminar" style={{ padding: 10, minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
              </Td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {list.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>Aún no hay ayudantes. Agrega a los que trabajan fijo contigo.</div>}
    </Card>
  </div>;
}

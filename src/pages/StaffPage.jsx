import { useState } from "react";
import { Plus, Pencil, Trash2, UserCheck } from "lucide-react";
import { colors } from "../constants/theme.js";
import { nxId } from "../utils/helpers.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td } from "../components/ui/index.jsx";

const ROLES = { assistant: "Asistente administrativa" };
const emptyForm = () => ({ name: "", phone: "", role: "assistant", status: "active", username: "", newPassword: "" });

/** Usuarios de oficina (asistente administrativa). Solo admin. */
export default function StaffPage({ t, staff = [], setStaff, drivers = [], partners = [], isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState("");

  const openNew = () => { setForm(emptyForm()); setEditId(null); setError(""); setShowForm(true); };
  const openEdit = (s) => { setForm({ ...emptyForm(), ...s, newPassword: "", password: undefined }); setEditId(s.id); setError(""); setShowForm(true); };

  const save = () => {
    const name = form.name.trim(), username = form.username.trim();
    if (!name) { setError("El nombre es obligatorio"); return; }
    if (!username) { setError("El usuario es obligatorio: es lo que usa para entrar"); return; }
    const u = username.toLowerCase();
    const taken = u === "admin" || u === "demo" ||
      staff.some(s => s.username && s.username.toLowerCase() === u && s.id !== editId) ||
      drivers.some(d => d.username && d.username.toLowerCase() === u) ||
      partners.some(p => p.username && p.username.toLowerCase() === u);
    if (taken) { setError("Ese usuario ya está en uso"); return; }
    if (!editId && !form.newPassword) { setError("Pon una contraseña"); return; }
    const prev = editId ? staff.find(s => s.id === editId) : null;
    const { newPassword, password: _p, ...rest } = form;
    const d = { ...rest, name, username, ...(newPassword ? { password: newPassword } : {}) };
    if (editId) setStaff(staff.map(s => s.id === editId ? { ...prev, ...d, id: editId } : s));
    else setStaff([...staff, { ...d, id: nxId(staff) }]);
    setShowForm(false);
  };

  const remove = (s) => { if (!window.confirm(`¿Eliminar el acceso de ${s.name}?`)) return; setStaff(staff.filter(x => x.id !== s.id)); };

  return <div>
    <PageHeader title="Usuarios de oficina" action={<Btn onClick={openNew}><Plus size={14} /> Agregar usuario</Btn>} />
    <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
      La asistente administrativa entra con su propio usuario y ve solo su panel: viajes del período, checklist de documentos físicos, relación de viajes por chofer y el reporte de nómina para contabilidad. No ve tarifas, facturas, cobros ni banco, y no puede cambiar montos.
    </div>
    {showForm && <Card style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{editId ? "Editar usuario" : "Nuevo usuario de oficina"}</h3>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label="Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Sel label="Rol" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Sel>
        <Sel label="Estado" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">{t.active}</option><option value="inactive">{t.inactive}</option></Sel>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
        <Inp label={t.username} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} autoComplete="off" />
        <Inp label={editId ? "Nueva contraseña (vacío = no cambia)" : t.password} type="password" value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" />
      </div>
      {error && <div style={{ color: colors.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Nombre</Th><Th>{t.phone}</Th><Th>Rol</Th><Th>{t.username}</Th><Th align="center">Estado</Th><Th align="right">{t.actions}</Th></tr></thead>
        <tbody>{staff.map(s => <tr key={s.id} style={{ borderBottom: `1px solid ${colors.border}11`, opacity: s.status === "inactive" ? 0.55 : 1 }}>
          <Td bold><UserCheck size={12} color={colors.cyan} style={{ marginRight: 4, verticalAlign: "middle" }} />{s.name}</Td>
          <Td>{s.phone}</Td><Td>{ROLES[s.role] || s.role}</Td><Td>{s.username}</Td>
          <Td align="center"><Badge label={s.status === "inactive" ? t.inactive : t.active} color={s.status === "inactive" ? colors.red : colors.green} /></Td>
          <Td align="right">
            <button onClick={() => openEdit(s)} style={{ padding: 10, minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
            <button onClick={() => remove(s)} style={{ padding: 10, minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
          </Td>
        </tr>)}</tbody>
      </table>
      {staff.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>Aún no hay usuarios de oficina.</div>}
    </Card>
  </div>;
}

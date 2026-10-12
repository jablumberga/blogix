import { useState } from "react";
import { Plus, Pencil, Trash2, UserCheck } from "lucide-react";
import { colors } from "../constants/theme.js";
import { nxId } from "../utils/helpers.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td } from "../components/ui/index.jsx";
import PasswordButton from "../components/PasswordButton.jsx";

const ROLES = { assistant: "Asistente administrativa (oficina)", admin: "Administrador (todo, como el dueño)" };
const emptyForm = () => ({ name: "", phone: "", role: "assistant", status: "active", username: "", newPassword: "" });

/** Usuarios de oficina (asistente administrativa). Solo admin. */
export default function StaffPage({ t, user, staff = [], setStaff, drivers = [], partners = [], isMobile }) {
  const isSelf = (s) => user?.id === `s-${s.id}`;
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
    if (editId && isSelf({ id: editId }) && (form.status === "inactive" || form.role !== "admin")) { setError("No puedes desactivar ni bajar de rol tu propio usuario."); return; }
    const { newPassword, password: _p, ...rest } = form;
    const d = { ...rest, name, username, ...(newPassword ? { password: newPassword } : {}) };
    if (editId) setStaff(staff.map(s => s.id === editId ? { ...prev, ...d, id: editId } : s));
    else setStaff([...staff, { ...d, id: nxId(staff) }]);
    setShowForm(false);
  };

  const remove = (s) => {
    if (isSelf(s)) { window.alert("No puedes eliminar tu propio usuario."); return; }
    if (!window.confirm(`¿Eliminar el acceso de ${s.name}?`)) return; setStaff(staff.filter(x => x.id !== s.id));
  };

  return <div>
    <PageHeader title="Usuarios" action={<Btn onClick={openNew}><Plus size={14} /> Agregar usuario</Btn>} />
    <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
      <b>Oficina</b>: entra a su panel (viajes de la quincena, documentos recibidos, relación de viajes y nómina para contabilidad); no ve tarifas, facturas, cobros ni banco. <b>Administrador</b>: ve y cambia todo, igual que tú, incluida esta página. Los choferes y socios tienen su acceso en Empleados y Socios.
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
        {!editId ? <Inp label={t.password} type="password" value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" /> : <div style={{ fontSize: 11, color: colors.textMuted, alignSelf: "end", paddingBottom: 8 }}>La contraseña se cambia con el botón 🔑 de la lista.</div>}
      </div>
      {error && <div style={{ color: colors.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Nombre</Th><Th>{t.phone}</Th><Th>Rol</Th><Th>{t.username}</Th><Th align="center">Estado</Th><Th align="right">{t.actions}</Th></tr></thead>
        <tbody>{staff.map(s => <tr key={s.id} style={{ borderBottom: `1px solid ${colors.border}11`, opacity: s.status === "inactive" ? 0.55 : 1 }}>
          <Td bold><UserCheck size={12} color={colors.cyan} style={{ marginRight: 4, verticalAlign: "middle" }} />{s.name}</Td>
          <Td>{s.phone}</Td><Td>{s.role === "admin" ? <Badge label="Administrador" color={colors.accent} /> : "Oficina"}</Td><Td>{s.username}</Td>
          <Td align="center"><Badge label={s.status === "inactive" ? t.inactive : t.active} color={s.status === "inactive" ? colors.red : colors.green} />{isSelf(s) && <span style={{ fontSize: 9, color: colors.textMuted, marginLeft: 6 }}>(tú)</span>}</Td>
          <Td align="right">
            <PasswordButton table="staff" id={s.id} name={s.name} /><button onClick={() => openEdit(s)} style={{ padding: 10, minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
            <button onClick={() => remove(s)} style={{ padding: 10, minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
          </Td>
        </tr>)}</tbody>
      </table>
      {staff.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>Aún no hay usuarios de oficina.</div>}
    </Card>
  </div>;
}

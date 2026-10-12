import { useState } from "react";
import { Plus, Pencil, Trash2, UserCog, X, Truck } from "lucide-react";
import { colors } from "../constants/theme.js";
import { nxId, fmt } from "../utils/helpers.js";
import { PARTNER_MODELS, CHARGE_FREQUENCIES, normalizePartner } from "../utils/partnerModels.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td } from "../components/ui/index.jsx";
import PasswordButton from "../components/PasswordButton.jsx";

const emptyForm = () => ({
  name: "", phone: "", email: "", notes: "", status: "active",
  model: "commission", companyPct: 10, partnerSharePct: 50, fondoDays: 30,
  fixedCharges: [], username: "", newPassword: "",
});
const emptyCharge = () => ({ name: "", amount: "", frequency: "monthly", startDate: "" });

export default function PartnersPage({ t, partners, setPartners, trucks, drivers = [], isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [charge, setCharge] = useState(emptyCharge());
  const [error, setError] = useState("");

  const partnerTrucks = (pid) => (trucks || []).filter(tk => tk.partnerId === pid);

  const openNew = () => { setForm(emptyForm()); setCharge(emptyCharge()); setEditId(null); setError(""); setShowForm(true); };
  const openEdit = (p) => {
    const n = normalizePartner(p);
    setForm({ ...emptyForm(), ...n, newPassword: "", password: undefined });
    setCharge(emptyCharge()); setEditId(p.id); setError(""); setShowForm(true);
  };

  const save = () => {
    const name = (form.name || "").trim();
    if (!name) { setError("El nombre es obligatorio"); return; }
    const username = (form.username || "").trim();
    if (username) {
      const taken =
        username.toLowerCase() === "admin" || username.toLowerCase() === "demo" ||
        partners.some(p => p.username && p.username.toLowerCase() === username.toLowerCase() && p.id !== editId) ||
        drivers.some(d => d.username && d.username.toLowerCase() === username.toLowerCase());
      if (taken) { setError("Ese usuario ya está en uso (socio, chofer o admin)"); return; }
    }
    if (!editId && username && !form.newPassword) { setError("Pon una contraseña para el usuario nuevo"); return; }
    const companyPct = Number(form.companyPct) || 0, partnerSharePct = Number(form.partnerSharePct) || 0;
    if (form.model !== "profit_share" && (companyPct < 0 || companyPct > 100)) { setError("La comisión debe estar entre 0 y 100"); return; }
    if (form.model === "profit_share" && (partnerSharePct <= 0 || partnerSharePct > 100)) { setError("La parte del socio debe estar entre 1 y 100"); return; }

    const prev = editId ? partners.find(p => p.id === editId) : null;
    const { newPassword, password: _ignored, commissionPct: _old, negotiationType: _old2, ...rest } = form;
    const d = {
      ...rest, name, username,
      companyPct, partnerSharePct, fondoDays: Number(form.fondoDays) || 0,
      fixedCharges: (form.fixedCharges || []).map(c => ({ ...c, amount: Number(c.amount) || 0 })),
      ...(newPassword ? { password: newPassword } : {}), // el servidor conserva la anterior si no viene
    };
    if (editId) setPartners(partners.map(p => p.id === editId ? { ...prev, ...d, id: editId } : p));
    else setPartners([...partners, { ...d, id: nxId(partners) }]);
    setShowForm(false);
  };

  const addCharge = () => {
    const amount = Number(charge.amount) || 0;
    if (!charge.name.trim() || amount <= 0) return;
    setForm(f => ({ ...f, fixedCharges: [...(f.fixedCharges || []), { id: nxId(f.fixedCharges || []), name: charge.name.trim(), amount, frequency: charge.frequency, startDate: charge.startDate || "" }] }));
    setCharge(emptyCharge());
  };

  const remove = (p) => {
    const n = partnerTrucks(p.id).length;
    if (n > 0) { window.alert(`${p.name} tiene ${n} camión(es) asignado(s). Reasígnalos en Flota o marca al socio como inactivo; no se puede eliminar.`); return; }
    if (!window.confirm(`¿Eliminar a ${p.name}? Esta acción no se puede deshacer.`)) return;
    setPartners(partners.filter(x => x.id !== p.id));
  };

  const isShare = form.model === "profit_share";
  const modelInfo = PARTNER_MODELS[form.model] || PARTNER_MODELS.commission;

  return <div>
    <PageHeader title={t.partners} action={<Btn onClick={openNew}><Plus size={14} /> {t.addPartner}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{editId ? t.editPartner : t.addPartner}</h3>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label="Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" />
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Inp label={t.email} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Sel label={t.statusLabel || "Estado"} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">{t.active}</option><option value="inactive">{t.inactive}</option></Sel>
      </div>

      {/* ── Modelo de negocio ── */}
      <div style={{ background: colors.inputBg, borderRadius: 8, padding: 12, marginBottom: 12, border: `1px solid ${colors.border}` }}>
        <h4 style={{ margin: "0 0 10px", fontSize: 13, color: colors.accentLight }}>Modelo de negocio</h4>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          {Object.entries(PARTNER_MODELS).map(([key, m]) => {
            const on = form.model === key;
            return <button key={key} type="button" onClick={() => setForm({ ...form, model: key })}
              style={{ textAlign: "left", padding: 10, borderRadius: 8, cursor: "pointer", background: on ? `${colors.accent}22` : "transparent", border: `1px solid ${on ? colors.accent : colors.border}`, color: colors.text }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: on ? colors.accentLight : colors.text }}>{m.label}</div>
              <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 4, lineHeight: 1.4 }}>{m.desc}</div>
            </button>;
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 2fr", gap: 12 }}>
          {isShare
            ? <Inp label="Parte del socio (% de la utilidad neta)" type="number" value={form.partnerSharePct} onChange={e => setForm({ ...form, partnerSharePct: e.target.value })} />
            : <Inp label="Comisión de la empresa (% del facturado bruto)" type="number" value={form.companyPct} onChange={e => setForm({ ...form, companyPct: e.target.value })} />}
          <Inp label="Días en fondo (se paga tras cerrar la quincena)" type="number" value={form.fondoDays} onChange={e => setForm({ ...form, fondoDays: e.target.value })} />
          <div style={{ fontSize: 11, color: colors.textMuted, alignSelf: "end", paddingBottom: 6 }}>
            {isShare
              ? `El socio recibe el ${Number(form.partnerSharePct) || 0}% y la empresa el ${100 - (Number(form.partnerSharePct) || 0)}% de la utilidad después de gastos.`
              : `De cada RD$10,000 facturados la empresa se queda RD$${((Number(form.companyPct) || 0) * 100).toLocaleString()}${form.model === "commission_expenses" ? ", más los gastos marcados «cargar al socio»" : ""}.`}
            {" "}Quincena del 1–15 se paga el {15 + (Number(form.fondoDays) || 0) > 30 ? `día ${15 + (Number(form.fondoDays) || 0) - 30} del mes siguiente` : `día ${15 + (Number(form.fondoDays) || 0)}`}.
          </div>
        </div>
      </div>

      {/* ── Cargos fijos (modelos 1 y 2) ── */}
      {!isShare && <div style={{ background: colors.inputBg, borderRadius: 8, padding: 12, marginBottom: 12, border: `1px solid ${colors.border}` }}>
        <h4 style={{ margin: "0 0 4px", fontSize: 13, color: colors.orange }}>Cargos fijos al socio</h4>
        <div style={{ fontSize: 10, color: colors.textMuted, marginBottom: 10 }}>GPS, seguro de carga, etc. Los mensuales se descuentan en la quincena del 1–15; los anuales en la quincena de su aniversario.</div>
        {(form.fixedCharges || []).length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
          <tbody>{form.fixedCharges.map(c => <tr key={c.id} style={{ borderBottom: `1px solid ${colors.border}22` }}>
            <td style={{ padding: "6px 0", fontSize: 12 }}>{c.name}</td>
            <td style={{ fontSize: 12, color: colors.textMuted }}>{CHARGE_FREQUENCIES[c.frequency]?.label || c.frequency}{c.startDate ? ` · desde ${c.startDate}` : ""}</td>
            <td style={{ textAlign: "right", fontWeight: 600, fontSize: 12, color: colors.orange }}>{fmt(c.amount)}</td>
            <td style={{ width: 30, textAlign: "right" }}><button type="button" onClick={() => setForm({ ...form, fixedCharges: form.fixedCharges.filter(x => x.id !== c.id) })} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}><X size={10} /></button></td>
          </tr>)}</tbody>
        </table>}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
          <Inp label="Concepto" value={charge.name} onChange={e => setCharge({ ...charge, name: e.target.value })} placeholder="GPS, Seguro de carga…" />
          <Inp label="Monto (RD$)" type="number" value={charge.amount} onChange={e => setCharge({ ...charge, amount: e.target.value })} />
          <Sel label="Frecuencia" value={charge.frequency} onChange={e => setCharge({ ...charge, frequency: e.target.value })}>
            {Object.entries(CHARGE_FREQUENCIES).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
          </Sel>
          <Inp label="Desde (opcional)" type="date" value={charge.startDate} onChange={e => setCharge({ ...charge, startDate: e.target.value })} />
          <Btn onClick={addCharge} style={{ padding: "7px 10px", fontSize: 11 }}><Plus size={12} /></Btn>
        </div>
      </div>}

      {/* ── Acceso ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
        <Inp label={t.username} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Usuario para entrar al app" autoComplete="off" />
        {!editId ? <Inp label={t.password} type="password" value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" /> : <div style={{ fontSize: 11, color: colors.textMuted, alignSelf: "end", paddingBottom: 8 }}>La contraseña se cambia con el botón 🔑 de la lista.</div>}
        <Inp label={t.notes} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      </div>

      {error && <div style={{ color: colors.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}

    <Card>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>Nombre</Th><Th>{t.phone}</Th><Th align="center">Modelo</Th><Th align="center">%</Th><Th align="center">Camiones</Th><Th align="center">Fondo</Th><Th>{t.username}</Th><Th align="center">Estado</Th><Th align="right">{t.actions}</Th>
        </tr></thead>
        <tbody>{partners.map(raw => {
          const p = normalizePartner(raw);
          const m = PARTNER_MODELS[p.model] || PARTNER_MODELS.profit_share;
          const tks = partnerTrucks(p.id);
          const inactive = p.status === "inactive";
          return <tr key={p.id} style={{ borderBottom: `1px solid ${colors.border}11`, opacity: inactive ? 0.55 : 1 }}>
            <Td bold><UserCog size={12} color={colors.orange} style={{ marginRight: 4, verticalAlign: "middle" }} />{p.name}</Td>
            <Td>{p.phone}</Td>
            <Td align="center"><Badge label={m.short} color={p.model === "profit_share" ? colors.purple : colors.accent} /></Td>
            <Td align="center"><Badge label={p.model === "profit_share" ? `Socio ${p.partnerSharePct}%` : `Emp. ${p.companyPct}%`} color={colors.green} /></Td>
            <Td align="center"><span title={tks.map(tk => tk.plate).join(", ")}><Truck size={11} style={{ verticalAlign: "middle", marginRight: 3 }} />{tks.length}</span></Td>
            <Td align="center">{p.fondoDays} d</Td>
            <Td>{p.username}</Td>
            <Td align="center"><Badge label={inactive ? t.inactive : t.active} color={inactive ? colors.red : colors.green} /></Td>
            <Td align="right">
              <PasswordButton table="partners" id={p.id} name={p.name} /><button onClick={() => openEdit(raw)} style={{ padding: "10px", minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
              <button onClick={() => remove(p)} style={{ padding: "10px", minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
            </Td>
          </tr>;
        })}</tbody>
      </table>
      </div>
      {partners.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noPartners}</div>}
    </Card>
  </div>;
}

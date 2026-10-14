import { useState, useRef } from "react";
import { Plus, X, Pencil, Trash2, Upload, Download, Copy, AlertTriangle, Truck } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, nxId, monthStr } from "../utils/helpers.js";
import { DR_PROVINCES } from "../constants/destinations.js";
import { parseRateRows, mergeRates, DRIVER_TEMPLATE_HEADERS, DRIVER_TEMPLATE_EXAMPLE_ROWS } from "../utils/rateImport.js";
import { PAY_TYPES, normalizeDriver } from "../utils/driverPay.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td } from "../components/ui/index.jsx";
import PasswordButton from "../components/PasswordButton.jsx";

const emptyForm = () => ({ name: "", phone: "", license: "", truckId: "", status: "active", payType: "perTrip", fixedAmount: 0, percentageAmount: 0, username: "", newPassword: "", rateSheets: [] });
const emptyRate = () => ({ province: "", municipality: "", priceT1: "", dietaT1: "", helperT1: "", priceT2: "", dietaT2: "", helperT2: "" });

export default function DriversPage({ t, drivers, setDrivers, trucks, setTrucks, trips = [], expenses = [], clients = [], partners = [], isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [sheetId, setSheetId] = useState(null);        // tarifario abierto en el editor
  const [newSheet, setNewSheet] = useState({ name: "", clientId: "" });
  const [rForm, setRForm] = useState(emptyRate());
  const [copyFrom, setCopyFrom] = useState("");
  const [importMsg, setImportMsg] = useState(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const openNew = () => { setForm(emptyForm()); setSheetId(null); setEditId(null); setError(""); setImportMsg(null); setShowForm(true); };
  const openEdit = (d) => {
    const n = normalizeDriver(d);
    setForm({ ...emptyForm(), ...n, truckId: n.truckId || "", newPassword: "", password: undefined, rates: undefined, salaryType: undefined });
    setSheetId(n.rateSheets[0]?.id ?? null); setEditId(d.id); setError(""); setImportMsg(null); setShowForm(true);
  };

  const save = () => {
    const name = (form.name || "").trim();
    if (!name) { setError("El nombre es obligatorio"); return; }
    const username = (form.username || "").trim();
    if (username) {
      const u = username.toLowerCase();
      const taken = u === "admin" || u === "demo" ||
        drivers.some(d => d.username && d.username.toLowerCase() === u && d.id !== editId) ||
        partners.some(p => p.username && p.username.toLowerCase() === u);
      if (taken) { setError("Ese usuario ya está en uso (chofer, socio o admin)"); return; }
    }
    if (!editId && username && !form.newPassword) { setError("Pon una contraseña para el usuario nuevo"); return; }
    if (form.payType === "percentage" && !(Number(form.percentageAmount) > 0)) { setError("Indica el porcentaje"); return; }
    if (form.payType === "fixed" && !(Number(form.fixedAmount) > 0)) { setError("Indica el salario fijo"); return; }

    const newTruckId = Number(form.truckId) || null;
    const prev = editId ? drivers.find(x => x.id === editId) : null;
    const { newPassword, password: _p, rates: _r, salaryType: _s, ...rest } = form;
    const d = {
      ...rest, name, username, truckId: newTruckId,
      fixedAmount: Number(form.fixedAmount) || 0, percentageAmount: Number(form.percentageAmount) || 0,
      salaryType: form.payType === "percentage" ? "porcentaje" : form.payType, // compatibilidad con pantallas viejas
      rates: (form.rateSheets.find(s => s.clientId == null) || form.rateSheets[0])?.rates || [], // compatibilidad
      ...(newPassword ? { password: newPassword } : {}),
    };
    const savedId = editId || nxId(drivers);
    if (editId) setDrivers(drivers.map(x => x.id === editId ? { ...prev, ...d, id: editId } : x));
    else setDrivers([...drivers, { ...d, id: savedId }]);
    if (setTrucks) {
      const prevTruckId = prev?.truckId ?? null;
      if (prevTruckId !== newTruckId) setTrucks(ts => ts.map(tk => tk.id === prevTruckId ? { ...tk, driverId: null } : tk.id === newTruckId ? { ...tk, driverId: savedId } : tk));
    }
    setShowForm(false);
  };

  // ── Tarifarios ─────────────────────────────────────────────────────────────
  const sheet = form.rateSheets.find(s => s.id === sheetId) || null;
  const updateSheet = (fn) => setForm(f => ({ ...f, rateSheets: f.rateSheets.map(s => s.id === sheetId ? fn(s) : s) }));

  const addSheet = () => {
    const name = newSheet.name.trim() || (newSheet.clientId ? (clients.find(c => c.id === Number(newSheet.clientId))?.companyName || "Cliente") : "General");
    const clientId = newSheet.clientId ? Number(newSheet.clientId) : null;
    if (clientId != null && form.rateSheets.some(s => Number(s.clientId) === clientId)) { setError("Ese cliente ya tiene tarifario"); return; }
    if (clientId == null && form.rateSheets.some(s => s.clientId == null)) { setError("Ya existe un tarifario general; edítalo o crea uno por cliente"); return; }
    const id = nxId(form.rateSheets);
    setForm(f => ({ ...f, rateSheets: [...f.rateSheets, { id, name, clientId, rates: [] }] }));
    setSheetId(id); setNewSheet({ name: "", clientId: "" }); setError("");
  };
  const removeSheet = (id) => { if (!window.confirm("¿Eliminar este tarifario?")) return; setForm(f => ({ ...f, rateSheets: f.rateSheets.filter(s => s.id !== id) })); setSheetId(form.rateSheets.find(s => s.id !== id)?.id ?? null); };

  const addRate = () => {
    if (!sheet || !rForm.province || !rForm.municipality) return;
    const n = (k) => Number(rForm[k]) || 0;
    if (n("priceT1") <= 0 && n("priceT2") <= 0) { setError("Pon el pago del chofer en T1 o T2"); return; }
    const inc = { province: rForm.province, municipality: rForm.municipality, priceT1: n("priceT1"), dietaT1: n("dietaT1"), helperT1: n("helperT1"), priceT2: n("priceT2"), dietaT2: n("dietaT2"), helperT2: n("helperT2") };
    updateSheet(s => ({ ...s, rates: mergeRates(s.rates || [], [inc]).rates }));
    setRForm(emptyRate()); setError("");
  };

  const importFile = async (file) => {
    if (!file || !sheet) return;
    setImporting(true); setImportMsg(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
      const { rates, errors } = parseRateRows(rows, "driver");
      if (rates.length === 0) setImportMsg({ ok: false, text: "No se importó ninguna tarifa.", errors });
      else {
        const { rates: merged, updated, added } = mergeRates(sheet.rates || [], rates);
        updateSheet(s => ({ ...s, rates: merged }));
        setImportMsg({ ok: true, text: `${added} destino(s) nuevo(s), ${updated} actualizado(s), ${rates.length - added - updated} sin cambios.` + (errors.length ? ` ${errors.length} fila(s) con error:` : ""), errors });
      }
    } catch (err) { setImportMsg({ ok: false, text: `No se pudo leer el archivo: ${err.message}`, errors: [] }); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const rows = sheet?.rates?.length
      ? sheet.rates.map(r => [r.province, r.municipality, r.priceT1 || 0, r.dietaT1 || 0, r.helperT1 || 0, r.priceT2 || 0, r.dietaT2 || 0, r.helperT2 || 0])
      : DRIVER_TEMPLATE_EXAMPLE_ROWS;
    const ws = XLSX.utils.aoa_to_sheet([DRIVER_TEMPLATE_HEADERS, ...rows]);
    ws["!cols"] = [{ wch: 24 }, { wch: 28 }, ...Array(6).fill({ wch: 12 })];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Tarifario");
    XLSX.writeFile(wb, `tarifario-${(form.name || "chofer").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}${sheet ? "-" + sheet.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : ""}.xlsx`);
  };

  const copyFromDriver = () => {
    const [did, sid] = copyFrom.split(":").map(Number);
    const src = normalizeDriver(drivers.find(d => d.id === did))?.rateSheets.find(s => s.id === sid);
    if (!src || !sheet) return;
    const { rates, added, updated } = mergeRates(sheet.rates || [], src.rates || []);
    updateSheet(s => ({ ...s, rates }));
    setImportMsg({ ok: true, text: `Copiado: ${added} destino(s) nuevo(s), ${updated} actualizado(s).`, errors: [] });
    setCopyFrom("");
  };

  const remove = (d) => {
    const n = trips.filter(tr => tr.driverId === d.id).length;
    if (n > 0) { window.alert(`${d.name} tiene ${n} viaje(s) registrado(s). Márcalo como inactivo en vez de eliminarlo, para no perder su historial y su nómina.`); return; }
    if (!window.confirm(`¿Eliminar a ${d.name}? Esta acción no se puede deshacer.`)) return;
    setDrivers(drivers.filter(x => x.id !== d.id));
    if (setTrucks) setTrucks(ts => ts.map(tk => tk.driverId === d.id ? { ...tk, driverId: null } : tk));
  };

  // ── Resumen por chofer para la tabla ───────────────────────────────────────
  const thisMonth = monthStr();
  const summary = (d) => ({
    tripsMonth: trips.filter(tr => tr.driverId === d.id && (tr.date || "").startsWith(thisMonth) && tr.status !== "cancelled").length,
    pendingPay: expenses.filter(e => e.driverId === d.id && (e.category === "driverPay" || e.category === "nominaTotalOverride") && (!e.status || e.status === "pending")).reduce((s, e) => s + (Number(e.amount) || 0), 0),
  });

  const otherSheets = drivers.filter(d => d.id !== editId).flatMap(d => normalizeDriver(d).rateSheets.filter(s => (s.rates || []).length).map(s => ({ value: `${d.id}:${s.id}`, label: `${d.name} · ${s.name} (${s.rates.length})` })));

  return <div>
    <PageHeader title={t.drivers} action={<Btn onClick={openNew}><Plus size={14} /> {t.addDriver}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{editId ? "Editar chofer" : t.addDriver}</h3>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.driverName} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Inp label={t.license} value={form.license} onChange={e => setForm({ ...form, license: e.target.value })} />
        <Sel label={t.assignedTruck} value={form.truckId} onChange={e => setForm({ ...form, truckId: e.target.value })}>
          <option value="">{t.none}</option>{trucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}
        </Sel>
        <Sel label="Estado" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">{t.active}</option><option value="inactive">{t.inactive}</option></Sel>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Sel label="Tipo de pago" value={form.payType} onChange={e => setForm({ ...form, payType: e.target.value })}>
          {Object.entries(PAY_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Sel>
        {form.payType === "fixed" && <Inp label="Salario fijo por quincena (RD$)" type="number" value={form.fixedAmount} onChange={e => setForm({ ...form, fixedAmount: e.target.value })} />}
        {form.payType === "percentage" && <Inp label="% del ingreso del viaje" type="number" min="0" max="100" value={form.percentageAmount} onChange={e => setForm({ ...form, percentageAmount: e.target.value })} />}
        {form.payType === "perTrip" && <div style={{ fontSize: 11, color: colors.textMuted, alignSelf: "end", paddingBottom: 6 }}>Se paga según el tarifario del destino. T1: chofer + 1 ayudante; T2: chofer + 2 ayudantes. La dieta del tarifario es la del equipo completo y se reparte en partes iguales entre chofer y ayudantes. En cada viaje se puede cambiar la cantidad de ayudantes.</div>}
        <Inp label={t.username} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} autoComplete="off" />
        {!editId ? <Inp label={t.password} type="password" value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" /> : <div style={{ fontSize: 11, color: colors.textMuted, alignSelf: "end", paddingBottom: 8 }}>La contraseña se cambia con el botón 🔑 de la lista.</div>}
      </div>

      {form.payType === "perTrip" && <div style={{ background: colors.inputBg, borderRadius: 8, padding: 12, marginBottom: 10, border: `1px solid ${colors.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <h4 style={{ margin: 0, fontSize: 13, color: colors.green }}>Tarifarios del chofer</h4>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Inp label="Nombre" value={newSheet.name} onChange={e => setNewSheet({ ...newSheet, name: e.target.value })} placeholder="General, Carga pesada…" style={{ width: 140, fontSize: 11 }} />
            <Sel label="Cliente (opcional)" value={newSheet.clientId} onChange={e => setNewSheet({ ...newSheet, clientId: e.target.value })} style={{ width: 160, fontSize: 11 }}>
              <option value="">Todos (general)</option>{clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </Sel>
            <Btn onClick={addSheet} style={{ padding: "7px 10px", fontSize: 11 }}><Plus size={12} /> Nuevo tarifario</Btn>
          </div>
        </div>
        {form.rateSheets.length === 0 && <div style={{ fontSize: 11, color: colors.orange, marginBottom: 8 }}><AlertTriangle size={12} style={{ verticalAlign: "middle" }} /> Sin tarifario: los viajes de este chofer no generarán pago. Crea uno (general o por cliente).</div>}
        {form.rateSheets.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {form.rateSheets.map(s => {
            const on = s.id === sheetId;
            const cl = s.clientId != null ? clients.find(c => c.id === Number(s.clientId)) : null;
            return <button key={s.id} type="button" onClick={() => { setSheetId(s.id); setImportMsg(null); }} style={{ padding: "5px 12px", borderRadius: 14, cursor: "pointer", border: `1px solid ${on ? colors.accent : colors.border}`, background: on ? colors.accent + "18" : "transparent", color: on ? colors.accentLight : colors.textMuted, fontSize: 11 }}>
              {s.name}{cl ? ` · ${cl.companyName}` : s.clientId == null ? " · todos" : ""} ({(s.rates || []).length})
            </button>;
          })}
        </div>}

        {sheet && <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => importFile(e.target.files?.[0])} />
            <Btn variant="ghost" onClick={downloadTemplate} style={{ padding: "6px 10px", fontSize: 11 }}><Download size={12} /> {sheet.rates?.length ? "Descargar este tarifario" : "Descargar plantilla"}</Btn>
            <Btn onClick={() => fileRef.current?.click()} disabled={importing} style={{ padding: "6px 10px", fontSize: 11 }}><Upload size={12} /> {importing ? "Importando…" : "Importar Excel"}</Btn>
            {otherSheets.length > 0 && <>
              <select value={copyFrom} onChange={e => setCopyFrom(e.target.value)} style={{ fontSize: 11, padding: "6px 8px", borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text }}>
                <option value="">Copiar de otro chofer…</option>{otherSheets.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Btn variant="ghost" onClick={copyFromDriver} disabled={!copyFrom} style={{ padding: "6px 10px", fontSize: 11 }}><Copy size={12} /> Copiar</Btn>
            </>}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => removeSheet(sheet.id)} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer", fontSize: 11 }}><Trash2 size={11} /> Eliminar tarifario</button>
          </div>
          {importMsg && <div style={{ fontSize: 11, padding: "8px 10px", borderRadius: 6, marginBottom: 8, background: importMsg.ok ? `${colors.green}22` : `${colors.red}22`, color: importMsg.ok ? colors.green : colors.red, border: `1px solid ${importMsg.ok ? colors.green : colors.red}55` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{importMsg.text}</span><button type="button" onClick={() => setImportMsg(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}><X size={10} /></button></div>
            {importMsg.errors?.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: colors.textMuted }}>{importMsg.errors.slice(0, 15).map((e, i) => <li key={i}>Fila {e.row}: {e.msg}</li>)}</ul>}
          </div>}
          {(sheet.rates || []).length > 0 && <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8, fontSize: 11 }}>
            <thead><tr style={{ borderBottom: `1px solid ${colors.border}`, color: colors.textMuted }}>
              <td style={{ padding: "4px 0" }}>Destino</td>
              <td style={{ textAlign: "right", color: colors.accent }}>Chofer T1</td><td style={{ textAlign: "right" }}>Dieta T1</td><td style={{ textAlign: "right", color: colors.cyan }}>Ayud. T1</td>
              <td style={{ textAlign: "right", color: colors.orange }}>Chofer T2</td><td style={{ textAlign: "right" }}>Dieta T2</td><td style={{ textAlign: "right", color: colors.cyan }}>Ayud. T2</td><td />
            </tr></thead>
            <tbody>{sheet.rates.map(r => <tr key={r.id} style={{ borderBottom: `1px solid ${colors.border}22` }}>
              <td style={{ padding: "5px 0" }}>{r.municipality}, <span style={{ color: colors.textMuted }}>{r.province}</span></td>
              <td style={{ textAlign: "right", fontWeight: 600, color: colors.accent }}>{fmt(r.priceT1 || 0)}</td><td style={{ textAlign: "right" }}>{fmt(r.dietaT1 || 0)}</td><td style={{ textAlign: "right", color: colors.cyan }}>{fmt(r.helperT1 || 0)}</td>
              <td style={{ textAlign: "right", fontWeight: 600, color: colors.orange }}>{fmt(r.priceT2 || 0)}</td><td style={{ textAlign: "right" }}>{fmt(r.dietaT2 || 0)}</td><td style={{ textAlign: "right", color: colors.cyan }}>{fmt(r.helperT2 || 0)}</td>
              <td style={{ width: 24, textAlign: "right" }}><button type="button" onClick={() => updateSheet(s => ({ ...s, rates: s.rates.filter(x => x.id !== r.id) }))} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}><X size={10} /></button></td>
            </tr>)}</tbody>
          </table></div>}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1.4fr 1.4fr repeat(6, 0.7fr) auto", gap: 6, alignItems: "end" }}>
            <Sel label="Provincia" value={rForm.province} onChange={e => setRForm({ ...rForm, province: e.target.value, municipality: "" })} style={{ fontSize: 10 }}>
              <option value="">--</option>{DR_PROVINCES.map(p => <option key={p.province} value={p.province}>{p.province}</option>)}
            </Sel>
            <Sel label="Municipio" value={rForm.municipality} onChange={e => setRForm({ ...rForm, municipality: e.target.value })} style={{ fontSize: 10 }}>
              <option value="">--</option>{(DR_PROVINCES.find(p => p.province === rForm.province)?.municipalities || []).map(m => <option key={m} value={m}>{m}</option>)}
            </Sel>
            {[["priceT1", "Chofer T1"], ["dietaT1", "Dieta T1"], ["helperT1", "Ayud. T1"], ["priceT2", "Chofer T2"], ["dietaT2", "Dieta T2"], ["helperT2", "Ayud. T2"]].map(([k, label]) =>
              <Inp key={k} label={label} type="number" value={rForm[k]} onChange={e => setRForm({ ...rForm, [k]: e.target.value })} style={{ fontSize: 10 }} />)}
            <Btn onClick={addRate} style={{ padding: "7px 10px", fontSize: 11 }}><Plus size={12} /></Btn>
          </div>
        </>}
      </div>}

      {error && <div style={{ color: colors.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}

    <Card>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>{t.driverName}</Th><Th>{t.phone}</Th><Th>{t.assignedTruck}</Th><Th>Pago</Th><Th align="center">Tarifarios</Th><Th align="center">Viajes mes</Th><Th align="right">Nómina pendiente</Th><Th align="center">Estado</Th><Th align="right">{t.actions}</Th>
        </tr></thead>
        <tbody>{drivers.map(raw => {
          const d = normalizeDriver(raw);
          const tk = trucks.find(t2 => t2.id === d.truckId);
          const sm = summary(d);
          const nSheets = d.rateSheets.length, nRates = d.rateSheets.reduce((s, x) => s + (x.rates || []).length, 0);
          const inactive = d.status === "inactive";
          return <tr key={d.id} style={{ borderBottom: `1px solid ${colors.border}11`, opacity: inactive ? 0.55 : 1 }}>
            <Td bold>{d.name}</Td><Td>{d.phone}</Td>
            <Td>{tk ? <span><Truck size={11} style={{ verticalAlign: "middle", marginRight: 3 }} />{tk.plate}</span> : "—"}</Td>
            <Td><Badge label={d.payType === "fixed" ? `Fijo ${fmt(d.fixedAmount)}` : d.payType === "percentage" ? `${d.percentageAmount || 0}%` : "Por viaje"} color={d.payType === "fixed" ? colors.accent : d.payType === "percentage" ? colors.cyan : colors.green} /></Td>
            <Td align="center">{d.payType !== "perTrip" ? "—" : nRates === 0
              ? <Badge label="Sin tarifario" color={colors.red} />
              : <span title={d.rateSheets.map(s => `${s.name}: ${(s.rates || []).length}`).join(", ")}>{nSheets} ({nRates} destinos)</span>}</Td>
            <Td align="center">{sm.tripsMonth}</Td>
            <Td align="right" bold color={sm.pendingPay > 0 ? colors.orange : colors.textMuted}>{fmt(sm.pendingPay)}</Td>
            <Td align="center"><Badge label={inactive ? t.inactive : t.active} color={inactive ? colors.red : colors.green} /></Td>
            <Td align="right">
              <PasswordButton table="drivers" id={d.id} name={d.name} /><button onClick={() => openEdit(raw)} style={{ padding: "10px", minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
              <button onClick={() => remove(d)} style={{ padding: "10px", minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
            </Td>
          </tr>;
        })}</tbody>
      </table>
      </div>
      {drivers.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>Sin choferes aún.</div>}
    </Card>
  </div>;
}

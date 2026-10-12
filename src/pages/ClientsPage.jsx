import { useState, useRef } from "react";
import { Plus, X, Pencil, Trash2, Building2, DollarSign, ClipboardList, Upload, Download } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, nxId } from "../utils/helpers.js";
import { DR_PROVINCES } from "../constants/destinations.js";
import { parseRateRows, mergeRates, TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROWS } from "../utils/rateImport.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Chk, Th, Td } from "../components/ui/index.jsx";

export default function ClientsPage({ t, clients, setClients, brokers, setTrips, trips = [], invoices = [], isMobile }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const emptyRules = { paymentTerms: 30, billingCycle: "net", period1PayDay: 30, period2PayDay: 15, requiresPOD: false, requiresInvoiceRef: false, requiresDocuments: false, defaultBrokerId: null, brokerPassThrough: false };
  const [form, setForm] = useState({ companyName: "", contactPerson: "", phone: "", email: "", notes: "", status: "active", rules: emptyRules, rates: [] });
  const [rForm, setRForm] = useState({ province: "", municipality: "", priceT1: "", priceT2: "" });
  const [importMsg, setImportMsg] = useState(null); // { ok, text, errors[] }
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  // ── Importar tarifario desde Excel / CSV ──────────────────────────────────
  const importRatesFile = async (file) => {
    if (!file) return;
    setImporting(true); setImportMsg(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
      const { rates, errors } = parseRateRows(rows);
      if (rates.length === 0) {
        setImportMsg({ ok: false, text: "No se importó ninguna tarifa.", errors });
      } else {
        const { rates: merged, updated, added } = mergeRates(form.rates || [], rates);
        setForm(f => ({ ...f, rates: merged }));
        setImportMsg({ ok: true, text: `${added} destino(s) nuevo(s), ${updated} actualizado(s), ${rates.length - added - updated} sin cambios.` + (errors.length ? ` ${errors.length} fila(s) con error:` : ""), errors });
      }
    } catch (err) {
      setImportMsg({ ok: false, text: `No se pudo leer el archivo: ${err.message}`, errors: [] });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE_ROWS]);
    ws["!cols"] = [{ wch: 26 }, { wch: 30 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tarifas");
    const name = form.companyName ? `tarifas-${form.companyName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.xlsx` : "plantilla-tarifas.xlsx";
    XLSX.writeFile(wb, name);
  };

  const openNew = () => { setForm({ companyName: "", contactPerson: "", phone: "", email: "", notes: "", status: "active", rules: emptyRules, rates: [] }); setEditId(null); setShowForm(true); };
  const openEdit = (c) => { setForm({ ...c }); setEditId(c.id); setShowForm(true); };
  const save = () => { if (!form.companyName) return; if (editId) setClients(clients.map(c => c.id === editId ? { ...form, id: editId } : c)); else setClients([...clients, { ...form, id: nxId(clients) }]); setShowForm(false); };
  const addRate = () => {
    const priceT1 = Number(rForm.priceT1) || 0, priceT2 = Number(rForm.priceT2) || 0;
    if (!rForm.province || !rForm.municipality || (priceT1 <= 0 && priceT2 <= 0)) return;
    const { rates } = mergeRates(form.rates || [], [{ province: rForm.province, municipality: rForm.municipality, priceT1, priceT2 }]);
    setForm({ ...form, rates });
    setRForm({ province: "", municipality: "", priceT1: "", priceT2: "" });
  };

  return <div>
    <PageHeader title={t.clients} action={<Btn onClick={openNew}><Plus size={14} /> {t.addClient}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{editId ? t.editClient : t.addClient}</h3>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.companyName} value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} />
        <Inp label={t.contactPerson} value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} />
        <Sel label={t.statusLabel} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">{t.active}</option><option value="inactive">{t.inactive}</option></Sel>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Inp label={t.email} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Inp label={t.notes} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      </div>

      <div style={{ background: colors.inputBg, borderRadius: 8, padding: 12, marginBottom: 12, border: `1px solid ${colors.border}` }}>
        <h4 style={{ margin: "0 0 10px", fontSize: 13, color: colors.accentLight }}><ClipboardList size={14} /> {t.clientRules}</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
          <Sel label="Ciclo de cobro" value={form.rules.billingCycle || "net"} onChange={e => setForm({ ...form, rules: { ...form.rules, billingCycle: e.target.value } })}>
            <option value="net">Días netos desde el viaje</option>
            <option value="bimonthly_delayed">Quincenal con fondo (1–15 / 16–31)</option>
          </Sel>
          <Sel label={t.defaultBroker} value={form.rules.defaultBrokerId || ""} onChange={e => setForm({ ...form, rules: { ...form.rules, defaultBrokerId: e.target.value ? Number(e.target.value) : null, brokerPassThrough: e.target.value ? form.rules.brokerPassThrough : false } })}>
            <option value="">{t.noBroker}</option>
            {brokers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.commissionPct}%)</option>)}
          </Sel>
        </div>
        {form.rules.defaultBrokerId && (
          <div style={{ marginBottom: 8 }}>
            <Chk
              label="El broker descuenta su comisión antes de pagarme (factura por monto neto)"
              checked={!!form.rules.brokerPassThrough}
              onChange={() => setForm({ ...form, rules: { ...form.rules, brokerPassThrough: !form.rules.brokerPassThrough } })}
            />
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 3, marginLeft: 22 }}>
              {form.rules.brokerPassThrough
                ? "Las facturas mostrarán el monto neto (menos comisión). No se genera gasto de broker separado."
                : "Tú pagas la comisión del broker. Las facturas son por tarifa completa y se genera un gasto de broker."}
            </div>
          </div>
        )}
        {(form.rules.billingCycle || "net") === "net"
          ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
              <Inp label="Días de crédito" type="number" value={form.rules.paymentTerms} onChange={e => setForm({ ...form, rules: { ...form.rules, paymentTerms: Number(e.target.value) } })} />
            </div>
          : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
              <Inp label="Cobro período 1–15 (día del mes)" type="number" value={form.rules.period1PayDay || 30} onChange={e => setForm({ ...form, rules: { ...form.rules, period1PayDay: Number(e.target.value) } })} />
              <Inp label="Cobro período 16–31 (día mes siguiente)" type="number" value={form.rules.period2PayDay || 15} onChange={e => setForm({ ...form, rules: { ...form.rules, period2PayDay: Number(e.target.value) } })} />
            </div>
        }
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Chk label={t.requiresPOD} checked={form.rules.requiresPOD} onChange={() => setForm({ ...form, rules: { ...form.rules, requiresPOD: !form.rules.requiresPOD } })} />
          <Chk label={t.requiresInvoiceRef} checked={form.rules.requiresInvoiceRef} onChange={() => setForm({ ...form, rules: { ...form.rules, requiresInvoiceRef: !form.rules.requiresInvoiceRef } })} />
          <Chk label={t.requiresDocuments} checked={form.rules.requiresDocuments} onChange={() => setForm({ ...form, rules: { ...form.rules, requiresDocuments: !form.rules.requiresDocuments } })} />
        </div>
      </div>

      <div style={{ background: colors.inputBg, borderRadius: 8, padding: 12, marginBottom: 12, border: `1px solid ${colors.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <h4 style={{ margin: 0, fontSize: 13, color: colors.green }}><DollarSign size={14} /> {t.clientRates} — {t.province} / {t.municipality} / T1 / T2</h4>
          <div style={{ display: "flex", gap: 6 }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => importRatesFile(e.target.files?.[0])} />
            <Btn variant="ghost" onClick={downloadTemplate} style={{ padding: "6px 10px", fontSize: 11 }}><Download size={12} /> Descargar plantilla</Btn>
            <Btn onClick={() => fileRef.current?.click()} disabled={importing} style={{ padding: "6px 10px", fontSize: 11 }}><Upload size={12} /> {importing ? "Importando…" : "Importar Excel"}</Btn>
          </div>
        </div>
        {importMsg && <div style={{ fontSize: 11, padding: "8px 10px", borderRadius: 6, marginBottom: 8, background: importMsg.ok ? `${colors.green}22` : `${colors.red}22`, color: importMsg.ok ? colors.green : colors.red, border: `1px solid ${importMsg.ok ? colors.green : colors.red}55` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{importMsg.text}</span><button onClick={() => setImportMsg(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}><X size={10} /></button></div>
          {importMsg.errors?.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: colors.textMuted }}>{importMsg.errors.slice(0, 15).map((e, i) => <li key={i}>Fila {e.row}: {e.msg}</li>)}{importMsg.errors.length > 15 && <li>… y {importMsg.errors.length - 15} más</li>}</ul>}
        </div>}
        {form.rates.length > 0 && <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}><table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            <td style={{ fontSize: 11, color: colors.textMuted, padding: "2px 0" }}>{t.province}</td>
            <td style={{ fontSize: 11, color: colors.textMuted }}>{t.municipality}</td>
            <td style={{ fontSize: 11, color: colors.accent, textAlign: "right" }}>T1</td>
            <td style={{ fontSize: 11, color: colors.orange, textAlign: "right" }}>T2</td>
            <td />
          </tr></thead>
          <tbody>{form.rates.map(r => <tr key={r.id} style={{ borderBottom: `1px solid ${colors.border}22` }}>
            <td style={{ padding: "6px 0", fontSize: 12 }}>{r.province}</td><td style={{ fontSize: 12 }}>{r.municipality}</td>
            <td style={{ textAlign: "right", fontWeight: 600, color: colors.accent, fontSize: 12 }}>{fmt(r.priceT1 ?? r.price ?? 0)}</td>
            <td style={{ textAlign: "right", fontWeight: 600, color: colors.orange, fontSize: 12 }}>{fmt(r.priceT2 ?? r.price ?? 0)}</td>
            <td style={{ width: 30, textAlign: "right" }}><button onClick={() => setForm({ ...form, rates: form.rates.filter(x => x.id !== r.id) })} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}><X size={10} /></button></td>
          </tr>)}</tbody>
        </table></div>}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <Sel label={t.province} value={rForm.province} onChange={e => setRForm({ ...rForm, province: e.target.value, municipality: "" })} style={{ flex: 2, fontSize: 11 }}>
            <option value="">--</option>{DR_PROVINCES.map(p => <option key={p.province} value={p.province}>{p.province}</option>)}
          </Sel>
          <Sel label={t.municipality} value={rForm.municipality} onChange={e => setRForm({ ...rForm, municipality: e.target.value })} style={{ flex: 2, fontSize: 11 }}>
            <option value="">--</option>{(DR_PROVINCES.find(p => p.province === rForm.province)?.municipalities || []).map(m => <option key={m} value={m}>{m}</option>)}
          </Sel>
          <Inp label="T1 ($)" type="number" value={rForm.priceT1} onChange={e => setRForm({ ...rForm, priceT1: e.target.value })} style={{ width: 90, fontSize: 11 }} />
          <Inp label="T2 ($)" type="number" value={rForm.priceT2} onChange={e => setRForm({ ...rForm, priceT2: e.target.value })} style={{ width: 90, fontSize: 11 }} />
          <Btn onClick={addRate} style={{ padding: "7px 10px", fontSize: 11 }}><Plus size={12} /></Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}

    <Card>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>{t.companyName}</Th><Th>{t.contactPerson}</Th><Th>{t.phone}</Th><Th align="center">{t.rules}</Th><Th align="center">{t.rates}</Th><Th align="center">{t.statusLabel}</Th><Th align="right">{t.actions}</Th>
        </tr></thead>
        <tbody>{clients.map(c => <tr key={c.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td bold><Building2 size={12} color={colors.purple} style={{ marginRight: 4, verticalAlign: "middle" }} />{c.companyName}</Td>
          <Td>{c.contactPerson}</Td><Td>{c.phone}</Td>
          <Td align="center">
            <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
              {c.rules?.billingCycle === "bimonthly_delayed"
                ? <Badge label={`Qnal: ${c.rules.period1PayDay||30}/${c.rules.period2PayDay||15}`} color={colors.cyan} />
                : <Badge label={`${c.rules?.paymentTerms||30}d`} color={colors.accent} />}
              {c.rules?.requiresPOD && <Badge label="POD" color={colors.orange} />}
              {c.rules?.requiresInvoiceRef && <Badge label="Ref" color={colors.red} />}
              {c.rules?.requiresDocuments && <Badge label="Doc" color={colors.purple} />}
              {c.rules?.defaultBrokerId && <Badge label={`B ${brokers.find(b => b.id === c.rules.defaultBrokerId)?.commissionPct || ""}%`} color={colors.yellow} />}
            </div>
          </Td>
          <Td align="center"><Badge label={`${c.rates?.length ?? 0}`} color={colors.green} /></Td>
          <Td align="center"><Badge label={c.status === "active" ? t.active : t.inactive} color={c.status === "active" ? colors.green : colors.red} /></Td>
          <Td align="right">
            <button onClick={() => openEdit(c)} style={{ padding: "8px 10px", borderRadius: 4, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
            <button onClick={() => {
              const nT = trips.filter(tr => tr.clientId === c.id).length, nI = invoices.filter(i => i.clientId === c.id).length;
              if (nT > 0 || nI > 0) { window.alert(`${c.companyName} tiene ${nT} viaje(s) y ${nI} factura(s). No se puede eliminar: márcalo como inactivo para conservar el historial.`); return; }
              if (!window.confirm(`¿Eliminar el cliente ${c.companyName}? Esta acción no se puede deshacer.`)) return;
              setClients(clients.filter(x => x.id !== c.id));
            }} style={{ padding: "8px 10px", borderRadius: 4, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
          </Td>
        </tr>)}</tbody>
      </table>
      </div>
      {clients.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noClients}</div>}
    </Card>
  </div>;
}

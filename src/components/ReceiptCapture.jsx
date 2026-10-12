import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, X, CheckCircle2, AlertTriangle, RotateCw, Loader2 } from "lucide-react";
import { colors } from "../constants/theme.js";
import { today as todayStr } from "../utils/helpers.js";
import { preparePhoto } from "../utils/photoQuality.js";
import { RECEIPT_CATEGORIES } from "../utils/receipts.js";
import { scanReceipt, submitReceipt, notifyReceiptsChanged } from "../utils/receiptsApi.js";
import { Inp, Sel, Btn } from "./ui/index.jsx";

const CAT_LABEL = { fuel: "Combustible", toll: "Peaje", tire: "Gomas", repair: "Reparación / piezas", maintenance: "Mantenimiento (aceite, lavado…)", other: "Otro (comida, etc.)" };
const TIPS = ["Pon el recibo sobre una superficie oscura y plana.", "Que se vea completo, de arriba abajo.", "Buena luz, sin sombra ni reflejo.", "Sostén el teléfono firme y toca la pantalla para enfocar."];

/**
 * Subir la foto de un gasto: foto → revisión de calidad → lectura → el chofer revisa → se envía a la oficina.
 * trucks: camiones que puede elegir · trips: sus viajes · defaultTruckId: su camión.
 */
export default function ReceiptCapture({ trucks = [], trips = [], defaultTruckId = null, onClose, onSubmitted }) {
  const camRef = useRef(null), galRef = useRef(null);
  const [step, setStep] = useState("pick"); // pick | checking | reading | bad | form | sending | done
  const [problems, setProblems] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState("");
  const [photo, setPhoto] = useState(null);   // resultado de preparePhoto
  const [badPreview, setBadPreview] = useState(null);
  const [scan, setScan] = useState(null);     // { id, read, aiEnabled, aiFailed }
  const [form, setForm] = useState({});
  const [sent, setSent] = useState(null);

  const pick = (ref) => { setError(""); ref.current && (ref.current.value = "", ref.current.click()); };

  const read = async (prep) => {
    setStep("reading"); setError("");
    try {
      const r = await scanReceipt({ image: prep.base64, hash: prep.hash, metrics: prep.metrics, width: prep.width, height: prep.height });
      setScan(r);
      const rd = r.read || {};
      setForm({
        category: rd.category || "fuel", amount: rd.amount ?? "", date: rd.date || todayStr(), vendor: rd.vendor || "",
        gallons: rd.gallons ?? "", ncf: rd.ncf || "", rnc: rd.rnc || "", itbis: rd.itbis ?? "",
        truckId: defaultTruckId || (trucks.length === 1 ? trucks[0].id : ""), tripId: "", note: "",
      });
      setStep("form");
    } catch (e) {
      if (e.problems?.length) { setProblems(e.problems); setBadPreview(prep.previewUrl); setStep("bad"); return; }
      setError(e.message || "No se pudo subir la foto"); setStep("retry");
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStep("checking"); setProblems([]); setWarnings([]); setError("");
    const prep = await preparePhoto(file);
    if (!prep.ok) {
      setProblems(prep.problems); setBadPreview(URL.createObjectURL(file)); setStep("bad"); return;
    }
    setWarnings(prep.warnings || []); setPhoto(prep);
    await read(prep);
  };

  const send = async () => {
    setStep("sending"); setError("");
    try {
      const r = await submitReceipt(scan.id, { ...form, truckId: form.truckId ? Number(form.truckId) : null, tripId: form.tripId ? Number(form.tripId) : null });
      setSent(r.receipt); setStep("done"); notifyReceiptsChanged(); onSubmitted?.(r.receipt);
    } catch (e) {
      setError(e.errors?.join(" ") || e.message || "No se pudo enviar"); setStep("form");
    }
  };

  const rd = scan?.read || null;
  const fromPhoto = (k) => rd && rd[k] !== null && rd[k] !== undefined && rd[k] !== "";
  const changed = (k) => fromPhoto(k) && String(rd[k]).toLowerCase() !== String(form[k] ?? "").toLowerCase();
  const tag = (k) => !rd ? null : changed(k)
    ? <span style={{ color: colors.orange, fontSize: 10 }}> · cambiado (la oficina lo verá)</span>
    : fromPhoto(k) ? <span style={{ color: colors.green, fontSize: 10 }}> · leído de la foto ✓</span> : null;
  const myTrips = trips.filter(t => t.status !== "cancelled").slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 15);

  const Inputs = <>
    <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} data-receipt-input="camera" />
    <input ref={galRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} data-receipt-input="gallery" />
  </>;
  const PickButtons = ({ again }) => <div style={{ display: "grid", gap: 10 }}>
    <Btn onClick={() => pick(camRef)} style={{ justifyContent: "center", minHeight: 56, fontSize: 15 }}><Camera size={20} /> {again ? "Tomar otra foto" : "Tomar foto del recibo"}</Btn>
    <Btn variant="ghost" onClick={() => pick(galRef)} style={{ justifyContent: "center" }}><ImageIcon size={16} /> Elegir de la galería</Btn>
  </div>;

  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => step !== "sending" && step !== "reading" && onClose?.()}>
    <div onClick={e => e.stopPropagation()} data-receipt-modal style={{ background: colors.card, borderRadius: 14, padding: 20, width: "min(520px, calc(100vw - 16px))", maxHeight: "92vh", overflowY: "auto", border: `1px solid ${colors.border}` }}>
      {Inputs}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}><Camera size={18} color={colors.orange} /> Foto de gasto</h3>
        <button onClick={() => onClose?.()} disabled={step === "sending" || step === "reading"} aria-label="Cerrar" style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", minWidth: 44, minHeight: 44 }}><X size={18} /></button>
      </div>

      {step === "pick" && <>
        <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 12 }}>Toma la foto del recibo o factura. Se lee sola y la oficina la aprueba.</div>
        <ul style={{ margin: "0 0 16px", paddingLeft: 18, fontSize: 12, color: colors.textMuted, lineHeight: 1.6 }}>{TIPS.map(t => <li key={t}>{t}</li>)}</ul>
        <PickButtons />
      </>}

      {(step === "checking" || step === "reading") && <div style={{ textAlign: "center", padding: "30px 10px" }} data-receipt-step={step}>
        <Loader2 size={32} color={colors.accent} style={{ animation: "spin 1s linear infinite" }} />
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        <div style={{ marginTop: 12, fontSize: 14 }}>{step === "checking" ? "Revisando que la foto se vea bien…" : "Leyendo el recibo…"}</div>
      </div>}

      {step === "retry" && <div data-receipt-step="retry">
        <div style={{ color: colors.red, fontSize: 13, marginBottom: 12 }}>{error}</div>
        <div style={{ display: "flex", gap: 8 }}><Btn onClick={() => read(photo)}><RotateCw size={14} /> Reintentar</Btn><Btn variant="ghost" onClick={() => setStep("pick")}>Otra foto</Btn></div>
      </div>}

      {step === "bad" && <div data-receipt-step="bad">
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          {badPreview && <img src={badPreview} alt="" style={{ width: 90, height: 120, objectFit: "cover", borderRadius: 8, border: `2px solid ${colors.red}`, flexShrink: 0 }} />}
          <div>
            <div style={{ fontWeight: 700, color: colors.red, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><AlertTriangle size={16} /> Esta foto no sirve</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }} data-receipt-problems>{problems.map(p => <li key={p}>{p}</li>)}</ul>
          </div>
        </div>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>{TIPS.join(" ")}</div>
        <PickButtons again />
      </div>}

      {(step === "form" || step === "sending") && <div data-receipt-step="form">
        <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
          {photo?.previewUrl && <img src={photo.previewUrl} alt="Recibo" style={{ width: 80, height: 107, objectFit: "cover", borderRadius: 8, border: `1px solid ${colors.border}`, flexShrink: 0 }} />}
          <div style={{ fontSize: 12, color: colors.textMuted }}>
            {rd ? "Revisa lo que se leyó. Si algo está mal, corrígelo: la oficina verá qué cambiaste." : scan?.aiFailed
              ? "No se pudo leer automáticamente ahora. Escribe los datos tal como están en el recibo; la oficina los compara con la foto."
              : "Escribe los datos tal como están en el recibo; la oficina los compara con la foto."}
            {warnings.map(w => <div key={w} style={{ color: colors.orange, marginTop: 4 }}>{w}</div>)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}><Sel label={<>Tipo de gasto{tag("category")}</>} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} data-field="category">
            {RECEIPT_CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
          </Sel></div>
          <Inp label={<>Monto total RD$ *{tag("amount")}</>} type="number" inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} data-field="amount" />
          <Inp label={<>Fecha *{tag("date")}</>} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} data-field="date" />
          <div style={{ gridColumn: "1 / -1" }}><Inp label={<>Negocio / estación *{tag("vendor")}</>} value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} data-field="vendor" /></div>
          {form.category === "fuel" && <Inp label={<>Galones *{tag("gallons")}</>} type="number" inputMode="decimal" value={form.gallons} onChange={e => setForm({ ...form, gallons: e.target.value })} data-field="gallons" />}
          <Sel label={form.category === "fuel" ? "Camión *" : "Camión"} value={form.truckId || ""} onChange={e => setForm({ ...form, truckId: e.target.value })} data-field="truckId">
            <option value="">— Elegir —</option>
            {trucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}{tk.size ? ` (${tk.size})` : ""}</option>)}
          </Sel>
          <div style={{ gridColumn: "1 / -1" }}><Sel label="Viaje (opcional)" value={form.tripId || ""} onChange={e => setForm({ ...form, tripId: e.target.value })} data-field="tripId">
            <option value="">— Sin viaje (solo el camión) —</option>
            {myTrips.map(tr => <option key={tr.id} value={tr.id}>#{tr.id} · {tr.date} · {tr.municipality}</option>)}
          </Sel></div>
          <Inp label={<>NCF (si tiene){tag("ncf")}</>} value={form.ncf} onChange={e => setForm({ ...form, ncf: e.target.value })} data-field="ncf" />
          <Inp label="Nota (opcional)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} data-field="note" />
        </div>
        {error && <div style={{ color: colors.red, fontSize: 12, marginTop: 10, padding: "6px 10px", background: colors.red + "12", borderRadius: 6 }} data-receipt-error>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <Btn onClick={send} disabled={step === "sending"} style={{ flex: 1, justifyContent: "center" }} data-receipt-send>{step === "sending" ? "Enviando…" : "Enviar a la oficina"}</Btn>
          <Btn variant="ghost" onClick={() => setStep("pick")} disabled={step === "sending"}>Otra foto</Btn>
        </div>
      </div>}

      {step === "done" && <div style={{ textAlign: "center", padding: "20px 6px" }} data-receipt-step="done">
        <CheckCircle2 size={40} color={colors.green} />
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>Enviado a la oficina</div>
        <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 6 }}>Queda «por revisar». Cuando lo aprueben aparece en tus recibos como aprobado.</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <Btn onClick={() => { setStep("pick"); setScan(null); setPhoto(null); setSent(null); }}><Camera size={14} /> Otro recibo</Btn>
          <Btn variant="ghost" onClick={() => onClose?.()}>Listo</Btn>
        </div>
        {sent && <div style={{ display: "none" }} data-receipt-sent-id={sent.id} />}
      </div>}
    </div>
  </div>;
}

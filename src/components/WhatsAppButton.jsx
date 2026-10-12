import { useEffect, useState } from "react";
import { MessageCircle, Check } from "lucide-react";
import { colors } from "../constants/theme.js";
import { getToken } from "../api.js";
import { openWhatsApp, waPhone } from "../utils/whatsapp.js";
import { templateParams, templateText } from "../utils/whatsappTemplates.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
let statusPromise = null; // una sola consulta por sesión
export function whatsappStatus() {
  if (!statusPromise) statusPromise = fetch(`${API_BASE}/api/whatsapp/status`, { headers: { Authorization: `Bearer ${getToken()}` } })
    .then(r => (r.ok ? r.json() : { enabled: false })).catch(() => ({ enabled: false }));
  return statusPromise;
}

/**
 * Botón de WhatsApp para una persona. Si el envío automático está configurado (API de Meta) y la persona tiene teléfono,
 * manda la plantilla sin salir de la app; si no, abre WhatsApp con el mensaje ya escrito para que solo le den enviar.
 */
export default function WhatsAppButton({ phone, name = "", template, data, label = "WhatsApp", compact = false, style, testId }) {
  const [auto, setAuto] = useState(false);
  const [state, setState] = useState(""); // "", "sending", "sent", "error:<msg>"
  useEffect(() => { let on = true; whatsappStatus().then(s => { if (on) setAuto(!!s.enabled); }); return () => { on = false; }; }, []);
  const hasPhone = !!waPhone(phone);

  const click = async () => {
    if (auto && hasPhone) {
      if (!window.confirm(`¿Enviar por WhatsApp a ${name || phone}?`)) return;
      setState("sending");
      try {
        const r = await fetch(`${API_BASE}/api/whatsapp/send`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ to: phone, template, params: templateParams(template, data) }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
        setState("sent");
      } catch (e) {
        setState(`error:${e.message}`);
        if (window.confirm(`No se pudo enviar automático (${e.message}). ¿Abrir WhatsApp con el mensaje listo?`)) openWhatsApp(phone, templateText(template, data));
      }
      return;
    }
    if (!hasPhone) window.alert(`${name || "Esta persona"} no tiene un teléfono válido guardado en la app: WhatsApp te pedirá elegir el contacto.`);
    openWhatsApp(phone, templateText(template, data));
  };

  const sent = state === "sent";
  return <button type="button" onClick={click} disabled={state === "sending"} data-wa={testId || template} data-wa-mode={auto && hasPhone ? "auto" : "link"}
    title={auto && hasPhone ? "Se envía automático por WhatsApp" : hasPhone ? "Abre WhatsApp con el mensaje listo" : "Sin teléfono guardado: WhatsApp pedirá el contacto"}
    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: compact ? "4px 8px" : "7px 12px", minHeight: compact ? 30 : 36, borderRadius: 8, border: `1px solid ${colors.green}55`, background: sent ? colors.green : colors.green + "18", color: sent ? "white" : colors.green, cursor: "pointer", fontSize: compact ? 11 : 12, fontWeight: 600, ...style }}>
    {sent ? <Check size={12} /> : <MessageCircle size={12} />} {state === "sending" ? "Enviando…" : sent ? "Enviado" : label}{!hasPhone && !compact ? " (sin teléfono)" : ""}
  </button>;
}

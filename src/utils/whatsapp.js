/**
 * WhatsApp: enlaces que abren WhatsApp (o WhatsApp Business) con el mensaje ya escrito para una persona.
 * Números de RD (809/829/849, 10 dígitos) → +1; con código de país se respetan. Sin número válido → WhatsApp pide el contacto.
 */
export function waPhone(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && /^(809|829|849)/.test(d)) return `1${d}`;
  if (d.length === 11 && d.startsWith("1")) return d;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

export function waLink(phone, text) {
  const p = waPhone(phone);
  return `https://wa.me/${p || ""}?text=${encodeURIComponent(String(text || ""))}`;
}

/** Abre WhatsApp en otra pestaña o app. Devuelve false si no tenía número válido (igual se abre para elegir el contacto). */
export function openWhatsApp(phone, text) {
  const url = waLink(phone, text);
  try { window.open(url, "_blank", "noopener"); } catch { /* sin ventana */ }
  return !!waPhone(phone);
}

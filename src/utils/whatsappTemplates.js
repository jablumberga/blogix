/**
 * Mensajes de WhatsApp de la app. Cada uno sirve de dos maneras con los mismos datos:
 *   - text(d):   mensaje completo para abrir WhatsApp con el texto listo (wa.me), sin configurar nada
 *   - params(d): variables {{1}}, {{2}}… de la plantilla aprobada en Meta, para el envío automático (API de WhatsApp)
 * body = texto EXACTO que se registra en Meta (WhatsApp Manager → Plantillas, categoría «Utilidad», idioma español).
 * Meta no acepta variables vacías ni con saltos de línea: clean() lo arregla.
 */

export const clean = (v, max = 300) => {
  const s = String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
  return (s || "—").slice(0, max);
};
const money = (n) => `RD$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const WA_TEMPLATES = {
  constancia_entrega: {
    label: "Constancia de entrega",
    body: "Hola {{1}}, {{2}} recibió {{3}} documento(s) tuyos el {{4}} (entrega {{5}} de la quincena {{6}}). Acumulado de la quincena: {{7}}. Pendientes por entregar: {{8}}.",
    params: (d) => [d.name, d.company, d.newCount, d.date, d.visitNo, d.period, d.totalCount, d.pendingCount],
    text: (d) => d.fullText,
  },
  documentos_pendientes: {
    label: "Recordatorio de documentos pendientes",
    body: "Hola {{1}}, en {{2}} tenemos pendientes {{3}} documento(s) de tus viajes: {{4}}. Entrégalos en la oficina para que entren en la nómina.",
    params: (d) => [d.name, d.company, d.count, d.list],
    text: (d) => `Hola ${d.name}, en ${d.company} tenemos pendientes ${plural(d.count, "documento", "documentos")} de tus viajes:\n${d.lines.join("\n")}\n\nEntrégalos en la oficina para que entren en la nómina.`,
  },
  recibo_rechazado: {
    label: "Recibo rechazado",
    body: "Hola {{1}}, tu recibo de {{2}} por {{3}} del {{4}} fue rechazado en la oficina. Motivo: {{5}}. Sube una foto nueva desde la app.",
    params: (d) => [d.name, d.category, money(d.amount), d.date, d.reason],
    text: (d) => `Hola ${d.name}, tu recibo de ${d.category} por ${money(d.amount)} del ${d.date} fue rechazado en la oficina.\nMotivo: ${d.reason}\nSube una foto nueva desde la app (Foto de gasto).`,
  },
  pago_quincena: {
    label: "Pago de la quincena (chofer)",
    body: "Hola {{1}}, tu pago de la quincena {{2}} en {{3}}: {{4}} viaje(s) recibido(s), neto {{5}} ({{6}}). Si tienes dudas, pide tu relación en la oficina.",
    params: (d) => [d.name, d.period, d.company, d.trips, money(d.net), d.paid ? "pagado" : "por transferir"],
    text: (d) => `Hola ${d.name}, tu pago de la quincena ${d.period} en ${d.company}:\n• ${plural(d.trips, "viaje recibido", "viajes recibidos")}\n${d.advances ? `• Adelantos: −${money(d.advances)}\n` : ""}• Neto: *${money(d.net)}* (${d.paid ? "pagado" : "por transferir"})\nSi tienes dudas, pide tu relación en la oficina.`,
  },
  pago_ayudante: {
    label: "Relación de pago (ayudante)",
    body: "Hola {{1}}, tu relación de pago de la quincena {{2}} en {{3}}: {{4}} viaje(s), adelantos {{5}}, neto {{6}} ({{7}}).",
    params: (d) => [d.name, d.period, d.company, d.trips, money(d.advances), money(d.net), d.paid ? "pagado" : "por pagar"],
    text: (d) => `Hola ${d.name}, tu relación de pago de la quincena ${d.period} en ${d.company}:\n${d.lines.join("\n")}\n\n• ${plural(d.trips, "viaje", "viajes")} · bruto ${money(d.gross)}\n${d.advances ? `• Adelantos: −${money(d.advances)}\n` : ""}• Neto: *${money(d.net)}* (${d.paid ? "pagado" : "por pagar"})`,
  },
};

/** Variables listas para la API (limpias, como texto). */
export const templateParams = (key, data) => (WA_TEMPLATES[key]?.params(data) || []).map(v => clean(v));
/** Texto para abrir WhatsApp con el mensaje listo. */
export const templateText = (key, data) => String(WA_TEMPLATES[key]?.text(data) || "");
/** Cuántas variables espera cada plantilla (las cuenta en el texto de Meta). */
export const templateArity = (key) => new Set((WA_TEMPLATES[key]?.body.match(/\{\{\d+\}\}/g) || [])).size;

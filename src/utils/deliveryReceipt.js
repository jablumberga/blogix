/**
 * Constancia de entrega de documentos (acuse de recibo), individual por chofer o socio. Sin montos.
 *
 * Cada vez que la oficina marca documentos recibidos queda la hora (docsReceivedTs). Las marcas de una misma
 * persona con menos de 2 horas entre sí son UNA entrega (visita). La constancia es acumulada por quincena:
 *   1.ª entrega de la quincena → lo que trajo;  2.ª → lo de la 1.ª + lo nuevo (marcado);  y así sucesivamente.
 * Quincena = la de la fecha de recepción (1–15 / 16–fin), que es la quincena en que se pagan esos viajes.
 * Incluye lo que le falta por entregar (viajes sin documentos hasta la fecha de la entrega).
 *
 * Archivo puro: lo usan la pantalla de la oficina, el PDF y el texto de WhatsApp.
 */
import { docsComplete } from "./payroll.js";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const VISIT_GAP_MIN = 120;

/** Quincena de una fecha AAAA-MM-DD. */
export function quincenaOf(date) {
  const [y, m, d] = String(date).slice(0, 10).split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return d <= 15
    ? { dateFrom: `${y}-${mm}-01`, dateTo: `${y}-${mm}-15`, label: `1–15 de ${MONTHS[m - 1]} ${y}` }
    : { dateFrom: `${y}-${mm}-16`, dateTo: `${y}-${mm}-${last}`, label: `16–${last} de ${MONTHS[m - 1]} ${y}` };
}

/** Momento de recepción de un viaje (los marcados antes de existir la hora cuentan al mediodía de su fecha). */
export const receivedTs = (trip) => trip?.docsReceivedTs || (trip?.docsReceivedAt ? `${trip.docsReceivedAt}T12:00:00.000Z` : null);
const tsDate = (ts) => {
  // Fecha local de RD de un momento (las marcas viejas sin hora ya traen su fecha)
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts)); } catch { return String(ts).slice(0, 10); }
};
export const receivedDate = (trip) => trip?.docsReceivedAt || (trip?.docsReceivedTs ? tsDate(trip.docsReceivedTs) : null);

/** Viajes de la persona: del chofer, o de los camiones del socio. Sin cancelados. */
export function personTrips({ kind, id, trips = [], trucks = [] }) {
  if (kind === "partner") {
    const ids = new Set(trucks.filter(t => t.partnerId === id).map(t => t.id));
    return trips.filter(t => ids.has(t.truckId) && t.status !== "cancelled");
  }
  return trips.filter(t => t.driverId === id && t.status !== "cancelled");
}

/**
 * Entregas (visitas) de una persona en una quincena, de la más vieja a la más nueva.
 * → [{ no, startTs, endTs, date, by, tripIds:[...] }]
 */
export function deliveryVisits(list, { period, clientMap = new Map(), gapMin = VISIT_GAP_MIN }) {
  const got = list
    .filter(t => docsComplete(t, clientMap.get(t.clientId)) && receivedTs(t))
    .filter(t => { const d = receivedDate(t); return d >= period.dateFrom && d <= period.dateTo; })
    .map(t => ({ t, ts: receivedTs(t) }))
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.t.id - b.t.id);
  const visits = [];
  for (const { t, ts } of got) {
    const cur = visits[visits.length - 1];
    if (cur && (new Date(ts) - new Date(cur.endTs)) / 60000 <= gapMin && receivedDate(t) === cur.date) { cur.endTs = ts; cur.tripIds.push(t.id); if (!cur.by && t.docsReceivedBy) cur.by = t.docsReceivedBy; }
    else visits.push({ no: visits.length + 1, startTs: ts, endTs: ts, date: receivedDate(t), by: t.docsReceivedBy || "", tripIds: [t.id], legacy: !t.docsReceivedTs });
  }
  return visits;
}

/**
 * Constancia de una entrega: acumulado de la quincena hasta esa entrega, con lo nuevo marcado, y lo pendiente.
 * at: número de entrega en la quincena (por defecto la última). date: fecha de la quincena a mirar (por defecto hoy).
 * → null si no hay entregas en esa quincena.
 */
export function deliveryReceipt({ kind, person, trips = [], trucks = [], clients = [], drivers = [], date, at = null }) {
  const clientMap = new Map(clients.map(c => [c.id, c]));
  const truckMap = new Map(trucks.map(t => [t.id, t]));
  const driverMap = new Map(drivers.map(d => [d.id, d]));
  const period = quincenaOf(date);
  const list = personTrips({ kind, id: person.id, trips, trucks });
  const visits = deliveryVisits(list, { period, clientMap });
  if (!visits.length) return { period, visits, visit: null, items: [], newCount: 0, totalCount: 0, pending: [] };
  const visit = visits.find(v => v.no === at) || visits[visits.length - 1];
  const upTo = new Set(visits.filter(v => v.no <= visit.no).flatMap(v => v.tripIds));
  const fresh = new Set(visit.tripIds);
  const byId = new Map(list.map(t => [t.id, t]));
  const row = (t) => ({ trip: t, client: clientMap.get(t.clientId) || null, truck: truckMap.get(t.truckId) || null, driver: driverMap.get(t.driverId) || null });
  const items = [...upTo].map(id => byId.get(id)).filter(Boolean)
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.id - b.id)
    .map(t => ({ ...row(t), isNew: fresh.has(t.id), receivedDate: receivedDate(t), visitNo: visits.find(v => v.tripIds.includes(t.id))?.no || null }));
  // Pendientes: sin documentos completos (o recibidos después de esta entrega), con fecha de viaje hasta el día de la entrega
  const pending = list
    .filter(t => (t.date || "") <= visit.date && !upTo.has(t.id) && (!docsComplete(t, clientMap.get(t.clientId)) || (receivedTs(t) || "") > visit.endTs))
    .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.id - b.id)
    .map(row);
  return { period, visits, visit, items, newCount: fresh.size, totalCount: items.length, pending };
}

const fmtDate = (d) => { const [y, m, dd] = String(d || "").split("-"); return y ? `${dd}/${m}/${y}` : ""; };
export const fmtTime = (ts) => { try { return new Intl.DateTimeFormat("es-DO", { timeZone: "America/Santo_Domingo", hour: "numeric", minute: "2-digit" }).format(new Date(ts)); } catch { return ""; } };

const drToday = () => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); } };
/** Cuándo se pagan o liquidan los viajes recibidos (el chofer por la fecha de recepción; el socio por la fecha del viaje). */
export const payNote = (r, kind) => (kind === "partner"
  ? "En la liquidación del socio cada viaje cuenta en la quincena de su fecha de viaje."
  : `Estos viajes entran en la nómina de la quincena ${r.period.label}.`);

/** Texto corto para WhatsApp (sin montos). */
export function deliveryReceiptText(r, { name, company = "B-Logix", kind = "driver", today = drToday() } = {}) {
  if (!r?.visit) return "";
  const when = r.visit.date === today ? "hoy" : `el ${fmtDate(r.visit.date)}`;
  const lines = [];
  lines.push(`*${company} — Constancia de entrega de documentos*`);
  lines.push(`${name} · Quincena ${r.period.label}`);
  lines.push(`Entrega ${r.visit.no} de la quincena · ${fmtDate(r.visit.date)}${r.visit.legacy ? "" : ` ${fmtTime(r.visit.endTs)}`}${r.visit.by ? ` · Recibió: ${r.visit.by}` : ""}`);
  lines.push("");
  lines.push(`Entregaste ${when}: *${r.newCount}* · Acumulado de la quincena: *${r.totalCount}*`);
  for (const x of r.items) lines.push(`${x.isNew ? "🆕" : "✔"} ${fmtDate(x.trip.date)} · ${x.client?.companyName || "—"}${x.trip.invoiceRef ? ` · Ref ${x.trip.invoiceRef}` : ""} · ${x.trip.municipality || ""}`);
  if (r.pending.length) {
    lines.push("");
    lines.push(`Te faltan por entregar (${r.pending.length}):`);
    for (const x of r.pending.slice(0, 15)) lines.push(`• ${fmtDate(x.trip.date)} · ${x.client?.companyName || "—"}${x.trip.invoiceRef ? ` · Ref ${x.trip.invoiceRef}` : ""} · ${x.trip.municipality || ""}`);
    if (r.pending.length > 15) lines.push(`… y ${r.pending.length - 15} más`);
  }
  lines.push("");
  lines.push(payNote(r, kind));
  return lines.join("\n");
}

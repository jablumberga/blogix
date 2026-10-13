/**
 * GPS — TrackSolid Pro (Jimi IoT Open API), solo lectura.
 *
 *   POST /api/gps/sync   { dateFrom, dateTo }   (admin)
 *     → { ok, devices, gpsKm:[{id, imei, truckId, date, km}], tripKm:[{tripId, km}] }
 *
 * Variables de entorno (Netlify): TRACKSOLID_APP_KEY, TRACKSOLID_APP_SECRET, TRACKSOLID_ACCOUNT,
 *   TRACKSOLID_PASSWORD (o TRACKSOLID_PASSWORD_MD5), TRACKSOLID_NODE = us | hk | eu | ts (default us).
 *   TRACKSOLID_MOCK=true → datos simulados (solo para pruebas locales).
 *
 * La clave nunca sale del servidor. Los nombres de parámetros de la API (user_id, imeis, begin_time…)
 * están en un solo sitio (`CALLS`) por si Jimi los nombra distinto en tu cuenta.
 */
import crypto from "crypto";
import { verifyToken } from "./api.mjs";

const NODES = { ts: "http://open.10000track.com/route/rest", hk: "https://hk-open.tracksolidpro.com/route/rest", eu: "https://eu-open.tracksolidpro.com/route/rest", us: "https://us-open.tracksolidpro.com/route/rest" };
const md5 = (s) => crypto.createHash("md5").update(s, "utf8").digest("hex");
const utcStamp = (d = new Date()) => d.toISOString().slice(0, 19).replace("T", " ");

/** Firma Jimi: MD5(secret + claves/valores ordenados + secret) en mayúsculas. */
export function signParams(params, secret) {
  const sorted = Object.keys(params).filter(k => k !== "sign" && params[k] != null).sort();
  const joined = sorted.map(k => `${k}${params[k]}`).join("");
  return md5(`${secret}${joined}${secret}`).toUpperCase();
}

async function call(cfg, method, extra = {}) {
  const params = { method, timestamp: utcStamp(), app_key: cfg.appKey, sign_method: "md5", v: "1.0", format: "json", ...extra };
  params.sign = signParams(params, cfg.appSecret);
  const res = await fetch(cfg.base, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || Number(j.code) !== 0) throw new Error(`${method}: ${j.message || j.msg || `HTTP ${res.status}`} (code ${j.code})`);
  return j.result;
}

const CALLS = {
  token:   (cfg) => call(cfg, "jimi.oauth.token.get", { user_id: cfg.account, user_pwd_md5: cfg.pwdMd5, expires_in: 7200 }),
  devices: (cfg, token) => call(cfg, "jimi.user.device.list", { access_token: token, target: cfg.account }),
  // begin/end ya en UTC (la API trabaja en UTC); start_row/page_size solo para pedir la página siguiente
  mileage: (cfg, token, imeis, begin, end, page = null) => call(cfg, "jimi.device.track.mileage", { access_token: token, imeis: imeis.join(","), begin_time: begin, end_time: end, ...(page ? { start_row: page.start, page_size: page.size } : {}) }),
};

/** Hora de RD: UTC−4 todo el año (sin horario de verano). Se puede cambiar con GPS_UTC_OFFSET_HOURS. */
export const RD_OFFSET = -4;
/** Días locales [from, to] → rango en UTC para la API (el fin nunca después de ahora, como exige Jimi). */
export function utcRange(from, to, { now = new Date(), tz = RD_OFFSET } = {}) {
  const begin = new Date(Date.parse(`${from}T00:00:00Z`) - tz * 3600e3);
  let end = new Date(Date.parse(`${to}T23:59:59Z`) - tz * 3600e3);
  const cap = new Date(now.getTime() - 60e3);
  if (end > cap) end = cap;
  return { begin: utcStamp(begin), end: utcStamp(end), empty: begin >= end };
}
/** Fecha local (RD) de una hora UTC «yyyy-MM-dd HH:mm:ss». */
export function localDate(utc, tz = RD_OFFSET) {
  const t = Date.parse(String(utc || "").trim().replace(" ", "T") + "Z");
  return Number.isFinite(t) ? new Date(t + tz * 3600e3).toISOString().slice(0, 10) : String(utc || "").slice(0, 10);
}
/** Km de un trayecto. La Open API manda «distance» en METROS; otras versiones mandan «totalMileage» en km. */
export function kmOf(it = {}) {
  const n = (v) => { const x = Number(String(v ?? "").replace(/,/g, ".").replace(/[^\d.]/g, "")); return Number.isFinite(x) && x > 0 ? x : 0; };
  if (n(it.distance) > 0) return n(it.distance) / 1000;
  for (const f of ["totalMileage", "mileage", "totalDistance"]) {
    const v = n(it[f]);
    if (v > 0) return v > 2000 ? v / 1000 : v; // >2,000 km en un solo trayecto es imposible: venía en metros
  }
  return 0;
}

/** Agrupa trayectos del GPS por imei+fecha → km diarios; y por fecha para cruzar con viajes. */
export function summarize(items = [], tz = RD_OFFSET) {
  const daily = new Map();
  for (const it of items) {
    const date = it.startTime ? localDate(it.startTime, tz) : ""; const km = kmOf(it);
    if (!date || !it.imei) continue;
    const k = `${it.imei}|${date}`;
    daily.set(k, { imei: String(it.imei), date, km: Math.round(((daily.get(k)?.km || 0) + km) * 10) / 10 });
  }
  return [...daily.values()];
}

/** Asigna km del GPS a los viajes: viaje = camión con IMEI + fecha; si hay varios viajes ese día se reparte a partes iguales. */
export function assignTripKm(daily, trips, trucks) {
  const imeiOf = new Map(trucks.filter(t => t.gpsImei).map(t => [t.id, String(t.gpsImei)]));
  const byKey = new Map(daily.map(d => [`${d.imei}|${d.date}`, d.km]));
  const groups = new Map();
  for (const t of trips) { if (t.status === "cancelled") continue; const imei = imeiOf.get(t.truckId); if (!imei) continue; const k = `${imei}|${t.date}`; if (!(byKey.get(k) > 0)) continue; groups.set(k, [...(groups.get(k) || []), t.id]); } // 0 km no se pone (no tapa odómetro ni distancia de referencia)
  const out = [];
  for (const [k, ids] of groups) { const km = Math.round(byKey.get(k) / ids.length * 10) / 10; for (const id of ids) out.push({ tripId: id, km }); }
  return out;
}

function mockItems(trucks, from, to) {
  const out = []; const d0 = new Date(from + "T12:00:00"), d1 = new Date(to + "T12:00:00");
  for (const t of trucks) { if (!t.gpsImei) continue; for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) { const day = d.toISOString().slice(0, 10); if (d.getDay() === 0) continue; out.push({ imei: String(t.gpsImei), startTime: `${day} 11:10:00`, endTime: `${day} 19:40:00`, elapsed: 30600, distance: (180 + (Number(t.id) * 37 + d.getDate() * 11) % 160) * 1000, avgSpeed: 40 }); } } // como la Open API: hora UTC y metros
  return out;
}

function supaHeaders(key) { return { "Content-Type": "application/json", "apikey": key, "Authorization": `Bearer ${key}` }; }
async function readTable(url, key, table) { const r = await fetch(`${url}/rest/v1/${table}?select=rec&order=id`, { headers: supaHeaders(key) }); if (!r.ok) throw new Error(`${table} ${r.status}`); return (await r.json()).map(x => x.rec); }

export default async (request) => {
  const origin = request.headers.get("origin") || "*";
  const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: cors });
  const { BLOGIX_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY, TRACKSOLID_APP_KEY, TRACKSOLID_APP_SECRET, TRACKSOLID_ACCOUNT, TRACKSOLID_PASSWORD, TRACKSOLID_PASSWORD_MD5, TRACKSOLID_NODE, TRACKSOLID_MOCK } = process.env;
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const session = token && BLOGIX_SECRET ? await verifyToken(token, BLOGIX_SECRET) : null;
  if (!session || session.role !== "admin") return Response.json({ error: "Solo el administrador" }, { status: 403, headers: cors });
  let body; try { body = await request.json(); } catch { body = {}; }
  const dateFrom = String(body.dateFrom || "").slice(0, 10), dateTo = String(body.dateTo || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) return Response.json({ error: "dateFrom/dateTo inválidos" }, { status: 400, headers: cors });

  let trucks = [], trips = [], existing = [];
  try { [trucks, trips, existing] = await Promise.all([readTable(SUPABASE_URL, SUPABASE_SERVICE_KEY, "bl_trucks"), readTable(SUPABASE_URL, SUPABASE_SERVICE_KEY, "bl_trips"), readTable(SUPABASE_URL, SUPABASE_SERVICE_KEY, "bl_gps_km").catch(() => [])]); }
  catch (e) { return Response.json({ error: `No se pudo leer la base: ${e.message}` }, { status: 500, headers: cors }); }
  const withGps = trucks.filter(t => t.gpsImei);
  if (withGps.length === 0) return Response.json({ error: "Ningún camión tiene IMEI de GPS (ponlo en Flota)" }, { status: 400, headers: cors });

  const tz = process.env.GPS_UTC_OFFSET_HOURS != null && process.env.GPS_UTC_OFFSET_HOURS !== "" && Number.isFinite(Number(process.env.GPS_UTC_OFFSET_HOURS)) ? Number(process.env.GPS_UTC_OFFSET_HOURS) : RD_OFFSET;
  const range = utcRange(dateFrom, dateTo, { tz });
  if (range.empty) return Response.json({ ok: true, devices: withGps.length, items: 0, totalKm: 0, gpsKm: [], tripKm: [], note: "Ese período todavía no ha empezado" }, { headers: cors });
  let items = [], devices = withGps.length, pages = 0;
  if (TRACKSOLID_MOCK === "true") items = mockItems(withGps, dateFrom, localDate(range.end, tz) < dateTo ? localDate(range.end, tz) : dateTo);
  else {
    if (!TRACKSOLID_APP_KEY || !TRACKSOLID_APP_SECRET || !TRACKSOLID_ACCOUNT || !(TRACKSOLID_PASSWORD || TRACKSOLID_PASSWORD_MD5)) return Response.json({ error: "TrackSolid no está configurado (faltan TRACKSOLID_APP_KEY / APP_SECRET / ACCOUNT / PASSWORD)" }, { status: 501, headers: cors });
    const cfg = { appKey: TRACKSOLID_APP_KEY, appSecret: TRACKSOLID_APP_SECRET, account: TRACKSOLID_ACCOUNT, pwdMd5: TRACKSOLID_PASSWORD_MD5 || md5(TRACKSOLID_PASSWORD), base: NODES[(TRACKSOLID_NODE || "us").toLowerCase()] || NODES.us };
    try {
      const tk = await CALLS.token(cfg); const access = tk?.accessToken || tk?.access_token;
      if (!access) throw new Error("sin access_token");
      const list = await CALLS.devices(cfg, access).catch(() => null);
      if (Array.isArray(list)) devices = list.length;
      const imeis = withGps.map(t => String(t.gpsImei));
      const seen = new Set(); const key = (it) => `${it.imei}|${it.startTime}|${it.endTime}`;
      const add = (list) => { let n = 0; for (const it of Array.isArray(list) ? list : []) { const k = key(it); if (!seen.has(k)) { seen.add(k); items.push(it); n++; } } return n; };
      for (let i = 0; i < imeis.length; i += 20) {
        const batch = imeis.slice(i, i + 20);
        const first = await CALLS.mileage(cfg, access, batch, range.begin, range.end); pages++;
        add(first);
        // Si la respuesta parece cortada por página (número redondo), se piden las siguientes; los repetidos se descartan
        let size = Array.isArray(first) ? first.length : 0, start = size;
        while (size >= 20 && size % 10 === 0 && pages < 30) {
          const more = await CALLS.mileage(cfg, access, batch, range.begin, range.end, { start, size }).catch(() => null); pages++;
          if (!Array.isArray(more) || add(more) === 0) break;
          start += more.length; if (more.length < size) break;
        }
      }
    } catch (e) { return Response.json({ error: `TrackSolid: ${e.message}` }, { status: 502, headers: cors }); }
  }

  const daily = summarize(items, tz);
  const fields = items.length ? Object.keys(items[0]).filter(k => !/lat|lng|lon/i.test(k)) : []; // para diagnosticar si el GPS manda otro formato
  // Persistir km diarios (id estable por imei+fecha)
  let nextId = existing.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  const byKey = new Map(existing.map(r => [`${r.imei}|${r.date}`, r]));
  const rows = daily.map(d => { const prev = byKey.get(`${d.imei}|${d.date}`); const truckId = withGps.find(t => String(t.gpsImei) === d.imei)?.id || null; return { ...(prev || {}), id: prev?.id || nextId++, imei: d.imei, date: d.date, km: d.km, truckId, syncedAt: new Date().toISOString() }; });
  if (rows.length) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/bl_gps_km`, { method: "POST", headers: { ...supaHeaders(SUPABASE_SERVICE_KEY), "Prefer": "resolution=merge-duplicates" }, body: JSON.stringify(rows.map(x => ({ id: x.id, rec: x }))) });
    if (!r.ok) return Response.json({ error: `No se pudo guardar km: ${await r.text()}` }, { status: 500, headers: cors });
  }
  // Km a los viajes (solo días con km > 0; el GPS manda sobre el odómetro, como en Costo por km)
  const tripKm = assignTripKm(daily, trips.filter(t => t.date >= dateFrom && t.date <= dateTo), trucks);
  for (const { tripId, km } of tripKm) {
    const tr = trips.find(t => t.id === tripId); if (!tr) continue;
    await fetch(`${SUPABASE_URL}/rest/v1/bl_trips?id=eq.${tripId}`, { method: "PATCH", headers: { ...supaHeaders(SUPABASE_SERVICE_KEY), "Prefer": "return=minimal" }, body: JSON.stringify({ rec: { ...tr, km, kmSource: "gps" } }) });
  }
  const totalKm = Math.round(daily.reduce((t, d) => t + d.km, 0) * 10) / 10;
  if (items.length && !totalKm) console.warn("GPS: trayectos sin km", JSON.stringify({ items: items.length, fields }));
  return Response.json({ ok: true, mock: TRACKSOLID_MOCK === "true", devices, items: items.length, pages, fields, totalKm, range, gpsKm: rows, tripKm }, { headers: cors });
};

export const config = { path: "/api/gps/sync" };

/**
 * GPS — TrackSolid Pro (Jimi IoT Open API), solo lectura.
 *
 *   POST /api/gps/sync   { dateFrom, dateTo }   (admin, máx. MAX_DAYS días por llamada: la pantalla pide por tramos)
 *     → { ok, devices, days:[fechas consultadas], failed:[{date, error}], gpsKm:[{id, imei, truckId, date, km, syncedAt}] }
 *   Se consulta DÍA POR DÍA (la API corta rangos largos). Un día consultado sin movimiento se guarda con 0 km, así se
 *   sabe qué días ya están traídos. Los km NO se escriben en los viajes: Costo por km reparte los km diarios entre los
 *   viajes (cada viaje se lleva del día del viaje al día antes del próximo viaje del camión).
 *
 * Variables de entorno (Netlify): TRACKSOLID_APP_KEY, TRACKSOLID_APP_SECRET, TRACKSOLID_ACCOUNT,
 *   TRACKSOLID_PASSWORD (o TRACKSOLID_PASSWORD_MD5), TRACKSOLID_NODE = us | hk | eu | ts (default us).
 *   TRACKSOLID_MOCK=true → datos simulados (solo para pruebas locales).
 *
 * La clave nunca sale del servidor. Los nombres de parámetros de la API (user_id, imeis, begin_time…)
 * están en un solo sitio (`CALLS`) por si Jimi los nombra distinto en tu cuenta.
 */
import crypto from "crypto";
import { verifyToken, readAllRows } from "./api.mjs";

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

/** Token de TrackSolid reutilizado mientras la función siga caliente (dura 2 h). */
let tokenCache = null;
async function getAccess(cfg, fresh = false) {
  const k = `${cfg.base}|${cfg.appKey}|${cfg.account}`;
  if (!fresh && tokenCache && tokenCache.k === k && tokenCache.exp > Date.now()) return { token: tokenCache.token, cached: true };
  const tk = await CALLS.token(cfg); const token = tk?.accessToken || tk?.access_token;
  if (!token) throw new Error("sin access_token");
  tokenCache = { k, token, exp: Date.now() + 100 * 60e3 };
  return { token, cached: false };
}
export const MAX_DAYS = 8;
/** Días locales de un rango (incluidos). */
export function daysOf(from, to, max = 400) {
  const out = []; let d = from;
  while (d <= to && out.length < max) { out.push(d); const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); d = x.toISOString().slice(0, 10); }
  return out;
}
/** Corre fn sobre la lista con n a la vez. */
async function pool(list, n, fn) {
  const out = new Array(list.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } }));
  return out;
}

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

function mockItems(trucks, from, to) {
  const out = []; const d0 = new Date(from + "T12:00:00"), d1 = new Date(to + "T12:00:00");
  for (const t of trucks) { if (!t.gpsImei) continue; for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) { const day = d.toISOString().slice(0, 10); if (d.getDay() === 0) continue; out.push({ imei: String(t.gpsImei), startTime: `${day} 11:10:00`, endTime: `${day} 19:40:00`, elapsed: 30600, distance: (180 + (Number(t.id) * 37 + d.getDate() * 11) % 160) * 1000, avgSpeed: 40 }); } } // como la Open API: hora UTC y metros
  return out;
}

function supaHeaders(key) { return { "Content-Type": "application/json", "apikey": key, "Authorization": `Bearer ${key}` }; }
async function readTable(url, key, table) { const r = await readAllRows(url, key, table); if (!r.ok) throw new Error(`${table} ${r.res.status}`); return r.rows.map(x => x.rec); } // todas las filas (más de 1,000 también)

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

  let trucks = [], existing = [];
  try { [trucks, existing] = await Promise.all([readTable(SUPABASE_URL, SUPABASE_SERVICE_KEY, "bl_trucks"), readTable(SUPABASE_URL, SUPABASE_SERVICE_KEY, "bl_gps_km").catch(e => { if (/ 40[46]$/.test(e.message)) return []; throw e; })]); }
  catch (e) { return Response.json({ error: `No se pudo leer la base: ${e.message}` }, { status: 500, headers: cors }); }
  const withGps = trucks.filter(t => t.gpsImei);
  if (withGps.length === 0) return Response.json({ error: "Ningún camión tiene IMEI de GPS (ponlo en Flota)" }, { status: 400, headers: cors });

  const tz = process.env.GPS_UTC_OFFSET_HOURS != null && process.env.GPS_UTC_OFFSET_HOURS !== "" && Number.isFinite(Number(process.env.GPS_UTC_OFFSET_HOURS)) ? Number(process.env.GPS_UTC_OFFSET_HOURS) : RD_OFFSET;
  const allDays = daysOf(dateFrom, dateTo, MAX_DAYS + 1);
  if (allDays.length > MAX_DAYS) return Response.json({ error: `Máximo ${MAX_DAYS} días por consulta` }, { status: 400, headers: cors });
  const days = allDays.filter(d => !utcRange(d, d, { tz }).empty); // los días que todavía no empiezan no se consultan
  if (days.length === 0) return Response.json({ ok: true, devices: withGps.length, items: 0, totalKm: 0, days: [], failed: [], gpsKm: [], note: "Ese período todavía no ha empezado" }, { headers: cors });
  const imeis = withGps.map(t => String(t.gpsImei));
  let items = [], devices = withGps.length, pages = 0; const okDays = [], failed = [];
  const seen = new Set(); const key = (it) => `${it.imei}|${it.startTime}|${it.endTime}`;
  const add = (list) => { let n = 0; for (const it of Array.isArray(list) ? list : []) { const k = key(it); if (!seen.has(k)) { seen.add(k); items.push(it); n++; } } return n; };
  if (TRACKSOLID_MOCK === "true") { for (const d of days) { add(mockItems(withGps, d, d)); okDays.push(d); } }
  else {
    if (!TRACKSOLID_APP_KEY || !TRACKSOLID_APP_SECRET || !TRACKSOLID_ACCOUNT || !(TRACKSOLID_PASSWORD || TRACKSOLID_PASSWORD_MD5)) return Response.json({ error: "TrackSolid no está configurado (faltan TRACKSOLID_APP_KEY / APP_SECRET / ACCOUNT / PASSWORD)" }, { status: 501, headers: cors });
    const cfg = { appKey: TRACKSOLID_APP_KEY, appSecret: TRACKSOLID_APP_SECRET, account: TRACKSOLID_ACCOUNT, pwdMd5: TRACKSOLID_PASSWORD_MD5 || md5(TRACKSOLID_PASSWORD), base: NODES[(TRACKSOLID_NODE || "us").toLowerCase()] || NODES.us };
    let access;
    try {
      let a = await getAccess(cfg);
      let list = await CALLS.devices(cfg, a.token).catch(() => null);
      if (!Array.isArray(list) && a.cached) { a = await getAccess(cfg, true); list = await CALLS.devices(cfg, a.token).catch(() => null); } // token guardado vencido
      access = a.token; if (Array.isArray(list)) devices = list.length;
    } catch (e) { return Response.json({ error: `TrackSolid: ${e.message}` }, { status: 502, headers: cors }); }
    // Un día = una consulta por grupo de 20 IMEI (con páginas si la respuesta viene cortada)
    const fetchDay = async (day) => {
      const r = utcRange(day, day, { tz }); const got = [];
      for (let i = 0; i < imeis.length; i += 20) {
        const batch = imeis.slice(i, i + 20);
        const first = await CALLS.mileage(cfg, access, batch, r.begin, r.end); pages++;
        const arr = Array.isArray(first) ? first : []; got.push(...arr);
        let size = arr.length, start = size; const keys = new Set(arr.map(key));
        while (size >= 20 && size % 10 === 0 && pages < 200) {
          const more = await CALLS.mileage(cfg, access, batch, r.begin, r.end, { start, size }).catch(() => null); pages++;
          const fresh = (Array.isArray(more) ? more : []).filter(it => !keys.has(key(it)));
          if (!fresh.length) break;
          fresh.forEach(it => keys.add(key(it))); got.push(...fresh);
          start += more.length; if (more.length < size) break;
        }
      }
      return got;
    };
    await pool(days, 4, async (day) => {
      try { add(await fetchDay(day)); okDays.push(day); }
      catch (e) { failed.push({ date: day, error: e.message }); }
    });
    if (okDays.length === 0) return Response.json({ error: `TrackSolid: ${failed[0]?.error || "sin respuesta"}` }, { status: 502, headers: cors });
  }
  okDays.sort();

  // Km por día solo de los días consultados (un trayecto que empezó el día anterior a la consulta no pisa ese día)
  const okSet = new Set(okDays);
  const daily = summarize(items, tz).filter(d => okSet.has(d.date));
  const fields = items.length ? Object.keys(items[0]).filter(k => !/lat|lng|lon/i.test(k)) : []; // para diagnosticar si el GPS manda otro formato
  const kmByKey = new Map(daily.map(d => [`${d.imei}|${d.date}`, d.km]));
  // Persistir km diarios (id estable por imei+fecha); día consultado sin movimiento → 0 km (si antes tenía km, se respeta)
  let nextId = existing.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  const byKey = new Map(existing.map(r => [`${r.imei}|${r.date}`, r]));
  const syncedAt = new Date().toISOString(); const rows = [];
  for (const date of okDays) for (const t of withGps) {
    const imei = String(t.gpsImei), k = `${imei}|${date}`, prev = byKey.get(k), km = kmByKey.get(k) || 0;
    if (km === 0 && Number(prev?.km) > 0) continue;
    rows.push({ ...(prev || {}), id: prev?.id || nextId++, imei, date, km, truckId: t.id, syncedAt });
  }
  if (rows.length) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/bl_gps_km`, { method: "POST", headers: { ...supaHeaders(SUPABASE_SERVICE_KEY), "Prefer": "resolution=merge-duplicates" }, body: JSON.stringify(rows.map(x => ({ id: x.id, rec: x }))) });
    if (!r.ok) return Response.json({ error: `No se pudo guardar km: ${await r.text()}` }, { status: 500, headers: cors });
  }
  const totalKm = Math.round(daily.reduce((t, d) => t + d.km, 0) * 10) / 10;
  if (items.length && !totalKm) console.warn("GPS: trayectos sin km", JSON.stringify({ items: items.length, fields }));
  return Response.json({ ok: true, mock: TRACKSOLID_MOCK === "true", devices, items: items.length, pages, fields, totalKm, days: okDays, failed, gpsKm: rows }, { headers: cors });
};

export const config = { path: "/api/gps/sync" };

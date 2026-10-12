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
  mileage: (cfg, token, imeis, from, to) => call(cfg, "jimi.device.track.mileage", { access_token: token, imeis: imeis.join(","), begin_time: `${from} 00:00:00`, end_time: `${to} 23:59:59` }),
};

/** Agrupa trayectos del GPS por imei+fecha → km diarios; y por fecha para cruzar con viajes. */
export function summarize(items = []) {
  const daily = new Map();
  for (const it of items) {
    const date = String(it.startTime || "").slice(0, 10); const km = Number(it.totalMileage) || 0;
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
  for (const t of trips) { if (t.status === "cancelled") continue; const imei = imeiOf.get(t.truckId); if (!imei) continue; const k = `${imei}|${t.date}`; if (!byKey.has(k)) continue; groups.set(k, [...(groups.get(k) || []), t.id]); }
  const out = [];
  for (const [k, ids] of groups) { const km = Math.round(byKey.get(k) / ids.length * 10) / 10; for (const id of ids) out.push({ tripId: id, km }); }
  return out;
}

function mockItems(trucks, from, to) {
  const out = []; const d0 = new Date(from + "T12:00:00"), d1 = new Date(to + "T12:00:00");
  for (const t of trucks) { if (!t.gpsImei) continue; for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) { const day = d.toISOString().slice(0, 10); if (d.getDay() === 0) continue; out.push({ imei: String(t.gpsImei), startTime: `${day} 07:10:00`, endTime: `${day} 15:40:00`, totalMileage: String(180 + (Number(t.id) * 37 + d.getDate() * 11) % 160) }); } }
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

  let items = [], devices = withGps.length;
  if (TRACKSOLID_MOCK === "true") items = mockItems(withGps, dateFrom, dateTo);
  else {
    if (!TRACKSOLID_APP_KEY || !TRACKSOLID_APP_SECRET || !TRACKSOLID_ACCOUNT || !(TRACKSOLID_PASSWORD || TRACKSOLID_PASSWORD_MD5)) return Response.json({ error: "TrackSolid no está configurado (faltan TRACKSOLID_APP_KEY / APP_SECRET / ACCOUNT / PASSWORD)" }, { status: 501, headers: cors });
    const cfg = { appKey: TRACKSOLID_APP_KEY, appSecret: TRACKSOLID_APP_SECRET, account: TRACKSOLID_ACCOUNT, pwdMd5: TRACKSOLID_PASSWORD_MD5 || md5(TRACKSOLID_PASSWORD), base: NODES[(TRACKSOLID_NODE || "us").toLowerCase()] || NODES.us };
    try {
      const tk = await CALLS.token(cfg); const access = tk?.accessToken || tk?.access_token;
      if (!access) throw new Error("sin access_token");
      const list = await CALLS.devices(cfg, access).catch(() => null);
      if (Array.isArray(list)) devices = list.length;
      const imeis = withGps.map(t => String(t.gpsImei));
      for (let i = 0; i < imeis.length; i += 20) { const part = await CALLS.mileage(cfg, access, imeis.slice(i, i + 20), dateFrom, dateTo); if (Array.isArray(part)) items.push(...part); }
    } catch (e) { return Response.json({ error: `TrackSolid: ${e.message}` }, { status: 502, headers: cors }); }
  }

  const daily = summarize(items);
  // Persistir km diarios (id estable por imei+fecha)
  let nextId = existing.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  const byKey = new Map(existing.map(r => [`${r.imei}|${r.date}`, r]));
  const rows = daily.map(d => { const prev = byKey.get(`${d.imei}|${d.date}`); const truckId = withGps.find(t => String(t.gpsImei) === d.imei)?.id || null; return { ...(prev || {}), id: prev?.id || nextId++, imei: d.imei, date: d.date, km: d.km, truckId, syncedAt: new Date().toISOString() }; });
  if (rows.length) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/bl_gps_km`, { method: "POST", headers: { ...supaHeaders(SUPABASE_SERVICE_KEY), "Prefer": "resolution=merge-duplicates" }, body: JSON.stringify(rows.map(x => ({ id: x.id, rec: x }))) });
    if (!r.ok) return Response.json({ error: `No se pudo guardar km: ${await r.text()}` }, { status: 500, headers: cors });
  }
  // Km a los viajes (solo los que no tienen km manual del odómetro)
  const tripKm = assignTripKm(daily, trips.filter(t => t.date >= dateFrom && t.date <= dateTo), trucks);
  for (const { tripId, km } of tripKm) {
    const tr = trips.find(t => t.id === tripId); if (!tr) continue;
    await fetch(`${SUPABASE_URL}/rest/v1/bl_trips?id=eq.${tripId}`, { method: "PATCH", headers: { ...supaHeaders(SUPABASE_SERVICE_KEY), "Prefer": "return=minimal" }, body: JSON.stringify({ rec: { ...tr, km, kmSource: "gps" } }) });
  }
  return Response.json({ ok: true, mock: TRACKSOLID_MOCK === "true", devices, gpsKm: rows, tripKm }, { headers: cors });
};

export const config = { path: "/api/gps/sync" };

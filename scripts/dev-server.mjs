/**
 * B-Logix – servidor de desarrollo 100% local
 *
 *   node scripts/dev-server.mjs
 *
 * Hace dos cosas en el puerto 8888:
 *   1. Ejecuta las Netlify Functions de netlify/functions/*.mjs bajo /api/*
 *      (igual que en producción, sin Netlify CLI).
 *   2. Imita la API REST de Supabase (PostgREST) bajo /rest/v1/* guardando
 *      los datos en local-db/db.json. Así las funciones corren sin tocar
 *      Supabase: en .env se pone SUPABASE_URL=http://localhost:8888.
 *   3. Imita Supabase Storage bajo /storage/v1/object/* (fotos de recibos)
 *      guardando los archivos en local-db/storage/.
 *
 * Vite (puerto 5173) ya tiene proxy de /api → 8888 en vite.config.js.
 */
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB_DIR = resolve(ROOT, "local-db");
const DB     = resolve(DB_DIR, "db.json");
const SEED   = resolve(DB_DIR, "seed.json");
const PORT   = Number(process.env.DEV_API_PORT) || 8888;

// ── .env ─────────────────────────────────────────────────────────────────────
const envPath = resolve(ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}
for (const k of ["BLOGIX_SECRET", "ADMIN_PASSWORD_HASH", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"]) {
  if (!process.env[k]) console.warn(`[dev] Falta ${k} en .env`);
}

// ── Base de datos local (JSON) ──────────────────────────────────────────────
if (!existsSync(DB)) {
  mkdirSync(DB_DIR, { recursive: true });
  if (existsSync(SEED)) copyFileSync(SEED, DB);
  else writeFileSync(DB, JSON.stringify({}, null, 1));
}
let db = JSON.parse(readFileSync(DB, "utf8"));
const TABLE_DEFAULTS = ["bl_trips","bl_expenses","bl_trucks","bl_drivers","bl_clients","bl_partners",
  "bl_brokers","bl_suppliers","bl_invoices","bl_cobros","bl_fixed_templates","bl_settlement_status",
  "push_tokens","bl_rate_limits","appdata","bl_staff","bl_gps_km","bl_receipts"];
for (const t of TABLE_DEFAULTS) db[t] ??= [];
const save = () => writeFileSync(DB, JSON.stringify(db, null, 1));

// ── Mini PostgREST ──────────────────────────────────────────────────────────
// Soporta lo que usan las funciones: select, order, limit, eq/neq/in/not.in
// (sobre columnas o rec->>campo), upsert por id (Prefer: resolution=merge-duplicates),
// PATCH y DELETE con filtros, y el rpc bl_rate_limit_hit.
function colValue(row, col) {
  const m = col.match(/^(\w+)->>(\w+)$/);
  if (m) return row[m[1]]?.[m[2]];
  return row[col];
}
function parseFilters(params) {
  const filters = [];
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    let m;
    if ((m = v.match(/^eq\.(.*)$/)))       filters.push(r => String(colValue(r, k)) === m[1]);
    else if ((m = v.match(/^neq\.(.*)$/))) filters.push(r => String(colValue(r, k)) !== m[1]);
    else if ((m = v.match(/^in\.\((.*)\)$/))) { const set = new Set(m[1].split(",").map(s => s.trim().replace(/^"|"$/g, ""))); filters.push(r => set.has(String(colValue(r, k)))); }
    else if ((m = v.match(/^not\.in\.\((.*)\)$/))) { const set = new Set(m[1].split(",").map(s => s.trim().replace(/^"|"$/g, ""))); filters.push(r => !set.has(String(colValue(r, k)))); }
    else if ((m = v.match(/^is\.(.*)$/)))  filters.push(r => m[1] === "null" ? colValue(r, k) == null : Boolean(colValue(r, k)) === (m[1] === "true"));
    else console.warn(`[rest] filtro no soportado: ${k}=${v}`);
  }
  return filters;
}
function project(row, select) {
  if (!select || select === "*") return row;
  const out = {};
  for (const c of select.split(",").map(s => s.trim())) if (c in row) out[c] = row[c];
  return out;
}
async function restHandler(req, url) {
  const parts = url.pathname.replace(/^\/rest\/v1\//, "").split("/");
  const prefer = req.headers.get("prefer") || "";
  const json = (body, status = 200) => Response.json(body, { status });

  if (parts[0] === "rpc") {
    const fn = parts[1];
    const args = await req.json().catch(() => ({}));
    if (fn === "bl_rate_limit_hit") {
      const { p_scope, p_key, p_window } = args;
      const now = Date.now();
      let row = db.bl_rate_limits.find(r => r.scope === p_scope && r.key === p_key);
      if (!row || now - new Date(row.window_start).getTime() > p_window * 1000) {
        db.bl_rate_limits = db.bl_rate_limits.filter(r => r !== row);
        row = { scope: p_scope, key: p_key, count: 0, window_start: new Date(now).toISOString() };
        db.bl_rate_limits.push(row);
      }
      row.count += 1; save();
      return json(row.count);
    }
    if (fn === "bl_rate_limit_reset") {
      db.bl_rate_limits = db.bl_rate_limits.filter(r => !(r.scope === args.p_scope && r.key === args.p_key)); save();
      return new Response(null, { status: 204 });
    }
    return json({ message: `rpc ${fn} no existe` }, 404);
  }

  const table = parts[0];
  if (!(table in db)) return json({ message: `relation "${table}" does not exist` }, 404);
  const rows = db[table];
  const filters = parseFilters(url.searchParams);
  const match = r => filters.every(f => f(r));

  if (req.method === "GET") {
    let out = rows.filter(match);
    const order = url.searchParams.get("order");
    if (order) { const [col, dir] = order.split("."); out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === "desc" ? -1 : 1)); }
    const limit = Number(url.searchParams.get("limit"));
    if (limit) out = out.slice(0, limit);
    return json(out.map(r => project(r, url.searchParams.get("select"))));
  }
  if (req.method === "POST") {
    let body = await req.json();
    const list = Array.isArray(body) ? body : [body];
    const upsert = /merge-duplicates/.test(prefer);
    const keyCol = table === "push_tokens" ? "user_id" : "id";
    for (const rec of list) {
      const idx = rows.findIndex(r => String(r[keyCol]) === String(rec[keyCol]));
      if (idx >= 0 && upsert) rows[idx] = { ...rows[idx], ...rec };
      else if (idx >= 0) return json({ code: "23505", message: `duplicate key (${keyCol})` }, 409);
      else { if (rec.id == null && table !== "bl_settlement_status") rec.id = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1; rows.push(rec); }
    }
    save();
    return /return=representation/.test(prefer) ? json(list, 201) : new Response(null, { status: 201 });
  }
  if (req.method === "PATCH") {
    const patch = await req.json();
    let n = 0;
    for (const r of rows) if (match(r)) { Object.assign(r, patch); n++; }
    save();
    return /return=representation/.test(prefer) ? json(rows.filter(match)) : new Response(null, { status: 204 });
  }
  if (req.method === "DELETE") {
    const keep = rows.filter(r => !match(r));
    const n = rows.length - keep.length;
    db[table] = keep; save();
    console.log(`[rest] DELETE ${table}: ${n} fila(s)`);
    return new Response(null, { status: 204 });
  }
  return json({ message: "Method not allowed" }, 405);
}

// ── Mini Storage (fotos de recibos) ─────────────────────────────────────────
// POST /storage/v1/object/<bucket>/<ruta> (subir) · GET igual (bajar) · DELETE /storage/v1/object/<bucket> {prefixes}
const STORAGE_DIR = resolve(DB_DIR, "storage");
const safePath = (bucket, key) => {
  if (!/^[a-z0-9_-]+$/i.test(bucket) || !/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes("..")) return null;
  return resolve(STORAGE_DIR, bucket, key);
};
async function storageHandler(req, url) {
  const [bucket, ...rest] = url.pathname.replace(/^\/storage\/v1\/object\//, "").split("/");
  const key = rest.join("/");
  if (req.method === "DELETE" && !key) {
    const { prefixes = [] } = await req.json().catch(() => ({}));
    for (const k of prefixes) { const f = safePath(bucket, k); if (f && existsSync(f)) unlinkSync(f); }
    return Response.json(prefixes.map(name => ({ name })));
  }
  const file = safePath(bucket, key);
  if (!file) return Response.json({ message: "ruta inválida" }, { status: 400 });
  if (req.method === "POST" || req.method === "PUT") {
    if (existsSync(file) && req.headers.get("x-upsert") !== "true") return Response.json({ message: "The resource already exists" }, { status: 409 });
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(await req.arrayBuffer()));
    return Response.json({ Key: `${bucket}/${key}` });
  }
  if (req.method === "GET") {
    if (!existsSync(file)) return Response.json({ message: "Object not found" }, { status: 404 });
    return new Response(readFileSync(file), { headers: { "Content-Type": "image/jpeg" } });
  }
  return Response.json({ message: "Method not allowed" }, { status: 405 });
}

// ── Netlify Functions ───────────────────────────────────────────────────────
const FUNCTIONS = [
  ["api.mjs",        ["/api/data", "/api/data/export", "/api/data/check-ref"]],
  ["auth.mjs",       ["/api/auth/login", "/api/auth/logout", "/api/auth/password"]],
  ["push-token.mjs", ["/api/push/token"]],
  ["send-push.mjs",  ["/api/push/send"]],
  ["gps.mjs",        ["/api/gps/sync"]],
  ["receipts.mjs",   ["/api/receipts", "/api/receipts/scan", "/api/receipts/submit", "/api/receipts/photo", "/api/receipts/reject", "/api/receipts/approve", "/api/receipts/delete"]],
];
const routes = new Map();
for (const [file, paths] of FUNCTIONS) {
  try {
    const mod = await import(pathToFileURL(resolve(ROOT, "netlify/functions", file)).href);
    for (const p of paths) routes.set(p, mod.default);
  } catch (e) { console.warn(`[dev] No se pudo cargar ${file}: ${e.message}`); }
}

// ── HTTP ────────────────────────────────────────────────────────────────────
async function toRequest(req, url) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(",") : v);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : null;
  return new Request(url, { method: req.method, headers, body: body && req.method !== "GET" && req.method !== "HEAD" ? body : undefined });
}
async function send(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const t0 = Date.now();
  try {
    let response;
    if (url.pathname.startsWith("/rest/v1/")) {
      response = await restHandler(await toRequest(req, url), url);
    } else if (url.pathname.startsWith("/storage/v1/object/")) {
      response = await storageHandler(await toRequest(req, url), url);
    } else if (routes.has(url.pathname)) {
      response = await routes.get(url.pathname)(await toRequest(req, url), {});
    } else if (url.pathname === "/__db") {
      response = Response.json(Object.fromEntries(Object.entries(db).map(([k, v]) => [k, v.length])));
    } else {
      response = Response.json({ error: `No existe ${url.pathname}` }, { status: 404 });
    }
    await send(res, response);
    if (!url.pathname.startsWith("/rest/") && !url.pathname.startsWith("/storage/")) console.log(`${req.method} ${url.pathname} → ${response.status} (${Date.now() - t0} ms)`);
  } catch (e) {
    console.error(`[dev] ${req.method} ${url.pathname} falló:`, e);
    res.statusCode = 500; res.end(JSON.stringify({ error: String(e) }));
  }
}).listen(PORT, () => {
  console.log(`\n  B-Logix dev API  →  http://localhost:${PORT}`);
  console.log(`  Base local       →  ${DB}`);
  console.log(`  Funciones        →  ${[...routes.keys()].join(", ")}\n`);
});

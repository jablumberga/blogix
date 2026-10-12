/**
 * B-Logix – Servidor de recibos por foto (handler real de netlify/functions/receipts.mjs; Supabase, Storage y la IA simulados)
 * Run with: node --test tests/apiReceipts.test.mjs
 *
 * Cubre: foto que no sirve (IA: borrosa / no es recibo / faltan datos) → 422 y NO se guarda; foto buena → borrador;
 * enviar con validación; permisos (chofer solo lo suyo, socio/oficina no); rechazar con motivo; aprobado = existe el gasto;
 * borrar; sin clave de IA o si la IA falla → el chofer escribe los datos; límites (JPEG, tamaño, por día).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "http://mock";
process.env.SUPABASE_SERVICE_KEY = "k";
process.env.BLOGIX_SECRET = "test-secret-receipts";
delete process.env.RECEIPTS_AI_MOCK;

const { signToken } = await import("../netlify/functions/api.mjs");
const { default: handler } = await import("../netlify/functions/receipts.mjs");

// ── Supabase + Storage + IA en memoria ───────────────────────────────────────
let db, files, ai, rate;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const goodRead = () => ({ es_recibo: true, legible: true, calidad: "buena", problemas: [], categoria: "fuel", negocio: "Shell Dajabón", rnc: "101", ncf: "B0200001234", fecha: today, monto_total: 7140, galones: 25.5, precio_galon: 280 });
function reset() {
  db = { bl_receipts: new Map(), bl_expenses: new Map(), bl_trucks: new Map([[1, { id: 1, plate: "L1" }], [2, { id: 2, plate: "L2", status: "inactive" }]]), bl_trips: new Map([[30, { id: 30, driverId: 4, date: today }], [31, { id: 31, driverId: 5, date: today }]]) };
  files = new Map(); ai = { mode: "good", calls: 0, lastBody: null }; rate = 0;
  process.env.ANTHROPIC_API_KEY = "sk-test";
}
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const matches = (rec, q) => q.every(([k, v]) => {
  const m = k.match(/^rec->>(\w+)$/); const val = m ? rec[m[1]] : rec[k];
  if (v.startsWith("eq.")) return String(val) === v.slice(3);
  if (v.startsWith("neq.")) return val != null && String(val) !== v.slice(4);
  if (v.startsWith("in.(")) return v.slice(4, -1).split(",").includes(String(val));
  return true;
});
globalThis.fetch = async (u, opt = {}) => {
  const url = new URL(u); const m = (opt.method || "GET").toUpperCase();
  if (url.hostname === "api.anthropic.com") {
    ai.calls++; ai.lastBody = JSON.parse(opt.body);
    if (ai.mode === "down") return json({ error: { message: "overloaded" } }, 529);
    const input = ai.mode === "blurry" ? { ...goodRead(), legible: false, calidad: "mala", problemas: ["borrosa"], monto_total: null }
      : ai.mode === "truck" ? { ...goodRead(), es_recibo: false } : ai.mode === "nogallons" ? { ...goodRead(), galones: null, precio_galon: null } : goodRead();
    return json({ content: [{ type: "tool_use", name: "registrar_recibo", input }], usage: { input_tokens: 1500, output_tokens: 120 } });
  }
  if (url.pathname.startsWith("/storage/v1/object/")) {
    const key = url.pathname.replace(/^\/storage\/v1\/object\/receipts\/?/, "");
    if (m === "POST") { files.set(key, Buffer.from(opt.body)); return json({ Key: key }); }
    if (m === "GET") return files.has(key) ? new Response(files.get(key)) : json({ message: "not found" }, 404);
    if (m === "DELETE") { for (const k of JSON.parse(opt.body).prefixes) files.delete(k); return json([]); }
  }
  const table = url.pathname.split("/rest/v1/")[1];
  if (table === "rpc/bl_rate_limit_hit") return json(++rate);
  const t = db[table]; if (!t) return json([], 404);
  const q = [...url.searchParams].filter(([k]) => !["select", "order", "limit"].includes(k));
  if (m === "GET") return json([...t.values()].filter(rec => matches(rec, q)).sort((a, b) => b.id - a.id).map(rec => ({ id: rec.id, rec })));
  if (m === "POST") { for (const r of JSON.parse(opt.body)) t.set(r.id, r.rec); return json([], 201); }
  if (m === "DELETE") { for (const [id, rec] of [...t]) if (matches(rec, q) || matches({ id }, q)) t.delete(id); return new Response(null, { status: 204 }); }
  return json([]);
};

const DRIVER = { id: "d-4", role: "driver", refId: 4, name: "Edwin" };
const OTHER = { id: "d-5", role: "driver", refId: 5, name: "Juan" };
const ADMIN = { id: "admin", role: "admin", name: "Alexander" };
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]).toString("base64");
async function call(user, method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (user) headers.Authorization = `Bearer ${await signToken(user, process.env.BLOGIX_SECRET)}`;
  const r = await handler(new Request(`http://localhost${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
  const ct = r.headers.get("content-type") || "";
  return { status: r.status, body: ct.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
}
const scan = (user = DRIVER, extra = {}) => call(user, "POST", "/api/receipts/scan", { image: JPEG, hash: "00ff00ff00ff00ff", metrics: { sharpness: 900 }, width: 1176, height: 1568, ...extra });
const fieldsOk = (read, extra = {}) => ({ category: read.category, amount: read.amount, date: read.date, vendor: read.vendor, gallons: read.gallons, ncf: read.ncf, truckId: 1, ...extra });

beforeEach(reset);

test("foto buena: la IA la lee, se guarda la foto y queda como borrador (no visible aún)", async () => {
  const r = await scan();
  assert.equal(r.status, 200);
  assert.equal(r.body.read.amount, 7140); assert.equal(r.body.aiEnabled, true); assert.equal(r.body.aiFailed, false);
  assert.equal(files.size, 1); assert.ok([...files.keys()][0].startsWith(`u-d4/${today.slice(0, 7)}/`));
  assert.equal(db.bl_receipts.get(r.body.id).status, "draft");
  assert.equal(ai.lastBody.model, "claude-haiku-5-5");
  assert.equal(ai.lastBody.tool_choice.name, "registrar_recibo");
  assert.equal(ai.lastBody.messages[0].content[0].source.media_type, "image/jpeg");
  const list = await call(DRIVER, "GET", "/api/receipts");
  assert.equal(list.body.receipts.length, 0, "los borradores no salen en la lista");
});

for (const [mode, re] of [["blurry", /no se lee bien/], ["truck", /no parece un recibo/], ["nogallons", /galones/]]) {
  test(`la IA dice que la foto no sirve (${mode}) → 422 con el motivo y NO se guarda nada`, async () => {
    ai.mode = mode;
    const r = await scan();
    assert.equal(r.status, 422);
    assert.match(r.body.problems.join(" "), re);
    assert.equal(files.size, 0); assert.equal(db.bl_receipts.size, 0);
  });
}

test("enviar: valida y queda por revisar; anota lo que el chofer cambió; no se puede enviar dos veces", async () => {
  const s = await scan();
  let r = await call(DRIVER, "POST", "/api/receipts/submit", { id: s.body.id, fields: fieldsOk(s.body.read, { amount: 7500, tripId: 30 }) });
  assert.equal(r.status, 200);
  const rec = db.bl_receipts.get(s.body.id);
  assert.equal(rec.status, "pending"); assert.equal(rec.fields.tripId, 30);
  assert.deepEqual(rec.changes, [{ field: "amount", read: 7140, sent: 7500 }]);
  r = await call(DRIVER, "POST", "/api/receipts/submit", { id: s.body.id, fields: fieldsOk(s.body.read) });
  assert.equal(r.status, 409);
});

test("enviar: errores de validación (viaje de otro chofer, camión inactivo, sin galones)", async () => {
  const s = await scan();
  const e = async (extra) => (await call(DRIVER, "POST", "/api/receipts/submit", { id: s.body.id, fields: fieldsOk(s.body.read, extra) })).body.errors?.join(" | ") || "";
  assert.match(await e({ tripId: 31 }), /no es tuyo/);
  assert.match(await e({ truckId: 2 }), /no está disponible/);
  assert.match(await e({ gallons: null }), /galones/);
  assert.equal(db.bl_receipts.get(s.body.id).status, "draft", "sigue sin enviarse");
});

test("permisos: otro chofer no ve, no envía, no borra ni ve la foto; socio y oficina-asistente no entran", async () => {
  const s = await scan();
  assert.equal((await call(OTHER, "POST", "/api/receipts/submit", { id: s.body.id, fields: fieldsOk(s.body.read) })).status, 404);
  assert.equal((await call(OTHER, "GET", `/api/receipts/photo?id=${s.body.id}`)).status, 404);
  assert.equal((await call(OTHER, "POST", "/api/receipts/delete", { id: s.body.id })).status, 404);
  assert.equal((await call(DRIVER, "POST", "/api/receipts/reject", { id: s.body.id, reason: "x" })).status, 403);
  assert.equal((await call({ id: "p-1", role: "partner", refId: 1 }, "GET", "/api/receipts")).status, 403);
  assert.equal((await call({ id: "s-1", role: "assistant", refId: 1 }, "GET", "/api/receipts")).status, 403);
  assert.equal((await call(null, "GET", "/api/receipts")).status, 401);
  const photo = await call(DRIVER, "GET", `/api/receipts/photo?id=${s.body.id}`);
  assert.equal(photo.status, 200); assert.equal(photo.body[0], 0xff);
});

test("oficina: ve los por revisar con datos internos; el chofer no ve métricas ni detalles de la IA", async () => {
  const s = await scan();
  await call(DRIVER, "POST", "/api/receipts/submit", { id: s.body.id, fields: fieldsOk(s.body.read) });
  const a = await call(ADMIN, "GET", "/api/receipts");
  assert.equal(a.body.receipts[0].status, "pending"); assert.ok(a.body.receipts[0].ai); assert.ok(a.body.receipts[0].photoMetrics);
  const d = await call(DRIVER, "GET", "/api/receipts");
  assert.equal(d.body.receipts[0].ai, undefined); assert.equal(d.body.receipts[0].photoMetrics, undefined);
});

test("rechazar exige motivo; aprobado = existe el gasto con su receiptId (y entonces no se puede rechazar ni borrar)", async () => {
  const s = await scan();
  await call(DRIVER, "POST", "/api/receipts/submit", { id: s.body.id, fields: fieldsOk(s.body.read) });
  assert.equal((await call(ADMIN, "POST", "/api/receipts/reject", { id: s.body.id, reason: " " })).status, 400);
  db.bl_expenses.set(900, { id: 900, category: "fuel", amount: 7140, receiptId: s.body.id, date: today });
  const d = await call(DRIVER, "GET", "/api/receipts");
  assert.equal(d.body.receipts[0].status, "approved"); assert.equal(d.body.receipts[0].expense.id, 900);
  assert.equal((await call(ADMIN, "POST", "/api/receipts/reject", { id: s.body.id, reason: "no" })).status, 409);
  assert.equal((await call(DRIVER, "POST", "/api/receipts/delete", { id: s.body.id })).status, 409);
  db.bl_expenses.delete(900); // si la oficina borra el gasto, vuelve a «por revisar»
  assert.equal((await call(ADMIN, "GET", "/api/receipts")).body.receipts[0].status, "pending");
});

test("rechazado: el chofer ve el motivo y no lo puede borrar (queda en el historial)", async () => {
  const s = await scan();
  await call(DRIVER, "POST", "/api/receipts/submit", { id: s.body.id, fields: fieldsOk(s.body.read) });
  const r = await call(ADMIN, "POST", "/api/receipts/reject", { id: s.body.id, reason: "Monto no coincide" });
  assert.equal(r.body.receipt.status, "rejected");
  const d = await call(DRIVER, "GET", "/api/receipts");
  assert.equal(d.body.receipts[0].rejectReason, "Monto no coincide");
  assert.equal((await call(DRIVER, "POST", "/api/receipts/delete", { id: s.body.id })).status, 409);
});

test("el chofer borra un recibo suyo por revisar: se van el registro y la foto", async () => {
  const s = await scan();
  await call(DRIVER, "POST", "/api/receipts/submit", { id: s.body.id, fields: fieldsOk(s.body.read) });
  assert.equal((await call(DRIVER, "POST", "/api/receipts/delete", { id: s.body.id })).status, 200);
  assert.equal(db.bl_receipts.size, 0); assert.equal(files.size, 0);
});

test("sin clave de IA: se guarda la foto sin lectura y el chofer escribe los datos (obligatorios igual)", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const s = await scan();
  assert.equal(s.status, 200); assert.equal(s.body.read, null); assert.equal(s.body.aiEnabled, false); assert.equal(ai.calls, 0);
  const bad = await call(DRIVER, "POST", "/api/receipts/submit", { id: s.body.id, fields: { category: "fuel", truckId: 1 } });
  assert.equal(bad.status, 422);
  assert.match(bad.body.errors.join(" "), /monto/);
  const ok = await call(DRIVER, "POST", "/api/receipts/submit", { id: s.body.id, fields: { category: "fuel", amount: 500, date: today, vendor: "Shell", gallons: 2, truckId: 1 } });
  assert.equal(ok.status, 200); assert.deepEqual(db.bl_receipts.get(s.body.id).changes, []);
});

test("si la IA falla, no se traba el chofer: se guarda marcado «falló» para que la oficina compare con la foto", async () => {
  ai.mode = "down";
  const s = await scan();
  assert.equal(s.status, 200); assert.equal(s.body.aiFailed, true); assert.equal(s.body.read, null);
  assert.equal(db.bl_receipts.get(s.body.id).ai.failed, true);
});

test("límites: solo JPEG, tamaño máximo y fotos por día", async () => {
  assert.equal((await call(DRIVER, "POST", "/api/receipts/scan", { image: Buffer.from("GIF89a....").toString("base64") })).status, 415);
  assert.equal((await call(DRIVER, "POST", "/api/receipts/scan", { image: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(3_600_000)]).toString("base64") })).status, 413);
  assert.equal((await call(DRIVER, "POST", "/api/receipts/scan", {})).status, 400);
  rate = 60;
  const r = await scan();
  assert.equal(r.status, 429); assert.match(r.body.error, /límite/);
  assert.equal(ai.calls, 0, "pasado el límite no se gasta en la IA");
});

test("la oficina también puede subir una foto (queda como recibo de la oficina, sin chofer)", async () => {
  const s = await scan(ADMIN);
  assert.equal(s.status, 200);
  assert.ok([...files.keys()][0].startsWith("u-admin/"));
  const r = await call(ADMIN, "POST", "/api/receipts/submit", { id: s.body.id, fields: fieldsOk(s.body.read) });
  assert.equal(r.status, 200); assert.equal(db.bl_receipts.get(s.body.id).driverId, null);
});

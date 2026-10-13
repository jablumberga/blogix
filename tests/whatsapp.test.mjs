/**
 * B-Logix – WhatsApp: números de RD, mensajes (texto y plantillas de Meta) y envío automático por la API
 * Run with: node --test tests/whatsapp.test.mjs
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.BLOGIX_SECRET = "test-secret-wa";
process.env.SUPABASE_URL = "http://mock"; process.env.SUPABASE_SERVICE_KEY = "k";
const { waPhone, waLink } = await import("../src/utils/whatsapp.js");
const { WA_TEMPLATES, templateParams, templateText, templateArity, clean } = await import("../src/utils/whatsappTemplates.js");
const { helperWaData } = await import("../src/utils/whatsappData.js");
const { signToken } = await import("../netlify/functions/api.mjs");
const { default: handler } = await import("../netlify/functions/whatsapp.mjs");

test("waPhone: números de RD con o sin formato, con código de país, inválidos", () => {
  assert.equal(waPhone("809-555-1234"), "18095551234");
  assert.equal(waPhone("(829) 555 1234"), "18295551234");
  assert.equal(waPhone("+1 849 555 1234"), "18495551234");
  assert.equal(waPhone("0034 612 345 678"), "34612345678");
  assert.equal(waPhone("555-1234"), null);
  assert.equal(waPhone(""), null);
  assert.equal(waLink("8095551234", "Hola á & b"), "https://wa.me/18095551234?text=Hola%20%C3%A1%20%26%20b");
  assert.equal(waLink("", "x"), "https://wa.me/?text=x");
});

const samples = {
  constancia_entrega: { name: "Edwin", company: "B-Logix", newCount: 1, date: "24/10/2026", visitNo: 2, period: "16–31 de octubre 2026", totalCount: 3, pendingCount: 2, fullText: "texto completo" },
  documentos_pendientes: { name: "Edwin", company: "B-Logix", count: 2, list: "01/10 Bocel ref 1; 02/10 Bocel ref 2", lines: ["• 01/10", "• 02/10"] },
  recibo_rechazado: { name: "Edwin", category: "combustible", amount: 7140, date: "2026-10-12", reason: "Monto\nno coincide" },
  pago_quincena: { name: "Edwin", period: "1–15 oct", company: "B-Logix", trips: 5, advances: 1000, net: 12500.5, paid: false },
  pago_ayudante: { name: "Pedro", period: "1–15 oct", company: "B-Logix", trips: 3, gross: 2250, advances: 500, net: 1750, paid: true, lines: ["• 01/10 · Mao · RD$750"] },
};

test("cada plantilla: el número de datos coincide con su texto de Meta, sin vacíos ni saltos de línea", () => {
  for (const key of Object.keys(WA_TEMPLATES)) {
    const p = templateParams(key, samples[key]);
    assert.equal(p.length, templateArity(key), key);
    for (const v of p) { assert.ok(v.length > 0, `${key}: dato vacío`); assert.doesNotMatch(v, /[\n\t]/, key); }
    assert.ok(templateText(key, samples[key]).length > 10, key);
  }
  assert.equal(clean(""), "—"); assert.equal(clean("a\n\nb"), "a b");
  assert.deepEqual(templateParams("recibo_rechazado", samples.recibo_rechazado), ["Edwin", "combustible", "RD$7,140", "2026-10-12", "Monto no coincide"]);
  assert.match(templateText("pago_quincena", samples.pago_quincena), /Neto: \*RD\$12,500\.5\* \(por transferir\)/);
  assert.match(templateText("pago_ayudante", samples.pago_ayudante), /Adelantos: −RD\$500[\s\S]*Neto: \*RD\$1,750\* \(pagado\)/);
});

test("helperWaData: arma la relación del ayudante desde la fila de nómina", () => {
  const d = helperWaData({ ayudante: { name: "Pedro" }, tripCount: 2, gross: 1500, advances: 0, net: 1500, trips: [{ trip: { date: "2026-10-02", municipality: "Mao" }, amount: 750 }, { trip: { date: "2026-10-05", municipality: "Dajabón" }, amount: 750 }] }, { paid: false }, { label: "1–15 oct" });
  assert.deepEqual(d.lines, ["• 02/10 · Mao · RD$750", "• 05/10 · Dajabón · RD$750"]);
  assert.equal(d.period, "1–15 oct"); assert.equal(d.paid, false);
});

// ── Servidor ─────────────────────────────────────────────────────────────────
let graph;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
globalThis.fetch = async (u, opt = {}) => {
  const url = String(u);
  if (url.includes("rpc/bl_rate_limit_hit")) return json(1);
  if (url.startsWith("https://graph.facebook.com/")) {
    graph.calls.push({ url, body: JSON.parse(opt.body), auth: opt.headers.Authorization });
    return graph.fail ? json({ error: { message: "Template name does not exist", code: 132001 } }, 400) : json({ messages: [{ id: "wamid.1" }] });
  }
  return json({}, 404);
};
const call = async (user, method, path, body) => {
  const headers = { "Content-Type": "application/json" };
  if (user) headers.Authorization = `Bearer ${await signToken(user, process.env.BLOGIX_SECRET)}`;
  const r = await handler(new Request(`http://localhost${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
  return { status: r.status, body: await r.json() };
};
const ADMIN = { id: "admin", role: "admin" }, ANA = { id: "s-1", role: "assistant", refId: 1 }, DRIVER = { id: "d-4", role: "driver", refId: 4 };
const send = (user, extra = {}) => call(user, "POST", "/api/whatsapp/send", { to: "809-555-1234", template: "recibo_rechazado", params: templateParams("recibo_rechazado", samples.recibo_rechazado), ...extra });
beforeEach(() => { graph = { calls: [], fail: false }; process.env.WHATSAPP_TOKEN = "tok"; process.env.WHATSAPP_PHONE_NUMBER_ID = "123"; delete process.env.WHATSAPP_TEMPLATE_PREFIX; });

test("estado: activo solo con token y número; el chofer no entra", async () => {
  assert.deepEqual((await call(ADMIN, "GET", "/api/whatsapp/status")).body, { enabled: true });
  delete process.env.WHATSAPP_TOKEN;
  assert.deepEqual((await call(ANA, "GET", "/api/whatsapp/status")).body, { enabled: false });
  assert.equal((await call(DRIVER, "GET", "/api/whatsapp/status")).status, 403);
  assert.equal((await call(null, "GET", "/api/whatsapp/status")).status, 401);
});

test("enviar: arma la plantilla para Meta (nombre, idioma, datos) al número con +1", async () => {
  const r = await send(ANA);
  assert.equal(r.status, 200); assert.equal(r.body.id, "wamid.1");
  const c = graph.calls[0];
  assert.equal(c.url, "https://graph.facebook.com/v22.0/123/messages");
  assert.equal(c.auth, "Bearer tok");
  assert.equal(c.body.to, "18095551234");
  assert.equal(c.body.template.name, "recibo_rechazado");
  assert.equal(c.body.template.language.code, "es");
  assert.deepEqual(c.body.template.components[0].parameters.map(p => p.text), ["Edwin", "combustible", "RD$7,140", "2026-10-12", "Monto no coincide"]);
});

test("enviar: valida plantilla, cantidad de datos, teléfono, configuración y permisos", async () => {
  assert.equal((await send(ADMIN, { template: "hackeo" })).status, 400);
  assert.equal((await send(ADMIN, { params: ["solo uno"] })).status, 400);
  assert.equal((await send(ADMIN, { to: "123" })).status, 400);
  assert.equal((await send(DRIVER)).status, 403);
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  assert.equal((await send(ADMIN)).status, 409);
  assert.equal(graph.calls.length, 0, "nada salió hacia Meta");
});

test("si Meta rechaza (plantilla no aprobada), se devuelve el motivo", async () => {
  graph.fail = true;
  const r = await send(ADMIN);
  assert.equal(r.status, 502); assert.match(r.body.error, /Template name does not exist/);
});

test("prefijo opcional para los nombres de plantilla", async () => {
  process.env.WHATSAPP_TEMPLATE_PREFIX = "blogix_";
  await send(ADMIN);
  assert.equal(graph.calls[0].body.template.name, "blogix_recibo_rechazado");
});

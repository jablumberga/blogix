/**
 * B-Logix – Sincronización con TrackSolid (servidor): formato real de la Open API (distance en metros, hora UTC),
 * consulta día por día en hora de RD, páginas, días sin movimiento guardados en 0, y los viajes no se tocan
 * (Costo por km reparte los km diarios entre los viajes).
 * Run with: node --test tests/gpsSync.test.mjs
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.BLOGIX_SECRET = "test-secret-gps";
process.env.SUPABASE_URL = "http://mock"; process.env.SUPABASE_SERVICE_KEY = "k";
Object.assign(process.env, { TRACKSOLID_APP_KEY: "ak", TRACKSOLID_APP_SECRET: "as", TRACKSOLID_ACCOUNT: "acc", TRACKSOLID_PASSWORD: "pw", TRACKSOLID_NODE: "us" });
const { signToken } = await import("../netlify/functions/api.mjs");
const { default: handler } = await import("../netlify/functions/gps.mjs");

let db, calls, mileage, reads;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
globalThis.fetch = async (u, opt = {}) => {
  const url = String(u);
  if (url.startsWith("https://us-open.tracksolidpro.com/")) {
    const p = Object.fromEntries(new URLSearchParams(opt.body)); calls.push(p);
    if (p.method === "jimi.oauth.token.get") return json({ code: 0, result: { accessToken: "AT" } });
    if (p.method === "jimi.user.device.list") return json({ code: 0, result: [{ imei: "8288" }, { imei: "2668" }] });
    if (p.method === "jimi.device.track.mileage") return json({ code: 0, result: mileage(p) });
    return json({ code: 1, message: "?" });
  }
  const m = url.match(/\/rest\/v1\/(\w+)(\?(.*))?$/);
  if (m) {
    const [, table, , q = ""] = m;
    if ((opt.method || "GET") === "GET") { // como Supabase: máx. 1,000 filas, offset/limit y Content-Range con count=exact
      const all = (db[table] || []).map(rec => ({ rec })), sp = new URLSearchParams(q), off = Number(sp.get("offset")) || 0;
      const page = all.slice(off, off + Math.min(Number(sp.get("limit")) || 1000, 1000)); reads.push(`${table}@${off}`);
      return new Response(JSON.stringify(page), { status: 200, headers: { "content-type": "application/json", ...(/count=exact/.test(opt.headers?.Prefer || "") ? { "content-range": `${off}-${off + page.length - 1}/${all.length}` } : {}) } });
    }
    if (opt.method === "POST") { for (const r of JSON.parse(opt.body)) { db[table] = (db[table] || []).filter(x => x.id !== r.id); db[table].push(r.rec); } return json([], 201); }
    if (opt.method === "PATCH") { const id = Number(q.match(/id=eq\.(\d+)/)[1]); const rec = JSON.parse(opt.body).rec; db[table] = db[table].map(x => x.id === id ? rec : x); return new Response(null, { status: 204 }); }
  }
  return json({}, 404);
};
const sync = async (body, role = "admin") => {
  const tk = await signToken({ id: role, role }, process.env.BLOGIX_SECRET);
  const r = await handler(new Request("http://localhost/api/gps/sync", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${tk}` }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
beforeEach(() => {
  calls = []; reads = [];
  db = {
    bl_trucks: [{ id: 1, plate: "International", gpsImei: "865784056748828" }, { id: 3, plate: "Hino", gpsImei: "863767070202668" }, { id: 2, plate: "Ford" }],
    bl_trips: [{ id: 1, date: "2026-10-12", truckId: 1, status: "delivered", municipality: "Dajabón" }, { id: 2, date: "2026-10-13", truckId: 3, status: "pending" }],
    bl_gps_km: [{ id: 1, imei: "865784056748828", date: "2026-10-12", km: 0, truckId: 1 }],
  };
  // Lo que manda la Open API: distance en metros, hora UTC
  mileage = (p) => [
    { imei: "865784056748828", startTime: "2026-10-12 11:05:00", endTime: "2026-10-12 14:00:00", elapsed: 10500, distance: 152300, avgSpeed: 52 },
    { imei: "865784056748828", startTime: "2026-10-12 18:20:00", endTime: "2026-10-12 21:00:00", elapsed: 9600, distance: 149800, avgSpeed: 56 },
    { imei: "865784056748828", startTime: "2026-10-13 01:30:00", endTime: "2026-10-13 01:50:00", elapsed: 1200, distance: 4100, avgSpeed: 12 },
  ];
});

test("trae los km reales: metros → km, día de RD; guarda el día y NO toca los viajes", async () => {
  const r = await sync({ dateFrom: "2026-10-12", dateTo: "2026-10-12" });
  assert.equal(r.status, 200);
  const q = calls.filter(c => c.method === "jimi.device.track.mileage");
  assert.equal(q.length, 1, "un día = una consulta");
  assert.equal(q[0].begin_time, "2026-10-12 04:00:00", "medianoche de RD = 04:00 UTC");
  assert.ok(q[0].end_time <= "2026-10-13 03:59:59");
  assert.equal(q[0].imeis, "865784056748828,863767070202668");
  assert.equal(r.body.totalKm, 306.2, "el trayecto de las 01:30 UTC del 13 es del 12 en RD");
  assert.deepEqual(r.body.days, ["2026-10-12"]);
  const g = db.bl_gps_km.find(x => x.date === "2026-10-12" && x.imei === "865784056748828");
  assert.equal(g.km, 306.2); assert.equal(g.id, 1, "reusa la fila del día (no duplica)"); assert.ok(g.syncedAt);
  const hino = db.bl_gps_km.find(x => x.date === "2026-10-12" && x.imei === "863767070202668");
  assert.equal(hino?.km, 0, "día consultado sin movimiento → 0 km (así se sabe que ya se trajo)"); assert.equal(hino.truckId, 3);
  assert.ok(!db.bl_trips.find(t => t.id === 1).km && !db.bl_trips.find(t => t.id === 1).kmSource, "los viajes no se tocan");
  assert.equal(r.body.tripKm, undefined);
});

test("varios días: una consulta por día, con su rango de RD", async () => {
  const r = await sync({ dateFrom: "2026-10-10", dateTo: "2026-10-12" });
  const q = calls.filter(c => c.method === "jimi.device.track.mileage").map(c => c.begin_time).sort();
  assert.deepEqual(q, ["2026-10-10 04:00:00", "2026-10-11 04:00:00", "2026-10-12 04:00:00"]);
  assert.deepEqual(r.body.days, ["2026-10-10", "2026-10-11", "2026-10-12"]);
  assert.equal(db.bl_gps_km.filter(x => x.imei === "865784056748828").length, 3, "10 y 11 en 0, 12 con km");
  assert.equal(db.bl_gps_km.find(x => x.imei === "865784056748828" && x.date === "2026-10-12").km, 306.2, "el mismo trayecto en varias respuestas no se suma dos veces");
});

test("un trayecto de un día que no se pidió no pisa ese día", async () => {
  db.bl_gps_km.push({ id: 2, imei: "865784056748828", date: "2026-10-11", km: 280, truckId: 1 });
  mileage = () => [{ imei: "865784056748828", startTime: "2026-10-12 03:30:00", endTime: "2026-10-12 05:00:00", distance: 50000 }]; // 23:30 del 11 en RD
  await sync({ dateFrom: "2026-10-12", dateTo: "2026-10-12" });
  assert.equal(db.bl_gps_km.find(x => x.date === "2026-10-11").km, 280);
});

test("si el GPS manda trayectos sin km reconocibles, lo dice (con los nombres de los campos) y no borra km que ya tenía", async () => {
  db.bl_gps_km[0].km = 120;
  mileage = () => [{ imei: "865784056748828", startTime: "2026-10-12 12:00:00", endTime: "2026-10-12 13:00:00", raro: 5, startLat: 19.5 }];
  const r = await sync({ dateFrom: "2026-10-12", dateTo: "2026-10-12" });
  assert.equal(r.body.items, 1); assert.equal(r.body.totalKm, 0);
  assert.deepEqual(r.body.fields, ["imei", "startTime", "endTime", "raro"], "sin coordenadas");
  assert.equal(db.bl_gps_km.find(x => x.id === 1).km, 120);
});

test("respuesta por páginas: pide la siguiente y no cuenta repetidos", async () => {
  const it = (i) => ({ imei: "865784056748828", startTime: `2026-10-12 ${String(5 + (i % 18)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00`, endTime: `x${i}`, distance: 1000 });
  mileage = (p) => p.start_row ? Array.from({ length: 30 }, (_, i) => it(100 + i)) : Array.from({ length: 100 }, (_, i) => it(i));
  const r = await sync({ dateFrom: "2026-10-12", dateTo: "2026-10-12" });
  assert.equal(r.body.items, 130); assert.equal(r.body.pages, 2); assert.equal(r.body.totalKm, 130);
  // si la API ignora la página y repite lo mismo: se para sin duplicar
  calls = []; mileage = () => Array.from({ length: 100 }, (_, i) => it(i));
  const r2 = await sync({ dateFrom: "2026-10-12", dateTo: "2026-10-12" });
  assert.equal(r2.body.items, 100); assert.equal(r2.body.totalKm, 100);
});

test("si un día falla, se guardan los demás y se dice cuál faltó; el token se reutiliza", async () => {
  mileage = (p) => { if (p.begin_time.startsWith("2026-10-11")) throw new Error("x"); return []; };
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, opt) => { const p = opt?.body && String(u).includes("tracksolid") ? Object.fromEntries(new URLSearchParams(opt.body)) : null; if (p?.method === "jimi.device.track.mileage" && p.begin_time.startsWith("2026-10-11")) { calls.push(p); return json({ code: 1006, message: "busy" }); } return orig(u, opt); };
  try {
    const r = await sync({ dateFrom: "2026-10-10", dateTo: "2026-10-12" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.days, ["2026-10-10", "2026-10-12"]);
    assert.equal(r.body.failed.length, 1); assert.equal(r.body.failed[0].date, "2026-10-11");
    assert.ok(!db.bl_gps_km.some(x => x.date === "2026-10-11"), "el día que falló no se marca como traído");
  } finally { globalThis.fetch = orig; }
  calls = [];
  await sync({ dateFrom: "2026-10-12", dateTo: "2026-10-12" });
  assert.equal(calls.filter(c => c.method === "jimi.oauth.token.get").length, 0, "token guardado");
});

test("más de 1,000 filas guardadas: las lee todas y el id nuevo no pisa ninguna", async () => {
  db.bl_gps_km = Array.from({ length: 1500 }, (_, i) => ({ id: i + 1, imei: "865784056748828", date: `2020-01-01`, km: 1 }));
  await sync({ dateFrom: "2026-10-12", dateTo: "2026-10-12" });
  assert.ok(reads.includes("bl_gps_km@1000"), "pidió la segunda página");
  assert.equal(db.bl_gps_km.length, 1502);
  assert.deepEqual(db.bl_gps_km.filter(x => x.date === "2026-10-12").map(x => x.id).sort(), [1501, 1502]);
});

test("solo el admin; máximo de días por consulta; días futuros no llaman a TrackSolid", async () => {
  assert.equal((await sync({ dateFrom: "2026-10-12", dateTo: "2026-10-12" }, "assistant")).status, 403);
  assert.equal((await sync({ dateFrom: "2026-10-01", dateTo: "2026-10-31" })).status, 400);
  calls = [];
  const r = await sync({ dateFrom: "2099-01-01", dateTo: "2099-01-05" });
  assert.equal(r.status, 200); assert.equal(calls.length, 0);
});

/**
 * B-Logix – Sincronización con TrackSolid (servidor): formato real de la Open API (distance en metros, hora UTC),
 * rango en hora de RD, páginas, km guardados y asignados al viaje del día.
 * Run with: node --test tests/gpsSync.test.mjs
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.BLOGIX_SECRET = "test-secret-gps";
process.env.SUPABASE_URL = "http://mock"; process.env.SUPABASE_SERVICE_KEY = "k";
Object.assign(process.env, { TRACKSOLID_APP_KEY: "ak", TRACKSOLID_APP_SECRET: "as", TRACKSOLID_ACCOUNT: "acc", TRACKSOLID_PASSWORD: "pw", TRACKSOLID_NODE: "us" });
const { signToken } = await import("../netlify/functions/api.mjs");
const { default: handler } = await import("../netlify/functions/gps.mjs");

let db, calls, mileage;
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
    if ((opt.method || "GET") === "GET") return json((db[table] || []).map(rec => ({ rec })));
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
  calls = [];
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

test("trae los km reales: metros → km, día de RD, guarda y se los pone al viaje del 12", async () => {
  const r = await sync({ dateFrom: "2026-10-12", dateTo: "2026-10-12" });
  assert.equal(r.status, 200);
  const q = calls.find(c => c.method === "jimi.device.track.mileage");
  assert.equal(q.begin_time, "2026-10-12 04:00:00", "medianoche de RD = 04:00 UTC");
  assert.ok(q.end_time <= "2026-10-13 03:59:59");
  assert.equal(q.imeis, "865784056748828,863767070202668");
  assert.equal(r.body.totalKm, 306.2);
  assert.deepEqual(r.body.tripKm, [{ tripId: 1, km: 306.2 }]);
  const g = db.bl_gps_km.find(x => x.date === "2026-10-12" && x.imei === "865784056748828");
  assert.equal(g.km, 306.2); assert.equal(g.id, 1, "reusa la fila del día (no duplica)");
  assert.equal(db.bl_trips.find(t => t.id === 1).km, 306.2); assert.equal(db.bl_trips.find(t => t.id === 1).kmSource, "gps");
  assert.ok(!db.bl_trips.find(t => t.id === 2).km, "el Hino no tuvo km: su viaje no se toca");
});

test("si el GPS manda trayectos sin km reconocibles, lo dice (con los nombres de los campos) y no pone 0 a los viajes", async () => {
  mileage = () => [{ imei: "865784056748828", startTime: "2026-10-12 12:00:00", endTime: "2026-10-12 13:00:00", raro: 5, startLat: 19.5 }];
  const r = await sync({ dateFrom: "2026-10-12", dateTo: "2026-10-12" });
  assert.equal(r.body.items, 1); assert.equal(r.body.totalKm, 0);
  assert.deepEqual(r.body.fields, ["imei", "startTime", "endTime", "raro"], "sin coordenadas");
  assert.deepEqual(r.body.tripKm, []);
});

test("respuesta por páginas: pide la siguiente y no cuenta repetidos", async () => {
  const day = (i) => ({ imei: "865784056748828", startTime: `2026-10-${String(1 + (i % 12)).padStart(2, "0")} 12:${String(i % 60).padStart(2, "0")}:00`, endTime: `x${i}`, distance: 1000 });
  mileage = (p) => p.start_row ? Array.from({ length: 30 }, (_, i) => day(100 + i)) : Array.from({ length: 100 }, (_, i) => day(i));
  const r = await sync({ dateFrom: "2026-10-01", dateTo: "2026-10-12" });
  assert.equal(r.body.items, 130); assert.equal(r.body.pages, 2); assert.equal(r.body.totalKm, 130);
  // si la API ignora la página y repite lo mismo: se para sin duplicar
  calls = []; mileage = () => Array.from({ length: 100 }, (_, i) => day(i));
  const r2 = await sync({ dateFrom: "2026-10-01", dateTo: "2026-10-12" });
  assert.equal(r2.body.items, 100); assert.equal(r2.body.totalKm, 100);
});

test("solo el admin; período futuro no llama a TrackSolid", async () => {
  assert.equal((await sync({ dateFrom: "2026-10-12", dateTo: "2026-10-12" }, "assistant")).status, 403);
  const r = await sync({ dateFrom: "2099-01-01", dateTo: "2099-01-15" });
  assert.equal(r.status, 200); assert.equal(calls.length, 0);
});

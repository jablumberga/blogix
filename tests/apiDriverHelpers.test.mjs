/**
 * B-Logix – Guardado del chofer con ayudantes (servidor real, base de datos simulada en memoria)
 * Run with: node --test tests/apiDriverHelpers.test.mjs
 *
 * Pasa por el handler real de netlify/functions/api.mjs; solo se reemplaza `fetch` (Supabase) por una
 * base en memoria. Cubre lo que no puede fallar cuando el teléfono del chofer tiene datos viejos:
 *  - lista de ayudantes vieja en el teléfono → el servidor corrige el viaje y rehace sus gastos (nadie cobra doble ni se queda sin cobrar)
 *  - número de gasto repetido con uno que el chofer no ve (pago directo de un ayudante) → se le da otro número, nada se pisa
 *  - si la base no responde al leer viajes o gastos → 503 y no se toca nada
 *  - el chofer no puede crear adelantos de ayudantes ni ver datos privados de los ayudantes
 * Cada archivo de prueba corre en su propio proceso (node --test), así que el `fetch` simulado no afecta a los demás.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "http://mock";
process.env.SUPABASE_SERVICE_KEY = "k";
process.env.BLOGIX_SECRET = "test-secret-driver-helpers";
process.env.BLOGIX_RELATIONAL = "true";

const api = await import("../netlify/functions/api.mjs");

// ── Supabase en memoria ──────────────────────────────────────────────────────
const TABLES = ["bl_trips", "bl_expenses", "bl_clients", "bl_trucks", "bl_drivers", "bl_invoices", "bl_cobros", "bl_partners", "bl_brokers", "bl_suppliers", "bl_fixed_templates", "bl_staff"];
let db;
const resetDb = () => { db = Object.fromEntries(TABLES.map(t => [t, new Map()])); db.status = {}; db.fail = new Set(); };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

globalThis.fetch = async (u, opt = {}) => {
  const url = new URL(u);
  const table = url.pathname.split("/").pop();
  const m = (opt.method || "GET").toUpperCase();
  if (db.fail.has(table) && m === "GET") return json({ error: "boom" }, 500);
  if (table === "bl_settlement_status") {
    if (m === "GET") return json([{ data: db.status }]);
    db.status = JSON.parse(opt.body).data;
    return json([]);
  }
  const t = db[table];
  if (!t) return json([]);
  if (m === "GET") return json([...t.values()].sort((a, b) => a.id - b.id).map(rec => ({ rec })));
  if (m === "POST") { for (const r of JSON.parse(opt.body)) t.set(r.id, r.rec); return json([]); }
  if (m === "DELETE") {
    const q = decodeURIComponent(url.search.slice(1)).split("&");
    for (const [id, rec] of [...t]) {
      let ok = true;
      for (const c of q) {
        let mm;
        if ((mm = c.match(/^rec->>(\w+)=eq\.(.*)$/))) ok = ok && String(rec[mm[1]]) === mm[2];
        else if ((mm = c.match(/^rec->>(\w+)=neq\.(.*)$/))) ok = ok && rec[mm[1]] != null && String(rec[mm[1]]) !== mm[2]; // SQL: NULL <> x no coincide
        else if ((mm = c.match(/^id=not\.in\.\((.*)\)$/))) ok = ok && !mm[1].split(",").map(Number).includes(id);
      }
      if (ok) t.delete(id);
    }
    return json([]);
  }
  return json([]);
};

async function call(method, user, body) {
  const tok = await api.signToken(user, process.env.BLOGIX_SECRET);
  const r = await api.default(new Request("http://localhost/api/data", {
    method,
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  return { status: r.status, body: await r.json() };
}

// ── Datos de prueba ──────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const DRIVER = { id: "d-5", role: "driver", refId: 5, name: "Edwin" };
const nextIdOf = (arr) => arr.reduce((max, x) => (x.id > max ? x.id : max), 0) + 1; // como lo calcula el teléfono
const tripExps = (tripId) => [...db.bl_expenses.values()].filter(e => e.tripId === tripId).sort((a, b) => a.id - b.id)
  .map(e => `${e.id}:${e.category}:${e.amount}:${e.ayudanteId ?? "-"}`);
const helperTotal = (tripId) => [...db.bl_expenses.values()].filter(e => e.tripId === tripId && e.category === "helper").reduce((s, e) => s + e.amount, 0);

function seedBase(ayudantes) {
  db.bl_drivers.set(5, { id: 5, name: "Edwin", truckId: 1, payType: "perTrip" });
  db.bl_trucks.set(1, { id: 1, plate: "L1", size: "T2", helperIds: [1] });
  db.bl_clients.set(3, { id: 3, companyName: "C", status: "active", rules: {} });
  db.status = { _version: 1, __ayudantes: ayudantes };
}

/** Viaje nuevo hecho en el teléfono con Pedro (ayudante 1) como directo o por el chofer, según lo que el teléfono creía. */
function phoneNewTrip(phoneDirect) {
  const trip = { id: 20, driverId: 5, truckId: 1, clientId: 3, province: "S", municipality: "S", revenue: 9000, status: "pending", date: today, numHelpers: 2, helperPayEach: 500,
    helpers: [{ name: "Pedro", pay: 500, ayudanteId: 1, direct: phoneDirect }, { name: "Ayudante 2", pay: 500 }], helperNames: ["Pedro", ""] };
  const exps = [
    { id: 100, category: "fuel", amount: 50, driverId: 5, date: today, status: "pending" },
    { id: 101, tripId: 20, category: "driverPay", amount: 2000, driverId: 5, status: "pending", date: today },
    ...(phoneDirect
      ? [{ id: 102, tripId: 20, category: "helper", amount: 500, driverId: 5, status: "pending", date: today },
         { id: 103, tripId: 20, category: "helper", amount: 500, ayudanteId: 1, status: "pending", date: today }]
      : [{ id: 102, tripId: 20, category: "helper", amount: 1000, driverId: 5, status: "pending", date: today }]),
  ];
  return { trip, exps };
}

beforeEach(() => resetDb());

// ── Lista de ayudantes vieja en el teléfono ─────────────────────────────────
test("teléfono cree que Pedro es directo, la lista dice «por el chofer»: todo va al chofer y el gasto nuevo no pisa nada", async () => {
  seedBase([{ id: 1, name: "Pedro", payMode: "driver", status: "active" }]);
  db.bl_expenses.set(100, { id: 100, category: "fuel", amount: 50, driverId: 5, date: today, status: "pending" });
  const { trip, exps } = phoneNewTrip(true);

  let r = await call("POST", DRIVER, { trips: [trip], expenses: exps });
  assert.equal(r.status, 200);
  assert.deepEqual(tripExps(20), ["101:driverPay:2000:-", "104:helper:1000:-"]);
  assert.equal(db.bl_trips.get(20).helpers[0].direct, false, "la línea de Pedro queda «por el chofer»");
  assert.equal(helperTotal(20), 1000, "los dos ayudantes se pagan una sola vez");

  // El teléfono (sin recargar) agrega combustible con el número que él cree libre (104), que ya existe en el servidor
  const fuelId = nextIdOf(exps);
  assert.equal(fuelId, 104);
  r = await call("POST", DRIVER, { trips: [trip], expenses: [...exps, { id: fuelId, tripId: 20, category: "fuel", amount: 800, driverId: 5, status: "pending", date: today }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.remap?.expenses, { 104: 105 });
  assert.deepEqual(tripExps(20), ["101:driverPay:2000:-", "104:helper:1000:-", "105:fuel:800:-"]);
});

test("teléfono cree que Pedro es por el chofer, la lista dice «directo»: se separa su pago y el gasto nuevo no pisa nada", async () => {
  seedBase([{ id: 1, name: "Pedro", payMode: "direct", status: "active" }]);
  db.bl_expenses.set(100, { id: 100, category: "fuel", amount: 50, driverId: 5, date: today, status: "pending" });
  const { trip, exps } = phoneNewTrip(false);

  let r = await call("POST", DRIVER, { trips: [trip], expenses: exps });
  assert.equal(r.status, 200);
  assert.deepEqual(tripExps(20), ["101:driverPay:2000:-", "103:helper:500:-", "104:helper:500:1"]);
  assert.equal(db.bl_trips.get(20).helpers[0].direct, true);
  assert.equal(helperTotal(20), 1000);

  const fuelId = nextIdOf(exps); // 103: choca con el gasto del chofer que creó el servidor
  r = await call("POST", DRIVER, { trips: [trip], expenses: [...exps, { id: fuelId, tripId: 20, category: "fuel", amount: 800, driverId: 5, status: "pending", date: today }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.remap?.expenses, { 103: 105 });
  assert.deepEqual(tripExps(20), ["101:driverPay:2000:-", "103:helper:500:-", "104:helper:500:1", "105:fuel:800:-"]);
});

test("después de recargar, el chofer no ve el pago directo de Pedro y su gasto nuevo con ese número no lo pisa", async () => {
  seedBase([{ id: 1, name: "Pedro", payMode: "direct", status: "active" }]);
  db.bl_expenses.set(100, { id: 100, category: "fuel", amount: 50, driverId: 5, date: today, status: "pending" });
  const { trip, exps } = phoneNewTrip(false);
  assert.equal((await call("POST", DRIVER, { trips: [trip], expenses: exps })).status, 200);

  const g = await call("GET", DRIVER);
  assert.equal(g.status, 200);
  assert.deepEqual(g.body.expenses.map(e => e.id), [100, 101, 103], "el gasto 104 (pago directo de Pedro) no le sale al chofer");
  const fuelId = nextIdOf(g.body.expenses);
  assert.equal(fuelId, 104);
  const r = await call("POST", DRIVER, { trips: g.body.trips, expenses: [...g.body.expenses, { id: fuelId, tripId: 20, category: "fuel", amount: 800, driverId: 5, status: "pending", date: today }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.remap?.expenses, { 104: 105 });
  assert.deepEqual(tripExps(20), ["101:driverPay:2000:-", "103:helper:500:-", "104:helper:500:1", "105:fuel:800:-"]);
});

test("viaje hecho en la oficina con Pedro directo: el chofer agrega un gasto y el pago de Pedro sigue intacto", async () => {
  seedBase([{ id: 1, name: "Pedro", payMode: "direct", status: "active" }]);
  db.bl_trips.set(30, { id: 30, driverId: 5, truckId: 1, clientId: 3, province: "S", municipality: "S", revenue: 9000, status: "pending", date: today, numHelpers: 2, helperPayEach: 500,
    helpers: [{ name: "Pedro", pay: 500, ayudanteId: 1, direct: true }, { name: "Ayudante 2", pay: 500 }] });
  for (const e of [
    { id: 201, tripId: 30, category: "driverPay", amount: 2000, driverId: 5, status: "pending" },
    { id: 202, tripId: 30, category: "helper", amount: 500, driverId: 5, status: "pending" },
    { id: 203, tripId: 30, category: "helper", amount: 500, ayudanteId: 1, status: "pending" },
  ]) db.bl_expenses.set(e.id, { ...e, date: today });

  const g = await call("GET", DRIVER);
  assert.deepEqual(g.body.expenses.map(e => e.id), [201, 202]);
  const id = nextIdOf(g.body.expenses);
  const r = await call("POST", DRIVER, { trips: g.body.trips, expenses: [...g.body.expenses, { id, tripId: 30, category: "fuel", amount: 800, driverId: 5, status: "pending", date: today }] });
  assert.equal(r.status, 200);
  assert.deepEqual(tripExps(30), ["201:driverPay:2000:-", "202:helper:500:-", "203:helper:500:1", "204:fuel:800:-"]);
  assert.deepEqual(db.bl_trips.get(30).helpers, [{ name: "Pedro", pay: 500, ayudanteId: 1, direct: true }, { name: "Ayudante 2", pay: 500 }]);
});

test("teléfono viejo manda un viaje existente con otras líneas de ayudantes: el servidor conserva las suyas", async () => {
  seedBase([{ id: 1, name: "Pedro", payMode: "direct", status: "active" }]);
  const serverTrip = { id: 30, driverId: 5, truckId: 1, clientId: 3, province: "S", municipality: "S", revenue: 9000, status: "pending", date: today, numHelpers: 2, helperPayEach: 500,
    helpers: [{ name: "Pedro", pay: 500, ayudanteId: 1, direct: true }, { name: "Ayudante 2", pay: 500 }] };
  db.bl_trips.set(30, serverTrip);
  for (const e of [
    { id: 201, tripId: 30, category: "driverPay", amount: 2000, driverId: 5, status: "pending" },
    { id: 202, tripId: 30, category: "helper", amount: 500, driverId: 5, status: "pending" },
    { id: 203, tripId: 30, category: "helper", amount: 500, ayudanteId: 1, status: "paid" },
  ]) db.bl_expenses.set(e.id, { ...e, date: today });

  const stale = { ...serverTrip, numHelpers: 3, helpers: [{ name: "Pedro", pay: 500 }, { name: "X", pay: 500 }, { name: "Y", pay: 500 }] };
  const r = await call("POST", DRIVER, { trips: [stale], expenses: [db.bl_expenses.get(201), { ...db.bl_expenses.get(202), amount: 1500 }] });
  assert.equal(r.status, 200);
  assert.equal(db.bl_trips.get(30).numHelpers, 2);
  assert.deepEqual(db.bl_trips.get(30).helpers, serverTrip.helpers);
  assert.deepEqual(tripExps(30), ["201:driverPay:2000:-", "202:helper:500:-", "203:helper:500:1"], "los gastos automáticos del viaje no cambian desde el teléfono");
  assert.equal(db.bl_expenses.get(203).status, "paid");
});

// ── La base no responde ─────────────────────────────────────────────────────
for (const table of ["bl_trips", "bl_expenses"]) {
  test(`si falla la lectura de ${table}, el guardado del chofer se rechaza (503) y no se toca nada`, async () => {
    seedBase([{ id: 1, name: "Pedro", payMode: "direct", status: "inactive" }]);
    const trip = { id: 30, driverId: 5, truckId: 1, clientId: 3, province: "S", municipality: "S", revenue: 9000, status: "pending", date: today, numHelpers: 2, helperPayEach: 500,
      helpers: [{ name: "Pedro", pay: 500, ayudanteId: 1, direct: true }, { name: "Ayudante 2", pay: 500 }] };
    db.bl_trips.set(30, trip);
    for (const e of [
      { id: 201, tripId: 30, category: "driverPay", amount: 2000, driverId: 5, status: "pending" },
      { id: 202, tripId: 30, category: "helper", amount: 500, driverId: 5, status: "pending" },
      { id: 203, tripId: 30, category: "helper", amount: 500, ayudanteId: 1, status: "paid" },
    ]) db.bl_expenses.set(e.id, { ...e, date: today });
    const before = JSON.stringify([[...db.bl_trips], [...db.bl_expenses]]);

    db.fail.add(table);
    const r = await call("POST", DRIVER, { trips: [trip], expenses: [db.bl_expenses.get(201), db.bl_expenses.get(202)] });
    db.fail.delete(table);
    assert.equal(r.status, 503);
    assert.equal(JSON.stringify([[...db.bl_trips], [...db.bl_expenses]]), before);
    assert.equal(helperTotal(30), 1000);
  });
}

test("si falla la lectura de la lista de ayudantes, el guardado del chofer se rechaza (503)", async () => {
  seedBase([{ id: 1, name: "Pedro", payMode: "direct", status: "active" }]);
  db.fail.add("bl_settlement_status");
  const { trip, exps } = phoneNewTrip(true);
  const r = await call("POST", DRIVER, { trips: [trip], expenses: exps });
  db.fail.delete("bl_settlement_status");
  assert.equal(r.status, 503);
  assert.equal(db.bl_trips.size, 0);
  assert.equal(db.bl_expenses.size, 0);
});

// ── Lo que el chofer no puede hacer ni ver ──────────────────────────────────
test("el chofer no puede crear adelantos de ayudantes", async () => {
  seedBase([{ id: 1, name: "Pedro", payMode: "direct", status: "active" }]);
  const r = await call("POST", DRIVER, { trips: [], expenses: [{ id: 300, category: "adelanto_ayudante", amount: 5000, ayudanteId: 1, driverId: 5, status: "paid", date: today }] });
  assert.equal(r.status, 200);
  assert.equal([...db.bl_expenses.values()].some(e => e.category === "adelanto_ayudante"), false);
});

test("el chofer no puede borrar adelantos de ayudantes ni pagos directos al guardar", async () => {
  seedBase([{ id: 1, name: "Pedro", payMode: "direct", status: "active" }]);
  db.bl_expenses.set(400, { id: 400, category: "adelanto_ayudante", amount: 3000, ayudanteId: 1, driverId: 5, status: "paid", date: today });
  db.bl_trips.set(30, { id: 30, driverId: 5, truckId: 1, clientId: 3, province: "S", municipality: "S", revenue: 9000, status: "pending", date: today, numHelpers: 1, helperPayEach: 500,
    helpers: [{ name: "Pedro", pay: 500, ayudanteId: 1, direct: true }] });
  db.bl_expenses.set(203, { id: 203, tripId: 30, category: "helper", amount: 500, ayudanteId: 1, status: "pending", date: today });
  const r = await call("POST", DRIVER, { trips: [db.bl_trips.get(30)], expenses: [] });
  assert.equal(r.status, 200);
  assert.ok(db.bl_expenses.has(400), "el adelanto sigue");
  assert.ok(db.bl_expenses.has(203), "el pago directo de Pedro sigue");
});

test("el chofer ve solo nombre y forma de pago de los ayudantes activos (sin cédula ni cuenta)", async () => {
  seedBase([
    { id: 1, name: "Pedro", payMode: "direct", status: "active", cedula: "001-0000000-1", bank: "Banco X", account: "123", phone: "809" },
    { id: 2, name: "Juan", payMode: "driver", status: "inactive" },
    { id: 3, name: "Borrado", status: "deleted" },
  ]);
  const g = await call("GET", DRIVER);
  assert.equal(g.status, 200);
  assert.deepEqual(g.body.ayudantes, [{ id: 1, name: "Pedro", payMode: "direct", status: "active" }]);
  assert.deepEqual(g.body.trucks.find(t => t.id === 1)?.helperIds, [1], "el chofer ve la tripulación fija de su camión");
});

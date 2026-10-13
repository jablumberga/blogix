import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTripRef, linkJoint, validateTripWrites, autoLinkJointPairs, normRef } from "../src/utils/tripRef.js";

const base = (o) => ({ id: 1, date: "2026-10-01", clientId: 1, truckId: 1, driverId: 1, invoiceRef: "F-100", status: "delivered", ...o });

test("referencia repetida del mismo cliente se rechaza", () => {
  const r = checkTripRef(base({ id: 2, truckId: 2 }), [base()]);
  assert.equal(r.ok, false); assert.match(r.error, /ya está registrada/);
});
test("normaliza espacios y mayúsculas", () => {
  assert.equal(normRef("  f-100 "), "F-100");
  assert.equal(checkTripRef(base({ id: 2, truckId: 2, invoiceRef: "f-100 " }), [base()]).ok, false);
});
test("otro cliente con la misma referencia no choca; cancelados no cuentan; sin referencia no valida", () => {
  assert.equal(checkTripRef(base({ id: 2, clientId: 2 }), [base()]).ok, true);
  assert.equal(checkTripRef(base({ id: 2, truckId: 2 }), [base({ status: "cancelled" })]).ok, true);
  assert.equal(checkTripRef(base({ id: 2, invoiceRef: "" }), [base({ invoiceRef: "" })]).ok, true);
});
test("viaje conjunto: segundo camión enlaza si uno de los dos está marcado", () => {
  const r = checkTripRef(base({ id: 2, truckId: 2, joint: true }), [base()]);
  assert.equal(r.ok, true); assert.equal(r.linkWith.id, 1);
  const l = linkJoint(base({ id: 2, truckId: 2, joint: true }), base());
  assert.equal(l.trip.jointWith, 1); assert.equal(l.other.jointWith, 2); assert.equal(l.other.joint, true);
  assert.equal(checkTripRef(base({ id: 2, truckId: 2 }), [base({ joint: true })]).ok, true, "el primero marcado autoriza al segundo");
});
test("conjunto: mismo camión no vale, y nunca más de 2 camiones", () => {
  assert.equal(checkTripRef(base({ id: 2, truckId: 1, joint: true }), [base()]).ok, false);
  const r = checkTripRef(base({ id: 3, truckId: 3, joint: true }), [base({ joint: true }), base({ id: 2, truckId: 2, joint: true })]);
  assert.equal(r.ok, false); assert.match(r.error, /máximo 2/);
});
test("validateTripWrites: solo revisa nuevos o cambiados; histórico duplicado no bloquea", () => {
  const existing = [base(), base({ id: 2 })]; // duplicado viejo (mismo camión)
  let v = validateTripWrites({ incoming: existing, existing });
  assert.equal(v.errors.length, 0, "sin cambios no se bloquea");
  v = validateTripWrites({ incoming: [base({ id: 3, truckId: 2, invoiceRef: "F-200" }), base({ id: 4, truckId: 3, invoiceRef: "F-200" })], existing: [] });
  assert.ok(v.errors.length >= 1, "dos nuevos con la misma referencia sin marcar conjunto: se rechaza");
  v = validateTripWrites({ incoming: [base({ id: 5, truckId: 2, invoiceRef: "F-300", joint: true })], existing: [base({ id: 6, truckId: 3, invoiceRef: "F-300" })] });
  assert.deepEqual(v.links, [{ tripId: 5, otherId: 6 }]);
  v = validateTripWrites({ incoming: [base({ id: 7, truckId: 2, invoiceRef: "F-100" })], existing: [base()] });
  assert.equal(v.errors.length, 1, "chofer mete referencia de otro viaje sin ser conjunto");
});
test("autoLinkJointPairs enlaza parejas históricas en camiones distintos", () => {
  const { trips, changed } = autoLinkJointPairs([base(), base({ id: 2, truckId: 2 }), base({ id: 3, invoiceRef: "X" }), base({ id: 4, invoiceRef: "X" })]);
  assert.equal(changed, 1); assert.equal(trips[0].jointWith, 2); assert.equal(trips[1].jointWith, 1); assert.equal(trips[2].joint, undefined);
});

import { sanitizeDriverTrips } from "../src/utils/tripRef.js";
const clients = [{ id: 1, companyName: "Bocel", status: "active", rules: { requiresInvoiceRef: true } }, { id: 2, companyName: "Viejo", status: "inactive", rules: {} }];
const trucks = [{ id: 1 }, { id: 2 }];
const good = { id: 10, date: "2026-10-08", clientId: 1, truckId: 1, driverId: 5, province: "Dajabón", municipality: "Dajabón", revenue: 5000, invoiceRef: "R-1", status: "pending" };
const today = new Date("2026-10-09T12:00:00");

test("sanitizeDriverTrips: viaje válido pasa; nunca cambia de chofer", () => {
  const r = sanitizeDriverTrips({ incoming: [{ ...good, driverId: 99 }], existing: [], driverId: 5, clients, trucks, today });
  assert.equal(r.errors.length, 0); assert.equal(r.trips[0].driverId, 5);
});
test("sanitizeDriverTrips: rechaza sin cliente/destino/camión/fecha, cliente inactivo y referencia faltante", () => {
  const bad = [
    { ...good, id: 11, clientId: 9 }, { ...good, id: 12, municipality: "" }, { ...good, id: 13, truckId: 7 },
    { ...good, id: 15, date: "2025-01-01" }, { ...good, id: 16, clientId: 2 }, { ...good, id: 17, invoiceRef: "" }, { ...good, id: 18, date: "hoy" },
  ];
  const r = sanitizeDriverTrips({ incoming: bad, existing: [], driverId: 5, clients, trucks, today });
  assert.equal(r.errors.length, 7); assert.equal(r.trips.length, 0);
  assert.match(r.errors.find(e => e.tripId === 17).error, /referencia/);
  // cancelado: no exige tarifa ni referencia
  const c = sanitizeDriverTrips({ incoming: [{ ...good, id: 19, revenue: 0, invoiceRef: "", status: "cancelled" }], existing: [], driverId: 5, clients, trucks, today });
  assert.equal(c.errors.length, 0);
});
test("sanitizeDriverTrips: sin tarifa del cliente se guarda igual (tarifa 0, queda por completar)", () => {
  const r = sanitizeDriverTrips({ incoming: [{ ...good, id: 14, revenue: 0 }, { ...good, id: 24, revenue: "" }, { ...good, id: 25, revenue: -50 }], existing: [], driverId: 5, clients, trucks, today });
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.trips.map(t => [t.id, t.revenue]), [[14, 0], [24, 0], [25, 0]]);
});
test("sanitizeDriverTrips: facturado, cobrado o recibido en oficina no se puede editar (se conserva el del servidor)", () => {
  const existing = [{ ...good, id: 20, revenue: 5000 }, { ...good, id: 21 }, { ...good, id: 22, docsReceivedAt: "2026-10-08" }];
  const r = sanitizeDriverTrips({ incoming: [{ ...good, id: 20, revenue: 1 }, { ...good, id: 21, revenue: 1 }, { ...good, id: 22, revenue: 1 }], existing, driverId: 5, clients, trucks, today,
    invoices: [{ status: "sent", tripIds: [20] }], cobros: [{ collectedTripIds: [21] }] });
  assert.deepEqual(r.ignored, [20, 21, 22]);
  assert.ok(r.trips.every(t => t.revenue === 5000), "los cambios se descartan");
});
test("sanitizeDriverTrips: conserva enlace de conjunto y bitácora del servidor", () => {
  const existing = [{ ...good, id: 30, jointWith: 31, jointAuto: true, createdAt: "2026-10-01T00:00:00Z", history: [{ a: 1 }] }];
  const r = sanitizeDriverTrips({ incoming: [{ ...good, id: 30, revenue: 6000 }], existing, driverId: 5, clients, trucks, today });
  assert.equal(r.trips[0].revenue, 6000); assert.equal(r.trips[0].jointWith, 31); assert.equal(r.trips[0].history.length, 1);
});
test("sanitizeDriverTrips: un viaje viejo sin cambios no se bloquea por la fecha", () => {
  const old = { ...good, id: 40, date: "2026-01-05" };
  const r = sanitizeDriverTrips({ incoming: [old], existing: [old], driverId: 5, clients, trucks, today });
  assert.equal(r.errors.length, 0); assert.equal(r.trips[0].id, 40);
  const edited = sanitizeDriverTrips({ incoming: [{ ...old, revenue: 9 }], existing: [old], driverId: 5, clients, trucks, today });
  assert.equal(edited.errors.length, 1, "editar un viaje de hace meses sí se rechaza");
});

// ── Ayudantes en viajes del chofer ────────────────────────────────────────────
const lista = [{ id: 1, name: "Pedro", payMode: "direct", status: "active" }, { id: 2, name: "Juan", payMode: "driver", status: "active" }, { id: 3, name: "Luis", payMode: "direct", status: "inactive" }];
test("sanitizeDriverTrips: viaje nuevo con ayudantes de la lista válidos pasa", () => {
  const helpers = [{ name: "Pedro", pay: 500, ayudanteId: 1, direct: true }, { name: "Juan", pay: 500, ayudanteId: 2, direct: false }, { name: "Chichí", pay: 500 }];
  const r = sanitizeDriverTrips({ incoming: [{ ...good, id: 30, helpers }], existing: [], driverId: 5, clients, trucks, today, ayudantes: lista });
  assert.equal(r.errors.length, 0); assert.deepEqual(r.trips[0].helpers, helpers);
});
test("lista vieja en el teléfono: el servidor corrige las líneas (no rechaza el viaje) y rehace sus gastos de ayudantes", async () => {
  const { normalizeDriverHelpers, normalizeHelperLines } = await import("../src/utils/ayudantes.js");
  const lista2 = [...lista, { id: 4, name: "Borrado", status: "deleted" }];
  const helpers = [{ name: "X", pay: 500, ayudanteId: 9, direct: true }, { name: "Luis", pay: 500, ayudanteId: 3, direct: true },
                   { name: "Juan", pay: 500, ayudanteId: 2, direct: true }, { name: "Y", pay: 500, direct: true }, { name: "Pedro", pay: 500, ayudanteId: 1, direct: true },
                   { name: "Pedro", pay: 500, ayudanteId: 1, direct: true }, { name: "Borrado", pay: 500, ayudanteId: 4, direct: true }];
  const n = normalizeHelperLines(helpers, lista2);
  assert.equal(n.changed, true);
  assert.deepEqual(n.lines.map(l => [l.ayudanteId ?? null, !!l.direct]), [[null, false], [null, false], [2, false], [null, false], [1, true], [null, false], [null, false]]);
  // viaje válido: no cambia nada
  const ok = [{ name: "Pedro", pay: 500, ayudanteId: 1, direct: true }, { name: "Juan", pay: 500, ayudanteId: 2, direct: false }, { name: "Chichí", pay: 500 }];
  assert.equal(normalizeHelperLines(ok, lista).changed, false);
  // gastos rehechos: Pedro directo 500 y el resto (6 × 500) por el chofer
  const trip = { ...good, id: 60, driverId: 5, numHelpers: 7, helperPayEach: 500, helpers };
  const exps = [{ id: 1, tripId: 60, category: "helper", amount: 2500, ayudanteId: 9 }, { id: 2, tripId: 60, category: "fuel", amount: 100 }];
  const r = normalizeDriverHelpers({ trips: [trip], expenses: exps, ayudantes: lista2, nextExpenseId: 10 });
  assert.deepEqual(r.fixedTripIds, [60]);
  const h = r.expenses.filter(e => e.category === "helper").map(e => [e.ayudanteId ?? null, e.driverId ?? null, e.amount, e.id]);
  assert.deepEqual(h, [[null, 5, 3000, 10], [1, null, 500, 11]]);
  assert.ok(r.expenses.some(e => e.category === "fuel"), "los demás gastos quedan");
  // un viaje sin cambios no toca sus gastos
  const r2 = normalizeDriverHelpers({ trips: [{ ...good, id: 61, helpers: ok }], expenses: exps, ayudantes: lista, nextExpenseId: 10 });
  assert.deepEqual(r2.fixedTripIds, []); assert.equal(r2.expenses, exps.length ? r2.expenses : r2.expenses); assert.deepEqual(r2.expenses, exps);
});
test("sanitizeDriverTrips: en un viaje ya registrado el chofer no cambia los ayudantes (los pone la oficina)", () => {
  const prev = { ...good, id: 40, numHelpers: 2, helpers: [{ name: "Pedro", pay: 500, ayudanteId: 1, direct: true }, { name: "Juan", pay: 500, ayudanteId: 2, direct: false }] };
  const stale = { ...good, id: 40, status: "delivered", numHelpers: 1, helpers: [{ name: "Ayudante 1", pay: 500 }] };
  const r = sanitizeDriverTrips({ incoming: [stale], existing: [prev], driverId: 5, clients, trucks, today, ayudantes: lista });
  assert.equal(r.errors.length, 0); assert.equal(r.trips[0].status, "delivered");
  assert.deepEqual(r.trips[0].helpers, prev.helpers); assert.equal(r.trips[0].numHelpers, 2);
  // sin lista (llamadas viejas): igual que antes
  const r2 = sanitizeDriverTrips({ incoming: [stale], existing: [prev], driverId: 5, clients, trucks, today });
  assert.equal(r2.trips[0].numHelpers, 1);
});

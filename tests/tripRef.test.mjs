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
test("sanitizeDriverTrips: rechaza sin cliente/destino/camión/tarifa/fecha, cliente inactivo y referencia faltante", () => {
  const bad = [
    { ...good, id: 11, clientId: 9 }, { ...good, id: 12, municipality: "" }, { ...good, id: 13, truckId: 7 }, { ...good, id: 14, revenue: 0 },
    { ...good, id: 15, date: "2025-01-01" }, { ...good, id: 16, clientId: 2 }, { ...good, id: 17, invoiceRef: "" }, { ...good, id: 18, date: "hoy" },
  ];
  const r = sanitizeDriverTrips({ incoming: bad, existing: [], driverId: 5, clients, trucks, today });
  assert.equal(r.errors.length, 8); assert.equal(r.trips.length, 0);
  assert.match(r.errors.find(e => e.tripId === 14).error, /tarifa/); assert.match(r.errors.find(e => e.tripId === 17).error, /referencia/);
  // cancelado: no exige tarifa ni referencia
  const c = sanitizeDriverTrips({ incoming: [{ ...good, id: 19, revenue: 0, invoiceRef: "", status: "cancelled" }], existing: [], driverId: 5, clients, trucks, today });
  assert.equal(c.errors.length, 0);
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

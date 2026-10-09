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

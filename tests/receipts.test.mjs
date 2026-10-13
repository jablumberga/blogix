/**
 * B-Logix – Recibos por foto: reglas puras (lectura, datos obligatorios, validación, duplicados, paso a gasto)
 * Run with: node --test tests/receipts.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRead, readProblems, validateSubmit, changedFromRead, receiptDuplicates, matchSupplier, receiptToExpenseForm, receiptStatus, PHOTO_KEY_RE, photoOwnerPrefix } from "../src/utils/receipts.js";

const goodFuel = { es_recibo: true, legible: true, calidad: "buena", problemas: [], categoria: "fuel", negocio: "Estación Shell Dajabón", rnc: "101234567", ncf: "b02 00001234", fecha: "12/10/2026", monto_total: "7,140.00", moneda: "DOP", itbis: 0, galones: 25.5, precio_galon: 280 };

test("normalizeRead: limpia montos con comas, fecha día/mes/año, NCF en mayúsculas", () => {
  const r = normalizeRead(goodFuel);
  assert.equal(r.amount, 7140);
  assert.equal(r.date, "2026-10-12");
  assert.equal(r.ncf, "B0200001234");
  assert.equal(r.category, "fuel");
  assert.equal(r.gallons, 25.5);
  assert.equal(r.itbis, null, "ITBIS 0 → null");
});

test("normalizeRead: fecha imposible o categoría desconocida no se inventan", () => {
  const r = normalizeRead({ ...goodFuel, fecha: "31/02/2026", categoria: "comida" });
  assert.equal(r.date, null);
  assert.equal(r.category, "other");
});

test("normalizeRead: galones calculados con total ÷ precio por galón cuando no aparecen", () => {
  const r = normalizeRead({ ...goodFuel, galones: null, monto_total: 7140, precio_galon: 280 });
  assert.equal(r.gallons, 25.5);
  assert.equal(r.gallonsComputed, true);
});

test("readProblems: foto buena no tiene problemas", () => {
  assert.deepEqual(readProblems(normalizeRead(goodFuel)), []);
});

test("readProblems: no es recibo / no se lee → se rechaza", () => {
  assert.match(readProblems(normalizeRead({ ...goodFuel, es_recibo: false }))[0], /no parece un recibo/);
  assert.match(readProblems(normalizeRead({ ...goodFuel, legible: false }))[0], /no se lee bien/);
  assert.match(readProblems(normalizeRead({ ...goodFuel, calidad: "mala" }))[0], /no se lee bien/);
});

test("readProblems: faltan datos obligatorios (monto, fecha, negocio; galones en combustible)", () => {
  assert.deepEqual(readProblems(normalizeRead({ ...goodFuel, monto_total: null })), ["No se lee el monto total."]);
  assert.deepEqual(readProblems(normalizeRead({ ...goodFuel, fecha: null, negocio: null })), ["No se lee la fecha ni el nombre del negocio."]);
  assert.deepEqual(readProblems(normalizeRead({ ...goodFuel, galones: null, precio_galon: null })), ["No se lee los galones."]);
  assert.deepEqual(readProblems(normalizeRead({ ...goodFuel, categoria: "toll", galones: null, precio_galon: null })), [], "en un peaje no hacen falta galones");
  assert.deepEqual(readProblems(null), ["No se pudo leer la foto."]);
});

const trucks = [{ id: 1, plate: "L1" }, { id: 2, plate: "L2" }], trips = [{ id: 30, driverId: 4 }];
const base = { category: "fuel", amount: "7140", date: "2026-10-12", vendor: "Shell", truckId: 1, gallons: "25.5" };

test("validateSubmit: válido", () => {
  const { fields, errors } = validateSubmit(base, { trucks, trips, today: "2026-10-12" });
  assert.deepEqual(errors, []);
  assert.equal(fields.amount, 7140); assert.equal(fields.gallons, 25.5); assert.equal(fields.truckId, 1);
});

test("validateSubmit: combustible sin camión ni galones, fechas fuera de rango, viaje ajeno, monto 0", () => {
  const e = (f, today = "2026-10-12") => validateSubmit({ ...base, ...f }, { trucks, trips, today }).errors.join(" | ");
  assert.match(e({ truckId: null }), /camión del combustible/);
  assert.match(e({ gallons: "" }), /galones/);
  assert.match(e({ date: "2026-10-20" }), /futuro/);
  assert.match(e({ date: "2026-07-01" }), /más de 60 días/);
  assert.match(e({ tripId: 99 }), /no es tuyo/);
  assert.match(e({ truckId: 9 }), /no está disponible/);
  assert.match(e({ amount: "0" }), /mayor que 0/);
  assert.match(e({ amount: "5000000" }), /demasiado alto/);
  assert.match(e({ vendor: "  " }), /negocio/);
  assert.match(e({ category: "lujo" }), /tipo de gasto/);
});

test("validateSubmit: un peaje no lleva galones aunque los manden", () => {
  const { fields, errors } = validateSubmit({ ...base, category: "toll", truckId: null, gallons: "9" }, { trucks, trips, today: "2026-10-12" });
  assert.deepEqual(errors, []);
  assert.equal(fields.gallons, null);
});

test("changedFromRead: marca solo lo que el chofer cambió de lo que la IA leyó", () => {
  const read = normalizeRead(goodFuel);
  const { fields } = validateSubmit({ ...base, amount: "7500", vendor: "estación shell dajabón", ncf: "B0200001234", date: "2026-10-12" }, { trucks, trips, today: "2026-10-12" });
  assert.deepEqual(changedFromRead(read, fields), [{ field: "amount", read: 7140, sent: 7500 }]);
  assert.deepEqual(changedFromRead(null, fields), []);
});

test("receiptStatus: aprobado si ya hay gasto con su receiptId; si no, rechazado/por revisar", () => {
  assert.equal(receiptStatus({ id: 1, status: "pending" }, new Set([1])), "approved");
  assert.equal(receiptStatus({ id: 1, status: "rejected" }, new Set()), "rejected");
  assert.equal(receiptStatus({ id: 1, status: "pending" }, new Set()), "pending");
});

test("receiptDuplicates: mismo NCF, misma foto, mismo monto+fecha+camión", () => {
  const r = { id: 1, photoHash: "ffff0000ffff0000", fields: { ncf: "B0200001234", amount: 7140, date: "2026-10-12", truckId: 1 } };
  const other = { id: 2, status: "pending", photoHash: "ffff0000ffff0001", fields: { ncf: "B0200001234", amount: 7140, date: "2026-10-12", truckId: 1 } };
  const d = receiptDuplicates(r, { receipts: [r, other], expenses: [{ id: 50, ncf: "B0200001234", amount: 100, date: "2026-10-01" }] });
  assert.ok(d.some(x => /Mismo NCF que otro recibo del 2026-10-12 por RD\$7,140/.test(x)), d.join(" | "));
  assert.ok(d.some(x => /Mismo NCF que el gasto #50/.test(x)));
  assert.ok(d.some(x => /La foto se parece/.test(x)));
  assert.ok(d.some(x => /Mismo monto, fecha y camión/.test(x)));
  assert.deepEqual(receiptDuplicates(r, { receipts: [r, { ...other, status: "rejected" }], expenses: [] }), [], "los rechazados no cuentan");
  assert.deepEqual(receiptDuplicates({ id: 3, fields: { amount: 1, date: "2026-10-12" } }, { receipts: [], expenses: [{ id: 9, receiptId: 3, amount: 1, date: "2026-10-12", truckId: 1 }] }), [], "su propio gasto no es duplicado");
});

test("matchSupplier: por nombre, solo si hay uno que coincide", () => {
  const sup = [{ id: 1, name: "Estación Shell Dajabón SRL" }, { id: 2, name: "Texaco Montecristi" }];
  assert.equal(matchSupplier("ESTACION SHELL DAJABON", sup)?.id, 1);
  assert.equal(matchSupplier("Ferretería Ochoa", sup), null);
  assert.equal(matchSupplier("Shell", [{ id: 1, name: "Shell Dajabón" }, { id: 3, name: "Shell Mao" }]), null, "ambiguo → nada");
});

test("receiptToExpenseForm: gasto pagado con dinero de la empresa, con receiptId, NCF y sin driverId", () => {
  const f = receiptToExpenseForm({ id: 77, driverId: 4, fields: { category: "fuel", amount: 7140, date: "2026-10-12", vendor: "Shell", truckId: 1, tripId: 30, gallons: 25.5, ncf: "B02", rnc: "1", itbis: null, note: "lleno" } }, { suppliers: [{ id: 5, name: "Shell" }], driverName: "Edwin" });
  assert.equal(f.receiptId, 77); assert.equal(f.status, "paid"); assert.equal(f.paymentMethod, "cash");
  assert.equal(f.driverId, null, "sin driverId: el guardado del chofer nunca lo toca");
  assert.equal(f.receiptDriverId, 4); assert.equal(f.supplierId, 5); assert.equal(f.tripId, "30"); assert.equal(f.gallons, 25.5);
  assert.match(f.description, /Combustible · Shell · \(foto de Edwin\) — lleno/);
});

test("clave de foto: dueño por rol y forma válida", () => {
  assert.equal(photoOwnerPrefix({ role: "driver", refId: 4 }), "u-d4");
  assert.equal(photoOwnerPrefix({ role: "admin" }), "u-admin");
  assert.ok(PHOTO_KEY_RE.test("u-d4/2026-10/179184153187408.jpg"));
  assert.ok(!PHOTO_KEY_RE.test("../u-d4/2026-10/1.jpg"));
  assert.ok(!PHOTO_KEY_RE.test("u-d4/2026-10/abc.png"));
});

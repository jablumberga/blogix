import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRecords, DEFAULT_SORT } from "../src/utils/sortList.js";

const rows = [
  { id: 1, date: "2026-10-05", amount: 500, name: "beta" },
  { id: 2, date: "2026-10-12", amount: 50, name: "Álvaro" },
  { id: 3, date: "2026-09-30", amount: 5000, name: null },
  { id: 4, date: "2026-10-12", amount: 50, name: "alfa" },
];

test("por defecto: fecha descendente, empate por id descendente; no muta la lista", () => {
  const out = sortRecords(rows, DEFAULT_SORT);
  assert.deepEqual(out.map(r => r.id), [4, 2, 1, 3]);
  assert.equal(rows[0].id, 1);
});
test("fecha ascendente", () => {
  assert.deepEqual(sortRecords(rows, { key: "date", dir: "asc" }).map(r => r.id), [3, 1, 2, 4]);
});
test("número: monto asc/desc", () => {
  assert.deepEqual(sortRecords(rows, { key: "amount", dir: "asc" }).map(r => r.id), [2, 4, 1, 3]);
  assert.deepEqual(sortRecords(rows, { key: "amount", dir: "desc" }).map(r => r.id), [3, 1, 4, 2]);
});
test("texto: sin distinguir acentos/mayúsculas; vacíos al final en ambas direcciones", () => {
  assert.deepEqual(sortRecords(rows, { key: "name", dir: "asc" }).map(r => r.id), [4, 2, 1, 3]);
  assert.deepEqual(sortRecords(rows, { key: "name", dir: "desc" }).map(r => r.id), [1, 2, 4, 3]);
});
test("getter personalizado y números en texto (FAC-2 antes que FAC-10)", () => {
  const inv = [{ id: 1, n: "FAC-10" }, { id: 2, n: "FAC-2" }];
  assert.deepEqual(sortRecords(inv, { key: "num", dir: "asc" }, { num: r => r.n }).map(r => r.id), [2, 1]);
});

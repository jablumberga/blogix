/**
 * B-Logix – Constancia de entrega de documentos (acumulada por quincena, sin montos)
 * Run with: node --test tests/deliveryReceipt.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { quincenaOf, deliveryVisits, deliveryReceipt, deliveryReceiptText, personTrips } from "../src/utils/deliveryReceipt.js";
import { deliveryReceiptHTML } from "../src/utils/printReport.js";
import { applyReceived } from "../src/utils/jointTrip.js";

const docs = { factura: true, conduce: true, pod: true };
const clients = [{ id: 1, companyName: "Cliente <A>" }];
const trucks = [{ id: 10, plate: "L100", partnerId: null }, { id: 20, plate: "S200", partnerId: 7 }];
const drivers = [{ id: 4, name: "Edwin", phone: "8095551234" }, { id: 5, name: "Juan" }];
// Recibido = documentos completos + fecha y hora (hora de RD = UTC-4)
const rec = (id, date, ts, extra = {}) => ({ id, driverId: 4, truckId: 10, clientId: 1, date, municipality: "Santiago", province: "Santiago", invoiceRef: `F-${id}`, revenue: 9000, revenueAmount: 9000, status: "delivered", docs, docsReceivedAt: ts.slice(0, 10), docsReceivedTs: ts, docsReceivedBy: "Ana", ...extra });
const pend = (id, date, extra = {}) => ({ id, driverId: 4, truckId: 10, clientId: 1, date, municipality: "Mao", province: "Valverde", invoiceRef: `F-${id}`, status: "delivered", docs: {}, ...extra });

// Edwin fue 3 veces en la quincena 16–31 oct: 20/10 (2 viajes, marcados con 10 min), 24/10 (1), 24/10 por la tarde (1)
const trips = [
  rec(1, "2026-10-14", "2026-10-20T13:00:00.000Z"), rec(2, "2026-10-15", "2026-10-20T13:10:00.000Z"),
  rec(3, "2026-10-18", "2026-10-24T12:00:00.000Z"),
  rec(4, "2026-10-21", "2026-10-24T19:30:00.000Z"),
  pend(5, "2026-10-22"), pend(6, "2026-10-30"),               // 6: viaje después de la última entrega
  rec(7, "2026-10-01", "2026-10-10T14:00:00.000Z"),           // otra quincena (1–15)
  rec(8, "2026-10-19", "2026-10-25T14:00:00.000Z", { driverId: 5 }),  // otro chofer
  rec(9, "2026-10-19", "2026-10-20T13:05:00.000Z", { status: "cancelled" }),
  { ...rec(11, "2026-10-12", "2026-10-28T12:00:00.000Z"), docsReceivedTs: undefined, docsReceivedAt: "2026-10-28" }, // marca vieja sin hora
];

test("quincenaOf: 1–15 y 16–fin (febrero bisiesto)", () => {
  assert.deepEqual(quincenaOf("2026-10-15"), { dateFrom: "2026-10-01", dateTo: "2026-10-15", label: "1–15 de octubre 2026" });
  assert.equal(quincenaOf("2026-10-16").dateTo, "2026-10-31");
  assert.equal(quincenaOf("2028-02-20").dateTo, "2028-02-29");
});

test("entregas de la quincena: marcas seguidas = 1 entrega; 7 horas después = otra; otro día = otra; viejas sin hora por fecha", () => {
  const list = personTrips({ kind: "driver", id: 4, trips, trucks });
  const v = deliveryVisits(list, { period: quincenaOf("2026-10-25"), clientMap: new Map(clients.map(c => [c.id, c])) });
  assert.deepEqual(v.map(x => x.tripIds), [[1, 2], [3], [4], [11]]);
  assert.deepEqual(v.map(x => x.no), [1, 2, 3, 4]);
  assert.equal(v[0].date, "2026-10-20"); assert.equal(v[0].by, "Ana");
  assert.equal(v[3].legacy, true);
});

test("constancia acumulada: 1.ª lo que trajo; 2.ª lo anterior + lo nuevo marcado; 3.ª igual", () => {
  const base = { kind: "driver", person: drivers[0], trips, trucks, clients, drivers, date: "2026-10-25" };
  const r1 = deliveryReceipt({ ...base, at: 1 });
  assert.deepEqual(r1.items.map(x => [x.trip.id, x.isNew]), [[1, true], [2, true]]);
  assert.equal(r1.newCount, 2); assert.equal(r1.totalCount, 2);
  const r2 = deliveryReceipt({ ...base, at: 2 });
  assert.deepEqual(r2.items.map(x => [x.trip.id, x.isNew]), [[1, false], [2, false], [3, true]]);
  const r3 = deliveryReceipt({ ...base, at: 3 });
  assert.deepEqual(r3.items.map(x => [x.trip.id, x.isNew]), [[1, false], [2, false], [3, false], [4, true]]);
  assert.equal(r3.items.find(x => x.trip.id === 1).visitNo, 1);
  const last = deliveryReceipt(base);
  assert.equal(last.visit.no, 4, "sin «at» = la última entrega");
});

test("pendientes: sin documentos hasta el día de esa entrega (y lo recibido después cuenta como pendiente en una constancia vieja)", () => {
  const base = { kind: "driver", person: drivers[0], trips, trucks, clients, drivers, date: "2026-10-25" };
  const r2 = deliveryReceipt({ ...base, at: 2 }); // 24/10 mediodía
  assert.deepEqual(r2.pending.map(x => x.trip.id), [11, 4, 5], "el 4 se recibió esa tarde y el 11 el 28; el 5 sin documentos; el 6 aún no existía");
  const r3 = deliveryReceipt({ ...base, at: 3 });
  assert.deepEqual(r3.pending.map(x => x.trip.id), [11, 5]);
});

test("sin entregas en la quincena → constancia vacía", () => {
  const r = deliveryReceipt({ kind: "driver", person: drivers[1], trips, trucks, clients, drivers, date: "2026-11-05" });
  assert.equal(r.visit, null); assert.equal(r.visits.length, 0);
});

test("socio: viajes de sus camiones, con el chofer de cada uno", () => {
  const ptrips = [rec(30, "2026-10-17", "2026-10-21T15:00:00.000Z", { truckId: 20, driverId: 5 }), pend(31, "2026-10-18", { truckId: 20, driverId: 5 })];
  const r = deliveryReceipt({ kind: "partner", person: { id: 7, name: "Robinson" }, trips: [...trips, ...ptrips], trucks, clients, drivers, date: "2026-10-25" });
  assert.deepEqual(r.items.map(x => x.trip.id), [30]);
  assert.equal(r.items[0].driver.name, "Juan");
  assert.deepEqual(r.pending.map(x => x.trip.id), [31]);
});

test("texto de WhatsApp y PDF: sin montos, con lo nuevo marcado y lo pendiente; el PDF escapa el HTML", () => {
  const r = deliveryReceipt({ kind: "driver", person: drivers[0], trips, trucks, clients, drivers, date: "2026-10-25", at: 2 });
  const txt = deliveryReceiptText(r, { name: "Edwin" });
  assert.match(txt, /Entrega 2 de la quincena/);
  assert.match(txt, /Entregaste hoy: \*1\* · Acumulado de la quincena: \*3\*/);
  assert.equal((txt.match(/🆕/g) || []).length, 1);
  assert.match(txt, /Te faltan por entregar \(3\)/);
  assert.doesNotMatch(txt, /RD\$|9,?000/);
  const html = deliveryReceiptHTML({ r, kind: "driver", person: drivers[0], generatedBy: "Ana" });
  assert.match(html, /CONSTANCIA DE ENTREGA DE DOCUMENTOS/);
  assert.match(html, /NUEVO HOY/);
  assert.match(html, /Cliente &lt;A&gt;/);
  assert.doesNotMatch(html, /Cliente <A>/);
  assert.doesNotMatch(html, /RD\$/);
});

test("applyReceived: guarda la hora al recibir, no la cambia si ya estaba recibido, la borra al desmarcar", () => {
  const base = [{ id: 1, status: "in_transit", docs: {} }, { id: 2, status: "delivered", docs, docsReceivedAt: "2026-10-01", docsReceivedTs: "2026-10-01T15:00:00.000Z" }];
  const opt = { docKeys: ["factura", "conduce", "pod"], today: "2026-10-20", by: "Ana", now: "2026-10-20T13:00:00.000Z" };
  let r = applyReceived(base, 1, true, opt);
  assert.equal(r[0].docsReceivedTs, "2026-10-20T13:00:00.000Z"); assert.equal(r[0].docsReceivedAt, "2026-10-20");
  r = applyReceived(r, 2, true, opt);
  assert.equal(r[1].docsReceivedTs, "2026-10-01T15:00:00.000Z", "ya estaba recibido: conserva su entrega");
  r = applyReceived(r, 1, false, opt);
  assert.equal(r[0].docsReceivedTs, null); assert.equal(r[0].docsReceivedAt, null);
});

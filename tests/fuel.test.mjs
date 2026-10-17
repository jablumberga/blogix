import { test } from "node:test";
import assert from "node:assert/strict";
import { fuelPriceList, fuelPriceAt, setFuelPrice, removeFuelPrice, fuelGallons, fuelLabel } from "../src/utils/fuel.js";
import { validateSubmit } from "../src/utils/receipts.js";
import { costPerKm } from "../src/utils/costPerKm.js";

const S = { fuelPrices: [{ from: "2026-10-10", price: 300 }, { from: "2026-10-03", price: 290 }, { from: "2026-10-17", price: 310 }] };

test("precio por galón: historial ordenado y vigente por fecha", () => {
  assert.deepEqual(fuelPriceList(S).map(p => p.from), ["2026-10-03", "2026-10-10", "2026-10-17"]);
  assert.equal(fuelPriceAt(S, "2026-10-02"), 0, "antes del primer precio no se inventa");
  assert.equal(fuelPriceAt(S, "2026-10-03"), 290);
  assert.equal(fuelPriceAt(S, "2026-10-09"), 290, "la semana anterior sigue a su precio");
  assert.equal(fuelPriceAt(S, "2026-10-10"), 300);
  assert.equal(fuelPriceAt(S, "2026-10-16"), 300);
  assert.equal(fuelPriceAt(S, "2026-10-20"), 310);
  assert.equal(fuelPriceAt(null, "2026-10-20"), 0);
  assert.equal(fuelPriceAt({ fuelPrices: [{ from: "basura", price: 1 }, { from: "2026-10-01", price: 0 }] }, "2026-10-20"), 0);
});

test("precio por galón: agregar reemplaza la misma fecha; quitar", () => {
  const l = setFuelPrice(S, { from: "2026-10-10", price: 305 });
  assert.equal(l.length, 3); assert.equal(fuelPriceAt({ fuelPrices: l }, "2026-10-12"), 305);
  assert.equal(removeFuelPrice({ fuelPrices: l }, "2026-10-17").length, 2);
  assert.equal(setFuelPrice(S, { from: "2026-10-20", price: 0 }).length, 3, "precio inválido no entra");
});

test("galones: escritos ganan; si no, monto ÷ precio; sin precio null", () => {
  assert.deepEqual(fuelGallons({ amount: 6000, gallons: 20, pricePerGallon: 300 }), { gallons: 20, computed: false });
  assert.deepEqual(fuelGallons({ amount: 6000, gallons: "", pricePerGallon: 300 }), { gallons: 20, computed: true });
  assert.deepEqual(fuelGallons({ amount: 4725, gallons: null, pricePerGallon: 290 }), { gallons: 16.29, computed: true });
  assert.deepEqual(fuelGallons({ amount: 6000, gallons: null, pricePerGallon: 0 }), { gallons: null, computed: false });
  assert.match(fuelLabel({ amount: 6000, gallons: "", date: "2026-10-12", settings: S }), /20 gal a RD\$300\/gal/);
  assert.match(fuelLabel({ amount: 6000, gallons: "", date: "2026-09-01", settings: S }), /sin precio/);
});

test("recibo por foto: combustible sin galones pasa si hay precio en esa fecha", () => {
  const trucks = [{ id: 1, plate: "A1" }];
  const base = { category: "fuel", amount: 6000, date: "2026-10-12", vendor: "Texaco", truckId: 1, gallons: "" };
  const sin = validateSubmit(base, { trucks, trips: [], today: "2026-10-16" });
  assert.ok(sin.errors.includes("Faltan los galones."));
  const con = validateSubmit(base, { trucks, trips: [], today: "2026-10-16", fuelSettings: S });
  assert.deepEqual(con.errors, []); assert.equal(con.fields.gallons, 20);
  const antes = validateSubmit({ ...base, date: "2026-10-01" }, { trucks, trips: [], today: "2026-10-16", fuelSettings: S });
  assert.ok(antes.errors.includes("Faltan los galones."), "sin precio vigente en esa fecha no se inventa");
  const escrito = validateSubmit({ ...base, gallons: 19 }, { trucks, trips: [], today: "2026-10-16", fuelSettings: S });
  assert.equal(escrito.fields.gallons, 19);
});

test("costo por km: combustible viejo sin galones usa el precio de su fecha", () => {
  const trucks = [{ id: 1, plate: "A1", size: "T1", status: "active" }];
  const trips = [{ id: 1, date: "2026-10-12", truckId: 1, driverId: 1, status: "delivered", revenue: 10000, province: "Dajabón", municipality: "Dajabón", odoStart: 0, odoEnd: 200 }];
  const expenses = [{ id: 1, tripId: 1, date: "2026-10-12", category: "fuel", amount: 6000, status: "paid", paymentMethod: "cash" }];
  const args = { dateFrom: "2026-10-01", dateTo: "2026-10-31", trips, expenses, trucks, drivers: [{ id: 1, name: "X" }], today: "2026-10-20" };
  const sin = costPerKm(args); assert.equal(sin.quality.fuelWithoutGallons, 1); assert.equal(sin.byTruck[0].gallons, 0);
  const con = costPerKm({ ...args, fuelSettings: S }); assert.equal(con.quality.fuelWithoutGallons, 0); assert.equal(con.byTruck[0].gallons, 20);
});

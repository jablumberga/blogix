import { test } from "node:test";
import assert from "node:assert/strict";
import { calcDriverPay, normalizeDriver, getRateSheet } from "../src/utils/driverPay.js";
import { parseRateRows } from "../src/utils/rateImport.js";

const general = { id: 1, name: "General", clientId: null, rates: [
  { province: "Dajabón", municipality: "Dajabón", priceT1: 2000, dietaT1: 500, helperT1: 1000, priceT2: 2500, dietaT2: 600, helperT2: 1200 },
  { province: "Independencia", municipality: "Jimaní", priceT1: 0, dietaT1: 0, helperT1: 0, priceT2: 4000, dietaT2: 1000, helperT2: 1500 },
]};
const bocel = { id: 2, name: "Bocel", clientId: 1, rates: [
  { province: "Dajabón", municipality: "Dajabón", priceT1: 1800, dietaT1: 400, helperT1: 900, priceT2: 2200, dietaT2: 500, helperT2: 1100 },
]};
const driver = { id: 1, name: "Rober", payType: "perTrip", rateSheets: [general, bocel] };
const t1 = { id: 1, size: "T1" }, t2 = { id: 2, size: "T2" };

test("T1: chofer + dieta + 1 ayudante por defecto", () => {
  const c = calcDriverPay({ driver, trip: { province: "Dajabón", municipality: "Dajabón", clientId: 9 }, truck: t1 });
  assert.equal(c.base, 2000); assert.equal(c.dieta, 500);
  assert.equal(c.numHelpers, 1); assert.equal(c.helperEach, 1000);
  assert.equal(c.driverNet, 2500); assert.equal(c.total, 3500);
  assert.equal(c.sheetName, "General");
});

test("T2: 2 ayudantes por defecto; el viaje puede quitarlos o cambiar el pago", () => {
  const base = calcDriverPay({ driver, trip: { province: "Dajabón", municipality: "Dajabón" }, truck: t2 });
  assert.equal(base.numHelpers, 2); assert.equal(base.helpersTotal, 2400); assert.equal(base.total, 3100 + 2400);
  const none = calcDriverPay({ driver, trip: { province: "Dajabón", municipality: "Dajabón", numHelpers: 0 }, truck: t2 });
  assert.equal(none.helpersTotal, 0); assert.equal(none.total, 3100);
  const custom = calcDriverPay({ driver, trip: { province: "Dajabón", municipality: "Dajabón", numHelpers: 1, helperPayEach: 1500 }, truck: t2 });
  assert.equal(custom.helpersTotal, 1500);
});

test("el tarifario del cliente del viaje gana sobre el general", () => {
  const c = calcDriverPay({ driver, trip: { province: "Dajabón", municipality: "Dajabón", clientId: 1 }, truck: t1 });
  assert.equal(c.base, 1800); assert.equal(c.sheetName, "Bocel");
  assert.equal(getRateSheet(driver, 1).name, "Bocel");
  assert.equal(getRateSheet(driver, 77).name, "General");
});

test("override de tamaño en el viaje, descuentos, y ruta solo-T2 con camión T1", () => {
  const ov = calcDriverPay({ driver, trip: { province: "Dajabón", municipality: "Dajabón", tarifaOverride: "T2" }, truck: t1 });
  assert.equal(ov.size, "T2"); assert.equal(ov.base, 2500);
  const disc = calcDriverPay({ driver, trip: { province: "Dajabón", municipality: "Dajabón", discounts: [{ amount: 300 }] }, truck: t1 });
  assert.equal(disc.driverNet, 2200); assert.equal(disc.total, 3200);
  const jim = calcDriverPay({ driver, trip: { province: "Independencia", municipality: "Jimaní" }, truck: t1 });
  assert.equal(jim.base, 4000, "cae al precio T2 cuando T1 está en 0");
});

test("sin tarifa para el destino → rateFound false y pago 0", () => {
  const c = calcDriverPay({ driver, trip: { province: "Santiago", municipality: "Moca" }, truck: t1 });
  assert.equal(c.rateFound, false); assert.equal(c.base, 0);
});

test("porcentaje y fijo", () => {
  const pct = calcDriverPay({ driver: { payType: "percentage", percentageAmount: 20 }, trip: { revenue: 10000, numHelpers: 0 }, truck: t1 });
  assert.equal(pct.base, 2000); assert.equal(pct.total, 2000);
  const fx = calcDriverPay({ driver: { payType: "fixed", fixedAmount: 25000 }, trip: { revenue: 10000, numHelpers: 0 }, truck: t1 });
  assert.equal(fx.total, 0);
});

test("normalizeDriver migra rates viejos a un tarifario General y salaryType porcentaje", () => {
  const d = normalizeDriver({ id: 3, salaryType: "porcentaje", percentageAmount: 20, rates: general.rates });
  assert.equal(d.payType, "percentage");
  assert.equal(d.rateSheets.length, 1); assert.equal(d.rateSheets[0].name, "General");
  assert.equal(normalizeDriver({ salaryType: "perTrip", rates: [] }).rateSheets.length, 0);
});

test("importación de tarifario de chofer con dieta y ayudante", () => {
  const rows = [
    ["Provincia", "Municipio", "Chofer T1", "Dieta T1", "Ayudante T1", "Chofer T2", "Dieta T2", "Ayudante T2"],
    ["Dajabón", "Dajabón", "2,000", 500, 1000, 2500, 600, 1200],
    ["Independencia", "Jimaní", "", "", "", 4000, 1000, 1500],
  ];
  const { rates, errors } = parseRateRows(rows, "driver");
  assert.equal(errors.length, 0);
  assert.deepEqual(rates[0], { province: "Dajabón", municipality: "Dajabón", priceT1: 2000, priceT2: 2500, dietaT1: 500, helperT1: 1000, dietaT2: 600, helperT2: 1200 });
  assert.equal(rates[1].priceT2, 4000); assert.equal(rates[1].helperT1, 0);
});

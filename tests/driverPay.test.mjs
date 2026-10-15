import { test } from "node:test";
import assert from "node:assert/strict";
import { calcDriverPay, normalizeDriver, getRateSheet, tripCrew } from "../src/utils/driverPay.js";
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

test("T1: chofer + dieta repartida + 1 ayudante por defecto", () => {
  const c = calcDriverPay({ driver, trip: { province: "Dajabón", municipality: "Dajabón", clientId: 9 }, truck: t1 });
  // dieta total 500 repartida entre chofer y 1 ayudante: 250 cada uno
  assert.equal(c.base, 2000); assert.equal(c.dietaTotal, 500); assert.equal(c.dieta, 250); assert.equal(c.dietaEach, 250);
  assert.equal(c.numHelpers, 1); assert.equal(c.helperBase, 1000); assert.equal(c.helperEach, 1250);
  assert.equal(c.driverNet, 2250); assert.equal(c.total, 3500);
  // sin ayudantes: toda la dieta al chofer
  const solo = calcDriverPay({ driver, trip: { province: "Dajabón", municipality: "Dajabón", numHelpers: 0 }, truck: t1 });
  assert.equal(solo.dieta, 500); assert.equal(solo.helperEach, 1000); assert.equal(solo.total, 2500);
  assert.equal(c.sheetName, "General");
});

test("T2: 2 ayudantes por defecto; el viaje puede quitarlos o cambiar el pago", () => {
  // dieta T2 600 entre 3 = 200 cada uno: chofer 2500+200, ayudantes 2 × (1200+200); total igual que antes (3100 + 2400)
  const base = calcDriverPay({ driver, trip: { province: "Dajabón", municipality: "Dajabón" }, truck: t2 });
  assert.equal(base.numHelpers, 2); assert.equal(base.dieta, 200); assert.equal(base.helperEach, 1400); assert.equal(base.helpersTotal, 2800); assert.equal(base.total, 3100 + 2400);
  const none = calcDriverPay({ driver, trip: { province: "Dajabón", municipality: "Dajabón", numHelpers: 0 }, truck: t2 });
  assert.equal(none.helpersTotal, 0); assert.equal(none.dieta, 600); assert.equal(none.total, 3100);
  // residuo de la división al chofer: 1 ayudante con dieta 601 → ayudante 300, chofer 301
  const odd = calcDriverPay({ driver: { ...driver, rateSheets: [{ id: 1, name: "G", clientId: null, rates: [{ province: "Dajabón", municipality: "Dajabón", priceT2: 2500, dietaT2: 601, helperT2: 1200 }] }] }, trip: { province: "Dajabón", municipality: "Dajabón", numHelpers: 1 }, truck: t2 });
  assert.equal(odd.dietaEach, 300); assert.equal(odd.dieta, 301);
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
  assert.equal(disc.driverNet, 2250 - 300); assert.equal(disc.total, 3500 - 300);
  const jim = calcDriverPay({ driver, trip: { province: "Independencia", municipality: "Jimaní" }, truck: t1 });
  // Jimaní solo tiene T2: con camión T1 se usa la tarifa T2 completa (precio, dieta y ayudante) y se avisa
  assert.equal(jim.base, 4000, "cae a la tarifa T2 cuando T1 está en 0"); assert.equal(jim.sizeFallback, true);
  assert.equal(jim.dietaTotal, 1000); assert.equal(jim.helperBase, 1500); assert.equal(jim.numHelpers, 1, "los ayudantes siguen siendo los del tamaño real");
  assert.equal(jim.helperEach, 1500 + 500); assert.equal(jim.dieta, 500);
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

test("tripCrew: una línea por persona, dieta repartida; chofer / ayudante 1 / ayudante 2", async () => {
  const { tripCrew } = await import("../src/utils/driverPay.js");
  const trip = { province: "Dajabón", municipality: "Dajabón", helpers: [{ name: "Jeffrey", direct: true, ayudanteId: 1 }, { name: "Ayudante 2" }] };
  const calc = calcDriverPay({ driver, trip, truck: t2 });
  const crew = tripCrew(trip, calc, driver);
  assert.deepEqual(crew.map(c => [c.role, c.name, c.base, c.dieta, c.total, c.direct]), [
    ["chofer", "Rober", 2500, 200, 2700, false],
    ["ayudante", "Jeffrey", 1200, 200, 1400, true],
    ["ayudante", "Ayudante 2", 1200, 200, 1400, false],
  ]);
  assert.equal(crew.reduce((s, c) => s + c.total, 0), calc.total, "la suma de la tripulación es la nómina del viaje");
  // sin ayudantes: solo el chofer, con toda la dieta
  const solo = tripCrew({ ...trip, numHelpers: 0, helpers: [] }, calcDriverPay({ driver, trip: { ...trip, numHelpers: 0 }, truck: t2 }), driver);
  assert.equal(solo.length, 1); assert.equal(solo[0].dieta, 600);
});

test("helperPayEach: null/'' = por tarifario; 0 explícito = ayudantes sin pago (por eso el formulario ya no congela el 0)", () => {
  const base = { province: "Dajabón", municipality: "Dajabón", clientId: 9, numHelpers: 2 };
  for (const v of [null, undefined, ""]) {
    const c = calcDriverPay({ driver, trip: { ...base, helperPayEach: v }, truck: t2 });
    assert.equal(c.helperEach, 1200 + 200, `helperPayEach=${JSON.stringify(v)} → tarifario`); assert.equal(c.helpersTotal, 2800);
  }
  const z = calcDriverPay({ driver, trip: { ...base, helperPayEach: 0 }, truck: t2 });
  assert.equal(z.helperEach, 0); assert.equal(z.helpersTotal, 0, "un 0 guardado como override deja a los ayudantes sin cobrar");
});

test("override del chofer, override por ayudante y descuentos dirigidos (chofer / ayudante N)", () => {
  const trip = { province: "Dajabón", municipality: "Dajabón", clientId: 9, numHelpers: 2, helperNames: ["Ana", "Luis"],
    driverPayOverride: 3000, helperPayOverrides: [null, 1000],
    discounts: [{ desc: "adelanto viejo", amount: 300 }, { desc: "daño", amount: 100, who: "helper:0" }, { desc: "x", amount: 50, who: "driver" }] };
  const c = calcDriverPay({ driver, trip, truck: t2 });
  // chofer: fijado 3,000 (su dieta 200 se mantiene, base = 2,800); descuentos al chofer 300 + 50
  assert.equal(c.driverGross, 3000); assert.equal(c.base, 2800); assert.equal(c.dieta, 200); assert.equal(c.discounts, 350); assert.equal(c.driverNet, 2650); assert.equal(c.driverFixed, true);
  // ayudante 1: tarifa 1,200 + 200 = 1,400 − 100 = 1,300 ; ayudante 2: fijado 1,000
  assert.deepEqual(c.helperPays, [1300, 1000]); assert.equal(c.helpersTotal, 2300); assert.equal(c.helperDiscounts, 100);
  assert.equal(c.crew[1].discount, 100); assert.equal(c.crew[1].net, 1300); assert.equal(c.crew[2].fixed, true); assert.equal(c.crew[2].total, 1000);
  const crew = tripCrew(trip, c, driver);
  assert.deepEqual(crew.map(x => [x.name, x.total, x.discount, x.net]), [["Rober", 3000, 350, 2650], ["Ana", 1400, 100, 1300], ["Luis", 1000, 0, 1000]]);
  // sin overrides ni who: igual que siempre (descuento al chofer)
  const c0 = calcDriverPay({ driver, trip: { province: "Dajabón", municipality: "Dajabón", clientId: 9, numHelpers: 2, discounts: [{ amount: 300 }] }, truck: t2 });
  assert.equal(c0.driverNet, 2500 + 200 - 300); assert.deepEqual(c0.helperPays, [1400, 1400]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRateRows, mergeRates, parseMoney, resolveProvince, resolveMunicipality } from "../src/utils/rateImport.js";

test("parseMoney acepta formatos dominicanos", () => {
  assert.equal(parseMoney("5,500"), 5500);
  assert.equal(parseMoney("RD$ 13,400.00"), 13400);
  assert.equal(parseMoney(9000), 9000);
  assert.equal(parseMoney(""), 0);
  assert.ok(Number.isNaN(parseMoney("abc")));
});

test("provincias y municipios sin acentos, mayúsculas ni alias", () => {
  assert.equal(resolveProvince("DAJABON"), "Dajabón");
  assert.equal(resolveProvince("santo domingo"), "Santo Domingo / Distrito Nacional");
  assert.equal(resolveMunicipality("santiago", "Santiago"), "Santiago de los Caballeros");
  assert.equal(resolveMunicipality("Samana", "Samaná"), "Santa Bárbara de Samaná");
  assert.equal(resolveMunicipality("Moca", null).province, "Espaillat");
  assert.equal(resolveMunicipality("Mao", "Dajabón"), null);
});

test("parseRateRows importa filas válidas y reporta errores por fila", () => {
  const rows = [
    ["Provincia", "Municipio", "Tarifa T1", "Tarifa T2"],
    ["Santiago", "Santiago", "5,500", 9000],
    ["Dajabon", "Dajabón", 13400, ""],
    ["Valverde", "Mao", "", 13000],
    ["", "Moca", 6500, 0],
    ["Marte", "Crater", 1, 2],
    ["Santiago", "Villa Fantasma", 1, 2],
    ["Valverde", "Esperanza", "", ""],
    ["Santiago", "santiago", 1, 1],
    [],
  ];
  const { rates, errors } = parseRateRows(rows);
  assert.deepEqual(rates, [
    { province: "Santiago", municipality: "Santiago de los Caballeros", priceT1: 5500, priceT2: 9000 },
    { province: "Dajabón", municipality: "Dajabón", priceT1: 13400, priceT2: 0 },
    { province: "Valverde", municipality: "Mao", priceT1: 0, priceT2: 13000 },
    { province: "Espaillat", municipality: "Moca", priceT1: 6500, priceT2: 0 },
    { province: "Santiago", municipality: "Villa Fantasma", priceT1: 1, priceT2: 2, custom: true }, // destino libre del cliente
  ]);
  assert.deepEqual(errors.map(e => e.row), [6, 8, 9]);
});

test("parseRateRows acepta encabezados en otro orden y otros nombres", () => {
  const rows = [["T2", "MUNICIPIO", "PROV.", "T1"], [9000, "La Vega", "La Vega", 8500]];
  const { rates, errors } = parseRateRows(rows);
  assert.equal(errors.length, 0);
  assert.deepEqual(rates[0], { province: "La Vega", municipality: "La Vega", priceT1: 8500, priceT2: 9000 });
});

test("mergeRates actualiza destinos existentes y agrega nuevos sin duplicar", () => {
  const existing = [
    { id: 1, province: "Santiago", municipality: "Santiago de los Caballeros", priceT1: 5000, priceT2: 9000 },
    { id: 2, province: "Dajabón", municipality: "Dajabón", priceT1: 13400, priceT2: 20000 },
  ];
  const incoming = [
    { province: "Santiago", municipality: "Santiago de los Caballeros", priceT1: 5500, priceT2: 9000 },
    { province: "Dajabón", municipality: "Dajabón", priceT1: 13400, priceT2: 20000 },
    { province: "Valverde", municipality: "Mao", priceT1: 9240, priceT2: 13000 },
  ];
  const { rates, updated, added } = mergeRates(existing, incoming);
  assert.equal(updated, 1);
  assert.equal(added, 1);
  assert.equal(rates.length, 3);
  assert.equal(rates[0].id, 1);
  assert.equal(rates[0].priceT1, 5500);
  assert.equal(rates[2].id, 3);
  assert.equal(existing[0].priceT1, 5000, "no muta el original");
});

import { parseRateRows as _prr } from "../src/utils/rateImport.js";
test("tarifario: alias de provincias/municipios y destinos libres del cliente", () => {
  const rows = [["Provincia", "Municipio", "Tarifa T1", "Tarifa T2"],
    ["Santo Domingo / Distrito Nacional", "Distrito Nacional", 10000, 0],
    ["Elías Piña", "Elías Piña", 0, 38000],
    ["Monte Cristi", "Montecristi", 9000, 0],
    ["Monte Cristi", "Castañuelas", 9500, 0],
    ["San Cristóbal", "Haina", 8000, 0],
    ["La Altagracia", "Bávaro", 15000, 0],
    ["Puerto Plata", "Playa Dorada Hotel Zone", 11000, 0]];
  const { rates, errors } = _prr(rows);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const m = Object.fromEntries(rates.map(r => [r.province, r.municipality]));
  assert.equal(m["Santo Domingo / Distrito Nacional"], "Santo Domingo de Guzmán");
  assert.equal(m["Elías Piña"], "Comendador");
  assert.equal(m["San Cristóbal"], "Bajos de Haina");
  assert.equal(m["La Altagracia"], "Bávaro");
  assert.deepEqual(rates.filter(r => r.province === "Monte Cristi").map(r => r.municipality).sort(), ["Castañuelas", "Monte Cristi"]);
  const custom = rates.find(r => r.province === "Puerto Plata");
  assert.equal(custom.municipality, "Playa Dorada Hotel Zone"); assert.equal(custom.custom, true);
});

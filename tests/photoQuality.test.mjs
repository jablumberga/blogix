/**
 * B-Logix – Calidad de la foto del recibo (nitidez, luz, contraste, tamaño, huella)
 * Run with: node --test tests/photoQuality.test.mjs
 * Las imágenes se generan aquí (rayas tipo texto); los umbrales se calibraron con recibos simulados en Chromium.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePixels, photoProblems, dHash, PHOTO_RULES } from "../src/utils/photoQuality.js";

/** Imagen RGBA: papel claro con «renglones de texto» (barras finas) sobre fondo de mesa. */
function receiptImage({ w = 600, h = 800, blur = 0, light = 1, noise = 0, paper = 240, ink = 30, table = 100, seed = 7 }) {
  const g = new Float32Array(w * h);
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inPaper = x > w * 0.2 && x < w * 0.8 && y > h * 0.05 && y < h * 0.95;
    let v = inPaper ? paper : table;
    if (inPaper && (y % 24) < 8 && (x % 7) < 4 && x > w * 0.25 && x < w * 0.75) v = ink; // letras
    g[y * w + x] = v;
  }
  let img = g;
  for (let pass = 0; pass < blur; pass++) { // desenfoque de caja 3×3 repetido
    const o = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let t = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) t += img[(y + dy) * w + x + dx];
      o[y * w + x] = t / 9;
    }
    img = o;
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = img[i] * light + (noise ? (rnd() * 2 - 1) * noise : 0); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  return { data, width: w, height: h };
}

test("foto nítida pasa; muy desenfocada se rechaza como borrosa", () => {
  const sharp = analyzePixels(receiptImage({}));
  assert.ok(sharp.sharpness > PHOTO_RULES.warnSharpness, `nítida ${sharp.sharpness}`);
  assert.equal(photoProblems(sharp, { width: 1200, height: 1600 }).ok, true);
  const blurry = analyzePixels(receiptImage({ blur: 15 }));
  assert.ok(blurry.sharpness < PHOTO_RULES.minSharpness, `borrosa ${blurry.sharpness}`);
  assert.match(photoProblems(blurry, { width: 1200, height: 1600 }).problems[0], /borrosa/);
});

test("la nitidez baja de forma continua al desenfocar (más blur → menos nitidez)", () => {
  const vals = [0, 1, 3, 8, 15].map(b => analyzePixels(receiptImage({ blur: b })).sharpness);
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] < vals[i - 1], vals.join(" > "));
});

test("el ruido del sensor no hace pasar una foto borrosa", () => {
  // ruido ±8 al tamaño de análisis ≈ ±24 en la foto original (foto de noche); la IA igual confirma después
  const m = analyzePixels(receiptImage({ blur: 15, noise: 8 }));
  assert.ok(m.noise > 0, "mide el ruido en las zonas lisas");
  assert.equal(photoProblems(m, { width: 1200, height: 1600 }).ok, false, `nitidez ${m.sharpness}, ruido ${m.noise}`);
});

test("muy oscura / quemada / sin contraste: una sola causa clara", () => {
  const dark = photoProblems(analyzePixels(receiptImage({ light: 0.2 })), { width: 1200, height: 1600 });
  assert.deepEqual(dark.problems.length, 1); assert.match(dark.problems[0], /oscura/);
  const washed = photoProblems(analyzePixels(receiptImage({ paper: 255, ink: 238, table: 250 })), { width: 1200, height: 1600 });
  assert.equal(washed.ok, false);
  assert.match(washed.problems[0], /clara|contraste/);
});

test("foto muy pequeña se rechaza", () => {
  const v = photoProblems(analyzePixels(receiptImage({})), { width: 400, height: 500 });
  assert.match(v.problems[0], /muy pequeña/);
});

test("imagen lisa (sin letras) no pasa", () => {
  const w = 300, h = 400, data = new Uint8ClampedArray(w * h * 4).fill(200);
  const m = analyzePixels({ data, width: w, height: h });
  assert.equal(m.blocks, 0);
  assert.equal(photoProblems(m, { width: 1200, height: 1600 }).ok, false);
});

test("dHash: 16 hex; misma imagen = misma huella; imagen distinta = huella distinta", () => {
  const mk = (f) => { const data = new Uint8ClampedArray(9 * 8 * 4); for (let i = 0; i < 72; i++) { const v = f(i % 9, Math.floor(i / 9)); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; } return { data, width: 9, height: 8 }; };
  const a = dHash(mk((x, y) => (x * 29 + y * 7) % 256)), b = dHash(mk((x, y) => (x * 29 + y * 7) % 256)), c = dHash(mk((x, y) => 255 - x * 25));
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.throws(() => dHash({ data: new Uint8ClampedArray(16), width: 2, height: 2 }));
});

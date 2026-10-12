/**
 * Calidad de la foto de un recibo, revisada en el teléfono ANTES de subirla.
 *
 * Reglas claras (PHOTO_RULES):
 *   - tamaño: el lado corto de la foto original debe tener al menos 600 px
 *   - nitidez: la zona más nítida de la foto (donde está el recibo) debe pasar un mínimo; si no, está borrosa
 *   - luz: ni muy oscura ni quemada, y con contraste suficiente para que se lean las letras
 * Si no pasa, se pide otra foto. Si pasa, igual la IA confirma después que se leen los datos.
 *
 * analyzePixels / photoProblems / dHash son puros (se prueban en Node); preparePhoto usa el canvas del navegador.
 */

export const PHOTO_RULES = {
  minShortSide: 600,      // px de la foto original
  minSharpness: 40,       // varianza del laplaciano en la zona nítida, sin el ruido (por debajo: borrosa, los números se confunden)
  warnSharpness: 90,      // entre minSharpness y esto: «un poco borrosa» (la IA decide si se lee)
  minBrightness: 55,      // 0–255
  maxBrightness: 235,
  minContrast: 28,        // desviación de gris
  workLongEdge: 1024,     // tamaño al que se analiza
  uploadLongEdge: 1568,   // tamaño al que se sube (lo que la IA lee completo)
  uploadQuality: 0.82,
};

/** RGBA → gris (0–255). */
export function toGray(data, width, height) {
  const g = new Float32Array(width * height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  return g;
}

/**
 * Métricas de una imagen (ya reducida a ~1024 px): brillo, contraste y nitidez.
 * Nitidez = percentil 90 de la varianza del laplaciano por bloques con algo de contraste
 * (así un fondo desenfocado no hunde una foto donde el recibo sí se ve nítido).
 */
export function analyzePixels({ data, width, height }) {
  const g = toGray(data, width, height);
  let sum = 0;
  for (let i = 0; i < g.length; i++) sum += g[i];
  const brightness = sum / g.length;
  let sq = 0;
  for (let i = 0; i < g.length; i++) sq += (g[i] - brightness) ** 2;
  const contrast = Math.sqrt(sq / g.length);

  const T = 64; // bloque
  const scores = [], flat = [];
  for (let by = 1; by + T < height - 1; by += T) {
    for (let bx = 1; bx + T < width - 1; bx += T) {
      let s = 0, s2 = 0, gs = 0, gs2 = 0, n = 0;
      for (let y = by; y < by + T; y++) {
        const row = y * width;
        for (let x = bx; x < bx + T; x++) {
          const i = row + x;
          const v = g[i];
          const lap = g[i - 1] + g[i + 1] + g[i - width] + g[i + width] - 4 * v;
          s += lap; s2 += lap * lap; gs += v; gs2 += v * v; n++;
        }
      }
      const blockStd = Math.sqrt(Math.max(0, gs2 / n - (gs / n) ** 2));
      const lapVar = s2 / n - (s / n) ** 2;
      if (blockStd < 12) { flat.push(lapVar); continue; } // bloque liso (mesa, papel sin letras): solo sirve para medir el ruido
      scores.push(lapVar);
    }
  }
  scores.sort((a, b) => a - b);
  flat.sort((a, b) => a - b);
  // El ruido del sensor (fotos oscuras) también sube el laplaciano: se resta el que tienen las zonas lisas
  const noise = flat.length >= 3 ? flat[Math.min(flat.length - 1, Math.floor(flat.length * 0.9))] : 0; // mismo percentil que la nitidez
  const top = scores.length ? scores[Math.min(scores.length - 1, Math.floor(scores.length * 0.9))] : 0;
  const sharpness = Math.max(0, top - noise);
  return { brightness: Math.round(brightness), contrast: Math.round(contrast), sharpness: Math.round(sharpness), noise: Math.round(noise), blocks: scores.length };
}

/** Problemas (no se acepta) y avisos (se acepta, la IA confirma). */
export function photoProblems(metrics, { width, height } = {}, rules = PHOTO_RULES) {
  const problems = [], warnings = [];
  if (width && height && Math.min(width, height) < rules.minShortSide) problems.push(`La foto es muy pequeña (${Math.min(width, height)} px). Usa la cámara normal, no una captura reducida.`);
  // Se dice UNA causa de luz (si está oscura, lo demás es consecuencia): primero luz, luego contraste, luego nitidez
  if (metrics.brightness < rules.minBrightness) problems.push("La foto está muy oscura. Busca más luz o usa el flash.");
  else if (metrics.brightness > rules.maxBrightness) problems.push("La foto está muy clara o con reflejo. Evita la luz directa sobre el papel.");
  else if (metrics.contrast < rules.minContrast) problems.push("No se distinguen las letras (poco contraste). Pon el recibo sobre un fondo oscuro y con buena luz.");
  else if (metrics.blocks === 0 || metrics.sharpness < rules.minSharpness) problems.push("La foto está borrosa. Sostén el teléfono firme, acércate y toca la pantalla para enfocar.");
  else if (metrics.sharpness < rules.warnSharpness) warnings.push("La foto está un poco borrosa; si no se lee, se te pedirá otra.");
  return { problems, warnings, ok: problems.length === 0 };
}

/** Huella de la foto (dHash 64 bits en hex) a partir de una imagen de 9×8: fotos iguales dan huellas casi iguales. */
export function dHash({ data, width, height }) {
  if (width !== 9 || height !== 8) throw new Error("dHash espera 9×8");
  const g = toGray(data, 9, 8);
  let hex = "";
  for (let y = 0; y < 8; y++) {
    let nib = 0;
    for (let x = 0; x < 8; x++) {
      nib = (nib << 1) | (g[y * 9 + x] > g[y * 9 + x + 1] ? 1 : 0);
      if (x === 3 || x === 7) { hex += nib.toString(16); nib = 0; }
    }
  }
  return hex;
}

// ── Navegador ────────────────────────────────────────────────────────────────
async function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* sigue con <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("No se pudo abrir la foto")); i.src = url; });
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
function drawScaled(src, w0, h0, longEdge) {
  const k = Math.min(1, longEdge / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return { c, ctx, w, h };
}

/**
 * Prepara la foto elegida: revisa calidad, la reduce para subirla y saca su huella.
 * → { ok, problems, warnings, metrics, width, height, base64, previewUrl, hash }
 */
export async function preparePhoto(file, rules = PHOTO_RULES) {
  if (!file || !/^image\//.test(file.type || "image/")) return { ok: false, problems: ["Ese archivo no es una foto."], warnings: [] };
  let src;
  try { src = await loadBitmap(file); } catch { return { ok: false, problems: ["No se pudo abrir la foto. Tómala de nuevo con la cámara."], warnings: [] }; }
  const width = src.width, height = src.height;
  const work = drawScaled(src, width, height, rules.workLongEdge);
  const metrics = analyzePixels(work.ctx.getImageData(0, 0, work.w, work.h));
  const verdict = photoProblems(metrics, { width, height }, rules);
  const hc = document.createElement("canvas"); hc.width = 9; hc.height = 8;
  const hctx = hc.getContext("2d", { willReadFrequently: true }); hctx.drawImage(work.c, 0, 0, 9, 8);
  const hash = dHash(hctx.getImageData(0, 0, 9, 8));
  if (!verdict.ok) { src.close?.(); return { ...verdict, metrics, width, height, hash }; }
  const up = drawScaled(src, width, height, rules.uploadLongEdge);
  src.close?.();
  const dataUrl = up.c.toDataURL("image/jpeg", rules.uploadQuality);
  return { ...verdict, metrics, width, height, hash, base64: dataUrl.split(",")[1], previewUrl: dataUrl };
}

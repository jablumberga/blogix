/**
 * Combustible: precio por galón de referencia con historial (Costo por km → «Precio por galón»).
 * El precio cambia cada semana, así que se guarda como lista { from: "AAAA-MM-DD", price } y cada
 * gasto de combustible usa el precio vigente EN SU FECHA. Con él, un gasto sin galones los calcula
 * solo (monto ÷ precio) y entra al km/gal. Los galones se guardan en el gasto: un cambio de precio
 * posterior no mueve lo ya registrado.
 */
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Lista limpia y ordenada por fecha (una entrada por fecha; la última escrita gana). */
export function fuelPriceList(settings) {
  const raw = Array.isArray(settings?.fuelPrices) ? settings.fuelPrices : [];
  const byDate = new Map();
  for (const p of raw) if (p && isDate(p.from) && num(p.price) > 0) byDate.set(p.from, { from: p.from, price: r2(num(p.price)) });
  return [...byDate.values()].sort((a, b) => a.from.localeCompare(b.from));
}

/** Precio vigente en una fecha: la última entrada con from ≤ fecha (0 si no hay ninguna antes). */
export function fuelPriceAt(settings, date) {
  const list = fuelPriceList(settings);
  if (!list.length) return 0;
  const d = isDate(date) ? date : "9999-12-31";
  let price = 0;
  for (const p of list) { if (p.from <= d) price = p.price; else break; }
  return price;
}

/** Precio de hoy (la entrada más reciente que ya aplica). */
export const fuelPriceNow = (settings, today) => fuelPriceAt(settings, today);

/** Agrega o reemplaza el precio desde una fecha. Devuelve la lista nueva. */
export function setFuelPrice(settings, { from, price }) {
  if (!isDate(from) || !(num(price) > 0)) return fuelPriceList(settings);
  return fuelPriceList({ fuelPrices: [...fuelPriceList(settings).filter(p => p.from !== from), { from, price: num(price) }] });
}

/** Quita el precio de una fecha. */
export const removeFuelPrice = (settings, from) => fuelPriceList(settings).filter(p => p.from !== from);

/**
 * Galones de un gasto de combustible: los que escribieron, o monto ÷ precio si hay precio.
 * Devuelve { gallons, computed } (gallons null si no se puede saber).
 */
export function fuelGallons({ amount, gallons, pricePerGallon }) {
  const g = num(gallons);
  if (g > 0) return { gallons: r2(g), computed: false };
  const a = num(amount), p = num(pricePerGallon);
  if (a > 0 && p > 0) return { gallons: r2(a / p), computed: true };
  return { gallons: null, computed: false };
}

/** Texto corto para el formulario: «≈ 13.8 gal a RD$345/gal (precio del 10/10)». */
export function fuelHint({ amount, pricePerGallon }) {
  const { gallons, computed } = fuelGallons({ amount, gallons: null, pricePerGallon });
  if (!computed) return "";
  return `≈ ${gallons.toLocaleString("en-US", { maximumFractionDigits: 2 })} gal a RD$${num(pricePerGallon).toLocaleString("en-US")}/gal`;
}

/** Etiqueta del campo Galones en los formularios: avisa si se calculan solos y a qué precio. */
export function fuelLabel({ amount, gallons, date, settings }) {
  const price = fuelPriceAt(settings, date);
  if (num(gallons) > 0 || !price) return price ? "Galones (para km/gal)" : "Galones (para km/gal) · sin precio por galón configurado";
  const hint = fuelHint({ amount, pricePerGallon: price });
  return hint ? `Galones · ${hint}` : `Galones · se calculan a RD$${price.toLocaleString("en-US")}/gal`;
}

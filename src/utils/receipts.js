import { fuelPriceAt } from "./fuel.js";
/**
 * Recibos por foto (gastos del camino que sube el chofer).
 *
 * Flujo: el chofer toma la foto → se revisa la calidad en el teléfono (photoQuality.js) → el servidor la guarda y
 * la IA la lee → el chofer revisa lo leído y la envía → queda «por revisar» → la oficina la aprueba (se crea el
 * gasto, con la foto enlazada por receiptId) o la rechaza con un motivo.
 * Mientras está por revisar NO es un gasto: ningún cálculo (nómina, costo por km, liquidaciones…) la ve.
 *
 * Archivo puro: lo usan las pantallas y el servidor.
 */

export const RECEIPT_CATEGORIES = ["fuel", "toll", "tire", "repair", "maintenance", "other"];

/** Datos que la foto TIENE que mostrar para aceptarse. */
export const REQUIRED_READ = {
  all: ["amount", "date", "vendor"],
  fuel: ["gallons"],
};
const FIELD_LABEL = { amount: "el monto total", date: "la fecha", vendor: "el nombre del negocio", gallons: "los galones" };

export const RECEIPT_LIMITS = { maxAmount: 1_000_000, maxPastDays: 60, maxFutureDays: 1, maxGallons: 400 };

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const str = (v, max = 120) => {
  const s = v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};
const isoDate = (v) => {
  const s = str(v, 20);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return validDate(s) ? s : null;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // DD/MM/AAAA (como se escribe en RD)
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; const d = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; return validDate(d) ? d : null; }
  return null;
};
function validDate(s) { const d = new Date(`${s}T12:00:00Z`); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }

export const CURRENCIES = { DOP: "RD$", USD: "US$", HTG: "gourdes", EUR: "€" };
/** Moneda del recibo: DOP por defecto; dólares, gourdes (frontera) o euros si así dice. */
export function currencyOf(v) {
  const s = String(v ?? "").toUpperCase().replace(/\s/g, "");
  if (!s || s === "DOP" || s === "RD$" || s === "RD" || s === "PESOS") return "DOP";
  if (s === "USD" || s === "US$" || s === "U$S" || s === "DOLARES" || s === "DÓLARES") return "USD";
  if (s === "HTG" || s === "GOURDES" || s === "GDES") return "HTG";
  if (s === "EUR" || s === "€") return "EUR";
  return /^[A-Z]{3}$/.test(s) ? s : "DOP";
}

/** Lo que devuelve la IA (o null) → lectura limpia con nombres de la app. Nunca inventa: lo dudoso queda en null. */
export function normalizeRead(raw) {
  const r = raw || {};
  const category = RECEIPT_CATEGORIES.includes(r.categoria ?? r.category) ? (r.categoria ?? r.category) : "other";
  const amount = num(r.monto_total ?? r.amount);
  let gallons = num(r.galones ?? r.gallons);
  const pricePerGallon = num(r.precio_galon ?? r.pricePerGallon);
  let gallonsComputed = false;
  if (category === "fuel" && !(gallons > 0) && amount > 0 && pricePerGallon > 0) { gallons = Math.round((amount / pricePerGallon) * 100) / 100; gallonsComputed = true; }
  const quality = ["buena", "regular", "mala"].includes(r.calidad ?? r.quality) ? (r.calidad ?? r.quality) : null;
  return {
    isReceipt: (r.es_recibo ?? r.isReceipt) !== false,
    legible: (r.legible ?? r.readable) !== false,
    quality,
    issues: (Array.isArray(r.problemas ?? r.issues) ? (r.problemas ?? r.issues) : []).map(x => str(x, 140)).filter(Boolean).slice(0, 5),
    category,
    amount: amount > 0 ? Math.round(amount * 100) / 100 : null,
    currency: currencyOf(r.moneda ?? r.currency),
    date: isoDate(r.fecha ?? r.date),
    vendor: str(r.negocio ?? r.vendor, 80),
    rnc: str(r.rnc, 20),
    ncf: (str(r.ncf, 20) || "").toUpperCase().replace(/\s/g, "") || null,
    itbis: num(r.itbis) > 0 ? Math.round(num(r.itbis) * 100) / 100 : null,
    gallons: gallons > 0 ? Math.round(gallons * 100) / 100 : null,
    gallonsComputed,
    pricePerGallon: pricePerGallon > 0 ? pricePerGallon : null,
    fuelType: str(r.combustible ?? r.fuelType, 40),
    description: str(r.descripcion ?? r.description, 140),
  };
}

/**
 * ¿La foto sirve? Lista de problemas (vacía = sirve). Con problemas la foto se rechaza y hay que tomar otra:
 * tiene que ser un recibo, leerse bien y mostrar el monto, la fecha y el negocio (y los galones si es combustible).
 */
export function readProblems(read) {
  if (!read) return ["No se pudo leer la foto."];
  const out = [];
  if (!read.isReceipt) out.push("La foto no parece un recibo o factura.");
  if (!read.legible || read.quality === "mala") out.push("La foto no se lee bien (borrosa, cortada, con reflejo o muy lejos).");
  if (out.length) return out;
  const missing = [...REQUIRED_READ.all, ...(read.category === "fuel" ? REQUIRED_READ.fuel : [])].filter(k => read[k] === null || read[k] === undefined || read[k] === "");
  if (missing.length) out.push(`No se lee ${missing.map(k => FIELD_LABEL[k]).join(", ").replace(/, ([^,]*)$/, " ni $1")}.`);
  return out;
}

const daysBetween = (a, b) => Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86400000);

/**
 * Lo que el chofer envía (después de revisar lo leído). Devuelve { fields, errors }.
 * trucks: camiones activos (un chofer a veces maneja otro camión, también de socio); trips: los viajes de ese chofer.
 * today: "AAAA-MM-DD".
 */
export function validateSubmit(input, { trucks = [], trips = [], today, fuelSettings = null }) {
  const f = input || {};
  const errors = [];
  const category = RECEIPT_CATEGORIES.includes(f.category) ? f.category : null;
  if (!category) errors.push("Elige el tipo de gasto.");
  const amount = num(f.amount);
  if (!(amount > 0)) errors.push("El monto debe ser mayor que 0.");
  else if (amount > RECEIPT_LIMITS.maxAmount) errors.push("El monto es demasiado alto; revísalo.");
  const date = isoDate(f.date);
  if (!date) errors.push("La fecha no es válida.");
  else if (today) {
    const diff = daysBetween(date, today);
    if (diff > RECEIPT_LIMITS.maxFutureDays) errors.push("La fecha está en el futuro.");
    else if (-diff > RECEIPT_LIMITS.maxPastDays) errors.push(`El recibo tiene más de ${RECEIPT_LIMITS.maxPastDays} días; entrégalo en la oficina.`);
  }
  const vendor = str(f.vendor, 80);
  if (!vendor) errors.push("Falta el nombre del negocio.");
  const truckId = f.truckId ? Number(f.truckId) : null;
  if (truckId && !trucks.some(t => t.id === truckId)) errors.push("Ese camión no está disponible.");
  if (category === "fuel" && !truckId) errors.push("Elige el camión del combustible.");
  const tripId = f.tripId ? Number(f.tripId) : null;
  if (tripId && !trips.some(t => t.id === tripId)) errors.push("Ese viaje no es tuyo.");
  let gallons = num(f.gallons);
  if (category === "fuel") {
    // Sin galones: se calculan con el precio por galón vigente en la fecha del recibo (Costo por km), si hay
    const price = fuelPriceAt(fuelSettings, date);
    if (!(gallons > 0) && amount > 0 && price > 0) gallons = amount / price;
    if (!(gallons > 0)) errors.push("Faltan los galones.");
    else if (gallons > RECEIPT_LIMITS.maxGallons) errors.push("Los galones son demasiados; revísalos.");
  } else gallons = null;
  const fields = {
    category, amount: amount > 0 ? Math.round(amount * 100) / 100 : null, date, vendor, truckId, tripId,
    gallons: gallons > 0 ? Math.round(gallons * 100) / 100 : null,
    ncf: (str(f.ncf, 20) || "").toUpperCase().replace(/\s/g, "") || null,
    rnc: str(f.rnc, 20), itbis: num(f.itbis) > 0 ? Math.round(num(f.itbis) * 100) / 100 : null,
    note: str(f.note, 200),
    currency: currencyOf(f.currency),
  };
  return { fields, errors };
}

/** Campos que el chofer cambió respecto a lo que leyó la IA (la oficina los ve marcados). */
export function changedFromRead(read, fields) {
  if (!read || !fields) return [];
  const out = [];
  const same = (a, b) => (a === null || a === undefined || a === "" ? null : String(a).toLowerCase()) === (b === null || b === undefined || b === "" ? null : String(b).toLowerCase());
  for (const k of ["category", "amount", "currency", "date", "vendor", "gallons", "ncf"]) {
    if (k === "gallons" && fields.category !== "fuel") continue;
    if (read[k] === null || read[k] === undefined) continue; // la IA no lo leyó: no es un cambio
    if (!same(read[k], fields[k])) out.push({ field: k, read: read[k], sent: fields[k] ?? null });
  }
  return out;
}

/** Estado de un recibo: rechazado, aprobado (ya hay un gasto con su receiptId) o por revisar. */
export function receiptStatus(r, approvedIds) {
  if (!r) return null;
  if (approvedIds?.has?.(r.id)) return "approved";
  if (r.status === "rejected") return "rejected";
  if (r.status === "draft") return "draft";
  return "pending";
}

const hamming = (a, b) => {
  if (!a || !b || a.length !== b.length) return 99;
  let d = 0;
  for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
};
export const SAME_PHOTO_MAX_DISTANCE = 6;

/**
 * Posibles duplicados de un recibo: mismo NCF (y RNC) en otro recibo o gasto, la misma foto (huella parecida),
 * o mismo monto + fecha + camión en otro recibo o gasto. Devuelve textos para la oficina.
 */
export function receiptDuplicates(r, { receipts = [], expenses = [] }) {
  const out = [];
  const f = r?.fields || {};
  const money = (n) => `RD$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const otherR = (o) => `otro recibo${o.fields?.date ? ` del ${o.fields.date}` : ""}${o.fields?.amount ? ` por ${money(o.fields.amount)}` : ""}${o.status === "approved" ? " (ya aprobado)" : ""}`;
  const otherE = (e) => `el gasto #${e.id}${e.date ? ` del ${e.date}` : ""}${e.amount ? ` por ${money(e.amount)}` : ""}`;
  const ncf = f.ncf || r?.read?.ncf;
  if (ncf) {
    const sameNcf = (x) => x && String(x.ncf || "").toUpperCase() === ncf && (!f.rnc || !x.rnc || String(x.rnc) === String(f.rnc));
    for (const o of receipts) if (o.id !== r.id && o.status !== "rejected" && o.status !== "deleted" && sameNcf(o.fields || o.read)) out.push(`Mismo NCF que ${otherR(o)}`);
    for (const e of expenses) if (e.receiptId !== r.id && sameNcf(e)) out.push(`Mismo NCF que ${otherE(e)}`);
  }
  if (r?.photoHash) for (const o of receipts) if (o.id !== r.id && o.status !== "rejected" && o.status !== "deleted" && hamming(o.photoHash, r.photoHash) <= SAME_PHOTO_MAX_DISTANCE) out.push(`La foto se parece a la de ${otherR(o)}`);
  if (f.amount && f.date) {
    const truck = f.truckId || null;
    for (const o of receipts) { const g = o.fields || {}; if (o.id !== r.id && o.status !== "rejected" && o.status !== "deleted" && g.amount === f.amount && g.date === f.date && (g.truckId || null) === truck) out.push(`Mismo monto, fecha y camión que ${otherR(o)}`); }
    for (const e of expenses) if (e.receiptId !== r.id && e.category !== "nominaTotalOverride" && Number(e.amount) === f.amount && e.date === f.date && truck && Number(e.truckId) === truck) out.push(`Mismo monto, fecha y camión que ${otherE(e)}`);
  }
  // Un gasto aprobado desde OTRO recibo aparece dos veces (como recibo y como gasto): basta con el aviso del recibo
  return [...new Set(out)];
}

/** Proveedor de la lista que coincide con el negocio del recibo (por nombre), o null. */
export function matchSupplier(vendor, suppliers = []) {
  const clean = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(srl|s\.r\.l\.|sa|s\.a\.|eirl|estacion|est\.|de|del|la|el)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  const v = clean(vendor);
  if (v.length < 3) return null;
  const hits = suppliers.filter(s => { const n = clean(s.name); return n.length >= 3 && (v.includes(n) || n.includes(v)); });
  return hits.length === 1 ? hits[0] : null;
}

/** Recibo → formulario de Gastos ya lleno (la oficina lo revisa y guarda; el gasto queda con receiptId). */
export function receiptToExpenseForm(r, { suppliers = [], driverName = "" } = {}) {
  const f = r.fields || {};
  const sup = matchSupplier(f.vendor, suppliers);
  const cat = f.category === "fuel" ? "Combustible" : f.category === "toll" ? "Peaje" : f.category === "tire" ? "Gomas" : f.category === "repair" ? "Reparación" : f.category === "maintenance" ? "Mantenimiento" : "Gasto";
  const foreign = f.currency && f.currency !== "DOP";
  return {
    date: f.date, category: f.category, amount: String(f.amount ?? ""), gallons: f.category === "fuel" ? (f.gallons ?? "") : null,
    paymentMethod: "cash", status: "paid", description: [cat, f.vendor, driverName ? `(foto de ${driverName})` : ""].filter(Boolean).join(" · ") + (foreign ? ` [recibo en ${f.currency} ${f.amount}]` : "") + (f.note ? ` — ${f.note}` : ""),
    receiptCurrency: foreign ? f.currency : null,
    tripId: f.tripId ? String(f.tripId) : "", truckId: f.truckId || null, supplierId: sup ? sup.id : null, driverId: null,
    receiptId: r.id, vendorName: f.vendor || null, ncf: f.ncf || null, rnc: f.rnc || null, itbis: f.itbis ?? null, receiptDriverId: r.driverId ?? null,
  };
}

/** Clave de la foto en el almacenamiento: receipts/<quién>/<año-mes>/<id>.jpg (el servidor la valida con esta forma). */
export const PHOTO_KEY_RE = /^(u-[a-z0-9-]{1,40})\/(\d{4}-\d{2})\/(\d{6,20})\.jpg$/;
export const photoOwnerPrefix = (user) => (user?.role === "driver" ? `u-d${Number(user.refId)}` : `u-admin`);

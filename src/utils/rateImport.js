/**
 * Importación de tarifarios desde Excel / CSV.
 *
 * Archivo esperado (la primera fila son los encabezados; mayúsculas, acentos y
 * orden no importan):
 *
 *   Provincia | Municipio | Tarifa T1 | Tarifa T2
 *
 * - Provincia y municipio se comparan sin acentos ni mayúsculas contra la lista
 *   oficial (destinations.js). Se aceptan nombres cortos comunes ("Santiago",
 *   "Samaná", "San Francisco", "Santo Domingo").
 * - T1 y T2 aceptan "5,500", "RD$ 5500", "5500.00" o vacío (= 0).
 * - Una fila sin T1 ni T2 se reporta como error (no se importa).
 */
import { DR_PROVINCES } from "../constants/destinations.js";

export const norm = (s) => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const PROVINCE_ALIASES = {
  "santo domingo": "Santo Domingo / Distrito Nacional",
  "distrito nacional": "Santo Domingo / Distrito Nacional",
  "dn": "Santo Domingo / Distrito Nacional",
  "sd": "Santo Domingo / Distrito Nacional",
  "montecristi": "Monte Cristi",
  "salcedo": "Hermanas Mirabal",
};
const MUNICIPALITY_ALIASES = {
  "santiago": "Santiago de los Caballeros",
  "samana": "Santa Bárbara de Samaná",
  "san francisco": "San Francisco de Macorís",
  "sfm": "San Francisco de Macorís",
  "santo domingo": "Santo Domingo de Guzmán",
  "sabaneta": "San Ignacio de Sabaneta",
  "azua": "Azua de Compostela",
  "hato mayor": "Hato Mayor del Rey",
  "higuey": "Higüey",
  "distrito nacional": "Santo Domingo de Guzmán",
  "dn": "Santo Domingo de Guzmán",
  "elias pina": "Comendador",
  "montecristi": "Monte Cristi",
  "san fernando de monte cristi": "Monte Cristi",
  "ocoa": "San José de Ocoa",
  "santiago rodriguez": "San Ignacio de Sabaneta",
  "haina": "Bajos de Haina",
  "san felipe de puerto plata": "Puerto Plata",
  "sfpp": "Puerto Plata",
  "la romana": "La Romana",
  "bani": "Baní",
  "cotui": "Cotuí",
  "jimani": "Jimaní",
  "dajabon": "Dajabón",
  "mao": "Mao",
  "bonao": "Bonao",
  "nagua": "Nagua",
  "la vega": "La Vega",
  "constanza": "Constanza",
  "jarabacoa": "Jarabacoa",
};

const provinceIndex = new Map();
const municipalityIndex = new Map(); // norm(municipio) → [{province, municipality}]
for (const p of DR_PROVINCES) {
  provinceIndex.set(norm(p.province), p.province);
  for (const m of p.municipalities) {
    const k = norm(m);
    if (!municipalityIndex.has(k)) municipalityIndex.set(k, []);
    municipalityIndex.get(k).push({ province: p.province, municipality: m });
  }
}

export function resolveProvince(raw) {
  const k = norm(raw);
  if (!k) return null;
  return provinceIndex.get(k) || PROVINCE_ALIASES[k] || null;
}

export function resolveMunicipality(raw, province) {
  let k = norm(raw);
  if (!k) return null;
  if (MUNICIPALITY_ALIASES[k]) k = norm(MUNICIPALITY_ALIASES[k]);
  const candidates = municipalityIndex.get(k) || [];
  if (province) {
    const hit = candidates.find(c => c.province === province);
    return hit ? hit.municipality : null;
  }
  return candidates.length === 1 ? candidates[0] : null; // sin provincia: solo si es único
}

export function parseMoney(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).replace(/rd\$|\$|\s/gi, "").replace(/,/g, "");
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Columnas de precio por tipo de tarifario
export const RATE_COLUMNS = {
  client: [
    { key: "priceT1", tests: [/^(tarifa|precio|price)?\s*t1$/, /^tarifa$/, /^precio$/, /^price$/, /t1/] },
    { key: "priceT2", tests: [/t2/] },
  ],
  driver: [
    { key: "priceT1",  tests: [/chofer.*t1/, /pago.*t1/, /^t1$/, /driver.*t1/] },
    { key: "dietaT1",  tests: [/dieta.*t1/] },
    { key: "helperT1", tests: [/ayud.*t1/, /helper.*t1/] },
    { key: "priceT2",  tests: [/chofer.*t2/, /pago.*t2/, /^t2$/, /driver.*t2/] },
    { key: "dietaT2",  tests: [/dieta.*t2/] },
    { key: "helperT2", tests: [/ayud.*t2/, /helper.*t2/] },
  ],
};

// Encuentra la columna que corresponde a cada campo a partir de los encabezados.
function mapHeaders(headers, kind = "client") {
  const h = headers.map(norm);
  const used = new Set();
  const find = (tests) => { const i = h.findIndex((x, idx) => !used.has(idx) && tests.some(t => t.test(x))); if (i >= 0) used.add(i); return i; };
  const col = {
    province:     find([/^provincia$/, /^prov/, /^province$/]),
    municipality: find([/^municipio$/, /^muni/, /^destino$/, /^ciudad$/, /^municipality$/]),
  };
  // Las columnas específicas (dieta/ayudante) se buscan antes que las genéricas (t1/t2)
  const specs = [...RATE_COLUMNS[kind]].sort((a, b) => (a.key.startsWith("price") ? 1 : 0) - (b.key.startsWith("price") ? 1 : 0));
  for (const c of specs) col[c.key] = find(c.tests);
  return col;
}

/**
 * rows: array de arrays (fila 0 = encabezados) tal como lo devuelve
 * XLSX.utils.sheet_to_json(sheet, { header: 1 }).
 * Devuelve { rates: [{province, municipality, priceT1, priceT2}], errors: [{row, msg}] }
 */
export function parseRateRows(rows, kind = "client") {
  const rates = [], errors = [];
  if (!rows || rows.length < 2) return { rates, errors: [{ row: 1, msg: "El archivo está vacío o solo tiene encabezados" }] };
  const col = mapHeaders(rows[0], kind);
  if (col.municipality < 0) return { rates, errors: [{ row: 1, msg: "No encuentro la columna «Municipio»" }] };
  if (col.priceT1 < 0 && col.priceT2 < 0) return { rates, errors: [{ row: 1, msg: kind === "driver" ? "No encuentro las columnas «Chofer T1» / «Chofer T2»" : "No encuentro las columnas «Tarifa T1» / «Tarifa T2»" }] };
  const extraKeys = RATE_COLUMNS[kind].map(c => c.key).filter(k => k !== "priceT1" && k !== "priceT2");

  const seen = new Set();
  rows.slice(1).forEach((r, i) => {
    const rowNum = i + 2;
    const isEmpty = !r || r.every(c => c == null || String(c).trim() === "");
    if (isEmpty) return;
    const rawProv = col.province >= 0 ? r[col.province] : "";
    const rawMuni = r[col.municipality];
    const province = resolveProvince(rawProv);
    if (rawProv && !province) { errors.push({ row: rowNum, msg: `Provincia no reconocida: «${rawProv}»` }); return; }

    let municipality;
    let prov = province;
    let custom = false;
    if (prov) {
      municipality = resolveMunicipality(rawMuni, prov);
      // Destino libre: el cliente nombra el lugar a su manera (sector, paraje, localidad). Se acepta tal cual
      // dentro de la provincia y queda disponible en el formulario de viajes de ese cliente.
      if (!municipality) { const name = String(rawMuni ?? "").trim(); if (!name) { errors.push({ row: rowNum, msg: `Municipio vacío (${prov})` }); return; } municipality = name; custom = true; }
    } else {
      const hit = resolveMunicipality(rawMuni, null);
      if (!hit) { errors.push({ row: rowNum, msg: `Municipio «${rawMuni}» no reconocido o ambiguo; agrega la provincia` }); return; }
      prov = hit.province; municipality = hit.municipality;
    }

    const priceT1 = col.priceT1 >= 0 ? parseMoney(r[col.priceT1]) : 0;
    const priceT2 = col.priceT2 >= 0 ? parseMoney(r[col.priceT2]) : 0;
    if (Number.isNaN(priceT1) || Number.isNaN(priceT2)) { errors.push({ row: rowNum, msg: `Tarifa no numérica en ${municipality}` }); return; }
    if (priceT1 <= 0 && priceT2 <= 0) { errors.push({ row: rowNum, msg: `${municipality}: T1 y T2 están vacíos o en 0` }); return; }
    if (priceT1 < 0 || priceT2 < 0) { errors.push({ row: rowNum, msg: `${municipality}: tarifa negativa` }); return; }

    const key = `${prov}|${municipality}`;
    if (seen.has(key)) { errors.push({ row: rowNum, msg: `${municipality} aparece dos veces; se usa la primera` }); return; }
    seen.add(key);
    const rate = { province: prov, municipality, priceT1, priceT2, ...(custom ? { custom: true } : {}) };
    for (const k of extraKeys) {
      const v = col[k] >= 0 ? parseMoney(r[col[k]]) : 0;
      if (Number.isNaN(v) || v < 0) { errors.push({ row: rowNum, msg: `${municipality}: valor inválido en ${k}` }); return; }
      rate[k] = v;
    }
    rates.push(rate);
  });
  return { rates, errors };
}

/**
 * Mezcla tarifas importadas con las existentes del cliente.
 * Misma provincia+municipio → se actualiza el precio (conserva el id).
 * Destino nuevo → se agrega con id nuevo.
 * Devuelve { rates, updated, added }.
 */
export function mergeRates(existing, incoming) {
  const out = existing.map(r => ({ ...r }));
  let updated = 0, added = 0;
  let nextId = out.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  for (const inc of incoming) {
    const idx = out.findIndex(r => r.province === inc.province && r.municipality === inc.municipality);
    if (idx >= 0) {
      const cur = out[idx];
      const { id: _i, province: _p, municipality: _m, ...vals } = inc;
      const changed = Object.keys(vals).some(k => (cur[k] ?? 0) !== vals[k]);
      if (changed) { out[idx] = { ...cur, ...vals }; updated++; }
    } else {
      out.push({ id: nextId++, ...inc }); added++;
    }
  }
  return { rates: out, updated, added };
}

export const TEMPLATE_HEADERS = ["Provincia", "Municipio", "Tarifa T1", "Tarifa T2"];
export const TEMPLATE_EXAMPLE_ROWS = [
  ["Santiago", "Santiago de los Caballeros", 5500, 9000],
  ["Dajabón", "Dajabón", 13400, 20000],
  ["Valverde", "Mao", 9240, 13000],
];
export const DRIVER_TEMPLATE_HEADERS = ["Provincia", "Municipio", "Chofer T1", "Dieta T1", "Ayudante T1", "Chofer T2", "Dieta T2", "Ayudante T2"];
export const DRIVER_TEMPLATE_EXAMPLE_ROWS = [
  ["Santiago", "Santiago de los Caballeros", 900, 0, 700, 1200, 0, 750],
  ["Dajabón", "Dajabón", 2000, 500, 1000, 2500, 600, 1200],
  ["Independencia", "Jimaní", 0, 0, 0, 4000, 1000, 1500],
];

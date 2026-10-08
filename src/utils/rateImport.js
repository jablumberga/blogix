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

// Encuentra la columna que corresponde a cada campo a partir de los encabezados.
function mapHeaders(headers) {
  const h = headers.map(norm);
  const find = (...tests) => h.findIndex(x => tests.some(t => t.test(x)));
  return {
    province:     find(/^provincia$/, /^prov/, /^province$/),
    municipality: find(/^municipio$/, /^muni/, /^destino$/, /^ciudad$/, /^municipality$/),
    priceT1:      find(/t1/, /^tarifa$/, /^precio$/, /^price$/),
    priceT2:      find(/t2/),
  };
}

/**
 * rows: array de arrays (fila 0 = encabezados) tal como lo devuelve
 * XLSX.utils.sheet_to_json(sheet, { header: 1 }).
 * Devuelve { rates: [{province, municipality, priceT1, priceT2}], errors: [{row, msg}] }
 */
export function parseRateRows(rows) {
  const rates = [], errors = [];
  if (!rows || rows.length < 2) return { rates, errors: [{ row: 1, msg: "El archivo está vacío o solo tiene encabezados" }] };
  const col = mapHeaders(rows[0]);
  if (col.municipality < 0) return { rates, errors: [{ row: 1, msg: "No encuentro la columna «Municipio»" }] };
  if (col.priceT1 < 0 && col.priceT2 < 0) return { rates, errors: [{ row: 1, msg: "No encuentro las columnas «Tarifa T1» / «Tarifa T2»" }] };

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
    if (prov) {
      municipality = resolveMunicipality(rawMuni, prov);
      if (!municipality) { errors.push({ row: rowNum, msg: `Municipio «${rawMuni}» no existe en ${prov}` }); return; }
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
    rates.push({ province: prov, municipality, priceT1, priceT2 });
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
      if (cur.priceT1 !== inc.priceT1 || cur.priceT2 !== inc.priceT2) { out[idx] = { ...cur, priceT1: inc.priceT1, priceT2: inc.priceT2 }; updated++; }
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

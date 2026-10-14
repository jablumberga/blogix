/**
 * Orden de listas (Viajes, Facturas, Gastos). Por defecto: fecha, más reciente primero.
 *   sortRecords(list, { key, dir }, getters) — getters: { key: (rec) => valor } ; los valores se comparan como
 *   número si ambos son números, si no como texto (es-DO, sin mayúsculas). Vacíos siempre al final.
 */
export const DEFAULT_SORT = { key: "date", dir: "desc" };

const isEmpty = (v) => v === null || v === undefined || v === "";
const cmp = (a, b) => {
  if (isEmpty(a) && isEmpty(b)) return 0;
  if (isEmpty(a)) return 1;
  if (isEmpty(b)) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es", { sensitivity: "base", numeric: true });
};

export function sortRecords(list, sort = DEFAULT_SORT, getters = {}) {
  const get = getters[sort.key] || ((r) => r?.[sort.key]);
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((x, y) => {
    const c = cmp(get(x), get(y));
    if (c !== 0) return (isEmpty(get(x)) || isEmpty(get(y))) ? c : c * sign; // vacíos al final sin importar dirección
    return ((Number(y?.id) || 0) - (Number(x?.id) || 0)) * (sort.dir === "asc" ? -1 : 1);
  });
}

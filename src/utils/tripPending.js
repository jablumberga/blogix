/**
 * Viajes pendientes de completar información.
 *
 * El chofer puede registrar un viaje aunque el cliente no tenga tarifa para ese destino (queda el récord);
 * la oficina lo ve en el panel, en el menú «Viajes» y en el filtro «Por completar» hasta ponerle la tarifa.
 * Mientras no tenga tarifa no se puede facturar (Facturas solo toma viajes con tarifa > 0).
 */
export const needsRate = (tr) => !!tr && tr.status !== "cancelled" && !(Number(tr.revenue) > 0);

/** Viajes por completar, del más viejo al más nuevo. */
export function pendingInfoTrips(trips = []) {
  return (trips || []).filter(needsRate).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || a.id - b.id);
}

/** Qué le falta a un viaje (para el aviso). */
export function missingInfo(tr, { drivers = [], expenses = [] } = {}) {
  const out = [];
  if (needsRate(tr)) out.push("tarifa del cliente");
  const d = drivers.find(x => x.id === tr?.driverId);
  const perTrip = d && (d.salaryType === "perTrip" || !d.salaryType);
  if (tr && tr.status !== "cancelled" && perTrip && !expenses.some(e => e.tripId === tr.id && e.category === "driverPay" && Number(e.amount) > 0)) out.push("pago del chofer");
  return out;
}

/** Para abrir Viajes con el filtro «Por completar» desde otra pantalla. */
const KEY = "bl_trips_filter";
export function requestTripsFilter(value) { try { sessionStorage.setItem(KEY, value); } catch { /* sin almacenamiento: abre sin filtro */ } }
export function takeTripsFilter() { try { const v = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); return v; } catch { return null; } }

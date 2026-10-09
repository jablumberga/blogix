/**
 * Referencia de factura por viaje: no puede repetirse para el mismo cliente,
 * salvo que sea un VIAJE CONJUNTO (dos camiones para una misma factura).
 * En ese caso el segundo viaje enlaza con el primero y la factura paga los dos
 * camiones, cada uno con su tarifa (T1 + T1, T2 + T2 o T1 + T2).
 *
 * Se usa en Viajes (admin), en el panel del chofer y en el servidor (api.mjs),
 * para que un chofer no pueda meter una referencia ya usada.
 */
export const MAX_JOINT_TRUCKS = 2;

export const normRef = (r) => String(r ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/** Viajes activos del mismo cliente con la misma referencia (sin contar `trip`). */
export function sameRefTrips(trip, trips = []) {
  const ref = normRef(trip?.invoiceRef);
  if (!ref) return [];
  return trips.filter(tr => tr && tr.id !== trip.id && tr.status !== "cancelled" &&
    Number(tr.clientId) === Number(trip.clientId) && normRef(tr.invoiceRef) === ref);
}

/**
 * Valida la referencia de `trip` contra `trips`.
 * Devuelve { ok:true, linkWith:null } si es nueva;
 *          { ok:true, linkWith:<viaje> } si enlaza como conjunto;
 *          { ok:false, error, conflict } si no se permite.
 */
export function checkTripRef(trip, trips = [], { drivers = [], trucks = [] } = {}) {
  if (!trip || trip.status === "cancelled" || !normRef(trip.invoiceRef)) return { ok: true, linkWith: null };
  const others = sameRefTrips(trip, trips);
  if (others.length === 0) return { ok: true, linkWith: null };
  const describe = (tr) => {
    const d = drivers.find(x => x.id === tr.driverId), tk = trucks.find(x => x.id === tr.truckId);
    return `#${tr.id} (${tr.date}${d ? `, ${d.name}` : ""}${tk ? `, ${tk.plate}` : ""})`;
  };
  if (others.length >= MAX_JOINT_TRUCKS) {
    return { ok: false, conflict: others[0], error: `La referencia «${trip.invoiceRef}» ya tiene ${MAX_JOINT_TRUCKS} camiones: ${others.map(describe).join(" y ")}. Una factura paga máximo ${MAX_JOINT_TRUCKS} camiones.` };
  }
  const other = others[0];
  if (Number(other.truckId) === Number(trip.truckId)) {
    return { ok: false, conflict: other, error: `La referencia «${trip.invoiceRef}» ya está registrada en el viaje ${describe(other)} con el mismo camión.` };
  }
  if (trip.joint || other.joint) return { ok: true, linkWith: other };
  return { ok: false, conflict: other, error: `La referencia «${trip.invoiceRef}» ya está registrada en el viaje ${describe(other)}. Si fueron dos camiones para la misma factura, marca «Viaje conjunto» para enlazarlos.` };
}

/** Aplica el enlace: ambos viajes quedan marcados como conjunto y apuntando uno al otro. */
export function linkJoint(trip, other) {
  return {
    trip:  { ...trip,  joint: true, jointWith: other.id },
    other: { ...other, joint: true, jointWith: trip.id },
  };
}

/**
 * Validación en servidor (y en sincronizar): solo se revisan los viajes NUEVOS o cuya
 * referencia / cliente / camión cambió, para no bloquear datos históricos.
 * Devuelve { errors:[{tripId, error}], links:[{tripId, otherId}] }.
 */
export function validateTripWrites({ incoming = [], existing = [], drivers = [], trucks = [] }) {
  const prevById = new Map(existing.map(t => [t.id, t]));
  const incomingIds = new Set(incoming.map(t => t.id));
  const universe = [...existing.filter(t => !incomingIds.has(t.id)), ...incoming];
  const errors = [], links = [];
  for (const tr of incoming) {
    const prev = prevById.get(tr.id);
    const changed = !prev || normRef(prev.invoiceRef) !== normRef(tr.invoiceRef) || Number(prev.clientId) !== Number(tr.clientId) ||
      Number(prev.truckId) !== Number(tr.truckId) || (prev.status === "cancelled" && tr.status !== "cancelled");
    if (!changed) continue;
    const r = checkTripRef(tr, universe, { drivers, trucks });
    if (!r.ok) errors.push({ tripId: tr.id, error: r.error });
    else if (r.linkWith && !(tr.joint && tr.jointWith === r.linkWith.id && r.linkWith.jointWith === tr.id)) links.push({ tripId: tr.id, otherId: r.linkWith.id });
  }
  return { errors, links };
}

/** Parejas históricas con la misma referencia en camiones distintos: se enlazan como conjunto. */
export function autoLinkJointPairs(trips = []) {
  const groups = new Map();
  for (const t of trips) { const ref = normRef(t.invoiceRef); if (!ref || t.status === "cancelled") continue; const k = `${t.clientId}|${ref}`; groups.set(k, [...(groups.get(k) || []), t]); }
  const byId = new Map(trips.map(t => [t.id, t]));
  let changed = 0;
  for (const g of groups.values()) {
    if (g.length !== 2 || Number(g[0].truckId) === Number(g[1].truckId)) continue;
    if (g[0].joint && g[1].joint) continue;
    const l = linkJoint(g[0], g[1]); byId.set(l.trip.id, l.trip); byId.set(l.other.id, l.other); changed++;
  }
  return { trips: trips.map(t => byId.get(t.id)), changed };
}

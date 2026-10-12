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

/**
 * Escritura de un CHOFER (servidor): nunca borra, solo crea o edita viajes suyos.
 *  - viajes bloqueados (facturados, cobrados o con documentos recibidos) no se tocan:
 *    se conserva lo que hay en el servidor
 *  - viajes nuevos o editados deben tener cliente activo, destino, camión y tarifa > 0
 *    (salvo cancelados) y fecha válida cercana (±`maxDays` días)
 *  - se conservan campos que solo pone el servidor/admin (enlace de conjunto, bitácora)
 * Devuelve { trips, errors:[{tripId, error}], ignored:[ids] }.
 */
const OFFICE_DOC_FIELDS = ["docs", "docsReceivedAt", "docsReceivedBy", "docsReceivedTs", "docStatus", "podDelivered"];

export function sanitizeDriverTrips({ incoming = [], existing = [], driverId, clients = [], trucks = [], invoices = [], cobros = [], today = new Date(), maxDays = 60, ayudantes = null }) {
  const prevById = new Map(existing.map(t => [t.id, t]));
  const locked = new Set();
  for (const inv of invoices) if (inv?.status !== "cancelled") for (const id of inv.tripIds || []) locked.add(Number(id));
  for (const c of cobros) for (const id of c?.collectedTripIds || []) locked.add(Number(id));
  const clientMap = new Map(clients.map(c => [c.id, c])), truckMap = new Map(trucks.map(t => [t.id, t]));
  const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
  const errors = [], ignored = [], out = [];
  for (const raw of incoming) {
    const prev = prevById.get(raw.id);
    if (prev && (locked.has(Number(raw.id)) || prev.docsReceivedAt)) { ignored.push(raw.id); out.push(prev); continue; }
    const tr = { ...raw, driverId };
    // Documentos recibidos los marca la oficina, no el chofer: en viajes nuevos van pendientes; en los ya
    // registrados se conserva lo que tiene el servidor (así nadie se paga ni se «entrega» un viaje desde el teléfono)
    for (const k of OFFICE_DOC_FIELDS) { if (prev && prev[k] !== undefined) tr[k] = prev[k]; else delete tr[k]; }
    if (!prev) { tr.docStatus = "pending"; tr.podDelivered = false; }
    if (prev) {
      for (const k of ["jointWith", "jointAuto", "createdAt", "createdBy", "history"]) if (prev[k] !== undefined && tr[k] === undefined) tr[k] = prev[k];
      // Ayudantes de un viaje ya registrado: solo los cambia la oficina (el panel del chofer no los edita; una copia vieja no los pisa)
      if (Array.isArray(ayudantes)) for (const k of ["numHelpers", "helperPayEach", "helperNames", "helpers"]) { if (prev[k] !== undefined) tr[k] = prev[k]; else delete tr[k]; }
      // Sin cambios reales → se conserva tal cual, sin volver a validar (viajes viejos no se bloquean)
      const strip = (o) => { const c = { ...o }; for (const k of ["history", "updatedAt", "updatedBy"]) delete c[k]; return JSON.stringify(Object.keys(c).sort().map(k => [k, c[k]])); };
      if (strip(tr) === strip(prev)) { out.push(prev); continue; }
    }
    const cancelled = tr.status === "cancelled";
    const cl = clientMap.get(Number(tr.clientId));
    const problems = [];
    if (!cl) problems.push("cliente no existe");
    else if (cl.status === "inactive") problems.push("cliente inactivo");
    if (!tr.province || !tr.municipality) problems.push("falta el destino");
    if (!truckMap.get(Number(tr.truckId))) problems.push("camión no existe");
    if (!cancelled && !(Number(tr.revenue) > 0)) problems.push("tarifa debe ser mayor que 0");
    const d = /^\d{4}-\d{2}-\d{2}$/.test(tr.date || "") ? new Date(tr.date + "T00:00:00") : null;
    if (!d || isNaN(d)) problems.push("fecha inválida");
    else if (Math.abs((d - t0) / 86400000) > maxDays) problems.push(`fecha fuera de rango (±${maxDays} días)`);
    if (cl?.rules?.requiresInvoiceRef && !cancelled && !String(tr.invoiceRef || "").trim()) problems.push("este cliente exige referencia de factura");
    if (problems.length) { errors.push({ tripId: tr.id, error: `Viaje #${tr.id} (${tr.date || "sin fecha"}): ${problems.join("; ")}.` }); continue; }
    out.push(tr);
  }
  return { trips: out, errors, ignored };
}

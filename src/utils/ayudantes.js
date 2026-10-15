/** * Ayudantes como personas.
 *
 * Lista de ayudantes (`ayudantes`): [{ id, name, cedula, phone, bank, account, payMode, status, notes }]
 *   payMode "direct"  → se le paga directo a él (nómina de ayudantes, su propio reporte, adelantos)
 *   payMode "driver"  → se le paga a través del chofer (como siempre)
 * Tripulación fija del camión: truck.helperIds = [ayudanteId, …] (salen puestos en sus viajes).
 * Línea de ayudante en el viaje: trip.helpers[i] = { name, pay, ayudanteId?, direct? }
 *   Las líneas sin ayudanteId (o con direct falso) se pagan por el chofer, igual que antes.
 * Regla del cliente: client.rules.helpersMode = "normal" | "none" (no lleva) | "client" (los paga el cliente)
 *
 * Archivo puro (sin React): lo usan las pantallas, la nómina y el servidor (viaje conjunto).
 */
import { helpersPayText, helperDirectText } from "./driverPay.js";

export const HELPER_PAY_MODES = {
  direct: "Directo (su propia nómina)",
  driver: "Por el chofer",
};

export const CLIENT_HELPER_MODES = {
  normal: "Normal (según el camión)",
  none:   "No lleva ayudantes",
  client: "Los paga el cliente",
};

export function clientHelpersMode(client) {
  const m = client?.rules?.helpersMode;
  return m === "none" || m === "client" ? m : "normal";
}
/** El cliente no lleva ayudantes o los paga él: en sus viajes van 0 ayudantes a cargo de la empresa. */
export const clientSkipsHelpers = (client) => clientHelpersMode(client) !== "normal";

export function normalizeAyudante(a) {
  if (!a) return a;
  return { status: "active", ...a, payMode: a.payMode === "driver" ? "driver" : "direct" };
}
export const activeAyudantes = (list = []) => (list || []).filter(Boolean).map(normalizeAyudante).filter(a => a && a.status !== "inactive" && a.status !== "deleted");

/** Ayudantes fijos del camión (activos y en su orden) como casillas del formulario del viaje. */
export function crewSlots(truck, ayudantes = []) {
  const byId = new Map(activeAyudantes(ayudantes).map(a => [a.id, a]));
  const crew = (truck?.helperIds || []).map(id => byId.get(Number(id))).filter(Boolean);
  return { helperIds: crew.map(a => a.id), helperNames: crew.map(a => a.name) };
}

/**
 * Líneas de ayudantes del viaje a partir de las casillas del formulario.
 * Casilla con ayudante de la lista → { name, pay, ayudanteId, direct } ; casilla libre → { name, pay } (por el chofer).
 * prevLines: las líneas ya guardadas del viaje. Si el mismo ayudante sigue en la misma casilla, se respeta
 * cómo se le iba a pagar (directo o por el chofer) aunque después le hayan cambiado la forma de pago en la lista:
 * así editar un viaje viejo no mueve dinero de un lado a otro.
 */
export function buildHelperLines({ count, pay, helperIds = [], helperNames = [], ayudantes = [], prevLines = [] }) {
  const byId = new Map((ayudantes || []).filter(Boolean).map(a => [a.id, normalizeAyudante(a)]));
  const n = Math.max(0, Number(count) || 0);
  return Array.from({ length: n }, (_, i) => {
    const id = helperIds?.[i];
    const a = id != null && id !== "" ? byId.get(Number(id)) : null;
    if (a) {
      const prev = prevLines?.[i];
      const keep = prev && prev.ayudanteId != null && Number(prev.ayudanteId) === a.id && typeof prev.direct === "boolean";
      return { name: a.name, pay, ayudanteId: a.id, direct: keep ? prev.direct : a.payMode === "direct" };
    }
    return { name: String(helperNames?.[i] || "").trim() || `Ayudante ${i + 1}`, pay };
  });
}

/** ¿Ya se pagó algún gasto de ayudantes de este viaje? Entonces su reparto no se puede cambiar. */
export const tripHelpersPaid = (expenses = [], tripId) => (expenses || []).some(e => (e.category === "helper" || e.category === "driverPay") && e.tripId === tripId && e.status === "paid");
/** ¿El viaje usa ayudantes de la lista (en sus líneas)? */
export const linesUseList = (lines = []) => (lines || []).some(l => l && l.ayudanteId != null && l.ayudanteId !== "");

/**
 * Reparte el pago de ayudantes de un viaje (calc = calcDriverPay del viaje):
 * los directos van a cada ayudante; el resto, al chofer (como siempre).
 * Viajes viejos sin ayudanteId → todo por el chofer, igual que antes.
 */
export function splitTripHelpers(trip, calc) {
  const n = Number(calc?.numHelpers) || 0, each = Number(calc?.helperEach) || 0;
  const payOf = (i) => (Array.isArray(calc?.helperPays) && calc.helperPays[i] != null ? Number(calc.helperPays[i]) || 0 : each); // pago neto de ESE ayudante (fijado / con descuento)
  const lines = Array.isArray(trip?.helpers) ? trip.helpers : [];
  const direct = [];
  for (let i = 0; i < n; i++) {
    const l = lines[i];
    if (l && l.direct && l.ayudanteId != null && l.ayudanteId !== "") direct.push({ ayudanteId: Number(l.ayudanteId), name: l.name || "", amount: payOf(i), idx: i });
  }
  const directTotal = direct.reduce((s, d) => s + d.amount, 0);
  const viaCount = n - direct.length;
  return { each, direct, directTotal, viaDriver: { count: viaCount, amount: (Number(calc?.helpersTotal) || 0) - directTotal } };
}

/**
 * Valida las líneas de ayudantes que manda el chofer contra la lista: cada ayudante de la lista debe existir,
 * estar activo y venir con su forma de pago real. Devuelve el texto del problema o null.
 */
export function invalidHelperLines(trip, ayudantes = []) {
  const byId = new Map((ayudantes || []).filter(Boolean).map(a => [Number(a.id), normalizeAyudante(a)]));
  for (const l of trip?.helpers || []) {
    if (!l || l.ayudanteId == null || l.ayudanteId === "") { if (l?.direct) return "hay un ayudante directo sin identificar"; continue; }
    const a = byId.get(Number(l.ayudanteId));
    if (!a) return `el ayudante «${l.name || l.ayudanteId}» ya no está en la lista`;
    if (a.status === "inactive") return `el ayudante «${a.name}» está inactivo`;
    if (!!l.direct !== (a.payMode === "direct")) return `cambió la forma de pago de «${a.name}»`;
  }
  return null;
}

/**
 * Corrige las líneas de un viaje contra la lista actual: un ayudante que ya no está (o está inactivo/borrado)
 * o repetido pasa a «por el chofer» con su nombre; la forma de pago es la de la lista. Devuelve { lines, changed }.
 */
export function normalizeHelperLines(lines = [], ayudantes = []) {
  const byId = new Map((ayudantes || []).filter(Boolean).map(a => [Number(a.id), normalizeAyudante(a)]));
  const seen = new Set();
  const out = (lines || []).map(l => {
    if (!l) return l;
    const plain = { name: l.name || "", pay: l.pay };
    if (l.ayudanteId == null || l.ayudanteId === "") return l.direct ? plain : l;
    const id = Number(l.ayudanteId), a = byId.get(id);
    if (!a || a.status === "inactive" || a.status === "deleted" || seen.has(id)) return plain;
    seen.add(id);
    return { ...l, ayudanteId: id, direct: a.payMode === "direct" };
  });
  return { lines: out, changed: JSON.stringify(out) !== JSON.stringify(lines || []) };
}

/**
 * Viajes NUEVOS que manda el chofer: si su teléfono tenía la lista vieja, el servidor corrige las líneas con la
 * lista actual y rehace los gastos de ayudantes de ese viaje (así nadie se queda sin cobrar ni cobra doble).
 * Puro: devuelve { trips, expenses, nextExpenseId, fixedTripIds }.
 */
export function normalizeDriverHelpers({ trips = [], expenses = [], ayudantes = [], nextExpenseId }) {
  let nextId = nextExpenseId, outExps = [...expenses];
  const fixedTripIds = [];
  const outTrips = trips.map(tr => {
    const fixed = normalizeHelperLines(tr.helpers, ayudantes);
    if (!fixed.changed) return tr;
    const t2 = { ...tr, helpers: fixed.lines, ...(Array.isArray(tr.helperNames) ? { helperNames: fixed.lines.map(l => l?.name || "") } : {}) };
    const n = Number(t2.numHelpers) || 0, each = Number(t2.helperPayEach) || 0;
    const plan = helperExpensePlan({ trip: t2, calc: { numHelpers: n, helperEach: each, helpersTotal: n * each }, driverDescription: (k) => `Ayudantes (${k}) · ${t2.municipality || ""}` });
    outExps = outExps.filter(e => !(e.tripId === t2.id && e.category === "helper"));
    for (const e of planToNewExpenses(plan, { tripId: t2.id, date: t2.date })) outExps.push({ id: nextId++, ...e });
    fixedTripIds.push(t2.id);
    return t2;
  });
  return { trips: outTrips, expenses: outExps, nextExpenseId: nextId, fixedTripIds };
}

/** Línea directa = ayudante de la lista que cobra directo. */
export const isDirectLine = (l) => !!(l && l.direct && l.ayudanteId != null && l.ayudanteId !== "");

/**
 * Gastos de ayudantes que debe tener un viaje: uno por el chofer (sin ayudanteId, como siempre)
 * y uno por cada ayudante directo. Viaje cancelado → todo en 0 (se quitan los no pagados).
 * driverDescription(count) da el texto del gasto del chofer (cada pantalla usa el suyo de siempre).
 */
export function helperExpensePlan({ trip, calc, driverDescription }) {
  const cancelled = trip?.status === "cancelled";
  const s = splitTripHelpers(trip, calc);
  const where = trip?.municipality || "";
  // Descripción siempre separada por persona: «Ayudante 1: 1,300 + dieta 333 · Ayudante 2: …»
  const plan = [{ ayudanteId: null, driverId: trip?.driverId ?? null, amount: cancelled ? 0 : s.viaDriver.amount,
    description: typeof driverDescription === "function" ? driverDescription(s.viaDriver.count, s) : helpersPayText(calc, s.viaDriver.count, where, s.direct.length) }];
  for (const d of s.direct) plan.push({ ayudanteId: d.ayudanteId, amount: cancelled ? 0 : d.amount, description: helperDirectText(calc, d.name, where, d.idx) });
  return plan;
}

const nextId = (arr) => arr.reduce((m, x) => (Number(x.id) > m ? Number(x.id) : m), 0) + 1;
const helperKey = (e) => (e.ayudanteId != null && e.ayudanteId !== "" ? Number(e.ayudanteId) : null);

/**
 * Aplica el plan a la lista de gastos del viaje: crea, actualiza o quita.
 * Lo ya pagado no se toca. Un ayudante directo que ya no va en el viaje pierde su gasto (si no estaba pagado).
 */
export function applyHelperPlan(expenses, { tripId, date, plan }) {
  let next = [...expenses];
  const mine = (e) => e.category === "helper" && e.tripId === tripId;
  for (const p of plan) {
    const key = p.ayudanteId ?? null;
    const ex = next.find(e => mine(e) && helperKey(e) === key);
    const who = key != null ? { ayudanteId: key } : { driverId: p.driverId };
    if (ex) {
      if (ex.status === "paid" && ex.amount !== p.amount) continue; // ya pagado: no se toca
      next = p.amount > 0 ? next.map(e => e === ex ? { ...e, amount: p.amount, description: p.description, date, ...who } : e) : next.filter(e => e !== ex);
    } else if (p.amount > 0) {
      next = [...next, { id: nextId(next), tripId, date, category: "helper", amount: p.amount, description: p.description, paymentMethod: "transfer", status: "pending", supplierId: null, ...who }];
    }
  }
  const keep = new Set(plan.filter(p => p.ayudanteId != null).map(p => p.ayudanteId));
  return next.filter(e => !(mine(e) && helperKey(e) != null && !keep.has(helperKey(e)) && e.status !== "paid"));
}

/** Gastos nuevos (sin id) para un viaje recién creado: lo que el plan dice, sin los de monto 0. */
export function planToNewExpenses(plan, { tripId, date, status = "pending" }) {
  return plan.filter(p => p.amount > 0).map(p => ({ tripId, date, category: "helper", amount: p.amount, description: p.description, paymentMethod: "transfer",
    ...(p.ayudanteId != null ? { ayudanteId: p.ayudanteId } : { driverId: p.driverId }), status, supplierId: null }));
}

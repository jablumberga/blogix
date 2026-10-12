import { today } from "./helpers.js";
/**
 * Profit First — lógica única de asignación de ingresos.
 *
 * Tres cuentas en el sistema:
 *   INCOME  → todo lo cobrado entra aquí y se reparte en el momento del cobro.
 *   RESERVA → owner's comp + profit + tax, unificadas (20 % del ingreso REAL).
 *   OPEX    → 80 % del ingreso real; de aquí sale nómina, CxP y gastos.
 *
 * Pass-through (no es ingreso real, solo pasa por la cuenta):
 *   - lo que toca al socio en los viajes de sus camiones (liquidaciones),
 *   - comisión de broker (histórico),
 *   - lo que la empresa retiene en la liquidación (gastos reembolsados, cargos fijos)
 *     es ingreso real y se reparte 20/80 al transferir (Profit First siempre).
 */
/**
 * Ajustes: % a Reserva, fecha de arranque (todo lo anterior queda fuera de las cuentas)
 * y balance inicial del banco ese día, repartido en Reserva y OpEx.
 */
export const DEFAULT_PF_SETTINGS = { reservePct: 20, startDate: null, openingReserve: 0, openingOpex: 0 };

/** Categorías de gasto que son pass-through (no consumen OpEx). */
export const PASS_THROUGH_CATEGORIES = ["partner_settlement", "broker_commission"];
/** Categorías que solo son memoria de nómina, no dinero que sale. */
export const NON_CASH_CATEGORIES = ["nominaTotalOverride", "cash_withdrawal", "reserve_withdrawal"];
/** Retiros desde Banco: a caja (no toca OpEx hasta que se registre el gasto en efectivo) o de la Reserva (dueño). */
export const WITHDRAWAL_CATEGORIES = ["cash_withdrawal", "reserve_withdrawal"];

/** Un cobro parcial también es dinero que entró: se asigna igual. */
export const COLLECTED = ["collected", "partial"];

export const isPassThroughExpense = (e) => PASS_THROUGH_CATEGORIES.includes(e?.category);
export const isOpexExpense = (e) => !!e && !isPassThroughExpense(e) && !NON_CASH_CATEGORIES.includes(e.category);

/** Reparte un cobro: pass-through se aparta, el resto se divide reserva/opex. */
export function allocateIncome({ amount = 0, passThrough = 0, reimbursement = 0, reservePct = DEFAULT_PF_SETTINGS.reservePct }) {
  const total = Math.max(0, Number(amount) || 0);
  const pt = Math.min(total, Math.max(0, Number(passThrough) || 0));
  const rb = Math.min(total - pt, Math.max(0, Number(reimbursement) || 0));
  const real = Math.max(0, total - pt - rb);
  const reserve = round2(real * (Number(reservePct) || 0) / 100);
  const opex = round2(real - reserve + rb);
  return { total, passThrough: pt, reimbursement: rb, real, reserve, opex, reservePct: Number(reservePct) || 0 };
}

/**
 * Parte del ingreso de un viaje que NO es de la empresa (va al socio o al broker).
 *  - broker pass-through (cliente con brokerPassThrough): ya venía descontado del cobro → no se aparta
 *  - broker normal: se aparta su comisión (se le paga aparte, gasto pass-through)
 *  - socio: lo que nominalmente le toca según el modelo; los gastos que la empresa
 *    le descuente después vuelven a OpEx en la liquidación (settlementRelease).
 */
export function tripPassThrough({ trip, truck, partner, broker, brokerPassThrough = false }) {
  const revenue = Number(trip?.revenue) || 0;
  if (!revenue) return { partner: 0, broker: 0, total: 0 };
  let brokerPart = 0;
  if (broker && Number(broker.commissionPct) > 0 && (trip?.brokerId == null || trip.brokerId === broker.id)) brokerPart = Math.round(revenue * Number(broker.commissionPct) / 100);
  const netRevenue = revenue - brokerPart;          // lo que realmente llega por el viaje
  const brokerSetAside = brokerPassThrough ? 0 : brokerPart;
  let partnerPart = 0;
  if (partner && truck && truck.partnerId === partner.id) {
    if (partner.model === "profit_share") partnerPart = Math.round(netRevenue * (Number(partner.partnerSharePct) || 0) / 100);
    else partnerPart = Math.max(0, netRevenue - Math.round(revenue * (Number(partner.companyPct) || 0) / 100));
  }
  return { partner: partnerPart, broker: brokerSetAside, total: partnerPart + brokerSetAside };
}

/** Pass-through total de un cobro (sobre los viajes cobrados). */
export function cobroPassThrough({ tripIds = [], trips = [], trucks = [], partners = [], clients = [], brokers = [] }) {
  const tripMap = new Map(trips.map(t => [t.id, t]));
  const truckMap = new Map(trucks.map(t => [t.id, t]));
  const partnerMap = new Map(partners.map(p => [p.id, p]));
  const clientMap = new Map(clients.map(c => [c.id, c]));
  const brokerMap = new Map(brokers.map(b => [b.id, b]));
  let partner = 0, broker = 0;
  for (const id of tripIds) {
    const trip = tripMap.get(id); if (!trip) continue;
    const truck = truckMap.get(trip.truckId);
    const pt = tripPassThrough({ trip, truck, partner: truck?.partnerId ? partnerMap.get(truck.partnerId) : null,
      broker: trip.brokerId ? brokerMap.get(trip.brokerId) : null, brokerPassThrough: clientMap.get(trip.clientId)?.rules?.brokerPassThrough === true });
    partner += pt.partner; broker += pt.broker;
  }
  return { partner, broker, total: partner + broker };
}

/** Asigna un cobro completo: devuelve el objeto `pf` que se guarda en el cobro. */
export function allocateCobro({ amount, tripIds, trips, trucks, partners, clients, brokers, settings = DEFAULT_PF_SETTINGS, invoiceAmount = null }) {
  const full = cobroPassThrough({ tripIds, trips, trucks, partners, clients, brokers });
  // Abono parcial: el pass-through se aparta en proporción a lo que entra (no todo de golpe)
  const frac = invoiceAmount > 0 ? Math.min(1, Math.max(0, (Number(amount) || 0) / invoiceAmount)) : 1;
  const pt = { partner: round2(full.partner * frac), broker: round2(full.broker * frac) };
  const a = allocateIncome({ amount, passThrough: pt.partner + pt.broker, reservePct: settings.reservePct });
  return { ...a, passThroughPartner: pt.partner, passThroughBroker: pt.broker, at: today() };
}

/**
 * Liquidación de socio: lo apartado como pass-through para esa quincena (pool) vs lo que
 * realmente se transfiere. La diferencia (gastos reembolsados, cargos fijos) es ingreso real
 * de la empresa y se reparte igual que cualquier ingreso: % a Reserva, el resto a OpEx.
 */
export function settlementPool(s) {
  if (!s) return 0;
  if (s.model === "profit_share") return Math.round((s.netRevenue || 0) * (Number(s.partnerSharePct) || 0) / 100);
  return Math.max(0, (s.netRevenue || 0) - (s.commission || 0));
}
export function settlementRelease(s, settings = DEFAULT_PF_SETTINGS) {
  const pool = settlementPool(s);
  const transfer = Math.max(0, Number(s?.toTransfer) || 0);
  const released = round2(Math.max(0, pool - transfer));
  const releasedToReserve = round2(released * (Number(settings?.reservePct) || 0) / 100);
  return { pool, transfer, released, releasedToReserve, releasedToOpex: round2(released - releasedToReserve) };
}

/** Asignación de un cobro ya registrado (usa la guardada; si no existe, estima sin pass-through). */
export function cobroAllocation(cobro, settings = DEFAULT_PF_SETTINGS) {
  if (!cobro || !COLLECTED.includes(cobro.status) || !(Number(cobro.amount) > 0)) return null;
  if (cobro.pf && typeof cobro.pf.opex === "number") return cobro.pf;
  return allocateIncome({ amount: cobro.amount, reservePct: settings.reservePct });
}

const afterStart = (date, settings) => !settings?.startDate || !date || date >= settings.startDate;

/**
 * Saldos de las tres cuentas a partir de cobros y gastos.
 *  - income:   todo lo cobrado
 *  - reserve:  acumulado 20 %
 *  - opexIn:   lo que entró a OpEx (80 % + reembolsos)
 *  - opexOut:  gastos pagados desde OpEx (nómina, CxP, operación)
 *  - opexAvailable = opexIn − opexOut
 *  - opexCommitted: gastos pendientes que todavía deben salir de OpEx
 */
export function accountBalances({ cobros = [], expenses = [], settings = DEFAULT_PF_SETTINGS }) {
  const openingReserve = Number(settings?.openingReserve) || 0, openingOpex = Number(settings?.openingOpex) || 0;
  let income = 0, reserve = openingReserve, opexIn = openingOpex, passThrough = 0, real = 0;
  for (const c of cobros) {
    if (!COLLECTED.includes(c.status) || !afterStart(c.collectedDate || c.pf?.at, settings)) continue;
    const a = cobroAllocation(c, settings);
    if (!a) continue;
    income += a.total; reserve += a.reserve; opexIn += a.opex; passThrough += a.passThrough; real += a.real;
  }
  let opexOut = 0, opexCommitted = 0, passThroughOut = 0, passThroughReleased = 0, reserveOut = 0;
  for (const e of expenses) {
    const amt = Number(e.amount) || 0;
    if (e.category === "partner_settlement" && e.status === "paid" && afterStart(e.paidDate || e.date, settings)) {
      const rOp = Number(e.releasedToOpex) || 0, rRes = Number(e.releasedToReserve) || 0;
      passThroughOut += amt; passThroughReleased += rOp + rRes; opexIn += rOp; reserve += rRes; real += rOp + rRes;
    }
    if (e.category === "broker_commission" && e.status === "paid" && afterStart(e.paidDate || e.date, settings)) passThroughOut += amt;
    if (e.category === "reserve_withdrawal" && e.status === "paid" && afterStart(e.paidDate || e.date, settings)) { reserve -= amt; reserveOut += amt; }
    if (!isOpexExpense(e)) continue;
    if (e.status === "paid") { if (afterStart(e.paidDate || e.date, settings)) opexOut += amt; }
    else opexCommitted += amt;
  }
  return { income: round2(income), real: round2(real), reserve: round2(reserve), reserveOut: round2(reserveOut), passThrough: round2(passThrough),
    passThroughOut: round2(passThroughOut), passThroughReleased: round2(passThroughReleased),
    passThroughPending: round2(passThrough - passThroughOut - passThroughReleased),
    opexIn: round2(opexIn), opexOut: round2(opexOut), opexAvailable: round2(opexIn - opexOut), opexCommitted: round2(opexCommitted),
    opexAfterCommitments: round2(opexIn - opexOut - opexCommitted), reservePct: Number(settings?.reservePct) || 0,
    opening: round2(openingReserve + openingOpex), openingReserve, openingOpex, startDate: settings?.startDate || null };
}

/** Asignaciones por mes (YYYY-MM) para gráficas y comparativos. */
export function monthlyAllocations({ cobros = [], settings = DEFAULT_PF_SETTINGS }) {
  const out = new Map();
  for (const c of cobros) {
    if (!COLLECTED.includes(c.status)) continue;
    const date = c.collectedDate || c.pf?.at; if (!date || !afterStart(date, settings)) continue;
    const a = cobroAllocation(c, settings); if (!a) continue;
    const m = date.slice(0, 7);
    const cur = out.get(m) || { month: m, income: 0, real: 0, reserve: 0, opex: 0, passThrough: 0 };
    cur.income += a.total; cur.real += a.real; cur.reserve += a.reserve; cur.opex += a.opex; cur.passThrough += a.passThrough;
    out.set(m, cur);
  }
  return [...out.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

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
 *   - reembolsos de gastos que la empresa adelantó por el socio: vuelven a OpEx
 *     tal cual, sin pasar por el 20/80 (ya salieron de OpEx).
 */
export const DEFAULT_PF_SETTINGS = { reservePct: 20, startDate: null };

/** Categorías de gasto que son pass-through (no consumen OpEx). */
export const PASS_THROUGH_CATEGORIES = ["partner_settlement", "broker_commission"];
/** Categorías que solo son memoria de nómina, no dinero que sale. */
export const NON_CASH_CATEGORIES = ["nominaTotalOverride"];

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
 * Solo cuenta lo que se transfiere al socio; los gastos reembolsables ya salieron de OpEx y vuelven como reembolso.
 */
export function tripPassThrough({ trip, truck, partner, broker }) {
  const revenue = Number(trip?.revenue) || 0;
  if (!revenue) return { partner: 0, broker: 0, total: 0 };
  let brokerPart = 0;
  if (broker && !broker.passThrough && Number(broker.commissionPct) > 0) brokerPart = round2(revenue * Number(broker.commissionPct) / 100);
  let partnerPart = 0;
  if (partner && truck && truck.partnerId === partner.id) {
    const base = revenue - brokerPart;
    if (partner.model === "profit_share") partnerPart = round2(base * (Number(partner.partnerSharePct) || 0) / 100);
    else partnerPart = round2(base * (100 - (Number(partner.companyPct) || 0)) / 100);
  }
  return { partner: partnerPart, broker: brokerPart, total: round2(partnerPart + brokerPart) };
}

/** Asignación de un cobro ya registrado (usa la guardada; si no existe, estima sin pass-through). */
export function cobroAllocation(cobro, settings = DEFAULT_PF_SETTINGS) {
  if (!cobro || cobro.status !== "collected") return null;
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
  let income = 0, reserve = 0, opexIn = 0, passThrough = 0;
  for (const c of cobros) {
    if (c.status !== "collected" || !afterStart(c.collectedDate, settings)) continue;
    const a = cobroAllocation(c, settings);
    if (!a) continue;
    income += a.total; reserve += a.reserve; opexIn += a.opex; passThrough += a.passThrough;
  }
  let opexOut = 0, opexCommitted = 0;
  for (const e of expenses) {
    if (!isOpexExpense(e)) continue;
    const amt = Number(e.amount) || 0;
    if (e.status === "paid") { if (afterStart(e.paidDate || e.date, settings)) opexOut += amt; }
    else opexCommitted += amt;
  }
  return { income: round2(income), reserve: round2(reserve), passThrough: round2(passThrough),
    opexIn: round2(opexIn), opexOut: round2(opexOut), opexAvailable: round2(opexIn - opexOut), opexCommitted: round2(opexCommitted) };
}

export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

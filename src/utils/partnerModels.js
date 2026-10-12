/**
 * Modelos de negocio con socios (dueños de camión) y motor de liquidación.
 *
 *  commission          Modelo 1. La empresa cobra un % del facturado bruto. El socio
 *                      corre con tripulación, combustible y mantenimiento. Se le
 *                      descuentan cargos fijos (GPS, seguro de carga) según su frecuencia.
 *  commission_expenses Modelo 2. Igual que el 1, pero la empresa pone tripulación,
 *                      combustible y gastos de emergencia; todo gasto marcado
 *                      «cargar al socio» se descuenta en la liquidación.
 *  profit_share        Modelo 3. Se reparte la utilidad después de gastos: el socio
 *                      recibe partnerSharePct % del neto.
 *
 * Pago: cada quincena se paga `fondoDays` días después de cerrar (30 por defecto:
 * la primera quincena sale a los 30 días y de ahí cada 15).
 */

export const PARTNER_MODELS = {
  commission:          { label: "Solo comisión",      short: "Comisión",  desc: "La empresa cobra un % del facturado bruto. El socio paga su tripulación, combustible y mantenimiento. Se descuentan cargos fijos (GPS, seguro)." },
  commission_expenses: { label: "Comisión + gastos",  short: "Com.+gastos", desc: "La empresa cobra un % del facturado bruto y además pone tripulación, combustible y emergencias: esos gastos se descuentan al socio." },
  profit_share:        { label: "Reparto de utilidad", short: "Reparto",   desc: "Se reparte la utilidad después de gastos (60/40, 50/50…). El socio recibe su % del neto." },
};

export const CHARGE_FREQUENCIES = {
  biweekly: { label: "Quincenal", perYear: 24 },
  monthly:  { label: "Mensual",   perYear: 12 },
  yearly:   { label: "Anual",     perYear: 1 },
};

/** Normaliza un socio guardado con el formato viejo (commissionPct + negotiationType). */
export function normalizePartner(p) {
  if (!p) return p;
  if (p.model) return { fondoDays: 30, fixedCharges: [], status: "active", ...p };
  const pct = Number(p.commissionPct) || 0;
  return {
    ...p,
    model: "profit_share",
    partnerSharePct: p.partnerSharePct ?? pct,
    companyPct: p.companyPct ?? 0,
    fixedCharges: p.fixedCharges || [],
    fondoDays: p.fondoDays ?? 30,
    status: p.status || "active",
  };
}

/** Un gasto se carga al socio si lo dice su casilla; si no la tiene, según el modelo. */
export function expenseChargedToPartner(expense, partner) {
  if (expense.chargeToPartner === true) return true;
  if (expense.chargeToPartner === false) return false;
  const model = normalizePartner(partner).model;
  if (model === "commission") return false;
  return true; // commission_expenses y profit_share: por defecto sí
}

const toDate = (s) => new Date(`${s}T12:00:00`);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Fecha en que se paga una quincena: cierre + fondoDays. */
export function settlementPayDate(period, partner) {
  const days = Number(normalizePartner(partner).fondoDays ?? 30);
  const d = toDate(period.dateTo);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

/**
 * Cargos fijos que caen en una quincena.
 *  quincenal → en todas; mensual → en la quincena 1 de cada mes;
 *  anual → en la quincena que contiene el aniversario de startDate.
 *  Ningún cargo antes de su startDate.
 */
export function fixedChargesForPeriod(partner, period) {
  const p = normalizePartner(partner);
  const out = [];
  for (const c of p.fixedCharges || []) {
    const amount = Number(c.amount) || 0;
    if (amount <= 0) continue;
    if (c.startDate && c.startDate > period.dateTo) continue;
    if (c.endDate && c.endDate < period.dateFrom) continue;
    const freq = c.frequency || "monthly";
    let applies = false;
    if (freq === "biweekly") applies = true;
    else if (freq === "monthly") applies = period.half === 1;
    else if (freq === "yearly") {
      const start = c.startDate || period.dateFrom;
      const mmdd = start.slice(5);
      const anniv = `${period.dateFrom.slice(0, 4)}-${mmdd}`;
      applies = anniv >= period.dateFrom && anniv <= period.dateTo;
    }
    if (applies) out.push({ id: c.id, name: c.name || "Cargo fijo", amount, frequency: freq });
  }
  return out;
}

/** Ingreso que realmente llega por un viaje (resta el broker pass-through si lo hubo). */
export function tripNetRevenue(trip, clientMap, brokerMap) {
  const gross = Number(trip.revenue) || 0;
  const cl = clientMap.get(trip.clientId);
  if (!cl?.rules?.brokerPassThrough || !trip.brokerId) return gross;
  const br = brokerMap.get(trip.brokerId);
  const pct = br ? (Number(br.commissionPct) || 0) : 0;
  return gross - Math.round(gross * pct / 100);
}

/**
 * Liquidación de un socio en una quincena.
 *
 * period: { dateFrom, dateTo, half, label }
 * Devuelve las líneas y los totales; `toTransfer` es lo que recibe el socio
 * (negativo = el socio debe a la empresa).
 */
export function computeSettlement({ partner, period, trips, expenses, trucks, clients = [], brokers = [], drivers = [], carryIn = 0 }) {
  const p = normalizePartner(partner);
  const clientMap = new Map(clients.map(c => [c.id, c]));
  const brokerMap = new Map(brokers.map(b => [b.id, b]));
  const truckIds = new Set(trucks.filter(tk => tk.partnerId === p.id).map(tk => tk.id));

  const pTrips = trips.filter(tr =>
    truckIds.has(tr.truckId) && tr.status === "delivered" &&
    tr.date >= period.dateFrom && tr.date <= period.dateTo);
  const tripIds = new Set(pTrips.map(tr => tr.id));

  const grossRevenue = pTrips.reduce((s, tr) => s + (Number(tr.revenue) || 0), 0);
  const brokerDeduction = pTrips.reduce((s, tr) => s + ((Number(tr.revenue) || 0) - tripNetRevenue(tr, clientMap, brokerMap)), 0);
  const netRevenue = grossRevenue - brokerDeduction;

  // Gastos atribuibles a los camiones del socio en la quincena
  const tripMap = new Map(trips.map(tr => [tr.id, tr]));
  const candidate = expenses.filter(e => {
    if (["nominaTotalOverride", "adelanto_conductor", "adelanto_ayudante", "broker_commission", "partner_settlement"].includes(e.category)) return false;
    if (e.tripId) return tripIds.has(e.tripId);
    if (!e.truckId || !truckIds.has(e.truckId)) return false;
    return e.date >= period.dateFrom && e.date <= period.dateTo;
  });
  const charged = p.model === "commission" ? [] : candidate.filter(e => expenseChargedToPartner(e, p));
  const expenseLines = charged.map(e => ({
    id: e.id, date: e.date, category: e.category, amount: Number(e.amount) || 0,
    description: e.description || "", tripId: e.tripId || null,
    truckId: e.truckId || tripMap.get(e.tripId)?.truckId || null,
  }));
  const expensesTotal = expenseLines.reduce((s, e) => s + e.amount, 0);

  const fixedLines = p.model === "profit_share" ? [] : fixedChargesForPeriod(p, period);
  const fixedTotal = fixedLines.reduce((s, c) => s + c.amount, 0);

  // En los tres modelos, los gastos que pagó la empresa se reembolsan PRIMERO del ingreso
  // del camión (reimbursement). Lo que queda es lo que se comisiona/reparte.
  const reimbursement = expensesTotal;
  let commission = 0, partnerShare = 0, companyShare = 0, net = 0, toTransfer = 0;
  if (p.model === "profit_share") {
    net = netRevenue - reimbursement;                      // utilidad a repartir
    const pct = Number(p.partnerSharePct) || 0;
    partnerShare = Math.round(net * pct / 100);
    companyShare = net - partnerShare;
    toTransfer = partnerShare;
  } else {
    commission = Math.round(grossRevenue * (Number(p.companyPct) || 0) / 100);
    net = netRevenue - commission - reimbursement - fixedTotal;
    partnerShare = net;
    companyShare = commission + fixedTotal;
    toTransfer = net;
  }
  // Saldo negativo de quincenas anteriores (el socio debía): se descuenta primero de lo que le toca
  const previousBalance = Math.max(0, Number(carryIn) || 0);
  toTransfer = toTransfer - previousBalance;
  // Si vuelve a salir negativo, esa deuda pasa a la siguiente quincena
  const carryOut = toTransfer < 0 ? -toTransfer : 0;
  // Lo que la empresa retiene de esta quincena: lo que entró por el camión menos lo que se transfiere
  // (nunca más de lo que entró: si no hubo ingreso, no se retiene nada y la deuda se arrastra)
  const companyReceives = Math.max(0, netRevenue - Math.max(0, toTransfer));

  return {
    partnerId: p.id, model: p.model, period,
    payDate: settlementPayDate(period, p),
    trips: pTrips, tripCount: pTrips.length,
    grossRevenue, brokerDeduction, netRevenue,
    commission, commissionPct: Number(p.companyPct) || 0,
    expenseLines, expensesTotal,
    fixedLines, fixedTotal,
    reimbursement, previousBalance, carryOut,
    net, partnerSharePct: Number(p.partnerSharePct) || 0, partnerShare, companyShare, companyReceives,
    toTransfer,
  };
}


/**
 * Liquidaciones encadenadas de un socio: de la quincena más vieja a la más nueva,
 * arrastrando el saldo negativo (lo que el socio quedó debiendo) a la siguiente.
 * `periods` en cualquier orden; devuelve un Map clave(mStr-half) → liquidación.
 */
export function computeSettlementChain({ partner, periods = [], trips, expenses, trucks, clients = [], brokers = [], drivers = [] }) {
  const asc = [...periods].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
  const out = new Map(); let carry = 0;
  for (const pd of asc) {
    const s = computeSettlement({ partner, period: pd, trips, expenses, trucks, clients, brokers, drivers, carryIn: carry });
    out.set(`${pd.mStr}-${pd.half}`, s);
    carry = s.carryOut;
  }
  return out;
}

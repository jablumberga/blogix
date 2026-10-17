/**
 * Proyecciones (solo admin). Todo sale de lo que ya está en la app y se afina solo a medida que entran datos:
 *   - ritmo:       viajes y flete por semana de las últimas N semanas (por cliente, por camión; empresa vs socios)
 *   - flujo:       caja semana a semana desde el saldo real (Income + OpEx): lo comprometido (facturas, viajes sin
 *                  facturar, nómina, socios, suplidores, fijos, Reserva) y, si se quiere, lo estimado al ritmo actual
 *   - camiones:    margen por camión (motor de Costo por km) proyectado a mes y viajes para cubrir fijos
 *   - equilibrio:  viajes al mes para cubrir los fijos, por contribución promedio por viaje (T1 / T2)
 *   - escenario:   «qué pasa si»: viajes/semana, combustible ±%, tarifa ±%, % reserva, camión extra
 * Siempre se separa lo COMPROMETIDO (ya existe) de lo ESTIMADO (ritmo), y se dice en cuántas semanas se basa.
 */
import { tripNetRevenue, computeSettlementChain, settlementPayDate, normalizePartner, expenseChargedToPartner } from "./partnerModels.js";
import { tripPassThrough, DEFAULT_PF_SETTINGS, round2 } from "./profitFirst.js";
import { invoiceBalance } from "./cobros.js";
import { getPeriodInfo, genBillingPeriods } from "./helpers.js";
import { bankOverview, roleAccount } from "./bankAccounts.js";
import { costPerKm } from "./costPerKm.js";
import { periodOfDate } from "./pfReport.js";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const toDate = (s) => new Date(`${s}T12:00:00Z`);
const ymd = (d) => d.toISOString().slice(0, 10);
export const shiftDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthEnd = (s) => { const [y, m] = s.split("-").map(Number); return `${s.slice(0, 7)}-${String(lastDayOf(y, m)).padStart(2, "0")}`; };
const avg = (arr) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;
/** Lunes de la semana de una fecha. */
export const weekStart = (s) => { const d = toDate(s); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return ymd(d); };
const PAYROLL_LAG_DAYS = 2;   // la nómina de una quincena se paga ~2 días después de cerrar
const NON_CASH = new Set(["nominaTotalOverride", "cash_withdrawal", "reserve_withdrawal", "partner_settlement", "broker_commission"]);
const PAYROLL = new Set(["driverPay", "helper"]);

/** Fecha en que se paga la nómina de un viaje: la quincena en que la oficina recibió los documentos (o la del viaje, si aún no). */
export function payrollPayDate(trip, today) {
  const base = trip?.docsReceivedAt || (trip?.date && trip.date < today ? today : trip?.date) || today;
  const pd = periodOfDate(base);
  return pd ? shiftDays(pd.dateTo, PAYROLL_LAG_DAYS) : today;
}

/** Cuándo se cobra un viaje sin factura: ciclo del cliente (quincenal + día de pago, o neto N días). */
export function tripExpectedCollection(trip, client) {
  if (!trip?.date) return null;
  try { return getPeriodInfo(trip.date, client)?.expectedDate || null; } catch { return null; }
}

/**
 * Ritmo actual: últimas `weeks` semanas completas + la semana en curso se excluye (para no sesgar).
 * Devuelve promedios por semana y desgloses.
 */
export function runRate({ today, trips = [], trucks = [], clients = [], partners = [], brokers = [], expenses = [], weeks = 8 }) {
  const thisMonday = weekStart(today);
  const to = shiftDays(thisMonday, -1);                // domingo pasado
  const from = shiftDays(thisMonday, -7 * weeks);
  const firstTrip = trips.filter(t => t.status !== "cancelled" && isDate(t.date)).map(t => t.date).sort()[0] || null;
  const effFrom = firstTrip && firstTrip > from ? weekStart(firstTrip) : from;
  const usedWeeks = Math.max(1, Math.round((daysBetween(effFrom, to) + 1) / 7));
  const clientMap = new Map(clients.map(c => [c.id, c])), truckMap = new Map(trucks.map(t => [t.id, t]));
  const partnerMap = new Map(partners.map(p => [p.id, normalizePartner(p)])), brokerMap = new Map(brokers.map(b => [b.id, b]));
  const inWin = trips.filter(t => t.status !== "cancelled" && isDate(t.date) && t.date >= effFrom && t.date <= to);
  const rows = inWin.map(t => {
    const truck = truckMap.get(t.truckId), partner = truck?.partnerId ? partnerMap.get(truck.partnerId) : null;
    const client = clientMap.get(t.clientId), broker = brokerMap.get(t.brokerId ?? client?.rules?.defaultBrokerId);
    const net = tripNetRevenue(t, clientMap, brokerMap);
    const pt = tripPassThrough({ trip: t, truck, partner, broker, brokerPassThrough: !!client?.rules?.brokerPassThrough });
    // Empresa: en camión propio todo el flete; en camión de socio solo la comisión (modelo comisión) o nada hasta liquidar
    const company = partner ? (partner.model === "profit_share" ? net * (num(partner.companyPct) || 50) / 100 : net * num(partner.companyPct) / 100) : net - pt.broker;
    return { trip: t, net, company: round2(company), partnerPart: round2(net - company), truck, partner, client, size: truck?.size || "T1", week: weekStart(t.date) };
  });
  const weekKeys = []; for (let w = effFrom; w <= to; w = shiftDays(w, 7)) weekKeys.push(w);
  const byWeek = weekKeys.map(w => { const r = rows.filter(x => x.week === w); return { week: w, trips: r.length, net: round2(r.reduce((s, x) => s + x.net, 0)), company: round2(r.reduce((s, x) => s + x.company, 0)) }; });
  const group = (keyFn, labelFn) => { const m = new Map(); for (const r of rows) { const k = keyFn(r); if (k == null) continue; if (!m.has(k)) m.set(k, { key: k, label: labelFn(r), trips: 0, net: 0, company: 0 }); const g = m.get(k); g.trips++; g.net += r.net; g.company += r.company; } return [...m.values()].map(g => ({ ...g, net: round2(g.net), company: round2(g.company), tripsPerWeek: round2(g.trips / usedWeeks), netPerWeek: round2(g.net / usedWeeks), companyPerWeek: round2(g.company / usedWeeks) })).sort((a, b) => b.net - a.net); };
  const byClient = group(r => r.client?.id ?? "?", r => r.client?.companyName || "Sin cliente");
  const byTruck = group(r => r.truck?.id ?? "?", r => r.truck?.plate || "Sin camión");
  const bySize = group(r => r.size, r => r.size);
  // Costos variables de la empresa en la ventana (combustible, peaje, reparación…) y nómina de esos viajes.
  // Lo que el socio reembolsa (modelos con gastos a su cargo) no es costo nuestro.
  const tripIds = new Set(inWin.map(t => t.id)), tripById = new Map(inWin.map(t => [t.id, t]));
  const companyCost = (e) => { const t = e.tripId ? tripById.get(e.tripId) : null; const truck = truckMap.get(t ? t.truckId : e.truckId); const partner = truck?.partnerId ? partnerMap.get(truck.partnerId) : null; if (partner && partner.model !== "commission" && expenseChargedToPartner(e, partner)) return partner.model === "profit_share" ? num(e.amount) * (num(partner.companyPct) || 50) / 100 : 0; return num(e.amount); };
  const exps = expenses.filter(e => !e.voided && !NON_CASH.has(e.category) && num(e.amount) > 0);
  const opCost = exps.filter(e => !PAYROLL.has(e.category) && ((e.tripId && tripIds.has(e.tripId)) || (!e.tripId && isDate(e.date) && e.date >= effFrom && e.date <= to))).reduce((s, e) => s + companyCost(e), 0);
  const payroll = exps.filter(e => PAYROLL.has(e.category) && e.tripId && tripIds.has(e.tripId)).reduce((s, e) => s + companyCost(e), 0);
  const total = { trips: rows.length, net: round2(rows.reduce((s, x) => s + x.net, 0)), company: round2(rows.reduce((s, x) => s + x.company, 0)), partnerPart: round2(rows.reduce((s, x) => s + x.partnerPart, 0)), opCost: round2(opCost), payroll: round2(payroll) };
  const perWeek = { trips: round2(total.trips / usedWeeks), net: round2(total.net / usedWeeks), company: round2(total.company / usedWeeks), partnerPart: round2(total.partnerPart / usedWeeks), opCost: round2(total.opCost / usedWeeks), payroll: round2(total.payroll / usedWeeks) };
  const perTrip = { net: total.trips ? round2(total.net / total.trips) : 0, company: total.trips ? round2(total.company / total.trips) : 0, opCost: total.trips ? round2(total.opCost / total.trips) : 0, payroll: total.trips ? round2(total.payroll / total.trips) : 0 };
  // Tendencia: segunda mitad de la ventana contra la primera
  const half = Math.floor(byWeek.length / 2);
  const firstHalf = byWeek.slice(0, half), secondHalf = byWeek.slice(half);
  const trend = half >= 1 ? { before: round2(avg(firstHalf.map(w => w.net))), after: round2(avg(secondHalf.map(w => w.net))) } : null;
  if (trend) trend.pct = trend.before > 0 ? round2((trend.after - trend.before) / trend.before * 100) : null;
  // Días promedio de cobro según los clientes del período (ponderado por flete)
  const collectDays = total.net > 0 ? round2(rows.reduce((s, r) => { const exp = tripExpectedCollection(r.trip, r.client); return s + (exp ? Math.max(0, daysBetween(r.trip.date, exp)) : 30) * r.net; }, 0) / total.net) : 30;
  return { from: effFrom, to, weeks: usedWeeks, requestedWeeks: weeks, byWeek, byClient, byTruck, bySize, total, perWeek, perTrip, trend, collectDays, enough: usedWeeks >= 2 && rows.length >= 4 };
}

/** Proyección de ingresos: cierre de este mes y mes siguiente al ritmo actual. */
export function incomeForecast({ today, trips = [], clients = [], brokers = [], rate }) {
  const clientMap = new Map(clients.map(c => [c.id, c])), brokerMap = new Map(brokers.map(b => [b.id, b]));
  const mStart = `${today.slice(0, 7)}-01`, mEnd = monthEnd(today);
  const mtd = trips.filter(t => t.status !== "cancelled" && isDate(t.date) && t.date >= mStart && t.date <= today);
  const mtdNet = round2(mtd.reduce((s, t) => s + tripNetRevenue(t, clientMap, brokerMap), 0));
  const daysLeft = daysBetween(today, mEnd);
  const perDay = rate.perWeek.net / 7, tripsPerDay = rate.perWeek.trips / 7;
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const nextDays = lastDayOf(ny, nm);
  return {
    month: today.slice(0, 7), mtdTrips: mtd.length, mtdNet, daysLeft,
    monthNet: round2(mtdNet + perDay * daysLeft), monthTrips: Math.round(mtd.length + tripsPerDay * daysLeft),
    nextMonth: `${ny}-${String(nm).padStart(2, "0")}`, nextNet: round2(perDay * nextDays), nextTrips: Math.round(tripsPerDay * nextDays),
    companyPerMonth: round2(rate.perWeek.company / 7 * 30.44), reservePerMonth: 0,
  };
}

/**
 * Flujo de caja semanal. `mode`: "committed" (solo lo que ya existe) | "runrate" (añade viajes nuevos al ritmo actual).
 */
export function cashFlow({ today, horizonWeeks = 8, mode = "committed", trips = [], expenses = [], invoices = [], cobros = [], clients = [], trucks = [], partners = [], brokers = [], drivers = [], suppliers = [], fixedTemplates = [], settlementStatus = {}, bankAccount = null, bankTransfers = [], bankReconciliation = {}, pfSettings = DEFAULT_PF_SETTINGS, rate }) {
  const settings = { ...DEFAULT_PF_SETTINGS, ...(pfSettings || {}) };
  const pct = num(settings.reservePct) / 100;
  const clientMap = new Map(clients.map(c => [c.id, c])), brokerMap = new Map(brokers.map(b => [b.id, b])), truckMap = new Map(trucks.map(t => [t.id, t]));
  const partnerMap = new Map(partners.map(p => [p.id, normalizePartner(p)]));
  const tripMap = new Map(trips.map(t => [t.id, t]));
  // Saldo de arranque: Income + OpEx (lo disponible para operar); Reserva y Caja se informan aparte
  const bank = bankOverview({ bankAccount, expenses, cobros, transfers: bankTransfers, reconciliation: bankReconciliation, settings, invoices, clients, suppliers, todayStr: today });
  const bal = (role) => { const a = roleAccount(bank.accounts, role); return a ? num(bank.summaries[a.id]?.balance) : 0; };
  const start = round2(bal("income") + bal("opex"));
  const reserveNow = round2(bal("reserve")), cashNow = round2(bal("cash"));

  const weeks = []; const w0 = weekStart(today);
  for (let i = 0; i < horizonWeeks; i++) { const from = shiftDays(w0, 7 * i); weeks.push({ i, from, to: shiftDays(from, 6), in: { invoices: 0, unbilled: 0, runRate: 0 }, out: { payroll: 0, partners: 0, suppliers: 0, fixed: 0, reserve: 0, other: 0, runRate: 0 }, items: [] }); }
  const horizonEnd = weeks[weeks.length - 1].to;
  const slot = (date) => { if (!date) return weeks[0]; if (date > horizonEnd) return null; const d = date < w0 ? w0 : date; return weeks.find(w => d >= w.from && d <= w.to) || null; };
  const add = (date, side, kind, amount, label, late = false) => { const w = slot(date); if (!w || !(amount > 0)) return; const a = Math.round(amount); w[side][kind] = w[side][kind] + a; w.items.push({ date, side, kind, amount: a, label, late }); };
  // Parte de la empresa en un flete (para la Reserva): camión propio = todo menos broker; socio = su comisión
  const companyShare = (trip) => { const truck = truckMap.get(trip.truckId), partner = truck?.partnerId ? partnerMap.get(truck.partnerId) : null; const client = clientMap.get(trip.clientId); const broker = brokerMap.get(trip.brokerId ?? client?.rules?.defaultBrokerId); const net = tripNetRevenue(trip, clientMap, brokerMap); const pt = tripPassThrough({ trip, truck, partner, broker, brokerPassThrough: !!client?.rules?.brokerPassThrough }); return partner ? net * num(partner.companyPct) / 100 : net - pt.broker; };

  // 1. Facturas emitidas por cobrar
  const invoicedTripIds = new Set();
  let overdue = 0;
  for (const inv of invoices) {
    if (!inv || inv.status === "cancelled" || inv.status === "draft") continue;
    for (const id of inv.tripIds || []) invoicedTripIds.add(id);
    const b = invoiceBalance(inv, cobros, { trips, clients, brokers });
    if (!(b.balance > 0)) continue;
    const client = clientMap.get(inv.clientId);
    const expected = inv.dueDate || (inv.date ? tripExpectedCollection({ date: inv.date }, client) : null) || today;
    const late = expected < today;
    if (late) overdue = round2(overdue + b.balance);
    add(late ? today : expected, "in", "invoices", b.balance, `${inv.invoiceNumber || `Factura #${inv.id}`} · ${client?.companyName || ""}${late ? " (vencida)" : ""}`, late);
    // Reserva de lo que es de la empresa en esa factura
    const share = (inv.tripIds || []).reduce((s, id) => { const t = tripMap.get(id); return s + (t ? companyShare(t) : 0); }, 0);
    const invAmt = b.amount || 1;
    add(late ? today : expected, "out", "reserve", b.balance * (share / invAmt) * pct, `Reserva ${settings.reservePct}% · ${inv.invoiceNumber || `#${inv.id}`}`);
  }
  // 2. Viajes entregados sin facturar
  for (const t of trips) {
    if (t.status !== "delivered" || invoicedTripIds.has(t.id)) continue;
    const client = clientMap.get(t.clientId);
    const net = tripNetRevenue(t, clientMap, brokerMap); if (!(net > 0)) continue;
    const expected = tripExpectedCollection(t, client) || shiftDays(today, 30);
    add(expected < today ? today : expected, "in", "unbilled", net, `Viaje #${t.id} ${t.municipality || ""} · ${client?.companyName || ""} (sin facturar)`);
    add(expected < today ? today : expected, "out", "reserve", companyShare(t) * pct, `Reserva ${settings.reservePct}% · viaje #${t.id}`);
  }
  // 3. Nómina pendiente (por quincena de docs recibidos)
  for (const e of expenses) {
    if (e.voided || e.status !== "pending" || !(num(e.amount) > 0) || NON_CASH.has(e.category)) continue;
    const trip = e.tripId ? tripMap.get(e.tripId) : null;
    if (PAYROLL.has(e.category)) { const when = payrollPayDate(trip, today); add(when, "out", "payroll", num(e.amount), `Nómina · ${e.description || e.category}`); continue; }
    if (e.paymentMethod === "credit" || e.supplierId) { const when = e.dueDate || e.date || today; add(when < today ? today : when, "out", "suppliers", num(e.amount), e.description || "Suplidor", when < today); continue; }
    const when = e.dueDate || e.date || today;
    add(when < today ? today : when, "out", "other", num(e.amount), e.description || e.category, when < today);
  }
  // 4. Liquidaciones a socios pendientes (cadena por socio; fecha = cierre de quincena + días de fondo)
  const periods = genBillingPeriods(trips.map(t => t.date)).filter(pd => !settings.startDate || pd.dateTo >= settings.startDate);
  const paidKeys = new Set(expenses.filter(e => e.category === "partner_settlement" && e.status === "paid" && e.settlementKey).map(e => e.settlementKey));
  for (const raw of partners) {
    const p = normalizePartner(raw); if (p.status === "inactive") continue;
    const chain = computeSettlementChain({ partner: p, periods, trips, expenses, trucks, clients, brokers, drivers });
    for (const pd of periods) {
      const key = `${p.id}-${pd.mStr}-${pd.half}`;
      if (paidKeys.has(key) || settlementStatus?.[key] === "paid") continue;
      const s = chain.get(`${pd.mStr}-${pd.half}`); if (!s || !(num(s.toTransfer) > 0)) continue;
      const when = settlementPayDate(pd, p);
      add(when < today ? today : when, "out", "partners", num(s.toTransfer), `Liquidación ${p.name} · ${pd.label}`, when < today);
    }
  }
  // 5. Fijos mensuales (plantillas) el día 1 de cada mes del horizonte
  const fixedMonthly = round2(fixedTemplates.reduce((s, t) => s + num(t.amount), 0));
  for (const w of weeks) for (let d = w.from; d <= w.to; d = shiftDays(d, 1)) if (d.endsWith("-01") && d > today) add(d, "out", "fixed", fixedMonthly, `Gastos fijos del mes (${fixedTemplates.length} plantillas)`);
  // 6. Ritmo actual (estimado): viajes nuevos cada semana → se cobran a los días promedio del cliente; sus costos salen antes
  if (mode === "runrate" && rate?.enough) {
    const lag = Math.round(rate.collectDays || 30);
    const weekIn = rate.perWeek.net, weekCompany = rate.perWeek.company, weekPayroll = rate.perWeek.payroll, weekOp = rate.perWeek.opCost, weekPartner = rate.perWeek.partnerPart;
    for (const w of weeks) {
      const collect = shiftDays(w.from, lag);
      add(collect, "in", "runRate", weekIn, `Viajes estimados de la semana del ${w.from} (ritmo actual)`);
      add(collect, "out", "runRate", weekCompany * pct, `Reserva de viajes estimados (sem. ${w.from})`);
      add(shiftDays(w.from, 3), "out", "runRate", weekOp, `Combustible y gastos de ruta estimados (sem. ${w.from})`);
      add(payrollPayDate({ date: w.to, docsReceivedAt: w.to }, today), "out", "runRate", weekPayroll, `Nómina estimada (sem. ${w.from})`);
      add(shiftDays(collect, 7), "out", "runRate", weekPartner, `Socios estimado (sem. ${w.from})`);
    }
  }
  let balance = Math.round(start), minBalance = Math.round(start), minWeek = null;
  for (const w of weeks) {
    w.inTotal = round2(Object.values(w.in).reduce((s, n) => s + n, 0));
    w.outTotal = round2(Object.values(w.out).reduce((s, n) => s + n, 0));
    w.net = round2(w.inTotal - w.outTotal);
    balance = round2(balance + w.net); w.balance = balance;
    if (balance < minBalance) { minBalance = balance; minWeek = w; }
    w.items.sort((a, b) => a.date.localeCompare(b.date));
  }
  const totals = { in: round2(weeks.reduce((s, w) => s + w.inTotal, 0)), out: round2(weeks.reduce((s, w) => s + w.outTotal, 0)) };
  return { mode, start, startParts: { income: bal("income"), opex: bal("opex") }, reserveNow, cashNow, weeks, minBalance, minWeek, end: balance, totals, overdue, fixedMonthly, alerts: weeks.filter(w => w.balance < 0).map(w => `Semana del ${w.from}: la caja queda en ${w.balance.toLocaleString("en-US")}`) };
}

/** Camiones: margen por camión en la ventana del ritmo, proyectado a mes, y viajes para cubrir sus fijos. */
export function truckOutlook({ today, rate, trips, expenses, trucks, drivers, clients, brokers, partners, fixedTemplates = [], distances = [], gpsKm = [], pfSettings }) {
  const r = costPerKm({ dateFrom: rate.from, dateTo: rate.to, trips, expenses, trucks, drivers, clients, brokers, partners, fixedTemplates, distances, gpsKm, today, fuelSettings: pfSettings });
  const factor = 30.44 / Math.max(1, rate.weeks * 7);
  const rows = r.byTruck.filter(t => t.trips > 0).map(t => {
    const variable = round2(t.cost - t.fixed);
    const marginPerTrip = t.trips ? round2((t.companyRevenue - variable) / t.trips) : 0;
    const fixedMonth = round2(fixedTemplates.filter(f => f.truckId === t.truckId).reduce((s, f) => s + num(f.amount), 0));
    return { truckId: t.truckId, plate: t.plate || t.name, size: t.size, trips: t.trips, tripsPerWeek: round2(t.trips / rate.weeks), km: t.km, companyRevenue: round2(t.companyRevenue), variable, fixed: round2(t.fixed), margin: round2(t.companyRevenue - t.cost),
      monthRevenue: round2(t.companyRevenue * factor), monthMargin: round2((t.companyRevenue - t.cost) * factor), marginPerTrip, costPerKm: t.costPerKm, marginPerKm: t.marginPerKm,
      fixedMonth, breakEvenTrips: fixedMonth > 0 && marginPerTrip > 0 ? Math.ceil(fixedMonth / marginPerTrip) : 0, partner: !!t.partnerName };
  }).sort((a, b) => b.monthMargin - a.monthMargin);
  return { rows, totals: r.totals, quality: r.quality };
}

/** Punto de equilibrio: fijos del mes contra contribución promedio por viaje (T1 / T2). */
export function breakEven({ rate, fixedTemplates = [], extraFixed = 0, truckRows = [] }) {
  const fixed = round2(fixedTemplates.reduce((s, t) => s + num(t.amount), 0) + num(extraFixed));
  // Contribución por viaje = parte de la empresa − nómina − gastos de ruta (promedios de la ventana)
  const tripsAll = truckRows.reduce((a, t) => a + t.trips, 0);
  const contribPerTrip = tripsAll ? round2(truckRows.reduce((a, t) => a + t.marginPerTrip * t.trips, 0) / tripsAll) : round2(rate.perTrip.company - rate.perTrip.payroll - rate.perTrip.opCost);
  const bySize = rate.bySize.map(s => {
    const rows = truckRows.filter(t => t.size === s.key);
    const trips = rows.reduce((a, t) => a + t.trips, 0);
    const contrib = trips ? round2(rows.reduce((a, t) => a + t.marginPerTrip * t.trips, 0) / trips) : contribPerTrip;
    return { size: s.key, trips: s.trips, tripsPerWeek: s.tripsPerWeek, contribPerTrip: contrib, tripsPerMonth: contrib > 0 && fixed > 0 ? Math.ceil(fixed / contrib) : 0 };
  });
  const tripsPerMonth = contribPerTrip > 0 && fixed > 0 ? Math.ceil(fixed / contribPerTrip) : 0;
  const currentPerMonth = round2(rate.perWeek.trips * 30.44 / 7);
  return { fixed, contribPerTrip, tripsPerMonth, tripsPerWeek: round2(tripsPerMonth * 7 / 30.44), currentPerMonth, cushion: round2(currentPerMonth - tripsPerMonth), bySize, monthlyContribution: round2(contribPerTrip * currentPerMonth), monthlyResult: round2(contribPerTrip * currentPerMonth - fixed) };
}

/** Escenario «qué pasa si»: todo mensual, con los promedios reales por viaje. */
export function scenario({ rate, fixedTemplates = [], extraFixed = 0, inputs = {}, fuelShare = 0.6, reservePct = 20 }) {
  const tripsPerWeek = inputs.tripsPerWeek ?? rate.perWeek.trips;
  const ratePct = num(inputs.ratePct), fuelPct = num(inputs.fuelPct), resPct = inputs.reservePct ?? reservePct;
  const perMonth = 30.44 / 7;
  const fixed = round2(fixedTemplates.reduce((s, t) => s + num(t.amount), 0) + num(extraFixed));
  const company = rate.perTrip.company * (1 + ratePct / 100);
  const op = rate.perTrip.opCost * (1 + fuelPct / 100 * fuelShare);     // el combustible es ~60 % del gasto de ruta
  const payroll = rate.perTrip.payroll;
  const trips = tripsPerWeek * perMonth;
  const base = { trips: round2(trips), revenue: round2(company * trips), opCost: round2(op * trips), payroll: round2(payroll * trips), fixed };
  base.reserve = round2(base.revenue * resPct / 100);
  base.result = round2(base.revenue - base.opCost - base.payroll - base.fixed);
  base.resultAfterReserve = round2(base.result - base.reserve);
  let extra = null;
  if (inputs.extraTruck && num(inputs.extraTruck.tripsPerWeek) > 0) {
    const size = inputs.extraTruck.size || "T2";
    const sz = rate.bySize.find(s => s.key === size);
    const cPerTrip = (sz && sz.trips ? sz.company / sz.trips : rate.perTrip.company) * (1 + ratePct / 100);
    const t = num(inputs.extraTruck.tripsPerWeek) * perMonth;
    extra = { size, trips: round2(t), revenue: round2(cPerTrip * t), opCost: round2(op * t), payroll: round2(payroll * t), fixed: round2(num(inputs.extraTruck.fixedMonthly)) };
    extra.reserve = round2(extra.revenue * resPct / 100);
    extra.result = round2(extra.revenue - extra.opCost - extra.payroll - extra.fixed);
    extra.resultAfterReserve = round2(extra.result - extra.reserve);
    extra.breakEvenTrips = cPerTrip - op - payroll > 0 ? Math.ceil(extra.fixed / (cPerTrip - op - payroll)) : null;
  }
  const total = extra ? { trips: round2(base.trips + extra.trips), revenue: round2(base.revenue + extra.revenue), opCost: round2(base.opCost + extra.opCost), payroll: round2(base.payroll + extra.payroll), fixed: round2(base.fixed + extra.fixed), reserve: round2(base.reserve + extra.reserve), result: round2(base.result + extra.result), resultAfterReserve: round2(base.resultAfterReserve + extra.resultAfterReserve) } : base;
  return { inputs: { tripsPerWeek, ratePct, fuelPct, reservePct: resPct }, base, extra, total };
}

/** Todo junto para la página. */
export function projections(args) {
  const { today, weeks = 8, horizonWeeks = 8, mode = "committed", extraFixed = 0, scenarioInputs = {} } = args;
  const rate = runRate({ ...args, weeks });
  const income = incomeForecast({ ...args, rate });
  income.reservePerMonth = round2(income.companyPerMonth * num({ ...DEFAULT_PF_SETTINGS, ...(args.pfSettings || {}) }.reservePct) / 100);
  const flow = cashFlow({ ...args, horizonWeeks, mode, rate });
  const trucksOut = truckOutlook({ ...args, rate });
  const be = breakEven({ rate, fixedTemplates: args.fixedTemplates, extraFixed, truckRows: trucksOut.rows });
  const sc = scenario({ rate, fixedTemplates: args.fixedTemplates, extraFixed, inputs: scenarioInputs, reservePct: num({ ...DEFAULT_PF_SETTINGS, ...(args.pfSettings || {}) }.reservePct) });
  return { today, rate, income, flow, trucks: trucksOut, breakEven: be, scenario: sc };
}

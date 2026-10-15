/**
 * Reporte Profit First de UNA factura: todo lo que hay que considerar para saber qué mover y a dónde.
 *
 *   1. Viajes de la factura: camión, modelo del socio, flete, broker, parte apartada (pass-through) y parte real.
 *   2. Cobros: abonos registrados (fecha, método, cuenta) con su reparto Reserva / OpEx / apartado, y lo que falta.
 *   3. Gastos de esos viajes: pagados o pendientes, con qué método (a crédito = suplidor), si se le descuentan al socio.
 *   4. Liquidación por socio (solo la parte de estos viajes): comisión / reparto, reembolsos, a transferir, y lo que
 *      la empresa retiene al liquidar → Reserva / OpEx (método A: Profit First sobre el ingreso real).
 *   5. Qué mover: Reserva, OpEx, socios, broker, suplidores, nómina pendiente.
 *
 * Solo lee; no escribe nada. Las cifras de liquidación son la parte de estos viajes dentro de la quincena del socio
 * (los cargos fijos y el arrastre de otras quincenas se muestran aparte, porque no son de esta factura).
 */
import { normalizePartner, expenseChargedToPartner, tripNetRevenue, computeSettlement, fixedChargesForPeriod } from "./partnerModels.js";
import { tripPassThrough, settlementRelease, cobroAllocation, DEFAULT_PF_SETTINGS } from "./profitFirst.js";
import { invoiceBalance, invoiceCobros } from "./cobros.js";
import { cobroAccountId, expenseAccountId } from "./bankAccounts.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const PAYROLL = new Set(["driverPay", "helper"]);
const NOT_TRIP_COST = new Set(["nominaTotalOverride", "adelanto_conductor", "adelanto_ayudante", "broker_commission", "partner_settlement", "cash_withdrawal", "reserve_withdrawal"]);

export const MODEL_LABEL = { own: "Camión propio", commission: "Comisión", commission_expenses: "Comisión + gastos", profit_share: "Reparto de utilidad" };

export function periodOfDate(date) {
  if (!date) return null;
  const [y, m, d] = String(date).split("-"); const half = Number(d) <= 15 ? 1 : 2;
  const last = new Date(Number(y), Number(m), 0).getDate();
  return { mStr: `${y}-${m}`, half, dateFrom: half === 1 ? `${y}-${m}-01` : `${y}-${m}-16`, dateTo: half === 1 ? `${y}-${m}-15` : `${y}-${m}-${String(last).padStart(2, "0")}`, label: `${y}-${m} ${half === 1 ? "1–15" : `16–${last}`}` };
}

export function buildInvoicePfReport({ inv, trips = [], trucks = [], partners = [], clients = [], brokers = [], expenses = [], cobros = [], drivers = [], suppliers = [], settlementStatus = {}, bankAccount = null, pfSettings = DEFAULT_PF_SETTINGS }) {
  if (!inv) return null;
  const settings = { ...DEFAULT_PF_SETTINGS, ...(pfSettings || {}) };
  const pct = Number(settings.reservePct) || 0;
  const tripMap = new Map(trips.map(t => [t.id, t])), truckMap = new Map(trucks.map(t => [t.id, t]));
  const clientMap = new Map(clients.map(c => [c.id, c])), brokerMap = new Map(brokers.map(b => [b.id, b]));
  const partnerMap = new Map(partners.map(p => [p.id, normalizePartner(p)]));
  const driverMap = new Map(drivers.map(d => [d.id, d])), supplierMap = new Map((suppliers || []).map(s => [s.id, s]));
  const accounts = Array.isArray(bankAccount?.accounts) ? bankAccount.accounts : [];
  const accName = (id) => accounts.find(a => a.id === id)?.name || null;
  const client = clientMap.get(inv.clientId) || null;
  const invTrips = (inv.tripIds || []).map(id => tripMap.get(id)).filter(Boolean);

  // ── 1. Viajes ──────────────────────────────────────────────────────────────
  const tripRows = invTrips.map(tr => {
    const truck = truckMap.get(tr.truckId) || null;
    const partner = truck?.partnerId ? partnerMap.get(truck.partnerId) || null : null;
    const broker = tr.brokerId ? brokerMap.get(tr.brokerId) || null : null;
    const brokerPassThrough = client?.rules?.brokerPassThrough === true;
    const gross = Number(tr.revenue) || 0;
    const net = tripNetRevenue(tr, clientMap, brokerMap);
    const pt = tripPassThrough({ trip: tr, truck, partner, broker, brokerPassThrough });
    const model = partner ? partner.model : "own";
    const modelDetail = !partner ? "100 % de la empresa"
      : partner.model === "profit_share" ? `socio ${partner.partnerSharePct}% / empresa ${100 - partner.partnerSharePct}% de la utilidad`
      : `empresa ${partner.companyPct}% del flete${partner.model === "commission_expenses" ? " + gastos reembolsables" : ""}`;
    return { trip: tr, truck, partner, broker, driver: driverMap.get(tr.driverId) || null, model, modelLabel: MODEL_LABEL[model] || model, modelDetail, gross, net,
      brokerDeducted: brokerPassThrough ? gross - net : 0, brokerSetAside: pt.broker, partnerSetAside: pt.partner, real: round2(net - pt.partner - pt.broker) };
  });
  const totals = {
    gross: tripRows.reduce((s, r) => s + r.gross, 0), net: tripRows.reduce((s, r) => s + r.net, 0),
    brokerDeducted: tripRows.reduce((s, r) => s + r.brokerDeducted, 0), brokerSetAside: tripRows.reduce((s, r) => s + r.brokerSetAside, 0),
    partnerSetAside: tripRows.reduce((s, r) => s + r.partnerSetAside, 0), real: tripRows.reduce((s, r) => s + r.real, 0),
  };
  totals.reserveFull = round2(totals.real * pct / 100); totals.opexFull = round2(totals.real - totals.reserveFull);
  const invoiceAmount = inv.amount != null ? Number(inv.amount) : totals.net;

  // ── 2. Cobros ──────────────────────────────────────────────────────────────
  const bal = invoiceBalance(inv, cobros, { trips, clients, brokers });
  const abonos = invoiceCobros(inv, cobros).sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.id - b.id).map(c => {
    const a = cobroAllocation(c, settings) || { total: Number(c.amount) || 0, passThrough: 0, real: Number(c.amount) || 0, reserve: 0, opex: Number(c.amount) || 0 };
    return { cobro: c, amount: Number(c.amount) || 0, passThrough: a.passThrough || 0, passThroughPartner: a.passThroughPartner ?? a.passThrough ?? 0, passThroughBroker: a.passThroughBroker ?? 0,
      real: a.real || 0, reserve: a.reserve || 0, opex: a.opex || 0, accountId: cobroAccountId(c, accounts), accountName: accName(cobroAccountId(c, accounts)) };
  });
  const collected = { amount: bal.paid, passThrough: round2(abonos.reduce((s, a) => s + a.passThrough, 0)), real: round2(abonos.reduce((s, a) => s + a.real, 0)),
    reserve: round2(abonos.reduce((s, a) => s + a.reserve, 0)), opex: round2(abonos.reduce((s, a) => s + a.opex, 0)) };
  const fracLeft = invoiceAmount > 0 ? Math.max(0, bal.balance) / invoiceAmount : 0;
  const pending = { amount: round2(bal.balance), passThrough: round2((totals.partnerSetAside + totals.brokerSetAside) * fracLeft), real: round2(totals.real * fracLeft) };
  pending.reserve = round2(pending.real * pct / 100); pending.opex = round2(pending.real - pending.reserve);

  // ── 3. Gastos de los viajes ────────────────────────────────────────────────
  const tripIds = new Set(invTrips.map(t => t.id));
  const expRows = expenses.filter(e => e.tripId && tripIds.has(e.tripId) && !NOT_TRIP_COST.has(e.category)).map(e => {
    const tr = tripMap.get(e.tripId); const truck = truckMap.get(tr?.truckId); const partner = truck?.partnerId ? partnerMap.get(truck.partnerId) : null;
    const charged = !!partner && partner.model !== "commission" && expenseChargedToPartner(e, partner);
    const paid = e.status === "paid"; const credit = e.paymentMethod === "credit";
    const source = paid ? (e.paymentMethod === "cash" ? "caja" : "OpEx") : credit ? "suplidor (crédito)" : PAYROLL.has(e.category) ? "nómina (OpEx)" : "pendiente (OpEx)";
    return { exp: e, trip: tr, amount: Number(e.amount) || 0, paid, credit, payroll: PAYROLL.has(e.category), chargedToPartner: charged, partner: partner || null, source,
      supplier: e.supplierId ? supplierMap.get(e.supplierId) || null : null, accountName: paid ? accName(expenseAccountId(e, accounts)) : null };
  });
  const expTotals = {
    total: expRows.reduce((s, r) => s + r.amount, 0), paid: expRows.filter(r => r.paid).reduce((s, r) => s + r.amount, 0),
    pending: expRows.filter(r => !r.paid).reduce((s, r) => s + r.amount, 0), payrollPending: expRows.filter(r => !r.paid && r.payroll).reduce((s, r) => s + r.amount, 0),
    supplierCredit: expRows.filter(r => !r.paid && r.credit).reduce((s, r) => s + r.amount, 0), chargedToPartner: expRows.filter(r => r.chargedToPartner).reduce((s, r) => s + r.amount, 0),
    companyCost: expRows.filter(r => !r.chargedToPartner).reduce((s, r) => s + r.amount, 0),
  };

  // ── 4. Liquidación por socio (parte de estos viajes) ───────────────────────
  const byPartner = new Map();
  for (const r of tripRows) { if (!r.partner) continue; const k = `${r.partner.id}|${periodOfDate(r.trip.date)?.mStr}-${periodOfDate(r.trip.date)?.half}`; if (!byPartner.has(k)) byPartner.set(k, { partner: r.partner, period: periodOfDate(r.trip.date), trips: [] }); byPartner.get(k).trips.push(r.trip); }
  const settlements = [...byPartner.values()].map(({ partner, period, trips: pTrips }) => {
    // Solo los viajes de esta factura, sin cargos fijos ni arrastre (eso es de la quincena completa)
    const s = computeSettlement({ partner: { ...partner, fixedCharges: [] }, period, trips: pTrips, expenses, trucks, clients, brokers, drivers });
    const rel = settlementRelease(s, settings);
    const key = `${partner.id}-${period.mStr}-${period.half}`;
    const paidExp = expenses.find(e => e.category === "partner_settlement" && e.settlementKey === key && e.status === "paid") || null;
    const fixed = fixedChargesForPeriod(partner, period);
    return { partner, period, key, status: settlementStatus?.[key] || "unpaid", paidExp, trips: pTrips, s, rel, fixed, fixedTotal: fixed.reduce((a, c) => a + c.amount, 0),
      setAside: tripRows.filter(r => r.partner?.id === partner.id && pTrips.includes(r.trip)).reduce((a, r) => a + r.partnerSetAside, 0) };
  });
  const brokerPayouts = [...new Map(tripRows.filter(r => r.brokerSetAside > 0).map(r => [r.broker.id, r.broker])).values()].map(b => ({
    broker: b, amount: tripRows.filter(r => r.broker?.id === b.id).reduce((s, r) => s + r.brokerSetAside, 0),
    paid: expenses.filter(e => e.category === "broker_commission" && e.brokerId === b.id && tripIds.has(e.tripId) && e.status === "paid").reduce((s, e) => s + (Number(e.amount) || 0), 0),
  }));

  // ── 5. Qué mover ───────────────────────────────────────────────────────────
  const settleReserve = round2(settlements.reduce((s, x) => s + x.rel.releasedToReserve, 0));
  const settleOpex = round2(settlements.reduce((s, x) => s + x.rel.releasedToOpex, 0));
  const toPartners = round2(settlements.reduce((s, x) => s + x.rel.transfer, 0));
  const moves = {
    onCollect: { reserve: collected.reserve, opex: collected.opex, setAside: collected.passThrough, pendingReserve: pending.reserve, pendingOpex: pending.opex, pendingSetAside: pending.passThrough },
    onSettle: { toPartners, reserve: settleReserve, opex: settleOpex, toBrokers: round2(brokerPayouts.reduce((s, b) => s + b.amount - b.paid, 0)) },
    suppliers: expTotals.supplierCredit, payrollPending: expTotals.payrollPending, otherPending: round2(expTotals.pending - expTotals.payrollPending - expTotals.supplierCredit),
    totalReserve: round2(collected.reserve + pending.reserve + settleReserve), totalOpexIn: round2(collected.opex + pending.opex + settleOpex),
    margin: round2(totals.real + settlements.reduce((s, x) => s + x.rel.released, 0) - expTotals.companyCost - expTotals.chargedToPartner),
  };
  // Identidad: flete neto = apartado + real ; apartado = socios transferido + liberado + broker
  const check = { net: totals.net, parts: round2(totals.partnerSetAside + totals.brokerSetAside + totals.real), setAside: totals.partnerSetAside, setAsideParts: round2(toPartners + settlements.reduce((s, x) => s + x.rel.released, 0)) };
  // ── 6. Vista por modelo (informativa: asume la factura cobrada y liquidada) ───
  // Cada bloque dice qué parte es de la empresa; sobre esa suma va el % de Reserva y el resto a OpEx.
  // Los reembolsos reponen OpEx íntegros (método B) y lo de socios y brokers pasa de largo.
  const ownRows = tripRows.filter(t => !t.partner);
  const own = { trips: ownRows, total: round2(ownRows.reduce((s, t) => s + t.net, 0)) };
  own.reserve = round2(own.total * pct / 100); own.opex = round2(own.total - own.reserve);
  const partnerBlock = (x) => {
    const s = x.s, ps = s.model === "profit_share";
    const base = ps ? (s.companyShare || 0) : (s.commission || 0);
    const transfer = round2(Math.max(0, x.rel.transfer - x.fixedTotal));
    return { partner: x.partner, period: x.period, status: x.status, model: s.model, trips: tripRows.filter(r => x.trips.includes(r.trip)), s, netRevenue: s.netRevenue, grossRevenue: s.grossRevenue,
      commission: s.commission || 0, commissionPct: s.commissionPct, reimbursement: s.reimbursement || 0, periodResult: s.periodResult, partnerShare: s.partnerShare || 0, companyShare: s.companyShare || 0, partnerSharePct: s.partnerSharePct,
      fixed: x.fixed, fixedTotal: x.fixedTotal, companyIncome: round2(base + x.fixedTotal), transfer, truckLossOut: s.truckLossOut || 0 };
  };
  const blocks = settlements.map(partnerBlock);
  const byModel = (model) => { const list = blocks.filter(b => b.model === model); return { list, netRevenue: round2(list.reduce((s, b) => s + b.netRevenue, 0)), companyIncome: round2(list.reduce((s, b) => s + b.companyIncome, 0)), transfer: round2(list.reduce((s, b) => s + b.transfer, 0)), reimbursement: round2(list.reduce((s, b) => s + b.reimbursement, 0)) }; };
  const reimbByPartner = new Map();
  for (const e of expRows) { if (!e.chargedToPartner) continue; const k = e.partner.id; if (!reimbByPartner.has(k)) reimbByPartner.set(k, { partner: e.partner, lines: new Map(), total: 0 }); const g = reimbByPartner.get(k); g.lines.set(e.exp.category, (g.lines.get(e.exp.category) || 0) + e.amount); g.total = round2(g.total + e.amount); }
  const reimbursements = { groups: [...reimbByPartner.values()].map(g => ({ partner: g.partner, lines: [...g.lines.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })), total: g.total })), total: round2([...reimbByPartner.values()].reduce((s, g) => s + g.total, 0)) };
  const brokersTotal = round2(brokerPayouts.reduce((s, b) => s + b.amount, 0));
  const companyIncome = round2(own.total + blocks.reduce((s, b) => s + b.companyIncome, 0));
  const pf = { companyIncome, reserve: round2(companyIncome * pct / 100) };
  pf.opexPct = round2(companyIncome - pf.reserve); pf.opex = round2(pf.opexPct + reimbursements.total);
  pf.toPartners = round2(blocks.reduce((s, b) => s + b.transfer, 0)); pf.toBrokers = brokersTotal; pf.passThrough = round2(pf.toPartners + brokersTotal);
  pf.total = round2(pf.reserve + pf.opex + pf.passThrough);
  pf.margin = round2(companyIncome + reimbursements.total - expTotals.total);
  const sections = { own, profit_share: byModel("profit_share"), commission_expenses: byModel("commission_expenses"), commission: byModel("commission"), reimbursements, pf, brokers: brokerPayouts };
  return { inv, client, invoiceAmount, settings: { reservePct: pct }, tripRows, totals, abonos, collected, pending, balance: bal, expRows, expTotals, settlements, brokerPayouts, moves, check, sections };
}

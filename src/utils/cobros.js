/**
 * Cobros por factura con abonos parciales.
 *
 * Un cobro = un abono a UNA factura: { id, invoiceId, clientId, date, amount, method, reference, note,
 *   status: "collected", collectedDate: date, collectedTripIds: [viajes de la factura], pf }
 *
 *  - La factura muestra cobrado / saldo; cuando el saldo llega a 0 queda «paid».
 *  - Cada abono se reparte con Profit First al registrarlo (pass-through proporcional al abono).
 *  - Los viajes de la factura quedan bloqueados (collectedTripIds) desde el primer abono.
 *  - Borrar un abono revierte su reparto; anular/eliminar la factura borra sus abonos.
 */
import { allocateCobro, DEFAULT_PF_SETTINGS, round2 } from "./profitFirst.js";
import { tripNetRevenue } from "./partnerModels.js";

export const COBRO_METHODS = { transfer: "Transferencia", cash: "Efectivo", check: "Cheque", deposit: "Depósito" };

/** Monto neto de la factura (lo que el cliente paga). */
export function invoiceAmount(inv, trips = [], clients = [], brokers = []) {
  if (inv?.amount != null) return Number(inv.amount) || 0;
  const cm = new Map(clients.map(c => [c.id, c])), bm = new Map(brokers.map(b => [b.id, b]));
  const tm = new Map(trips.map(t => [t.id, t]));
  return (inv?.tripIds || []).reduce((s, id) => { const tr = tm.get(id); return s + (tr ? tripNetRevenue(tr, cm, bm) : 0); }, 0);
}

/** Abonos de una factura (los de la forma vieja por período no aplican a ninguna). */
export const invoiceCobros = (inv, cobros = []) => cobros.filter(c => c && c.invoiceId === inv?.id);

/** { amount, paid, balance, abonos, status } de una factura. */
export function invoiceBalance(inv, cobros = [], { trips = [], clients = [], brokers = [] } = {}) {
  const amount = round2(invoiceAmount(inv, trips, clients, brokers));
  const abonos = invoiceCobros(inv, cobros).sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.id - b.id);
  const paid = round2(abonos.reduce((s, c) => s + (Number(c.amount) || 0), 0));
  const balance = round2(Math.max(0, amount - paid));
  return { amount, paid, balance, abonos, partial: paid > 0 && balance > 0, settled: amount > 0 && balance <= 0 };
}

/** Construye un abono (no lo guarda). Devuelve null si el monto no es válido. */
export function buildAbono({ inv, amount, date, method = "transfer", reference = "", note = "", accountId = null, cobros = [], trips = [], trucks = [], partners = [], clients = [], brokers = [], settings = DEFAULT_PF_SETTINGS, nextId }) {
  const amt = round2(Number(amount) || 0);
  if (!inv || !(amt > 0) || !date) return null;
  const { balance, amount: invAmt } = invoiceBalance(inv, cobros, { trips, clients, brokers });
  const capped = Math.min(amt, balance);           // nunca se cobra más que el saldo
  if (!(capped > 0)) return null;
  const pf = allocateCobro({ amount: capped, tripIds: inv.tripIds || [], trips, trucks, partners, clients, brokers, settings, invoiceAmount: invAmt });
  return { id: nextId, invoiceId: inv.id, clientId: inv.clientId, date, collectedDate: date, amount: capped, method, reference, note,
    status: "collected", collectedTripIds: [...(inv.tripIds || [])], pf: { ...pf, at: date }, ...(accountId ? { accountId } : {}) };
}

/** Estado que le toca a la factura según sus abonos. */
export function invoiceStatusWith(inv, cobros, ctx) {
  const b = invoiceBalance(inv, cobros, ctx);
  if (inv.status === "cancelled") return "cancelled";
  if (b.settled) return "paid";
  if (inv.status === "paid") return b.paid > 0 ? "sent" : "sent";
  return inv.status === "draft" ? "sent" : (inv.status || "sent"); // sin borradores: emitida = por cobrar
}

/** Viajes bloqueados por tener cobro (cualquier abono). */
export function collectedTripIdSet(cobros = []) {
  return new Set(cobros.flatMap(c => (c?.collectedTripIds || []).map(Number)));
}

/**
 * ¿Se puede anular / borrar una factura? Devuelve el motivo si NO:
 *  · alguno de sus cobros ya se repartió en Banco (Reparto de Income) o se depositó desde Caja
 *  · alguno de sus cobros ya está conciliado con el estado de cuenta
 *  · un viaje de la factura es de un camión de socio y la liquidación de esa quincena ya está transferida
 * (anular borraría los cobros y dejaría Banco y las liquidaciones descuadrados).
 */
export function invoiceCancelBlock(inv, { cobros = [], bankTransfers = [], bankReconciliation = {}, expenses = [], trips = [], trucks = [], partners = [] } = {}) {
  if (!inv) return null;
  const mine = invoiceCobros(inv, cobros);
  const used = mine.find(c => (bankTransfers || []).some(t => (t.distKeys || []).includes(`cobro:${c.id}`) || (t.cobroIds || []).includes(c.id)));
  if (used) return `el cobro del ${used.date} (${used.amount}) ya se repartió en Banco: borra primero ese reparto o depósito en Banco`;
  const rec = mine.find(c => bankReconciliation?.[`cobro-${c.id}`] === "reconciled");
  if (rec) return `el cobro del ${rec.date} (${rec.amount}) ya está conciliado con el banco: deshaz la conciliación primero`;
  const truckMap = new Map((trucks || []).map(t => [t.id, t]));
  const paidKeys = new Set((expenses || []).filter(e => e.category === "partner_settlement" && e.status === "paid" && e.settlementKey).map(e => e.settlementKey));
  if (paidKeys.size) {
    for (const tid of inv.tripIds || []) {
      const tr = (trips || []).find(t => t.id === tid); const partnerId = tr ? truckMap.get(tr.truckId)?.partnerId : null;
      if (!tr || !partnerId || !tr.date) continue;
      const [y, m, dd] = tr.date.split("-"); const key = `${partnerId}-${y}-${m}-${Number(dd) <= 15 ? 1 : 2}`;
      if (paidKeys.has(key)) { const p = (partners || []).find(x => x.id === partnerId); return `el viaje #${tr.id} ya está en la liquidación transferida de ${p?.name || "un socio"} (${y}-${m} ${Number(dd) <= 15 ? "1–15" : "16–fin"}): desmárcala primero en Liquidaciones`; }
    }
  }
  return null;
}

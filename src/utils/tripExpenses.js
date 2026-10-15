/**
 * Gastos automáticos de nómina de un viaje (driverPay + helper): una sola rutina para Viajes y Nómina.
 * Crea, actualiza o quita los gastos pendientes según calcDriverPay; lo ya pagado no se toca.
 * Puro: devuelve la lista nueva de gastos.
 */
import { calcDriverPay, normalizeDriver, describeDriverPay } from "./driverPay.js";
import { helperExpensePlan, applyHelperPlan, isDirectLine } from "./ayudantes.js";
import { nxId, fmt } from "./helpers.js";

export function syncTripPayExpenses(expenses, { trip, driver, truck }) {
  if (!trip?.id) return expenses;
  const calc = driver ? calcDriverPay({ driver, trip, truck, clientId: trip.clientId }) : null;
  const cancelled = trip.status === "cancelled";
  const driverAmt = !calc || cancelled || normalizeDriver(driver).payType === "fixed" ? 0 : calc.driverNet;
  let next = [...expenses];
  const existing = next.find(e => e.tripId === trip.id && e.category === "driverPay");
  const description = calc ? describeDriverPay(calc, driver) : "";
  if (existing) {
    if (!(existing.status === "paid" && existing.amount !== driverAmt)) {
      next = driverAmt > 0 ? next.map(e => e === existing ? { ...e, amount: driverAmt, description, date: trip.date, driverId: trip.driverId, calcAmount: undefined, overrideNote: undefined } : e) : next.filter(e => e !== existing);
    }
  } else if (driverAmt > 0) {
    next = [...next, { id: nxId(next), tripId: trip.id, date: trip.date, category: "driverPay", amount: driverAmt, description, paymentMethod: "transfer", status: "pending", supplierId: null, driverId: trip.driverId }];
  }
  const viaNames = (trip.helperNames || []).filter((_, i) => !isDirectLine(trip.helpers?.[i])).filter(Boolean).join(", ");
  const plan = helperExpensePlan({ trip, calc, driverDescription: (n) => calc ? `Ayudantes (${n} × ${fmt(calc.helperEach)}): ${viaNames || driver?.name || ""}` : "" });
  return applyHelperPlan(next, { tripId: trip.id, date: trip.date, plan });
}

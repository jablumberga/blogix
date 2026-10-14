/**
 * Conciliación de punta a punta: ningún peso se cuenta dos veces y todo cuadra.
 * Escenario: 4 viajes cobrados (camión propio + socios en los 3 modelos), gastos,
 * nómina, cobro y liquidación. Se verifican identidades contables.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcDriverPay } from "../src/utils/driverPay.js";
import { buildPayroll, payrollPayment } from "../src/utils/payroll.js";
import { computeSettlement } from "../src/utils/partnerModels.js";
import { allocateCobro, accountBalances, settlementRelease, settlementPool, cobroPassThrough } from "../src/utils/profitFirst.js";

const clients = [{ id: 1, companyName: "Bocel", rules: {} }];
const partners = [
  { id: 1, name: "Com", model: "commission", companyPct: 10, fixedCharges: [{ id: 1, name: "GPS", amount: 2000, frequency: "monthly" }] },
  { id: 2, name: "ComG", model: "commission_expenses", companyPct: 10, fixedCharges: [] },
  { id: 3, name: "Rep", model: "profit_share", partnerSharePct: 60, fixedCharges: [] },
];
const trucks = [{ id: 1, plate: "PROPIO", size: "T1", partnerId: null }, { id: 2, plate: "C1", size: "T1", partnerId: 1 }, { id: 3, plate: "C2", size: "T2", partnerId: 2 }, { id: 4, plate: "C3", size: "T1", partnerId: 3 }];
const driver = { id: 1, name: "Rober", payType: "perTrip", rateSheets: [{ id: 1, name: "General", clientId: null, rates: [{ province: "Dajabón", municipality: "Dajabón", priceT1: 2000, dietaT1: 500, helperT1: 1000, priceT2: 2500, dietaT2: 600, helperT2: 1200 }] }] };
const trips = [1, 2, 3, 4].map(i => ({ id: i, date: "2026-10-05", driverId: 1, truckId: i, clientId: 1, province: "Dajabón", municipality: "Dajabón", revenue: 100000, status: "delivered", docs: { factura: true, conduce: true, pod: true }, docsReceivedAt: "2026-10-06" }));
const period = { dateFrom: "2026-10-01", dateTo: "2026-10-15", half: 1, mStr: "2026-10", label: "Oct 1–15" };
const nomPeriod = { dateFrom: "2026-09-30", dateTo: "2026-10-14", half: 1, mStr: "2026-10", label: "30 Sep–14 Oct" };

// Gastos como los crea Viajes (chofer + ayudantes por viaje) + combustible por camión
let expenses = [];
let nextId = 1;
for (const tr of trips) {
  const calc = calcDriverPay({ driver, trip: tr, truck: trucks.find(t => t.id === tr.truckId), clientId: 1 });
  expenses.push({ id: nextId++, tripId: tr.id, category: "driverPay", driverId: 1, amount: calc.driverNet, status: "pending", date: tr.date });
  expenses.push({ id: nextId++, tripId: tr.id, category: "helper", driverId: 1, amount: calc.helpersTotal, status: "pending", date: tr.date });
  expenses.push({ id: nextId++, tripId: tr.id, category: "fuel", amount: 10000, status: "paid", paidDate: tr.date, date: tr.date, chargeToPartner: true });
}

test("1. Nómina: lo que se paga = suma de calcDriverPay, una sola vez por viaje", () => {
  const payroll = buildPayroll({ period: nomPeriod, drivers: [driver], trips, trucks, clients, expenses });
  const row = payroll.drivers[0];
  assert.equal(row.tripCount, 4);
  // Dieta repartida: T1 chofer 2000+250 = 2250 ×3 ; T2 2500+200 = 2700 → 9450 ; ayudantes T1 (1000+250)×1 ×3 + T2 (1200+200)×2 = 6550
  assert.equal(row.gross, 9450); assert.equal(row.helpers, 6550); assert.equal(row.net, 9450);
  const pay = payrollPayment({ row, period: nomPeriod, expenses });
  assert.equal(pay.driverTotal, 9450);
  const driverPayExps = expenses.filter(e => e.category === "driverPay");
  assert.equal(driverPayExps.length, 4, "un gasto de chofer por viaje, nunca dos");
  assert.equal(driverPayExps.reduce((s, e) => s + e.amount, 0), row.net, "los gastos pendientes suman exactamente la nómina");
  assert.equal(new Set(driverPayExps.map(e => e.tripId)).size, 4);
});

test("2. Cobro: pass-through + Reserva + OpEx = cobro, al centavo", () => {
  const pt = cobroPassThrough({ tripIds: [1, 2, 3, 4], trips, trucks, partners, clients, brokers: [] });
  // propio 0 · comisión 90000 · com+gastos 90000 · reparto 60000
  assert.equal(pt.partner, 240000); assert.equal(pt.broker, 0);
  const pf = allocateCobro({ amount: 400000, tripIds: [1, 2, 3, 4], trips, trucks, partners, clients, brokers: [] });
  assert.equal(pf.passThrough + pf.reserve + pf.opex, 400000);
  assert.equal(pf.real, 160000); assert.equal(pf.reserve, 32000); assert.equal(pf.opex, 128000);
});

test("3. Liquidación: pool − transferido − devuelto a OpEx = 0 en los 3 modelos; gastos cargados una sola vez", () => {
  const results = partners.map(p => {
    const s = computeSettlement({ partner: p, period, trips, expenses, trucks, clients, brokers: [], drivers: [driver] });
    const rel = settlementRelease(s);
    assert.equal(rel.pool - rel.transfer - rel.released, 0, `${p.name}: nada queda sin destino ni se cuenta dos veces`);
    assert.equal(rel.releasedToReserve + rel.releasedToOpex, rel.released, `${p.name}: lo retenido se reparte completo 20/80`);
    // lo que se descuenta al socio son gastos reales, cada uno una vez
    const ids = s.expenseLines.map(e => e.id);
    assert.equal(new Set(ids).size, ids.length);
    return { p, s, rel };
  });
  const [com, comG, rep] = results;
  // Modelo 1: socio paga su operación → nada se le descuenta salvo cargos fijos. 100000 − 10000 − 2000 = 88000
  assert.equal(com.s.expensesTotal, 0); assert.equal(com.s.fixedTotal, 2000); assert.equal(com.s.toTransfer, 88000); assert.equal(com.rel.released, 2000); assert.equal(com.rel.releasedToReserve, 400); assert.equal(com.rel.releasedToOpex, 1600);
  // Modelo 2: comisión 10000 + chofer 3100 + ayudantes 2400 + combustible 10000 descontados → 74500
  assert.equal(comG.s.expensesTotal, 15500); assert.equal(comG.s.toTransfer, 74500); assert.equal(comG.rel.released, 15500); assert.equal(comG.rel.releasedToReserve, 3100);
  // Modelo 3: reembolso primero (chofer 2500 + ayudante 1000 + combustible 10000 = 13500), utilidad 86500 → socio 60 % = 51900
  assert.equal(rep.s.reimbursement, 13500); assert.equal(rep.s.net, 86500); assert.equal(rep.s.toTransfer, 51900);
  assert.equal(rep.rel.pool, 60000); assert.equal(rep.rel.released, 8100, "60 % de los gastos vuelve del pool; el otro 40 % ya era ingreso real al cobrar");
  // Identidad del modelo 3: empresa total = reembolso + 40 % de la utilidad = lo asignado al cobrar (40 % de 100k) + lo devuelto
  const empresa = rep.s.reimbursement + rep.s.companyShare;           // 13500 + 34600 = 48100
  assert.equal(empresa, 40000 + rep.rel.released);                    // 40000 + 8100 = 48100 ✓
});

test("4. Cuentas Profit First: Income = pass-through + Reserva + OpEx; OpEx entra − sale = disponible; nada doble", () => {
  // Cobro de los 4 viajes
  const pf = allocateCobro({ amount: 400000, tripIds: [1, 2, 3, 4], trips, trucks, partners, clients, brokers: [] });
  const cobros = [{ id: 1, clientId: 1, status: "collected", collectedDate: "2026-10-20", amount: 400000, collectedTripIds: [1, 2, 3, 4], pf }];
  // Nómina pagada + liquidaciones transferidas
  let exps = expenses.map(e => ["driverPay", "helper"].includes(e.category) ? { ...e, status: "paid", paidDate: "2026-10-16" } : e);
  for (const p of partners) {
    const s = computeSettlement({ partner: p, period, trips, expenses: exps, trucks, clients, brokers: [], drivers: [driver] });
    const rel = settlementRelease(s);
    exps.push({ id: nextId++, category: "partner_settlement", partnerId: p.id, settlementKey: `${p.id}-2026-10-1`, amount: rel.transfer, releasedToOpex: rel.releasedToOpex, releasedToReserve: rel.releasedToReserve, status: "paid", paidDate: "2026-11-15", date: "2026-11-15" });
  }
  const b = accountBalances({ cobros, expenses: exps });
  assert.equal(b.income, 400000);
  assert.equal(b.passThrough + (b.reserve + b.opexIn - b.passThroughReleased), 400000, "el cobro se reparte una sola vez");
  // Ingreso real total de la empresa = lo real al cobrar (160000) + lo retenido en liquidaciones (25600); Reserva = 20 % exacto
  assert.equal(b.real, 160000 + 25600);
  assert.equal(b.reserve, Math.round(b.real * 0.2));
  assert.equal(b.passThrough, 240000);
  assert.equal(b.passThroughOut, 88000 + 74500 + 51900);
  assert.equal(b.passThroughReleased, 2000 + 15500 + 8100);
  assert.equal(b.passThroughPending, 0, "después de liquidar no queda nada apartado sin destino");
  // OpEx: entró 128000 + 80 % de 25600 retenido; salió nómina 16000 + combustible 40000
  assert.equal(b.opexIn, 128000 + 25600 * 0.8);
  assert.equal(b.opexOut, 10600 + 5400 + 40000);
  assert.equal(b.opexAvailable, b.opexIn - b.opexOut);
  assert.equal(b.opexCommitted, 0);
  // Conservación total: lo que salió del banco (pass-through + OpEx pagado) + lo que queda (Reserva + OpEx disp.) = cobrado
  assert.equal(b.passThroughOut + b.opexOut + b.reserve + b.opexAvailable, 400000);
});

test("5. Un gasto cargado al socio no se cobra dos veces: sale de OpEx una vez y vuelve una vez", () => {
  const p = partners[1]; // comisión + gastos
  const s = computeSettlement({ partner: p, period, trips, expenses, trucks, clients, brokers: [], drivers: [driver] });
  const charged = s.expenseLines.reduce((a, e) => a + e.amount, 0);
  const rel = settlementRelease(s);
  assert.equal(rel.released, charged, "retiene exactamente lo que la empresa pagó, ni más ni menos");
  assert.equal(s.companyReceives, s.commission + s.reimbursement + s.fixedTotal);
  assert.equal(s.netRevenue, s.toTransfer + s.companyReceives, "ingreso del camión = lo del socio + lo de la empresa, sin sobrante");
});

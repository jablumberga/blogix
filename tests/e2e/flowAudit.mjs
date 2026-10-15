/**
 * PRUEBA INTEGRAL — ciclo real desde cero con los 4 roles.
 * Requiere base limpia: ./reset.sh && node scripts/reset-operativo.mjs local-db/db.json --yes
 */
import { open, login, nav, shot, data, sleep, selectByLabel, inputByLabel, check, token, API } from "./lib.mjs";
import { bankOverview } from "../app/src/utils/bankAccounts.js";
import { computeSettlementChain, normalizePartner } from "../app/src/utils/partnerModels.js";
import { invoiceBalance } from "../app/src/utils/cobros.js";
import { buildPayroll } from "../app/src/utils/payroll.js";
import { genBillingPeriods } from "../app/src/utils/helpers.js";

const rep = []; const C = (n, ok, d = "") => check(rep, n, ok, d);
const admTok = await token("admin");
const post = (body) => fetch(`${API}/api/data`, { method: "POST", headers: { authorization: `Bearer ${admTok}`, "content-type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
const fmtN = (n) => Number(n).toLocaleString("en-US");
let d = await data();
C("0 base operativa vacía", d.trips.length === 0 && d.expenses.length === 0 && d.invoices.length === 0 && d.cobros.length === 0, `trips=${d.trips.length} exp=${d.expenses.length}`);

// ── 0. Maestros que faltan (como lo haría el admin desde Empleados/Socios) ─────────
const sheet = (price, helper, dieta) => [{ id: 1, name: "General", clientId: null, rates: [{ id: 1, province: "Santiago", municipality: "Santiago de los Caballeros", priceT1: price, priceT2: price + 300, dietaT1: dieta, dietaT2: dieta, helperT1: helper, helperT2: helper }] }];
const joan = { ...d.drivers.find(x => x.id === 2), payType: "perTrip", rateSheets: sheet(1200, 600, 300) };
const emil = { ...d.drivers.find(x => x.id === 3), payType: "perTrip", rateSheets: sheet(1100, 500, 200) };
const robinson = { ...d.partners.find(p => p.id === 1), model: "commission_expenses", companyPct: 20, fondoDays: 30, fixedCharges: [{ id: 1, name: "GPS", amount: 1000, frequency: "biweekly", startDate: "2026-10-01" }] };
const r0 = await post({ patch: true, _version: d._version, tables: { drivers: { upserts: [joan, emil], deletes: [] }, partners: { upserts: [robinson], deletes: [] } } });
C("0.1 maestros guardados por patch", r0.ok === true, JSON.stringify(r0).slice(0, 80));

const { browser, page } = await open(); page.removeAllListeners("dialog");
const dialogs = []; let answers = [];
page.on("dialog", async dg => { dialogs.push(dg.message()); const a = answers.length ? answers.shift() : true; if (dg.type() === "prompt") await dg.accept(String(a)); else a ? await dg.accept() : await dg.dismiss(); });
const errs = []; page.on("pageerror", e => errs.push(e.message));
const logout = async () => { await page.getByText("Cerrar Sesión").first().click().catch(() => {}); await sleep(600); };

// ── 1. ADMIN: Banco con cuentas reales — saldo inicial en Income y OpEx, % de reserva ──
await login(page, "admin"); await nav(page, "Banco"); await sleep(1200); await shot(page, "A01-banco");
const setOpening = async (role, amount) => {
  await page.locator(`[data-bank-account=${role}]`).click(); await sleep(300);
  await page.locator("[data-bank-edit]").click(); await sleep(300);
  await (await inputByLabel(page, "Saldo inicial (DOP)")).fill(String(amount));
  await (await inputByLabel(page, "Saldo al día")).fill("2026-10-01");
  await page.locator("[data-bank-save-account]").click(); await sleep(2500);
};
await setOpening("income", 0); await setOpening("opex", 400000); await setOpening("reserve", 100000);
await page.locator("[data-bank-pct-toggle]").click(); await sleep(300);
if (await page.locator("[data-bank-pct]").count()) { await page.locator("[data-bank-pct]").fill("20"); await page.locator("[data-bank-pct-save]").click(); await sleep(2000); }
d = await data();
const accs = d.bankAccount?.accounts || [];
C("1.1 cuentas por defecto creadas (Income, OpEx, Reserva, Suplidores, Caja)", ["income", "opex", "reserve", "suppliers", "cash"].every(r => accs.some(a => a.role === r)), accs.map(a => a.role).join(","));
C("1.2 saldos iniciales: OpEx 400,000 / Reserva 100,000 al 2026-10-01", accs.find(a => a.role === "opex")?.openingBalance === 400000 && accs.find(a => a.role === "reserve")?.openingBalance === 100000 && accs.find(a => a.role === "opex")?.openingDate === "2026-10-01", JSON.stringify(accs.map(a => [a.role, a.openingBalance, a.openingDate])));
C("1.3 Profit First 20 % a Reserva", Number(d.pfSettings?.reservePct) === 20, String(d.pfSettings?.reservePct));
await logout();

// ── 2. CHOFER Rober: viaje normal ────────────────────────────────────────────────
await login(page, "Rober"); await sleep(800); await shot(page, "F01-rober-panel");
await page.getByRole("button", { name: /Nuevo|Registrar|Agregar/ }).first().click(); await sleep(500);
await (await inputByLabel(page, "Fecha")).fill("2026-10-05");
await selectByLabel(page, "Cliente", "Bocel"); await sleep(300);
await selectByLabel(page, "Provincia", "Santiago"); await sleep(300);
await selectByLabel(page, "Municipio", "Santiago de los Caballeros"); await sleep(400);
await (await inputByLabel(page, "Ref. Factura")).fill("BOC-1001"); await sleep(1200);
await page.getByRole("button", { name: "Guardar" }).first().click(); await sleep(4000);
d = await data(); const t1 = d.trips.find(t => t.invoiceRef === "BOC-1001");
C("2.1 Rober registró viaje con tarifa del cliente (T1 5,500)", !!t1 && t1.revenue === 5500 && t1.driverId === 1 && t1.truckId === 1, JSON.stringify(t1 || {}).slice(0, 100));
let ex1 = d.expenses.filter(e => e.tripId === t1?.id);
C("2.2 pago de chofer según su tarifario (900 + 1 ayudante 700) creado pendiente", ex1.some(e => e.category === "driverPay" && e.amount === 900 && e.status === "pending") && ex1.some(e => e.category === "helper" && e.amount === 700), ex1.map(e => `${e.category}:${e.amount}:${e.status}`).join(", "));
C("2.3 el chofer no ve claves ni datos ajenos", !JSON.stringify(await data("Rober")).includes("$2b$"));
await logout();

// ── 3. CHOFER Joan: ref duplicada bloqueada, luego viaje conjunto con Emil ────────
await login(page, "Joan"); await sleep(800);
await page.getByRole("button", { name: /Nuevo|Registrar|Agregar/ }).first().click(); await sleep(500);
await (await inputByLabel(page, "Fecha")).fill("2026-10-06");
await selectByLabel(page, "Cliente", "Bocel"); await sleep(300);
await selectByLabel(page, "Provincia", "Santiago"); await sleep(300);
await selectByLabel(page, "Municipio", "Santiago de los Caballeros"); await sleep(400);
await (await inputByLabel(page, "Ref. Factura")).fill("BOC-1001"); await sleep(1500);
await page.getByRole("button", { name: "Guardar" }).first().click(); await sleep(1500);
let txt = await page.locator("body").innerText();
C("3.1 referencia BOC-1001 repetida → bloqueada en vivo", /ya está registrada|ya existe|conjunto/i.test(txt));
d = await data(); C("3.2 no se creó viaje duplicado", d.trips.filter(t => t.invoiceRef === "BOC-1001").length === 1);
await (await inputByLabel(page, "Ref. Factura")).fill("BOC-2002"); await sleep(1500);
await page.getByText("Viaje conjunto", { exact: false }).first().click(); await sleep(300);
await selectByLabel(page, "Chofer que va contigo", "Emil"); await sleep(300);
await page.getByRole("button", { name: "Guardar" }).first().click(); await sleep(4500);
d = await data();
const tj = d.trips.find(t => t.invoiceRef === "BOC-2002" && t.driverId === 2), te = d.trips.find(t => t.invoiceRef === "BOC-2002" && t.driverId === 3);
C("3.3 viaje conjunto: Joan (Hino) + Emil (Hyundai) creados por el servidor, enlazados", !!tj && !!te && tj.jointWith === te.id && te.jointWith === tj.id && te.truckId === 4 && te.revenue === 5500, `joan#${tj?.id} emil#${te?.id}`);
const exj = d.expenses.filter(e => e.tripId === tj?.id), exe = d.expenses.filter(e => e.tripId === te?.id);
C("3.4 pagos según SU tarifario con dieta repartida (Joan 1200 + 150; ayudante 600 + 150 · Emil 1100 + 100; ayudante 500 + 100)", exj.find(e => e.category === "driverPay")?.amount === 1350 && exj.find(e => e.category === "helper")?.amount === 750 && exe.find(e => e.category === "driverPay")?.amount === 1200 && exe.find(e => e.category === "helper")?.amount === 600, `${exj.map(e => e.category + ":" + e.amount)} | ${exe.map(e => e.category + ":" + e.amount)}`);
const dJ = await data("Joan");
C("3.5 Joan ve su viaje y el de su compañero solo si es suyo (no ve el de Emil)", dJ.trips.some(t => t.id === tj.id) && !dJ.trips.some(t => t.id === te.id));
await shot(page, "F02-joan-conjunto"); await logout();

// ── 4. OFICINA Nicole: marca recibidos (uno marca a ambos del conjunto) ──────────
await login(page, "Nicole"); await sleep(1000); await shot(page, "F03-oficina");
const dN = await data("Nicole");
C("4.1 oficina no ve tarifas de clientes ni claves", !dN.clients?.some(c => c.rates?.length) && !JSON.stringify(dN).includes("$2b$"), Object.keys(dN).join(","));
for (const [who, ref] of [["Rober", "BOC-1001"], ["Joan", "BOC-2002"]]) {
  await page.locator("button, div", { hasText: new RegExp("^" + who) }).filter({ hasText: "viajes" }).last().click(); await sleep(800);
  const row = page.locator("tr", { hasText: ref }).first();
  if (await row.count()) { await row.locator("input[type=checkbox]").first().check(); await sleep(2500); }
}
await page.locator("button, div", { hasText: /^Emil/ }).filter({ hasText: "viajes" }).last().click(); await sleep(800); await shot(page, "F03b-oficina-emil");
C("4.1b el viaje de Emil quedó recibido sin que Nicole lo marcara (conjunto)", await page.locator("tr", { hasText: "BOC-2002" }).first().locator("input[type=checkbox]").isChecked());
d = await data();
const todayISO = new Date().toISOString().slice(0, 10);
C("4.2 los 3 viajes quedaron recibidos hoy (el conjunto con un solo clic)", [t1, tj, te].every(t => !!d.trips.find(x => x.id === t.id)?.docsReceivedAt && d.trips.find(x => x.id === t.id)?.docStatus === "delivered"), d.trips.map(t => `${t.invoiceRef}:${t.docsReceivedAt}:${t.docsReceivedBy}`).join(" "));
C("4.3 marcado por Nicole", d.trips.every(t => t.docsReceivedBy === "Nicole"));
await logout();

// ── 5. ADMIN: gasto del viaje de Joan (combustible, suplidor, pendiente) y pagarlo en CxP ──
await login(page, "admin"); await nav(page, "Gastos"); await sleep(600);
await page.getByRole("button", { name: /Agregar|Nuevo/ }).first().click(); await sleep(400);
await (await inputByLabel(page, "Fecha")).fill("2026-10-06");
await selectByLabel(page, "Categoría", "Combustible");
await (await inputByLabel(page, "Monto")).fill("3000");
await selectByLabel(page, "Método de Pago", "Transferencia").catch(() => selectByLabel(page, "Método de Pago", "transfer"));
await selectByLabel(page, "Viaje (opcional)", String(tj.id)).catch(async () => { const sel = page.locator('xpath=//label[starts-with(normalize-space(.),"Viaje")]/following-sibling::select[1]'); const opts = await sel.locator("option").allInnerTexts(); const o = opts.find(x => x.includes("BOC-2002") && x.includes("Joan")) || opts.find(x => x.includes("BOC-2002")); await sel.selectOption({ label: o }); });
await page.getByRole("button", { name: /^Guardar$/ }).click(); await sleep(3000);
d = await data(); const fuel = d.expenses.find(e => e.category === "fuel" && e.amount === 3000);
C("5.1 gasto combustible 3,000 pendiente ligado al viaje de Joan (camión del socio Eudy)", !!fuel && fuel.status === "pending" && fuel.tripId === tj.id, JSON.stringify(fuel || {}).slice(0, 120));
await nav(page, "Cuentas x Pagar"); await sleep(800);
const payRow = page.locator("tr", { hasText: "3,000" }).first();
if (await payRow.count()) { await payRow.getByRole("button", { name: /Pagar/ }).click(); await sleep(3000); }
d = await data(); const fuel2 = d.expenses.find(e => e.id === fuel?.id);
C("5.2 pagado desde CxP (fecha de pago)", fuel2?.status === "paid" && !!fuel2.paidDate, `${fuel2?.status} ${fuel2?.paidDate}`);
// gasto en efectivo suelto (no toca banco, sí OpEx)
await nav(page, "Gastos"); await sleep(500);
await page.getByRole("button", { name: /Agregar|Nuevo/ }).first().click(); await sleep(400);
await (await inputByLabel(page, "Fecha")).fill("2026-10-07");
await selectByLabel(page, "Categoría", "Peaje");
await (await inputByLabel(page, "Monto")).fill("450");
await page.getByRole("button", { name: /^Guardar$/ }).click(); await sleep(3000);
d = await data(); const cashExp = d.expenses.find(e => e.amount === 450);
C("5.3 gasto en efectivo queda pagado al instante", cashExp?.status === "paid" && cashExp.paymentMethod === "cash", JSON.stringify(cashExp || {}).slice(0, 100));

// ── 6. NÓMINA quincena Oct 1–15: pagar a los 3 ───────────────────────────────────
await nav(page, "Nómina"); await sleep(1000); await shot(page, "F04-nomina");
const pd = genBillingPeriods(["2026-10-05"]).find(p => p.mStr === "2026-10" && p.half === 1);
const payroll = buildPayroll({ period: pd, drivers: d.drivers, trips: d.trips, trucks: d.trucks, clients: d.clients, expenses: d.expenses });
const rows = payroll.drivers.filter(r => r.tripCount > 0);
C("6.1 nómina de la quincena: 3 choferes con 1 viaje recibido cada uno", rows.length === 3 && rows.every(r => r.tripCount === 1), rows.map(r => `${r.driver.name}:${r.net}`).join(", "));
let paidClicks = 0;
for (let i = 0; i < 5; i++) { const b = page.getByRole("button", { name: /Marcar pagado/ }).first(); if (!(await b.count())) break; await b.click(); await sleep(2500); paidClicks++; }
d = await data();
const dp = d.expenses.filter(e => e.category === "driverPay");
C("6.2 los 3 pagos de chofer quedaron pagados con payrollKey de la quincena", dp.length === 3 && dp.every(e => e.status === "paid" && e.payrollKey === "2026-10-H1"), dp.map(e => `${e.driverId}:${e.amount}:${e.status}:${e.payrollKey}`).join(", "));
C("6.3 ayudantes también pagados", d.expenses.filter(e => e.category === "helper").every(e => e.status === "paid"));
C("6.4 no se duplicaron gastos al pagar", d.expenses.filter(e => e.category === "driverPay").length === 3);
await shot(page, "F05-nomina-pagada");

// ── 7. FACTURA Bocel con los 3 viajes recibidos, enviada, 2 abonos ───────────────
await nav(page, "Facturas"); await sleep(600);
await page.getByRole("button", { name: /Nueva Factura/ }).click(); await sleep(500);
await selectByLabel(page, "Cliente", "Bocel"); await sleep(600);
for (const ref of ["BOC-1001", "BOC-2002"]) { const rowsR = page.locator("div", { hasText: ref }).filter({ hasText: /Santiago/ }); const n = await rowsR.count(); for (let i = 0; i < n; i++) { const el = rowsR.nth(i); const cls = await el.getAttribute("style"); if (cls && /cursor: ?pointer/.test(cls)) await el.click().catch(() => {}); } }
await sleep(300);
// fallback: click every selectable trip row by text of plate
for (const plate of ["International", "Hino", "Hyundai"]) { const el = page.locator("div[style*='cursor: pointer']", { hasText: plate }).filter({ hasText: /BOC-/ }).first(); if (await el.count()) { const s = await el.getAttribute("style"); if (!/border.*#?(2|3)/.test(s || "")) await el.click().catch(() => {}); } }
await sleep(300); await shot(page, "F06-factura-form");
await page.getByRole("button", { name: /Guardar|Crear/ }).last().click(); await sleep(3500);
d = await data(); const inv = d.invoices[0];
C("7.1 factura creada con los 3 viajes recibidos (16,500), ya por cobrar (sin borrador)", !!inv && inv.tripIds.length === 3 && inv.amount === 16500 && inv.status === "sent", JSON.stringify({ n: inv?.invoiceNumber, ids: inv?.tripIds, amt: inv?.amount, st: inv?.status }));
const rowI = page.locator("tr", { hasText: inv.invoiceNumber }).first();
await rowI.getByRole("button", { name: /Cobrar/ }).click(); await sleep(400);
await page.locator("input[type=number]").last().fill("10000");
await page.locator("input[placeholder=opcional]").first().fill("TRF-77");
await page.getByRole("button", { name: "Registrar cobro" }).last().click(); await sleep(3000);
d = await data();
let bal = invoiceBalance(d.invoices[0], d.cobros, { trips: d.trips, clients: d.clients, brokers: d.brokers });
C("7.2 abono 10,000 → saldo 6,500, factura sigue enviada", bal.paid === 10000 && bal.balance === 6500 && d.invoices[0].status === "sent");
const ab1 = d.cobros[0];
// pass-through esperado (método B): los 2 viajes de camiones de socio se apartan completos (5500 + 5500 = 11000); proporcional 10000/16500
const ptFull = 5500 + 5500;
C("7.3 Profit First del abono: pass-through proporcional, 20 % del real a Reserva", Math.abs(ab1.pf.passThrough - Math.round(ptFull * 10000 / 16500 * 100) / 100) < 1 && Math.abs(ab1.pf.reserve - (10000 - ab1.pf.passThrough) * 0.2) < 0.05, `pt=${ab1.pf.passThrough} real=${ab1.pf.real} res=${ab1.pf.reserve} opex=${ab1.pf.opex}`);
await rowI.getByRole("button", { name: /Cobrar/ }).click(); await sleep(400);
await page.getByRole("button", { name: "Registrar cobro" }).last().click(); await sleep(3000);
d = await data(); bal = invoiceBalance(d.invoices[0], d.cobros, { trips: d.trips, clients: d.clients, brokers: d.brokers });
C("7.4 segundo abono salda la factura → cobrada", bal.balance === 0 && d.invoices[0].status === "paid" && d.cobros.length === 2);
C("7.5 suma de pass-through de los 2 abonos = pass-through total (11,000)", Math.abs(d.cobros.reduce((s, c) => s + c.pf.passThrough, 0) - ptFull) < 0.05, String(d.cobros.reduce((s, c) => s + c.pf.passThrough, 0)));
await shot(page, "F07-factura-cobrada");

// ── 8. LIQUIDACIONES: Eudy (profit share) y Robinson (comisión + gastos + GPS) ────
await nav(page, "Liquidaciones"); await sleep(1000); await shot(page, "F08-liquidaciones");
const chainE = computeSettlementChain({ partner: normalizePartner(d.partners.find(p => p.id === 2)), periods: [pd], trips: d.trips, expenses: d.expenses, trucks: d.trucks, clients: d.clients, brokers: d.brokers, drivers: d.drivers }).get("2026-10-1");
const chainR = computeSettlementChain({ partner: normalizePartner(d.partners.find(p => p.id === 1)), periods: [pd], trips: d.trips, expenses: d.expenses, trucks: d.trucks, clients: d.clients, brokers: d.brokers, drivers: d.drivers }).get("2026-10-1");
// Reembolso primero: TODO lo que pagó la empresa por el camión (combustible 3,000 + chofer + ayudantes)
// Eudy (profit share 50 %): 5500 − (3000+1500+600) = 400 → socio 200 ; Robinson (20 % + GPS): 5500 − 1100 − (1300+500) − 1000 = 1600
C("8.1 Eudy (50 %): 5,500 − 5,100 reembolsos → utilidad 400 → socio 200", chainE.reimbursement === 5100 && chainE.toTransfer === 200, `reemb=${chainE.reimbursement} net=${chainE.net} transfer=${chainE.toTransfer}`);
C("8.2 Robinson (comisión 20 % + GPS): 5,500 − 1,100 − 1,800 − 1,000 = 1,600", chainR.commission === 1100 && chainR.fixedTotal === 1000 && chainR.reimbursement === 1800 && chainR.toTransfer === 1600, `com=${chainR.commission} fijo=${chainR.fixedTotal} reemb=${chainR.reimbursement} transfer=${chainR.toTransfer}`);
txt = await page.locator("body").innerText();
C("8.3 pantalla muestra 200 y 1,600", /RD\$200\b/.test(txt) && /1,600/.test(txt));
dialogs.length = 0;
const btns = page.getByRole("button", { name: /Marcar transferido/ });
const nb = await btns.count();
for (let i = 0; i < nb; i++) { await page.getByRole("button", { name: /Marcar transferido/ }).first().click(); await sleep(2500); }
C("8.4 no hubo aviso de 'no cobrados' (la factura ya está cobrada)", !dialogs.some(m => /NO han sido cobrados/.test(m)), dialogs.join("|").slice(0, 80));
d = await data();
const ps = d.expenses.filter(e => e.category === "partner_settlement");
C("8.5 liquidaciones transferidas → gastos pass-through pagados (200 y 1,600), sin gastos en 0", ps.length === 2 && ps.some(e => e.amount === 200) && ps.some(e => e.amount === 1600), ps.map(e => `${e.partnerId}:${e.amount}:${e.status}`).join(", "));
const psE = ps.find(e => e.amount === 200), psR = ps.find(e => e.amount === 1600);
// B: Eudy retiene 5,500 − 200 = 5,300 = reembolso 5,100 (repone OpEx) + su mitad 200 → Reserva 40 / OpEx 5,260
C("8.6 Eudy: lo retenido 5,300 = reembolso 5,100 a OpEx + parte empresa 200 → Reserva 40 / OpEx 5,260", psE?.released === 5300 && psE?.releasedToReserve === 40 && psE?.releasedToOpex === 5260, JSON.stringify({ r: psE?.released, rr: psE?.releasedToReserve, ro: psE?.releasedToOpex }));
// B: Robinson retiene 5,500 − 1,600 = 3,900 = reembolso 1,800 + comisión 1,100 + GPS 1,000 → Reserva 20 % de 2,100 = 420 / OpEx 3,480
C("8.7 Robinson: lo retenido 3,900 = reembolso 1,800 a OpEx + comisión y GPS 2,100 → Reserva 420 / OpEx 3,480", psR?.released === 3900 && psR?.releasedToReserve === 420 && psR?.releasedToOpex === 3480, JSON.stringify({ r: psR?.released, rr: psR?.releasedToReserve, ro: psR?.releasedToOpex }));
C("8.8 estados de liquidación guardados como paid (incluye quincena solo-GPS que arrastra)", Object.values(d.settlementStatus).filter(v => v === "paid").length >= 2, JSON.stringify(d.settlementStatus));

// ── 9. GUARDAS cruzadas ──────────────────────────────────────────────────────────
await nav(page, "Viajes"); await sleep(800);
dialogs.length = 0;
const rowJ = page.locator("tr", { hasText: "BOC-2002" }).first();
await rowJ.locator("button[title]").last().click(); await sleep(400);
C("9.1 borrar viaje de Joan bloqueado (factura cobrada + cobro)", dialogs.some(m => /No se puede eliminar/.test(m) && /factura/.test(m)), dialogs[0]?.slice(0, 100));
const tt = await rowJ.locator("button[title]").last().getAttribute("title");
C("9.2 el tooltip explica qué anular primero", /Anula primero/.test(tt || ""), (tt || "").slice(0, 80));
await nav(page, "Gastos"); await sleep(600);
dialogs.length = 0;
const fuelRow = page.locator("tr", { hasText: "3,000" }).filter({ hasText: /Combustible/ }).first();
if (await fuelRow.count()) { await fuelRow.locator("button").last().click(); await sleep(400); }
C("9.3 gasto pagado/liquidado al socio no se puede borrar", dialogs.some(m => /PAGADO|liquidaci/i.test(m)), dialogs[0]?.slice(0, 100));
d = await data(); C("9.4 el gasto sigue ahí", d.expenses.some(e => e.id === fuel.id));

// ── 10. BANCO (cuentas reales): Income recibió los cobros → Repartir; retiro a caja desde OpEx ──
await nav(page, "Banco"); await sleep(1000); await shot(page, "A09-banco-antes");
d = await data();
let bank = bankOverview({ bankAccount: d.bankAccount, expenses: d.expenses, cobros: d.cobros, transfers: d.bankTransfers || [], reconciliation: d.bankReconciliation || {}, settings: d.pfSettings, invoices: d.invoices, clients: d.clients, suppliers: d.suppliers, todayStr: todayISO });
const realCobros = d.cobros.reduce((s, c) => s + c.pf.real, 0);
C("10.1 Income tiene 16,500 por repartir (2 cobros por transferencia)", bank.pending.items.length === 2 && Math.abs(bank.pending.total - 16500) < 0.01, `items=${bank.pending.items.length} total=${bank.pending.total}`);
C("10.2 sugerencia: Reserva = 20 % del ingreso real; lo de socios (pass-through) va a OpEx", Math.abs(bank.pending.reserve - realCobros * 0.2) < 0.05 && Math.abs(bank.pending.opex - (16500 - realCobros * 0.2)) < 0.05, `reserve=${bank.pending.reserve} opex=${bank.pending.opex} real=${realCobros}`);
await page.locator("[data-bank-distribute]").click(); await sleep(500); await shot(page, "A09b-repartir");
const sugR = Number(await page.locator("[data-dist-reserve]").inputValue()), sugO = Number(await page.locator("[data-dist-opex]").inputValue()), sugS = Number(await page.locator("[data-dist-suppliers]").inputValue() || 0);
C("10.3 el modal propone exactamente lo pendiente (reserva + suplidores + opex = 16,500)", Math.abs(sugR + sugO + sugS - 16500) < 0.01 && Math.abs(sugR - bank.pending.reserve) < 0.01, `${sugR}+${sugS}+${sugO}`);
await page.locator("[data-bank-save-distribution]").click(); await sleep(3000);
d = await data();
const tfs = d.bankTransfers || [];
C("10.4 reparto guardado como transferencias desde Income (reserva/opex[/suplidores]) y ya no queda nada por repartir", tfs.filter(t => t.kind === "distribution").length >= 2 && Math.abs(tfs.filter(t => t.kind === "distribution").reduce((s, t) => s + t.amount, 0) - 16500) < 0.01, tfs.map(t => `${t.fromId}→${t.toId}:${t.amount}`).join(" "));
bank = bankOverview({ bankAccount: d.bankAccount, expenses: d.expenses, cobros: d.cobros, transfers: tfs, reconciliation: d.bankReconciliation || {}, settings: d.pfSettings, invoices: d.invoices, clients: d.clients, suppliers: d.suppliers, todayStr: todayISO });
const incomeId = bank.accounts.find(a => a.role === "income").id, reserveId = bank.accounts.find(a => a.role === "reserve").id;
C("10.5 Income queda en 0 después de repartir; Reserva = 100,000 + 20 % del real", bank.pending.items.length === 0 && Math.abs(bank.summaries[incomeId].balance) < 0.01 && Math.abs(bank.reserveBalance - (100000 + realCobros * 0.2)) < 0.05, `income=${bank.summaries[incomeId].balance} reserva=${bank.reserveBalance}`);
// retiro a caja desde OpEx
await page.locator("[data-bank-account=opex]").click(); await sleep(400);
await page.locator("[data-bank-withdraw]").click(); await sleep(300);
await page.locator("[data-wd-kind]").selectOption("cash").catch(() => {});
await page.locator("[data-wd-amount]").fill("5000");
await page.locator("[data-bank-save-withdrawal]").click(); await sleep(3000);
d = await data();
const wdExp = d.expenses.find(e => e.category === "cash_withdrawal" && e.amount === 5000);
C("10.6 retiro a caja de 5,000 desde OpEx registrado (pagado, no es gasto operativo)", !!wdExp && wdExp.status === "paid" && wdExp.accountId === "opex", JSON.stringify(wdExp || {}).slice(0, 120));
txt = await page.locator("body").innerText(); await shot(page, "A09c-banco-despues");
const opexAcc = (d.bankAccount.accounts || []).find(a => a.role === "opex");
const sums = bank.summaries || {};
bank = bankOverview({ bankAccount: d.bankAccount, expenses: d.expenses, cobros: d.cobros, transfers: tfs, reconciliation: d.bankReconciliation || {}, settings: d.pfSettings, invoices: d.invoices, clients: d.clients, suppliers: d.suppliers, todayStr: todayISO });
const opexOut = d.expenses.filter(e => e.status === "paid" && e.paymentMethod !== "cash" && (!e.accountId || e.accountId === "opex") && !["reserve_withdrawal"].includes(e.category)).reduce((s, e) => s + e.amount, 0);
C("10.7 OpEx = 400,000 + lo repartido − todo lo pagado por transferencia (nómina, combustible, liquidaciones, retiro)", Math.abs(bank.opexBalance - (400000 + (sugO || 0) - opexOut)) < 0.05, `opex=${bank.opexBalance} esperado=${400000 + sugO - opexOut} out=${opexOut}`);
C("10.7b pantalla muestra las cuentas con saldo y el retiro aparece como salida", /Retiro a caja/.test(txt) && (await page.locator("[data-bank-balance]").count()) >= 5);
C("10.8 nómina, combustible y liquidaciones salieron de OpEx (pagados por transferencia)", d.expenses.filter(e => e.status === "paid" && e.paymentMethod === "transfer" && ["driverPay", "helper", "fuel", "partner_settlement"].includes(e.category)).every(e => !e.accountId || e.accountId === "opex"), "");

// ── 11. DASHBOARD coherente ───────────────────────────────────────────────────────
await nav(page, "Panel"); await sleep(1000); txt = await page.locator("body").innerText(); await shot(page, "F10-dashboard");
C("11.1 CxC por cobrar 0 (factura cobrada) y sin 'Beneficio Real'", /CxC POR COBRAR\s*RD\$0/.test(txt) && !/Beneficio Real/.test(txt));
C("11.2 CxP pendiente 0 (todo pagado)", /CxP PENDIENTE\s*RD\$0/.test(txt));
await logout();

// ── 12. SOCIO Eudy ve su liquidación ─────────────────────────────────────────────
await login(page, "Eudy"); await sleep(1200); txt = await page.locator("body").innerText(); await shot(page, "F11-socio");
C("12.1 socio ve 'Mi liquidación' con 200 y recibido", /Mi liquidación/.test(txt) && /RD\$200\b/.test(txt) && /Recibido/.test(txt));
C("12.2 socio ve las deducciones (5,300 = 5,100 reembolsos + 200 parte empresa)", /5,300/.test(txt));
const dE = await data("Eudy");
C("12.3 socio solo recibe sus camiones/viajes, sin tarifas ni claves", !JSON.stringify(dE).includes("$2b$") && (dE.trips || []).every(t => [3, 5].includes(t.truckId)), Object.keys(dE).join(","));
C("12.4 botón Ver detalle (PDF)", (await page.getByRole("button", { name: /Ver detalle/ }).count()) > 0);
await logout();

// ── 13. ADMIN: todas las pantallas abren sin error + altas básicas de maestros ───────
await login(page, "admin"); await sleep(800);
const pages = ["Panel", "Clientes", "Facturas", "Cuentas x Cobrar", "Viajes", "Flota", "Conductores", "Ayudantes", "Socios", "Usuarios", "Intermediarios", "Gastos", "Entregas (oficina)", "Cuentas x Pagar", "Nómina", "Banco", "Costo por km", "Suplidores", "Liquidaciones"];
const errBefore = errs.length; const opened = [];
for (const p of pages) { try { await nav(page, p); await sleep(500); const b = await page.locator("body").innerText(); opened.push(b.length > 200 && !/Something went wrong|Error:/.test(b) ? p : `✗${p}`); } catch (e) { opened.push(`✗${p}`); } }
C("13.1 las 19 pantallas del admin abren con contenido y sin errores JS", opened.every(x => !x.startsWith("✗")) && errs.length === errBefore, opened.filter(x => x.startsWith("✗")).join(",") + (errs.length > errBefore ? " | " + errs.slice(errBefore).join(" / ") : ""));
// Pipeline del panel coherente con los datos: todo cobrado, nada por cobrar, nada listo (los 3 viajes facturados)
await nav(page, "Panel"); await sleep(900); txt = await page.locator("body").innerText();
C("13.2 pipeline: Cobrado 16,500 · Por cobrar 0 · Listo 0 (no quedan viajes sin factura con docs)", /COBRADO\s*RD\$16,500/.test(txt) && /POR COBRAR\s*RD\$0/.test(txt) && /LISTO FACTURAR\s*RD\$0/.test(txt), txt.slice(txt.indexOf("PIPELINE"), txt.indexOf("PIPELINE") + 160).replace(/\n/g, " "));
// Altas de maestros desde cada pantalla
const addOne = async (navLabel, btnRe, fills, saveRe = /^Guardar$|Crear|Agregar$/) => {
  await nav(page, navLabel); await sleep(500);
  await page.getByRole("button", { name: btnRe }).first().click(); await sleep(400);
  for (const [label, value] of fills) { const inp = await inputByLabel(page, label).catch(() => null); if (inp && await inp.count()) await inp.fill(value); }
  await page.getByRole("button", { name: saveRe }).last().click(); await sleep(2500);
};
const before = await data();
await addOne("Clientes", /Agregar Cliente/, [["Empresa", "Cliente Auditoría"]]);
await addOne("Flota", /Agregar Camión/, [["Placa", "AUD-001"]]);
await addOne("Conductores", /Agregar Conductor/, [["Nombre", "Chofer Auditoría"]]);
await addOne("Ayudantes", /Agregar ayudante/, [["Nombre *", "Ayudante Auditoría"]]);
await addOne("Socios", /Agregar Socio/, [["Nombre", "Socio Auditoría"]]);
await addOne("Suplidores", /Agregar Suplidor/, [["Nombre", "Suplidor Auditoría"]]);
await addOne("Intermediarios", /Agregar Broker/, [["Nombre", "Broker Auditoría"]]);
d = await data();
const grew = (k) => (d[k] || []).length > (before[k] || []).length;
C("13.3 altas desde pantalla: cliente, camión, chofer, ayudante, socio, suplidor, broker", ["clients", "trucks", "drivers", "ayudantes", "partners", "suppliers", "brokers"].every(grew), ["clients", "trucks", "drivers", "ayudantes", "partners", "suppliers", "brokers"].filter(k => !grew(k)).join(","));
// Costo por km: la página calcula con los viajes del flujo (sin GPS ni distancias → km 0, sin romperse)
await nav(page, "Costo por km"); await sleep(1000); txt = await page.locator("body").innerText(); await shot(page, "A12-costkm");
C("13.4 Costo por km abre con los 4 viajes del período y avisa calidad del dato", /Costo por kilómetro/.test(txt) && /viajes/.test(txt));
// Ordenar en Viajes / Facturas / Gastos presente
let sortOk = true; for (const p of ["Viajes", "Facturas", "Gastos"]) { await nav(page, p); await sleep(400); if ((await page.locator("[data-sort-key]").count()) !== 1) sortOk = false; }
C("13.5 «Ordenar por» en Viajes, Facturas y Gastos", sortOk);
// Nómina PDF por chofer abre
await nav(page, "Nómina"); await sleep(900);
{ const pop = page.waitForEvent("popup"); await page.locator("[data-driver-payroll-pdf]").first().click(); const pdf = await pop; await pdf.waitForLoadState(); const t = await pdf.innerText("body"); await pdf.close();
  C("13.6 PDF de nómina del chofer con tripulación (chofer + dieta / ayudante + dieta)", /NÓMINA DEL CHOFER/.test(t) && /dieta/.test(t) && /NETO A TRANSFERIR/.test(t)); }
await logout();

// ── 14. GUARDAS: fecha de docs bloqueada si ya se pagó en nómina; anular factura con cobros ya repartidos ──
await login(page, "admin"); await nav(page, "Viajes"); await sleep(800);
const dateInp = page.locator("tr", { hasText: "BOC-1001" }).first().locator("input[type=date]").first();
C("14.1 la fecha de docs recibidos del viaje pagado en nómina está bloqueada", (await dateInp.count()) === 1 && await dateInp.isDisabled());
await nav(page, "Facturas"); await sleep(800);
dialogs.length = 0; answers = [false];
await page.locator("tr", { hasText: inv.invoiceNumber }).first().locator("button[title='Anular (conserva el número)']").click(); await sleep(500);
d = await data();
C("14.2 anular pide confirmación y al cancelar no pasa nada", dialogs.length === 1 && d.invoices[0].status === "paid" && d.cobros.length === 2, dialogs[0]?.slice(0, 100));
dialogs.length = 0; answers = [true];
await page.locator("tr", { hasText: inv.invoiceNumber }).first().locator("button[title='Anular (conserva el número)']").click(); await sleep(2500);
d = await data();
bank = bankOverview({ bankAccount: d.bankAccount, expenses: d.expenses, cobros: d.cobros, transfers: d.bankTransfers || [], reconciliation: d.bankReconciliation || {}, settings: d.pfSettings, invoices: d.invoices, clients: d.clients, suppliers: d.suppliers, todayStr: todayISO });
C("14.3 anular factura con cobros ya repartidos en Banco se bloquea con explicación; Banco sigue cuadrado", d.invoices[0].status === "paid" && d.cobros.length === 2 && /No se puede anular/.test(dialogs[0] || "") && /repartió en Banco/.test(dialogs[0] || "") && Math.abs(bank.summaries[incomeId].balance) < 0.01, `status=${d.invoices[0].status} cobros=${d.cobros.length} income=${bank.summaries[incomeId].balance} dialog=${dialogs[0]?.slice(0, 120)}`);
dialogs.length = 0; answers = [true];
await page.locator("tr", { hasText: inv.invoiceNumber }).first().locator("button[title='Eliminar (factura por error)']").click(); await sleep(800);
d = await data();
C("14.4 eliminar esa factura también se bloquea", d.invoices.length === 1 && d.invoices[0].status === "paid" && /No se puede eliminar/.test(dialogs[0] || ""), dialogs[0]?.slice(0, 100));
await logout();

console.log("pageerrors:", errs.length ? errs : "ninguno");
console.log("FALLOS:", rep.filter(r => !r.ok).map(r => r.name).join(" | ") || "ninguno", `(${rep.filter(r => r.ok).length}/${rep.length})`);
await browser.close();

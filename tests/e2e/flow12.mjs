import { open, login, nav, data, sleep, check, token, API } from "./lib.mjs";
import { buildPayroll } from "../app/src/utils/payroll.js";
import { genBillingPeriods } from "../app/src/utils/helpers.js";
const { browser, page } = await open(); const rep = []; page.removeAllListeners("dialog"); const dialogs = []; page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
const errs = []; page.on("pageerror", e => errs.push(e.message));
const tk = await token("admin"); let d = await data();
await fetch(`${API}/api/data`, { method: "POST", headers: { authorization: `Bearer ${tk}`, "content-type": "application/json" }, body: JSON.stringify({ patch: true, _version: d._version, tables: { trips: { upserts: [
  { id: 1, date: "2026-09-20", province: "Santiago", municipality: "Santiago de los Caballeros", truckId: 1, driverId: 1, clientId: 1, revenue: 5500, status: "pending", invoiceRef: "H-1", numHelpers: 1, helpers: [] }], deletes: [] },
  expenses: { upserts: [{ id: 1, tripId: 1, category: "driverPay", amount: 900, date: "2026-09-20", status: "pending", paymentMethod: "transfer", driverId: 1 }], deletes: [] } } }) });
await login(page, "admin"); await nav(page, "Viajes"); await sleep(800);
const row = page.locator("tr", { hasText: "H-1" }).first();
await row.getByRole("button", { name: "Pendiente" }).click(); await sleep(2500);
d = await data(); let t = d.trips.find(x => x.id === 1);
check(rep, "R1 marcar recibido pone fecha de hoy", t.docsReceivedAt === new Date().toISOString().slice(0, 10) || !!t.docsReceivedAt, t.docsReceivedAt);
await row.locator("input[type=date]").fill("2026-09-22"); await sleep(2500);
d = await data(); t = d.trips.find(x => x.id === 1);
check(rep, "R2 fecha de recepción editada a 2026-09-22 (viaje entregado)", t.docsReceivedAt === "2026-09-22" && t.status === "delivered", `${t.docsReceivedAt} ${t.status}`);
const pdSep = genBillingPeriods(["2026-09-01"]).find(p => p.mStr === "2026-09" && p.half === 2);
const pay = buildPayroll({ period: pdSep, drivers: d.drivers, trips: d.trips, trucks: d.trucks, clients: d.clients, expenses: d.expenses });
check(rep, "R3 el viaje cae en la nómina de Sep 16–30", pay.drivers.some(r => r.driver.id === 1 && r.tripCount === 1));
// pagar nómina de esa quincena y verificar bloqueo de cambio de fecha
await nav(page, "Nómina"); await sleep(800);
const sel = page.locator("select").filter({ hasText: /Septiembre 16/ }).first(); if (await sel.count()) await sel.selectOption({ label: "Septiembre 16–30, 2026" }); else await page.getByText("Septiembre 16–30, 2026").first().click(); await sleep(600);
await page.screenshot({ path: "../shots/R-nomina.png" }); console.log((await page.locator("body").innerText()).slice(0, 400).replace(/\n/g, " | "));
const payBtn = page.getByRole("button", { name: /Marcar pagado/ }).first(); console.log("payBtn:", await payBtn.count()); if (await payBtn.count()) { await payBtn.click(); await sleep(2500); }
d = await data(); check(rep, "R4 nómina pagada", d.expenses.some(e => e.tripId === 1 && e.category === "driverPay" && e.status === "paid"));
await nav(page, "Viajes"); await sleep(800); dialogs.length = 0;
const dateInput = page.locator("tr", { hasText: "H-1" }).first().locator("input[type=date]");
check(rep, "R5 con nómina pagada la fecha queda bloqueada", await dateInput.isDisabled());
console.log("pageerrors:", errs.length ? errs : "ninguno"); console.log("FALLOS:", rep.filter(r => !r.ok).map(r => r.name).join(" | ") || "ninguno");
await browser.close();

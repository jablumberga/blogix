import { open, login, nav, sleep, data, check, shot } from "./lib.mjs";
const { browser, page } = await open();
const rep = []; const C = (n, ok, d) => check(rep, n, ok, d);
// Admin: Nómina oct 1-15 → Leury
await login(page, "Camille"); await nav(page, "Nómina"); await sleep(900);
const sel = page.locator("select").first();
const opts = await sel.locator("option").allTextContents(); console.log("periodos:", opts.slice(0, 4).join(" | "));
const idx = opts.findIndex(o => /2026-10 1[–-]15|1[–-]15 oct|Oct.*1.*15/i.test(o)); if (idx >= 0) await sel.selectOption(String(idx)); await sleep(700);
const card = page.locator("div", { hasText: /^Leury/ }).locator("xpath=ancestor::*[contains(@style,'border-left')][1]").first();
const txt = (await page.locator("body").innerText());
const leuryBlock = txt.slice(txt.indexOf("Leury"), txt.indexOf("Leury") + 700);
console.log(leuryBlock.replace(/\n+/g, " | "));
C("1.1 Leury: adelanto chofer 343.33 restado (bruto 1,900 → 1,556.67)", /1,556\.67/.test(leuryBlock) && /adelantos\s*−\s*RD\$343/.test(leuryBlock), leuryBlock.slice(0, 200));
C("1.2 Leury: ayudantes 3,000 − adelantos 686.66 = 2,313.34", /2,313\.34/.test(leuryBlock) && /686\.66/.test(leuryBlock));
await shot(page, "ADV01-nomina-leury");
// Marcar pagado → Banco neto
const before = await data("Camille");
const btn = page.locator("button", { hasText: /Marcar pagado/ }).filter({ hasText: /3,870/ }).first();
C("1.3 botón 'Marcar pagado' con el total neto (1,556.67 + 2,313.34 = 3,870.01)", (await btn.count()) === 1, String(await page.locator("button", { hasText: /Marcar pagado/ }).allTextContents()));
if (await btn.count()) { await btn.click(); await sleep(2500); }
const d = await data("Camille");
const dp = d.expenses.find(e => e.category === "driverPay" && e.tripId === 6), hp = d.expenses.find(e => e.category === "helper" && e.tripId === 6);
const adv = d.expenses.filter(e => [123, 124, 125].includes(e.id));
C("1.4 driverPay del viaje 6 pagado 1,900 con advanceApplied 343.33; helper 3,000 con 686.66", dp?.status === "paid" && Math.abs(dp.advanceApplied - 343.33) < 0.01 && hp?.status === "paid" && Math.abs(hp.advanceApplied - 686.66) < 0.01, JSON.stringify([dp?.amount, dp?.advanceApplied, hp?.amount, hp?.advanceApplied]));
C("1.5 los 3 adelantos quedan amarrados a la nómina 2026-10-H1 de Leury", adv.every(e => e.payrollKey === "2026-10-H1" && e.appliedDriverId === 9), JSON.stringify(adv.map(e => [e.id, e.payrollKey, e.appliedDriverId])));
// Chofer: Mi nómina
await page.getByRole("button", { name: /Cerrar sesi|Salir/ }).first().click().catch(() => {}); await sleep(500);
await login(page, "Leury"); await sleep(1200);
const dt = await page.locator("body").innerText();
await shot(page, "ADV02-leury-panel");
C("2.1 Leury ve su quincena con neto 1,556.67 y ayudantes 2,313.34 pagados", /1,556\.67/.test(dt) && /2,313\.34/.test(dt) && /Pagado/.test(dt), dt.slice(dt.indexOf("Neto a recibir") - 120, dt.indexOf("Neto a recibir") + 60).replace(/\n/g, " | "));
const dt2 = dt;
C("2.2 Leury ve los 3 adelantos (chofer + ayudantes) del viaje a Samaná", (dt2.match(/343\.33/g) || []).length >= 3 && /Adelantos recibidos/i.test(dt2), String((dt2.match(/343\.33/g) || []).length));
console.log("FALLOS:", rep.filter(r => !r.ok).map(r => r.name).join(" | ") || "ninguno", `(${rep.filter(r => r.ok).length}/${rep.length})`);
await browser.close();

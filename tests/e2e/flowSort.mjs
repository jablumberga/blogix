import { open, login, nav, shot, sleep, check } from "./lib.mjs";
const { browser, page } = await open(); const rep = []; const errs = []; page.on("pageerror", e => errs.push(e.message));
await login(page, "admin");
const firstCells = async (col) => page.locator("table tbody tr").evaluateAll((trs, col) => trs.slice(0, 5).map(tr => tr.children[col]?.innerText.trim()), col);
const setSort = async (key) => { await page.locator("[data-sort-key]").selectOption(key); await sleep(400); };
const flip = async () => { await page.locator("[data-sort-dir]").click(); await sleep(400); };
// Viajes
await nav(page, "Viajes"); await sleep(1000); await shot(page, "SORT01-viajes");
let dates = await page.locator("table tbody tr").evaluateAll(trs => trs.slice(0, 50).map(tr => tr.innerText));
check(rep, "Viajes: barra de orden visible", (await page.locator("[data-sort-key]").count()) === 1);
const d1 = await page.locator("table tbody tr td:nth-child(1)").allInnerTexts();
check(rep, "Viajes: por defecto fecha desc", d1.length > 5 && d1[0] >= d1[d1.length - 1], `${d1[0]} … ${d1[d1.length - 1]}`);
await setSort("revenue"); const r1 = (await page.locator("table tbody tr").allInnerTexts()).slice(0, 3);
check(rep, "Viajes: por flete desc pone 45,000 primero", /45,000/.test(r1[0]), r1[0]?.replace(/\n/g, " ").slice(0, 80));
await flip(); const r2 = (await page.locator("table tbody tr").allInnerTexts()).slice(0, 1);
check(rep, "Viajes: flete asc pone 2,400 primero", /2,400/.test(r2[0]), r2[0]?.replace(/\n/g, " ").slice(0, 80));
await setSort("id"); await shot(page, "SORT02-viajes-id");
// Facturas
await nav(page, "Facturas"); await sleep(800);
check(rep, "Facturas: barra de orden visible", (await page.locator("[data-sort-key]").count()) === 1);
await setSort("invoiceNumber"); await shot(page, "SORT03-facturas");
// Gastos
await nav(page, "Gastos"); await sleep(800);
check(rep, "Gastos: barra de orden visible", (await page.locator("[data-sort-key]").count()) === 1);
await setSort("amount"); const g1 = (await page.locator("table tbody tr").allInnerTexts()).slice(0, 1);
check(rep, "Gastos: monto desc pone 11,750 primero", /11,750/.test(g1[0]), g1[0]?.replace(/\n/g, " ").slice(0, 80));
await shot(page, "SORT04-gastos");
check(rep, "sin errores JS", errs.length === 0, errs.join(" | "));
console.log("FALLOS:", JSON.stringify(rep.filter(r => !r.ok)));
await browser.close();

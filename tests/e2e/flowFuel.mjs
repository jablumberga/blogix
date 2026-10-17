import { open, login, nav, sleep, data, check, inputByLabel, selectByLabel } from "./lib.mjs";
const { browser, page, errors } = await open(); const rep = []; const C = (n, ok, d) => check(rep, n, ok, d);
// 1. Admin pone el precio por galón con historial en Costo por km
await login(page, "admin"); await nav(page, "Costo por km"); await sleep(1200);
await page.locator("button", { hasText: /Precio por galón/ }).first().click(); await sleep(500);
let txt = await page.innerText("body");
C("1.0 pestaña Precio por galón sin precios avisa", /Todavía no hay precio/.test(txt));
const add = async (from, price) => { await page.locator("[data-fuel-from]").fill(from); await page.locator("[data-fuel-price]").fill(String(price)); await page.locator("[data-fuel-add]").click(); await sleep(2500); };
await add("2026-10-03", 290); await add("2026-10-10", 300);
txt = await page.innerText("body");
C("1.1 tabla con 2 precios: 10/10 vigente, 03/10 hasta 09/10", /2026-10-10\s+vigente\s+300\.00/.test(txt) && /2026-10-03\s+hasta 2026-10-09\s+290\.00/.test(txt), txt.slice(txt.indexOf("Desde"), txt.indexOf("Desde") + 160).replace(/\n/g, " "));
let d = await data();
C("1.2 guardado en pfSettings.fuelPrices", Array.isArray(d.pfSettings?.fuelPrices) && d.pfSettings.fuelPrices.length === 2, JSON.stringify(d.pfSettings?.fuelPrices));
// 2. Gasto de combustible en Gastos sin galones → se calculan al precio de SU fecha
await nav(page, "Gastos"); await sleep(1000);
await page.getByRole("button", { name: /Nuevo|Agregar|Registrar/ }).first().click(); await sleep(500);
await (await inputByLabel(page, "Fecha")).fill("2026-10-12"); await sleep(200);
await selectByLabel(page, "Categoría", "fuel").catch(async () => { await selectByLabel(page, "Tipo", "fuel"); }); await sleep(200);
await (await inputByLabel(page, "Monto")).fill("6000"); await sleep(300);
txt = await page.innerText("body");
C("2.0 etiqueta avisa ≈ 20 gal a RD$300/gal (precio del 10 oct)", /20 gal a RD\$300\/gal/.test(txt), (txt.match(/Galones[^\n]*/) || [""])[0]);
await (await inputByLabel(page, "Fecha")).fill("2026-10-05"); await sleep(300);
txt = await page.innerText("body");
C("2.1 con fecha 5 oct usa el precio de esa semana: RD$290/gal", /gal a RD\$290\/gal/.test(txt), (txt.match(/Galones[^\n]*/) || [""])[0]);
const truck = page.locator("xpath=//label[starts-with(normalize-space(.),'Camión')]/following-sibling::select[1]").first();
if (await truck.count() && !(await truck.inputValue())) await truck.selectOption({ index: 1 });
await page.getByRole("button", { name: "Guardar" }).first().click(); await sleep(3000);
d = await data(); const ex = d.expenses.filter(e => e.category === "fuel" && e.amount === 6000 && e.date === "2026-10-05").pop();
C("2.2 gasto guardado con galones automáticos 20.69 (6000 ÷ 290)", ex && ex.gallons === 20.69, JSON.stringify({ g: ex?.gallons, date: ex?.date }));
// 3. Galones escritos a mano ganan
await page.getByRole("button", { name: /Nuevo|Agregar|Registrar/ }).first().click(); await sleep(500);
await (await inputByLabel(page, "Fecha")).fill("2026-10-12");
await selectByLabel(page, "Categoría", "fuel").catch(async () => { await selectByLabel(page, "Tipo", "fuel"); });
await (await inputByLabel(page, "Monto")).fill("3000"); await page.locator("[data-fuel-gallons]").fill("9.5"); await sleep(200);
const truck2 = page.locator("xpath=//label[starts-with(normalize-space(.),'Camión')]/following-sibling::select[1]").first();
if (await truck2.count() && !(await truck2.inputValue())) await truck2.selectOption({ index: 1 });
await page.getByRole("button", { name: "Guardar" }).first().click(); await sleep(3000);
d = await data(); const ex2 = d.expenses.filter(e => e.category === "fuel" && e.amount === 3000).pop();
C("3.0 galones escritos (9.5) se respetan", ex2 && ex2.gallons === 9.5, JSON.stringify(ex2?.gallons));
// 4. Chofer: el API le manda solo fuelPrices
const dd = await data("Rober").catch(() => null);
C("4.0 chofer recibe pfSettings con solo fuelPrices", dd && Array.isArray(dd.pfSettings?.fuelPrices) && dd.pfSettings.fuelPrices.length === 2 && !("reservePct" in (dd.pfSettings || {})), JSON.stringify(dd?.pfSettings));
C("5.0 sin errores de página", errors.length === 0, errors.join(" | "));
console.log(rep.map(r => `${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : " — " + r.detail}`).join("\n")); console.log(`${rep.filter(r => r.ok).length}/${rep.length}`);
await browser.close();

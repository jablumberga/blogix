import { open, login, nav, sleep, data, check, shot, inputByLabel, selectByLabel } from "./lib.mjs";
const { browser, page } = await open(); const errs = []; page.on("pageerror", e => errs.push(e.message));
const rep = []; const C = (n, ok, d) => check(rep, n, ok, d);
const logout = async () => { await page.getByRole("button", { name: /Cerrar sesi|Salir/ }).first().click().catch(() => {}); await sleep(500); };
// 1. Admin registra viaje con pago chofer fijado y descuento al ayudante
await login(page, "admin"); await nav(page, "Viajes"); await sleep(800);
await page.getByRole("button", { name: /Nuevo|Registrar|Agregar/ }).first().click(); await sleep(500);
await (await inputByLabel(page, "Fecha")).fill("2026-10-06");
await selectByLabel(page, "Cliente", "Bocel"); await sleep(300);
await selectByLabel(page, "Conductor", "Rober"); await sleep(300);
const truckSel = page.locator("xpath=//label[starts-with(normalize-space(.),'Camión')]/following-sibling::select[1]").first();
if (await truckSel.count()) { const opts = await truckSel.locator("option").allTextContents(); console.log("camiones:", opts.join("|")); if (!(await truckSel.inputValue())) await truckSel.selectOption({ index: 1 }); }
await selectByLabel(page, "Provincia", "Santiago"); await sleep(300);
await selectByLabel(page, "Municipio", "Santiago de los Caballeros"); await sleep(400);
await (await inputByLabel(page, "Ref. Factura")).fill("ADJ-001"); await sleep(800);
await (await inputByLabel(page, "Pago chofer")).fill("1500"); await sleep(300);
// descuento al ayudante 1
await page.locator("button", { has: page.locator("svg.lucide-plus") }).last().click().catch(async () => { await page.getByRole("button", { name: "" }).last().click(); }); await sleep(300);
const discRow = page.locator("select").filter({ has: page.locator("option[value='helper:0']") }).last();
C("1.0 el descuento tiene selector de destinatario (Chofer / Ayudante 1)", (await discRow.count()) === 1);
await discRow.selectOption("helper:0");
const rowBox = discRow.locator("xpath=ancestor::div[1]");
await rowBox.locator("input").first().fill("daño caja"); await rowBox.locator("input[type=number]").first().fill("100"); await sleep(300);
const prev = await page.locator("body").innerText();
C("1.1 la vista previa muestra chofer fijado 1,500 y ayudante 700 − 100 = 600", /fijado RD\$1,500/.test(prev) && /desc\. RD\$100/.test(prev) && /= RD\$600/.test(prev), prev.slice(prev.indexOf("Chofer"), prev.indexOf("Chofer") + 220).replace(/\n/g, " "));
await page.getByRole("button", { name: "Guardar" }).first().click(); await sleep(3500);
let d = await data(); const tr = d.trips.find(t => t.invoiceRef === "ADJ-001");
const ex = d.expenses.filter(e => e.tripId === tr?.id);
C("1.2 viaje guardado con driverPayOverride 1,500 y descuento who=helper:0", tr?.driverPayOverride === 1500 && tr?.discounts?.[0]?.who === "helper:0" && tr?.discounts?.[0]?.amount === 100, JSON.stringify({ o: tr?.driverPayOverride, d: tr?.discounts }));
C("1.3 gastos: driverPay 1,500 · helper 600", ex.find(e => e.category === "driverPay")?.amount === 1500 && ex.find(e => e.category === "helper")?.amount === 600, ex.map(e => `${e.category}:${e.amount}`).join(", "));
await logout();
// 2. Nicole marca recibido
await login(page, "Nicole"); await sleep(1000);
await page.locator("button, div", { hasText: /^Rober/ }).filter({ hasText: "viajes" }).last().click(); await sleep(800);
const row = page.locator("tr", { hasText: "ADJ-001" }).first(); await row.locator("input[type=checkbox]").first().check(); await sleep(2500);
await logout();
// 3. Admin en Nómina: ajustar viaje (chofer 1,700, ayudante fijado 800, descuento chofer 200)
await login(page, "admin"); await nav(page, "Nómina"); await sleep(1000);
await page.locator("button", { hasText: /Detalle/ }).first().click().catch(() => {}); await sleep(500);
let txt = await page.locator("body").innerText();
if (!/ADJ-001|#\d+/.test(txt)) { await page.locator("button", { hasText: /Detalle|Ver/ }).first().click(); await sleep(500); }
await page.locator("button[title^='Ajustar pago']").first().click(); await sleep(500);
C("3.1 el lápiz abre el ajuste del viaje con chofer, ayudante y descuentos", (await page.locator("[data-trip-adjust]").count()) === 1);
await page.locator("[data-adjust-driver]").fill("1700");
await page.locator("[data-adjust-helper]").first().fill("800");
await page.locator("[data-trip-adjust] button", { hasText: /agregar/ }).click(); await sleep(200);
const discInputs = page.locator("[data-adjust-discount]"); const n = await discInputs.count();
await discInputs.nth(n - 1).fill("200"); await sleep(200);
const box = await page.locator("[data-trip-adjust]").innerText();
C("3.2 vista previa en el ajuste: chofer 1,500 (1,700 − 200) · ayudante 700 (800 − 100)", /RD\$1,500 \(RD\$1,700 − RD\$200\)/.test(box) && /RD\$700 \(RD\$800 − RD\$100\)/.test(box), box.slice(box.indexOf("Queda"), box.indexOf("Queda") + 120));
await page.locator("[data-adjust-save]").click(); await sleep(3000);
d = await data(); const tr2 = d.trips.find(t => t.invoiceRef === "ADJ-001"); const ex2 = d.expenses.filter(e => e.tripId === tr2.id);
C("3.3 el viaje guarda overrides y descuentos; gastos pendientes rehechos: driverPay 1,500 · helper 700", tr2.driverPayOverride === 1700 && tr2.helperPayOverrides?.[0] === 800 && tr2.discounts.length === 2 && ex2.find(e => e.category === "driverPay")?.amount === 1500 && ex2.find(e => e.category === "helper")?.amount === 700, JSON.stringify({ o: tr2.driverPayOverride, h: tr2.helperPayOverrides, d: tr2.discounts, ex: ex2.map(e => `${e.category}:${e.amount}:${e.status}`) }));
C("3.4 historial del viaje registra el ajuste de nómina", (tr2.history || []).some(h => /ajuste de nómina/.test(h.action)));
txt = await page.locator("body").innerText();
C("3.5 la fila de nómina muestra chofer 1,500 y ayudantes 700, con descuentos dirigidos", /RD\$1,500/.test(txt) && /RD\$700 \(1\)/.test(txt) && /Descuento a Ayudante 1/.test(txt) && /Descuento al chofer/.test(txt), txt.slice(txt.indexOf("ADJ-001") - 50, txt.indexOf("ADJ-001") + 400).replace(/\n/g, " | "));
await shot(page, "ADJ01-nomina");
// 4. Marcar pagado → Banco sale 1,500 + 700
await page.locator("button", { hasText: /Marcar pagado/ }).first().click(); await sleep(2500);
d = await data(); const ex3 = d.expenses.filter(e => e.tripId === tr2.id);
C("4.1 pagado: driverPay 1,500 y helper 700 en paid", ex3.every(e => e.status === "paid") && ex3.reduce((s, e) => s + e.amount, 0) === 2200, ex3.map(e => `${e.category}:${e.amount}:${e.status}`).join(", "));
// 5. Ya pagado: el lápiz desaparece
C("5.1 viaje pagado: ya no se puede ajustar", (await page.locator("button[title^='Ajustar pago']").count()) === 0);
console.log("errs", errs);
console.log("FALLOS:", rep.filter(r => !r.ok).map(r => r.name).join(" | ") || "ninguno", `(${rep.filter(r => r.ok).length}/${rep.length})`);
await browser.close();

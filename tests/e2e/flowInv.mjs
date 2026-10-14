import { open, login, nav, shot, sleep, check, data, selectByLabel, inputByLabel } from "./lib.mjs";
const { browser, page } = await open(); const rep = []; const C = (n, ok, d) => check(rep, n, ok, d);
const errs = []; page.on("pageerror", e => errs.push(e.message));
const logout = async () => { await page.getByText("Cerrar Sesión").first().click().catch(() => {}); await sleep(600); };
// Chofer registra 2 viajes
await login(page, "Rober"); await sleep(800);
for (const [date, ref] of [["2026-10-05", "BOC-2001"], ["2026-10-06", "BOC-2002"]]) {
  await page.getByRole("button", { name: /Nuevo|Registrar|Agregar/ }).first().click(); await sleep(500);
  await (await inputByLabel(page, "Fecha")).fill(date);
  await selectByLabel(page, "Cliente", "Bocel"); await sleep(300);
  await selectByLabel(page, "Provincia", "Santiago"); await sleep(300);
  await selectByLabel(page, "Municipio", "Santiago de los Caballeros"); await sleep(400);
  await (await inputByLabel(page, "Ref. Factura")).fill(ref); await sleep(800);
  await page.getByRole("button", { name: "Guardar" }).first().click(); await sleep(3500);
}
let d = await data(); C("viajes creados", d.trips.length === 2);
await logout();
// Admin: dashboard antes de recibir docs → Docs pendientes
await login(page, "admin"); await sleep(1200); await shot(page, "INV01-dash-pend");
let body = await page.innerText("body");
C("dashboard sin «Borrador»", !/Borrador/i.test(body));
C("dashboard muestra Docs Pendientes con monto", /DOCS PENDIENTES/i.test(body));
// Oficina marca recibido el viaje 1 (Entregas)
await nav(page, "Entregas (oficina)"); await sleep(800); await shot(page, "INV02-entregas");
await page.locator("button, div", { hasText: /^Rober/ }).filter({ hasText: "viajes" }).last().click(); await sleep(800);
await page.locator("tr", { hasText: "BOC-2001" }).first().locator("input[type=checkbox]").first().check(); await sleep(2500);
d = await data(); const t1 = d.trips.find(t => t.invoiceRef === "BOC-2001");
C("viaje 1 docs recibidos", t1?.docStatus === "delivered", JSON.stringify({ ds: t1?.docStatus }));
await nav(page, "Panel"); await sleep(1000); body = await page.innerText("body"); await shot(page, "INV03-dash-ready");
C("dashboard: Listo Facturar 5,500 y Docs pendientes 5,500", /LISTO FACTURAR[\s\S]{0,40}5,500/i.test(body) && /DOCS PENDIENTES[\s\S]{0,40}5,500/i.test(body), body.match(/LISTO FACTURAR[\s\S]{0,60}/i)?.[0]?.replace(/\n/g, " "));
// Facturar
await nav(page, "Facturas"); await sleep(800);
await page.getByRole("button", { name: /Nueva Factura/ }).click(); await sleep(600); await shot(page, "INV04-form");
body = await page.innerText("body");
C("formulario sin selector Borrador; estado fijo Por cobrar", !/Borrador/.test(body) && /Por cobrar/.test(body) && (await page.locator("[data-invoice-status]").count()) === 0);
await selectByLabel(page, "Cliente", "Bocel"); await sleep(500);
const sel = page.locator("div[style*='cursor: pointer']", { hasText: "BOC-2001" }).last(); if (await sel.count()) await sel.click();
await sleep(300);
await page.getByRole("button", { name: /Guardar|Crear/ }).last().click(); await sleep(3000);
d = await data(); const inv = d.invoices[0];
C("factura creada ya «por cobrar» (sent) con el viaje recibido", !!inv && inv.status === "sent" && inv.tripIds.includes(t1.id), JSON.stringify({ st: inv?.status, ids: inv?.tripIds, amt: inv?.amount }));
body = await page.innerText("body"); await shot(page, "INV05-list");
C("lista sin botón Marcar enviada y sin Borrador", (await page.getByTitle("Marcar enviada").count()) === 0 && !/Borrador/.test(body));
await nav(page, "Panel"); await sleep(1000); body = await page.innerText("body");
C("dashboard: Por cobrar 5,500", /POR COBRAR[\s\S]{0,40}5,500/i.test(body));
// Cobrar
await nav(page, "Facturas"); await sleep(800);
await page.locator("tr", { hasText: inv.invoiceNumber }).first().getByRole("button", { name: /Cobrar/ }).click(); await sleep(400);
await page.getByRole("button", { name: "Registrar cobro" }).last().click(); await sleep(3000);
d = await data();
C("cobro total → factura cobrada", d.invoices[0].status === "paid" && d.cobros.length === 1);
await nav(page, "Panel"); await sleep(1000); body = await page.innerText("body"); await shot(page, "INV06-dash-cobrado");
C("dashboard: Cobrado 5,500", /^COBRADO[\s\S]{0,40}5,500/im.test(body));
C("sin errores JS", errs.length === 0, errs.join(" | "));
console.log("FALLOS:", JSON.stringify(rep.filter(r => !r.ok)));
await browser.close();

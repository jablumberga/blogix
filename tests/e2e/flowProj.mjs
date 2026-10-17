import { open, login, nav, sleep, check, shot } from "./lib.mjs";
const { browser, page, errors } = await open(); const rep = []; const C = (n, ok, d) => check(rep, n, ok, d);
await login(page, "admin"); await nav(page, "Proyecciones"); await sleep(1200);
let t = await page.innerText("body");
C("1.0 página carga con base y pestaña Flujo de caja", /Basado en \d+ semana/.test(t) && /Caja hoy/.test(t), (t.match(/Basado en[^\n]*/) || [""])[0]);
C("1.1 tabla de flujo con 8 semanas", (await page.locator("[data-proj-flow] tbody tr").count()) >= 8);
await page.locator("[data-proj-mode=runrate]").click(); await sleep(400); t = await page.innerText("body");
C("1.2 modo ritmo actual añade columna Estimado", /Estimado/i.test(t) && /Est\. salidas/i.test(t));
await page.locator("[data-proj-flow] tbody tr").first().click(); await sleep(300); t = await page.innerText("body");
C("1.3 al abrir una semana se ve el detalle de movimientos", /Sin movimientos previstos|Nómina|Viaje #|Factura|estimad/i.test(t));
for (const [k, re] of [["ingresos", /Flete por semana/], ["camiones", /Margen\/viaje/i], ["equilibrio", /Viajes para empatar/], ["escenarios", /Operación actual/]]) {
  await page.locator(`[data-proj-tab=${k}]`).click(); await sleep(500); t = await page.innerText("body");
  C(`2.${k} pestaña ${k} muestra su contenido`, re.test(t));
}
await page.locator("[data-sc-trips]").fill("20"); await page.locator("[data-sc-extra]").check(); await page.locator("[data-sc-extra-fixed]").fill("60000"); await page.locator("[data-sc-extra-trips]").fill("5"); await sleep(400); t = await page.innerText("body");
C("3.0 escenario con camión extra muestra tres tarjetas (actual, nuevo, total)", /Camión nuevo T2/.test(t) && /Total/.test(t) && /Cubre su fijo con \d+ viajes/.test(t));
await page.locator("[data-proj-weeks='4']").click(); await sleep(400); t = await page.innerText("body");
C("3.1 cambiar ventana a 4 semanas actualiza la base", /Basado en [1-4] semana/.test(t), (t.match(/Basado en[^\n]*/) || [""])[0]);
await shot(page, "PROJ01");
C("4.0 sin errores de página", errors.length === 0, errors.join(" | "));
console.log(rep.map(r => `${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : " — " + r.detail}`).join("\n")); console.log(`${rep.filter(r => r.ok).length}/${rep.length}`);
await browser.close();

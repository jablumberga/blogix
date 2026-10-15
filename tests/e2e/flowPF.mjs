import { open, login, nav, sleep } from "./lib.mjs";
const { browser, page } = await open(); const errs = []; page.on("pageerror", e => errs.push(e.message));
await login(page, "admin"); await nav(page, "Facturas"); await sleep(900);
const pop = page.waitForEvent("popup"); await page.locator("[data-pf-report]").first().click(); const pdf = await pop; await pdf.waitForLoadState(); await sleep(800);
await pdf.screenshot({ path: "../shots/PF01.png", fullPage: true });
const t = await pdf.innerText("body"); console.log(t.length, "chars"); console.log(t.slice(0, 600)); await pdf.close();
console.log("errs", errs); await browser.close();

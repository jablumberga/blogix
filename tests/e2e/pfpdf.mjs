import { open, login, nav, sleep } from "./lib.mjs";
const { browser, page } = await open();
await login(page, "admin"); await nav(page, "Facturas"); await sleep(900);
const pop = page.waitForEvent("popup"); await page.locator("[data-pf-report]").first().click(); const pdf = await pop; await pdf.waitForLoadState(); await sleep(800);
await pdf.emulateMedia({ media: "print" });
await pdf.pdf({ path: "/mnt/user-data/outputs/Profit-First-FAC-2026-0001.pdf", format: "Letter", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" } });
await pdf.screenshot({ path: "../shots/PF02.png", fullPage: true });
await browser.close();

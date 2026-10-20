import { open, login, nav, sleep, data, check, inputByLabel, selectByLabel } from "./lib.mjs";
const { browser, page, errors } = await open(); const rep = []; const C = (n, ok, d) => check(rep, n, ok, d);
await login(page, "admin"); await nav(page, "Banco"); await sleep(1000);
// 1. Crear cuenta Tarjeta
await page.locator("[data-bank-new-account]").click(); await sleep(400);
await (await inputByLabel(page, "Nombre")).fill("Tarjeta BHD"); await selectByLabel(page, "Tipo", "card"); await sleep(200);
await page.locator("[data-bank-save-account]").click(); await sleep(2500);
let d = await data(); const card = (d.bankAccount?.accounts || []).find(a => a.role === "card");
C("1.0 cuenta Tarjeta creada", !!card, JSON.stringify(d.bankAccount?.accounts?.map(a => a.role)));
// 2. Gasto con tarjeta en Gastos: queda pagado y cae en la Tarjeta
await nav(page, "Gastos"); await sleep(800);
await page.getByRole("button", { name: /Nuevo|Agregar|Registrar/ }).first().click(); await sleep(500);
await (await inputByLabel(page, "Fecha")).fill("2026-10-20");
await selectByLabel(page, "Categoría", "repair").catch(async () => { await selectByLabel(page, "Tipo", "repair"); });
await (await inputByLabel(page, "Monto")).fill("4500");
await selectByLabel(page, "Método", "credit_card").catch(async () => { await selectByLabel(page, "Forma", "credit_card"); }); await sleep(300);
let t = await page.innerText("body");
C("2.0 con tarjeta el estado queda fijo en Pagado y la cuenta automática es la Tarjeta", /Pagado \(el dinero ya salió\)/.test(t) && /Automático \(Tarjeta BHD\)/.test(t), (t.match(/Automático[^\n]*/) || [""])[0]);
await page.getByRole("button", { name: "Guardar" }).first().click(); await sleep(3000);
d = await data(); const e1 = d.expenses.filter(e => e.amount === 4500).pop();
C("2.1 gasto guardado pagado con tarjeta", e1 && e1.status === "paid" && e1.paymentMethod === "credit_card" && e1.paidDate === "2026-10-20", JSON.stringify({ st: e1?.status, pm: e1?.paymentMethod }));
// 3. Gasto por transferencia: también pagado solo
await page.getByRole("button", { name: /Nuevo|Agregar|Registrar/ }).first().click(); await sleep(500);
await (await inputByLabel(page, "Fecha")).fill("2026-10-21");
await selectByLabel(page, "Categoría", "toll").catch(async () => { await selectByLabel(page, "Tipo", "toll"); });
await (await inputByLabel(page, "Monto")).fill("800");
await selectByLabel(page, "Método", "transfer").catch(async () => { await selectByLabel(page, "Forma", "transfer"); }); await sleep(200);
await page.getByRole("button", { name: "Guardar" }).first().click(); await sleep(3000);
d = await data(); const e2 = d.expenses.filter(e => e.amount === 800).pop();
C("3.0 transferencia queda pagada al registrarla", e2 && e2.status === "paid" && e2.paymentMethod === "transfer", JSON.stringify({ st: e2?.status }));
// 4. Banco: la tarjeta debe 4,500; OpEx bajó 800; pagar tarjeta
await nav(page, "Banco"); await sleep(1000); t = await page.innerText("body");
C("4.0 alerta de tarjeta con 4,500 pendientes", /4,500[^\n]*gastado con tarjeta/.test(t), (t.match(/[^\n]*gastado con tarjeta[^\n]*/) || [""])[0]);
console.log(rep.map(r => `${r.ok ? "✓" : "✗"} ${r.name} — ${r.detail}`).join("\n")); await page.locator("[data-bank-pay-card-top]").click(); await sleep(400);
await page.locator("[data-bank-save-transfer], [data-tf-save]").first().click().catch(async () => { await page.getByRole("button", { name: /Guardar|Transferir|Pagar/ }).last().click(); }); await sleep(2500);
d = await data(); const pay = (d.bankTransfers || []).find(x => x.kind === "card_payment");
C("4.1 pago de tarjeta registrado OpEx → Tarjeta 4,500", pay && pay.amount === 4500 && pay.toId === card?.id, JSON.stringify(pay));
t = await page.innerText("body");
C("4.2 ya no hay alerta de tarjeta", !/gastado con tarjeta/.test(t));
C("5.0 sin errores de página", errors.filter(e => !/^DIALOG\(confirm\)/.test(e)).length === 0, errors.join(" | "));
console.log(rep.map(r => `${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : " — " + r.detail}`).join("\n")); console.log(`${rep.filter(r => r.ok).length}/${rep.length}`);
await browser.close();

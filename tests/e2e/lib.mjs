import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
export const B = "http://localhost:5173";
export const API = "http://localhost:8888";
export async function open() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  // E2E_TODAY=AAAA-MM-DD: congela «hoy» en el navegador (los flujos asumen quincena 1–15 de octubre)
  // El reloj sigue corriendo desde esa fecha (no se congela): el orden dentro del día importa para los saldos de Banco
  if (process.env.E2E_TODAY) await page.addInitScript(`(() => { const _D = Date; const offset = new _D("${process.env.E2E_TODAY}T15:00:00").getTime() - _D.now(); class D extends _D { constructor(...a) { super(...(a.length ? a : [_D.now() + offset])); } static now() { return _D.now() + offset; } } window.Date = D; })()`);
  const errors = [];
  page.on("pageerror", e => errors.push("PAGEERROR: " + e.message.slice(0, 300)));
  page.on("console", m => { if (m.type() === "error" && !/MIME type|favicon|manifest/.test(m.text())) errors.push("CONSOLE: " + m.text().slice(0, 200)); });
  page.on("dialog", async d => { errors.push("DIALOG(" + d.type() + "): " + d.message().slice(0, 160)); await d.accept(); });
  return { browser, page, errors };
}
export async function login(page, user, pass = "12345") {
  await fetch(`${API}/rest/v1/bl_rate_limits?id=neq.0`, { method: "DELETE" }).catch(() => {}); // solo en pruebas
  await page.goto(B); await page.waitForTimeout(800);
  const btn = page.getByRole("button", { name: /Iniciar Sesi/ }).first();
  if (await btn.count()) await btn.click();
  await page.waitForTimeout(500);
  await page.locator("input").nth(0).fill(user);
  await page.locator("input[type=password]").first().fill(pass);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
}
export async function nav(page, label) {
  const l = page.locator("nav").getByText(label, { exact: true }).first();
  await l.click(); await page.waitForTimeout(800);
}
export async function shot(page, name) { await page.screenshot({ path: `../shots/${name}.png`, fullPage: false }); }
const _tok = {};
export async function token(user) { if (_tok[user]) return _tok[user]; const r = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: "12345" }) }); const j = await r.json(); if (j.token) _tok[user] = j.token; return j.token; }
export async function data(user = "admin") { const t = await token(user); const r = await fetch(`${API}/api/data`, { headers: { authorization: `Bearer ${t}` } }); return r.json(); }
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function modal(page, titleText) {
  return page.locator("div").filter({ has: page.locator(`h3:has-text("${titleText}")`) }).last();
}
export async function selectByLabel(page, label, valueOrLabel) {
  // Sel renders <label>…</label><select> siblings inside a wrapper; find select whose preceding label text matches
  const sel = page.locator(`xpath=//label[normalize-space(.)="${label}" or starts-with(normalize-space(.),"${label}")]/following-sibling::select[1]`).first();
  if (!(await sel.count())) throw new Error("no select for label " + label);
  try { await sel.selectOption({ label: valueOrLabel }); } catch { await sel.selectOption(valueOrLabel); }
}
export async function inputByLabel(page, label) {
  return page.locator(`xpath=//label[normalize-space(.)="${label}" or starts-with(normalize-space(.),"${label}")]/following-sibling::input[1]`).first();
}
export function check(report, name, ok, detail = "") { report.push({ name, ok, detail }); console.log((ok ? "  ✔ " : "  ✘ ") + name + (detail ? " — " + detail : "")); }

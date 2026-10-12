import { open, login, nav, shot, data, sleep, check, selectByLabel, inputByLabel, token, API } from "./lib.mjs";
const { browser, page } = await open(); const rep = []; page.removeAllListeners("dialog"); page.on("dialog", d => d.accept());
const errs = []; page.on("pageerror", e => errs.push(e.message));
const tk = await token("admin");
const post = (b) => fetch(`${API}/api/data`, { method: "POST", headers: { authorization: `Bearer ${tk}`, "content-type": "application/json" }, body: JSON.stringify(b) }).then(r => r.json());
let d = await data();
// datos: 2 viajes (uno con odómetro), combustible con galones, IMEI en camión 1
await post({ patch: true, _version: d._version, tables: {
  trucks: { upserts: [{ ...d.trucks.find(t => t.id === 1), gpsImei: "860000000000001", odometer: 50000 }], deletes: [] },
  trips: { upserts: [
    { id: 1, date: "2026-10-05", province: "Santiago", municipality: "Santiago de los Caballeros", truckId: 1, driverId: 1, clientId: 1, revenue: 5500, status: "delivered", invoiceRef: "K-1", odoStart: 50000, odoEnd: 50320, numHelpers: 1, helpers: [] },
    { id: 2, date: "2026-10-06", province: "Santiago", municipality: "Santiago de los Caballeros", truckId: 2, driverId: 4, clientId: 1, revenue: 9000, status: "delivered", invoiceRef: "K-2", numHelpers: 2, helpers: [] }], deletes: [] },
  expenses: { upserts: [
    { id: 1, tripId: 1, category: "fuel", amount: 3200, gallons: 16, date: "2026-10-05", status: "paid", paymentMethod: "cash", paidDate: "2026-10-05" },
    { id: 2, tripId: 1, category: "driverPay", amount: 900, date: "2026-10-05", status: "pending", paymentMethod: "transfer", driverId: 1 },
    { id: 3, tripId: 2, category: "fuel", amount: 5000, date: "2026-10-06", status: "paid", paymentMethod: "cash", paidDate: "2026-10-06" }], deletes: [] } } });
await login(page, "admin"); await nav(page, "Costo por km"); await sleep(1000); await shot(page, "K01-costkm");
let txt = await page.locator("body").innerText();
check(rep, "K1 página carga con km del odómetro (320 km)", /320 km/.test(txt), txt.slice(0, 80));
check(rep, "K2 aviso de calidad: 1 viaje sin km y 1 carga sin galones", /1 viaje\(s\) sin km/.test(txt) && /1 carga\(s\) de combustible sin galones/.test(txt));
// Distancias de referencia
await page.getByRole("button", { name: "Distancias de referencia" }).click(); await sleep(300);
await page.getByRole("button", { name: /Santiago de los Caballeros/ }).first().click(); await sleep(200);
await (await inputByLabel(page, "Km ida y vuelta")).fill("300");
await page.getByRole("button", { name: /Agregar/ }).click(); await sleep(2500);
d = await data();
check(rep, "K3 distancia guardada en servidor (__distances)", Array.isArray(d.distances) && d.distances[0]?.km === 300, JSON.stringify(d.distances));
await page.getByRole("button", { name: "Por camión" }).click(); await sleep(300); txt = await page.locator("body").innerText();
check(rep, "K4 viaje sin odómetro ahora usa 300 km estimados (total 620 km)", /620 km/.test(txt));
// Por chofer km/gal: Rober 320/16 = 20
await page.getByRole("button", { name: "Por chofer" }).click(); await sleep(300); txt = await page.locator("body").innerText();
check(rep, "K5 km/gal del chofer = 20.0", /20\.0/.test(txt));
// GPS mock sync
await page.getByRole("button", { name: "GPS" }).click(); await sleep(300);
await page.getByRole("button", { name: /Traer km del GPS/ }).click(); await sleep(4000); txt = await page.locator("body").innerText();
check(rep, "K6 sincronización GPS (mock) responde", /Listo: 1 GPS/.test(txt), txt.match(/Listo[^\n]*/)?.[0] || txt.match(/No se pudo[^\n]*/)?.[0]);
d = await data();
check(rep, "K7 km diarios guardados en bl_gps_km", Array.isArray(d.gpsKm) && d.gpsKm.length > 0 && d.gpsKm.every(g => g.imei === "860000000000001"), String(d.gpsKm?.length));
const t1 = d.trips.find(t => t.id === 1);
check(rep, "K8 viaje del camión con GPS recibe km fuente GPS", t1.kmSource === "gps" && t1.km > 0, `${t1.km} ${t1.kmSource}`);
await page.getByRole("button", { name: "Por camión" }).click(); await sleep(300); txt = await page.locator("body").innerText();
check(rep, "K9 tabla marca '1 gps'", /1 gps/.test(txt));
// Flota: IMEI visible al editar; Viajes: odómetro en formulario
await nav(page, "Viajes"); await sleep(600); await page.locator("tr", { hasText: "K-1" }).first().locator("button").filter({ has: page.locator("svg.lucide-pencil") }).first().click(); await sleep(500);
check(rep, "K10 formulario de viaje tiene odómetro salida/llegada", (await page.getByText("Odómetro salida").count()) > 0 && (await page.getByText(/Odómetro llegada.*320 km/).count()) > 0);
console.log("pageerrors:", errs.length ? errs : "ninguno"); console.log("FALLOS:", rep.filter(r => !r.ok).map(r => r.name).join(" | ") || "ninguno");
await browser.close();

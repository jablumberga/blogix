#!/usr/bin/env node
/**
 * Carga un tarifario de choferes (JSON: { name, T1:[[prov, mun, chofer, ayudante, dieta]...], T2:[...] })
 * como tarifario GENERAL de todos los choferes por viaje, y recalcula la nómina de los viajes desde una fecha.
 *
 *   node scripts/tarifario-choferes.mjs scripts/data/tarifario-choferes-2026-10.json --from 2026-10-04 [--local local-db/db.json --yes]
 *   node scripts/tarifario-choferes.mjs <tarifario.json> --from <fecha> --data <dump.json> --sql > cambios.sql   (producción)
 *
 * Por cada viaje desde la fecha (no cancelado, chofer por viaje):
 *   · se quita el pago por ayudante fijado a mano (helperPayEach) para que mande el tarifario
 *   · se borran los gastos PENDIENTES de nómina del viaje (driverPay / helper) y se crean de nuevo con la fórmula del app
 *   · si el viaje ya tiene nómina PAGADA, no se toca y se reporta
 * Sin --yes / --sql solo muestra el reporte.
 */
import fs from "node:fs";
import { calcDriverPay, normalizeDriver } from "../src/utils/driverPay.js";
import { helperExpensePlan } from "../src/utils/ayudantes.js";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const tarFile = args.find(a => !a.startsWith("--") && a.endsWith(".json") && args[args.indexOf(a) - 1] !== "--local" && args[args.indexOf(a) - 1] !== "--data");
const fromDate = opt("--from"); const local = opt("--local"); const dataFile = opt("--data");
const yes = args.includes("--yes"), sql = args.includes("--sql");
if (!tarFile || !fromDate) { console.error("Uso: tarifario.json --from YYYY-MM-DD [--local db.json --yes | --data dump.json --sql]"); process.exit(1); }

export function buildRates(tar) {
  const map = new Map();
  const put = (rows, size) => { for (const [province, municipality, price, helper, dieta] of rows || []) {
    const k = `${province}|${municipality}`; if (!map.has(k)) map.set(k, { province, municipality, priceT1: 0, dietaT1: 0, helperT1: 0, priceT2: 0, dietaT2: 0, helperT2: 0 });
    Object.assign(map.get(k), { [`price${size}`]: price, [`helper${size}`]: helper, [`dieta${size}`]: dieta }); } };
  put(tar.T1, "T1"); put(tar.T2, "T2");
  return [...map.values()];
}

/** Aplica el tarifario y recalcula. Devuelve { drivers, trips, expenses, report, changes } (listas nuevas, sin mutar). */
export function applyTariff({ tariff, fromDate, drivers, trips, expenses, trucks }) {
  const rates = buildRates(tariff);
  const sheetName = tariff.name || "General";
  const report = [], changes = { drivers: [], trips: [], expDelete: [], expInsert: [] };
  const newDrivers = drivers.map(d => {
    const n = normalizeDriver(d); if (n.payType !== "perTrip") return d;
    const sheets = (n.rateSheets || []).filter(s => s.clientId != null);
    const general = { id: 1, name: sheetName, clientId: null, rates };
    const out = { ...d, payType: "perTrip", rateSheets: [general, ...sheets.map((s, i) => ({ ...s, id: i + 2 }))], rates };
    changes.drivers.push({ id: d.id, rateSheets: out.rateSheets, rates, payType: "perTrip" });
    return out;
  });
  const dMap = new Map(newDrivers.map(d => [d.id, d])), tMap = new Map(trucks.map(t => [t.id, t]));
  let expList = [...expenses]; let nextId = expList.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0) + 1;
  const newTrips = trips.map(tr => {
    if (!tr.date || tr.date < fromDate || tr.status === "cancelled" || !tr.driverId) return tr;
    const driver = dMap.get(tr.driverId); if (!driver || normalizeDriver(driver).payType !== "perTrip") return tr;
    const mine = expList.filter(e => e.tripId === tr.id && (e.category === "driverPay" || e.category === "helper"));
    if (mine.some(e => e.status === "paid")) { report.push({ trip: tr.id, date: tr.date, skip: "nómina ya pagada" }); return tr; }
    const t2 = { ...tr, helperPayEach: null };
    const calc = calcDriverPay({ driver, trip: t2, truck: tMap.get(tr.truckId), clientId: tr.clientId });
    if (!calc.rateFound) { report.push({ trip: tr.id, date: tr.date, skip: `sin tarifa para ${tr.province} / ${tr.municipality}` }); return tr; }
    if (Array.isArray(t2.helpers)) t2.helpers = t2.helpers.map(h => ({ ...h, pay: calc.helperEach }));
    const before = mine.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    for (const e of mine) changes.expDelete.push(e.id);
    expList = expList.filter(e => !mine.includes(e));
    const adds = [];
    if (calc.driverNet > 0) adds.push({ id: nextId++, tripId: tr.id, date: tr.date, category: "driverPay", amount: calc.driverNet, description: `Pago chofer ${driver.name} · ${tr.municipality || ""}`, paymentMethod: "transfer", driverId: driver.id, status: "pending", supplierId: null });
    for (const p of helperExpensePlan({ trip: t2, calc, driverDescription: (n) => `Ayudantes (${n}) · ${tr.municipality || ""}` })) {
      if (!(p.amount > 0)) continue;
      adds.push({ id: nextId++, tripId: tr.id, date: tr.date, category: "helper", amount: p.amount, description: p.description, paymentMethod: "transfer", ...(p.ayudanteId != null ? { ayudanteId: p.ayudanteId } : { driverId: driver.id }), status: "pending", supplierId: null });
    }
    expList.push(...adds); changes.expInsert.push(...adds);
    changes.trips.push({ id: tr.id, helperPayEach: null, ...(Array.isArray(t2.helpers) ? { helpers: t2.helpers } : {}) });
    report.push({ trip: tr.id, date: tr.date, dest: `${tr.municipality} (${calc.size}${calc.sizeFallback ? "→tarifa " + (calc.size === "T2" ? "T1" : "T2") : ""})`, driver: driver.name, chofer: calc.driverNet, dieta: `${calc.dieta}/${calc.dietaTotal}`, ayud: `${calc.numHelpers}×${calc.helperEach}`, total: calc.total, antes: before });
    return t2;
  });
  return { drivers: newDrivers, trips: newTrips, expenses: expList, report, changes };
}

const tariff = JSON.parse(fs.readFileSync(tarFile, "utf8"));
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const unwrap = (rows) => rows.map(r => r.rec || r);
  let data;
  if (local) { const db = JSON.parse(fs.readFileSync(local, "utf8")); data = { db, drivers: unwrap(db.bl_drivers || []), trips: unwrap(db.bl_trips || []), expenses: unwrap(db.bl_expenses || []), trucks: unwrap(db.bl_trucks || []) }; }
  else if (dataFile) { const d = JSON.parse(fs.readFileSync(dataFile, "utf8")); data = { drivers: d.drivers, trips: d.trips, expenses: d.expenses, trucks: d.trucks }; }
  else { console.error("Falta --local o --data"); process.exit(1); }
  const r = applyTariff({ tariff, fromDate, ...data });
  if (!sql) {
    console.error(`Tarifario «${tariff.name}»: ${buildRates(tariff).length} destinos → ${r.changes.drivers.length} chofer(es) por viaje`);
    console.table(r.report);
    console.error(`Gastos: ${r.changes.expDelete.length} pendientes reemplazados por ${r.changes.expInsert.length} nuevos · viajes tocados ${r.changes.trips.length}`);
  }
  if (local && yes) {
    const db = data.db; const wrap = (list) => list.map(x => ({ id: x.id, rec: x }));
    fs.copyFileSync(local, local.replace(/([^/]+)$/, `backup-tarifario-${Date.now()}-$1`));
    db.bl_drivers = wrap(r.drivers); db.bl_trips = wrap(r.trips); db.bl_expenses = wrap(r.expenses);
    fs.writeFileSync(local, JSON.stringify(db, null, 2)); console.error("Base local actualizada.");
  }
  if (sql) {
    const J = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
    const out = ["BEGIN;"];
    for (const d of r.changes.drivers) out.push(`UPDATE bl_drivers SET rec = rec || ${J({ rateSheets: d.rateSheets, rates: d.rates, payType: d.payType })} WHERE id = ${d.id};`);
    for (const t of r.changes.trips) out.push(`UPDATE bl_trips SET rec = rec || ${J(t)} WHERE id = ${t.id};`);
    if (r.changes.expDelete.length) out.push(`DELETE FROM bl_expenses WHERE id IN (${r.changes.expDelete.join(",")}) AND rec->>'status' <> 'paid';`);
    for (const e of r.changes.expInsert) out.push(`INSERT INTO bl_expenses (id, rec) VALUES (${e.id}, ${J(e)});`);
    out.push(`UPDATE bl_settlement_status SET data = jsonb_set(data, '{_version}', to_jsonb((EXTRACT(EPOCH FROM now()) * 1000)::bigint)) WHERE id = 1;`);
    out.push("COMMIT;");
    console.log(out.join("\n"));
  }
}

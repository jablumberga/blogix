#!/usr/bin/env node
/**
 * Arranque desde cero: borra el HISTÓRICO OPERATIVO y conserva los maestros.
 *
 *   Se borra:   viajes, gastos (nómina pagada, adelantos, liquidaciones…), facturas,
 *               cobros, plantillas de gastos fijos, estado de liquidaciones.
 *   Se conserva: clientes y tarifas, choferes (tarifarios y accesos), socios, camiones,
 *               suplidores, brokers, usuarios (bl_staff), cuenta de banco y ajustes
 *               Profit First (incluido el balance inicial si ya se cargó).
 *
 * Uso (base local):   node scripts/reset-operativo.mjs [local-db/db.json] [--yes]
 *   Sin --yes solo muestra lo que borraría. Guarda respaldo en local-db/backup-<ts>.json.
 *
 * Para producción (Supabase) imprime el SQL equivalente con --sql.
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--")) || "local-db/db.json";
const yes = args.includes("--yes");

const WIPE = ["bl_trips", "bl_expenses", "bl_invoices", "bl_cobros", "bl_fixed_templates"];
const KEEP = ["bl_clients", "bl_drivers", "bl_partners", "bl_trucks", "bl_suppliers", "bl_brokers", "bl_staff"];

if (args.includes("--sql")) {
  console.log(`-- B-Logix · arranque desde cero (conserva maestros)\nBEGIN;`);
  for (const t of WIPE) console.log(`DELETE FROM ${t};`);
  console.log(`UPDATE bl_settlement_status SET data = jsonb_build_object(
  '_version', (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
  '__bankAccount', data->'__bankAccount',
  '__bankReconciliation', '{}'::jsonb,
  '__pfSettings', data->'__pfSettings') WHERE id = 1;
COMMIT;`);
  process.exit(0);
}

const db = JSON.parse(fs.readFileSync(file, "utf8"));
const counts = Object.fromEntries(WIPE.map(t => [t, (db[t] || []).length]));
console.log(`Base: ${file}`);
console.log("Se borra:  ", WIPE.map(t => `${t}=${counts[t]}`).join("  "));
console.log("Se conserva:", KEEP.map(t => `${t}=${(db[t] || []).length}`).join("  "));

if (!yes) { console.log("\n(ensayo) Agrega --yes para ejecutar. Se guarda respaldo antes de borrar."); process.exit(0); }

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backup = file.replace(/([^/]+)$/, `backup-${ts}-$1`);
fs.copyFileSync(file, backup);

for (const t of WIPE) db[t] = [];
const row = (db.bl_settlement_status || [])[0];
if (row?.data) {
  const { __bankAccount, __pfSettings } = row.data;
  row.data = { _version: Date.now(), ...(__bankAccount ? { __bankAccount } : {}), __bankReconciliation: {}, ...(__pfSettings ? { __pfSettings } : {}) };
}
db.bl_rate_limits = [];
fs.writeFileSync(file, JSON.stringify(db, null, 2));
console.log(`\nListo. Respaldo: ${backup}`);

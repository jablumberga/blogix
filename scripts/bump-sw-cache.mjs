import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";

const swPath = fileURLToPath(new URL("../public/sw.js", import.meta.url)); // funciona con espacios en la ruta
const content = readFileSync(swPath, "utf8");
const version = `blogix-${Date.now()}`;
const updated = content.replace(/CACHE_NAME = 'blogix-[^']*'/, `CACHE_NAME = '${version}'`);
writeFileSync(swPath, updated);
console.log(`[sw] cache name → ${version}`);

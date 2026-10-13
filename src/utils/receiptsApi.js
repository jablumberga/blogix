// Llamadas al servidor de recibos por foto (/api/receipts/*). Ver netlify/functions/receipts.mjs.
import { getToken } from "../api.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function req(method, path, body) {
  let r;
  try {
    r = await fetch(`${API_BASE}${path}`, {
      method, cache: "no-store",
      headers: { Authorization: `Bearer ${getToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    const e = new Error("Sin conexión. Revisa la señal e intenta de nuevo."); e.offline = true; throw e;
  }
  let j = {};
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) {
    const e = new Error(j.error || `Error ${r.status}`);
    e.status = r.status; e.problems = j.problems || null; e.errors = j.errors || null;
    throw e;
  }
  return j;
}

export const scanReceipt    = (payload)          => req("POST", "/api/receipts/scan", payload);
export const submitReceipt  = (id, fields)       => req("POST", "/api/receipts/submit", { id, fields });
export const listReceipts   = ()                 => req("GET", "/api/receipts");
export const rejectReceipt  = (id, reason)       => req("POST", "/api/receipts/reject", { id, reason });
export const approveReceipt = (id, expenseId)    => req("POST", "/api/receipts/approve", { id, expenseId });
export const deleteReceipt  = (id)               => req("POST", "/api/receipts/delete", { id });

const photoCache = new Map(); // id → blob URL (la foto no cambia)
export async function receiptPhotoUrl(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const r = await fetch(`${API_BASE}/api/receipts/photo?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!r.ok) throw new Error("No se pudo cargar la foto");
  const u = URL.createObjectURL(await r.blob());
  photoCache.set(id, u);
  return u;
}

/** Avisa a las demás pantallas (contador de Inicio y del menú) que los recibos cambiaron. */
export const notifyReceiptsChanged = () => { try { window.dispatchEvent(new CustomEvent("blogix:receipts-changed")); } catch { /* sin ventana */ } };

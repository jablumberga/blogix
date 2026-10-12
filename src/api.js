/**
 * B-Logix - API Client
 * Sends session token with every request for server-side RLS enforcement.
 * Falls back to localStorage when API is unavailable.
 */

// En web: VITE_API_BASE_URL está vacío → URLs relativas funcionan normalmente.
// En Capacitor nativo: apunta a https://blogix-logistica-dr.netlify.app
const API_BASE  = import.meta.env.VITE_API_BASE_URL || "";
const API_URL   = `${API_BASE}/api/data`;
const LS_KEY    = "blogix_data";
const TK_KEY    = "blogix_token";
const DIRTY_KEY = "blogix_dirty"; // set per-user when localStorage is ahead of Supabase

let _apiAvailable = null;
let _apiCheckedAt = 0;
const API_CACHE_TTL = 8_000; // retry offline after 8s

export function resetApiCache() { _apiAvailable = null; _apiCheckedAt = 0; }

function dKey() {
  try { const t = localStorage.getItem(TK_KEY); const u = t ? userIdFromToken(t) : null; return u != null ? `${DIRTY_KEY}_${u}` : DIRTY_KEY; } catch { return DIRTY_KEY; }
}
function markDirty()  { try { localStorage.setItem(dKey(), "1"); } catch {} }
function clearDirty() { try { localStorage.removeItem(dKey()); } catch {} }
function isDirty()    { try { return localStorage.getItem(dKey()) === "1"; } catch { return false; } }

export function getToken() {
  try { return localStorage.getItem(TK_KEY); } catch { return null; }
}

export function saveToken(token) {
  try { localStorage.setItem(TK_KEY, token); } catch {}
}

export function clearToken() {
  try { localStorage.removeItem(TK_KEY); } catch {}
}

function userIdFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.id ?? null;
  } catch { return null; }
}

function lsKey(token) {
  const uid = token ? userIdFromToken(token) : null;
  return uid != null ? `${LS_KEY}_${uid}` : LS_KEY;
}

function authHeaders() {
  const token = getToken();
  return token
    ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

// Single fetch — no separate availability pre-check to avoid double requests and cache poisoning
export async function loadData() {
  const token = getToken();
  const key   = lsKey(token);

  // No token at all — skip API, go straight to localStorage
  if (!token) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try { return { source: "localStorage", data: JSON.parse(raw) }; } catch {
        localStorage.removeItem(key);
      }
    }
    return { source: "default", data: null };
  }

  // Respect negative cache TTL so a momentary network blip doesn't lock us offline forever
  const now = Date.now();
  if (_apiAvailable === false && (now - _apiCheckedAt) < API_CACHE_TTL) {
    const raw = localStorage.getItem(key);
    if (raw) {
      try { return { source: "localStorage", data: JSON.parse(raw) }; } catch {}
    }
    return { source: "default", data: null };
  }

  try {
    const res = await fetch(API_URL, { headers: authHeaders(), cache: "no-store" });
    _apiCheckedAt = Date.now();

    if (res.status === 401) {
      _apiAvailable = true; // server reachable
      localStorage.removeItem(key); // clear stale cache before token is gone
      clearToken();
      try { localStorage.removeItem("blogix_session"); } catch {}
      return { source: "unauthenticated", data: null };
    }

    if (res.ok) {
      _apiAvailable = true;
      const apiData = await res.json();
      if (apiData && Object.keys(apiData).length > 0) {
        const { _version, ...dataOnly } = apiData;
        // Always use fresh server data. The dirty flag only gates the write path
        // (auto-save); on a fresh page load any in-memory changes are already gone.
        const apiHasData = Object.values(dataOnly).some(v => Array.isArray(v) ? v.length > 0 : Boolean(v));
        const localRaw = localStorage.getItem(key);
        if (apiHasData || !localRaw) {
          localStorage.setItem(key, JSON.stringify(dataOnly));
          clearDirty(); // server is authoritative — dirty flag no longer valid
        }
        return { source: "api", data: dataOnly, version: _version || 0 };
      }
    }

    _apiAvailable = false;
  } catch (err) {
    console.warn("[B-Logix] API load failed, falling back to localStorage", err);
    _apiAvailable = false;
    _apiCheckedAt = Date.now();
  }

  const raw = localStorage.getItem(key);
  if (raw) {
    try { return { source: "localStorage", data: JSON.parse(raw) }; } catch {
      localStorage.removeItem(key);
    }
  }
  return { source: "default", data: null };
}

export async function saveData(data, version = 0, patch = null) {
  const token = getToken();
  const key   = lsKey(token);
  localStorage.setItem(key, JSON.stringify(data));
  markDirty(); // localStorage is now ahead of Supabase until confirmed

  if (!token) return { saved: "localStorage" };

  // Respect negative cache TTL
  const now = Date.now();
  if (_apiAvailable === false && (now - _apiCheckedAt) < API_CACHE_TTL) {
    return { saved: "localStorage" };
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(patch ? { ...patch, _version: version } : { ...data, _version: version }),
    });
    if (res.ok) {
      _apiAvailable = true;
      clearDirty();
      const json = await res.json().catch(() => ({}));
      return { saved: "api", version: json._version || 0, ...(json.remap ? { remap: json.remap } : {}) };
    }
    if (res.status === 409) { return { saved: "conflict" }; }
    if (res.status === 422) { const j = await res.json().catch(() => ({})); return { saved: "rejected", error: j.error || "Datos rechazados por el servidor", code: j.code, tripId: j.tripId }; }
    if (res.status === 401) {
      // Token expired or invalid — force re-login, don't show "offline"
      localStorage.removeItem(key);
      clearToken();
      try { localStorage.removeItem("blogix_session"); } catch {}
      return { saved: "unauthorized" };
    }
  } catch (err) {
    console.warn("[B-Logix] API save failed, data kept in localStorage", err);
    _apiAvailable = false;
    _apiCheckedAt = Date.now();
  }

  return { saved: "localStorage" };
}


/** Trae km del GPS (TrackSolid) para un rango de fechas (solo admin). */
export async function syncGps({ dateFrom, dateTo }) {
  const token = getToken();
  if (!token) return { ok: false, error: "Sin sesión" };
  try {
    const res = await fetch(`${API_BASE}/api/gps/sync`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ dateFrom, dateTo }) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, ...j } : { ok: false, error: j.error || `Error ${res.status}` };
  } catch { return { ok: false, error: "Sin conexión con el servidor" }; }
}

/** Consulta al servidor si una referencia de factura ya existe para el cliente (viaje conjunto). */
/** Cambia la contraseña de un chofer/socio/usuario (solo admin). Acción dedicada, fuera del autoguardado. */
export async function setPassword({ table, id, password }) {
  const token = getToken();
  if (!token) return { ok: false, error: "Sin sesión" };
  try {
    const res = await fetch(`${API_BASE}/api/auth/password`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ table, id, password }) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: j.error || `Error ${res.status}` };
  } catch { return { ok: false, error: "Sin conexión con el servidor" }; }
}

export async function checkRef({ clientId, ref, truckId, tripId }) {
  const token = getToken();
  if (!token || !clientId || !String(ref || "").trim()) return { found: null, canJoin: false, error: null };
  try {
    const qs = new URLSearchParams({ clientId: String(clientId), ref: String(ref), truckId: String(truckId || ""), tripId: String(tripId || "") });
    const res = await fetch(`${API_URL}/check-ref?${qs}`, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return { found: null, canJoin: false, error: null, offline: true };
    return await res.json();
  } catch { return { found: null, canJoin: false, error: null, offline: true }; }
}

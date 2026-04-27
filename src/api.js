/**
 * B-Logix - API Client
 * Sends session token with every request for server-side RLS enforcement.
 * Falls back to localStorage when API is unavailable.
 */

const API_URL   = "/api/data";
const LS_KEY    = "blogix_data";
const TK_KEY    = "blogix_token";
const DIRTY_KEY = "blogix_dirty"; // set when localStorage is ahead of Supabase

let _apiAvailable = null;
let _apiCheckedAt = 0;
const API_CACHE_TTL = 8_000; // retry offline after 8s

export function resetApiCache() { _apiAvailable = null; _apiCheckedAt = 0; }

function markDirty()  { try { localStorage.setItem(DIRTY_KEY, "1"); } catch {} }
function clearDirty() { try { localStorage.removeItem(DIRTY_KEY); } catch {} }
function isDirty()    { try { return localStorage.getItem(DIRTY_KEY) === "1"; } catch { return false; } }

export function getToken() {
  try { return localStorage.getItem(TK_KEY); } catch { return null; }
}

export function saveToken(token) {
  try { localStorage.setItem(TK_KEY, token); } catch {}
}

export function clearToken() {
  try { localStorage.removeItem(TK_KEY); } catch {}
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

  // No token at all — skip API, go straight to localStorage
  if (!token) {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try { return { source: "localStorage", data: JSON.parse(raw) }; } catch {
        localStorage.removeItem(LS_KEY);
      }
    }
    return { source: "default", data: null };
  }

  // Respect negative cache TTL so a momentary network blip doesn't lock us offline forever
  const now = Date.now();
  if (_apiAvailable === false && (now - _apiCheckedAt) < API_CACHE_TTL) {
    const raw = localStorage.getItem(LS_KEY);
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
      clearToken();
      try { localStorage.removeItem("blogix_session"); } catch {}
      return { source: "unauthenticated", data: null };
    }

    if (res.ok) {
      _apiAvailable = true;
      const apiData = await res.json();
      if (apiData && Object.keys(apiData).length > 0) {
        // If localStorage has uncommitted changes (dirty), don't overwrite — let
        // the auto-save push them to Supabase instead of losing them.
        if (isDirty()) {
          const raw = localStorage.getItem(LS_KEY);
          if (raw) {
            try { return { source: "localStorage", data: JSON.parse(raw) }; } catch {}
          }
        }
        localStorage.setItem(LS_KEY, JSON.stringify(apiData));
        return { source: "api", data: apiData };
      }
    }

    _apiAvailable = false;
  } catch (err) {
    console.warn("[B-Logix] API load failed, falling back to localStorage", err);
    _apiAvailable = false;
    _apiCheckedAt = Date.now();
  }

  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try { return { source: "localStorage", data: JSON.parse(raw) }; } catch {
      localStorage.removeItem(LS_KEY);
    }
  }
  return { source: "default", data: null };
}

export async function saveData(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
  markDirty(); // localStorage is now ahead of Supabase until confirmed

  const token = getToken();
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
      body: JSON.stringify(data),
    });
    if (res.ok) { _apiAvailable = true; clearDirty(); return { saved: "api" }; }
    if (res.status === 401) {
      // Token expired or invalid — force re-login, don't show "offline"
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

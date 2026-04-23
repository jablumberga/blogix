/**
 * B-Logix - API Client
 * Sends session token with every request for server-side RLS enforcement.
 * Falls back to localStorage when API is unavailable.
 */

const API_URL = "/api/data";
const LS_KEY  = "blogix_data";
const TK_KEY  = "blogix_token";

let _apiAvailable = null;

export function resetApiCache() { _apiAvailable = null; }

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

async function checkApiAvailable() {
  if (_apiAvailable !== null) return _apiAvailable;
  try {
    const res = await fetch(API_URL, { method: "GET", headers: authHeaders() });
    _apiAvailable = res.ok || res.status === 401; // reachable even if auth fails
  } catch {
    _apiAvailable = false;
  }
  return _apiAvailable;
}

export async function loadData() {
  const online = await checkApiAvailable();

  if (online) {
    try {
      const res = await fetch(API_URL, { headers: authHeaders() });
      if (res.status === 401) {
        // No valid token — clear session and force re-login
        clearToken();
        try { localStorage.removeItem("blogix_session"); } catch {}
        return { source: "unauthenticated", data: null };
      }
      if (res.ok) {
        const apiData = await res.json();
        if (apiData && Object.keys(apiData).length > 0) {
          localStorage.setItem(LS_KEY, JSON.stringify(apiData));
          return { source: "api", data: apiData };
        }
      }
    } catch (err) {
      console.warn("[B-Logix] API load failed, falling back to localStorage", err);
    }
  }

  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try {
      return { source: "localStorage", data: JSON.parse(raw) };
    } catch {
      localStorage.removeItem(LS_KEY);
    }
  }

  return { source: "default", data: null };
}

export async function saveData(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));

  const online = await checkApiAvailable();
  if (!online) return { saved: "localStorage" };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (res.ok) return { saved: "api" };
  } catch (err) {
    console.warn("[B-Logix] API save failed, data kept in localStorage", err);
  }

  return { saved: "localStorage" };
}

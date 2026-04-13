/**
 * B-Logix - API Client (Front-End)
 *
 * Handles communication between the React front-end and
 * the Netlify Functions back-end.
 *
 * Falls back to localStorage if the API is unavailable.
 */

const API_URL = "/api/data";
const LS_KEY = "blogix_data";

let _apiAvailable = null;

async function checkApiAvailable() {
  if (_apiAvailable !== null) return _apiAvailable;
  try {
    const res = await fetch(API_URL, { method: "GET" });
    _apiAvailable = res.ok;
  } catch {
    _apiAvailable = false;
  }
  return _apiAvailable;
}

export async function loadData() {
  const online = await checkApiAvailable();

  if (online) {
    try {
      const res = await fetch(API_URL);
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
      const lsData = JSON.parse(raw);
      if (online && lsData && Object.keys(lsData).length > 0) {
        fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lsData),
        }).catch(() => {});
      }
      return { source: "localStorage", data: lsData };
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) return { saved: "api" };
  } catch (err) {
    console.warn("[B-Logix] API save failed, data kept in localStorage", err);
  }

  return { saved: "localStorage" };
}

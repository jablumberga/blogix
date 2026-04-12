const API_URL = "/api/data";
const LS_KEY = "blogix_data";
let _apiAvailable = null;

async function checkApiAvailable() {
  if (_apiAvailable !== null) return _apiAvailable;
  try {
    const res = await fetch(API_URL, { method: "GET" });
    _apiAvailable = res.ok;
  } catch { _apiAvailable = false; }
  return _apiAvailable;
}

export async function loadData() {
  const online = await checkApiAvailable();
  if (online) {
    try {
      const res = await fetch(API_URL);
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(LS_KEY, JSON.stringify(data));
        return { source: "api", data };
      }
    } catch (err) { console.warn("[B-Logix] API load failed", err); }
  }
  const raw = localStorage.getItem(LS_KEY);
  if (raw) { try { return { source: "localStorage", data: JSON.parse(raw) }; } catch { localStorage.removeItem(LS_KEY); } }
  return { source: "default", data: null };
}

export async function saveData(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
  const online = await checkApiAvailable();
  if (!online) return { saved: "localStorage" };
  try {
    const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) return { saved: "api" };
  } catch (err) { console.warn("[B-Logix] API save failed", err); }
  return { saved: "localStorage" };
}

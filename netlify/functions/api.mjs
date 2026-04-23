/**
 * B-Logix – Netlify Function (Back-End)
 * Endpoint: /api/data
 *
 * Stores and retrieves app state via Supabase (PostgreSQL).
 * Row Level Security enforced at API layer:
 *   - admin  → full read/write
 *   - partner → read own trucks/trips/expenses/settlements only
 *   - driver  → read own trips/expenses only
 *
 * Required env vars:
 *   SUPABASE_URL          e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY  service_role JWT
 *   BLOGIX_SECRET         secret for signing session tokens
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── JWT helpers (no external deps — Web Crypto API) ──────────────────────────
const enc = new TextEncoder();

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64url(obj) {
  // Use TextEncoder so Unicode chars (accents, etc.) are handled correctly
  const bytes = enc.encode(JSON.stringify(obj));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function signToken(payload, secret) {
  const header  = b64url({ alg: "HS256", typ: "JWT" });
  const body    = b64url({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 });
  const sig     = await hmacSign(secret, `${header}.${body}`);
  return `${header}.${body}.${sig}`;
}

export async function verifyToken(token, secret) {
  try {
    const [header, body, sig] = token.split(".");
    const expected = await hmacSign(secret, `${header}.${body}`);
    if (sig !== expected) return null;
    const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Row Level Security filter ─────────────────────────────────────────────────
function applyRLS(data, user) {
  if (user.role === "admin") return data; // admin sees everything

  if (user.role === "partner") {
    const partner    = (data.partners || []).find(p => p.id === user.refId);
    if (!partner) return { error: "Partner not found" };
    const myTrucks   = (data.trucks   || []).filter(tk => tk.partnerId === partner.id);
    const myTruckIds = new Set(myTrucks.map(tk => tk.id));
    const myTrips    = (data.trips    || []).filter(tr => myTruckIds.has(tr.truckId));
    const myTripIds   = new Set(myTrips.map(tr => tr.id));
    const myClientIds = new Set(myTrips.map(tr => tr.clientId).filter(Boolean));
    const myDriverIds = new Set(myTrips.map(tr => tr.driverId).filter(Boolean));
    // Include nominaTotalOverride expenses (tripId: null) for drivers on partner's trips
    const myExp = (data.expenses || []).filter(e =>
      myTripIds.has(e.tripId) ||
      (e.category === "nominaTotalOverride" && myDriverIds.has(e.driverId))
    );
    return {
      partners:         [partner],
      trucks:           myTrucks,
      trips:            myTrips,
      expenses:         myExp,
      clients:          (data.clients || []).filter(c => myClientIds.has(c.id)),
      drivers:          (data.drivers || []).filter(d => myDriverIds.has(d.id)),
      settlementStatus: data.settlementStatus || {},
      brokers:          [],
      suppliers:        [],
      fixedTemplates:   [],
      cobros:           [],
    };
  }

  if (user.role === "driver") {
    const driver    = (data.drivers || []).find(d => d.id === user.refId);
    if (!driver) return { error: "Driver not found" };
    const myTrips   = (data.trips   || []).filter(tr => tr.driverId === driver.id);
    const myTripIds = new Set(myTrips.map(tr => tr.id));
    // Include nominaTotalOverride expenses (tripId: null) for this driver
    const myExp     = (data.expenses|| []).filter(e =>
      myTripIds.has(e.tripId) ||
      (e.category === "nominaTotalOverride" && e.driverId === driver.id)
    );
    // Only expose the truck(s) assigned to this driver
    const myTruck   = driver.truckId ? (data.trucks || []).filter(tk => tk.id === driver.truckId) : [];
    return {
      drivers:          [driver],
      trips:            myTrips,
      expenses:         myExp,
      trucks:           myTruck,
      clients:          [],
      partners:         [], brokers: [], suppliers: [],
      settlementStatus: {}, fixedTemplates: [], cobros: [],
    };
  }

  return { error: "Unknown role" };
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
function supabaseHeaders(key) {
  return {
    "Content-Type": "application/json",
    "apikey": key,
    "Authorization": `Bearer ${key}`,
  };
}

const defaultData = {
  trips: [], drivers: [], trucks: [], clients: [], partners: [],
  brokers: [], suppliers: [], expenses: [], settlementStatus: {},
  cobros: [], fixedTemplates: [],
};

// ── Handler ───────────────────────────────────────────────────────────────────
export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, BLOGIX_SECRET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !BLOGIX_SECRET) {
    return Response.json({ error: "Missing env vars" }, { status: 500, headers: corsHeaders });
  }

  // ── Auth: verify session token ────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const sessionUser = token ? await verifyToken(token, BLOGIX_SECRET) : null;

  if (!sessionUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const tableUrl = `${SUPABASE_URL}/rest/v1/appdata`;
  const url = new URL(request.url);
  const isExport = url.pathname.endsWith("/export");

  // ── GET ───────────────────────────────────────────────────────────────────
  if (request.method === "GET") {
    const res = await fetch(`${tableUrl}?id=eq.1&select=data`, {
      headers: supabaseHeaders(SUPABASE_SERVICE_KEY),
    });

    let data = defaultData;
    if (res.ok) {
      const rows = await res.json();
      if (rows.length > 0) data = rows[0].data;
    }

    const filtered = applyRLS(data, sessionUser);
    if (filtered.error) {
      return Response.json({ error: filtered.error }, { status: 403, headers: corsHeaders });
    }

    if (isExport && sessionUser.role === "admin") {
      return new Response(JSON.stringify(data, null, 2), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="blogix-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }

    return Response.json(filtered, { headers: corsHeaders });
  }

  // ── POST (write — admin only) ─────────────────────────────────────────────
  if (request.method === "POST") {
    if (sessionUser.role !== "admin") {
      return Response.json({ error: "Forbidden: only admins can write" }, { status: 403, headers: corsHeaders });
    }

    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders }); }

    const knownKeys = ["trips", "drivers", "trucks", "clients", "expenses"];
    if (!knownKeys.some(k => k in body)) {
      return Response.json({ error: "Invalid data structure" }, { status: 400, headers: corsHeaders });
    }

    // Safety guard: reject a save where ALL core arrays are empty when DB already has data.
    // This prevents accidental data wipes (e.g. save firing before state loads).
    const coreKeys = ["trips", "clients", "trucks", "drivers", "expenses"];
    const incomingTotal = coreKeys.reduce((s, k) => s + (Array.isArray(body[k]) ? body[k].length : 0), 0);
    if (incomingTotal === 0) {
      // Check what's currently in the DB before allowing a full wipe
      const chkRes = await fetch(`${tableUrl}?id=eq.1&select=data`, { headers: supabaseHeaders(SUPABASE_SERVICE_KEY) });
      if (chkRes.ok) {
        const rows = await chkRes.json();
        const existing = rows[0]?.data;
        const existingTotal = coreKeys.reduce((s, k) => s + (Array.isArray(existing?.[k]) ? existing[k].length : 0), 0);
        if (existingTotal > 0) {
          return Response.json({ error: "Rejected: incoming data has no records but DB already has data. Possible accidental wipe." }, { status: 409, headers: corsHeaders });
        }
      }
    }

    const res = await fetch(tableUrl, {
      method: "POST",
      headers: { ...supabaseHeaders(SUPABASE_SERVICE_KEY), "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ id: 1, data: body, updated_at: new Date().toISOString() }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: err }, { status: 500, headers: corsHeaders });
    }

    return Response.json({ ok: true, savedAt: new Date().toISOString() }, { headers: corsHeaders });
  }

  return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
};

export const config = {
  path: ["/api/data", "/api/data/export"],
};

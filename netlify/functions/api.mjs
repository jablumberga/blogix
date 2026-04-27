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
 *
 * Optional env var (set AFTER running migration SQL):
 *   BLOGIX_RELATIONAL=true  → use relational bl_* tables instead of JSON blob
 */

const ALLOWED_ORIGINS = new Set([
  "https://blogix.do",
  "https://blogix-logistica-dr.netlify.app",
  "http://localhost:5173",
  "http://localhost:8888",
  "capacitor://localhost",
]);

function corsFor(request) {
  const origin = request?.headers?.get?.("origin") || "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://blogix.do";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

const corsHeaders = corsFor(null);

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
    const sigBytes = enc.encode(sig);
    const expBytes = enc.encode(expected);
    if (sigBytes.length !== expBytes.length) return null;
    let diff = 0;
    for (let i = 0; i < sigBytes.length; i++) diff |= sigBytes[i] ^ expBytes[i];
    if (diff !== 0) return null;
    const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload !== "object" || payload === null) return null;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Row Level Security filter ─────────────────────────────────────────────────
function applyRLS(data, user) {
  if (user.role === "admin") return data;

  if (user.role === "partner") {
    const partner    = (data.partners || []).find(p => p.id === user.refId);
    if (!partner) return { error: "Partner not found" };
    const myTrucks   = (data.trucks   || []).filter(tk => tk.partnerId === partner.id);
    const myTruckIds = new Set(myTrucks.map(tk => tk.id));
    const myTrips    = (data.trips    || []).filter(tr => myTruckIds.has(tr.truckId));
    const myTripIds   = new Set(myTrips.map(tr => tr.id));
    const myClientIds = new Set(myTrips.map(tr => tr.clientId).filter(Boolean));
    const myDriverIds = new Set(myTrips.map(tr => tr.driverId).filter(Boolean));
    const myExp = (data.expenses || []).filter(e =>
      myTripIds.has(e.tripId) ||
      (e.driverId && myDriverIds.has(e.driverId) && !e.tripId)
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
      invoices:         [],
    };
  }

  if (user.role === "driver") {
    const driver    = (data.drivers || []).find(d => d.id === user.refId);
    if (!driver) return { error: "Driver not found" };
    const myTrips   = (data.trips   || []).filter(tr => tr.driverId === driver.id);
    const myTripIds = new Set(myTrips.map(tr => tr.id));
    const myExp     = (data.expenses|| []).filter(e =>
      myTripIds.has(e.tripId) ||
      (e.driverId === driver.id && !e.tripId)
    );
    // Return trucks by driver.truckId OR by truck.driverId — whichever is set
    const myTrucks  = (data.trucks || []).filter(tk =>
      tk.id === driver.truckId || tk.driverId === driver.id
    );
    // Drivers need active clients to fill out the new-trip form
    const activeClients = (data.clients || []).filter(c => !c.status || c.status === "active");
    return {
      drivers:          [driver],
      trips:            myTrips,
      expenses:         myExp,
      trucks:           myTrucks,
      clients:          activeClients,
      partners:         [], brokers: [], suppliers: [],
      settlementStatus: {}, fixedTemplates: [], cobros: [], invoices: [],
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
  cobros: [], fixedTemplates: [], invoices: [],
};

// ── Relational table helpers ──────────────────────────────────────────────────

async function readTable(url, key, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=rec&order=id`, {
    headers: supabaseHeaders(key),
  });
  if (!res.ok) {
    // 406 = table doesn't exist in PostgREST. Throw so the caller can fall back to legacy blob
    // rather than returning empty arrays that would overwrite good local data.
    if (res.status === 406) throw new Error(`Table '${table}' not found — run DB migration`);
    return [];
  }
  const rows = await res.json();
  return rows.map(r => r.rec);
}

async function readSettlementStatus(url, key) {
  const res = await fetch(`${url}/rest/v1/bl_settlement_status?id=eq.1&select=data`, {
    headers: supabaseHeaders(key),
  });
  if (!res.ok) {
    if (res.status === 406) throw new Error("Table 'bl_settlement_status' not found — run DB migration");
    return {};
  }
  const rows = await res.json();
  return rows[0]?.data || {};
}

async function readAllTables(url, key) {
  const [
    trips, expenses, trucks, drivers, clients, partners,
    brokers, suppliers, invoices, cobros, fixedTemplates, settlementStatus,
  ] = await Promise.all([
    readTable(url, key, "bl_trips"),
    readTable(url, key, "bl_expenses"),
    readTable(url, key, "bl_trucks"),
    readTable(url, key, "bl_drivers"),
    readTable(url, key, "bl_clients"),
    readTable(url, key, "bl_partners"),
    readTable(url, key, "bl_brokers"),
    readTable(url, key, "bl_suppliers"),
    readTable(url, key, "bl_invoices"),
    readTable(url, key, "bl_cobros"),
    readTable(url, key, "bl_fixed_templates"),
    readSettlementStatus(url, key),
  ]);
  return { trips, expenses, trucks, drivers, clients, partners, brokers, suppliers, invoices, cobros, fixedTemplates, settlementStatus };
}

// Upsert all records into a table and delete records no longer present.
async function syncTable(url, key, table, records) {
  if (!records || !Array.isArray(records)) return;

  // Upsert incoming records
  const rows = records.filter(r => r.id != null).map(r => ({ id: r.id, rec: r }));
  if (rows.length > 0) {
    const upsertRes = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...supabaseHeaders(key), "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify(rows),
    });
    if (!upsertRes.ok) {
      const err = await upsertRes.text();
      throw new Error(`Failed to upsert ${table}: ${err}`);
    }
  }

  // Delete records that no longer exist in the incoming set — validate IDs to prevent filter injection
  const incomingIds = rows.map(r => Number(r.id)).filter(n => Number.isInteger(n) && n > 0);
  if (incomingIds.length > 0) {
    const delRes = await fetch(`${url}/rest/v1/${table}?id=not.in.(${incomingIds.join(",")})`, {
      method: "DELETE",
      headers: supabaseHeaders(key),
    });
    if (!delRes.ok) {
      const err = await delRes.text();
      console.warn(`[syncTable] DELETE stale rows from ${table} failed (non-fatal): ${err}`);
    }
  } else {
    // Empty array → clear the table (safety guard already confirmed it's intentional)
    const delRes = await fetch(`${url}/rest/v1/${table}`, {
      method: "DELETE",
      headers: supabaseHeaders(key),
    });
    if (!delRes.ok) {
      const err = await delRes.text();
      console.warn(`[syncTable] Clear ${table} failed (non-fatal): ${err}`);
    }
  }
}

async function syncSettlementStatus(url, key, data) {
  await fetch(`${url}/rest/v1/bl_settlement_status`, {
    method: "POST",
    headers: { ...supabaseHeaders(key), "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ id: 1, data: data || {} }),
  });
}

async function syncAllTables(url, key, body) {
  const errors = [];
  const run = async (label, fn) => {
    try { await fn(); } catch (e) { errors.push(`${label}: ${e.message}`); }
  };
  await run("bl_trips",            () => syncTable(url, key, "bl_trips",           body.trips));
  await run("bl_expenses",         () => syncTable(url, key, "bl_expenses",        body.expenses));
  await run("bl_trucks",           () => syncTable(url, key, "bl_trucks",          body.trucks));
  await run("bl_drivers",          () => syncTable(url, key, "bl_drivers",         body.drivers));
  await run("bl_clients",          () => syncTable(url, key, "bl_clients",         body.clients));
  await run("bl_partners",         () => syncTable(url, key, "bl_partners",        body.partners));
  await run("bl_brokers",          () => syncTable(url, key, "bl_brokers",         body.brokers));
  await run("bl_suppliers",        () => syncTable(url, key, "bl_suppliers",       body.suppliers));
  await run("bl_invoices",         () => syncTable(url, key, "bl_invoices",        body.invoices));
  await run("bl_cobros",           () => syncTable(url, key, "bl_cobros",          body.cobros));
  await run("bl_fixed_templates",  () => syncTable(url, key, "bl_fixed_templates", body.fixedTemplates));
  // Only stamp the version if all tables synced successfully — a partial write must not advance the version
  if (errors.length === 0) {
    await run("bl_settlement_status", () => syncSettlementStatus(url, key, body.settlementStatus));
  }
  if (errors.length > 0) throw new Error(errors.join("; "));
}

// Re-injects passwords that GET strips for security.
// When admin saves a partner/driver without changing the password, the incoming
// record has no password field (GET never returns them). We fetch the existing
// password from Supabase and restore it so the sync doesn't wipe it.
async function restorePasswords(url, key, records, table) {
  if (!Array.isArray(records) || records.length === 0) return records;
  if (records.every(r => r.password)) return records; // all have new passwords — skip fetch
  const res = await fetch(`${url}/rest/v1/${table}?select=id,rec`, {
    headers: supabaseHeaders(key),
  });
  if (!res.ok) return records;
  const rows = await res.json();
  const pwMap = new Map(rows.filter(r => r.rec?.password).map(r => [r.id, r.rec.password]));
  return records.map(r => {
    if (r.password) return r;                           // admin set a new password — use it
    const existing = pwMap.get(r.id);
    return existing ? { ...r, password: existing } : r; // restore existing or leave bare
  });
}

// Safety guard for relational mode — checks that an incoming empty array is not
// wiping a table that still has records.
async function relationalSafetyCheck(url, key, body, coreKeys) {
  const tableMap = {
    trips: "bl_trips", clients: "bl_clients", trucks: "bl_trucks",
    drivers: "bl_drivers", expenses: "bl_expenses", partners: "bl_partners",
    invoices: "bl_invoices", cobros: "bl_cobros",
  };

  for (const k of coreKeys) {
    if (!Array.isArray(body[k]) || body[k].length > 0) continue;
    const tbl = tableMap[k];
    if (!tbl) continue;
    const chkRes = await fetch(`${url}/rest/v1/${tbl}?select=id&limit=1`, {
      headers: supabaseHeaders(key),
    });
    if (!chkRes.ok) {
      // 404/406 = table doesn't exist — hard block to prevent wiping missing tables
      if (chkRes.status === 404 || chkRes.status === 406) {
        return `Rejected: cannot verify "${k}" — table not found (HTTP ${chkRes.status}). Run DB migration first.`;
      }
      // Transient error (503, 429, 504…) — allow the write rather than permanently blocking saves
      console.warn(`[safetyCheck] ${tbl} probe returned ${chkRes.status} — allowing write`);
      continue;
    }
    const rows = await chkRes.json();
    if (rows.length > 0) {
      return `Rejected: incoming "${k}" is empty but DB has records. Possible accidental wipe.`;
    }
  }
  return null; // no problem
}

function stripPasswords(data) {
  const strip = arr => Array.isArray(arr) ? arr.map(({ password: _pw, ...rest }) => rest) : arr;
  return { ...data, partners: strip(data.partners), drivers: strip(data.drivers) };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async (request) => {
  const corsHeaders = corsFor(request); // per-request CORS restricts to known origins

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, BLOGIX_SECRET, BLOGIX_RELATIONAL } = process.env;
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

  const legacyTableUrl = `${SUPABASE_URL}/rest/v1/appdata`;
  const url = new URL(request.url);
  const isExport = url.pathname.endsWith("/export");
  const useRelational = BLOGIX_RELATIONAL === "true";

  // ── GET ───────────────────────────────────────────────────────────────────
  if (request.method === "GET") {
    let data = defaultData;
    let serverVersion = 0;

    if (useRelational) {
      try {
        data = await readAllTables(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        serverVersion = data.settlementStatus?._version || 0;
      } catch (relErr) {
        // bl_* tables don't exist yet — fall back to legacy blob so client data isn't wiped.
        // This happens when BLOGIX_RELATIONAL=true is set before running the migration SQL.
        const blobRes = await fetch(`${legacyTableUrl}?id=eq.1&select=data,updated_at`, {
          headers: supabaseHeaders(SUPABASE_SERVICE_KEY),
        });
        if (blobRes.ok) {
          const rows = await blobRes.json();
          if (rows[0]?.data) {
            data = rows[0].data;
            serverVersion = rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : 0;
          } else {
            return Response.json({ error: `Relational tables unavailable: ${relErr.message}` }, { status: 500, headers: corsHeaders });
          }
        } else {
          return Response.json({ error: `Relational tables unavailable: ${relErr.message}` }, { status: 500, headers: corsHeaders });
        }
      }
    } else {
      const res = await fetch(`${legacyTableUrl}?id=eq.1&select=data,updated_at`, {
        headers: supabaseHeaders(SUPABASE_SERVICE_KEY),
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows.length > 0) {
          data = rows[0].data;
          serverVersion = rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : 0;
        }
      }
    }

    const filtered = applyRLS(data, sessionUser);
    if (filtered.error) {
      return Response.json({ error: filtered.error }, { status: 403, headers: corsHeaders });
    }

    const safeFiltered = stripPasswords(filtered);

    if (isExport && sessionUser.role === "admin") {
      return new Response(JSON.stringify(stripPasswords(data), null, 2), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="blogix-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }

    return Response.json({ ...safeFiltered, _version: serverVersion }, { headers: corsHeaders });
  }

  // ── POST (write) ──────────────────────────────────────────────────────────
  if (request.method === "POST") {
    if (sessionUser.role === "partner") {
      return Response.json({ error: "Forbidden: partners are read-only" }, { status: 403, headers: corsHeaders });
    }

    // ── Driver write: only own trips + expenses ───────────────────────────
    if (sessionUser.role === "driver") {
      let body;
      try { body = await request.json(); }
      catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders }); }

      const driverId = sessionUser.refId;
      if (!Number.isInteger(driverId) || driverId <= 0) {
        return Response.json({ error: "Invalid session" }, { status: 403, headers: corsHeaders });
      }
      const driverTrips = (body.trips || [])
        .filter(tr => tr.driverId === driverId)
        .filter(tr => { const n = Number(tr.id); return Number.isInteger(n) && n > 0; });
      const driverTripIds = new Set(driverTrips.map(tr => tr.id));
      const driverExps = (body.expenses || [])
        .filter(e => driverTripIds.has(e.tripId) || e.driverId === driverId)
        .filter(e => { const n = Number(e.id); return Number.isInteger(n) && n > 0; });

      if (useRelational) {
        // Upsert driver's trips (skip upsert if none, but always delete stale)
        if (driverTrips.length > 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/bl_trips`, {
            method: "POST",
            headers: { ...supabaseHeaders(SUPABASE_SERVICE_KEY), "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify(driverTrips.map(tr => ({ id: tr.id, rec: tr }))),
          });
        }
        const tripIds = driverTrips.map(tr => tr.id);
        const tripDeleteUrl = tripIds.length > 0
          ? `${SUPABASE_URL}/rest/v1/bl_trips?rec->>driverId=eq.${driverId}&id=not.in.(${tripIds.join(",")})`
          : `${SUPABASE_URL}/rest/v1/bl_trips?rec->>driverId=eq.${driverId}`;
        await fetch(tripDeleteUrl, { method: "DELETE", headers: supabaseHeaders(SUPABASE_SERVICE_KEY) });

        // Upsert driver's expenses (skip upsert if none, but always delete stale)
        if (driverExps.length > 0) {
          await fetch(`${SUPABASE_URL}/rest/v1/bl_expenses`, {
            method: "POST",
            headers: { ...supabaseHeaders(SUPABASE_SERVICE_KEY), "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify(driverExps.map(e => ({ id: e.id, rec: e }))),
          });
        }
        const expIds = driverExps.map(e => e.id);
        // Exclude nominaTotalOverride — those are admin-created and must not be wiped by driver saves
        const expDeleteUrl = expIds.length > 0
          ? `${SUPABASE_URL}/rest/v1/bl_expenses?rec->>driverId=eq.${driverId}&rec->>category=neq.nominaTotalOverride&id=not.in.(${expIds.join(",")})`
          : `${SUPABASE_URL}/rest/v1/bl_expenses?rec->>driverId=eq.${driverId}&rec->>category=neq.nominaTotalOverride`;
        await fetch(expDeleteUrl, { method: "DELETE", headers: supabaseHeaders(SUPABASE_SERVICE_KEY) });
      } else {
        // Legacy JSON blob: read-modify-write for driver's records only
        const chkRes = await fetch(`${legacyTableUrl}?id=eq.1&select=data`, { headers: supabaseHeaders(SUPABASE_SERVICE_KEY) });
        if (chkRes.ok) {
          const rows = await chkRes.json();
          const existing = rows[0]?.data || defaultData;
          const mergedTrips = [
            ...(existing.trips || []).filter(tr => tr.driverId !== driverId),
            ...driverTrips,
          ];
          const mergedExps = [
            ...(existing.expenses || []).filter(e =>
              (e.driverId !== driverId && !driverTripIds.has(e.tripId)) ||
              e.category === "nominaTotalOverride"
            ),
            ...driverExps,
          ];
          await fetch(legacyTableUrl, {
            method: "POST",
            headers: { ...supabaseHeaders(SUPABASE_SERVICE_KEY), "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify({ id: 1, data: { ...existing, trips: mergedTrips, expenses: mergedExps }, updated_at: new Date().toISOString() }),
          });
        }
      }
      return Response.json({ ok: true, savedAt: new Date().toISOString(), mode: "driver-write" }, { headers: corsHeaders });
    }

    if (sessionUser.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
    }

    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders }); }

    const knownKeys = ["trips", "drivers", "trucks", "clients", "expenses", "invoices"];
    if (!knownKeys.some(k => k in body)) {
      return Response.json({ error: "Invalid data structure" }, { status: 400, headers: corsHeaders });
    }

    // ── Optimistic locking ───────────────────────────────────────────────────
    // clientVersion === 0 means "loaded from localStorage while offline — skip check"
    const { _version: clientVersion = 0, ...bodyData } = body;
    body = bodyData;

    if (clientVersion !== 0) {
      let serverVersion = 0;
      if (useRelational) {
        const sRes = await fetch(`${SUPABASE_URL}/rest/v1/bl_settlement_status?id=eq.1&select=data`, {
          headers: supabaseHeaders(SUPABASE_SERVICE_KEY),
        });
        if (sRes.ok) {
          const rows = await sRes.json();
          serverVersion = rows[0]?.data?._version || 0;
        }
      } else {
        const sRes = await fetch(`${legacyTableUrl}?id=eq.1&select=updated_at`, {
          headers: supabaseHeaders(SUPABASE_SERVICE_KEY),
        });
        if (sRes.ok) {
          const rows = await sRes.json();
          serverVersion = rows[0]?.updated_at ? new Date(rows[0].updated_at).getTime() : 0;
        }
      }
      if (serverVersion !== 0 && clientVersion !== serverVersion) {
        return Response.json({ error: "conflict" }, { status: 409, headers: corsHeaders });
      }
    }

    const coreKeys = ["trips", "clients", "trucks", "drivers", "expenses", "partners", "invoices", "cobros"];
    const anyEmpty = coreKeys.some(k => Array.isArray(body[k]) && body[k].length === 0);

    if (useRelational) {
      // Safety guard against accidental wipe — checks relational tables
      if (anyEmpty) {
        const guardError = await relationalSafetyCheck(SUPABASE_URL, SUPABASE_SERVICE_KEY, body, coreKeys);
        if (guardError) {
          return Response.json({ error: guardError }, { status: 409, headers: corsHeaders });
        }
      }

      // Restore passwords that GET strips — prevents every admin save from wiping login credentials
      if (body.partners) body.partners = await restorePasswords(SUPABASE_URL, SUPABASE_SERVICE_KEY, body.partners, "bl_partners");
      if (body.drivers)  body.drivers  = await restorePasswords(SUPABASE_URL, SUPABASE_SERVICE_KEY, body.drivers,  "bl_drivers");

      try {
        await syncAllTables(SUPABASE_URL, SUPABASE_SERVICE_KEY, body);
        // Stamp the new version so the next writer can detect a concurrent edit
        const newVersion = Date.now();
        await syncSettlementStatus(SUPABASE_URL, SUPABASE_SERVICE_KEY, { ...(body.settlementStatus || {}), _version: newVersion });
        return Response.json({ ok: true, savedAt: new Date().toISOString(), mode: "relational", _version: newVersion }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500, headers: corsHeaders });
      }
    }

    // ── Legacy JSON blob path ─────────────────────────────────────────────
    // Read existing data for wipe-guard AND password restoration
    {
      const chkRes = await fetch(`${legacyTableUrl}?id=eq.1&select=data`, { headers: supabaseHeaders(SUPABASE_SERVICE_KEY) });
      if (chkRes.ok) {
        const rows = await chkRes.json();
        const existing = rows[0]?.data;
        if (existing) {
          // Wipe guard
          if (anyEmpty) {
            for (const k of coreKeys) {
              if (Array.isArray(body[k]) && body[k].length === 0 && Array.isArray(existing[k]) && existing[k].length > 0) {
                return Response.json({ error: `Rejected: incoming "${k}" is empty but DB has ${existing[k].length} records. Possible accidental wipe.` }, { status: 409, headers: corsHeaders });
              }
            }
          }
          // Restore passwords that GET strips
          const mergePw = (incoming, saved) => {
            if (!Array.isArray(incoming) || !Array.isArray(saved)) return incoming;
            const pwMap = new Map(saved.filter(r => r.password).map(r => [r.id, r.password]));
            return incoming.map(r => r.password ? r : (pwMap.get(r.id) ? { ...r, password: pwMap.get(r.id) } : r));
          };
          if (body.partners) body.partners = mergePw(body.partners, existing.partners);
          if (body.drivers)  body.drivers  = mergePw(body.drivers,  existing.drivers);
        }
      }
    }

    // updated_at acts as the version stamp for blob mode — echo it back so client stays in sync
    const newVersion = Date.now();
    const res = await fetch(legacyTableUrl, {
      method: "POST",
      headers: { ...supabaseHeaders(SUPABASE_SERVICE_KEY), "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ id: 1, data: body, updated_at: new Date(newVersion).toISOString() }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: err }, { status: 500, headers: corsHeaders });
    }

    return Response.json({ ok: true, savedAt: new Date(newVersion).toISOString(), _version: newVersion }, { headers: corsHeaders });
  }

  return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
};

export const config = {
  path: ["/api/data", "/api/data/export"],
};

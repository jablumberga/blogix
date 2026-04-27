/**
 * B-Logix – Auth Function
 * POST /api/auth/login  → { username, password } → { ok, user, token }
 * POST /api/auth/logout → {} → { ok }
 *
 * Required env vars:
 *   SUPABASE_URL          e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY  service_role JWT
 *   BLOGIX_SECRET         secret for signing session JWTs
 */

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { signToken } from "./api.mjs";

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
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// ── Persistent rate limiter — Supabase-backed, in-memory fallback ────────────
// Per-IP:       30 attempts / 15-min window
// Per-username: 10 attempts / 15-min window
// Falls back to in-memory tracking if Supabase is unreachable (1.5s timeout).
const RATE_WINDOW_SEC = 15 * 60;
const IP_MAX          = 30;
const USER_MAX        = 10;

// Fallback in-memory store (survives only within the same lambda instance)
const _fallback = new Map(); // `${scope}:${key}` → { count, windowStart }
function _fallbackHit(scope, key, max) {
  const k   = `${scope}:${key}`;
  const now = Date.now();
  const e   = _fallback.get(k);
  if (!e || now - e.windowStart > RATE_WINDOW_SEC * 1000) {
    _fallback.set(k, { count: 1, windowStart: now });
    return 1;
  }
  e.count++;
  return e.count;
}

async function _supabaseHit(supabaseUrl, supabaseKey, scope, key, max) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/bl_rate_limit_hit`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ p_scope: scope, p_key: key, p_max: max, p_window: RATE_WINDOW_SEC }),
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`rpc status ${res.status}`);
    return await res.json(); // returns the new count
  } catch {
    clearTimeout(timer);
    return null; // signal fallback
  }
}

async function checkRateLimit(ip, username, supabaseUrl, supabaseKey) {
  const hasSupa = !!(supabaseUrl && supabaseKey);

  const usernameKey = username.toLowerCase().trim();
  let ipCount, userCount;
  if (hasSupa) {
    [ipCount, userCount] = await Promise.all([
      _supabaseHit(supabaseUrl, supabaseKey, "ip",   ip,          IP_MAX),
      _supabaseHit(supabaseUrl, supabaseKey, "user", usernameKey, USER_MAX),
    ]);
  }
  // If Supabase is unreachable, use in-memory fallback only when no Supabase creds are
  // configured (local dev). In production the RPC must work — allow the attempt through
  // rather than silently bypassing limits with a per-instance counter that resets on cold starts.
  if (ipCount === null || userCount === null) {
    if (!hasSupa) {
      if (ipCount   === null) ipCount   = _fallbackHit("ip",   ip,          IP_MAX);
      if (userCount === null) userCount = _fallbackHit("user", usernameKey, USER_MAX);
    } else {
      // Supabase RPC failed in production — log and allow through (don't block legitimate logins)
      console.warn("[auth] rate-limit RPC unavailable — allowing attempt through");
      return false;
    }
  }

  return ipCount > IP_MAX || userCount > USER_MAX;
}

export default async (request) => {
  const corsHeaders = corsFor(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const { BLOGIX_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_PASSWORD_HASH, DEMO_PASSWORD_HASH, BLOGIX_RELATIONAL } = process.env;
  if (!BLOGIX_SECRET) {
    return Response.json({ error: "Missing BLOGIX_SECRET env var" }, { status: 500, headers: corsHeaders });
  }
  if (!ADMIN_PASSWORD_HASH) {
    return Response.json({ error: "Missing ADMIN_PASSWORD_HASH env var" }, { status: 500, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const action = url.pathname.split("/").pop();

  if (action === "logout") {
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  if (action === "login") {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
               request.headers.get("x-real-ip") || "unknown";

    // ── Input validation (before rate limit so we have the username) ────────
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders }); }

    const { username, password } = body;
    if (!username || !password) {
      return Response.json({ error: "Username and password required" }, { status: 400, headers: corsHeaders });
    }
    if (typeof username !== "string" || typeof password !== "string" ||
        username.length > 64 || password.length > 256) {
      return Response.json({ error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
    }

    // ── Persistent rate limiting (per-IP and per-username) ──────────────────
    const isRateLimited = await checkRateLimit(ip, username, SUPABASE_URL, SUPABASE_SERVICE_KEY);
    if (isRateLimited) {
      return Response.json({ error: "Too many attempts — try again in 15 minutes" }, { status: 429, headers: corsHeaders });
    }

    // ── Build user list ─────────────────────────────────────────────────────
    const adminUsers = [
      { id: 1, username: "admin", password: ADMIN_PASSWORD_HASH, role: "admin", name: "Alexander", refId: null },
      ...(DEMO_PASSWORD_HASH ? [{ id: 99, username: "demo", password: DEMO_PASSWORD_HASH, role: "admin", name: "Demo", refId: null }] : []),
    ];

    let dynamicUsers = [];
    let supabaseData = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      if (BLOGIX_RELATIONAL === "true") {
        // Relational mode — bl_* tables use { id, rec } column layout (api.mjs pattern)
        try {
          const sbHeaders = { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` };
          const [pRes, dRes] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/bl_partners?select=id,rec`, { headers: sbHeaders }),
            fetch(`${SUPABASE_URL}/rest/v1/bl_drivers?select=id,rec`,  { headers: sbHeaders }),
          ]);
          const partners = pRes.ok
            ? (await pRes.json())
                .filter(row => row.rec?.username && row.rec?.password)
                .map(row => ({ id: `p-${row.id}`, _dbId: row.id, _role: "partner", username: row.rec.username, password: row.rec.password, role: "partner", name: row.rec.name, refId: row.id }))
            : [];
          const drivers = dRes.ok
            ? (await dRes.json())
                .filter(row => row.rec?.username && row.rec?.password)
                .map(row => ({ id: `d-${row.id}`, _dbId: row.id, _role: "driver", username: row.rec.username, password: row.rec.password, role: "driver", name: row.rec.name, refId: row.id }))
            : [];
          dynamicUsers = [...partners, ...drivers];
        } catch (err) {
          console.warn("[auth] Failed to load users from relational tables:", err.message);
        }
      } else {
        // Blob mode — read from appdata JSON
        try {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/appdata?id=eq.1&select=data`, {
            headers: {
              "Content-Type": "application/json",
              "apikey": SUPABASE_SERVICE_KEY,
              "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
          });
          if (res.ok) {
            const rows = await res.json();
            supabaseData = rows[0]?.data;
            if (supabaseData) {
              const partners = (supabaseData.partners || [])
                .filter(p => p.username && p.password)
                .map(p => ({ id: `p-${p.id}`, _dbId: p.id, _role: "partner", username: p.username, password: p.password, role: "partner", name: p.name, refId: p.id }));
              const drivers = (supabaseData.drivers || [])
                .filter(d => d.username && d.password)
                .map(d => ({ id: `d-${d.id}`, _dbId: d.id, _role: "driver", username: d.username, password: d.password, role: "driver", name: d.name, refId: d.id }));
              dynamicUsers = [...partners, ...drivers];
            }
          }
        } catch (err) {
          console.warn("[auth] Failed to load dynamic users from Supabase:", err.message);
        }
      }
    }

    const allUsers = [...adminUsers, ...dynamicUsers];
    const candidate = allUsers.find(u => u.username === username);

    if (!candidate) {
      return Response.json({ ok: false, error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
    }

    // ── Verify password ─────────────────────────────────────────────────────
    const isHashed = typeof candidate.password === "string" && candidate.password.startsWith("$2");
    let match = false;
    if (isHashed) {
      match = await bcrypt.compare(password, candidate.password);
    } else {
      // timingSafeEqual throws RangeError if buffers differ in length — catch it
      try {
        const a = Buffer.from(password);
        const b = Buffer.from(candidate.password);
        match = a.length === b.length && crypto.timingSafeEqual(a, b);
      } catch {
        match = false;
      }
    }

    if (!match) {
      return Response.json({ ok: false, error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
    }

    // ── Lazy bcrypt upgrade for plaintext partner/driver passwords ───────────
    if (!isHashed && candidate._dbId && candidate._role && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const newHash = await bcrypt.hash(password, 10);
        if (BLOGIX_RELATIONAL === "true") {
          // bl_* tables store all fields inside rec JSONB — must read current rec then merge
          const table = candidate._role === "partner" ? "bl_partners" : "bl_drivers";
          const getRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${candidate._dbId}&select=rec`, {
            headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}` },
          });
          if (getRes.ok) {
            const rows = await getRes.json();
            const currentRec = rows[0]?.rec;
            if (currentRec) {
              const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${candidate._dbId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", "apikey": SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`, "Prefer": "return=minimal" },
                body: JSON.stringify({ rec: { ...currentRec, password: newHash } }),
              });
              if (!patchRes.ok) {
                const detail = await patchRes.text();
                console.warn(`[auth] PATCH ${table} password upgrade failed (${patchRes.status}): ${detail}`);
              }
            }
          }
        } else if (supabaseData) {
          const section = candidate._role === "partner" ? "partners" : "drivers";
          const updated = (supabaseData[section] || []).map(u =>
            u.id === candidate._dbId ? { ...u, password: newHash } : u
          );
          supabaseData = { ...supabaseData, [section]: updated };
          await fetch(`${SUPABASE_URL}/rest/v1/appdata`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": SUPABASE_SERVICE_KEY,
              "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
              "Prefer": "resolution=merge-duplicates",
            },
            body: JSON.stringify({ id: 1, data: supabaseData, updated_at: new Date().toISOString() }),
          });
        }
        console.log(`[auth] Upgraded plaintext password to bcrypt for ${candidate._role} ${candidate.username}`);
      } catch (err) {
        console.warn("[auth] Failed to upgrade password hash:", err.message);
      }
    } else if (!isHashed) {
      console.warn(`[auth] WARNING: plaintext password for user ${candidate.username} — will upgrade on next login once Supabase is reachable`);
    }

    // ── Issue JWT ───────────────────────────────────────────────────────────
    // Note: intentionally NOT resetting the rate limit on success — doing so
    // would allow an attacker to reset the counter by guessing one account and
    // immediately begin brute-forcing another.
    const { password: _pw, _dbId: _d, _role: _r, ...safeUser } = candidate;
    const token = await signToken(
      { id: safeUser.id, role: safeUser.role, name: safeUser.name, refId: safeUser.refId ?? null },
      BLOGIX_SECRET
    );

    return Response.json({ ok: true, user: safeUser, token }, { headers: corsHeaders });
  }

  return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });
};

export const config = {
  path: ["/api/auth/login", "/api/auth/logout"],
};

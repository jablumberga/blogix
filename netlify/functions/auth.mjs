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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── In-memory rate limiter (per IP, resets on cold start) ────────────────────
// Max 10 attempts per 15-minute window per IP before lockout.
const loginAttempts = new Map(); // ip → { count, windowStart }
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX       = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: now });
    return false; // not limited
  }
  entry.count++;
  return entry.count > RATE_MAX;
}

function resetRateLimit(ip) {
  loginAttempts.delete(ip);
}

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const { BLOGIX_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_PASSWORD_HASH, DEMO_PASSWORD_HASH } = process.env;
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
    // ── Rate limiting ───────────────────────────────────────────────────────
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
               request.headers.get("x-real-ip") || "unknown";
    if (checkRateLimit(ip)) {
      return Response.json({ error: "Too many attempts — try again in 15 minutes" }, { status: 429, headers: corsHeaders });
    }

    // ── Input validation ────────────────────────────────────────────────────
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

    // ── Build user list ─────────────────────────────────────────────────────
    const adminUsers = [
      { id: 1, username: "admin", password: ADMIN_PASSWORD_HASH, role: "admin", name: "Alexander", refId: null },
      ...(DEMO_PASSWORD_HASH ? [{ id: 99, username: "demo", password: DEMO_PASSWORD_HASH, role: "admin", name: "Demo", refId: null }] : []),
    ];

    let dynamicUsers = [];
    let supabaseData = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
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

    const allUsers = [...adminUsers, ...dynamicUsers];
    const candidate = allUsers.find(u => u.username === username);

    if (!candidate) {
      return Response.json({ ok: false, error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
    }

    // ── Verify password ─────────────────────────────────────────────────────
    const isHashed = typeof candidate.password === "string" && candidate.password.startsWith("$2");
    const match = isHashed
      ? await bcrypt.compare(password, candidate.password)
      : crypto.timingSafeEqual(Buffer.from(password), Buffer.from(candidate.password));

    if (!match) {
      return Response.json({ ok: false, error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
    }

    // ── Lazy bcrypt upgrade for plaintext partner/driver passwords ───────────
    if (!isHashed && candidate._dbId && candidate._role && SUPABASE_URL && SUPABASE_SERVICE_KEY && supabaseData) {
      try {
        const newHash = await bcrypt.hash(password, 10);
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

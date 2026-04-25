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
import { signToken } from "./api.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};


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
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders }); }

    const { username, password } = body;
    if (!username || !password) {
      return Response.json({ error: "Username and password required" }, { status: 400, headers: corsHeaders });
    }

    // Admin user list (hardcoded + env override for password hash)
    const adminUsers = [
      { id: 1, username: "admin", password: ADMIN_PASSWORD_HASH, role: "admin", name: "Alexander", refId: null },
      ...(DEMO_PASSWORD_HASH ? [{ id: 99, username: "demo", password: DEMO_PASSWORD_HASH, role: "admin", name: "Demo", refId: null }] : []),
    ];

    // Fetch dynamic partners/drivers from Supabase
    let dynamicUsers = [];
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
          const data = rows[0]?.data;
          if (data) {
            const partners = (data.partners || [])
              .filter(p => p.username && p.password)
              .map(p => ({ id: `p-${p.id}`, username: p.username, password: p.password, role: "partner", name: p.name, refId: p.id }));
            const drivers = (data.drivers || [])
              .filter(d => d.username && d.password)
              .map(d => ({ id: `d-${d.id}`, username: d.username, password: d.password, role: "driver", name: d.name, refId: d.id }));
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

    const isHashed = typeof candidate.password === "string" && candidate.password.startsWith("$2");
    if (!isHashed) console.warn(`[auth] WARNING: plaintext password for user ${candidate.username} — migrate to bcrypt`);
    const match = isHashed
      ? await bcrypt.compare(password, candidate.password)
      : candidate.password === password;

    if (!match) {
      return Response.json({ ok: false, error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
    }

    const { password: _pw, ...safeUser } = candidate;
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

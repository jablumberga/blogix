/**
 * B-Logix – Auth Function
 * POST /api/auth/login  → { username, password } → { ok, user, token }
 * POST /api/auth/logout → {} → { ok }
 *
 * Required env vars:
 *   BLOGIX_SECRET  secret for signing session JWTs
 */

import { getStore } from "@netlify/blobs";
import { signToken } from "./api.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const defaultUsers = [
  { id: 1, username: "admin", password: "admin123", role: "admin", name: "Alexander", refId: null },
];

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const { BLOGIX_SECRET } = process.env;
  if (!BLOGIX_SECRET) {
    return Response.json({ error: "Missing BLOGIX_SECRET env var" }, { status: 500, headers: corsHeaders });
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

    const store = getStore("blogix");
    const data  = await store.get("blogix-appdata", { type: "json" });
    const users = data?.users || defaultUsers;

    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
      return Response.json({ ok: false, error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
    }

    const { password: _pw, ...safeUser } = user;
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

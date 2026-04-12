/**
 * B-Logix – Auth Function (Back-End)
 * Endpoint: /api/auth
 *
 * Simple authentication against users stored in Netlify Blobs.
 *
 * POST /api/auth/login  → { username, password } → { ok, user }
 * POST /api/auth/logout → {} → { ok }
 */

import { getStore } from "@netlify/blobs";

const BLOB_KEY = "blogix-appdata";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const defaultUsers = [
  { id: 1, username: "admin", password: "admin123", role: "admin", name: "Alexander", refId: null },
];

export default async (request, context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const action = url.pathname.split("/").pop(); // "login" or "logout"

  if (action === "logout") {
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  if (action === "login") {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders });
    }

    const { username, password } = body;
    if (!username || !password) {
      return Response.json({ error: "Username and password required" }, { status: 400, headers: corsHeaders });
    }

    const store = getStore("blogix");
    let data = await store.get(BLOB_KEY, { type: "json" });
    const users = data?.users || defaultUsers;

    const user = users.find((u) => u.username === username && u.password === password);
    if (!user) {
      return Response.json({ ok: false, error: "Invalid credentials" }, { status: 401, headers: corsHeaders });
    }

    // Return user without password
    const { password: _pw, ...safeUser } = user;
    return Response.json({ ok: true, user: safeUser }, { headers: corsHeaders });
  }

  return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });
};

export const config = {
  path: ["/api/auth/login", "/api/auth/logout"],
};

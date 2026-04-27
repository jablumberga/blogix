/**
 * B-Logix – Push Token Function
 * POST /api/push/token  → { token, platform } → { ok }
 *
 * Saves or updates the APNS/FCM device token for the authenticated user.
 * Required env vars: BLOGIX_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { verifyToken } from "./api.mjs";

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export default async (request) => {
  const corsHeaders = corsFor(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  const { BLOGIX_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!BLOGIX_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Response.json({ error: "Missing env vars" }, { status: 500, headers: corsHeaders });
  }

  const authHeader = request.headers.get("Authorization") || "";
  const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const sessionUser = rawToken ? await verifyToken(rawToken, BLOGIX_SECRET) : null;
  if (!sessionUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders }); }

  const { token, platform = "ios" } = body;
  if (!token || typeof token !== "string" || token.length > 512) {
    return Response.json({ error: "token (string, max 512 chars) required" }, { status: 400, headers: corsHeaders });
  }
  const ALLOWED_PLATFORMS = ["ios", "android"];
  if (!ALLOWED_PLATFORMS.includes(platform)) {
    return Response.json({ error: "Invalid platform" }, { status: 400, headers: corsHeaders });
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Prefer": "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_id: String(sessionUser.id),
      token,
      platform,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[push-token] Supabase upsert failed:", err);
    return Response.json({ error: "Failed to save push token" }, { status: 500, headers: corsHeaders });
  }

  return Response.json({ ok: true }, { headers: corsHeaders });
};

export const config = { path: "/api/push/token" };

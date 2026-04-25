/**
 * B-Logix – Push Token Function
 * POST /api/push/token  → { token, platform } → { ok }
 *
 * Saves or updates the APNS/FCM device token for the authenticated user.
 * Required env vars: BLOGIX_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { verifyToken } from "./api.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export default async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  const { BLOGIX_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!BLOGIX_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Response.json({ error: "Missing env vars" }, { status: 500, headers: corsHeaders });
  }

  const authHeader = request.headers.get("Authorization") || "";
  const rawToken = authHeader.replace("Bearer ", "").trim();
  const sessionUser = await verifyToken(rawToken, BLOGIX_SECRET);
  if (!sessionUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders }); }

  const { token, platform = "ios" } = body;
  if (!token || typeof token !== "string") {
    return Response.json({ error: "token (string) required" }, { status: 400, headers: corsHeaders });
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

/**
 * B-Logix – Send Push Notification
 * POST /api/push/send  → { userId?, role?, title, body, data? } → { ok, sent, failed }
 *
 * Sends an APNS notification to one user (userId) or all users of a role.
 * Admin-only endpoint.
 *
 * Required env vars:
 *   BLOGIX_SECRET        for verifying caller JWT
 *   SUPABASE_URL / SUPABASE_SERVICE_KEY  for reading push tokens
 *   APNS_KEY_ID          10-char Key ID from developer.apple.com → Keys
 *   APNS_TEAM_ID         10-char Team ID from developer.apple.com → Membership
 *   APNS_PRIVATE_KEY     full content of the .p8 file (newlines as \n)
 *   APNS_BUNDLE_ID       com.blogix.app
 */

import { verifyToken } from "./api.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── APNS JWT (ES256) ────────────────────────────────────────────────────────

const enc = new TextEncoder();

function b64url(obj) {
  const bytes = enc.encode(JSON.stringify(obj));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateAPNSJWT(privateKeyPem, keyId, teamId) {
  const pem = privateKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const keyBytes = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const header  = b64url({ alg: "ES256", kid: keyId });
  const payload = b64url({ iss: teamId, iat: Math.floor(Date.now() / 1000) });
  const sigInput = `${header}.${payload}`;

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    cryptoKey,
    enc.encode(sigInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  return `${sigInput}.${sigB64}`;
}

// ── Send one APNS notification ───────────────────────────────────────────────

async function sendAPNS({ deviceToken, title, body, data, apnsJWT, bundleId }) {
  const url = `https://api.push.apple.com/3/device/${deviceToken}`;
  const payload = {
    aps: { alert: { title, body }, sound: "default", badge: 1 },
    ...(data || {}),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "authorization": `bearer ${apnsJWT}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-expiration": "0",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 200) return { ok: true };
  const reason = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, reason: reason.reason };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  const {
    BLOGIX_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY,
    APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID,
  } = process.env;

  if (!BLOGIX_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Response.json({ error: "Missing Supabase/auth env vars" }, { status: 500, headers: corsHeaders });
  }
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY || !APNS_BUNDLE_ID) {
    return Response.json({ error: "Missing APNS env vars — configure APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID" }, { status: 500, headers: corsHeaders });
  }

  // Require admin
  const authHeader = request.headers.get("Authorization") || "";
  const rawToken = authHeader.replace("Bearer ", "").trim();
  const caller = await verifyToken(rawToken, BLOGIX_SECRET);
  if (!caller || caller.role !== "admin") {
    return Response.json({ error: "Admin only" }, { status: 403, headers: corsHeaders });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders }); }

  const { userId, role: targetRole, title, body: msgBody, data } = body;
  if (!title || !msgBody) {
    return Response.json({ error: "title and body required" }, { status: 400, headers: corsHeaders });
  }

  // Build Supabase filter
  let filter = "";
  if (userId) {
    filter = `?user_id=eq.${encodeURIComponent(userId)}`;
  } else if (targetRole) {
    // user_id pattern: "1" = admin, "p-N" = partner, "d-N" = driver
    const prefix = targetRole === "partner" ? "p-" : targetRole === "driver" ? "d-" : null;
    if (!prefix) return Response.json({ error: "role must be partner or driver" }, { status: 400, headers: corsHeaders });
    filter = `?user_id=like.${encodeURIComponent(prefix + "*")}`;
  } else {
    return Response.json({ error: "userId or role required" }, { status: 400, headers: corsHeaders });
  }

  // Fetch target tokens from Supabase
  const tokenRes = await fetch(`${SUPABASE_URL}/rest/v1/push_tokens${filter}&select=user_id,token,platform`, {
    headers: {
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });

  if (!tokenRes.ok) {
    return Response.json({ error: "Failed to fetch push tokens" }, { status: 500, headers: corsHeaders });
  }

  const tokens = await tokenRes.json();
  if (!tokens.length) {
    return Response.json({ ok: true, sent: 0, failed: 0, message: "No registered devices for target" }, { headers: corsHeaders });
  }

  // Generate APNS JWT (valid for 60 min — reuse across batch)
  const apnsJWT = await generateAPNSJWT(
    APNS_PRIVATE_KEY.replace(/\\n/g, "\n"),
    APNS_KEY_ID,
    APNS_TEAM_ID
  );

  // Send notifications
  const results = await Promise.allSettled(
    tokens
      .filter(t => t.platform === "ios")
      .map(t => sendAPNS({ deviceToken: t.token, title, body: msgBody, data, apnsJWT, bundleId: APNS_BUNDLE_ID }))
  );

  const sent   = results.filter(r => r.status === "fulfilled" && r.value.ok).length;
  const failed = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;

  console.log(`[send-push] sent=${sent} failed=${failed} target=${userId || targetRole}`);
  return Response.json({ ok: true, sent, failed }, { headers: corsHeaders });
};

export const config = { path: "/api/push/send" };

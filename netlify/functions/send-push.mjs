/**
 * B-Logix – Send Push Notification
 * POST /api/push/send  → { userId?, role?, title, body, data? } → { ok, sent, failed }
 *
 * Sends an APNS notification to one user (userId) or all users of a role.
 * Admin-only endpoint. Uses node:http2 — required by Apple's APNs API.
 *
 * Required env vars:
 *   BLOGIX_SECRET        for verifying caller JWT
 *   SUPABASE_URL / SUPABASE_SERVICE_KEY  for reading push tokens
 *   APNS_KEY_ID          10-char Key ID from developer.apple.com → Keys
 *   APNS_TEAM_ID         10-char Team ID from developer.apple.com → Membership
 *   APNS_PRIVATE_KEY     full content of the .p8 file (newlines as \n)
 *   APNS_BUNDLE_ID       com.blogix.app
 *   APNS_SANDBOX         set to "true" for development/TestFlight sandbox tokens
 */

import http2 from "node:http2";
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

// ── Send via HTTP/2 (required by Apple) ─────────────────────────────────────

function sendAPNSHttp2(apnsHost, deviceToken, headers, body) {
  return new Promise((resolve) => {
    const client = http2.connect(apnsHost);
    client.on("error", (err) => {
      client.destroy();
      resolve({ ok: false, status: 0, reason: err.message, deviceToken });
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      ...headers,
    });

    req.on("response", (resHeaders) => {
      const status = resHeaders[":status"];
      let data = "";
      req.on("data", (chunk) => { data += chunk; });
      req.on("end", () => {
        client.close();
        if (status === 200) {
          resolve({ ok: true, deviceToken });
        } else {
          let reason = "Unknown";
          try { reason = JSON.parse(data).reason || reason; } catch {}
          resolve({ ok: false, status, reason, deviceToken });
        }
      });
    });

    req.write(body);
    req.end();
  });
}

async function sendAPNS({ deviceToken, title, body, data, apnsJWT, bundleId, sandbox }) {
  const apnsHost = sandbox === "true"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";

  const payload = JSON.stringify({
    aps: { alert: { title, body }, sound: "default", badge: 1 },
    ...(data || {}),
  });

  const headers = {
    "authorization": `bearer ${apnsJWT}`,
    "apns-topic": bundleId,
    "apns-push-type": "alert",
    "apns-expiration": "0",
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload).toString(),
  };

  return sendAPNSHttp2(apnsHost, deviceToken, headers, payload);
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  const {
    BLOGIX_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY,
    APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID, APNS_SANDBOX,
  } = process.env;

  if (!BLOGIX_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Response.json({ error: "Missing Supabase/auth env vars" }, { status: 500, headers: corsHeaders });
  }
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY || !APNS_BUNDLE_ID) {
    return Response.json({ error: "Missing APNS env vars" }, { status: 500, headers: corsHeaders });
  }

  const authHeader = request.headers.get("Authorization") || "";
  const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const caller = rawToken ? await verifyToken(rawToken, BLOGIX_SECRET) : null;
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

  // Build Supabase filter — PostgREST uses % as LIKE wildcard
  let filter = "";
  if (userId) {
    filter = `?user_id=eq.${encodeURIComponent(userId)}`;
  } else if (targetRole) {
    const prefix = targetRole === "partner" ? "p-" : targetRole === "driver" ? "d-" : null;
    if (!prefix) return Response.json({ error: "role must be partner or driver" }, { status: 400, headers: corsHeaders });
    filter = `?user_id=like.${encodeURIComponent(prefix + "%")}`;
  } else {
    return Response.json({ error: "userId or role required" }, { status: 400, headers: corsHeaders });
  }

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
    return Response.json({ ok: true, sent: 0, failed: 0, message: "No registered devices" }, { headers: corsHeaders });
  }

  const apnsJWT = await generateAPNSJWT(
    APNS_PRIVATE_KEY.replace(/\\n/g, "\n"),
    APNS_KEY_ID,
    APNS_TEAM_ID
  );

  const results = await Promise.allSettled(
    tokens
      .filter(t => t.platform === "ios")
      .map(t => sendAPNS({ deviceToken: t.token, title, body: msgBody, data, apnsJWT, bundleId: APNS_BUNDLE_ID, sandbox: APNS_SANDBOX }))
  );

  // Clean up stale tokens (Apple returns 410 BadDeviceToken/Unregistered)
  const staleTokens = results
    .filter(r => r.status === "fulfilled" && !r.value.ok && r.value.status === 410)
    .map(r => r.value.deviceToken);

  if (staleTokens.length > 0) {
    for (const token of staleTokens) {
      await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?token=eq.${encodeURIComponent(token)}`, {
        method: "DELETE",
        headers: {
          "apikey": SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }).catch(() => {});
    }
  }

  const sent   = results.filter(r => r.status === "fulfilled" && r.value.ok).length;
  const failed = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;

  console.log(`[send-push] sent=${sent} failed=${failed} staleRemoved=${staleTokens.length}`);
  return Response.json({ ok: true, sent, failed }, { headers: corsHeaders });
};

export const config = { path: "/api/push/send" };

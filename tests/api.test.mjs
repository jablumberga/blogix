/**
 * B-Logix – API function critical-path tests
 * Run with: node --test tests/api.test.mjs
 *
 * Tests that /api/data enforces JWT authentication correctly.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Load .env manually (no dotenv dependency) ─────────────────────────────────
const envPath = resolve(new URL(".", import.meta.url).pathname, "../.env");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key && !(key in process.env)) process.env[key] = rest.join("=");
  }
} catch {
  // .env not present – rely on whatever env is already set
}

// Import helpers and handler AFTER env is set
const { signToken, verifyToken, default: apiHandler } = await import(
  "../netlify/functions/api.mjs"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDataRequest(authHeader = null) {
  const headers = { "Content-Type": "application/json" };
  if (authHeader) headers["Authorization"] = authHeader;
  return new Request("https://blogix.netlify.app/api/data", {
    method: "GET",
    headers,
  });
}

// ── signToken / verifyToken unit tests ───────────────────────────────────────

test("signToken produces a valid 3-part JWT that verifyToken accepts", async () => {
  const secret = process.env.BLOGIX_SECRET;
  const payload = { id: 1, role: "admin", name: "Test" };

  const token = await signToken(payload, secret);
  assert.equal(token.split(".").length, 3, "Token must have 3 segments");

  const verified = await verifyToken(token, secret);
  assert.ok(verified, "verifyToken should return payload for a valid token");
  assert.equal(verified.id, payload.id);
  assert.equal(verified.role, payload.role);
});

test("verifyToken rejects a token signed with the wrong secret", async () => {
  const token = await signToken({ id: 1, role: "admin" }, "correct-secret");
  const result = await verifyToken(token, "wrong-secret");
  assert.equal(result, null, "verifyToken should return null for a tampered signature");
});

test("verifyToken rejects an expired token", async () => {
  // Manually build a token with exp in the past
  const secret = process.env.BLOGIX_SECRET;
  const enc = new TextEncoder();

  function b64url(obj) {
    const bytes = enc.encode(JSON.stringify(obj));
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  async function hmacSign(sec, data) {
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(sec), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  const header = b64url({ alg: "HS256", typ: "JWT" });
  const body   = b64url({ id: 1, role: "admin", iat: 1000, exp: 1001 }); // exp in 1970
  const sig    = await hmacSign(secret, `${header}.${body}`);
  const expiredToken = `${header}.${body}.${sig}`;

  const result = await verifyToken(expiredToken, secret);
  assert.equal(result, null, "verifyToken should return null for an expired token");
});

// ── /api/data endpoint authentication tests ───────────────────────────────────

test("/api/data without Authorization header returns 401", async () => {
  const req = makeDataRequest(); // no auth header
  const res = await apiHandler(req);

  assert.equal(
    res.status,
    401,
    `Expected 401 for missing auth, got ${res.status}`
  );
});

test("/api/data with an invalid/garbage JWT returns 401", async () => {
  const req = makeDataRequest("Bearer this.is.not.a.valid.jwt");
  const res = await apiHandler(req);

  assert.equal(
    res.status,
    401,
    `Expected 401 for invalid JWT, got ${res.status}`
  );
});

test("/api/data with a JWT signed by a different secret returns 401", async () => {
  const spoofedToken = await signToken(
    { id: 1, role: "admin", name: "Hacker" },
    "wrong-secret-that-is-not-BLOGIX_SECRET"
  );
  const req = makeDataRequest(`Bearer ${spoofedToken}`);
  const res = await apiHandler(req);

  assert.equal(
    res.status,
    401,
    `Expected 401 for token with wrong secret, got ${res.status}`
  );
});

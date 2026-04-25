/**
 * B-Logix – Auth function critical-path tests
 * Run with: node --test tests/auth.test.mjs
 *
 * Loads real env vars from .env so tests exercise the actual logic.
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

// Import the auth handler AFTER env vars are set
const { default: authHandler } = await import("../netlify/functions/auth.mjs");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal Request object that auth.mjs expects. */
function makeRequest(pathname, body = null) {
  const url = `https://blogix.netlify.app${pathname}`;
  const init = {
    method: body !== null ? "POST" : "POST", // always POST for auth
    headers: { "Content-Type": "application/json" },
    body: body !== null ? JSON.stringify(body) : undefined,
  };
  return new Request(url, init);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("login with valid admin credentials returns ok:true and a token", async () => {
  const req = makeRequest("/api/auth/login", {
    username: "admin",
    password: process.env.ADMIN_PASSWORD_HASH, // plaintext stored in .env for dev
  });

  const res = await authHandler(req);
  const body = await res.json();

  assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.ok, true, "Expected ok:true");
  assert.ok(body.token, "Expected a token in the response");
  // Token should be three base64url segments
  assert.equal(body.token.split(".").length, 3, "Token should have 3 JWT segments");
});

test("login with invalid password returns 401", async () => {
  const req = makeRequest("/api/auth/login", {
    username: "admin",
    password: "definitely-wrong-password",
  });

  const res = await authHandler(req);
  const body = await res.json();

  assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  assert.equal(body.ok, false);
});

test("login with missing username returns 400", async () => {
  const req = makeRequest("/api/auth/login", {
    password: "some-password",
    // username intentionally omitted
  });

  const res = await authHandler(req);
  const body = await res.json();

  assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  assert.ok(body.error, "Expected an error message in body");
});

test("login without BLOGIX_SECRET env var returns 500", async () => {
  const saved = process.env.BLOGIX_SECRET;
  delete process.env.BLOGIX_SECRET;

  try {
    const req = makeRequest("/api/auth/login", {
      username: "admin",
      password: "any",
    });

    const res = await authHandler(req);
    const body = await res.json();

    assert.equal(res.status, 500, `Expected 500, got ${res.status}`);
    assert.match(body.error, /BLOGIX_SECRET/, "Error message should mention missing secret");
  } finally {
    process.env.BLOGIX_SECRET = saved; // always restore so other tests aren't broken
  }
});

test("logout returns ok:true", async () => {
  const req = makeRequest("/api/auth/logout", {});

  const res = await authHandler(req);
  const body = await res.json();

  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  assert.equal(body.ok, true, "Expected ok:true on logout");
});

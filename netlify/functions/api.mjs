/**
 * B-Logix – Netlify Function (Back-End)
 * Endpoint: /api/data
 *
 * Stores and retrieves the full app data using Netlify Blobs.
 * No external database required — works on Netlify's free tier.
 *
 * Methods supported:
 *  GET  /api/data          → Load all app data
 *  POST /api/data          → Save all app data
 *  GET  /api/data/export   → Download data as JSON file
 */

import { getStore } from "@netlify/blobs";

const BLOB_KEY = "blogix-appdata";

// ─── CORS Headers ─────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ─── Default empty data structure ─────────────────────────────────────────────
const defaultData = {
  trips: [],
  drivers: [],
  trucks: [],
  clients: [],
  partners: [],
  brokers: [],
  suppliers: [],
  expenses: [],
  settlementStatus: {},
  users: [
    { id: 1, username: "admin", password: "admin123", role: "admin", name: "Alexander", refId: null }
  ],
};

export default async (request, context) => {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const store = getStore("blogix");
  const url = new URL(request.url);
  const isExport = url.pathname.endsWith("/export");

  // ── GET /api/data or GET /api/data/export ─────────────────────────────────
  if (request.method === "GET") {
    let data = await store.get(BLOB_KEY, { type: "json" });
    if (!data) data = defaultData;

    if (isExport) {
      return new Response(JSON.stringify(data, null, 2), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="blogix-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      });
    }

    return Response.json(data, { headers: corsHeaders });
  }

  // ── POST /api/data ─────────────────────────────────────────────────────────
  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders });
    }

    // Basic validation: must be an object with at least one known key
    const knownKeys = ["trips", "drivers", "trucks", "clients", "expenses"];
    const hasValidKey = knownKeys.some((k) => k in body);
    if (!hasValidKey) {
      return Response.json({ error: "Invalid data structure" }, { status: 400, headers: corsHeaders });
    }

    await store.setJSON(BLOB_KEY, body);
    return Response.json({ ok: true, savedAt: new Date().toISOString() }, { headers: corsHeaders });
  }

  return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
};

export const config = {
  path: ["/api/data", "/api/data/export"],
};

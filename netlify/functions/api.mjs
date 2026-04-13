/**
 * B-Logix – Netlify Function (Back-End)
 * Endpoint: /api/data
 *
 * Stores and retrieves the full app state using Supabase (PostgreSQL).
 * Uses the Supabase REST API directly — no SDK needed.
 *
 * Required env vars (set in Netlify → Site config → Environment variables):
 *   SUPABASE_URL          e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY  service_role JWT key
 *
 * Methods:
 *  GET  /api/data          → Load all app data
 *  POST /api/data          → Save all app data
 *  GET  /api/data/export   → Download data as JSON file
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const defaultData = {
  trips: [], drivers: [], trucks: [], clients: [], partners: [],
  brokers: [], suppliers: [], expenses: [], settlementStatus: {},
  users: [{ id: 1, username: "admin", password: "admin123", role: "admin", name: "Alexander", refId: null }],
};

function supabaseHeaders(env) {
  return {
    "Content-Type": "application/json",
    "apikey": env.SUPABASE_SERVICE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  };
}

export default async (request, context) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Response.json({ error: "Missing Supabase env vars" }, { status: 500, headers: corsHeaders });
  }

  const env = { SUPABASE_URL, SUPABASE_SERVICE_KEY };
  const url = new URL(request.url);
  const isExport = url.pathname.endsWith("/export");
  const tableUrl = `${SUPABASE_URL}/rest/v1/appdata`;

  // ── GET ──────────────────────────────────────────────────────────────────
  if (request.method === "GET") {
    const res = await fetch(`${tableUrl}?id=eq.1&select=data`, {
      headers: supabaseHeaders(env),
    });

    let data = defaultData;
    if (res.ok) {
      const rows = await res.json();
      if (rows.length > 0) data = rows[0].data;
    }

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

  // ── POST ─────────────────────────────────────────────────────────────────
  if (request.method === "POST") {
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders }); }

    const knownKeys = ["trips", "drivers", "trucks", "clients", "expenses"];
    if (!knownKeys.some(k => k in body)) {
      return Response.json({ error: "Invalid data structure" }, { status: 400, headers: corsHeaders });
    }

    const res = await fetch(tableUrl, {
      method: "POST",
      headers: {
        ...supabaseHeaders(env),
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({ id: 1, data: body, updated_at: new Date().toISOString() }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: err }, { status: 500, headers: corsHeaders });
    }

    return Response.json({ ok: true, savedAt: new Date().toISOString() }, { headers: corsHeaders });
  }

  return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
};

export const config = {
  path: ["/api/data", "/api/data/export"],
};

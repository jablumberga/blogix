/**
 * WhatsApp automático (API de WhatsApp de Meta, «Cloud API»).
 *
 *   GET  /api/whatsapp/status   → { enabled }   (cualquier usuario de la oficina; dice si el envío automático está activo)
 *   POST /api/whatsapp/send     { to, template, params }  admin u oficina → envía una plantilla aprobada
 *
 * Variables (Netlify): WHATSAPP_TOKEN (token permanente de un usuario del sistema), WHATSAPP_PHONE_NUMBER_ID,
 * WHATSAPP_API_VERSION (por defecto v22.0), WHATSAPP_LANG (por defecto es), WHATSAPP_TEMPLATE_PREFIX (opcional),
 * WHATSAPP_API_BASE (solo pruebas locales; por defecto https://graph.facebook.com).
 * Sin ellas, la app abre WhatsApp con el mensaje listo (wa.me) y no pasa nada por aquí.
 * Solo se mandan las plantillas de src/utils/whatsappTemplates.js, con el número exacto de variables.
 */
import { verifyToken, corsFor } from "./api.mjs";
import { WA_TEMPLATES, templateArity, clean } from "../../src/utils/whatsappTemplates.js";
import { waPhone } from "../../src/utils/whatsapp.js";

const SENDS_PER_DAY = 300;

export default async (request) => {
  const cors = corsFor(request);
  const json = (body, status = 200) => Response.json(body, { status, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const env = process.env;
  if (!env.BLOGIX_SECRET) return json({ error: "Missing env vars" }, 500);
  const auth = request.headers.get("Authorization") || "";
  const user = auth.startsWith("Bearer ") ? await verifyToken(auth.slice(7), env.BLOGIX_SECRET) : null;
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin" && user.role !== "assistant") return json({ error: "Forbidden" }, 403);
  const enabled = !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
  const path = new URL(request.url).pathname.replace(/\/+$/, "");

  if (request.method === "GET" && path === "/api/whatsapp/status") return json({ enabled });
  if (request.method !== "POST" || path !== "/api/whatsapp/send") return json({ error: "No existe" }, 404);
  if (!enabled) return json({ error: "El envío automático de WhatsApp no está configurado" }, 409);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const key = String(body.template || "");
  if (!Object.hasOwn(WA_TEMPLATES, key)) return json({ error: "Plantilla desconocida" }, 400);
  const params = Array.isArray(body.params) ? body.params.map(v => clean(v)) : [];
  if (params.length !== templateArity(key)) return json({ error: `La plantilla ${key} lleva ${templateArity(key)} datos` }, 400);
  const to = waPhone(body.to);
  if (!to) return json({ error: "Teléfono inválido" }, 400);

  // Límite diario por usuario (si existe el contador en la base)
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const rl = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/bl_rate_limit_hit`, { method: "POST", headers: { "Content-Type": "application/json", apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` }, body: JSON.stringify({ p_scope: "wa_send", p_key: String(user.id), p_max: SENDS_PER_DAY, p_window: 86400 }) }).catch(() => null);
    if (rl?.ok && Number(await rl.json().catch(() => 0)) > SENDS_PER_DAY) return json({ error: "Límite diario de mensajes alcanzado" }, 429);
  }

  const version = env.WHATSAPP_API_VERSION || "v22.0";
  const name = `${env.WHATSAPP_TEMPLATE_PREFIX || ""}${key}`;
  const base = env.WHATSAPP_API_BASE || "https://graph.facebook.com";
  const res = await fetch(`${base}/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: { name, language: { code: env.WHATSAPP_LANG || "es" }, components: [{ type: "body", parameters: params.map(text => ({ type: "text", text })) }] },
    }),
  }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: String(e.message || e) } }) }));
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: `WhatsApp no aceptó el mensaje: ${j?.error?.message || res.status}`, code: j?.error?.code || null }, 502);
  return json({ ok: true, id: j?.messages?.[0]?.id || null });
};

export const config = { path: ["/api/whatsapp/status", "/api/whatsapp/send"] };

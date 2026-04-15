/**
 * B-Logix – CFO Chat (Netlify Function)
 * Powered by Claude (Anthropic) API
 * Receives: { message, history, data }
 * Returns:  { reply }
 */

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const CLAUDE_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_KEY) {
    return Response.json({ error: "CLAUDE_API_KEY no configurado en Netlify env vars" }, { status: 500 });
  }

  const { message, history = [], data = {} } = await req.json();

  // ── Build financial summary from real data ──────────────────────────────
  const trips      = data.trips      || [];
  const expenses   = data.expenses   || [];
  const drivers    = data.drivers    || [];
  const clients    = data.clients    || [];
  const partners   = data.partners   || [];
  const trucks     = data.trucks     || [];
  const brokers    = data.brokers    || [];

  const totalRevenue  = trips.reduce((s, t) => s + (t.revenue || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit     = totalRevenue - totalExpenses;
  const margin        = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

  const delivered  = trips.filter(t => t.status === "delivered").length;
  const inTransit  = trips.filter(t => t.status === "in_transit").length;
  const pending    = trips.filter(t => t.status === "pending").length;

  // Revenue by client
  const revenueByClient = clients.map(c => ({
    cliente: c.companyName,
    ingresos: trips.filter(t => t.clientId === c.id).reduce((s, t) => s + (t.revenue || 0), 0),
    viajes: trips.filter(t => t.clientId === c.id).length,
  }));

  // Earnings by driver (porcentaje-based)
  const driverStats = drivers.map(d => {
    const dTrips = trips.filter(t => t.driverId === d.id);
    const earned = d.salaryType === "porcentaje"
      ? dTrips.reduce((s, t) => s + (t.revenue || 0) * ((d.percentageAmount || 0) / 100), 0)
      : d.salaryType === "fixed" ? (d.fixedAmount || 0) : 0;
    return { chofer: d.name, viajes: dTrips.length, ganancia_chofer: earned };
  });

  // Expenses by category
  const expByCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + (e.amount || 0);
    return acc;
  }, {});

  const systemPrompt = `Eres el CFO analista de B-Logix, empresa de logística de transporte de carga en República Dominicana.
Tu rol: analizar los datos financieros y operativos REALES de la empresa, dar proyecciones, detectar problemas, y dar recomendaciones estratégicas concretas.
Siempre responde en español. Usa los números reales. No inventes ni estimes si tienes el dato real. Sé conciso y directo.

═══ RESUMEN FINANCIERO ═══
Ingresos Totales:  RD$${totalRevenue.toLocaleString()}
Gastos Totales:    RD$${totalExpenses.toLocaleString()}
Utilidad Neta:     RD$${netProfit.toLocaleString()}
Margen de Utilidad: ${margin}%

═══ OPERACIONES ═══
Viajes Totales: ${trips.length} (${delivered} entregados · ${inTransit} en tránsito · ${pending} pendientes)
Choferes: ${drivers.length} · Camiones: ${trucks.length} · Clientes: ${clients.length} · Socios: ${partners.length}

═══ INGRESOS POR CLIENTE ═══
${JSON.stringify(revenueByClient, null, 2)}

═══ ESTADÍSTICAS POR CHOFER ═══
${JSON.stringify(driverStats, null, 2)}

═══ GASTOS POR CATEGORÍA ═══
${JSON.stringify(expByCategory, null, 2)}

═══ DATOS COMPLETOS (RAW) ═══
${JSON.stringify({ trips, expenses, drivers, clients, partners, trucks, brokers }, null, 2)}`;

  // Keep last 10 messages for context
  const claudeMessages = [
    ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 1500,
        system: systemPrompt,
        messages: claudeMessages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Claude API error: ${err}` }, { status: 500 });
    }

    const result = await res.json();
    const reply = result.content?.[0]?.text || "Sin respuesta.";
    return Response.json({ reply });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};

export const config = { path: "/api/chat" };

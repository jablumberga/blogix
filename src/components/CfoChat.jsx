import { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send } from "lucide-react";
import { colors } from "../constants/theme.js";
import { getToken } from "../api.js";

export default function CfoChat({ data, t, sidebarOpen, isMobile }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { role: "assistant", content: "¡Hola! Soy tu CFO analista. Tengo acceso a todos tus datos en tiempo real.\n¿En qué te ayudo hoy?" }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send() {
    if (!input.trim() || busy) return;
    const userMsg = { role: "user", content: input.trim() };
    const next = [...msgs, userMsg];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const token = getToken();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: userMsg.content, history: msgs, data }),
      });
      const json = await res.json();
      setMsgs([...next, { role: "assistant", content: json.reply || json.error || "Error." }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "Error de conexión. Intenta de nuevo." }]);
    }
    setBusy(false);
  }

  const sidebarWidth = isMobile ? 220 : (sidebarOpen ? 220 : 60);

  const panelStyle = isMobile
    ? { position: "fixed", left: 0, right: 0, bottom: 0, height: "65vh", width: "100vw", borderRadius: "14px 14px 0 0" }
    : { position: "fixed", left: sidebarWidth + 8, bottom: 0, width: 360, height: 500, borderRadius: "14px 14px 0 0", transition: "left 0.2s" };

  return (
    <>
      {/* Sidebar trigger — same style as nav items */}
      <button
        onClick={() => setOpen(o => !o)}
        title="CFO Analista IA"
        aria-label="Abrir CFO Analista"
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 10px", borderRadius: 7, border: "none",
          borderLeft: open ? `3px solid ${colors.accent}` : "3px solid transparent",
          background: open ? colors.accent + "18" : "transparent",
          color: open ? colors.accentLight : colors.textMuted,
          cursor: "pointer", fontSize: 13, textAlign: "left", width: "100%",
          transition: "background 0.15s, border-color 0.15s, color 0.15s",
        }}
      >
        <MessageSquare size={16} style={{ flexShrink: 0 }} />
        {sidebarOpen && <span style={{ whiteSpace: "nowrap", flex: 1 }}>CFO Analista</span>}
      </button>

      {/* Chat panel — anchored to right edge of sidebar, never covers content */}
      {open && (
        <div
          role="dialog"
          aria-label="CFO Analista IA"
          style={{
            ...panelStyle,
            zIndex: 300,
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderBottom: "none",
            display: "flex", flexDirection: "column",
            boxShadow: "4px 0 40px rgba(0,0,0,0.6)",
          }}
        >
          {/* Header */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: colors.text }}>CFO Analista</div>
              <div style={{ fontSize: 10, color: colors.textMuted }}>Claude · datos en tiempo real</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Cerrar chat"
              style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, display: "flex", alignItems: "center", padding: 4, borderRadius: 6 }}>
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{
                maxWidth: "88%", padding: "8px 12px", borderRadius: 10,
                fontSize: 12.5, lineHeight: 1.55,
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? colors.accent : colors.bg,
                color: m.role === "user" ? "#fff" : colors.text,
                whiteSpace: "pre-wrap",
              }}>
                {m.content}
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: "flex-start", padding: "8px 12px", borderRadius: 10, background: colors.bg, color: colors.textMuted, fontSize: 12 }}>
                Analizando datos...
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${colors.border}`, display: "flex", gap: 8, flexShrink: 0 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Pregunta sobre tus finanzas..."
              aria-label="Mensaje para CFO Analista"
              style={{
                flex: 1, padding: "8px 11px", borderRadius: 8,
                border: `1px solid ${colors.border}`,
                background: colors.bg, color: colors.text,
                fontSize: 16, outline: "none",
              }}
            />
            <button onClick={send} disabled={busy || !input.trim()} aria-label="Enviar mensaje"
              style={{
                padding: "8px 13px", borderRadius: 8, border: "none",
                background: busy || !input.trim() ? colors.border : colors.accent,
                color: "#fff", cursor: busy || !input.trim() ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center",
              }}>
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

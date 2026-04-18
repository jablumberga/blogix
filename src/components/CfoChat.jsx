import { useState, useEffect, useRef } from "react";
import { colors } from "../constants/theme.js";

export default function CfoChat({ data, t }) {
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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, history: msgs, data }),
      });
      const json = await res.json();
      setMsgs([...next, { role: "assistant", content: json.reply || json.error || "Error." }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "Error de conexión. Intenta de nuevo." }]);
    }
    setBusy(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="CFO Analista IA"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 1000, width: 52, height: 52,
          borderRadius: "50%", border: "none", background: `linear-gradient(135deg,${colors.accent},${colors.green})`,
          color: "#fff", fontSize: 22, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        💼
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 88, right: 24, zIndex: 1000, width: 360, height: 500,
          background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14,
          display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
        }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: colors.text }}>💼 CFO Analista</div>
              <div style={{ fontSize: 10, color: colors.textMuted }}>Claude · datos en tiempo real</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, fontSize: 16 }}>✕</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {msgs.map((m, i) => (
              <div
                key={i}
                style={{
                  maxWidth: "88%", padding: "8px 12px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.55,
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  background: m.role === "user" ? colors.accent : colors.bg,
                  color: m.role === "user" ? "#fff" : colors.text, whiteSpace: "pre-wrap",
                }}
              >
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

          <div style={{ padding: "10px 12px", borderTop: `1px solid ${colors.border}`, display: "flex", gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Pregunta sobre tus finanzas..."
              style={{ flex: 1, padding: "8px 11px", borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 12.5, outline: "none" }}
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              style={{
                padding: "8px 13px", borderRadius: 8, border: "none", fontSize: 15,
                background: busy || !input.trim() ? colors.border : colors.accent,
                color: "#fff", cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}

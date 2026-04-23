import { useState } from "react";
import { LogIn, Eye, EyeOff, AlertCircle } from "lucide-react";
import bcrypt from "bcryptjs";
import { colors } from "../constants/theme.js";
import { Inp, Btn } from "./ui/index.jsx";

export default function LoginPage({ t, onLogin, allUsers }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      // Try server auth first (gets signed JWT for RLS)
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const { user, token } = await res.json();
        onLogin(user, keepSignedIn, token);
        setLoading(false);
        return;
      }
      // Server reachable but rejected — don't bypass to offline auth
      if (res.status === 401 || res.status === 400) {
        setError(t.invalidLogin);
        setLoading(false);
        return;
      }
    } catch {
      // Server unavailable — fall back to local user list
    }
    // Offline fallback: validate against allUsers (supports both hashed and plaintext passwords)
    const candidate = allUsers.find(u => u.username === username);
    if (candidate) {
      const isHashed = typeof candidate.password === "string" && candidate.password.startsWith("$2");
      const match = isHashed
        ? await bcrypt.compare(password, candidate.password)
        : candidate.password === password;
      if (match) { onLogin(candidate, keepSignedIn, null); setError(""); setLoading(false); return; }
    }
    setError(t.invalidLogin);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg, ${colors.bg} 0%, #0a1628 50%, #0f1d35 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", padding: "20px 16px", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 400, background: colors.card, borderRadius: 16, border: `1px solid ${colors.border}`, padding: "40px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", boxSizing: "border-box" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 80, height: 80, borderRadius: "22%", background: "white", overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14, boxShadow: "0 4px 20px rgba(239,68,68,0.3)" }}>
            <img src="/logo.png" alt="B-Logix" style={{ width: "95%", height: "95%", objectFit: "contain" }} />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: colors.text, margin: "0 0 4px", letterSpacing: -0.5 }}>B-Logix</h1>
          <p style={{ color: colors.textMuted, fontSize: 13, margin: 0 }}>{t.loginTitle}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Inp
            label={t.username}
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="admin"
            onKeyDown={e => e.key === "Enter" && handleLogin()}
          />
          <div style={{ position: "relative" }}>
            <Inp
              label={t.password}
              type={showPw ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••"
              style={{ width: "100%", paddingRight: 36 }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            <button
              onClick={() => setShowPw(!showPw)}
              style={{ position: "absolute", right: 8, bottom: 6, background: "none", border: "none", color: colors.textMuted, cursor: "pointer" }}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {error && (
            <div style={{ color: colors.red, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: colors.textMuted }}>
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={e => setKeepSignedIn(e.target.checked)}
              style={{ width: 15, height: 15, cursor: "pointer", accentColor: colors.accent }}
            />
            {t.keepSignedIn || "Mantenerme conectado"}
          </label>
          <Btn
            onClick={handleLogin}
            disabled={loading}
            style={{ width: "100%", justifyContent: "center", padding: "10px 0", fontSize: 14, marginTop: 4 }}
          >
            <LogIn size={16} /> {loading ? "Entrando..." : t.login}
          </Btn>
        </div>
      </div>
    </div>
  );
}

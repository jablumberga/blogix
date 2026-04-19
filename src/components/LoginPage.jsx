import { useState } from "react";
import { LogIn, Eye, EyeOff, AlertCircle } from "lucide-react";
import { colors } from "../constants/theme.js";
import { Inp, Btn } from "./ui/index.jsx";

export default function LoginPage({ t, onLogin, allUsers }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);

  const handleLogin = () => {
    const user = allUsers.find(u => u.username === username && u.password === password);
    if (user) { onLogin(user, keepSignedIn); setError(""); }
    else setError(t.invalidLogin);
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg, ${colors.bg} 0%, #0a1628 50%, #0f1d35 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ width: 400, background: colors.card, borderRadius: 16, border: `1px solid ${colors.border}`, padding: 40, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/logo.png" alt="B-Logix" style={{ width: 72, height: 72, objectFit: "contain", marginBottom: 12 }} />
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
            style={{ width: "100%", justifyContent: "center", padding: "10px 0", fontSize: 14, marginTop: 4 }}
          >
            <LogIn size={16} /> {t.login}
          </Btn>
        </div>
      </div>
    </div>
  );
}

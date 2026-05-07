import { Truck, Route, BarChart3, Users, FileText, ShieldCheck, ArrowRight, MapPin, Phone, Mail } from "lucide-react";

const c = {
  bg: "#050c18",
  card: "#0d1a2e",
  accent: "#3b82f6",
  accentLight: "#60a5fa",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  border: "#1e3a5f",
  green: "#22c55e",
};

const features = [
  { icon: Route,          title: "Gestión de Viajes",         desc: "Registra y controla cada viaje en tiempo real. Estado, documentos y facturación en un solo lugar." },
  { icon: Truck,          title: "Control de Flota",          desc: "Monitorea tus camiones, mantenimientos y asignaciones por conductor con historial completo." },
  { icon: Users,          title: "Nómina de Conductores",     desc: "Pago por viaje, porcentaje o salario fijo. Cálculo automático por quincena o mes." },
  { icon: BarChart3,      title: "Liquidaciones de Socios",   desc: "Reportes claros de ingresos, gastos y comisiones para cada socio por período." },
  { icon: FileText,       title: "Cuentas por Cobrar y Pagar", desc: "Facturación, seguimiento de pagos pendientes y control de proveedores integrado." },
  { icon: ShieldCheck,    title: "Seguridad por Roles",       desc: "Acceso diferenciado para administradores, socios y conductores. Cada quien ve solo lo suyo." },
];

export default function LandingPage({ onLogin }) {
  return (
    <div style={{ background: c.bg, minHeight: "100vh", fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", color: c.text }}>

      {/* NAV */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px", height: 64,
        background: "rgba(5,12,24,0.85)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${c.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, ${c.accent}, #2563eb)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Truck size={18} color="white" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.3px" }}>B-Logix</span>
        </div>

        <button onClick={onLogin} style={{
          padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
          background: c.accent, color: "white", fontWeight: 600, fontSize: 14,
          display: "flex", alignItems: "center", gap: 6,
          transition: "opacity 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          Iniciar Sesión <ArrowRight size={14} />
        </button>
      </nav>

      {/* HERO */}
      <section style={{
        paddingTop: 140, paddingBottom: 100, textAlign: "center",
        background: `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(59,130,246,0.18) 0%, transparent 70%)`,
      }}>
        <div style={{
          display: "inline-block", padding: "4px 14px", borderRadius: 20, marginBottom: 24,
          background: "rgba(59,130,246,0.12)", border: `1px solid rgba(59,130,246,0.3)`,
          fontSize: 12, fontWeight: 600, color: c.accentLight, letterSpacing: "0.5px",
        }}>
          PLATAFORMA DE GESTIÓN LOGÍSTICA · REPÚBLICA DOMINICANA
        </div>

        <h1 style={{
          margin: "0 auto 20px", maxWidth: 680, fontSize: "clamp(36px, 6vw, 58px)",
          fontWeight: 800, lineHeight: 1.1, letterSpacing: "-1px",
        }}>
          Controla tu flota.<br />
          <span style={{ color: c.accentLight }}>Simplifica tu negocio.</span>
        </h1>

        <p style={{
          margin: "0 auto 40px", maxWidth: 520, fontSize: 17, color: c.textMuted, lineHeight: 1.6,
        }}>
          Gestión completa de viajes, conductores, socios y finanzas para empresas de transporte en un solo sistema.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onLogin} style={{
            padding: "13px 28px", borderRadius: 10, border: "none", cursor: "pointer",
            background: `linear-gradient(135deg, ${c.accent}, #2563eb)`,
            color: "white", fontWeight: 700, fontSize: 15,
            display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 4px 24px rgba(59,130,246,0.35)",
          }}>
            Acceder a la plataforma <ArrowRight size={16} />
          </button>
          <a href="mailto:soporte@blogix.do" style={{
            padding: "13px 28px", borderRadius: 10,
            border: `1px solid ${c.border}`, textDecoration: "none",
            color: c.text, fontWeight: 600, fontSize: 15,
            background: "rgba(255,255,255,0.03)",
          }}>
            Contactar ventas
          </a>
        </div>
      </section>

      {/* STATS */}
      <section style={{ padding: "0 32px 80px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 1,
          background: c.border, borderRadius: 16, overflow: "hidden",
          border: `1px solid ${c.border}`,
        }}>
          {[
            { value: "100%", label: "Online — sin instalación" },
            { value: "3",    label: "Roles de acceso" },
            { value: "RD",   label: "Hecho para República Dominicana" },
            { value: "24/7", label: "Acceso desde cualquier dispositivo" },
          ].map((s, i) => (
            <div key={i} style={{
              background: c.card, padding: "28px 20px", textAlign: "center",
            }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: c.accentLight, marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: c.textMuted, lineHeight: 1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: "0 32px 100px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, marginBottom: 12, letterSpacing: "-0.5px" }}>
          Todo lo que necesitas
        </h2>
        <p style={{ textAlign: "center", color: c.textMuted, marginBottom: 48, fontSize: 15 }}>
          Una sola plataforma para gestionar toda la operación de tu empresa de transporte.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {features.map(({ icon: Icon, title, desc }, i) => (
            <div key={i} style={{
              background: c.card, borderRadius: 14, padding: "28px 24px",
              border: `1px solid ${c.border}`,
              transition: "border-color 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = c.border}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 10, marginBottom: 16,
                background: "rgba(59,130,246,0.12)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={22} color={c.accentLight} />
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>{title}</h3>
              <p style={{ margin: 0, fontSize: 14, color: c.textMuted, lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        margin: "0 32px 80px", maxWidth: 800, marginLeft: "auto", marginRight: "auto",
        background: `linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.08))`,
        border: `1px solid rgba(59,130,246,0.25)`, borderRadius: 20,
        padding: "56px 40px", textAlign: "center",
      }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 800 }}>
          ¿Listo para optimizar tu operación?
        </h2>
        <p style={{ margin: "0 0 32px", color: c.textMuted, fontSize: 15 }}>
          Accede a tu cuenta o contáctanos para una demostración.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onLogin} style={{
            padding: "12px 28px", borderRadius: 9, border: "none", cursor: "pointer",
            background: c.accent, color: "white", fontWeight: 700, fontSize: 14,
          }}>
            Iniciar Sesión
          </button>
          <a href="mailto:soporte@blogix.do" style={{
            padding: "12px 28px", borderRadius: 9, textDecoration: "none",
            border: `1px solid ${c.border}`, color: c.text, fontWeight: 600, fontSize: 14,
          }}>
            soporte@blogix.do
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        borderTop: `1px solid ${c.border}`, padding: "24px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
        maxWidth: 1100, margin: "0 auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: `linear-gradient(135deg, ${c.accent}, #2563eb)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Truck size={13} color="white" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>B-Logix</span>
          <span style={{ color: c.textMuted, fontSize: 12, marginLeft: 8 }}>© 2026</span>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <a href="/privacy" style={{ color: c.textMuted, fontSize: 12, textDecoration: "none" }}>Política de Privacidad</a>
          <a href="mailto:soporte@blogix.do" style={{ color: c.textMuted, fontSize: 12, textDecoration: "none" }}>soporte@blogix.do</a>
        </div>
      </footer>
    </div>
  );
}

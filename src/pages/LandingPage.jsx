import { useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Truck, MapPin, BarChart3, Clock, Shield, Users } from "lucide-react";

/* ─── TOKENS ──────────────────────────────────────────────────────────────── */
const T = {
  navy:    "#050d1a",
  navyMid: "#0a1628",
  white:   "#ffffff",
  offWhite:"#f4f6f9",
  gray:    "#6b7280",
  grayLight:"#e5e9f0",
  accent:  "#1d4ed8",
  accentL: "#3b82f6",
  border:  "#dce3ee",
  text:    "#0f172a",
  textSub: "#4b5563",
};

const sans = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";

/* ─── BENEFITS ────────────────────────────────────────────────────────────── */
const BENEFITS = [
  {
    num: "01",
    title: "Cobertura nacional",
    body: "Operamos rutas en todo el territorio dominicano — desde Santo Domingo hasta las provincias más remotas. Tu carga llega donde la necesitas.",
    icon: MapPin,
  },
  {
    num: "02",
    title: "Flota propia y controlada",
    body: "Camiones con seguimiento en tiempo real. Cada unidad inspeccionada, cada ruta documentada. Sin subcontratistas desconocidos.",
    icon: Truck,
  },
  {
    num: "03",
    title: "Entregas puntuales",
    body: "Nuestros procesos operativos garantizan que tu carga llegue en el horario acordado. Sin sorpresas, sin excusas.",
    icon: Clock,
  },
  {
    num: "04",
    title: "Visibilidad total",
    body: "Reportes claros de cada viaje: fecha, ruta, estado de documentos y comprobantes de entrega disponibles cuando los necesites.",
    icon: BarChart3,
  },
  {
    num: "05",
    title: "Conductores certificados",
    body: "Equipo de conductores profesionales, con licencias vigentes y experiencia en carga comercial e industrial.",
    icon: Users,
  },
  {
    num: "06",
    title: "Operación confiable",
    body: "Más de cinco años moviendo carga en República Dominicana. Clientes que confían en nosotros para su operación diaria.",
    icon: Shield,
  },
];

/* ─── FAQ ─────────────────────────────────────────────────────────────────── */
const FAQS = [
  {
    q: "¿Qué tipo de carga transportan?",
    a: "Manejamos carga seca, paletizada y a granel para empresas de distribución, manufactura y retail. Consultanos para carga especial.",
  },
  {
    q: "¿Cuál es el área de cobertura?",
    a: "Operamos rutas en todo el territorio de República Dominicana, con base principal en la región norte.",
  },
  {
    q: "¿Cómo coordino un servicio?",
    a: "Contáctanos por teléfono o correo y un coordinador te asigna la unidad disponible para tu ruta. Respuesta en menos de 2 horas.",
  },
  {
    q: "¿Emiten comprobantes fiscales?",
    a: "Sí. Trabajamos con comprobantes fiscales válidos ante la DGII para todos los servicios contratados.",
  },
  {
    q: "¿Manejan contratos de largo plazo?",
    a: "Ofrecemos acuerdos de servicio mensual y anual con tarifas preferenciales para empresas con volumen regular de viajes.",
  },
];

/* ─── NAV ─────────────────────────────────────────────────────────────────── */
function Nav({ onLogin }) {
  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
      background: "rgba(5,13,26,0.92)", backdropFilter: "blur(16px)",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
    }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto",
        padding: "0 32px", height: 68,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: T.accentL,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Truck size={20} color={T.white} />
          </div>
          <span style={{ fontFamily: sans, fontWeight: 800, fontSize: 18, color: T.white, letterSpacing: "-0.4px" }}>
            B‑Logix
          </span>
        </div>

        {/* Login */}
        <button onClick={onLogin} style={{
          fontFamily: sans, fontWeight: 600, fontSize: 14,
          padding: "9px 22px", borderRadius: 7,
          background: T.white, color: T.text,
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
          transition: "opacity 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          Iniciar Sesión <ArrowRight size={13} />
        </button>
      </div>
    </header>
  );
}

/* ─── HERO ────────────────────────────────────────────────────────────────── */
function Hero({ onLogin }) {
  return (
    <section style={{
      background: T.navy,
      paddingTop: 160, paddingBottom: 120,
      paddingLeft: 32, paddingRight: 32,
      position: "relative", overflow: "hidden",
    }}>
      {/* subtle grid overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }} />

      <div style={{ maxWidth: 860, margin: "0 auto", position: "relative" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "5px 14px", borderRadius: 20, marginBottom: 28,
          border: "1px solid rgba(59,130,246,0.35)",
          background: "rgba(59,130,246,0.08)",
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.accentL }} />
          <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: T.accentL, letterSpacing: "0.8px" }}>
            LOGÍSTICA Y DISTRIBUCIÓN · REPÚBLICA DOMINICANA
          </span>
        </div>

        <h1 style={{
          fontFamily: sans, fontWeight: 900,
          fontSize: "clamp(42px, 7vw, 76px)",
          lineHeight: 1.05, letterSpacing: "-2px",
          color: T.white, margin: "0 0 28px",
        }}>
          Tu carga, entregada.<br />
          <span style={{
            background: `linear-gradient(135deg, ${T.accentL} 0%, #06b6d4 100%)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Sin complicaciones.
          </span>
        </h1>

        <p style={{
          fontFamily: sans, fontSize: "clamp(16px, 2vw, 19px)",
          color: "rgba(255,255,255,0.6)", lineHeight: 1.65,
          maxWidth: 560, margin: "0 0 44px",
        }}>
          Transportamos y distribuimos tu mercancía en toda República Dominicana.
          Flota propia, conductores profesionales y seguimiento en cada viaje.
        </p>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <a href="tel:+18091234567" style={{
            fontFamily: sans, fontWeight: 700, fontSize: 15,
            padding: "14px 30px", borderRadius: 8,
            background: T.accentL, color: T.white,
            textDecoration: "none",
            display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 0 40px rgba(59,130,246,0.4)",
          }}>
            Solicitar servicio <ArrowRight size={16} />
          </a>
          <a href="mailto:soporte@blogix.do" style={{
            fontFamily: sans, fontWeight: 600, fontSize: 15,
            padding: "14px 30px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
            color: T.white, textDecoration: "none",
            background: "rgba(255,255,255,0.05)",
          }}>
            Contáctanos
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─── STATS BAR ───────────────────────────────────────────────────────────── */
function Stats() {
  const items = [
    { value: "500+",  label: "Viajes completados" },
    { value: "15+",   label: "Clientes activos" },
    { value: "100%",  label: "Cobertura nacional" },
    { value: "5 años",label: "En operación" },
  ];
  return (
    <section style={{ background: T.white, borderBottom: `1px solid ${T.border}` }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto", padding: "0 32px",
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      }}>
        {items.map((s, i) => (
          <div key={i} style={{
            padding: "40px 24px", textAlign: "center",
            borderRight: i < items.length - 1 ? `1px solid ${T.border}` : "none",
          }}>
            <div style={{ fontFamily: sans, fontWeight: 900, fontSize: 38, color: T.text, letterSpacing: "-1px", marginBottom: 6 }}>
              {s.value}
            </div>
            <div style={{ fontFamily: sans, fontSize: 13, color: T.gray, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── BENEFITS ────────────────────────────────────────────────────────────── */
function Benefits() {
  return (
    <section style={{ background: T.offWhite, padding: "100px 32px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 64 }}>
          <p style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: T.accentL, letterSpacing: "1.5px", marginBottom: 12 }}>
            POR QUÉ ELEGIRNOS
          </p>
          <h2 style={{
            fontFamily: sans, fontWeight: 900,
            fontSize: "clamp(30px, 4.5vw, 48px)",
            letterSpacing: "-1.2px", color: T.text,
            margin: 0, maxWidth: 540, lineHeight: 1.1,
          }}>
            Operación logística que funciona de verdad.
          </h2>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 2,
          background: T.border,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          overflow: "hidden",
        }}>
          {BENEFITS.map(({ num, title, body, icon: Icon }) => (
            <div key={num} style={{
              background: T.white, padding: "40px 36px",
              transition: "background 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "#f0f4ff"}
              onMouseLeave={e => e.currentTarget.style.background = T.white}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <span style={{
                  fontFamily: sans, fontWeight: 900, fontSize: 13,
                  color: T.accentL, letterSpacing: "1px",
                }}>
                  {num}
                </span>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: "rgba(59,130,246,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={20} color={T.accentL} />
                </div>
              </div>
              <h3 style={{
                fontFamily: sans, fontWeight: 800, fontSize: 20,
                letterSpacing: "-0.4px", color: T.text, margin: "0 0 12px",
              }}>
                {title}
              </h3>
              <p style={{ fontFamily: sans, fontSize: 15, color: T.textSub, lineHeight: 1.65, margin: 0 }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── HOW IT WORKS ────────────────────────────────────────────────────────── */
function HowItWorks({ onLogin }) {
  const steps = [
    { n: "1", t: "Nos contactas",     d: "Llámanos o escríbenos con el detalle de tu carga — origen, destino, peso y fecha requerida." },
    { n: "2", t: "Asignamos unidad",  d: "En menos de 2 horas te confirmamos el camión asignado, el conductor y la tarifa para tu ruta." },
    { n: "3", t: "Recolección",       d: "El conductor llega en el horario acordado. Revisión de carga y firma de hoja de servicio." },
    { n: "4", t: "Entrega confirmada",d: "Recibes confirmación de entrega con comprobante. Factura disponible para tu contabilidad." },
  ];
  return (
    <section style={{ background: T.navy, padding: "100px 32px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 64, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24 }}>
          <div>
            <p style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: T.accentL, letterSpacing: "1.5px", marginBottom: 12 }}>
              CÓMO FUNCIONA
            </p>
            <h2 style={{
              fontFamily: sans, fontWeight: 900,
              fontSize: "clamp(28px, 4vw, 44px)",
              letterSpacing: "-1px", color: T.white,
              margin: 0, lineHeight: 1.1,
            }}>
              Del contacto a la entrega,<br />sin fricciones.
            </h2>
          </div>
          <button onClick={onLogin} style={{
            fontFamily: sans, fontWeight: 700, fontSize: 14,
            padding: "12px 24px", borderRadius: 7,
            background: T.accentL, color: T.white,
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            Acceder a la plataforma <ArrowRight size={14} />
          </button>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 2, background: "rgba(255,255,255,0.06)",
          borderRadius: 16, overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          {steps.map(({ n, t, d }) => (
            <div key={n} style={{ padding: "40px 32px" }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                border: `2px solid ${T.accentL}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: sans, fontWeight: 900, fontSize: 16,
                color: T.accentL, marginBottom: 24,
              }}>
                {n}
              </div>
              <h3 style={{ fontFamily: sans, fontWeight: 800, fontSize: 18, color: T.white, margin: "0 0 10px", letterSpacing: "-0.3px" }}>
                {t}
              </h3>
              <p style={{ fontFamily: sans, fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.65, margin: 0 }}>
                {d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ─────────────────────────────────────────────────────────────────── */
function Faq() {
  const [open, setOpen] = useState(null);
  return (
    <section style={{ background: T.white, padding: "100px 32px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <p style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: T.accentL, letterSpacing: "1.5px", marginBottom: 12 }}>
          PREGUNTAS FRECUENTES
        </p>
        <h2 style={{
          fontFamily: sans, fontWeight: 900,
          fontSize: "clamp(28px, 4vw, 42px)",
          letterSpacing: "-1px", color: T.text,
          margin: "0 0 56px", lineHeight: 1.1,
        }}>
          Lo que necesitas saber.
        </h2>

        {FAQS.map(({ q, a }, i) => (
          <div key={i} style={{ borderTop: `1px solid ${T.border}` }}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: "100%", background: "none", border: "none", cursor: "pointer",
                padding: "24px 0",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
              }}
            >
              <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 16, color: T.text, textAlign: "left" }}>{q}</span>
              {open === i
                ? <ChevronUp size={18} color={T.accentL} style={{ flexShrink: 0 }} />
                : <ChevronDown size={18} color={T.gray} style={{ flexShrink: 0 }} />}
            </button>
            {open === i && (
              <p style={{ fontFamily: sans, fontSize: 15, color: T.textSub, lineHeight: 1.7, margin: "0 0 24px", paddingRight: 32 }}>
                {a}
              </p>
            )}
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${T.border}` }} />
      </div>
    </section>
  );
}

/* ─── CTA BOTTOM ──────────────────────────────────────────────────────────── */
function CtaBottom({ onLogin }) {
  return (
    <section style={{ background: T.text, padding: "100px 32px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
        <h2 style={{
          fontFamily: sans, fontWeight: 900,
          fontSize: "clamp(32px, 5vw, 56px)",
          letterSpacing: "-1.5px", color: T.white,
          margin: "0 0 20px", lineHeight: 1.05,
        }}>
          ¿Listo para mover<br />tu negocio?
        </h2>
        <p style={{ fontFamily: sans, fontSize: 17, color: "rgba(255,255,255,0.5)", margin: "0 0 40px", lineHeight: 1.6 }}>
          Contáctanos hoy y te asignamos una unidad para tu primera ruta.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="mailto:soporte@blogix.do" style={{
            fontFamily: sans, fontWeight: 700, fontSize: 15,
            padding: "14px 32px", borderRadius: 8,
            background: T.white, color: T.text,
            textDecoration: "none", display: "flex", alignItems: "center", gap: 8,
          }}>
            Solicitar servicio <ArrowRight size={16} />
          </a>
          <button onClick={onLogin} style={{
            fontFamily: sans, fontWeight: 600, fontSize: 15,
            padding: "14px 32px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.2)",
            color: T.white, background: "transparent", cursor: "pointer",
          }}>
            Iniciar Sesión
          </button>
        </div>
      </div>
    </section>
  );
}

/* ─── FOOTER ──────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{
      background: T.navy, borderTop: "1px solid rgba(255,255,255,0.06)",
      padding: "36px 32px",
    }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, background: T.accentL,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Truck size={16} color={T.white} />
          </div>
          <span style={{ fontFamily: sans, fontWeight: 800, fontSize: 15, color: T.white }}>B‑Logix</span>
          <span style={{ fontFamily: sans, fontSize: 12, color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>© 2026</span>
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <a href="mailto:soporte@blogix.do" style={{ fontFamily: sans, fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>soporte@blogix.do</a>
          <a href="/privacy" style={{ fontFamily: sans, fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>Privacidad</a>
        </div>
      </div>
    </footer>
  );
}

/* ─── ROOT ────────────────────────────────────────────────────────────────── */
export default function LandingPage({ onLogin }) {
  return (
    <div style={{ fontFamily: sans }}>
      <Nav onLogin={onLogin} />
      <Hero onLogin={onLogin} />
      <Stats />
      <Benefits />
      <HowItWorks onLogin={onLogin} />
      <Faq />
      <CtaBottom onLogin={onLogin} />
      <Footer />
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { Truck, Route, Building2, Users, UserCog, Briefcase, Receipt, CreditCard, Banknote, Store, Handshake, ShieldCheck, LayoutDashboard, Globe, LogOut, UserCheck, Menu, TrendingUp, RefreshCw, Home, DollarSign, FileText, Landmark } from "lucide-react";
import { useApp } from "./context/AppContext.jsx";
import { getToken } from "./api.js";
import { colors } from "./constants/theme.js";
import { Badge } from "./components/ui/index.jsx";
import LoginPage from "./components/LoginPage.jsx";
import CfoChat from "./components/CfoChat.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AgentsPage from "./pages/AgentsPage.jsx";
import PartnerDashboard from "./pages/PartnerDashboard.jsx";
import DriverDashboard from "./pages/DriverDashboard.jsx";
import TripsPage from "./pages/TripsPage.jsx";
import ClientsPage from "./pages/ClientsPage.jsx";
import FleetPage from "./pages/FleetPage.jsx";
import DriversPage from "./pages/DriversPage.jsx";
import PartnersPage from "./pages/PartnersPage.jsx";
import BrokersPage from "./pages/BrokersPage.jsx";
import ExpensesPage from "./pages/ExpensesPage.jsx";
import CxPPage from "./pages/CxPPage.jsx";
import NominaPage from "./pages/NominaPage.jsx";
import SuppliersPage from "./pages/SuppliersPage.jsx";
import SettlementsPage from "./pages/SettlementsPage.jsx";
import CxCPage from "./pages/CxCPage.jsx";
import InvoicesPage from "./pages/InvoicesPage.jsx";
import BancoPage from "./pages/BancoPage.jsx";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function SyncAllButton({ syncAll, sidebarOpen }) {
  const [msg, setMsg] = useState(null);
  const handle = () => {
    const { added, removed, invoicesPatched } = syncAll();
    const parts = [];
    if (added > 0) parts.push(`+${added} nómina`);
    if (removed > 0) parts.push(`−${removed} gasto${removed !== 1 ? "s" : ""} broker`);
    if (invoicesPatched > 0) parts.push(`${invoicesPatched} factura${invoicesPatched !== 1 ? "s" : ""} actualizadas`);
    const text = parts.length > 0 ? `✅ ${parts.join(", ")}` : "✅ Todo sincronizado";
    setMsg(text);
    setTimeout(() => setMsg(null), 4000);
  };
  return (
    <div style={{ position: "relative" }}>
      <button onClick={handle} title="Sincronizar todo" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 12, width: "100%" }}>
        <RefreshCw size={14} />{sidebarOpen && <span>Sincronizar todo</span>}
      </button>
      {msg && sidebarOpen && (
        <div style={{ position: "absolute", bottom: "110%", left: 8, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 7, padding: "6px 10px", fontSize: 11, color: colors.green, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.3)", zIndex: 300 }}>
          {msg}
        </div>
      )}
    </div>
  );
}

async function initPushNotifications(userRole) {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;
    await PushNotifications.register();
    PushNotifications.addListener("registration", async (token) => {
      try {
        await fetch(`${API_BASE}/api/push/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
          body: JSON.stringify({ token: token.value, platform: Capacitor.getPlatform() }),
        });
      } catch { /* non-critical — token will be retried on next login */ }
    });
    PushNotifications.addListener("pushNotificationReceived", () => {
    });
    PushNotifications.addListener("pushNotificationActionPerformed", () => {
      // User tapped notification — app already opens to foreground
    });
  } catch (e) {
    // Not on native platform, ignore silently
  }
}

export default function App() {
  const {
    lang, setLang, t, user, login, logout, forceSync, syncAll,
    isAdmin, isPartner, isDriver, allUsers,
    clients, setClients, partners, setPartners, trucks, setTrucks,
    drivers, setDrivers, trips, setTrips, expenses, setExpenses,
    brokers, setBrokers, suppliers, setSuppliers,
    fixedTemplates, setFixedTemplates, settlementStatus, setSettlementStatus,
    cobros, setCobros, invoices, setInvoices,
    bankAccount, setBankAccount, bankReconciliation, setBankReconciliation,
    syncStatus, partner, partnerTruckIds, driverObj, alerts,
  } = useApp();

  const [page, setPage] = useState(() => {
    try {
      const s = localStorage.getItem("blogix_session");
      const u = s ? JSON.parse(s) : null;
      if (u?.role === "driver") return "driverDash";
      if (u?.role === "partner") return "partnerDash";
    } catch {}
    return "dashboard";
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth > 768 : true);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth <= 768 : false);
  const [recovering, setRecovering] = useState(false);
  const [recovered, setRecovered] = useState(false);

  useEffect(() => {
    const handle = () => { const m = window.innerWidth <= 768; setIsMobile(m); if (!m) setSidebarOpen(true); };
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  if (window.location.pathname.startsWith("/privacy")) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 800, margin: "40px auto", padding: "0 20px", color: "#333", lineHeight: 1.7 }}>
        <h1 style={{ color: "#c0392b" }}>Política de Privacidad — B-Logix</h1>
        <p><strong>Última actualización:</strong> 23 de abril de 2026</p>
        <p>B-Logix es una plataforma de gestión logística para empresas de transporte en República Dominicana. Esta política describe cómo recopilamos, usamos y protegemos su información.</p>
        <h2>1. Información que recopilamos</h2>
        <ul>
          <li><strong>Información de cuenta:</strong> nombre de usuario y contraseña (almacenada encriptada).</li>
          <li><strong>Datos operativos:</strong> registros de viajes, gastos, camiones y liquidaciones.</li>
          <li><strong>Datos del dispositivo:</strong> información básica para el funcionamiento de la app.</li>
        </ul>
        <h2>2. Cómo usamos la información</h2>
        <ul>
          <li>Para proveer las funciones de la plataforma (gestión de flota, nómina, cuentas por cobrar).</li>
          <li>Para autenticar usuarios y controlar acceso según rol (administrador, socio, conductor).</li>
          <li>Para enviar notificaciones push sobre nómina y viajes asignados.</li>
        </ul>
        <h2>3. Compartir información</h2>
        <p>No vendemos ni compartimos su información con terceros. Los datos se almacenan en servidores seguros vía Supabase y Netlify.</p>
        <h2>4. Seguridad</h2>
        <p>Contraseñas almacenadas con encriptación bcrypt. Comunicaciones vía HTTPS.</p>
        <h2>5. Permisos de la aplicación</h2>
        <ul>
          <li><strong>Cámara:</strong> para adjuntar fotos de recibos a gastos (opcional).</li>
          <li><strong>Notificaciones:</strong> para avisos de nómina y viajes.</li>
          <li><strong>Internet:</strong> para sincronizar datos con el servidor.</li>
        </ul>
        <h2>6. Contacto</h2>
        <p>Para preguntas: <a href="mailto:soporte@blogix.do" style={{ color: "#c0392b" }}>soporte@blogix.do</a></p>
      </div>
    );
  }

  if (!user) return <LoginPage t={t} onLogin={(u, remember, token) => {
    login(u, remember, token);
    setPage(u.role === "partner" ? "partnerDash" : u.role === "driver" ? "driverDash" : "dashboard");
    initPushNotifications(u.role);
  }} />;

  const alertCount = alerts.filter(a => a.severity === "error" || a.severity === "warning").length;
  const localDataCount = trips.length + clients.length + trucks.length + drivers.length + expenses.length;
  const showRecoveryBanner = isAdmin && localDataCount > 0 && syncStatus === "offline" && !recovered;

  const adminNav = [
    { id: "dashboard",   icon: LayoutDashboard, label: t.dashboard },
    { divider: true },
    { id: "clients",     icon: Building2,        label: t.clients },
    { id: "invoices",    icon: FileText,         label: "Facturas" },
    { id: "cxc",         icon: TrendingUp,       label: "Cuentas x Cobrar" },
    { id: "trips",       icon: Route,            label: t.trips },
    { id: "fleet",       icon: Truck,            label: t.fleet },
    { id: "drivers",     icon: Users,            label: t.drivers },
    { id: "partners",    icon: UserCog,          label: t.partners },
    { id: "brokers",     icon: Briefcase,        label: t.brokers },
    { divider: true },
    { id: "expenses",    icon: Receipt,          label: t.expenses },
    { id: "cxp",         icon: CreditCard,       label: "Cuentas x Pagar" },
    { id: "nomina",      icon: Banknote,         label: "Nómina" },
    { id: "banco",       icon: Landmark,         label: "Banco" },
    { id: "suppliers",   icon: Store,            label: t.suppliers },
    { id: "settlements", icon: Handshake,        label: t.settlements },
    { divider: true },
    { id: "agents",      icon: ShieldCheck,      label: t.agents, badge: alertCount },
  ];
  const partnerNav = [
    { id: "partnerDash", icon: LayoutDashboard, label: t.partnerDashboard },
    { id: "settlements", icon: Handshake,       label: t.settlements },
  ];
  const driverNav = [
    { id: "driverDash", icon: LayoutDashboard, label: t.dashboard },
  ];
  const navItems = isAdmin ? adminNav : isPartner ? partnerNav : driverNav;

  const ctx = { t, user, isMobile, clients, setClients, partners, setPartners, trucks, setTrucks, drivers, setDrivers, trips, setTrips, expenses, setExpenses, brokers, setBrokers, suppliers, setSuppliers, fixedTemplates, setFixedTemplates, settlementStatus, setSettlementStatus, cobros, setCobros, invoices, setInvoices, bankAccount, setBankAccount, bankReconciliation, setBankReconciliation, partner, partnerTruckIds, driverObj, alerts };

  const pageTitles = {
    dashboard:   t.dashboard,
    partnerDash: t.partnerDashboard,
    driverDash:  t.dashboard,
    clients:     t.clients,
    invoices:    "Facturas",
    cxc:         "Cuentas x Cobrar",
    trips:       t.trips,
    fleet:       t.fleet,
    drivers:     t.drivers,
    partners:    t.partners,
    brokers:     t.brokers,
    expenses:    t.expenses,
    cxp:         "Cuentas x Pagar",
    nomina:      "Nómina",
    banco:       "Banco",
    suppliers:   t.suppliers,
    settlements: t.settlements,
    agents:      t.agents,
  };

  const bottomNavTabs = [
    { id: "dashboard", icon: Home,         label: "Dashboard" },
    { id: "trips",     icon: Truck,        label: "Viajes"    },
    { id: "expenses",  icon: DollarSign,   label: "Gastos"    },
    { id: "__mas__",   icon: Menu,         label: "Más"       },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", background: colors.bg, color: colors.text, fontFamily: "'Inter',-apple-system,sans-serif", fontSize: 13 }}>
      {isMobile && sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 190 }} />}

      {/* Mobile top bar */}
      {isMobile && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: `calc(52px + env(safe-area-inset-top, 0px))`, zIndex: 200, background: colors.card, borderBottom: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <button onClick={() => setSidebarOpen(true)} style={{ background: "transparent", border: "none", color: colors.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 8, flexShrink: 0 }}>
            <Menu size={20} />
          </button>
          <span style={{ fontWeight: 600, fontSize: 15, color: colors.text, flex: 1, textAlign: "center" }}>
            {pageTitles[page] ?? "B-Logix"}
          </span>
          <button onClick={logout} title="Cerrar sesión" style={{ background: "transparent", border: "none", color: colors.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 8, flexShrink: 0 }}>
            <LogOut size={18} />
          </button>
        </div>
      )}

      <div style={{ width: isMobile ? (sidebarOpen ? 220 : 0) : (sidebarOpen ? 220 : 60), ...(isMobile ? { position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200 } : {}), background: colors.sidebar, borderRight: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", transition: "width 0.2s", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 12px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${colors.border}`, cursor: "pointer" }} onClick={() => setSidebarOpen(!sidebarOpen)}>
          <div style={{ width: 34, height: 34, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src="/logo.png" alt="B-Logix" style={{ width: "95%", height: "95%", objectFit: "contain" }} />
          </div>
          {sidebarOpen && <span style={{ fontWeight: 700, fontSize: 16 }}>B-Logix</span>}
        </div>

        <nav style={{ flex: 1, padding: "10px 6px", display: "flex", flexDirection: "column", gap: 1, overflowY: "auto", overflowX: "hidden" }}>
          {navItems.map((item, idx) => {
            if (item.divider) {
              return <div key={`div-${idx}`} style={{ height: 1, background: colors.border, margin: "4px 6px", opacity: 0.6 }} />;
            }
            const act = page === item.id; const Icon = item.icon;
            return <button key={item.id} onClick={() => { setPage(item.id); if (isMobile) setSidebarOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, border: "none", borderLeft: act ? `3px solid ${colors.accent}` : "3px solid transparent", background: act ? colors.accent + "18" : "transparent", color: act ? colors.accentLight : colors.text, cursor: "pointer", fontSize: 13, textAlign: "left", width: "100%", transition: "background 0.15s, border-color 0.15s", position: "relative" }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <Icon size={16} />
                {item.badge > 0 && <span style={{ position: "absolute", top: -5, right: -6, background: colors.red, color: "white", borderRadius: 10, fontSize: 9, fontWeight: 700, minWidth: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{item.badge > 99 ? "99+" : item.badge}</span>}
              </div>
              {sidebarOpen && <span style={{ whiteSpace: "nowrap", flex: 1 }}>{item.label}</span>}
              {sidebarOpen && item.badge > 0 && <span style={{ background: act ? colors.accent + "30" : colors.red + "22", color: act ? colors.accentLight : colors.red, borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 7px" }}>{item.badge}</span>}
            </button>;
          })}
        </nav>

        <div style={{ padding: "8px 6px", borderTop: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", gap: 2 }}>
          {isAdmin && <CfoChat data={{ clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, settlementStatus }} t={t} sidebarOpen={sidebarOpen} isMobile={isMobile} />}
          {isAdmin && <SyncAllButton syncAll={syncAll} sidebarOpen={sidebarOpen} />}

          {/* User info row — visible only when sidebar is open */}
          {sidebarOpen && (
            <div style={{ padding: "6px 10px 4px", display: "flex", alignItems: "center", gap: 6 }}>
              <UserCheck size={13} color={colors.textMuted} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: colors.text, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</span>
              <Badge label={user.role} color={user.role === "admin" ? colors.green : user.role === "partner" ? colors.orange : colors.accent} />
            </div>
          )}

          {/* Sync status — visible only when sidebar is open */}
          {sidebarOpen && (
            <div style={{ padding: "2px 10px 6px", fontSize: 10, color: syncStatus === "saved" ? colors.green : syncStatus === "saving" ? colors.orange : syncStatus === "conflict" ? colors.red : colors.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: syncStatus === "saved" ? colors.green : syncStatus === "saving" ? colors.orange : syncStatus === "conflict" ? colors.red : "#555", flexShrink: 0, display: "inline-block" }} />
              {syncStatus === "saved" ? "Guardado ✓" : syncStatus === "saving" ? "Guardando..." : syncStatus === "conflict" ? "Conflicto — recargando..." : "Sin conexión (local)"}
            </div>
          )}

          {/* Divider above action buttons */}
          <div style={{ height: 1, background: colors.border, margin: "2px 4px 4px", opacity: 0.7 }} />

          {/* Logout button */}
          <button
            onClick={logout}
            title="Cerrar sesión"
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 10px", minHeight: 44, borderRadius: 7, border: "none", background: "transparent", color: colors.red, cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%", transition: "background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = colors.red + "18"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <LogOut size={16} style={{ flexShrink: 0 }} />
            {sidebarOpen && <span style={{ whiteSpace: "nowrap" }}>{t.logout}</span>}
          </button>

          {/* Language toggle button */}
          <button
            onClick={() => setLang(lang === "en" ? "es" : "en")}
            title={lang === "en" ? "Cambiar a Español" : "Switch to English"}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 10px", minHeight: 44, borderRadius: 7, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 13, width: "100%", transition: "background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = colors.card}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <Globe size={16} style={{ flexShrink: 0 }} />
            {sidebarOpen && <span style={{ whiteSpace: "nowrap" }}>{lang === "en" ? "Español" : "English"}</span>}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", paddingTop: isMobile ? `calc(52px + env(safe-area-inset-top, 0px))` : 20, paddingLeft: isMobile ? 14 : 20, paddingRight: isMobile ? 14 : 20, paddingBottom: isMobile ? `calc(56px + env(safe-area-inset-bottom))` : `calc(20px + env(safe-area-inset-bottom))`, position: "relative" }}>
        {showRecoveryBanner && (
          <div style={{ position: "sticky", top: 0, zIndex: 101, background: "#7c3aed", color: "#fff", padding: "10px 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 8, marginBottom: 12 }}>
            <span>🔔 Tienes {localDataCount} registros locales que no están en el servidor. ¿Restaurar ahora?</span>
            <button
              disabled={recovering}
              onClick={async () => {
                setRecovering(true);
                const result = await forceSync();
                setRecovering(false);
                if (result?.saved === "api") setRecovered(true);
              }}
              style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.5)", color: "#fff", borderRadius: 6, padding: "5px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}
            >
              {recovering ? "Guardando..." : "💾 Restaurar al servidor"}
            </button>
          </div>
        )}
        {!showRecoveryBanner && isAdmin && syncStatus === "offline" && (
          <div style={{ position: "sticky", top: 0, zIndex: 100, background: colors.red, color: "#fff", padding: "8px 16px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 8, marginBottom: 12 }}>
            <span>⚠️ Sin conexión al servidor — los cambios se guardan localmente pero NO en la nube.</span>
            <button onClick={() => window.location.reload()} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
              🔄 Reconectar
            </button>
          </div>
        )}

        {page === "dashboard"   && isAdmin   && <AdminDashboard   {...ctx} setPage={setPage} />}
        {page === "partnerDash" && isPartner  && <PartnerDashboard {...ctx} />}
        {page === "driverDash"  && isDriver   && <DriverDashboard  {...ctx} />}
        {page === "clients"     && isAdmin    && <ClientsPage      {...ctx} />}
        {page === "invoices"    && isAdmin    && <InvoicesPage      {...ctx} />}
        {page === "cxc"         && isAdmin    && <CxCPage          {...ctx} setPage={setPage} />}
        {page === "trips"       && isAdmin    && <TripsPage        {...ctx} />}
        {page === "fleet"       && isAdmin    && <FleetPage        {...ctx} />}
        {page === "drivers"     && isAdmin    && <DriversPage      {...ctx} />}
        {page === "partners"    && isAdmin    && <PartnersPage     {...ctx} />}
        {page === "brokers"     && isAdmin    && <BrokersPage      {...ctx} />}
        {page === "expenses"    && isAdmin    && <ExpensesPage     {...ctx} />}
        {page === "cxp"         && isAdmin    && <CxPPage          {...ctx} />}
        {page === "nomina"      && isAdmin    && <NominaPage       {...ctx} />}
        {page === "banco"       && isAdmin    && <BancoPage        {...ctx} />}
        {page === "suppliers"   && isAdmin    && <SuppliersPage    {...ctx} />}
        {page === "settlements" && (isAdmin || isPartner) && <SettlementsPage  {...ctx} />}
        {page === "agents"      && isAdmin    && <AgentsPage       {...ctx} />}
      </div>

      {/* Mobile bottom navigation — partner */}
      {isMobile && user.role === "partner" && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 56, zIndex: 200, background: colors.card, borderTop: `1px solid ${colors.border}`, display: "flex", alignItems: "stretch", paddingBottom: "env(safe-area-inset-bottom)" }}>
          {[
            { id: "partnerDash", icon: LayoutDashboard, label: t.partnerDashboard || "Dashboard" },
            { id: "settlements", icon: Handshake,       label: t.settlements || "Liquidaciones" },
          ].map(tab => {
            const Icon = tab.icon; const isActive = page === tab.id;
            return <button key={tab.id} onClick={() => setPage(tab.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, border: "none", background: "transparent", color: isActive ? colors.accent : colors.textMuted, cursor: "pointer", fontSize: 10, fontWeight: isActive ? 600 : 400, padding: "6px 0", minWidth: 0 }}>
              <Icon size={20} color={isActive ? colors.accent : colors.textMuted} />
              <span style={{ lineHeight: 1 }}>{tab.label}</span>
            </button>;
          })}
        </div>
      )}

      {/* Mobile bottom navigation — driver */}
      {isMobile && user.role === "driver" && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 56, zIndex: 200, background: colors.card, borderTop: `1px solid ${colors.border}`, display: "flex", alignItems: "stretch", paddingBottom: "env(safe-area-inset-bottom)" }}>
          <button onClick={() => setPage("driverDash")} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, border: "none", background: "transparent", color: colors.accent, cursor: "pointer", fontSize: 10, fontWeight: 600, padding: "6px 0", minWidth: 0 }}>
            <LayoutDashboard size={20} color={colors.accent} />
            <span style={{ lineHeight: 1 }}>{t.dashboard}</span>
          </button>
          <button onClick={logout} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 10, padding: "6px 0", minWidth: 0 }}>
            <LogOut size={20} color={colors.textMuted} />
            <span style={{ lineHeight: 1 }}>{t.logout || "Salir"}</span>
          </button>
        </div>
      )}

      {/* Mobile bottom navigation — admin only */}
      {isMobile && user.role === "admin" && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 56, zIndex: 200, background: colors.card, borderTop: `1px solid ${colors.border}`, display: "flex", alignItems: "stretch", paddingBottom: "env(safe-area-inset-bottom)" }}>
          {bottomNavTabs.map((tab) => {
            const Icon = tab.icon;
            const isMas = tab.id === "__mas__";
            const isActive = !isMas && page === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => isMas ? setSidebarOpen(true) : setPage(tab.id)}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, border: "none", background: "transparent", color: isActive ? colors.accent : colors.textMuted, cursor: "pointer", fontSize: 10, fontWeight: isActive ? 600 : 400, padding: "6px 0", minWidth: 0 }}
              >
                <Icon size={20} color={isActive ? colors.accent : colors.textMuted} />
                <span style={{ lineHeight: 1 }}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

    </div>
  );
}

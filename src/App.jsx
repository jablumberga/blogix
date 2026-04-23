import { useState, useEffect } from "react";
import { Truck, Route, Building2, Users, UserCog, Briefcase, Receipt, CreditCard, Banknote, Store, Handshake, ShieldCheck, LayoutDashboard, Globe, LogIn, UserCheck, Menu, TrendingUp } from "lucide-react";
import { useApp } from "./context/AppContext.jsx";
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

export default function App() {
  const {
    lang, setLang, t, user, login, logout, forceSync,
    isAdmin, isPartner, isDriver, allUsers,
    clients, setClients, partners, setPartners, trucks, setTrucks,
    drivers, setDrivers, trips, setTrips, expenses, setExpenses,
    brokers, setBrokers, suppliers, setSuppliers,
    fixedTemplates, setFixedTemplates, settlementStatus, setSettlementStatus,
    cobros, setCobros, syncStatus,
    partner, partnerTruckIds, driverObj, alerts,
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

  if (!user) return <LoginPage t={t} allUsers={allUsers} onLogin={(u, remember, token) => {
    login(u, remember, token);
    setPage(u.role === "partner" ? "partnerDash" : u.role === "driver" ? "driverDash" : "dashboard");
  }} />;

  const alertCount = alerts.filter(a => a.severity === "error" || a.severity === "warning").length;
  const localDataCount = trips.length + clients.length + trucks.length + drivers.length + expenses.length;
  const showRecoveryBanner = isAdmin && localDataCount > 0 && syncStatus === "offline" && !recovered;

  const adminNav = [
    { id: "dashboard",   icon: LayoutDashboard, label: t.dashboard },
    { divider: true },
    { id: "clients",     icon: Building2,        label: t.clients },
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

  const ctx = { t, user, clients, setClients, partners, setPartners, trucks, setTrucks, drivers, setDrivers, trips, setTrips, expenses, setExpenses, brokers, setBrokers, suppliers, setSuppliers, fixedTemplates, setFixedTemplates, settlementStatus, setSettlementStatus, cobros, setCobros, partner, partnerTruckIds, driverObj, alerts };

  return (
    <div style={{ display: "flex", height: "100vh", background: colors.bg, color: colors.text, fontFamily: "'Inter',-apple-system,sans-serif", fontSize: 13 }}>
      {isMobile && sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 190 }} />}

      <div style={{ width: isMobile ? (sidebarOpen ? 220 : 0) : (sidebarOpen ? 220 : 60), ...(isMobile ? { position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200 } : {}), background: colors.sidebar, borderRight: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", transition: "width 0.2s", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 12px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${colors.border}`, cursor: "pointer" }} onClick={() => setSidebarOpen(!sidebarOpen)}>
          <div style={{ width: 34, height: 34, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src="/logo.png" alt="B-Logix" style={{ width: "95%", height: "95%", objectFit: "contain" }} />
          </div>
          {sidebarOpen && <span style={{ fontWeight: 700, fontSize: 16 }}>B-Logix</span>}
        </div>

        <nav style={{ flex: 1, padding: "10px 6px", display: "flex", flexDirection: "column", gap: 1 }}>
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

        <div style={{ padding: "8px 6px", borderTop: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
          {isAdmin && <CfoChat data={{ clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, settlementStatus }} t={t} sidebarOpen={sidebarOpen} isMobile={isMobile} />}
          <button onClick={() => setLang(lang === "en" ? "es" : "en")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 12, width: "100%" }}>
            <Globe size={14} />{sidebarOpen && <span>{lang === "en" ? "Español" : "English"}</span>}
          </button>
          <button onClick={logout} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 12, width: "100%" }}>
            <LogIn size={14} />{sidebarOpen && <span>{t.logout}</span>}
          </button>
          {sidebarOpen && <div style={{ padding: "6px 10px", fontSize: 11, color: colors.textMuted, display: "flex", alignItems: "center", gap: 6 }}><UserCheck size={12} /> {user.name} <Badge label={user.role} color={user.role === "admin" ? colors.green : user.role === "partner" ? colors.orange : colors.accent} /></div>}
          {sidebarOpen && (
            <div style={{ padding: "4px 10px 8px", fontSize: 10, color: syncStatus === "saved" ? colors.green : syncStatus === "saving" ? colors.orange : colors.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: syncStatus === "saved" ? colors.green : syncStatus === "saving" ? colors.orange : "#555", display: "inline-block" }} />
              {syncStatus === "saved" ? "Guardado ✓" : syncStatus === "saving" ? "Guardando..." : "Sin conexión (local)"}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "56px 14px 14px" : 20, position: "relative" }}>
        {isMobile && <button onClick={() => setSidebarOpen(true)} style={{ position: "fixed", top: 16, left: 16, zIndex: 150, background: colors.accent, border: "none", borderRadius: 8, padding: "8px 11px", cursor: "pointer", color: "white", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}><Menu size={18} /></button>}
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
        {!showRecoveryBanner && syncStatus === "offline" && (
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
        {page === "cxc"         && isAdmin    && <CxCPage          {...ctx} />}
        {page === "trips"       && isAdmin    && <TripsPage        {...ctx} />}
        {page === "fleet"       && isAdmin    && <FleetPage        {...ctx} />}
        {page === "drivers"     && isAdmin    && <DriversPage      {...ctx} />}
        {page === "partners"    && isAdmin    && <PartnersPage     {...ctx} />}
        {page === "brokers"     && isAdmin    && <BrokersPage      {...ctx} />}
        {page === "expenses"    && isAdmin    && <ExpensesPage     {...ctx} />}
        {page === "cxp"         && isAdmin    && <CxPPage          {...ctx} />}
        {page === "nomina"      && isAdmin    && <NominaPage       {...ctx} />}
        {page === "suppliers"   && isAdmin    && <SuppliersPage    {...ctx} />}
        {page === "settlements"               && <SettlementsPage  {...ctx} />}
        {page === "agents"      && isAdmin    && <AgentsPage       {...ctx} />}
      </div>

    </div>
  );
}

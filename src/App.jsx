import { useState, useEffect, useRef } from "react";
import { Truck, Route, Building2, Users, UserCog, Briefcase, Receipt, CreditCard, Banknote, Store, Handshake, ShieldCheck, LayoutDashboard, Globe, LogIn, UserCheck, Menu, TrendingUp } from "lucide-react";
import { loadData, saveData } from "./api.js";
import { translations } from "./constants/translations.js";
import { USERS, initSettlementStatus } from "./constants/users.js";
import { colors } from "./constants/theme.js";
import { computeAlerts } from "./utils/helpers.js";
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
  const [lang, setLang] = useState("es");
  const [user, setUser] = useState(() => {
    try { const s = localStorage.getItem("blogix_session"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
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

  useEffect(() => {
    const handle = () => { const m = window.innerWidth <= 768; setIsMobile(m); if (!m) setSidebarOpen(true); };
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  const t = translations[lang];

  // ── Data State ───────────────────────────────────────────────────────────────
  const [clients, setClients] = useState([]);
  const [partners, setPartners] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [trips, setTrips] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [fixedTemplates, setFixedTemplates] = useState([]);
  const [settlementStatus, setSettlementStatus] = useState(initSettlementStatus);
  const [cobros, setCobros] = useState([]);
  const saveTimerRef = useRef(null);
  const dataLoadedRef = useRef(false);

  // ── Load data on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    loadData().then(({ source, data }) => {
      if (data && Object.keys(data).length > 0) {
        if (Array.isArray(data.clients))         setClients(data.clients);
        if (Array.isArray(data.partners))        setPartners(data.partners);
        if (Array.isArray(data.trucks))          setTrucks(data.trucks);
        if (Array.isArray(data.drivers))         setDrivers(data.drivers);
        if (Array.isArray(data.trips))           setTrips(data.trips);
        if (Array.isArray(data.expenses))        setExpenses(data.expenses);
        if (Array.isArray(data.brokers))         setBrokers(data.brokers);
        if (Array.isArray(data.suppliers))       setSuppliers(data.suppliers);
        if (Array.isArray(data.fixedTemplates))  setFixedTemplates(data.fixedTemplates);
        if (data.settlementStatus)               setSettlementStatus(data.settlementStatus);
        if (Array.isArray(data.cobros))          setCobros(data.cobros);
      }
      dataLoadedRef.current = true;
      setSyncStatus(source === "api" ? "saved" : "offline");
    });
  }, []);

  // ── Auto-save (debounced 1.5s) ───────────────────────────────────────────────
  useEffect(() => {
    if (!dataLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus("saving");
      const result = await saveData({ clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, fixedTemplates, settlementStatus, cobros });
      setSyncStatus(result.saved === "api" ? "saved" : "offline");
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, fixedTemplates, settlementStatus, cobros]);

  // ── Dynamic user list (admins + partners + drivers) ─────────────────────────
  const allUsers = [
    ...USERS.filter(u => u.role === "admin"),
    ...partners.map(p => ({ id: `p-${p.id}`, username: p.username, password: p.password, role: "partner", name: p.name, refId: p.id })),
    ...drivers.map(d => ({ id: `d-${d.id}`, username: d.username, password: d.password, role: "driver", name: d.name, refId: d.id })),
  ];

  if (!user) return <LoginPage t={t} allUsers={allUsers} onLogin={(u, remember) => {
    if (remember) { try { const { password: _pw, ...safe } = u; localStorage.setItem("blogix_session", JSON.stringify(safe)); } catch {} }
    setUser(u); setPage(u.role === "partner" ? "partnerDash" : u.role === "driver" ? "driverDash" : "dashboard");
  }} />;

  const isAdmin  = user.role === "admin";
  const isPartner = user.role === "partner";
  const isDriver  = user.role === "driver";

  const alerts     = isAdmin ? computeAlerts({ trips, expenses, clients, drivers, trucks, partners, brokers, settlementStatus }) : [];
  const alertCount = alerts.filter(a => a.severity === "error" || a.severity === "warning").length;

  const adminNav = [
    { id: "dashboard",   icon: LayoutDashboard, label: t.dashboard },
    { id: "clients",     icon: Building2,        label: t.clients },
    { id: "cxc",         icon: TrendingUp,       label: "Cuentas x Cobrar" },
    { id: "trips",       icon: Route,            label: t.trips },
    { id: "fleet",       icon: Truck,            label: t.fleet },
    { id: "drivers",     icon: Users,            label: t.drivers },
    { id: "partners",    icon: UserCog,          label: t.partners },
    { id: "brokers",     icon: Briefcase,        label: t.brokers },
    { id: "expenses",    icon: Receipt,          label: t.expenses },
    { id: "cxp",         icon: CreditCard,       label: "Cuentas x Pagar" },
    { id: "nomina",      icon: Banknote,         label: "Nómina" },
    { id: "suppliers",   icon: Store,            label: t.suppliers },
    { id: "settlements", icon: Handshake,        label: t.settlements },
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

  // ── Role-filtered derived data ───────────────────────────────────────────────
  const partner         = isPartner ? partners.find(p => p.name === user.name) : null;
  const partnerTruckIds = partner ? trucks.filter(tk => tk.partnerId === partner.id).map(tk => tk.id) : [];
  const driverObj       = isDriver ? drivers.find(d => d.name === user.name) : null;

  // ── Shared prop bag ──────────────────────────────────────────────────────────
  const ctx = { t, user, clients, setClients, partners, setPartners, trucks, setTrucks, drivers, setDrivers, trips, setTrips, expenses, setExpenses, brokers, setBrokers, suppliers, setSuppliers, fixedTemplates, setFixedTemplates, settlementStatus, setSettlementStatus, cobros, setCobros, partner, partnerTruckIds, driverObj, alerts };

  return (
    <div style={{ display: "flex", height: "100vh", background: colors.bg, color: colors.text, fontFamily: "'Inter',-apple-system,sans-serif", fontSize: 13 }}>
      {isMobile && sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 190 }} />}

      <div style={{ width: isMobile ? (sidebarOpen ? 220 : 0) : (sidebarOpen ? 220 : 60), ...(isMobile ? { position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200 } : {}), background: colors.sidebar, borderRight: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", transition: "width 0.2s", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 12px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${colors.border}`, cursor: "pointer" }} onClick={() => setSidebarOpen(!sidebarOpen)}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${colors.accent}, ${colors.green})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Truck size={16} color="white" /></div>
          {sidebarOpen && <span style={{ fontWeight: 700, fontSize: 16 }}>B-Logix</span>}
        </div>

        <nav style={{ flex: 1, padding: "10px 6px", display: "flex", flexDirection: "column", gap: 1 }}>
          {navItems.map(item => {
            const act = page === item.id; const Icon = item.icon;
            return <button key={item.id} onClick={() => { setPage(item.id); if (isMobile) setSidebarOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, border: "none", background: act ? colors.accent : "transparent", color: act ? "white" : colors.text, cursor: "pointer", fontSize: 13, textAlign: "left", width: "100%", transition: "background 0.15s", position: "relative" }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <Icon size={16} />
                {item.badge > 0 && <span style={{ position: "absolute", top: -5, right: -6, background: colors.red, color: "white", borderRadius: 10, fontSize: 9, fontWeight: 700, minWidth: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{item.badge > 99 ? "99+" : item.badge}</span>}
              </div>
              {sidebarOpen && <span style={{ whiteSpace: "nowrap", flex: 1 }}>{item.label}</span>}
              {sidebarOpen && item.badge > 0 && <span style={{ background: act ? "rgba(255,255,255,0.3)" : colors.red + "22", color: act ? "white" : colors.red, borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 7px" }}>{item.badge}</span>}
            </button>;
          })}
        </nav>

        <div style={{ padding: "8px 6px", borderTop: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={() => setLang(lang === "en" ? "es" : "en")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 12, width: "100%" }}>
            <Globe size={14} />{sidebarOpen && <span>{lang === "en" ? "Español" : "English"}</span>}
          </button>
          <button onClick={() => { try { localStorage.removeItem("blogix_session"); } catch {} setUser(null); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", color: colors.red, cursor: "pointer", fontSize: 12, width: "100%" }}>
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
        {isMobile && <button onClick={() => setSidebarOpen(true)} style={{ position: "fixed", top: 10, left: 10, zIndex: 150, background: colors.accent, border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: "white", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}><Menu size={18} /></button>}

        {page === "dashboard"   && isAdmin   && <AdminDashboard   {...ctx} setPage={setPage} />}
        {page === "partnerDash" && isPartner  && <PartnerDashboard {...ctx} />}
        {page === "driverDash"  && isDriver   && <DriverDashboard  {...ctx} />}
        {page === "clients"                   && <ClientsPage      {...ctx} />}
        {page === "cxc"                       && <CxCPage          {...ctx} />}
        {page === "trips"                     && <TripsPage         {...ctx} />}
        {page === "fleet"                     && <FleetPage         {...ctx} />}
        {page === "drivers"                   && <DriversPage       {...ctx} />}
        {page === "partners"    && isAdmin    && <PartnersPage      {...ctx} />}
        {page === "brokers"                   && <BrokersPage       {...ctx} />}
        {page === "expenses"                  && <ExpensesPage      {...ctx} />}
        {page === "cxp"                       && <CxPPage           {...ctx} />}
        {page === "nomina"                    && <NominaPage        {...ctx} />}
        {page === "suppliers"                 && <SuppliersPage     {...ctx} />}
        {page === "settlements"               && <SettlementsPage   {...ctx} />}
        {page === "agents"      && isAdmin    && <AgentsPage        {...ctx} />}
      </div>

      {isAdmin && <CfoChat data={{ clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, settlementStatus }} t={t} />}
    </div>
  );
     }

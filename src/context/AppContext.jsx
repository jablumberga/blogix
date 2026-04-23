import { createContext, useContext, useState, useEffect, useRef, useMemo } from "react";
import { loadData, saveData, saveToken, clearToken, resetApiCache } from "../api.js";
import { translations } from "../constants/translations.js";
import { USERS, initSettlementStatus } from "../constants/users.js";
import { computeAlerts } from "../utils/helpers.js";

const AppContext = createContext(null);

function applyData(data, setters) {
  const { setClients, setPartners, setTrucks, setDrivers, setTrips,
          setExpenses, setBrokers, setSuppliers, setFixedTemplates,
          setSettlementStatus, setCobros } = setters;
  if (!data || Object.keys(data).length === 0) return;
  if (Array.isArray(data.clients))        setClients(data.clients);
  if (Array.isArray(data.partners))       setPartners(data.partners);
  if (Array.isArray(data.trucks))         setTrucks(data.trucks);
  if (Array.isArray(data.drivers))        setDrivers(data.drivers);
  if (Array.isArray(data.trips))          setTrips(data.trips);
  if (Array.isArray(data.expenses))       setExpenses(data.expenses);
  if (Array.isArray(data.brokers))        setBrokers(data.brokers);
  if (Array.isArray(data.suppliers))      setSuppliers(data.suppliers);
  if (Array.isArray(data.fixedTemplates)) setFixedTemplates(data.fixedTemplates);
  if (data.settlementStatus)              setSettlementStatus(data.settlementStatus);
  if (Array.isArray(data.cobros))         setCobros(data.cobros);
}

export function AppProvider({ children }) {
  const [lang, setLang] = useState("es");
  const [user, setUser] = useState(() => {
    try { const s = localStorage.getItem("blogix_session"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 768 : true
  );
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 768 : false
  );

  useEffect(() => {
    const handle = () => {
      const m = window.innerWidth <= 768;
      setIsMobile(m);
      if (!m) setSidebarOpen(true);
    };
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
  const [syncStatus, setSyncStatus] = useState("idle");

  const saveTimerRef = useRef(null);
  const dataLoadedRef = useRef(false);
  const isReloadingRef = useRef(false); // blocks auto-save during post-login reload

  const setters = {
    setClients, setPartners, setTrucks, setDrivers, setTrips,
    setExpenses, setBrokers, setSuppliers, setFixedTemplates,
    setSettlementStatus, setCobros,
  };

  // ── Load on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadData().then(({ source, data }) => {
      if (source === "unauthenticated") {
        setUser(null);
        dataLoadedRef.current = true;
        return;
      }
      applyData(data, setters);
      dataLoadedRef.current = true;
      setSyncStatus(source === "api" ? "saved" : "offline");
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save (debounced 1.5s) ────────────────────────────────────────────
  useEffect(() => {
    if (!dataLoadedRef.current) return;
    if (isReloadingRef.current) return; // don't save empty state during post-login reload
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus("saving");
      const result = await saveData({
        clients, partners, trucks, drivers, trips, expenses,
        brokers, suppliers, fixedTemplates, settlementStatus, cobros,
      });
      setSyncStatus(result.saved === "api" ? "saved" : "offline");
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, fixedTemplates, settlementStatus, cobros]);

  // ── Dynamic user list ─────────────────────────────────────────────────────
  const allUsers = [
    ...USERS.filter(u => u.role === "admin"),
    ...partners.map(p => ({ id: `p-${p.id}`, username: p.username, password: p.password, role: "partner", name: p.name, refId: p.id })),
    ...drivers.map(d => ({ id: `d-${d.id}`, username: d.username, password: d.password, role: "driver", name: d.name, refId: d.id })),
  ];

  // ── Computed helpers ──────────────────────────────────────────────────────
  const isAdmin = user?.role === "admin";
  const isPartner = user?.role === "partner";
  const isDriver = user?.role === "driver";

  const partner = isPartner ? partners.find(p => p.id === user?.refId) : null;
  const partnerTruckIds = useMemo(
    () => partner ? trucks.filter(tk => tk.partnerId === partner.id).map(tk => tk.id) : [],
    [partner, trucks]
  );
  const driverObj = isDriver ? drivers.find(d => d.name === user?.name) : null;

  const alerts = useMemo(
    () => isAdmin ? computeAlerts({ trips, expenses, clients, drivers, trucks, partners, brokers, settlementStatus }) : [],
    [isAdmin, trips, expenses, clients, drivers, trucks, partners, brokers, settlementStatus]
  );

  const login = (u, remember, token) => {
    if (remember) {
      try { const { password: _pw, ...safe } = u; localStorage.setItem("blogix_session", JSON.stringify(safe)); } catch {}
      if (token) saveToken(token); // only persist token if user wants to stay logged in
    } else {
      clearToken(); // clear any stale token from previous session
    }
    if (token) resetApiCache();
    setUser(u);

    // Reload data from API with new token
    isReloadingRef.current = true;
    dataLoadedRef.current = false;
    loadData().then(({ source, data }) => {
      if (source === "unauthenticated") {
        clearToken();
        setUser(null);
        dataLoadedRef.current = true;
        isReloadingRef.current = false;
        return;
      }
      applyData(data, setters);
      dataLoadedRef.current = true;
      isReloadingRef.current = false;
      setSyncStatus(source === "api" ? "saved" : "offline");
    });
  };

  const logout = () => {
    try { localStorage.removeItem("blogix_session"); } catch {}
    clearToken();
    setUser(null);
  };

  const value = {
    // UI
    lang, setLang, t, user, login, logout,
    sidebarOpen, setSidebarOpen, isMobile, syncStatus,
    // Auth
    isAdmin, isPartner, isDriver, allUsers,
    // Data
    clients, setClients,
    partners, setPartners,
    trucks, setTrucks,
    drivers, setDrivers,
    trips, setTrips,
    expenses, setExpenses,
    brokers, setBrokers,
    suppliers, setSuppliers,
    fixedTemplates, setFixedTemplates,
    settlementStatus, setSettlementStatus,
    cobros, setCobros,
    // Computed
    partner, partnerTruckIds, driverObj, alerts,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

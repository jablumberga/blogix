import { createContext, useContext, useState, useEffect, useRef, useMemo } from "react";
import { loadData, saveData, saveToken, clearToken, resetApiCache } from "../api.js";
import { translations } from "../constants/translations.js";
import { USERS, initSettlementStatus } from "../constants/users.js";
import { computeAlerts, today } from "../utils/helpers.js";

const AppContext = createContext(null);

function applyData(data, setters) {
  const { setClients, setPartners, setTrucks, setDrivers, setTrips,
          setExpenses, setBrokers, setSuppliers, setFixedTemplates,
          setSettlementStatus, setCobros, setInvoices,
          setBankAccount, setBankReconciliation } = setters;
  if (!data || Object.keys(data).length === 0) return;
  const hasAnyData = Object.values(data).some(v =>
    Array.isArray(v) ? v.length > 0 : (v && typeof v === "object" ? Object.keys(v).length > 0 : Boolean(v))
  );
  if (!hasAnyData) return;
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
  if (Array.isArray(data.invoices))       setInvoices(data.invoices);
  if (data.bankAccount != null)           setBankAccount(data.bankAccount);
  if (data.bankReconciliation != null)    setBankReconciliation(data.bankReconciliation);
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
  const [invoices, setInvoices] = useState([]);
  const [bankAccount, setBankAccount] = useState({ name: "Cuenta Principal", bank: "", openingBalance: 0, openingDate: today() });
  const [bankReconciliation, setBankReconciliation] = useState({});
  const [syncStatus, setSyncStatus] = useState("idle");

  const saveTimerRef   = useRef(null);
  const dataLoadedRef  = useRef(false);
  const isReloadingRef = useRef(false); // blocks auto-save during post-login reload
  const versionRef     = useRef(0);     // optimistic lock — 0 means "unknown / loaded from cache"
  const currentDataRef = useRef(null);  // latest state snapshot for pagehide flush
  const userRef        = useRef(user);  // tracks current user role for pagehide (avoids stale closure)

  const setters = {
    setClients, setPartners, setTrucks, setDrivers, setTrips,
    setExpenses, setBrokers, setSuppliers, setFixedTemplates,
    setSettlementStatus, setCobros, setInvoices,
    setBankAccount, setBankReconciliation,
  };

  // ── Load on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadData().then(({ source, data, version = 0 }) => {
      if (source === "unauthenticated") {
        setUser(null);
        dataLoadedRef.current = true;
        return;
      }
      applyData(data, setters);
      versionRef.current = version; // 0 if from localStorage (offline) — skips server check
      dataLoadedRef.current = true;
      setSyncStatus(source === "api" ? "saved" : "offline");
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keep latest data snapshot and user ref for pagehide flush ────────────
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    if (!dataLoadedRef.current) return;
    currentDataRef.current = {
      clients, partners, trucks, drivers, trips, expenses,
      brokers, suppliers, fixedTemplates, settlementStatus, cobros, invoices,
    };
  }, [clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, fixedTemplates, settlementStatus, cobros, invoices]);

  // ── Flush to localStorage on tab close / Android OS kill (admin only) ────
  useEffect(() => {
    const flush = () => {
      if (dataLoadedRef.current && currentDataRef.current && userRef.current?.role === "admin") {
        saveData(currentDataRef.current, versionRef.current); // localStorage write is synchronous; API is best-effort
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  // ── Auto-save (debounced 1.5s, admin only) ───────────────────────────────
  useEffect(() => {
    if (!dataLoadedRef.current) return;
    if (isReloadingRef.current) return;
    if (user?.role !== "admin" && user?.role !== "driver") return; // partners read-only; drivers can save own trips
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus("saving");
      const payload = user?.role === "driver"
        ? { trips, expenses }
        : { clients, partners, trucks, drivers, trips, expenses,
            brokers, suppliers, fixedTemplates, settlementStatus, cobros, invoices,
            bankAccount, bankReconciliation };
      const result = await saveData(payload, versionRef.current);
      if (result.saved === "unauthorized") { setUser(null); return; }
      if (result.saved === "conflict") {
        setSyncStatus("conflict");
        // Reload from server to get the winning version; user's unsaved changes are lost
        isReloadingRef.current = true;
        loadData().then(({ source, data, version = 0 }) => {
          applyData(data, setters);
          versionRef.current = version;
          isReloadingRef.current = false;
          setSyncStatus(source === "api" ? "saved" : "offline");
        });
        return;
      }
      if (result.saved === "api") versionRef.current = result.version || 0;
      setSyncStatus(result.saved === "api" ? "saved" : "offline");
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, fixedTemplates, settlementStatus, cobros, invoices, bankAccount, bankReconciliation]);

  // ── Dynamic user list ─────────────────────────────────────────────────────
  const allUsers = useMemo(() => [
    ...USERS.filter(u => u.role === "admin"),
    ...partners.map(p => ({ id: `p-${p.id}`, username: p.username, role: "partner", name: p.name, refId: p.id })),
    ...drivers.map(d => ({ id: `d-${d.id}`, username: d.username, role: "driver", name: d.name, refId: d.id })),
  ], [partners, drivers]);

  // ── Computed helpers ──────────────────────────────────────────────────────
  const isAdmin = user?.role === "admin";
  const isPartner = user?.role === "partner";
  const isDriver = user?.role === "driver";

  const partner = isPartner ? partners.find(p => p.id === user?.refId) : null;
  const partnerTruckIds = useMemo(
    () => partner ? trucks.filter(tk => tk.partnerId === partner.id).map(tk => tk.id) : [],
    [partner, trucks]
  );
  const driverObj = isDriver ? drivers.find(d => d.id === user?.refId) : null;

  const alerts = useMemo(
    () => isAdmin ? computeAlerts({ trips, expenses, clients, drivers, trucks, partners, brokers, settlementStatus }) : [],
    [isAdmin, trips, expenses, clients, drivers, trucks, partners, brokers, settlementStatus]
  );

  const login = (u, remember, token) => {
    if (remember) {
      try { const { password: _pw, ...safe } = u; localStorage.setItem("blogix_session", JSON.stringify(safe)); } catch {}
    }
    if (token) { saveToken(token); resetApiCache(); } // always save token for current session
    setUser(u);

    // Reload data from API with new token
    isReloadingRef.current = true;
    dataLoadedRef.current = false;
    loadData().then(({ source, data, version = 0 }) => {
      if (source === "unauthenticated") {
        clearToken();
        setUser(null);
        dataLoadedRef.current = true;
        isReloadingRef.current = false;
        return;
      }
      applyData(data, setters);
      versionRef.current = version;
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

  const syncAll = () => {
    // ── Build lookup maps for O(1) access ─────────────────────────────────────
    const clientMap  = new Map(clients.map(c => [c.id, c]));
    const brokerMap  = new Map(brokers.map(b => [b.id, b]));
    const driverMap  = new Map(drivers.map(d => [d.id, d]));
    const truckMap   = new Map(trucks.map(t => [t.id, t]));

    // ── Step 1: Remove broker_commission expenses that belong to pass-through clients ──
    // These are stale: the broker deducts before paying, so there was never an outgoing expense.
    // This makes the cleanup retroactive — toggling brokerPassThrough on an existing client
    // immediately removes the rogue expenses on the next syncAll run.
    const staleExpIds = new Set(
      expenses
        .filter(e => e.category === "broker_commission" && e.tripId != null)
        .filter(e => {
          const tr = trips.find(t => t.id === e.tripId);
          const cl = tr ? clientMap.get(tr.clientId) : null;
          return cl?.rules?.brokerPassThrough === true;
        })
        .map(e => e.id)
    );
    if (staleExpIds.size > 0) {
      setExpenses(prev => prev.filter(e => !staleExpIds.has(e.id)));
    }

    // ── Step 2: Generate missing driver pay and broker commissions ─────────────
    // Note: expenses state hasn't updated yet (Step 1 is batched), so we check
    // against the live `expenses` array minus the stale ones we're removing.
    const toAdd = [];
    trips.forEach(tr => {
      // ── Driver pay ────────────────────────────────────────────────────────
      if (tr.driverId) {
        const driver = driverMap.get(tr.driverId);
        const existingPay = expenses.find(e => e.category === "driverPay" && e.tripId === tr.id);
        // If the trip date changed after driverPay was created, patch the date in place
        if (existingPay && existingPay.date !== tr.date) {
          setExpenses(prev => prev.map(e => e.id === existingPay.id ? { ...e, date: tr.date } : e));
        }
        const hasDriverPay = !!existingPay;
        if (driver && driver.salaryType !== "fixed" && !hasDriverPay) {
          let pay = 0;
          if (driver.salaryType === "porcentaje") {
            pay = Math.round((tr.revenue || 0) * (driver.percentageAmount ?? 20) / 100);
          } else if (driver.salaryType === "perTrip") {
            const rate = (driver.rates || []).find(r => r.province === tr.province && r.municipality === tr.municipality);
            if (rate) {
              const tk = truckMap.get(tr.truckId);
              const size = tr.tarifaOverride || tk?.size || "T1";
              pay = size === "T2" ? (rate.priceT2 ?? rate.priceT1 ?? 0) : (rate.priceT1 ?? 0);
            }
            // No rate configured → leave pay=0 so admin knows to set up the rate table
          }
          const tripDiscounts = (tr.discounts || []).reduce((s, d) => s + (d.amount || 0), 0);
          pay = Math.max(0, pay - tripDiscounts);
          if (pay > 0) {
            const label = driver.salaryType === "porcentaje" ? `${driver.percentageAmount ?? 20}%` : "por viaje";
            toAdd.push({
              tripId: tr.id, date: tr.date, category: "driverPay", amount: pay,
              description: `Nómina (${label}): ${driver.name}`,
              paymentMethod: "transfer", driverId: driver.id, status: "pending", supplierId: null,
            });
          }
        }
      }

      // ── Broker commission (non-pass-through only) ──────────────────────────
      if (tr.brokerId && tr.revenue > 0) {
        const broker = brokerMap.get(tr.brokerId);
        const client = clientMap.get(tr.clientId);
        const isPassThrough = client?.rules?.brokerPassThrough === true;
        const isStale = expenses.some(e => e.category === "broker_commission" && e.tripId === tr.id && staleExpIds.has(e.id));
        const hasBrokerPay = !isStale && expenses.some(e => e.category === "broker_commission" && e.tripId === tr.id);
        if (broker && !hasBrokerPay && !isPassThrough) {
          const commission = Math.round((tr.revenue || 0) * (broker.commissionPct || 10) / 100);
          if (commission > 0) {
            toAdd.push({
              tripId: tr.id, date: tr.date, category: "broker_commission", amount: commission,
              description: `Comisión ${broker.commissionPct || 10}%: ${broker.name}`,
              paymentMethod: "transfer", brokerId: broker.id, status: "pending", supplierId: null,
            });
          }
        }
      }
    });

    if (toAdd.length > 0) {
      setExpenses(prev => {
        let maxId = prev.reduce((m, e) => e.id > m ? e.id : m, 0);
        return [...prev, ...toAdd.map(exp => ({ id: ++maxId, ...exp }))];
      });
    }

    // ── Step 3: Backfill invoice amounts for pass-through clients ──────────────
    // Old invoices lack a stored `amount`. For pass-through clients, recompute
    // the net amount (gross − broker deduction) and store it so the CFO pipeline
    // shows the correct collectible amount retroactively.
    const invoicesToPatch = invoices.filter(inv => {
      if (inv.amount != null) return false;
      const cl = clientMap.get(inv.clientId);
      return cl?.rules?.brokerPassThrough === true;
    });
    if (invoicesToPatch.length > 0) {
      const patchIds = new Set(invoicesToPatch.map(i => i.id));
      setInvoices(prev => prev.map(inv => {
        if (!patchIds.has(inv.id)) return inv;
        let gross = 0, deduction = 0;
        (inv.tripIds || []).forEach(tid => {
          const tr = trips.find(t => t.id === tid);
          if (!tr) return;
          gross += tr.revenue || 0;
          if (tr.brokerId) {
            const br = brokerMap.get(tr.brokerId);
            if (br) deduction += Math.round((tr.revenue || 0) * (br.commissionPct || 10) / 100);
          }
        });
        return { ...inv, amount: gross - deduction, ...(deduction > 0 ? { brokerDeduction: deduction } : {}) };
      }));
    }

    return { added: toAdd.length, removed: staleExpIds.size, invoicesPatched: invoicesToPatch.length };
  };

  const forceSync = async () => {
    setSyncStatus("saving");
    const result = await saveData({
      clients, partners, trucks, drivers, trips, expenses,
      brokers, suppliers, fixedTemplates, settlementStatus, cobros, invoices,
    }, versionRef.current);
    if (result.saved === "unauthorized") { setUser(null); return; }
    if (result.saved === "conflict") { setSyncStatus("conflict"); return result; }
    if (result.saved === "api") versionRef.current = result.version || 0;
    setSyncStatus(result.saved === "api" ? "saved" : "offline");
    return result;
  };

  const value = {
    // UI
    lang, setLang, t, user, login, logout, forceSync, syncAll,
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
    invoices, setInvoices,
    bankAccount, setBankAccount,
    bankReconciliation, setBankReconciliation,
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

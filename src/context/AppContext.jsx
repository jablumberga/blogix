import { createContext, useContext, useState, useEffect, useRef, useMemo } from "react";
import { loadData, saveData, saveToken, clearToken, resetApiCache } from "../api.js";
import { translations } from "../constants/translations.js";
import { USERS, initSettlementStatus } from "../constants/users.js";
import { computeAlerts, today } from "../utils/helpers.js";
import { calcDriverPay } from "../utils/driverPay.js";
import { helperExpensePlan } from "../utils/ayudantes.js";
import { DEFAULT_PF_SETTINGS, allocateCobro, COLLECTED } from "../utils/profitFirst.js";
import { autoLinkJointPairs } from "../utils/tripRef.js";

const AppContext = createContext(null);

function applyData(data, setters) {
  const { setClients, setPartners, setTrucks, setDrivers, setTrips,
          setExpenses, setBrokers, setSuppliers, setFixedTemplates,
          setSettlementStatus, setCobros, setInvoices, setPfSettings, setGpsKm, setDistances, setAyudantes,
          setBankAccount, setBankReconciliation, setStaff } = setters;
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
  if (Array.isArray(data.staff))          setStaff(data.staff);
  if (Array.isArray(data.gpsKm))          setGpsKm(data.gpsKm);
  if (Array.isArray(data.distances))      setDistances(data.distances);
  if (Array.isArray(data.ayudantes) && setAyudantes) setAyudantes(data.ayudantes);
  if (data.bankAccount != null)           setBankAccount(data.bankAccount);
  if (data.bankReconciliation != null)    setBankReconciliation(data.bankReconciliation);
  if (data.pfSettings != null)            setPfSettings({ ...DEFAULT_PF_SETTINGS, ...data.pfSettings });
}

// ── Guardado por registro: se envía solo lo que cambió respecto a lo último conocido del servidor ──
const TABLE_KEYS = ["clients", "partners", "trucks", "drivers", "trips", "expenses", "brokers", "suppliers", "fixedTemplates", "cobros", "invoices", "staff", "gpsKm"];
const SCALAR_KEYS = ["settlementStatus", "bankAccount", "bankReconciliation", "pfSettings", "distances", "ayudantes"];
const stripPw = (r) => { if (r && r.password) { const { password: _p, ...rest } = r; return rest; } return r; };
export function snapshotOf(data) {
  const tables = Object.fromEntries(TABLE_KEYS.map(k => [k, new Map((data?.[k] || []).filter(r => r && r.id != null).map(r => [r.id, JSON.stringify(stripPw(r))]))]));
  const scalars = Object.fromEntries(SCALAR_KEYS.map(k => [k, JSON.stringify(data?.[k] ?? null)]));
  return { tables, scalars };
}
export function diffAgainst(base, data) {
  const tables = {}; let n = 0;
  for (const k of TABLE_KEYS) {
    const cur = (data[k] || []).filter(r => r && r.id != null);
    const b = base?.tables?.[k] || new Map();
    const upserts = cur.filter(r => b.get(r.id) !== JSON.stringify(stripPw(r)));
    const ids = new Set(cur.map(r => r.id));
    const deletes = [...b.keys()].filter(id => !ids.has(id));
    if (upserts.length || deletes.length) { tables[k] = { upserts, deletes }; n += upserts.length + deletes.length; }
  }
  const patch = { patch: true, tables };
  for (const k of SCALAR_KEYS) if (JSON.stringify(data[k] ?? null) !== base?.scalars?.[k]) { patch[k] = data[k]; n++; }
  return { patch, changes: n };
}
/** Combina lo del servidor con mis cambios pendientes (mis registros editados/borrados mandan). */
export function mergeOnConflict(serverData, base, mine) {
  const { patch } = diffAgainst(base, mine);
  const out = { ...serverData };
  for (const k of TABLE_KEYS) {
    const t = patch.tables[k]; if (!t) { out[k] = serverData[k] || []; continue; }
    const dels = new Set(t.deletes); const ups = new Map(t.upserts.map(r => [r.id, r]));
    const merged = (serverData[k] || []).filter(r => !dels.has(r.id)).map(r => ups.has(r.id) ? ups.get(r.id) : r);
    for (const r of t.upserts) if (!merged.some(x => x.id === r.id)) merged.push(r);
    out[k] = merged;
  }
  for (const k of SCALAR_KEYS) if (k in patch) out[k] = patch[k];
  return out;
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
  const [staff, setStaff] = useState([]); // usuarios de oficina (asistente administrativa)
  const [gpsKm, setGpsKm] = useState([]);       // km diarios por camión desde el GPS (TrackSolid)
  const [distances, setDistances] = useState([]); // distancias de referencia por destino (km ida y vuelta)
  const [ayudantes, setAyudantes] = useState([]); // ayudantes como personas (pago directo o por el chofer)
  const [bankAccount, setBankAccount] = useState({ name: "Cuenta Principal", bank: "", openingBalance: 0, openingDate: today() });
  const [bankReconciliation, setBankReconciliation] = useState({});
  const [pfSettings, setPfSettings] = useState(DEFAULT_PF_SETTINGS); // Profit First: % a Reserva y fecha de arranque
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncError, setSyncError] = useState(null); // mensaje del servidor cuando rechaza un dato (p. ej. referencia repetida)

  const saveTimerRef   = useRef(null);
  const dataLoadedRef  = useRef(false);
  const isReloadingRef = useRef(false); // blocks auto-save during post-login reload
  const versionRef     = useRef(0);     // optimistic lock — 0 means "unknown / loaded from cache"
  const currentDataRef = useRef(null);  // latest state snapshot for pagehide flush
  const userRef        = useRef(user);  // tracks current user role for pagehide (avoids stale closure)
  const baseRef        = useRef(null);  // último estado conocido del servidor (para guardar solo lo que cambió)
  const conflictsRef   = useRef(0);     // conflictos seguidos (aviso tras el tercero)
  const [syncNotice, setSyncNotice] = useState(null); // aviso informativo (p. ej. cambios de otro usuario combinados)

  const setters = {
    setClients, setPartners, setTrucks, setDrivers, setTrips,
    setExpenses, setBrokers, setSuppliers, setFixedTemplates,
    setSettlementStatus, setCobros, setInvoices,
    setBankAccount, setBankReconciliation, setStaff, setPfSettings, setGpsKm, setDistances, setAyudantes,
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
      baseRef.current = source === "api" ? snapshotOf(data) : null;
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
      brokers, suppliers, fixedTemplates, settlementStatus, cobros, invoices, staff, gpsKm,
      bankAccount, bankReconciliation, pfSettings, distances, ayudantes,
    };
  }, [clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, fixedTemplates, settlementStatus, cobros, invoices, staff, gpsKm, bankAccount, bankReconciliation, pfSettings, distances, ayudantes]);

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
    if (user?.role !== "admin" && user?.role !== "driver" && user?.role !== "assistant") return; // partners read-only
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus("saving");
      const payload = user?.role === "driver"
        ? { trips, expenses }
        : user?.role === "assistant"
        ? { trips }
        : { clients, partners, trucks, drivers, trips, expenses,
            brokers, suppliers, fixedTemplates, settlementStatus, cobros, invoices, staff, gpsKm,
            bankAccount, bankReconciliation, pfSettings, distances, ayudantes };
      let patch = null;
      if (user?.role === "admin" && baseRef.current && versionRef.current) {
        const d = diffAgainst(baseRef.current, payload);
        if (d.changes === 0) { setSyncStatus("saved"); return; }   // nada cambió: no se envía nada
        patch = d.patch;
      }
      const result = await saveData(payload, versionRef.current, patch);
      if (result.saved === "unauthorized") { setUser(null); return; }
      if (result.saved === "rejected") {
        // El servidor no aceptó un dato: se avisa y se recarga lo que sí está guardado
        setSyncError(result.error); setSyncStatus("rejected");
        isReloadingRef.current = true;
        loadData().then(({ source, data, version = 0 }) => { applyData(data, setters); baseRef.current = source === "api" ? snapshotOf(data) : null; versionRef.current = version; isReloadingRef.current = false; setSyncStatus(source === "api" ? "saved" : "offline"); });
        return;
      }
      if (result.saved === "conflict") {
        // Otro usuario guardó primero: se recarga lo suyo y se vuelven a aplicar mis cambios encima (reintento automático)
        setSyncStatus("conflict");
        conflictsRef.current += 1;
        isReloadingRef.current = true;
        loadData().then(({ source, data, version = 0 }) => {
          if (source === "api" && data) {
            const merged = patch && baseRef.current ? mergeOnConflict(data, baseRef.current, payload) : data;
            applyData(merged, setters);
            baseRef.current = snapshotOf(data);      // base = servidor; mis cambios quedan pendientes y se reenvían
            versionRef.current = version;
            if (conflictsRef.current >= 3) { setSyncError("Varios conflictos seguidos al guardar: otro usuario está cambiando los mismos datos. Revisa y pulsa «Sincronizar todo»."); conflictsRef.current = 0; }
            else setSyncNotice("Otro usuario guardó cambios al mismo tiempo: se combinaron con los tuyos y se volvió a guardar.");
          } else { applyData(data, setters); versionRef.current = version; }
          isReloadingRef.current = false;
          setSyncStatus(source === "api" ? "saved" : "offline");
        });
        return;
      }
      if (result.saved === "api") { versionRef.current = result.version || 0; conflictsRef.current = 0; if (user?.role === "admin") baseRef.current = snapshotOf(payload); }
      if (result.saved === "api" && user?.role === "admin") {
        // La contraseña de un registro nuevo viaja UNA sola vez (el servidor la guarda hasheada); después se quita del estado
        const strip = (arr, set) => { if (arr.some(r => r && r.password)) set(arr.map(({ password: _pw, ...r }) => r)); };
        strip(drivers, setDrivers); strip(partners, setPartners); strip(staff, setStaff);
      }
      if (result.remap) applyRemap(result.remap);
      setSyncStatus(result.saved === "api" ? "saved" : "offline");
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, fixedTemplates, settlementStatus, cobros, invoices, staff, gpsKm, bankAccount, bankReconciliation, pfSettings, distances, ayudantes]);

  // ── Dynamic user list ─────────────────────────────────────────────────────
  const allUsers = useMemo(() => [
    ...USERS.filter(u => u.role === "admin"),
    ...partners.map(p => ({ id: `p-${p.id}`, username: p.username, role: "partner", name: p.name, refId: p.id })),
    ...drivers.map(d => ({ id: `d-${d.id}`, username: d.username, role: "driver", name: d.name, refId: d.id })),
    ...staff.map(s => ({ id: `s-${s.id}`, username: s.username, role: s.role || "assistant", name: s.name, refId: s.id })),
  ], [partners, drivers, staff]);

  // ── Computed helpers ──────────────────────────────────────────────────────
  const isAdmin = user?.role === "admin";
  const isPartner = user?.role === "partner";
  const isDriver = user?.role === "driver";
  const isAssistant = user?.role === "assistant";

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
      baseRef.current = source === "api" ? snapshotOf(data) : null;
      versionRef.current = version;
      dataLoadedRef.current = true;
      isReloadingRef.current = false;
      setSyncStatus(source === "api" ? "saved" : "offline");
    });
  };

  // El servidor reasignó ids (un chofer numeró un viaje/gasto con un id que ya usaba otro): la app adopta los nuevos
  const applyRemap = (remap) => {
    const rt = remap.trips || {}, re = remap.expenses || {};
    if (Object.keys(rt).length) setTrips(prev => prev.map(t => rt[t.id] ? { ...t, id: rt[t.id] } : t));
    if (Object.keys(rt).length || Object.keys(re).length) setExpenses(prev => prev.map(e => ({ ...e, ...(re[e.id] ? { id: re[e.id] } : {}), ...(rt[e.tripId] ? { tripId: rt[e.tripId] } : {}) })));
  };

  const logout = () => {
    try { localStorage.removeItem("blogix_session"); } catch {}
    clearToken();
    setClients([]); setPartners([]); setTrucks([]); setDrivers([]);
    setTrips([]); setExpenses([]); setBrokers([]); setSuppliers([]);
    setFixedTemplates([]); setSettlementStatus({}); setCobros([]); setInvoices([]); setStaff([]); setAyudantes([]);
    setBankAccount({ name: "Cuenta Principal", bank: "", openingBalance: 0, openingDate: today() }); setBankReconciliation({}); setPfSettings(DEFAULT_PF_SETTINGS);
    versionRef.current = 0;
    dataLoadedRef.current = false;
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
      // ── Driver pay + ayudantes (misma función que Viajes y Nómina) ─────────
      if (tr.driverId && tr.status !== "cancelled") {
        const driver = driverMap.get(tr.driverId);
        const existingPay = expenses.find(e => e.category === "driverPay" && e.tripId === tr.id);
        // If the trip date changed after driverPay was created, patch the date in place
        if (existingPay && existingPay.date !== tr.date && existingPay.status !== "paid") {
          setExpenses(prev => prev.map(e => e.id === existingPay.id ? { ...e, date: tr.date } : e));
        }
        if (driver) {
          const calc = calcDriverPay({ driver, trip: tr, truck: truckMap.get(tr.truckId), clientId: tr.clientId });
          if (!existingPay && calc.payType !== "fixed" && calc.driverNet > 0) {
            toAdd.push({
              tripId: tr.id, date: tr.date, category: "driverPay", amount: calc.driverNet,
              description: `Pago chofer ${driver.name} · ${tr.municipality || ""}`,
              paymentMethod: "transfer", driverId: driver.id, status: "pending", supplierId: null,
            });
          }
          // Ayudantes: el gasto del chofer (sin ayudanteId) y uno por cada ayudante directo, si faltan
          const plan = helperExpensePlan({ trip: { ...tr, driverId: driver.id }, calc, driverDescription: (n) => `Ayudantes (${n}) · ${tr.municipality || ""}` });
          for (const p of plan) {
            if (!(p.amount > 0)) continue;
            const key = p.ayudanteId ?? null;
            const has = expenses.some(e => e.category === "helper" && e.tripId === tr.id && ((e.ayudanteId != null && e.ayudanteId !== "" ? Number(e.ayudanteId) : null) === key));
            if (!has) toAdd.push({
              tripId: tr.id, date: tr.date, category: "helper", amount: p.amount, description: p.description,
              paymentMethod: "transfer", ...(key != null ? { ayudanteId: key } : { driverId: driver.id }), status: "pending", supplierId: null,
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

    // ── Step 2a: viajes conjuntos históricos (misma referencia, camiones distintos) ──
    const jointFix = autoLinkJointPairs(trips);
    if (jointFix.changed > 0) setTrips(jointFix.trips);

    // ── Step 2b: Profit First — cobros viejos sin asignación ────────────────
    const cobrosToFix = cobros.filter(c => COLLECTED.includes(c.status) && Number(c.amount) > 0 && !(c.pf && typeof c.pf.opex === "number"));
    if (cobrosToFix.length > 0) {
      const fixIds = new Set(cobrosToFix.map(c => c.id));
      setCobros(prev => prev.map(c => fixIds.has(c.id)
        ? { ...c, pf: { ...allocateCobro({ amount: c.amount, tripIds: c.collectedTripIds || [], trips, trucks, partners, clients, brokers, settings: pfSettings }), at: c.collectedDate || c.pf?.at || today() } }
        : c));
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

    return { added: toAdd.length, removed: staleExpIds.size, invoicesPatched: invoicesToPatch.length, cobrosAllocated: cobrosToFix.length, jointLinked: jointFix.changed };
  };

  const forceSync = async () => {
    setSyncStatus("saving");
    const result = await saveData({
      clients, partners, trucks, drivers, trips, expenses,
      brokers, suppliers, fixedTemplates, settlementStatus, cobros, invoices, staff, gpsKm,
      bankAccount, bankReconciliation, pfSettings, distances, ayudantes,
    }, versionRef.current);
    if (result.saved === "unauthorized") { setUser(null); return; }
    if (result.saved === "rejected") { setSyncError(result.error); setSyncStatus("rejected"); return result; }
    if (result.saved === "conflict") { setSyncStatus("conflict"); return result; }
    if (result.saved === "api") { versionRef.current = result.version || 0; baseRef.current = snapshotOf({ clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, fixedTemplates, settlementStatus, cobros, invoices, staff, gpsKm, bankAccount, bankReconciliation, pfSettings, distances, ayudantes }); conflictsRef.current = 0; }
    setSyncStatus(result.saved === "api" ? "saved" : "offline");
    return result;
  };

  const value = {
    // UI
    lang, setLang, t, user, login, logout, forceSync, syncAll,
    sidebarOpen, setSidebarOpen, isMobile, syncStatus, syncError, setSyncError, syncNotice, setSyncNotice,
    // Auth
    isAdmin, isPartner, isDriver, isAssistant, allUsers,
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
    staff, setStaff, gpsKm, setGpsKm, distances, setDistances, ayudantes, setAyudantes,
    bankAccount, setBankAccount,
    bankReconciliation, setBankReconciliation,
    pfSettings, setPfSettings,
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

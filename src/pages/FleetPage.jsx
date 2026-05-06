import { useState, useMemo, useRef } from "react";
import { Plus, Pencil, Trash2, X, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { colors } from "../constants/theme.js";
import { nxId, fmt, expenseTruckId } from "../utils/helpers.js";
import { Card, PageHeader, Inp, Sel, Btn, Badge, Th, Td } from "../components/ui/index.jsx";

export default function FleetPage({ t, trucks, setTrucks, partners, trips, setTrips, clients, setExpenses, drivers, expenses, isMobile }) {

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ plate: "", type: "Flatbed", size: "T1", owner: "own", partnerId: "" });
  const [recalcInfo, setRecalcInfo] = useState(null);

  const [selectedTruckId, setSelectedTruckId] = useState(null);
  const profitRef = useRef(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const firstOfMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
  }, []);
  const [profitFrom, setProfitFrom] = useState(firstOfMonth);
  const [profitTo, setProfitTo] = useState(todayStr);

  const tripMap = useMemo(() => new Map((trips||[]).map(tr => [tr.id, tr])), [trips]);

  // Quick this-month stats for each truck (for list indicators)
  const quickStats = useMemo(() => {
    const out = {};
    (trucks||[]).forEach(tk => {
      const tkTrips = (trips||[]).filter(tr => tr.truckId === tk.id && (tr.date||"") >= firstOfMonth && tr.status !== "cancelled");
      const revenue = tkTrips.reduce((s, tr) => s + (tr.revenue || 0), 0);
      const tkExp = (expenses||[]).filter(e => {
        if (expenseTruckId(e, tripMap) !== tk.id) return false;
        const d = e.tripId ? (tripMap.get(e.tripId)?.date || e.date) : e.date;
        return (d||"") >= firstOfMonth;
      });
      const totalExp = tkExp.reduce((s, e) => s + e.amount, 0);
      out[tk.id] = { revenue, totalExp, net: revenue - totalExp, trips: tkTrips.length };
    });
    return out;
  }, [trucks, trips, expenses, tripMap, firstOfMonth]);

  // Detailed profitability for selected truck + date range
  const profit = useMemo(() => {
    if (!selectedTruckId) return null;
    const tkTrips = (trips||[]).filter(tr =>
      tr.truckId === selectedTruckId && (tr.date||"") >= profitFrom && (tr.date||"") <= profitTo && tr.status !== "cancelled"
    );
    const revenue = tkTrips.reduce((s, tr) => s + (tr.revenue || 0), 0);
    const tkExp = (expenses||[]).filter(e => {
      if (expenseTruckId(e, tripMap) !== selectedTruckId) return false;
      const d = e.tripId ? (tripMap.get(e.tripId)?.date || e.date) : e.date;
      return (d||"") >= profitFrom && (d||"") <= profitTo;
    });
    const byCategory = {};
    tkExp.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    const totalExp = tkExp.reduce((s, e) => s + e.amount, 0);
    const net = revenue - totalExp;
    const margin = revenue > 0 ? net / revenue * 100 : 0;
    const tk = trucks.find(x => x.id === selectedTruckId);
    const partner = tk?.owner === "partner" ? (partners||[]).find(p => p.id === tk.partnerId) : null;
    const partnerComm = partner ? Math.max(0, net) * ((partner.commissionPct || 0) / 100) : 0;
    return { revenue, totalExp, byCategory, net, margin, partner, partnerComm, adminNet: net - partnerComm, trips: tkTrips.length };
  }, [selectedTruckId, trips, expenses, profitFrom, profitTo, trucks, partners, tripMap]);

  const setPreset = (key) => {
    const d = new Date();
    const y = d.getFullYear(), m = d.getMonth(), ms = String(m+1).padStart(2,"0");
    const today = d.toISOString().slice(0,10);
    if (key === "month")  { setProfitFrom(`${y}-${ms}-01`); setProfitTo(today); }
    else if (key === "prev") {
      const pm = m === 0 ? 12 : m, py = m === 0 ? y-1 : y;
      const pms = String(pm).padStart(2,"0");
      const lastDay = new Date(y, m, 0).getDate();
      setProfitFrom(`${py}-${pms}-01`); setProfitTo(`${py}-${pms}-${lastDay}`);
    }
    else if (key === "30d") {
      const from = new Date(d); from.setDate(from.getDate()-30);
      setProfitFrom(from.toISOString().slice(0,10)); setProfitTo(today);
    }
    else if (key === "year") { setProfitFrom(`${y}-01-01`); setProfitTo(today); }
  };

  const openNew = () => { setForm({ plate: "", type: "Flatbed", size: "T1", owner: "own", partnerId: "" }); setEditId(null); setShowForm(true); setRecalcInfo(null); };
  const openEdit = (tk) => { setForm({ ...tk, partnerId: tk.partnerId || "" }); setEditId(tk.id); setShowForm(true); setRecalcInfo(null); };

  const handleSizeChange = (newSize) => {
    const f = { ...form, size: newSize };
    if (editId && trips && clients) {
      const affected = trips.filter(tr => tr.truckId === editId && !tr.tarifaOverride);
      setRecalcInfo(affected.length > 0 ? { count: affected.length, oldSize: form.size || "T1", newSize } : null);
    }
    setForm(f);
  };

  const save = () => {
    if (!form.plate) return;
    const d = { ...form, partnerId: form.owner === "partner" ? Number(form.partnerId) || null : null };
    if (editId) {
      const prevTruck = trucks.find(t2 => t2.id === editId);
      const sizeChanged = prevTruck && (prevTruck.size || "T1") !== (form.size || "T1");
      setTrucks(trucks.map(t2 => t2.id === editId ? { ...d, id: editId } : t2));
      if (sizeChanged && trips && setTrips && clients) {
        const newSize = form.size || "T1";
        const updatedRevenues = {};
        setTrips(prev => prev.map(tr => {
          if (tr.truckId !== editId || tr.tarifaOverride) return tr;
          const cl = clients.find(c => c.id === tr.clientId);
          if (!cl || !tr.province || !tr.municipality) return tr;
          const rate = cl.rates?.find(r => r.province === tr.province && r.municipality === tr.municipality);
          if (!rate) return tr;
          const newRevenue = newSize === "T2" ? (rate.priceT2 ?? rate.price ?? 0) : (rate.priceT1 ?? rate.price ?? 0);
          if (!newRevenue) return tr;
          updatedRevenues[tr.id] = { oldRevenue: tr.revenue, newRevenue, driverId: tr.driverId };
          return { ...tr, revenue: newRevenue };
        }));
        if (setExpenses && drivers && Object.keys(updatedRevenues).length > 0) {
          setExpenses(prev => prev.map(e => {
            if (e.category !== "driverPay" || !updatedRevenues[e.tripId]) return e;
            const { newRevenue, driverId } = updatedRevenues[e.tripId];
            const driver = drivers.find(d => d.id === driverId);
            if (!driver) return e;
            // Fixed-salary drivers don't accrue per-trip pay — leave the expense untouched
            if (driver.salaryType === "fixed") return e;
            const tr = trips.find(t2 => t2.id === e.tripId);
            if (driver.salaryType === "porcentaje") {
              const pct = driver.percentageAmount ?? 20;
              return { ...e, amount: Math.round(newRevenue * pct / 100), description: `Nómina ${pct}%: ${driver.name || ''}` };
            }
            if (driver.salaryType === "perTrip") {
              const rate = (driver.rates || []).find(r =>
                tr && r.province === tr.province && r.municipality === tr.municipality
              );
              if (!rate) return e;
              const pay = newSize === "T2"
                ? (rate.priceT2 ?? rate.price ?? 0)
                : (rate.priceT1 ?? rate.price ?? 0);
              if (!pay) return e;
              return { ...e, amount: pay, description: `Nómina (por viaje): ${driver.name || ''}` };
            }
            // Unknown salary type — zero out instead of guessing 20%
            return { ...e, amount: 0, description: `Nómina: ${driver.name || ''}` };
          }));
        }
      }
    } else {
      setTrucks([...trucks, { ...d, id: nxId(trucks) }]);
    }
    setShowForm(false); setRecalcInfo(null);
  };

  const selectTruck = (id) => {
    setSelectedTruckId(prev => prev === id ? null : id);
    if (isMobile && id) setTimeout(() => profitRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const selectedTruck = trucks.find(tk => tk.id === selectedTruckId);

  return <div>
    <PageHeader title={t.fleet} action={<Btn onClick={openNew}><Plus size={14} /> {t.addTruck}</Btn>} />

    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Inp label={t.truckPlate} value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} />
        <Sel label={t.truckType} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
          <option>Flatbed</option><option>Refrigerated</option><option>Dry Van</option><option>Tanker</option><option>Lowboy</option>
        </Sel>
        <Sel label={t.truckSize} value={form.size || "T1"} onChange={e => handleSizeChange(e.target.value)}>
          <option value="T1">T1 — Pequeño</option><option value="T2">T2 — Grande</option>
        </Sel>
        <Sel label={t.ownerType} value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })}>
          <option value="own">{t.ownTruck}</option><option value="partner">{t.partnerTruck}</option>
        </Sel>
      </div>
      {form.owner === "partner" && <Sel label={t.partnerName} value={form.partnerId} onChange={e => setForm({ ...form, partnerId: e.target.value })} style={{ marginBottom: 12 }}>
        <option value="">{t.none}</option>{(partners||[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Sel>}
      {recalcInfo && (
        <div style={{ marginBottom: 10, padding: "8px 12px", background: colors.orange + "15", border: `1px solid ${colors.orange}40`, borderRadius: 8, fontSize: 12, color: colors.orange }}>
          ⚠️ Se actualizará la tarifa de <strong>{recalcInfo.count} viaje{recalcInfo.count !== 1 ? "s" : ""}</strong> de {recalcInfo.oldSize} → {recalcInfo.newSize} (solo los que no tienen Override manual).
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}

    <div style={{ display: isMobile ? "block" : "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
      {/* ── Truck list ── */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {trucks.length === 0 && <div style={{ padding: 24, textAlign: "center", color: colors.textMuted, fontSize: 13 }}>{t.noTrucks}</div>}
        {trucks.map((tk, i) => {
          const qs = quickStats[tk.id] || {};
          const pt = (partners||[]).find(p => p.id === tk.partnerId);
          const isSelected = selectedTruckId === tk.id;
          const hasData = qs.trips > 0 || qs.totalExp > 0;
          return <div
            key={tk.id}
            onClick={() => selectTruck(tk.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
              borderBottom: i < trucks.length - 1 ? `1px solid ${colors.border}22` : "none",
              borderLeft: `3px solid ${isSelected ? colors.accent : "transparent"}`,
              background: isSelected ? colors.accent + "0e" : "transparent",
              cursor: "pointer", transition: "background 0.15s",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{tk.plate}</span>
                <Badge label={tk.size || "T1"} color={(tk.size||"T1") === "T2" ? colors.orange : colors.accent} />
                <Badge label={tk.owner === "own" ? t.ownTruck : t.partnerTruck} color={tk.owner === "own" ? colors.accent : colors.orange} />
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted }}>{tk.type}{pt ? ` · ${pt.name}` : ""}</div>
            </div>
            {hasData && (
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
                  {qs.net >= 0 ? <TrendingUp size={11} color={colors.green}/> : <TrendingDown size={11} color={colors.red}/>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: qs.net >= 0 ? colors.green : colors.red }}>
                    {qs.net >= 0 ? "+" : ""}{fmt(qs.net)}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: colors.textMuted }}>{qs.trips} viajes · este mes</div>
              </div>
            )}
            <div style={{ display: "flex", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => openEdit(tk)} style={{ padding: "10px", minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Pencil size={12}/></button>
              <button onClick={() => setTrucks(trucks.filter(x => x.id !== tk.id))} style={{ padding: "10px", minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.red, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={12}/></button>
            </div>
            {isSelected && <ChevronRight size={14} color={colors.accent} style={{ flexShrink: 0 }}/>}
          </div>;
        })}
      </Card>

      {/* ── Profitability panel ── */}
      {selectedTruck && profit && (
        <div ref={profitRef}>
          <Card>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Rentabilidad — {selectedTruck.plate}</div>
                <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                  {selectedTruck.type} · {selectedTruck.owner === "own" ? "Propio" : `Socio: ${profit.partner?.name || "—"}`}
                </div>
              </div>
              <button onClick={() => setSelectedTruckId(null)} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", padding: 2 }}><X size={16}/></button>
            </div>

            {/* Date presets */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
              {[["month","Este mes"],["prev","Mes ant."],["30d","Últ. 30d"],["year","Este año"]].map(([key, lbl]) => (
                <button key={key} onClick={() => setPreset(key)} style={{ padding: "4px 11px", borderRadius: 12, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 11 }}>{lbl}</button>
              ))}
              <input type="date" value={profitFrom} onChange={e => setProfitFrom(e.target.value)} style={{ fontSize: 11, padding: "3px 7px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, width: 128 }}/>
              <span style={{ color: colors.textMuted, fontSize: 11 }}>→</span>
              <input type="date" value={profitTo} onChange={e => setProfitTo(e.target.value)} style={{ fontSize: 11, padding: "3px 7px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, width: 128 }}/>
            </div>

            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: "INGRESOS", val: profit.revenue, sub: `${profit.trips} viajes`, color: colors.green },
                { label: "GASTOS", val: -profit.totalExp, sub: "directo + viajes", color: colors.red },
                { label: "NETO", val: profit.net, sub: `${profit.margin.toFixed(1)}% margen`, color: profit.net >= 0 ? colors.green : colors.red },
              ].map(k => (
                <div key={k.label} style={{ textAlign: "center", padding: "12px 8px", background: k.color + "10", borderRadius: 10, border: `1px solid ${k.color}22` }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: colors.textMuted, letterSpacing: 1, marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: isMobile ? 14 : 17, fontWeight: 800, color: k.color }}>{k.val < 0 ? "" : ""}{fmt(Math.abs(k.val))}</div>
                  <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Expense breakdown */}
            {Object.keys(profit.byCategory).length > 0 && <>
              <div style={{ fontSize: 10, fontWeight: 600, color: colors.textMuted, letterSpacing: 1, marginBottom: 8 }}>DESGLOSE DE GASTOS</div>
              {Object.entries(profit.byCategory).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => {
                const barPct = profit.totalExp > 0 ? Math.min(100, amt / profit.totalExp * 100) : 0;
                return <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${colors.border}18` }}>
                  <span style={{ fontSize: 12, color: colors.text, minWidth: 100 }}>{t[cat] || cat}</span>
                  <div style={{ flex: 1, height: 5, borderRadius: 3, background: colors.border + "60", overflow: "hidden" }}>
                    <div style={{ width: `${barPct}%`, height: "100%", background: colors.red + "aa", borderRadius: 3 }}/>
                  </div>
                  <span style={{ fontSize: 11, color: colors.textMuted, minWidth: 32, textAlign: "right" }}>{barPct.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: colors.red, minWidth: 90, textAlign: "right" }}>{fmt(amt)}</span>
                </div>;
              })}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", marginTop: 4, borderTop: `1px solid ${colors.border}`, fontSize: 12, fontWeight: 600 }}>
                <span>Total gastos</span>
                <span style={{ color: colors.red }}>{fmt(profit.totalExp)}</span>
              </div>
            </>}

            {profit.partner && profit.partnerComm > 0 && (
              <div style={{ marginTop: 14, padding: "12px 14px", background: colors.orange + "0e", border: `1px solid ${colors.orange}30`, borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: colors.orange, marginBottom: 6 }}>
                  <span>Comisión {profit.partner.name} ({profit.partner.commissionPct}%)</span>
                  <span style={{ fontWeight: 700 }}>−{fmt(profit.partnerComm)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, borderTop: `1px solid ${colors.orange}30`, paddingTop: 8 }}>
                  <span>Tu parte (admin)</span>
                  <span style={{ color: profit.adminNet >= 0 ? colors.green : colors.red }}>{fmt(profit.adminNet)}</span>
                </div>
              </div>
            )}

            {profit.trips === 0 && profit.totalExp === 0 && (
              <div style={{ textAlign: "center", padding: "24px 0", color: colors.textMuted, fontSize: 13 }}>
                Sin datos para este período — registra viajes o gastos para ver la rentabilidad
              </div>
            )}
          </Card>
        </div>
      )}

      {!selectedTruckId && trucks.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? 0 : 40 }}>
          <div style={{ textAlign: "center", color: colors.textMuted }}>
            <TrendingUp size={32} style={{ margin: "0 auto 10px", opacity: 0.3, display: "block" }}/>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Selecciona un camión</div>
            <div style={{ fontSize: 11 }}>para ver su rentabilidad detallada</div>
          </div>
        </div>
      )}
    </div>
  </div>;
}

import { useMemo, useState } from "react";
import { Gauge, Route, Fuel, Users, AlertTriangle, Satellite, Plus, Trash2, RefreshCw } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, pad, MONTHS_ES, today } from "../utils/helpers.js";
import { Card, StatCard, PageHeader, Th, Td, Inp, Btn, Badge } from "../components/ui/index.jsx";
import { costPerKm, KM_SOURCE_LABEL } from "../utils/costPerKm.js";
import { syncGps } from "../api.js";

const PURPLE = "#9b7fe8";
const fmtKm = (n) => n == null ? "—" : `${Math.round(n).toLocaleString("en-US")} km`;
const fmtPerKm = (n) => n == null ? "—" : `RD$${n.toFixed(1)}`;
const lastDayOf = (y, m) => new Date(y, m, 0).getDate();

/**
 * Costo por kilómetro (solo admin): por camión, por destino y por chofer.
 * Km: GPS (TrackSolid) → odómetro del chofer → distancia de referencia por destino.
 */
export default function CostPerKmPage({ trips = [], expenses = [], trucks = [], drivers = [], clients = [], brokers = [], partners = [], fixedTemplates = [], distances = [], setDistances, gpsKm = [], setTrips, setGpsKm, isMobile }) {
  const now = new Date();
  const [mode, setMode] = useState("mes");
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth() + 1);
  const [half, setHalf] = useState(now.getDate() <= 15 ? 1 : 2);
  const [target, setTarget] = useState(() => { try { return Number(localStorage.getItem("bl_target_margin_km")) || 10; } catch { return 10; } });
  const [tab, setTab] = useState("trucks");
  const [newDist, setNewDist] = useState({ province: "", municipality: "", km: "" });
  const [gpsMsg, setGpsMsg] = useState("");

  const { dateFrom, dateTo, label } = useMemo(() => {
    const ms = `${y}-${pad(m)}`, last = lastDayOf(y, m);
    if (mode === "quincena") return half === 1 ? { dateFrom: `${ms}-01`, dateTo: `${ms}-15`, label: `${MONTHS_ES[m - 1]} 1–15, ${y}` } : { dateFrom: `${ms}-16`, dateTo: `${ms}-${pad(last)}`, label: `${MONTHS_ES[m - 1]} 16–${last}, ${y}` };
    if (mode === "ano") return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31`, label: `Año ${y}` };
    return { dateFrom: `${ms}-01`, dateTo: `${ms}-${pad(last)}`, label: `${MONTHS_ES[m - 1]} ${y}` };
  }, [mode, y, m, half]);
  const prev = () => { if (mode === "ano") return setY(v => v - 1); if (mode === "quincena" && half === 2) return setHalf(1); if (mode === "quincena") setHalf(2); if (m === 1) { setM(12); setY(v => v - 1); } else setM(v => v - 1); };
  const next = () => { if (mode === "ano") return setY(v => v + 1); if (mode === "quincena" && half === 1) return setHalf(2); if (mode === "quincena") setHalf(1); if (m === 12) { setM(1); setY(v => v + 1); } else setM(v => v + 1); };

  const r = useMemo(() => costPerKm({ dateFrom, dateTo, trips, expenses, trucks, drivers, clients, brokers, partners, fixedTemplates, distances, targetMarginPerKm: target }),
    [dateFrom, dateTo, trips, expenses, trucks, drivers, clients, brokers, partners, fixedTemplates, distances, target]);
  const gpsTrucks = trucks.filter(t => t.gpsImei).length;
  const gpsPeriodKm = gpsKm.filter(g => g.date >= dateFrom && g.date <= dateTo).reduce((s, g) => s + (Number(g.km) || 0), 0);

  const saveTarget = (v) => { setTarget(v); try { localStorage.setItem("bl_target_margin_km", String(v)); } catch {} };
  const addDist = () => {
    if (!newDist.province || !newDist.municipality || !(Number(newDist.km) > 0)) return;
    setDistances([...(distances || []).filter(d => !(d.province === newDist.province && d.municipality === newDist.municipality)), { province: newDist.province.trim(), municipality: newDist.municipality.trim(), km: Number(newDist.km) }]);
    setNewDist({ province: "", municipality: "", km: "" });
  };
  // Destinos usados en viajes sin distancia de referencia → sugerencias
  const missing = useMemo(() => { const seen = new Set((distances || []).map(d => `${d.province}|${d.municipality}`)); const out = new Map(); for (const t of trips) { const k = `${t.province}|${t.municipality}`; if (t.province && !seen.has(k) && !out.has(k)) out.set(k, { province: t.province, municipality: t.municipality }); } return [...out.values()]; }, [trips, distances]);

  const runGps = async () => {
    setGpsMsg("Consultando TrackSolid…");
    const res = await syncGps({ dateFrom, dateTo });
    if (!res.ok) { setGpsMsg(`No se pudo: ${res.error}`); return; }
    if (Array.isArray(res.gpsKm) && setGpsKm) setGpsKm(prev => { const key = g => `${g.imei}|${g.date}`; const map = new Map(prev.map(g => [key(g), g])); for (const g of res.gpsKm) map.set(key(g), { ...(map.get(key(g)) || {}), ...g, id: map.get(key(g))?.id || g.id }); return [...map.values()]; });
    if (Array.isArray(res.tripKm) && setTrips) setTrips(prev => prev.map(t => { const k = res.tripKm.find(x => x.tripId === t.id); return k ? { ...t, km: k.km, kmSource: "gps" } : t; }));
    const fmt1 = (n) => (Number(n) || 0).toLocaleString("es-DO", { maximumFractionDigits: 1 });
    if (res.items > 0 && !(res.totalKm > 0)) { setGpsMsg(`No: el GPS mandó ${res.items} trayecto(s) pero sin kilómetros (datos recibidos: ${(res.fields || []).join(", ") || "—"}). Envíale este mensaje a soporte.`); return; }
    setGpsMsg(res.note ? `Listo: ${res.note}.` : `Listo: ${res.devices || 0} GPS · ${fmt1(res.totalKm)} km en ${(res.gpsKm || []).length} día(s) · ${(res.tripKm || []).length} viaje(s) con km del GPS.${(res.gpsKm || []).length && !(res.tripKm || []).length ? " Ningún viaje coincide con un día con km: revisa que la fecha del viaje sea el día que salió el camión." : ""}`);
  };

  const st = (s) => s === "ok" ? colors.green : s === "bad" ? colors.red : colors.textMuted;
  const btn = (active) => ({ padding: "5px 12px", borderRadius: 14, border: `1px solid ${active ? colors.accent : colors.border}`, background: active ? colors.accent : "transparent", color: active ? "white" : colors.textMuted, cursor: "pointer", fontSize: 12 });

  return <div>
    <PageHeader title="Costo por kilómetro" />
    <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>Qué cuesta mover cada camión un kilómetro y qué deja. Km del GPS (TrackSolid) cuando hay; si no, odómetro del chofer; si no, distancia de referencia del destino.</div>

    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {[["quincena", "Quincena"], ["mes", "Mes"], ["ano", "Año"]].map(([k, l]) => <button key={k} onClick={() => setMode(k)} style={btn(mode === k)}>{l}</button>)}
        <button onClick={prev} style={btn(false)}>‹</button><b style={{ fontSize: 14 }}>{label}</b><button onClick={next} style={btn(false)}>›</button>
        <span style={{ marginLeft: "auto", fontSize: 12, color: colors.textMuted, display: "flex", alignItems: "center", gap: 6 }}>Objetivo margen/km <input type="number" value={target} onChange={e => saveTarget(Number(e.target.value) || 0)} style={{ width: 70, padding: "4px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text }} /> RD$</span>
      </div>
    </Card>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
      <StatCard icon={Route} label="Km del período" value={fmtKm(r.totals.km)} color={colors.accent} sub={`${r.totals.trips} viajes`} />
      <StatCard icon={Gauge} label="Costo por km" value={fmtPerKm(r.totals.costPerKm)} color={colors.orange} sub={`costo total ${fmt(r.totals.cost)}`} />
      <StatCard icon={Gauge} label="Ingreso por km" value={fmtPerKm(r.totals.revenuePerKm)} color={colors.green} sub={`ingreso empresa ${fmt(r.totals.revenue)}`} />
      <StatCard icon={Gauge} label="Margen por km" value={fmtPerKm(r.totals.marginPerKm)} color={r.totals.marginPerKm == null ? colors.textMuted : r.totals.marginPerKm >= target ? colors.green : colors.red} sub={`objetivo RD$${target}`} />
      <StatCard icon={Fuel} label="Km por galón" value={r.totals.gallons > 0 && r.totals.km > 0 ? (r.totals.km / r.totals.gallons).toFixed(1) : "—"} color={colors.cyan} sub={`${Math.round(r.totals.gallons)} gal · ${fmt(r.totals.fuel)}`} />
    </div>

    {(r.quality.none > 0 || r.quality.fuelWithoutGallons > 0) && <div style={{ marginBottom: 14, background: colors.orange + "15", border: `1px solid ${colors.orange}40`, borderRadius: 10, padding: "8px 12px", fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
      <AlertTriangle size={14} color={colors.orange} /><span><b style={{ color: colors.orange }}>Calidad del dato:</b> {r.quality.none > 0 ? `${r.quality.none} viaje(s) sin km (sin GPS, sin odómetro y sin distancia de referencia). ` : ""}{r.quality.fuelWithoutGallons > 0 ? `${r.quality.fuelWithoutGallons} carga(s) de combustible sin galones.` : ""} Km reales: GPS {r.quality.gps} · odómetro {r.quality.odometer} · estimados {r.quality.estimated}.</span>
    </div>}

    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
      {[["trucks", "Por camión"], ["routes", "Por destino"], ["drivers", "Por chofer"], ["distances", "Distancias de referencia"], ["gps", "GPS"]].map(([k, l]) => <button key={k} onClick={() => setTab(k)} style={btn(tab === k)}>{l}</button>)}
    </div>

    {tab === "trucks" && <Card>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Camión</Th><Th align="right">Km</Th><Th align="right">Viajes</Th><Th align="right">Ingreso empresa</Th><Th align="right">Combustible</Th><Th align="right">Chofer + ayud.</Th><Th align="right">Mant./otros</Th><Th align="right">Fijos</Th><Th align="right">Costo total</Th><Th align="right">Costo/km</Th><Th align="right">Ingreso/km</Th><Th align="right">Margen/km</Th><Th align="right">Km/gal</Th></tr></thead>
        <tbody>{r.byTruck.length === 0 && <tr><Td colSpan={13}><span style={{ color: colors.textMuted }}>Sin viajes en el período.</span></Td></tr>}
          {r.byTruck.map(tk => <tr key={tk.truckId} style={{ borderBottom: `1px solid ${colors.border}11` }}>
            <Td bold><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: st(tk.status), marginRight: 6 }} />{tk.plate} <Badge label={tk.size} color={tk.size === "T2" ? colors.orange : colors.accent} />{tk.partnerName && <div style={{ fontSize: 10, color: colors.textMuted }}>socio {tk.partnerName}{tk.partnerRecovered > 0 ? ` · le descuentas ${fmt(tk.partnerRecovered)}` : ""}</div>}
              <div style={{ fontSize: 9, color: colors.textMuted }}>{Object.entries(tk.kmBySource).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${KM_SOURCE_LABEL[k].toLowerCase()}`).join(" · ")}</div></Td>
            <Td align="right">{fmtKm(tk.km)}</Td><Td align="right">{tk.trips}</Td><Td align="right" color={colors.green}>{fmt(tk.companyRevenue)}</Td>
            <Td align="right">{fmt(tk.fuel)}</Td><Td align="right">{fmt(tk.driver + tk.helpers)}</Td><Td align="right">{fmt(tk.maintenance + tk.other)}</Td><Td align="right">{fmt(tk.fixed)}</Td>
            <Td align="right" bold color={colors.orange}>{fmt(tk.cost)}</Td>
            <Td align="right" bold>{fmtPerKm(tk.costPerKm)}</Td><Td align="right">{fmtPerKm(tk.revenuePerKm)}</Td>
            <Td align="right" bold color={st(tk.status)}>{fmtPerKm(tk.marginPerKm)}</Td><Td align="right">{tk.kmPerGallon ? tk.kmPerGallon.toFixed(1) : "—"}</Td>
          </tr>)}</tbody>
      </table></div>
      <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 8 }}>Ingreso empresa: en camión propio el flete neto; en camión de socio solo lo que retiene la empresa (comisión o su parte). Costo: lo que paga la empresa y NO recupera del socio. Fijos: plantillas de gastos fijos con camión, prorrateadas por días.</div>
    </Card>}

    {tab === "routes" && <Card>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Destino</Th><Th align="right">Viajes</Th><Th align="right">Km</Th><Th align="right">Flete</Th><Th align="right">Costo directo</Th><Th align="right">Ingreso/km</Th><Th align="right">Costo/km</Th><Th align="right">Margen/km</Th></tr></thead>
        <tbody>{r.byRoute.map(x => <tr key={`${x.province}|${x.municipality}`} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td bold>{x.municipality}<div style={{ fontSize: 10, color: colors.textMuted }}>{x.province}</div></Td><Td align="right">{x.trips}</Td><Td align="right">{fmtKm(x.km)}</Td><Td align="right" color={colors.green}>{fmt(x.revenue)}</Td><Td align="right">{fmt(x.cost)}</Td>
          <Td align="right">{fmtPerKm(x.revenuePerKm)}</Td><Td align="right">{fmtPerKm(x.costPerKm)}</Td><Td align="right" bold color={x.marginPerKm == null ? colors.textMuted : x.marginPerKm >= target ? colors.green : colors.red}>{fmtPerKm(x.marginPerKm)}</Td>
        </tr>)}</tbody>
      </table></div>
      <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 8 }}>Costo directo = gastos ligados a los viajes de ese destino (combustible, chofer, ayudantes, peajes…) más el combustible registrado solo al camión, repartido entre los viajes de ese camión en el período según sus km. Un destino con margen/km bajo está mal tarifado o consume de más.</div>
    </Card>}

    {tab === "drivers" && <Card>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Chofer</Th><Th align="right">Viajes</Th><Th align="right">Km</Th><Th align="right">Combustible</Th><Th align="right">Galones</Th><Th align="right">Km/gal</Th><Th align="right">Pago + ayud.</Th><Th align="right">Costo/km (comb.+pago)</Th></tr></thead>
        <tbody>{r.byDriver.map(d => <tr key={d.driverId} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td bold><Users size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />{d.name}</Td><Td align="right">{d.trips}</Td><Td align="right">{fmtKm(d.km)}</Td><Td align="right">{fmt(d.fuel)}</Td><Td align="right">{d.gallons ? d.gallons.toFixed(1) : "—"}</Td>
          <Td align="right" bold color={d.kmPerGallon == null ? colors.textMuted : colors.cyan}>{d.kmPerGallon ? d.kmPerGallon.toFixed(1) : "—"}</Td><Td align="right">{fmt(d.pay)}</Td><Td align="right">{fmtPerKm(d.costPerKm)}</Td>
        </tr>)}</tbody>
      </table></div>
      <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 8 }}>Incluye el combustible registrado solo al camión, repartido entre sus viajes del período según los km. Un km/gal muy por debajo del resto en la misma ruta y camión suele ser consumo anormal o combustible que no llegó al tanque.</div>
    </Card>}

    {tab === "distances" && <Card>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>Km ida y vuelta desde la base a cada destino. Se usan cuando un viaje no tiene km del GPS ni odómetro.</div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 2fr 1fr auto", gap: 10, alignItems: "end", marginBottom: 12 }}>
        <Inp label="Provincia" value={newDist.province} onChange={e => setNewDist({ ...newDist, province: e.target.value })} list="bl-prov" />
        <Inp label="Municipio" value={newDist.municipality} onChange={e => setNewDist({ ...newDist, municipality: e.target.value })} />
        <Inp label="Km ida y vuelta" type="number" value={newDist.km} onChange={e => setNewDist({ ...newDist, km: e.target.value })} />
        <Btn onClick={addDist}><Plus size={13} /> Agregar</Btn>
      </div>
      {missing.length > 0 && <div style={{ fontSize: 11, color: colors.orange, marginBottom: 10 }}>Destinos con viajes y sin distancia: {missing.slice(0, 8).map(x => <button key={`${x.province}|${x.municipality}`} onClick={() => setNewDist({ province: x.province, municipality: x.municipality, km: "" })} style={{ ...btn(false), padding: "2px 8px", marginLeft: 4, fontSize: 11 }}>{x.municipality}</button>)}{missing.length > 8 ? ` … +${missing.length - 8}` : ""}</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Provincia</Th><Th>Municipio</Th><Th align="right">Km</Th><Th align="right"></Th></tr></thead>
        <tbody>{(distances || []).slice().sort((a, b) => a.province.localeCompare(b.province) || a.municipality.localeCompare(b.municipality)).map(d => <tr key={`${d.province}|${d.municipality}`} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td>{d.province}</Td><Td bold>{d.municipality}</Td><Td align="right">{fmtKm(d.km)}</Td>
          <Td align="right"><button onClick={() => setDistances(distances.filter(x => x !== d))} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button></Td>
        </tr>)}{(distances || []).length === 0 && <tr><Td colSpan={4}><span style={{ color: colors.textMuted }}>Todavía no hay distancias. Agrega las de tus destinos frecuentes.</span></Td></tr>}</tbody>
      </table>
    </Card>}

    {tab === "gps" && <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div><div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}><Satellite size={15} color={PURPLE} /> TrackSolid Pro</div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>{gpsTrucks} camión(es) con IMEI configurado (se pone en Flota). Km del GPS en el período: <b style={{ color: colors.text }}>{fmtKm(gpsPeriodKm)}</b>.</div></div>
        <Btn onClick={runGps}><RefreshCw size={13} /> Traer km del GPS</Btn>
      </div>
      {gpsMsg && <div style={{ marginTop: 10, fontSize: 12, color: gpsMsg.startsWith("No") ? colors.red : colors.green }}>{gpsMsg}</div>}
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 10 }}>Requiere appKey/appSecret de la Open API de TrackSolid configurados en el servidor (variables TRACKSOLID_*). La sincronización trae el kilometraje diario por dispositivo y, cuando el GPS detecta un trayecto en la fecha de un viaje, le asigna los km al viaje (fuente «GPS»).</div>
      {gpsKm.length > 0 && <div style={{ marginTop: 12, overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>Fecha</Th><Th>Camión</Th><Th>IMEI</Th><Th align="right">Km</Th></tr></thead>
        <tbody>{gpsKm.filter(g => g.date >= dateFrom && g.date <= dateTo).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60).map(g => <tr key={`${g.imei}|${g.date}`} style={{ borderBottom: `1px solid ${colors.border}11` }}><Td>{g.date}</Td><Td bold>{trucks.find(t => t.gpsImei === g.imei)?.plate || "—"}</Td><Td>{g.imei}</Td><Td align="right">{fmtKm(g.km)}</Td></tr>)}</tbody>
      </table></div>}
    </Card>}
  </div>;
}

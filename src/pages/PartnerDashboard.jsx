import { useState, useMemo } from "react";
import { Truck, Route, TrendingUp, TrendingDown, CircleDollarSign } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, pad, MONTHS_ES, today, genSettlementPeriods } from "../utils/helpers.js";
import { Card, StatCard, PageHeader, Sel, Badge, Th, Td, StatusBadge } from "../components/ui/index.jsx";
import { computeSettlement, computeSettlementChain, normalizePartner, PARTNER_MODELS } from "../utils/partnerModels.js";
import { settlementHTML } from "./SettlementsPage.jsx";
import { openPrintWindow } from "../utils/printReport.js";
import { FileText } from "lucide-react";

const MODES = ["quincena", "mes", "dia", "ano", "custom"];
const MODE_LABELS = { quincena: "Quincena", mes: "Mes", dia: "Día", ano: "Año", custom: "Personalizado" };

function Row({ label, value, color, bold }) {
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${colors.border}11`, fontWeight: bold ? 700 : 400 }}>
    <span style={{ color: colors.textMuted }}>{label}</span><span style={{ color: color || colors.text }}>{value < 0 ? "− " : ""}{fmt(Math.abs(value))}</span>
  </div>;
}

export default function PartnerDashboard({ t, trips, trucks, expenses, drivers, partner, partnerTruckIds, clients, brokers, settlementStatus, setSettlementStatus, isMobile }) {
  const now = new Date();
  const lastDayOf = (y, m) => new Date(y, m, 0).getDate();
  const todayStr = today();

  const [truckFilter, setTruckFilter] = useState("all");
  const [viewMode, setViewMode] = useState("quincena");

  // Quincena: 1–15 y 16–último día del mes (misma regla que Oficina y Liquidaciones)
  const _initCorte = () => { const day = now.getDate(); return { year: now.getFullYear(), month: now.getMonth() + 1, half: day <= 15 ? 1 : 2 }; };
  const _init = _initCorte();
  const [qYear, setQYear]   = useState(_init.year);
  const [qMonth, setQMonth] = useState(_init.month);
  const [qHalf, setQHalf]   = useState(_init.half);

  // Mes state
  const [mYear, setMYear]   = useState(now.getFullYear());
  const [mMonth, setMMonth] = useState(now.getMonth() + 1);

  // Día state
  const [dDate, setDDate] = useState(todayStr);

  // Año state
  const [aYear, setAYear] = useState(now.getFullYear());

  // Custom state
  const [cFrom, setCFrom] = useState(todayStr);
  const [cTo, setCTo]     = useState(todayStr);

  const { dateFrom, dateTo, periodLabel } = useMemo(() => {
    if (viewMode === "quincena") {
      const mStr = `${qYear}-${pad(qMonth)}`;
      const last = lastDayOf(qYear, qMonth);
      if (qHalf === 1) return { dateFrom: `${mStr}-01`, dateTo: `${mStr}-15`, periodLabel: `${MONTHS_ES[qMonth-1]} 1–15, ${qYear}` };
      return { dateFrom: `${mStr}-16`, dateTo: `${mStr}-${pad(last)}`, periodLabel: `${MONTHS_ES[qMonth-1]} 16–${last}, ${qYear}` };
    }
    if (viewMode === "mes") {
      const mStr = `${mYear}-${pad(mMonth)}`;
      const lastDay = lastDayOf(mYear, mMonth);
      return { dateFrom: `${mStr}-01`, dateTo: `${mStr}-${pad(lastDay)}`, periodLabel: `${MONTHS_ES[mMonth-1]} ${mYear}` };
    }
    if (viewMode === "dia") {
      return { dateFrom: dDate, dateTo: dDate, periodLabel: dDate };
    }
    if (viewMode === "ano") {
      return { dateFrom: `${aYear}-01-01`, dateTo: `${aYear}-12-31`, periodLabel: `Año ${aYear}` };
    }
    return { dateFrom: cFrom, dateTo: cTo, periodLabel: `${cFrom} → ${cTo}` };
  }, [viewMode, qYear, qMonth, qHalf, mYear, mMonth, dDate, aYear, cFrom, cTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevCorte = () => {
    if (qHalf === 2) { setQHalf(1); }
    else { setQHalf(2); if (qMonth === 1) { setQMonth(12); setQYear(y => y - 1); } else { setQMonth(m => m - 1); } }
  };
  const nextCorte = () => {
    if (qHalf === 1) { setQHalf(2); }
    else { setQHalf(1); if (qMonth === 12) { setQMonth(1); setQYear(y => y + 1); } else { setQMonth(m => m + 1); } }
  };

  const clientMap = new Map((clients || []).map(c => [c.id, c]));
  const brokerMap = new Map((brokers || []).map(b => [b.id, b]));
  const pTruckSet = new Set(partnerTruckIds || []);

  const myTrucks = trucks.filter(tk => pTruckSet.has(tk.id));
  let filtered = trips.filter(tr => pTruckSet.has(tr.truckId) && tr.date >= dateFrom && tr.date <= dateTo && tr.status !== "cancelled");
  if (truckFilter !== "all") filtered = filtered.filter(tr => tr.truckId === Number(truckFilter));

  const activeTruckSet = truckFilter === "all" ? pTruckSet : new Set([Number(truckFilter)]);

  // ── Misma función que Liquidaciones (3 modelos, reembolso primero) ─────────
  const p = normalizePartner(partner || {});
  const myTruckList = trucks.filter(tk => activeTruckSet.has(tk.id) && pTruckSet.has(tk.id));
  const period = { dateFrom, dateTo, half: viewMode === "quincena" ? qHalf : null, label: periodLabel, mStr: dateFrom.slice(0, 7) };
  // Quincena: misma cadena que Liquidaciones (el saldo que el socio quedó debiendo pasa a la siguiente)
  const settle = (() => {
    if (viewMode === "quincena" && truckFilter === "all") {
      const pds = genSettlementPeriods([...trips.map(tr => tr.date), dateFrom]);
      const chain = computeSettlementChain({ partner: p, periods: pds, trips, expenses, trucks: myTruckList, clients, brokers, drivers });
      const hit = chain.get(`${period.mStr}-${period.half}`);
      if (hit) return { ...hit, period: { ...hit.period, label: periodLabel } };
    }
    return computeSettlement({ partner: p, period, trips, expenses, trucks: myTruckList, clients, brokers, drivers });
  })();
  const passThruDeduction = settle.brokerDeduction;
  const rev = settle.netRevenue;
  const totalDeducciones = settle.commission + settle.reimbursement + settle.fixedTotal + (settle.model === "profit_share" ? settle.companyShare : 0);
  const toReceive = settle.toTransfer;
  const modelLabel = PARTNER_MODELS[settle.model]?.label || settle.model;
  const settleStatus = viewMode === "quincena" ? ((settlementStatus || {})[`${p.id}-${qYear}-${pad(qMonth)}-${qHalf}`] || "unpaid") : null;

  const inputStyle = { padding: "4px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 12 };

  return <div>
    <PageHeader title={`Mi Dashboard — ${partner?.name || ""}`} />

    <Card style={{ marginBottom: 16, padding: "10px 14px" }}>
      {/* Mode selector pills */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {MODES.map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            padding: "4px 11px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
            background: viewMode === mode ? colors.accent : colors.inputBg,
            color: viewMode === mode ? "white" : colors.textMuted,
            transition: "background 0.15s",
          }}>
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      {/* Date controls + truck filter */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {viewMode === "quincena" && <>
            <button onClick={prevCorte} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 13 }}>‹</button>
            <span style={{ fontWeight: 600, fontSize: 13, minWidth: 180, textAlign: "center" }}>{periodLabel}</span>
            <button onClick={nextCorte} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${colors.border}`, background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 13 }}>›</button>
          </>}
          {viewMode === "mes" && <>
            <Sel value={mMonth} onChange={e => setMMonth(Number(e.target.value))} style={{ fontSize: 11 }}>
              {MONTHS_ES.map((mn, i) => <option key={i+1} value={i+1}>{mn}</option>)}
            </Sel>
            <input type="number" value={mYear} onChange={e => setMYear(Number(e.target.value))} style={{ ...inputStyle, width: 72 }} />
          </>}
          {viewMode === "dia" && (
            <input type="date" value={dDate} onChange={e => setDDate(e.target.value)} style={inputStyle} />
          )}
          {viewMode === "ano" && (
            <input type="number" value={aYear} onChange={e => setAYear(Number(e.target.value))} style={{ ...inputStyle, width: 88 }} />
          )}
          {viewMode === "custom" && <>
            <input type="date" value={cFrom} onChange={e => setCFrom(e.target.value)} style={inputStyle} />
            <span style={{ color: colors.textMuted, fontSize: 11 }}>→</span>
            <input type="date" value={cTo} onChange={e => setCTo(e.target.value)} style={inputStyle} />
          </>}
        </div>
        <Sel value={truckFilter} onChange={e => setTruckFilter(e.target.value)} style={{ fontSize: 11 }}>
          <option value="all">Todos Mis Camiones</option>
          {myTrucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}
        </Sel>
      </div>
    </Card>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12, marginBottom: 16 }}>
      <StatCard icon={Truck}           label="Mis Camiones"  value={myTrucks.length}  color={colors.accent} />
      <StatCard icon={Route}           label={t.totalTrips}  value={filtered.length}  color={colors.cyan} />
      <StatCard icon={TrendingUp}      label={passThruDeduction > 0 ? "Ingreso Neto" : "Ingreso Bruto"} value={fmt(rev)} color={colors.green} />
      <StatCard icon={TrendingDown}    label="Total Deducciones" value={fmt(totalDeducciones)} color={colors.orange} />
      <StatCard icon={CircleDollarSign} label="A Recibir"   value={fmt(Math.max(0, toReceive))}   color={toReceive >= 0 ? colors.green : colors.red} sub={toReceive < 0 ? `debes ${fmt(-toReceive)} · pasa a la siguiente quincena` : settle.previousBalance > 0 ? `incluye ${fmt(settle.previousBalance)} que debías` : undefined} />
    </div>

    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Mi liquidación · {periodLabel} <Badge label={modelLabel} color={colors.accent} /></div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{settle.tripCount} viaje{settle.tripCount !== 1 ? "s" : ""} entregado{settle.tripCount !== 1 ? "s" : ""}{settle.expenseLines.length > 0 ? ` · ${settle.expenseLines.length} gasto(s) descontado(s)` : ""}{viewMode === "quincena" ? ` · pago ${settle.payDate}` : ""}{settle.previousBalance > 0 ? <span style={{ color: colors.red }}> · se descuentan {fmt(settle.previousBalance)} de la quincena anterior</span> : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: colors.textMuted }}>RECIBES</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: settleStatus === "paid" ? colors.green : toReceive < 0 ? colors.red : colors.orange }}>{fmt(Math.max(0, toReceive))}</div>
          </div>
          {viewMode === "quincena" && <Badge label={settleStatus === "paid" ? "✓ Recibido" : "Pendiente"} color={settleStatus === "paid" ? colors.green : colors.orange} />}
          <button onClick={() => openPrintWindow(`Liquidación ${partner?.name || ""} ${periodLabel}`, settlementHTML({ s: settle, partner: p, t, clients, trucks, status: viewMode === "quincena" ? settleStatus : null }))}
            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: colors.accent, color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}><FileText size={13} /> Ver detalle</button>
        </div>
      </div>
      {viewMode !== "quincena" && p.fixedCharges?.length > 0 && <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 6 }}>Los cargos fijos se aplican por quincena.</div>}
    </Card>

    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Viajes del Período</h3>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: colors.textMuted }}>{periodLabel}</span>
          {truckFilter !== "all" && <Badge label={myTrucks.find(tk => tk.id === Number(truckFilter))?.plate || ""} color={colors.accent} />}
          <Badge label={`${filtered.length} viajes`} color={colors.cyan} />
        </div>
      </div>
      {filtered.length === 0
        ? <div style={{ textAlign: "center", padding: 32, color: colors.textMuted }}>Sin viajes para el filtro seleccionado.</div>
        : <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              <Th>{t.date}</Th><Th>Ruta</Th><Th>{t.client}</Th><Th>{t.truck}</Th>
              <Th align="right">{t.revenue}</Th><Th align="right">Retenciones</Th>
              <Th align="center">{t.status}</Th><Th align="center">{t.document}</Th>
            </tr></thead>
            <tbody>{filtered.slice().sort((a,b) => a.date.localeCompare(b.date)).map(tr => {
              const cl = clientMap.get(tr.clientId);
              const tk = trucks.find(t2 => t2.id === tr.truckId);
              const tripRet = expenses.filter(e => e.tripId === tr.id && e.category === "broker_commission").reduce((s,e) => s+e.amount, 0);
              const isPassThru = cl?.rules?.brokerPassThrough && tr.brokerId;
              const passThruTripDed = isPassThru ? (() => {
                const br = brokerMap.get(tr.brokerId);
                return br ? Math.round((tr.revenue || 0) * (br.commissionPct || 10) / 100) : 0;
              })() : 0;
              const totalTripDed = tripRet + passThruTripDed;
              return <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                <Td>{tr.date}</Td>
                <Td>{tr.municipality}{tr.province ? `, ${tr.province}` : ""}</Td>
                <Td>{cl?.companyName || "—"}</Td>
                <Td>{tk?.plate || "—"}</Td>
                <Td align="right" bold color={colors.green}>{fmt(tr.revenue)}</Td>
                <Td align="right" color={totalTripDed > 0 ? colors.orange : colors.textMuted}>
                  {totalTripDed > 0 ? `− ${fmt(totalTripDed)}` : "—"}
                </Td>
                <Td align="center"><StatusBadge status={tr.status} t={t} /></Td>
                <Td align="center"><Badge label={tr.docStatus === "delivered" ? t.deliveredDocs : t.pendingDocs} color={tr.docStatus === "delivered" ? colors.green : colors.orange} /></Td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
    </Card>
  </div>;
}

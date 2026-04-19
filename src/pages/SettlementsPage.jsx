import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt } from "../utils/helpers.js";
import { EXPENSE_CATEGORIES } from "../constants/categories.js";
import { Card, PageHeader, Th, Td, StatusBadge } from "../components/ui/index.jsx";

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function genPeriods(trips) {
  const pad = n => String(n).padStart(2, "0");
  const lastDayOf = (y, m) => new Date(y, m, 0).getDate();
  const now = new Date(); const day = now.getDate();
  let y = now.getFullYear(), m = now.getMonth() + 1, h;
  if (day >= 30) { if (m === 12) { y++; m = 1; } else { m++; } h = 1; }
  else { h = day >= 15 ? 2 : 1; }
  const allTripDates = trips.map(tr => tr.date).sort();
  const earliest = allTripDates[0] || `${y}-${pad(m)}-01`;
  const buildPd = (py, pm, ph) => {
    const mStr = `${py}-${pad(pm)}`;
    if (ph === 1) {
      const prevM = pm === 1 ? 12 : pm - 1, prevY = pm === 1 ? py - 1 : py;
      const startDay = Math.min(30, lastDayOf(prevY, prevM));
      return { year: py, month: pm, half: ph, mStr,
        dateFrom: `${prevY}-${pad(prevM)}-${startDay}`, dateTo: `${mStr}-14`,
        label: `${MONTHS_ES[prevM-1]} ${startDay} – ${MONTHS_ES[pm-1]} 14, ${py}` };
    }
    return { year: py, month: pm, half: ph, mStr,
      dateFrom: `${mStr}-15`, dateTo: `${mStr}-29`,
      label: `${MONTHS_ES[pm-1]} 15–29, ${py}` };
  };
  const periods = [];
  for (let i = 0; i < 60; i++) {
    const pd = buildPd(y, m, h); periods.push(pd);
    if (pd.dateTo < earliest) break;
    if (h === 2) { h = 1; } else { h = 2; if (m === 1) { m = 12; y--; } else { m--; } }
  }
  return periods;
}

function SettlementCard({ card, partner, periodLabel, clients, trucks, t, isPartnerView, onToggle }) {
  const { pTrips, pExpenses, retenciones, otrosGastos, rev, net, adminComm, toTransfer, status } = card;
  const isPaid = status === "paid";
  const [showDetail, setShowDetail] = useState(false);

  return <Card style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${colors.border}` }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{isPartnerView ? "Mi Liquidación" : partner.name}</div>
        <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{periodLabel} • {pTrips.length} viaje{pTrips.length !== 1 ? "s" : ""}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: colors.textMuted }}>A TRANSFERIR</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: isPaid ? colors.green : colors.orange }}>{fmt(toTransfer)}</div>
        </div>
        {!isPartnerView && <button onClick={onToggle} style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", background: isPaid ? colors.green : colors.orange, color: "white" }}>
          {isPaid ? "✓ Transferido" : "Marcar Transferido"}
        </button>}
        {isPartnerView && <div style={{ padding: "7px 14px", borderRadius: 8, background: isPaid ? colors.green+"18" : colors.orange+"18", color: isPaid ? colors.green : colors.orange, fontWeight: 700, fontSize: 12 }}>{isPaid ? "✓ Recibido" : "Pendiente"}</div>}
      </div>
    </div>

    <button onClick={() => setShowDetail(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: colors.textMuted, cursor: "pointer", fontSize: 12, padding: "4px 0", marginTop: 4 }}>
      {showDetail ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
      {showDetail ? "Ocultar detalle" : "Ver detalle de viajes y resumen financiero"}
    </button>

    {showDetail && <>
      <div style={{ marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            <Th>Fecha</Th><Th>Ruta</Th><Th>Cliente</Th><Th>{t.truck}</Th><Th align="center">Estado</Th><Th align="right">Ingreso</Th>
          </tr></thead>
          <tbody>{pTrips.sort((a,b) => a.date.localeCompare(b.date)).map(tr => {
            const cl = clients.find(c => c.id === tr.clientId);
            const tk = trucks.find(tk => tk.id === tr.truckId);
            return <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
              <Td>{tr.date}</Td>
              <Td>{tr.origin ? `${tr.origin} → ` : ""}{tr.municipality}{tr.province ? `, ${tr.province}` : ""}</Td>
              <Td>{cl?.companyName || "—"}</Td>
              <Td>{tk?.plate || "—"}</Td>
              <Td align="center"><StatusBadge status={tr.status} t={t} /></Td>
              <Td align="right" bold color={colors.green}>{fmt(tr.revenue)}</Td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      <div style={{ background: colors.inputBg, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.border}` }}>
        <h4 style={{ margin: "0 0 10px", fontSize: 13 }}>Resumen Financiero</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: colors.textMuted }}>Ingreso Bruto</span>
            <span style={{ fontWeight: 600, color: colors.green }}>+ {fmt(rev)}</span>
          </div>
          {retenciones > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: colors.textMuted }}>Retenciones</span>
            <span style={{ color: colors.orange }}>− {fmt(retenciones)}</span>
          </div>}
          {otrosGastos > 0 && (() => {
            const catTotals = EXPENSE_CATEGORIES.filter(c => c !== "broker_commission").map(c => ({
              cat: c, label: t[c] || c, total: pExpenses.filter(e => e.category === c).reduce((s,e) => s+e.amount, 0)
            })).filter(x => x.total > 0);
            return catTotals.map(x => (
              <div key={x.cat} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: colors.textMuted }}>{x.label}</span>
                <span style={{ color: colors.orange }}>− {fmt(x.total)}</span>
              </div>
            ));
          })()}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: `1px solid ${colors.border}` }}>
            <span style={{ fontWeight: 600 }}>Neto</span>
            <span style={{ fontWeight: 700, color: net >= 0 ? colors.green : colors.red }}>{fmt(net)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: colors.textMuted }}>Comisión admin ({partner.commissionPct || 0}%)</span>
            <span style={{ color: colors.purple }}>− {fmt(adminComm)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `2px solid ${colors.border}`, marginTop: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>A Transferir</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: isPaid ? colors.green : colors.orange }}>{fmt(toTransfer)}</span>
          </div>
        </div>
      </div>
    </>}
  </Card>;
}

export default function SettlementsPage({ t, trips, trucks, expenses, clients, partners, settlementStatus, setSettlementStatus, user, partner, partnerTruckIds }) {
  const isPartnerView = user?.role === "partner";

  const toggleStatus = (key) => setSettlementStatus(prev => ({ ...prev, [key]: prev[key] === "paid" ? "unpaid" : "paid" }));

  const buildCard = (p, pTrips, key) => {
    const tripIdSet  = new Set(pTrips.map(tr => tr.id));
    const pExpenses  = expenses.filter(e => tripIdSet.has(e.tripId));
    const retenciones = pExpenses.filter(e => e.category === "broker_commission").reduce((s,e) => s+e.amount, 0);
    const otrosGastos = pExpenses.filter(e => e.category !== "broker_commission").reduce((s,e) => s+e.amount, 0);
    const rev        = pTrips.reduce((s,tr) => s+tr.revenue, 0);
    const net        = rev - retenciones - otrosGastos;
    const adminComm  = Math.round(net * ((p.commissionPct||0) / 100));
    const toTransfer = net - adminComm;
    const status     = settlementStatus[key] || "unpaid";
    return { pTrips, pExpenses, retenciones, otrosGastos, rev, net, adminComm, toTransfer, status, key };
  };

  const periods = genPeriods(trips);

  if (isPartnerView) {
    const periodCards = periods.map(pd => {
      const myTrips = trips.filter(tr => (partnerTruckIds||[]).includes(tr.truckId) && tr.date >= pd.dateFrom && tr.date <= pd.dateTo);
      if (myTrips.length === 0) return null;
      const key = `${partner?.id}-${pd.mStr}-${pd.half}`;
      return { pd, card: buildCard(partner||{}, myTrips, key) };
    }).filter(Boolean);

    return <div>
      <PageHeader title={t.settlements} />
      {periodCards.length === 0 && <Card><div style={{ textAlign: "center", padding: 40, color: colors.textMuted }}>Sin liquidaciones registradas aún.</div></Card>}
      {periodCards.map(({ pd, card }) => (
        <SettlementCard key={card.key} card={card} partner={partner||{}} periodLabel={pd.label} clients={clients} trucks={trucks} t={t} isPartnerView={true} onToggle={() => toggleStatus(card.key)} />
      ))}
    </div>;
  }

  const periodGroups = periods.map(pd => {
    const partnerCards = partners.map(p => {
      const pTruckSet = new Set(trucks.filter(tk => tk.partnerId === p.id).map(tk => tk.id));
      const pTrips  = trips.filter(tr => pTruckSet.has(tr.truckId) && tr.date >= pd.dateFrom && tr.date <= pd.dateTo);
      if (pTrips.length === 0) return null;
      const key = `${p.id}-${pd.mStr}-${pd.half}`;
      return { p, card: buildCard(p, pTrips, key) };
    }).filter(Boolean);
    if (partnerCards.length === 0) return null;
    const periodTotal = partnerCards.reduce((s,x) => s + x.card.toTransfer, 0);
    return { pd, partnerCards, periodTotal };
  }).filter(Boolean);

  return <div>
    <PageHeader title={t.settlements} />
    {periodGroups.length === 0 && <Card><div style={{ textAlign: "center", padding: 40, color: colors.textMuted }}>{t.noSettlements}</div></Card>}
    {periodGroups.map(({ pd, partnerCards, periodTotal }) => (
      <div key={`${pd.mStr}-${pd.half}`} style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px", marginBottom: 10, borderBottom: `2px solid ${colors.border}` }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{pd.label}</span>
            <span style={{ marginLeft: 12, fontSize: 12, color: colors.textMuted }}>{partnerCards.length} socio{partnerCards.length !== 1 ? "s" : ""} • {partnerCards.reduce((s,x) => s+x.card.pTrips.length, 0)} viajes</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: colors.textMuted }}>TOTAL A TRANSFERIR</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.green }}>{fmt(periodTotal)}</div>
          </div>
        </div>
        {partnerCards.map(({ p, card }) => (
          <SettlementCard key={card.key} card={card} partner={p} periodLabel={pd.label} clients={clients} trucks={trucks} t={t} isPartnerView={false} onToggle={() => toggleStatus(card.key)} />
        ))}
      </div>
    ))}
  </div>;
}

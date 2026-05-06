import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, genSettlementPeriods as genPeriods } from "../utils/helpers.js";
import { Card, PageHeader, Th, Td, StatusBadge } from "../components/ui/index.jsx";

const NOMINA_CATS = new Set(["driverPay", "salary", "nominaTotalOverride"]);

// ── Sub-component: one financial row ────────────────────────────────────────
function FRow({ label, value, minus, plus, valueColor, bold, divider, size }) {
  let wrapperStyle = { display: "flex", justifyContent: "space-between", alignItems: "baseline" };
  if (divider === "single") {
    wrapperStyle = { ...wrapperStyle, paddingTop: 10, marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.12)" };
  } else if (divider === "double") {
    wrapperStyle = { ...wrapperStyle, paddingTop: 12, marginTop: 8, borderTop: "2px solid rgba(255,255,255,0.22)" };
  }
  const prefix = minus && value > 0 ? "− " : plus && value > 0 ? "+ " : "";

  return (
    <div style={wrapperStyle}>
      <span style={{ color: bold ? colors.text : colors.textMuted, fontWeight: bold ? 700 : 400, fontSize: size || 13 }}>
        {label}
      </span>
      <span style={{ fontWeight: bold ? (size ? 800 : 700) : 500, fontSize: size || 13, color: valueColor || colors.text }}>
        {prefix}{fmt(value)}
      </span>
    </div>
  );
}

// ── Sub-component: collapsible trips (ingresos) table ────────────────────────
function IngresosTable({ pTrips, clients, trucks, t }) {
  const [open, setOpen] = useState(false);
  const total = pTrips.reduce((s, tr) => s + (tr.revenue || 0), 0);
  return (
    <div style={{ marginTop: 14 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: colors.textMuted, cursor: "pointer", fontSize: 12, padding: "4px 0" }}
      >
        {open ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
        Ingresos — <span style={{ color: colors.green, fontWeight: 600 }}>+ {fmt(total)}</span>
      </button>
      {open && (
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", marginTop: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <Th>Fecha</Th><Th>Ruta</Th><Th>Cliente</Th><Th>{t.truck}</Th><Th align="center">Estado</Th><Th align="right">Ingreso</Th>
              </tr>
            </thead>
            <tbody>
              {[...pTrips].sort((a, b) => a.date.localeCompare(b.date)).map(tr => {
                const cl = clients.find(c => c.id === tr.clientId);
                const tk = trucks.find(tk => tk.id === tr.truckId);
                return (
                  <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                    <Td>{tr.date}</Td>
                    <Td>{tr.origin ? `${tr.origin} → ` : ""}{tr.municipality}{tr.province ? `, ${tr.province}` : ""}</Td>
                    <Td>{cl?.companyName || "—"}</Td>
                    <Td>{tk?.plate || "—"}</Td>
                    <Td align="center"><StatusBadge status={tr.status} t={t} /></Td>
                    <Td align="right" bold color={colors.green}>{fmt(tr.revenue || 0)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sub-component: collapsible consolidated gastos table ─────────────────────
function GastosTable({ allExps, supplierMap, driverMap, brokerMap, t }) {
  const [open, setOpen] = useState(false);
  if (allExps.length === 0) return null;
  const total = allExps.reduce((s, e) => s + e.amount, 0);
  return (
    <div style={{ marginTop: 14 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: colors.textMuted, cursor: "pointer", fontSize: 12, padding: "4px 0" }}
      >
        {open ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
        Gastos — <span style={{ color: colors.orange, fontWeight: 600 }}>− {fmt(total)}</span>
      </button>
      {open && (
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", marginTop: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <Th>Fecha</Th><Th>Concepto</Th><Th>Categoría</Th><Th align="center">Estado</Th><Th align="right">Monto</Th>
              </tr>
            </thead>
            <tbody>
              {[...allExps].sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((e, i) => {
                const sup = supplierMap.get(e.supplierId);
                const drv = driverMap.get(e.driverId);
                const br  = brokerMap?.get(e.brokerId);
                const name = br?.name || sup?.name || drv?.name || e.description || "—";
                const catLabel = t[e.category] || e.category || "—";
                const isPending = !e.status || e.status === "pending";
                return (
                  <tr key={e.id ?? i} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                    <Td>{e.date || "—"}</Td>
                    <Td>{name}</Td>
                    <Td style={{ color: colors.textMuted }}>{catLabel}</Td>
                    <Td align="center">
                      <span style={{ color: isPending ? colors.orange : colors.green, fontWeight: 600, fontSize: 11 }}>
                        {isPending ? "CxP" : "Pagado"}
                      </span>
                    </Td>
                    <Td align="right" color={colors.orange}>− {fmt(e.amount)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── SettlementCard ───────────────────────────────────────────────────────────
function SettlementCard({ card, partner, periodLabel, clients, trucks, supplierMap, driverMap, brokerMap, t, isPartnerView, onToggle }) {
  const {
    pTrips,
    comisionExps, paidGastoExps, cxpExps, nominaExps,
    comisiones, gastos, nomina,
    grossRev, passThruDeduction, rev, net, adminComm, toTransfer, status,
  } = card;
  const isPaid = status === "paid";
  const [showDetail, setShowDetail] = useState(false);

  const allGastoExps = [...comisionExps, ...paidGastoExps, ...cxpExps, ...nominaExps];

  return (
    <Card style={{ marginBottom: 16 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${colors.border}` }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{isPartnerView ? "Mi Liquidación" : partner.name}</div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
            {periodLabel} • {pTrips.length} viaje{pTrips.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: colors.textMuted }}>A TRANSFERIR</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: isPaid ? colors.green : colors.orange }}>{fmt(toTransfer)}</div>
          </div>
          {!isPartnerView && (
            <button
              onClick={onToggle}
              style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", background: isPaid ? colors.green : colors.orange, color: "white" }}
            >
              {isPaid ? "✓ Transferido" : "Marcar Transferido"}
            </button>
          )}
          {isPartnerView && (
            <div style={{ padding: "7px 14px", borderRadius: 8, background: isPaid ? colors.green + "18" : colors.orange + "18", color: isPaid ? colors.green : colors.orange, fontWeight: 700, fontSize: 12 }}>
              {isPaid ? "✓ Recibido" : "Pendiente"}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail toggle ── */}
      <button
        onClick={() => setShowDetail(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: colors.textMuted, cursor: "pointer", fontSize: 12, padding: "4px 0", marginTop: 4 }}
      >
        {showDetail ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
        {showDetail ? "Ocultar detalle" : "Ver detalle y resumen financiero"}
      </button>

      {showDetail && (
        <>
          {/* ── Resumen Financiero — always visible when detail is open ── */}
          <div style={{ background: colors.inputBg, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.border}`, marginTop: 14 }}>
            <h4 style={{ margin: "0 0 10px", fontSize: 13 }}>Resumen Financiero</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>

              <FRow label="Ingreso Bruto (tarifas)" value={grossRev} plus valueColor={colors.green} />

              {passThruDeduction > 0 && (
                <FRow
                  label={isPartnerView ? "Retenciones broker (pass-through)" : "Deducción broker (pass-through)"}
                  value={passThruDeduction}
                  minus
                  valueColor={colors.orange}
                />
              )}

              {passThruDeduction > 0 && (
                <FRow label="Ingreso Neto Recibido" value={rev} bold />
              )}

              {comisiones > 0 && (
                <FRow
                  label={isPartnerView ? "Retenciones" : "Comisiones broker"}
                  value={comisiones}
                  minus
                  valueColor={colors.orange}
                />
              )}

              {gastos > 0 && (
                <FRow label="Gastos" value={gastos} minus valueColor={colors.orange} />
              )}

              {nomina > 0 && (
                <FRow label="Nómina" value={nomina} minus valueColor={colors.orange} />
              )}

              <FRow
                label="Neto"
                value={net}
                bold
                divider="single"
                valueColor={net >= 0 ? colors.green : colors.red}
                size={15}
              />

              {adminComm > 0 && (
                <FRow
                  label={isPartnerView
                    ? `Comisión empresa (${partner.commissionPct || 0}%)`
                    : `Comisión admin (${partner.commissionPct || 0}%)`}
                  value={adminComm}
                  minus
                  valueColor={colors.purple}
                />
              )}

              <FRow
                label="A Transferir"
                value={toTransfer}
                bold
                divider="double"
                valueColor={isPaid ? colors.green : colors.orange}
                size={18}
              />
            </div>
          </div>

          {/* ── [Ingresos ▶] — collapsible trips table ── */}
          <IngresosTable pTrips={pTrips} clients={clients} trucks={trucks} t={t} />

          {/* ── [Gastos ▶] — consolidated all-costs table ── */}
          <GastosTable
            allExps={allGastoExps}
            supplierMap={supplierMap}
            driverMap={driverMap}
            brokerMap={brokerMap}
            t={t}
          />
        </>
      )}
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function SettlementsPage({ t, trips, trucks, expenses, clients, partners, brokers, suppliers, drivers, settlementStatus, setSettlementStatus, user, partner, partnerTruckIds, isMobile }) {
  const isPartnerView = user?.role === "partner";

  const clientMap   = new Map((clients   || []).map(c => [c.id, c]));
  const brokerMap   = new Map((brokers   || []).map(b => [b.id, b]));
  const supplierMap = new Map((suppliers || []).map(s => [s.id, s]));
  const driverMap   = new Map((drivers   || []).map(d => [d.id, d]));

  const toggleStatus = (key) =>
    setSettlementStatus(prev => ({ ...prev, [key]: prev[key] === "paid" ? "unpaid" : "paid" }));

  const buildCard = (p, pTrips, pd, key) => {
    const tripIdSet = new Set(pTrips.map(tr => tr.id));

    // All driverPay expenses for these trips
    const tripDriverPayExps = expenses.filter(e => e.category === "driverPay" && tripIdSet.has(e.tripId));

    // Collect all driver IDs referenced by driverPay or trip assignment
    const tripDriverMap    = new Map(pTrips.map(tr => [tr.id, tr.driverId]).filter(([, d]) => d));
    const driverIdsFromPay = new Set(tripDriverPayExps.map(e => e.driverId).filter(Boolean));
    const allDriverIds     = new Set([...pTrips.map(tr => tr.driverId).filter(Boolean), ...driverIdsFromPay]);

    // Trucks belonging to this partner (for non-trip expenses like fuel)
    const pTruckSet = new Set(trucks.filter(tk => tk.partnerId === p.id).map(tk => tk.id));

    // Include fixed-salary drivers whose nómina arrives only via nominaTotalOverride
    expenses.forEach(e => {
      if (e.category !== "nominaTotalOverride") return;
      if (!e.driverId) return;
      if (!(e.date >= pd.dateFrom && e.date <= pd.dateTo)) return;
      if (allDriverIds.has(e.driverId)) return;
      const belongsByExpenseTruck = e.truckId && pTruckSet.has(e.truckId);
      const driverTruckId = drivers.find(d => d.id === e.driverId)?.truckId;
      const belongsByDriverTruck = driverTruckId && pTruckSet.has(driverTruckId);
      if (belongsByExpenseTruck || belongsByDriverTruck) {
        allDriverIds.add(e.driverId);
      }
    });

    // nominaTotalOverride replaces individual driverPay for that driver in this period
    const overrideExpenses = expenses.filter(e =>
      e.category === "nominaTotalOverride" &&
      allDriverIds.has(e.driverId) &&
      e.date >= pd.dateFrom && e.date <= pd.dateTo
    );
    const overriddenDriverIds = new Set(overrideExpenses.map(e => e.driverId));

    // Exclude driverPay for overridden drivers; nominaTotalOverride collected separately above
    const tripExpenses = expenses.filter(e => {
      if (tripIdSet.has(e.tripId)) {
        if (e.category === "nominaTotalOverride") return false; // collected separately
        if (e.category === "driverPay") {
          const dId = e.driverId || tripDriverMap.get(e.tripId);
          if (dId && overriddenDriverIds.has(dId)) return false;
        }
        return true;
      }
      // Non-trip expense linked to a partner's truck within the period (e.g. fuel, repairs)
      if (!e.tripId && e.truckId && pTruckSet.has(e.truckId) &&
          e.date >= pd.dateFrom && e.date <= pd.dateTo) {
        return true;
      }
      return false;
    });
    const pExpenses = [...tripExpenses, ...overrideExpenses];

    // ── Split into buckets ───────────────────────────────────────────────────
    // 1. Comisiones / Retenciones
    const comisionExps = pExpenses.filter(e => e.category === "broker_commission");
    const comisiones   = comisionExps.reduce((s, e) => s + e.amount, 0);

    // 2. Nómina (driver pay — committed regardless of payment status)
    const nominaExps = pExpenses.filter(e => NOMINA_CATS.has(e.category));
    const nomina     = nominaExps.reduce((s, e) => s + e.amount, 0);

    // 3. Gastos — ALL operational expenses (paid or pending)
    const gastoExps     = pExpenses.filter(e => !NOMINA_CATS.has(e.category) && e.category !== "broker_commission");
    const gastos        = gastoExps.reduce((s, e) => s + e.amount, 0);
    const paidGastoExps = gastoExps.filter(e => e.status !== "pending");
    const cxpExps       = gastoExps.filter(e => e.status === "pending");

    // ── Revenue ─────────────────────────────────────────────────────────────
    const passThruDeduction = pTrips.reduce((s, tr) => {
      const cl = clientMap.get(tr.clientId);
      if (!cl?.rules?.brokerPassThrough || !tr.brokerId) return s;
      const br = brokerMap.get(tr.brokerId);
      if (!br) return s;
      return s + Math.round((tr.revenue || 0) * (br.commissionPct || 10) / 100);
    }, 0);

    const grossRev   = pTrips.reduce((s, tr) => s + (tr.revenue || 0), 0);
    const rev        = grossRev - passThruDeduction;

    // ── Final figures ────────────────────────────────────────────────────────
    const net        = rev - comisiones - gastos - nomina;
    const adminComm  = Math.max(0, Math.round(net * ((p.commissionPct || 0) / 100)));
    const toTransfer = net - adminComm;
    const status     = settlementStatus[key] || "unpaid";

    return {
      pTrips, pExpenses,
      comisionExps, comisiones, gastos, paidGastoExps, cxpExps, nomina, nominaExps,
      grossRev, passThruDeduction, rev, net, adminComm, toTransfer, status, key,
    };
  };

  const periods = genPeriods(trips.map(tr => tr.date));

  // ── Partner view ─────────────────────────────────────────────────────────
  if (isPartnerView) {
    const periodCards = periods.map(pd => {
      const myTrips = trips.filter(tr => (partnerTruckIds || []).includes(tr.truckId) && tr.date >= pd.dateFrom && tr.date <= pd.dateTo && tr.status !== "cancelled");
      if (myTrips.length === 0) return null;
      const key = `${partner?.id}-${pd.mStr}-${pd.half}`;
      return { pd, card: buildCard(partner || {}, myTrips, pd, key) };
    }).filter(Boolean);

    return (
      <div>
        <PageHeader title={t.settlements} />
        {periodCards.length === 0 && (
          <Card><div style={{ textAlign: "center", padding: 40, color: colors.textMuted }}>Sin liquidaciones registradas aún.</div></Card>
        )}
        {periodCards.map(({ pd, card }) => (
          <SettlementCard
            key={card.key}
            card={card}
            partner={partner || {}}
            periodLabel={pd.label}
            clients={clients}
            trucks={trucks}
            supplierMap={supplierMap}
            driverMap={driverMap}
            brokerMap={brokerMap}
            t={t}
            isPartnerView={true}
            onToggle={() => toggleStatus(card.key)}
          />
        ))}
      </div>
    );
  }

  // ── Admin view ───────────────────────────────────────────────────────────
  const periodGroups = periods.map(pd => {
    const partnerCards = partners.map(p => {
      const pTruckSet = new Set(trucks.filter(tk => tk.partnerId === p.id).map(tk => tk.id));
      const pTrips    = trips.filter(tr => pTruckSet.has(tr.truckId) && tr.date >= pd.dateFrom && tr.date <= pd.dateTo && tr.status !== "cancelled");
      if (pTrips.length === 0) return null;
      const key = `${p.id}-${pd.mStr}-${pd.half}`;
      return { p, card: buildCard(p, pTrips, pd, key) };
    }).filter(Boolean);
    if (partnerCards.length === 0) return null;
    const periodTotal = partnerCards.reduce((s, x) => s + x.card.toTransfer, 0);
    return { pd, partnerCards, periodTotal };
  }).filter(Boolean);

  return (
    <div>
      <PageHeader title={t.settlements} />
      {periodGroups.length === 0 && (
        <Card><div style={{ textAlign: "center", padding: 40, color: colors.textMuted }}>{t.noSettlements}</div></Card>
      )}
      {periodGroups.map(({ pd, partnerCards, periodTotal }) => (
        <div key={`${pd.mStr}-${pd.half}`} style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px", marginBottom: 10, borderBottom: `2px solid ${colors.border}` }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{pd.label}</span>
              <span style={{ marginLeft: 12, fontSize: 12, color: colors.textMuted }}>
                {partnerCards.length} socio{partnerCards.length !== 1 ? "s" : ""} • {partnerCards.reduce((s, x) => s + x.card.pTrips.length, 0)} viajes
              </span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: colors.textMuted }}>TOTAL A TRANSFERIR</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: colors.green }}>{fmt(periodTotal)}</div>
            </div>
          </div>
          {partnerCards.map(({ p, card }) => (
            <SettlementCard
              key={card.key}
              card={card}
              partner={p}
              periodLabel={pd.label}
              clients={clients}
              trucks={trucks}
              supplierMap={supplierMap}
              driverMap={driverMap}
              brokerMap={brokerMap}
              t={t}
              isPartnerView={false}
              onToggle={() => toggleStatus(card.key)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

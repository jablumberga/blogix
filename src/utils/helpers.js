// ─── Formatting Utilities ─────────────────────────────────────────────────────
export const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "DOP", minimumFractionDigits: 0 }).format(n);

export const pct = (n) => (n * 100).toFixed(1) + "%";

export const nxId = (arr) => (arr.length ? arr.reduce((max, x) => x.id > max ? x.id : max, 0) + 1 : 1);

// Returns the resolved truck id for an expense: direct truckId first, then trip-indirect
export function expenseTruckId(expense, tripMap) {
  if (expense.truckId) return expense.truckId;
  if (expense.tripId && tripMap) {
    const tr = tripMap.get(expense.tripId);
    if (tr?.truckId) return tr.truckId;
  }
  return null;
}

export const today = () => new Date().toISOString().slice(0, 10);

export const monthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const daysDiff = (dateStr) =>
  Math.floor((new Date(today()) - new Date(dateStr)) / 86400000);

// ─── Supervisor Agents / Alert Engine ────────────────────────────────────────
export function computeAlerts({ trips, expenses, clients, drivers, trucks, partners, brokers, settlementStatus }) {
  const alerts = [];

  // AGENT 1: Viajes duplicados
  const seen = {};
  trips.filter(tr => tr.status !== "cancelled").forEach(tr => {
    const key = `${tr.date}-${tr.clientId}-${tr.municipality}-${tr.truckId}`;
    if (seen[key]) {
      alerts.push({ id: `dup-${tr.id}`, severity: "error", category: "duplicate", tripId: tr.id,
        msg: `Viaje duplicado: #${seen[key]} y #${tr.id} — mismo día, cliente, destino y camión` });
    } else { seen[key] = tr.id; }
  });

  // AGENT 2: Viajes sin tarifa
  trips.filter(tr => tr.status !== "cancelled" && (!tr.revenue || tr.revenue === 0)).forEach(tr => {
    const cl = clients.find(c => c.id === tr.clientId);
    alerts.push({ id: `rev-${tr.id}`, severity: "error", category: "revenue", tripId: tr.id,
      msg: `Viaje #${tr.id} sin tarifa — ${cl?.companyName || "Sin cliente"} → ${tr.municipality || "Sin destino"} (${tr.date})` });
  });

  // AGENT 3: Ref. factura faltante
  trips.filter(tr => tr.status !== "cancelled" && !tr.invoiceRef).forEach(tr => {
    const cl = clients.find(c => c.id === tr.clientId);
    if (cl?.rules?.requiresInvoiceRef) {
      alerts.push({ id: `inv-${tr.id}`, severity: "error", category: "invoice", tripId: tr.id,
        msg: `Viaje #${tr.id} sin ref. factura — ${cl.companyName} la requiere (${tr.date})` });
    }
  });

  // AGENT 4: Viajes estancados en tránsito > 3 días
  trips.filter(tr => tr.status === "in_transit").forEach(tr => {
    const days = daysDiff(tr.date);
    if (days > 3) {
      const cl = clients.find(c => c.id === tr.clientId);
      alerts.push({ id: `stale-${tr.id}`, severity: "warning", category: "stale", tripId: tr.id,
        msg: `Viaje #${tr.id} lleva ${days} días en tránsito — ${cl?.companyName || "—"} → ${tr.municipality} (iniciado ${tr.date})` });
    }
  });

  // AGENT 5: Viajes pendientes > 1 día
  trips.filter(tr => tr.status === "pending").forEach(tr => {
    const days = daysDiff(tr.date);
    if (days > 1) {
      const cl = clients.find(c => c.id === tr.clientId);
      alerts.push({ id: `pend-${tr.id}`, severity: "warning", category: "pending_trip", tripId: tr.id,
        msg: `Viaje #${tr.id} sigue pendiente hace ${days} días — ${cl?.companyName || "—"} → ${tr.municipality}` });
    }
  });

  // AGENT 6: Documentos / POD pendientes
  trips.filter(tr => tr.status === "delivered" && tr.docStatus === "pending").forEach(tr => {
    const cl = clients.find(c => c.id === tr.clientId);
    if (cl?.rules?.requiresDocuments || cl?.rules?.requiresPOD) {
      alerts.push({ id: `doc-${tr.id}`, severity: "warning", category: "docs", tripId: tr.id,
        msg: `Viaje #${tr.id} entregado pero documentos pendientes — ${cl?.companyName || "—"} (${tr.date})` });
    }
  });

  // Pre-built lookups for Agents 7, 8, 9
  const paidTripIds      = new Set(expenses.filter(e => e.category === "driverPay").map(e => e.tripId));
  const brokerFeeTripIds = new Set(expenses.filter(e => e.category === "broker_commission").map(e => e.tripId));
  const brokerMap        = new Map(brokers.map(b => [b.id, b]));
  const trucksByPartner  = trucks.reduce((m, tk) => { if (tk.partnerId) { const a = m.get(tk.partnerId) || []; a.push(tk.id); m.set(tk.partnerId, a); } return m; }, new Map());
  const tripsByDriver    = trips.reduce((m, tr) => { if (tr.driverId) { const a = m.get(tr.driverId) || []; a.push(tr); m.set(tr.driverId, a); } return m; }, new Map());

  // AGENT 7: Conductor por-viaje sin pago
  drivers.filter(d => d.salaryType === "perTrip" || d.salaryType === "porcentaje").forEach(driver => {
    (tripsByDriver.get(driver.id) || []).filter(tr => tr.status === "delivered").forEach(tr => {
      if (!paidTripIds.has(tr.id)) alerts.push({ id: `pay-${tr.id}`, severity: "warning", category: "payroll", tripId: tr.id,
        msg: `Conductor ${driver.name}: viaje #${tr.id} entregado sin pago de conductor registrado (${tr.date})` });
    });
  });

  // AGENT 8: Broker sin comisión
  trips.filter(tr => tr.brokerId && tr.status !== "cancelled" && tr.revenue > 0).forEach(tr => {
    if (!brokerFeeTripIds.has(tr.id)) {
      const br = brokerMap.get(tr.brokerId);
      alerts.push({ id: `brk-${tr.id}`, severity: "warning", category: "broker", tripId: tr.id,
        msg: `Viaje #${tr.id} tiene broker "${br?.name || "—"}" pero sin comisión deducida (${tr.date})` });
    }
  });

  // AGENT 9: Liquidaciones pendientes
  partners.forEach(p => {
    const pTruckIds  = trucksByPartner.get(p.id) || [];
    const pTruckSet  = new Set(pTruckIds);
    const unpaidTrips = trips.filter(tr => pTruckSet.has(tr.truckId) && tr.status === "delivered");
    if (unpaidTrips.length > 0) {
      const key = `${p.id}-${monthStr()}`;
      if (!settlementStatus[key] || settlementStatus[key] === "unpaid") {
        alerts.push({ id: `settle-${p.id}`, severity: "warning", category: "settlement",
          msg: `Socio ${p.name}: ${unpaidTrips.length} viaje(s) entregado(s) con liquidación pendiente este mes` });
      }
    }
  });

  // AGENT 10: CxP pendientes
  const cxpItems = expenses.filter(e => e.paymentMethod === "credit");
  if (cxpItems.length > 0) {
    const total = cxpItems.reduce((s, e) => s + e.amount, 0);
    alerts.push({ id: "cxp-total", severity: "info", category: "cxp",
      msg: `CxP: ${cxpItems.length} gasto(s) a crédito por pagar — Total: ${fmt(total)}` });
  }

  // AGENT 11: Camiones sin conductor
  trucks.forEach(tk => {
    const hasDriver = drivers.some(d => d.truckId === tk.id);
    if (!hasDriver) alerts.push({ id: `nodrv-${tk.id}`, severity: "info", category: "fleet",
      msg: `Camión ${tk.plate} (${tk.type}) no tiene conductor asignado` });
  });

  // AGENT 12: Clientes sin tarifario
  clients.filter(c => c.status === "active" && (!c.rates || c.rates.length === 0)).forEach(c => {
    alerts.push({ id: `norates-${c.id}`, severity: "info", category: "rates",
      msg: `Cliente "${c.companyName}" no tiene tarifario definido` });
  });

  // AGENT 13: Camión con gastos este mes pero sin viajes — unidad que cuesta sin producir
  const thisMonth13 = monthStr();
  const tripMap13 = new Map(trips.map(tr => [tr.id, tr]));
  trucks.forEach(tk => {
    const hasExp = expenses.some(e => expenseTruckId(e, tripMap13) === tk.id && (e.date || "").startsWith(thisMonth13));
    const hasTrips = trips.some(tr => tr.truckId === tk.id && (tr.date || "").startsWith(thisMonth13) && tr.status !== "cancelled");
    if (hasExp && !hasTrips) alerts.push({ id: `idle-${tk.id}`, severity: "warning", category: "fleet",
      msg: `Camión ${tk.plate} tiene gastos este mes pero 0 viajes — unidad con costo sin ingreso` });
  });

  return alerts;
}

// ─── Billing / Period Helpers ─────────────────────────────────────────────────
export const pad = n => String(n).padStart(2, "0");

export const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// Generates bimonthly payroll periods going back to the earliest date in `dates`.
// Each period is: half-1 = prev-month-30 → this-month-14, half-2 = 15→29.
export function genPeriods(dates = []) {
  const lastDayOf = (y, m) => new Date(y, m, 0).getDate();
  const now = new Date(); const day = now.getDate();
  let y = now.getFullYear(), m = now.getMonth() + 1, h;
  if (day >= 30) { if (m === 12) { y++; m = 1; } else { m++; } h = 1; }
  else { h = day >= 15 ? 2 : 1; }
  const earliest = [...dates].sort()[0] || `${y}-${pad(m)}-01`;
  const buildPd = (py, pm, ph) => {
    const mStr = `${py}-${pad(pm)}`;
    if (ph === 1) {
      const prevM = pm === 1 ? 12 : pm - 1, prevY = pm === 1 ? py - 1 : py;
      const startDay = Math.min(30, lastDayOf(prevY, prevM));
      return { year: py, month: pm, half: ph, mStr,
        dateFrom: `${prevY}-${pad(prevM)}-${pad(startDay)}`, dateTo: `${mStr}-14`,
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

export function getPeriodInfo(date, client) {
  const [y, m, d] = date.split("-").map(Number);
  const billing = client?.rules?.billingCycle;
  if (billing === "bimonthly_delayed") {
    const half = d <= 15 ? 1 : 2;
    const key = `${y}-${pad(m)}-h${half}`;
    if (half === 1) {
      const payDay = client.rules.period1PayDay || 30;
      return { key, label: `${MONTHS_ES[m-1]} 1–15, ${y}`, expectedDate: `${y}-${pad(m)}-${pad(payDay)}` };
    } else {
      const payDay = client.rules.period2PayDay || 15;
      const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
      return { key, label: `${MONTHS_ES[m-1]} 16–31, ${y}`, expectedDate: `${ny}-${pad(nm)}-${pad(payDay)}` };
    }
  } else {
    const key = `${y}-${pad(m)}`;
    const terms = client?.rules?.paymentTerms || 30;
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + terms);
    return { key, label: `${MONTHS_ES[m-1]} ${y}`, expectedDate: dt.toISOString().slice(0, 10) };
  }
}

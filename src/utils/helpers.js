// ─── Formatting Utilities ─────────────────────────────────────────────────────
export const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "DOP", minimumFractionDigits: 0 }).format(n);

export const pct = (n) => (n * 100).toFixed(1) + "%";

export const nxId = (arr) => (arr.length ? Math.max(...arr.map((x) => x.id)) + 1 : 1);

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

  // AGENT 7: Conductor por-viaje sin pago
  drivers.filter(d => d.salaryType === "perTrip" || d.salaryType === "porcentaje").forEach(driver => {
    trips.filter(tr => tr.driverId === driver.id && tr.status === "delivered").forEach(tr => {
      const hasPay = expenses.some(e => e.tripId === tr.id && e.category === "driverPay");
      if (!hasPay) alerts.push({ id: `pay-${tr.id}`, severity: "warning", category: "payroll", tripId: tr.id,
        msg: `Conductor ${driver.name}: viaje #${tr.id} entregado sin pago de conductor registrado (${tr.date})` });
    });
  });

  // AGENT 8: Broker sin comisión
  trips.filter(tr => tr.brokerId && tr.status !== "cancelled" && tr.revenue > 0).forEach(tr => {
    const hasFee = expenses.some(e => e.tripId === tr.id && e.category === "broker_commission");
    if (!hasFee) {
      const br = brokers.find(b => b.id === tr.brokerId);
      alerts.push({ id: `brk-${tr.id}`, severity: "warning", category: "broker", tripId: tr.id,
        msg: `Viaje #${tr.id} tiene broker "${br?.name || "—"}" pero sin comisión deducida (${tr.date})` });
    }
  });

  // AGENT 9: Liquidaciones pendientes
  partners.forEach(p => {
    const pTruckIds = trucks.filter(tk => tk.partnerId === p.id).map(tk => tk.id);
    const unpaidTrips = trips.filter(tr => pTruckIds.includes(tr.truckId) && tr.status === "delivered");
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

  return alerts;
}

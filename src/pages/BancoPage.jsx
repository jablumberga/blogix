import { useState, useMemo } from "react";
import { Landmark, TrendingUp, TrendingDown, ArrowUp, ArrowDownToLine, CheckCircle2, Circle, Settings, X } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt, today, nxId } from "../utils/helpers.js";
import { Card, StatCard, PageHeader, Th, Td, Badge } from "../components/ui/index.jsx";
import ProfitFirstPanel from "../components/ProfitFirstPanel.jsx";

const FILTER_OPTS   = ["todos", "pendientes", "conciliados", "debitos", "creditos"];
const FILTER_LABELS = { todos: "Todos", pendientes: "Pendientes", conciliados: "Conciliados", debitos: "Solo Débitos", creditos: "Solo Créditos" };

export default function BancoPage({ expenses, setExpenses, cobros, clients, invoices = [], bankAccount, setBankAccount, bankReconciliation, setBankReconciliation, pfSettings, setPfSettings, isMobile }) {
  const [filter, setFilter]           = useState("todos");
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft]             = useState(null);
  const [wd, setWd] = useState(null); // retiro en edición: { date, amount, kind, description }
  const saveWithdrawal = () => {
    const amount = Number(wd?.amount) || 0;
    if (!(amount > 0) || !wd.date) { window.alert("Indica fecha y monto mayor que 0."); return; }
    const category = wd.kind === "reserve" ? "reserve_withdrawal" : "cash_withdrawal";
    if (wd.kind === "reserve" && !window.confirm(`Retirar ${fmt(amount)} de la RESERVA (owner's comp / profit / tax). Profit First: solo si es un retiro planificado del dueño o pago de impuestos. ¿Continuar?`)) return;
    setExpenses(prev => [...prev, { id: nxId(prev), category, amount, date: wd.date, paidDate: wd.date, status: "paid", paymentMethod: "transfer", tripId: null, truckId: null, supplierId: null,
      description: wd.description || (wd.kind === "reserve" ? "Retiro de Reserva" : "Retiro a caja") }]);
    setWd(null);
  };

  const clientMap = useMemo(() => new Map((clients || []).map(c => [c.id, c])), [clients]);

  const movements = useMemo(() => {
    const openingDate = bankAccount?.openingDate || "1900-01-01";
    const debits = (expenses || [])
      .filter(e => ["transfer", "check"].includes(e.paymentMethod) && e.status === "paid" && (e.date || "") >= openingDate)
      .map(e => ({
        key: `expense-${e.id}`,
        type: "debit",
        date: e.date || "",
        description: e.description || `Gasto #${e.id}`,
        amount: e.amount || 0,
      }));
    const credits = (cobros || [])
      .filter(c => (c.status === "collected" || c.status === "partial") && c.method !== "cash" && (c.collectedDate || c.pf?.at || c.date || "") >= openingDate) // efectivo no entra al banco
      .map(c => {
        const cl = clientMap.get(c.clientId);
        return {
          key: `cobro-${c.id}`,
          type: "credit",
          date: c.collectedDate || c.pf?.at || c.date || "",
          description: c.description || `Cobro ${(invoices || []).find(i => i.id === c.invoiceId)?.invoiceNumber || ""}${cl ? ` — ${cl.companyName}` : ""}`.trim() || `Cobro #${c.id}`,
          amount: c.amount || 0,
        };
      });
    return [...debits, ...credits].sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, cobros, invoices, clientMap, bankAccount?.openingDate]);

  const { saldoConciliado, saldoProyectado, debitosPendientes, creditosPendientes } = useMemo(() => {
    const opening = bankAccount?.openingBalance || 0;
    let sC = opening, sP = opening, dP = 0, cP = 0;
    movements.forEach(m => {
      const ok = bankReconciliation?.[m.key] === "reconciled";
      if (m.type === "credit") {
        sP += m.amount;
        if (ok) sC += m.amount; else cP += m.amount;
      } else {
        sP -= m.amount;
        if (ok) sC -= m.amount; else dP += m.amount;
      }
    });
    return { saldoConciliado: sC, saldoProyectado: sP, debitosPendientes: dP, creditosPendientes: cP };
  }, [movements, bankReconciliation, bankAccount?.openingBalance]);

  const filtered = useMemo(() => {
    if (filter === "pendientes")  return movements.filter(m => bankReconciliation?.[m.key] !== "reconciled");
    if (filter === "conciliados") return movements.filter(m => bankReconciliation?.[m.key] === "reconciled");
    if (filter === "debitos")     return movements.filter(m => m.type === "debit");
    if (filter === "creditos")    return movements.filter(m => m.type === "credit");
    return movements;
  }, [movements, filter, bankReconciliation]);

  const toggle = (key) => {
    setBankReconciliation(prev => {
      const next = { ...prev };
      if (next[key] === "reconciled") delete next[key]; else next[key] = "reconciled";
      return next;
    });
  };

  const reconcileAllVisible = () => {
    setBankReconciliation(prev => {
      const next = { ...prev };
      filtered.forEach(m => { next[m.key] = "reconciled"; });
      return next;
    });
  };

  const inp = { padding: "5px 9px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 12, width: "100%", boxSizing: "border-box" };
  const hasPending = filtered.some(m => bankReconciliation?.[m.key] !== "reconciled");

  return (
    <div>
      <PageHeader title="Banco" />
      <ProfitFirstPanel cobros={cobros} expenses={expenses} pfSettings={pfSettings} setPfSettings={setPfSettings} setBankAccount={setBankAccount} isMobile={isMobile} />

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button onClick={() => setWd(wd ? null : { date: today(), amount: "", kind: "cash", description: "" })} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${colors.border}`, background: wd ? "transparent" : colors.accent, color: wd ? colors.textMuted : "white", cursor: "pointer", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}><ArrowDownToLine size={13} /> {wd ? "Cancelar" : "Registrar retiro"}</button>
      </div>
      {wd && <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Retiro de la cuenta</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr) auto", gap: 10, alignItems: "end" }}>
          <div><div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Fecha</div><input type="date" style={inp} value={wd.date} onChange={e => setWd({ ...wd, date: e.target.value })} /></div>
          <div><div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Monto (DOP)</div><input type="number" style={inp} value={wd.amount} onChange={e => setWd({ ...wd, amount: e.target.value })} /></div>
          <div><div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Tipo</div>
            <select style={inp} value={wd.kind} onChange={e => setWd({ ...wd, kind: e.target.value })}><option value="cash">A caja (efectivo para gastos)</option><option value="reserve">De la Reserva (dueño / impuestos)</option></select></div>
          <div><div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Concepto</div><input style={inp} value={wd.description} onChange={e => setWd({ ...wd, description: e.target.value })} placeholder="opcional" /></div>
          <button onClick={saveWithdrawal} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: colors.green, color: "white", fontWeight: 700, cursor: "pointer" }}>Guardar</button>
        </div>
        <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 8 }}>A caja: sale del banco pero no toca OpEx hasta que registres cada gasto en efectivo. De la Reserva: baja la cuenta Reserva del Profit First.</div>
      </Card>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 12, marginBottom: 16 }}>
        <StatCard icon={Landmark}     label="Saldo Conciliado"    value={fmt(saldoConciliado)}   color={saldoConciliado >= 0 ? colors.green : colors.red} />
        <StatCard icon={TrendingUp}   label="Saldo Proyectado"    value={fmt(saldoProyectado)}   color={colors.accent} />
        <StatCard icon={TrendingDown} label="Débitos Pendientes"  value={fmt(debitosPendientes)} color={colors.orange} />
        <StatCard icon={ArrowUp}      label="Créditos Pendientes" value={fmt(creditosPendientes)} color={colors.cyan} />
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            {bankAccount?.name || "Cuenta Principal"}
            {bankAccount?.bank ? <span style={{ fontWeight: 400, color: colors.textMuted, marginLeft: 8, fontSize: 12 }}>{bankAccount.bank}</span> : null}
          </span>
          <button
            onClick={() => {
              if (showSettings) { setShowSettings(false); setDraft(null); }
              else { setShowSettings(true); setDraft({ ...bankAccount }); }
            }}
            style={{ background: "transparent", border: "none", color: colors.textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
          >
            {showSettings ? <X size={13} /> : <Settings size={13} />}
            {showSettings ? "Cancelar" : "Configurar"}
          </button>
        </div>

        {!showSettings && (
          <div style={{ marginTop: 6, display: "flex", gap: 20, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: colors.textMuted }}>Saldo inicial: <strong style={{ color: colors.text }}>{fmt(bankAccount?.openingBalance || 0)}</strong></span>
            {bankAccount?.openingDate && <span style={{ fontSize: 12, color: colors.textMuted }}>Desde: {bankAccount.openingDate}</span>}
          </div>
        )}

        {showSettings && draft && (
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Nombre de cuenta</div>
              <input style={inp} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Banco</div>
              <input style={inp} value={draft.bank} onChange={e => setDraft(d => ({ ...d, bank: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Saldo inicial (DOP)</div>
              <input type="number" style={inp} value={draft.openingBalance} onChange={e => setDraft(d => ({ ...d, openingBalance: Number(e.target.value) }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Fecha de corte inicial</div>
              <input type="date" style={inp} value={draft.openingDate} onChange={e => setDraft(d => ({ ...d, openingDate: e.target.value }))} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                onClick={() => { setBankAccount(draft); setShowSettings(false); setDraft(null); }}
                style={{ padding: "6px 18px", borderRadius: 6, border: "none", background: colors.accent, color: "white", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
              >
                Guardar
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {FILTER_OPTS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "4px 11px", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: filter === f ? colors.accent : colors.inputBg, color: filter === f ? "white" : colors.textMuted, transition: "background 0.15s" }}>
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
          {hasPending && (
            <button onClick={reconcileAllVisible} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${colors.green}`, background: "transparent", color: colors.green, cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
              ✓ Conciliar Todos los Visibles
            </button>
          )}
        </div>

        {filtered.length === 0
          ? <div style={{ textAlign: "center", padding: 32, color: colors.textMuted }}>Sin movimientos para el filtro seleccionado.</div>
          : <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <Th>Fecha</Th>
                <Th>Descripción</Th>
                <Th align="center">Tipo</Th>
                <Th align="right">Monto</Th>
                <Th align="center">Estado</Th>
                <Th align="center">Acción</Th>
              </tr></thead>
              <tbody>
                {filtered.map(m => {
                  const reconciled = bankReconciliation?.[m.key] === "reconciled";
                  const isCredit   = m.type === "credit";
                  return (
                    <tr key={m.key} style={{ borderBottom: `1px solid ${colors.border}11`, opacity: reconciled ? 0.65 : 1 }}>
                      <Td>{m.date}</Td>
                      <Td>{m.description}</Td>
                      <Td align="center">
                        <Badge label={isCredit ? "Crédito" : "Débito"} color={isCredit ? colors.green : colors.orange} />
                      </Td>
                      <Td align="right" bold color={isCredit ? colors.green : colors.orange}>
                        {isCredit ? "+" : "−"} {fmt(m.amount)}
                      </Td>
                      <Td align="center">
                        <Badge label={reconciled ? "Conciliado" : "Pendiente"} color={reconciled ? colors.accent : colors.textMuted} />
                      </Td>
                      <Td align="center">
                        <button
                          onClick={() => toggle(m.key)}
                          style={{ background: "transparent", border: `1px solid ${reconciled ? colors.textMuted : colors.green}`, color: reconciled ? colors.textMuted : colors.green, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}
                        >
                          {reconciled ? <Circle size={11} /> : <CheckCircle2 size={11} />}
                          {reconciled ? "Deshacer" : "Conciliar"}
                        </button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        }
      </Card>
    </div>
  );
}

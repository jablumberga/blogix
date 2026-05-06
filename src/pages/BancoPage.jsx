import { useState, useMemo } from "react";
import { Landmark, TrendingUp, TrendingDown, ArrowUp, CheckCircle2, Circle, Settings, X } from "lucide-react";
import { colors } from "../constants/theme.js";
import { fmt } from "../utils/helpers.js";
import { Card, StatCard, PageHeader, Th, Td, Badge } from "../components/ui/index.jsx";

const FILTER_OPTS   = ["todos", "pendientes", "conciliados", "debitos", "creditos"];
const FILTER_LABELS = { todos: "Todos", pendientes: "Pendientes", conciliados: "Conciliados", debitos: "Solo Débitos", creditos: "Solo Créditos" };

export default function BancoPage({ expenses, cobros, clients, bankAccount, setBankAccount, bankReconciliation, setBankReconciliation }) {
  const [filter, setFilter]           = useState("todos");
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft]             = useState(null);

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
      .filter(c => c.status === "collected" && (c.collectedDate || c.date || "") >= openingDate)
      .map(c => {
        const cl = clientMap.get(c.clientId);
        return {
          key: `cobro-${c.id}`,
          type: "credit",
          date: c.collectedDate || c.date || "",
          description: c.description || (cl ? `Cobro — ${cl.companyName}` : `Cobro #${c.id}`),
          amount: c.amount || 0,
        };
      });
    return [...debits, ...credits].sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, cobros, clientMap, bankAccount?.openingDate]);

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

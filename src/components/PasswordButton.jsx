import { useState } from "react";
import { KeyRound } from "lucide-react";
import { colors } from "../constants/theme.js";
import { setPassword } from "../api.js";

/**
 * Cambiar contraseña de un chofer / socio / usuario: acción dedicada al servidor
 * (la contraseña nunca pasa por el autoguardado ni se guarda en texto plano).
 */
export default function PasswordButton({ table, id, name, title = "Cambiar contraseña" }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const pw = window.prompt(`Nueva contraseña para ${name}:`);
    if (pw === null) return;
    if (pw.trim().length < 4) { window.alert("La contraseña debe tener al menos 4 caracteres."); return; }
    setBusy(true);
    const r = await setPassword({ table, id, password: pw.trim() });
    setBusy(false);
    window.alert(r.ok ? `Contraseña de ${name} actualizada.` : `No se cambió: ${r.error}`);
  };
  return <button type="button" onClick={run} disabled={busy} title={title} style={{ padding: "10px", minHeight: 44, minWidth: 44, border: "none", background: "transparent", color: colors.orange, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.5 : 1 }}><KeyRound size={12} /></button>;
}

// Datos para los mensajes de WhatsApp (ver whatsappTemplates.js) a partir de las filas de nómina.
import { COMPANY } from "../constants/company.js";

const dmy = (x) => { const [y, m, d] = String(x || "").split("-"); return y ? `${d}/${m}` : ""; };
const money = (n) => `RD$${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Relación de pago de un ayudante directo (fila de buildHelperPayroll + su pago). */
export function helperWaData(row, pay, period) {
  return {
    name: row.ayudante?.name || "", period: period?.label || "", company: COMPANY.brand || "B-Logix",
    trips: row.tripCount, gross: row.gross, advances: row.advances, net: row.net, paid: !!pay?.paid,
    lines: (row.trips || []).map(x => `• ${dmy(x.trip?.date)} · ${x.trip?.municipality || ""} · ${money(x.amount)}`),
  };
}

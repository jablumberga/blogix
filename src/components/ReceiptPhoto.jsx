import { useEffect, useState } from "react";
import { X, ImageOff } from "lucide-react";
import { colors } from "../constants/theme.js";
import { receiptPhotoUrl } from "../utils/receiptsApi.js";

/** Foto de un recibo (se pide con la sesión, por eso no es un <img src> directo). Al tocarla se ve en grande. */
export default function ReceiptPhoto({ id, height = 64, width, style, zoomable = true }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(false);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl(null); setErr(false);
    receiptPhotoUrl(id).then(u => { if (alive) setUrl(u); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [id]);
  const box = { height, width: width || Math.round(height * 0.75), borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.inputBg, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, ...style };
  if (err) return <div style={box} title="No se pudo cargar la foto"><ImageOff size={16} color={colors.textMuted} /></div>;
  if (!url) return <div style={{ ...box, fontSize: 10, color: colors.textMuted }}>…</div>;
  return <>
    <button type="button" onClick={() => zoomable && setZoom(true)} style={{ ...box, padding: 0, cursor: zoomable ? "zoom-in" : "default" }} title="Ver foto" data-receipt-photo={id}>
      <img src={url} alt="Foto del recibo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </button>
    {zoom && <div onClick={() => setZoom(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <img src={url} alt="Foto del recibo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
      <button type="button" onClick={() => setZoom(false)} aria-label="Cerrar" style={{ position: "fixed", top: 12, right: 12, width: 44, height: 44, borderRadius: 22, border: "none", background: "rgba(255,255,255,0.15)", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={20} /></button>
    </div>}
  </>;
}

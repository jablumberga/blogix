/**
 * Pago de choferes: tarifarios múltiples y UNA sola fórmula para todo el app.
 *
 * driver.payType: "perTrip" | "fixed" | "percentage"
 *   (se aceptan los nombres viejos salaryType "porcentaje" = "percentage")
 * driver.rateSheets: [{ id, name, clientId|null, rates: [{ province, municipality,
 *   priceT1, dietaT1, helperT1, priceT2, dietaT2, helperT2 }] }]
 *   El tarifario con clientId del viaje gana; si no hay, el general (clientId null).
 *
 * Ayudantes: por defecto T1 = 1 y T2 = 2, pero el viaje puede traer
 * numHelpers (0, 1, 2…) y helperPayEach para sobreescribir.
 *
 * Dieta: la del tarifario es la dieta TOTAL del equipo y se reparte en partes iguales entre el chofer y los
 * ayudantes que fueron (T1 con 1 ayudante: mitad y mitad; T2 con 2: un tercio cada uno; sin ayudantes: toda al
 * chofer). El residuo de la división queda con el chofer. helperPayEach del viaje, si viene, ya incluye la
 * parte de dieta del ayudante (es lo que se le paga en total).
 *
 * Destino con tarifa solo para un tamaño (p. ej. solo T1) usado con el otro camión: se usa esa tarifa completa
 * (precio, dieta y ayudante) y calc.sizeFallback lo indica.
 */

export const PAY_TYPES = {
  perTrip:    { label: "Por viaje (tarifario)" },
  fixed:      { label: "Salario fijo (quincenal)" },
  percentage: { label: "Porcentaje del viaje" },
};

export const DEFAULT_HELPERS = { T1: 1, T2: 2 };

export function normalizeDriver(d) {
  if (!d) return d;
  const payType = d.payType || (d.salaryType === "porcentaje" ? "percentage" : d.salaryType) || "perTrip";
  let rateSheets = d.rateSheets;
  if (!Array.isArray(rateSheets)) {
    rateSheets = (d.rates && d.rates.length) ? [{ id: 1, name: "General", clientId: null, rates: d.rates }] : [];
  }
  return { status: "active", ...d, payType, rateSheets };
}

/** Tarifario que aplica para un cliente: el específico del cliente, o el general. */
export function getRateSheet(driver, clientId) {
  const d = normalizeDriver(driver);
  const sheets = d.rateSheets || [];
  if (clientId != null) {
    const specific = sheets.find(s => s.clientId != null && Number(s.clientId) === Number(clientId));
    if (specific) return specific;
  }
  return sheets.find(s => s.clientId == null) || sheets[0] || null;
}

export function findRate(sheet, province, municipality) {
  if (!sheet) return null;
  return (sheet.rates || []).find(r => r.province === province && r.municipality === municipality) || null;
}

/** Tamaño para la TARIFA DEL CLIENTE: override T1/T2 del viaje, si no el del camión. */
export function tripSize(trip, truck) {
  const ov = trip?.tarifaOverride;
  if (ov === "T1" || ov === "T2") return ov;
  return truck?.size === "T2" ? "T2" : "T1";
}
/**
 * Tamaño para la NÓMINA: siempre el del camión con el que se hizo el viaje. No importa qué camión tenga
 * asignado el chofer ni si al cliente se le cobró con otra tarifa: si viajó en T2 cobra T2, y viceversa.
 */
export function paySize(trip, truck) {
  return truck?.size === "T2" ? "T2" : "T1";
}

/**
 * Calcula el pago del chofer y de los ayudantes de un viaje.
 * Devuelve null si el chofer es por viaje y no hay tarifa para ese destino.
 *
 * { size, base, dieta, driverGross, discounts, driverNet,
 *   numHelpers, helperEach, helpersTotal, total, rateFound, sheetName }
 */
export function calcDriverPay({ driver, trip, truck, clientId }) {
  const d = normalizeDriver(driver);
  const size = paySize(trip, truck);
  // Socio-chofer: el camión es suyo y cobra por la liquidación del socio (comisión), no por nómina. Nada para él ni ayudantes.
  if (d.partnerDriver) {
    return { size, base: 0, dieta: 0, dietaTotal: 0, dietaEach: 0, driverGross: 0, driverFixed: false, discounts: 0, driverNet: 0, numHelpers: 0, helperBase: 0, helperEach: 0, helperPays: [], helperDiscounts: 0, helpersTotal: 0,
      crew: [{ role: "Chofer", base: 0, dieta: 0, total: 0, discount: 0, net: 0, fixed: false }], total: 0, rateFound: true, sheetName: null, sizeFallback: false, payType: d.payType, partnerDriver: true };
  }
  // Descuentos: cada uno dice a quién va (who: "driver" | "helper:<i>"); sin who = al chofer (como siempre)
  // Un descuento con type "credit" es un reembolso/bono: SUMA en vez de restar (peaje que pagó el chofer, bono, etc.)
  const discountsOf = (who) => (trip?.discounts || []).filter(x => (x?.who || "driver") === who).reduce((s, x) => s + (x?.type === "credit" ? -1 : 1) * (Number(x.amount) || 0), 0);
  const discounts = discountsOf("driver");
  const revenue = Number(trip?.revenue) || 0;

  let base = 0, dietaTotal = 0, helperBase = 0, rateFound = true, sheetName = null, sizeFallback = false;
  if (d.payType === "perTrip") {
    const sheet = getRateSheet(d, clientId ?? trip?.clientId);
    const rate = findRate(sheet, trip?.province, trip?.municipality);
    sheetName = sheet?.name || null;
    if (!rate) rateFound = false;
    else {
      let t2 = size === "T2";
      // Ruta con tarifa solo para el otro tamaño: se usa esa tarifa completa (precio, dieta y ayudante)
      if (!(Number(t2 ? rate.priceT2 : rate.priceT1) > 0) && Number(t2 ? rate.priceT1 : rate.priceT2) > 0) { t2 = !t2; sizeFallback = true; }
      base       = Number(t2 ? rate.priceT2  : rate.priceT1)  || 0;
      dietaTotal = Number(t2 ? rate.dietaT2  : rate.dietaT1)  || 0;
      helperBase = Number(t2 ? rate.helperT2 : rate.helperT1) || 0;
    }
  } else if (d.payType === "percentage") {
    base = Math.round(revenue * (Number(d.percentageAmount) || 0) / 100);
  } else {
    base = 0; // fijo: se paga por quincena, no por viaje
  }

  // Ayudantes: el viaje manda; si no dice nada, el default por tamaño
  const numHelpers = trip?.numHelpers != null && trip.numHelpers !== "" ? Math.max(0, Number(trip.numHelpers) || 0) : DEFAULT_HELPERS[size];
  // Dieta total repartida en partes iguales entre chofer y ayudantes; el residuo queda con el chofer
  const dietaEach = numHelpers > 0 ? Math.floor(dietaTotal / (numHelpers + 1)) : 0;
  const dieta = dietaTotal - dietaEach * numHelpers;
  let helperEach = helperBase + dietaEach;
  const helperOverride = trip?.helperPayEach != null && trip.helperPayEach !== "";
  if (helperOverride) helperEach = Number(trip.helperPayEach) || 0;
  // Pago fijado a mano por ayudante (helperPayOverrides[i]) y descuentos de cada ayudante
  const overrides = Array.isArray(trip?.helperPayOverrides) ? trip.helperPayOverrides : [];
  const helperLines = [];
  for (let i = 0; i < numHelpers; i++) {
    const ov = overrides[i]; const fixed = ov != null && ov !== "";
    const pay = fixed ? Number(ov) || 0 : helperEach; const discount = discountsOf(`helper:${i}`);
    helperLines.push({ pay, discount, net: Math.max(0, pay - discount), fixed: fixed || helperOverride });
  }
  const helperPays = helperLines.map(l => l.net);
  const helpersTotal = helperPays.reduce((s, n) => s + n, 0);
  const helperDiscounts = helperLines.reduce((s, l) => s + l.discount, 0);

  // Pago del chofer fijado a mano en el viaje (chofer + su dieta): la dieta se mantiene, la base es el resto
  const dpo = trip?.driverPayOverride; const driverFixed = dpo != null && dpo !== "";
  let driverGross = base + dieta;
  if (driverFixed) { driverGross = Number(dpo) || 0; base = Math.max(0, driverGross - dieta); }
  const driverNet = Math.max(0, driverGross - discounts);
  // Tripulación SIEMPRE separada: chofer, ayudante 1, ayudante 2… cada uno con su base y su parte de la dieta
  const crew = [{ role: "Chofer", base, dieta, total: driverGross, discount: discounts, net: driverNet, fixed: driverFixed }];
  helperLines.forEach((l, i) => crew.push({ role: `Ayudante ${i + 1}`, base: l.fixed ? l.pay : helperBase, dieta: l.fixed ? 0 : dietaEach, total: l.pay, discount: l.discount, net: l.net, fixed: l.fixed }));
  return { size, base, dieta, dietaTotal, dietaEach, driverGross, driverFixed, discounts, driverNet, numHelpers, helperBase, helperEach, helperPays, helperDiscounts, helpersTotal, crew, total: driverNet + helpersTotal, rateFound, sheetName, sizeFallback, payType: d.payType };
}

const money = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
/** «1,300 + dieta 333» (o solo «1,300» si no hay dieta). */
export const crewPartText = (line) => `${line?.dieta ? `${money(line.base)} + dieta ${money(line.dieta)}` : money(line?.base)}${line?.fixed ? " (fijado)" : ""}${line?.discount > 0 ? ` − desc. ${money(line.discount)}` : line?.discount < 0 ? ` + reemb. ${money(-line.discount)}` : ""}`;
/** Texto del gasto del chofer: «Chofer Rober: 1,700 + dieta 334 · Dajabón». */
export function driverPayText(calc, driverName, where) {
  const c = calc?.crew?.[0];
  return `Chofer ${driverName || ""}: ${c ? crewPartText(c) : money(calc?.driverNet)}${where ? ` · ${where}` : ""}`;
}
/** Texto de los ayudantes que van por el chofer: «Ayudante 1: 1,300 + dieta 333 · Ayudante 2: … · Dajabón». */
export function helpersPayText(calc, count, where, fromIndex = 0) {
  const lines = (calc?.crew || []).slice(1 + fromIndex, 1 + fromIndex + count);
  const txt = lines.length ? lines.map(l => `${l.role}: ${crewPartText(l)}`).join(" · ") : `Ayudantes (${count})`;
  return `${txt}${where ? ` · ${where}` : ""}`;
}
/** Texto de un ayudante directo: «Ayudante Jeffrey: 1,300 + dieta 333 · Dajabón». */
export function helperDirectText(calc, name, where, idx = 0) {
  const l = calc?.crew?.[1 + idx];
  return `Ayudante ${name || ""}: ${l ? crewPartText(l) : money(calc?.helperEach)}${where ? ` · ${where}` : ""}`;
}

/**
 * Tripulación del viaje, una línea por persona, siempre separada: chofer, ayudante 1, ayudante 2…
 * Cada línea: { role: "chofer"|"ayudante", idx, name, base, dieta, total, direct, ayudanteId }
 *   chofer:   base + su parte de dieta = neto (sin descuentos)
 *   ayudante: base + su parte de dieta = pago (helperEach); si el viaje fijó el pago a mano, base = pago − dieta
 */
export function tripCrew(trip, calc, driver) {
  if (!calc) return [];
  const lines = Array.isArray(trip?.helpers) ? trip.helpers : [];
  const names = Array.isArray(trip?.helperNames) ? trip.helperNames : [];
  const c0 = calc.crew?.[0];
  const out = [{ role: "chofer", idx: 0, name: driver?.name || "Chofer", base: calc.base, dieta: calc.dieta, total: calc.base + calc.dieta, discount: calc.discounts || 0, net: calc.driverNet, fixed: !!calc.driverFixed, direct: false, ayudanteId: null }];
  for (let i = 0; i < (calc.numHelpers || 0); i++) {
    const l = lines[i] || {};
    const direct = !!(l.direct && l.ayudanteId != null && l.ayudanteId !== "");
    const cl = calc.crew?.[i + 1];
    const dieta = cl ? cl.dieta : (calc.dietaEach || 0);
    const total = cl ? cl.total : calc.helperEach;
    out.push({ role: "ayudante", idx: i + 1, name: String(l.name || names[i] || "").trim() || `Ayudante ${i + 1}`, base: cl ? cl.base : Math.max(0, total - dieta), dieta, total, discount: cl?.discount || 0, net: cl ? cl.net : total, fixed: !!cl?.fixed, direct, ayudanteId: direct ? Number(l.ayudanteId) : null });
  }
  void c0;
  return out;
}

/** Descripción corta para el gasto de nómina. */
export function describeDriverPay(calc, driver) {
  const d = normalizeDriver(driver);
  if (d.payType === "percentage") return `Nómina (${d.percentageAmount || 0}%): ${d.name}`;
  const parts = [`Nómina por viaje ${calc.size}: ${d.name}`];
  if (calc.dieta) parts.push(calc.dietaEach ? `dieta ${calc.dieta} (de ${calc.dietaTotal} repartida)` : `dieta ${calc.dieta}`);
  if (calc.numHelpers) parts.push(`${calc.numHelpers} ayud. × ${calc.helperEach}${calc.dietaEach ? ` (incl. dieta ${calc.dietaEach})` : ""}`);
  return parts.join(" · ");
}

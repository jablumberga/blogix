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

/** Tamaño efectivo del viaje: override T1/T2 del viaje, si no el del camión. */
export function tripSize(trip, truck) {
  const ov = trip?.tarifaOverride;
  if (ov === "T1" || ov === "T2") return ov;
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
  const size = tripSize(trip, truck);
  const discounts = (trip?.discounts || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
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
  if (trip?.helperPayEach != null && trip.helperPayEach !== "") helperEach = Number(trip.helperPayEach) || 0;
  const helpersTotal = numHelpers * helperEach;

  const driverGross = base + dieta;
  const driverNet = Math.max(0, driverGross - discounts);
  return { size, base, dieta, dietaTotal, dietaEach, driverGross, discounts, driverNet, numHelpers, helperBase, helperEach, helpersTotal, total: driverNet + helpersTotal, rateFound, sheetName, sizeFallback, payType: d.payType };
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

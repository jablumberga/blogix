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

  let base = 0, dieta = 0, helperEach = 0, rateFound = true, sheetName = null;
  if (d.payType === "perTrip") {
    const sheet = getRateSheet(d, clientId ?? trip?.clientId);
    const rate = findRate(sheet, trip?.province, trip?.municipality);
    sheetName = sheet?.name || null;
    if (!rate) rateFound = false;
    else {
      const t2 = size === "T2";
      base       = Number(t2 ? rate.priceT2  : rate.priceT1)  || 0;
      dieta      = Number(t2 ? rate.dietaT2  : rate.dietaT1)  || 0;
      helperEach = Number(t2 ? rate.helperT2 : rate.helperT1) || 0;
      // Ruta solo-T1 usada con camión T2 (o al revés): cae al otro precio
      if (base === 0) { base = Number(t2 ? rate.priceT1 : rate.priceT2) || 0; }
    }
  } else if (d.payType === "percentage") {
    base = Math.round(revenue * (Number(d.percentageAmount) || 0) / 100);
  } else {
    base = 0; // fijo: se paga por quincena, no por viaje
  }

  // Ayudantes: el viaje manda; si no dice nada, el default por tamaño
  const numHelpers = trip?.numHelpers != null && trip.numHelpers !== "" ? Math.max(0, Number(trip.numHelpers) || 0) : DEFAULT_HELPERS[size];
  if (trip?.helperPayEach != null && trip.helperPayEach !== "") helperEach = Number(trip.helperPayEach) || 0;
  const helpersTotal = numHelpers * helperEach;

  const driverGross = base + dieta;
  const driverNet = Math.max(0, driverGross - discounts);
  return { size, base, dieta, driverGross, discounts, driverNet, numHelpers, helperEach, helpersTotal, total: driverNet + helpersTotal, rateFound, sheetName, payType: d.payType };
}

/** Descripción corta para el gasto de nómina. */
export function describeDriverPay(calc, driver) {
  const d = normalizeDriver(driver);
  if (d.payType === "percentage") return `Nómina (${d.percentageAmount || 0}%): ${d.name}`;
  const parts = [`Nómina por viaje ${calc.size}: ${d.name}`];
  if (calc.dieta) parts.push(`dieta ${calc.dieta}`);
  if (calc.numHelpers) parts.push(`${calc.numHelpers} ayud. × ${calc.helperEach}`);
  return parts.join(" · ");
}

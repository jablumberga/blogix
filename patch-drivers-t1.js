// ─────────────────────────────────────────────────────────────────────────────
// PATCH: Tarifario T1 → Luis Alberto, Joan, Emil, Rober
// + Recalculo del viaje del día 30 de Emil con nuevo esquema perTrip
//
// INSTRUCCIONES:
//   1. Abre el app en el navegador (sesión de admin)
//   2. Abre DevTools → Console
//   3. Pega y ejecuta este script completo
//   4. Recarga la página — los cambios quedan guardados
// ─────────────────────────────────────────────────────────────────────────────

const T1_RATES = [
  { province: "Santiago",               municipality: "Santiago de los Caballeros", priceT1: 900,  helperT1: 700,  dietaT1: 0,   priceT2: 1200, helperT2: 750,  dietaT2: 0    },
  { province: "Espaillat",              municipality: "Moca",                       priceT1: 1000, helperT1: 700,  dietaT1: 0,   priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Santiago",               municipality: "Navarrete",                  priceT1: 1000, helperT1: 700,  dietaT1: 0,   priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "La Vega",                municipality: "La Vega",                    priceT1: 1000, helperT1: 700,  dietaT1: 0,   priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Valverde",               municipality: "Esperanza",                  priceT1: 1100, helperT1: 700,  dietaT1: 300, priceT2: 1300, helperT2: 800,  dietaT2: 0    },
  { province: "Hermanas Mirabal",       municipality: "Salcedo",                    priceT1: 1100, helperT1: 700,  dietaT1: 300, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Monseñor Nouel",         municipality: "Bonao",                      priceT1: 1300, helperT1: 800,  dietaT1: 300, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "La Vega",                municipality: "Jarabacoa",                  priceT1: 1400, helperT1: 800,  dietaT1: 300, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Sánchez Ramírez",        municipality: "Cotuí",                      priceT1: 1400, helperT1: 800,  dietaT1: 300, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Duarte",                 municipality: "San Francisco de Macorís",   priceT1: 1400, helperT1: 800,  dietaT1: 300, priceT2: 1700, helperT2: 900,  dietaT2: 300  },
  { province: "Valverde",               municipality: "Mao",                        priceT1: 1400, helperT1: 800,  dietaT1: 300, priceT2: 1600, helperT2: 900,  dietaT2: 300  },
  { province: "Puerto Plata",           municipality: "Puerto Plata",               priceT1: 1700, helperT1: 900,  dietaT1: 400, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Puerto Plata",           municipality: "Cabarete",                   priceT1: 1800, helperT1: 900,  dietaT1: 400, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "María Trinidad Sánchez", municipality: "Nagua",                      priceT1: 1800, helperT1: 900,  dietaT1: 400, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "La Vega",                municipality: "Constanza",                  priceT1: 1900, helperT1: 1000, dietaT1: 400, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Dajabón",                municipality: "Dajabón",                    priceT1: 2000, helperT1: 1000, dietaT1: 500, priceT2: 2500, helperT2: 1200, dietaT2: 600  },
  { province: "Samaná",                 municipality: "Santa Bárbara de Samaná",    priceT1: 2200, helperT1: 1000, dietaT1: 500, priceT2: 0,    helperT2: 0,    dietaT2: 0    },
  { province: "Independencia",          municipality: "Jimaní",                     priceT1: 0,    helperT1: 0,    dietaT1: 0,   priceT2: 4000, helperT2: 1500, dietaT2: 1000 },
];

// Drivers a los que se les agrega el tarifario
const TARGET_NAMES = ["luis alberto", "joan", "emil", "rober"];
const EMIL_NAME    = "emil";

// ── Leer datos actuales ───────────────────────────────────────────────────────
const raw = localStorage.getItem("blogix_data");
if (!raw) { console.error("❌ No se encontró blogix_data en localStorage. Asegúrate de estar logueado en el app."); throw new Error("no data"); }
const data = JSON.parse(raw);

// ── Asignar rates a cada driver objetivo ──────────────────────────────────────
let updated = 0;
let emilId  = null;

data.drivers = (data.drivers || []).map(driver => {
  const nameLower = (driver.name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const isTarget  = TARGET_NAMES.some(t => nameLower.includes(t));
  if (!isTarget) return driver;

  if (nameLower.includes(EMIL_NAME)) emilId = driver.id;

  // Asignar IDs correlativos a las tarifas
  const rates = T1_RATES.map((r, i) => ({ ...r, id: i + 1 }));

  console.log(`✅ Tarifas T1 asignadas a: ${driver.name}`);
  updated++;
  return { ...driver, salaryType: "perTrip", rates };
});

if (updated === 0) {
  console.warn("⚠️  No se encontró ningún conductor con esos nombres. Verifica el nombre exacto en el sistema.");
  console.log("Conductores disponibles:", data.drivers.map(d => d.name));
} else {
  console.log(`\n✅ ${updated} conductor(es) actualizados con tarifario T1.`);
}

// ── Recalcular viaje del día 30 de Emil ──────────────────────────────────────
if (emilId !== null) {
  const emilTrips = (data.trips || []).filter(tr =>
    tr.driverId === emilId && String(tr.date || "").endsWith("-30")
  );

  if (emilTrips.length === 0) {
    console.warn("⚠️  No se encontró ningún viaje del día 30 para Emil.");
  } else {
    const emilDriver = data.drivers.find(d => d.id === emilId);

    emilTrips.forEach(trip => {
      const rate = (emilDriver.rates || []).find(r => r.province === trip.province && r.municipality === trip.municipality);
      if (!rate) {
        console.warn(`⚠️  Sin tarifa para el viaje de Emil → ${trip.municipality}, ${trip.province} (${trip.date}). Destino no está en el tarifario.`);
        return;
      }

      const tk        = (data.trucks || []).find(t => t.id === trip.truckId);
      const size      = (trip.tarifaOverride && trip.tarifaOverride !== "custom") ? trip.tarifaOverride : (tk?.size || "T1");
      const isT2      = size === "T2";
      const newAmount = isT2
        ? (rate.priceT2 + rate.dietaT2)
        : (rate.priceT1 + rate.dietaT1);

      // Buscar el gasto driverPay vinculado a este viaje
      let found = false;
      data.expenses = (data.expenses || []).map(exp => {
        if (exp.tripId === trip.id && exp.category === "driverPay" && exp.driverId === emilId) {
          console.log(`🔄 Viaje #${trip.id} (${trip.date}) ${trip.municipality}: pago ${exp.amount} → ${newAmount} (${size}: ${rate['price'+size]}+dieta${rate['dieta'+size]})`);
          found = true;
          return { ...exp, amount: newAmount, description: `Nómina por viaje: ${emilDriver.name}` };
        }
        return exp;
      });

      if (!found) {
        // Si no existía el gasto, crearlo
        const maxId = Math.max(0, ...(data.expenses || []).map(e => e.id));
        data.expenses.push({
          id: maxId + 1, tripId: trip.id, driverId: emilId,
          date: trip.date, category: "driverPay", amount: newAmount,
          description: `Nómina por viaje: ${emilDriver.name}`,
          paymentMethod: "transfer", status: "pending", supplierId: null,
        });
        console.log(`➕ Gasto driverPay creado para viaje #${trip.id} de Emil: ${newAmount}`);
      }
    });
  }
} else {
  console.warn("⚠️  Emil no encontrado entre los conductores actualizados.");
}

// ── Guardar en localStorage ───────────────────────────────────────────────────
localStorage.setItem("blogix_data", JSON.stringify(data));
console.log("\n💾 Datos guardados en localStorage.");
console.log("👉 Recarga la página (F5) para que el app tome los cambios.");
console.log("👉 Luego haz cualquier cambio en el app para sincronizar con Supabase.");

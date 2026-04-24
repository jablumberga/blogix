export const USERS = [
  { id: 1, username: "admin",   role: "admin",   name: "Alexander",     refId: null },
  { id: 2, username: "carlos",  role: "partner", name: "Carlos Mìndez", refId: 1 },
  { id: 3, username: "maria",   role: "partner", name: "María López",   refId: 2 },
  { id: 4, username: "juan",    role: "driver",  name: "Juan Pérez",    refId: 1 },
  { id: 5, username: "roberto", role: "driver",  name: "Roberto Gómez", refId: 2 },
  { id: 6, username: "pedro",   role: "driver",  name: "Pedro Ramírez", refId: 3 },
];

// ── Seed data (only used if Supabase returns nothing) ─────────────────────────
export const initClients = [
  { id: 1, companyName: "Acme Corp", contactPerson: "Ricardo Torres", phone: "+1 809 555 7890", email: "ricardo@acmecorp.do", notes: "Cliente principal.", status: "active",
    rules: { paymentTerms: 30, requiresPOD: true, requiresInvoiceRef: true, requiresDocuments: true, defaultBrokerId: null },
    rates: [
      { id: 1, province: "Santiago", municipality: "Santiago de los Caballeros", priceT1: 14000, priceT2: 18000 },
      { id: 2, province: "La Vega", municipality: "La Vega", priceT1: 9000, priceT2: 12000 },
      { id: 3, province: "Puerto Plata", municipality: "San Felipe de Puerto Plata", priceT1: 17000, priceT2: 22000 },
      { id: 4, province: "Duarte", municipality: "San Francisco de Macorís", priceT1: 12000, priceT2: 16000 },
    ],
  },
  { id: 2, companyName: "FreshCo", contactPerson: "Ana Villarreal", phone: "+1 809 555 4321", email: "ana@freshco.do", notes: "Solo refrigerado.", status: "active",
    rules: { paymentTerms: 15, requiresPOD: true, requiresInvoiceRef: false, requiresDocuments: true, defaultBrokerId: null },
    rates: [
      { id: 1, province: "Santo Domingo", municipality: "Santo Domingo Este", priceT1: 6000, priceT2: 8000 },
      { id: 2, province: "San Cristóbal", municipality: "San Cristóbal", priceT1: 7500, priceT2: 10000 },
    ],
  },
  { id: 3, companyName: "BuildMax", contactPerson: "Jorge Castillo", phone: "+1 809 555 6543", email: "jorge@buildmax.do", notes: "", status: "active",
    rules: { paymentTerms: 60, requiresPOD: false, requiresInvoiceRef: false, requiresDocuments: false, defaultBrokerId: null },
    rates: [{ id: 1, province: "Azua", municipality: "Azua de Compostela", priceT1: 11000, priceT2: 15000 }],
  },
  { id: 4, companyName: "Bocel", contactPerson: "", phone: "", email: "", notes: "Tarifas Brutas", status: "active",
    rules: { paymentTerms: 30, requiresPOD: false, requiresInvoiceRef: false, requiresDocuments: false, defaultBrokerId: null },
    rates: [
      { id: 1,  province: "Santiago",                    municipality: "Santiago de los Caballeros", priceT1: 5500,  priceT2: 9000  },
      { id: 2,  province: "Espaillat",                   municipality: "Moca",                       priceT1: 6500,  priceT2: 0     },
      { id: 3,  province: "Santiago",                    municipality: "Villa González",              priceT1: 6500,  priceT2: 0     },
      { id: 4,  province: "Santiago",                    municipality: "Navarrete",                   priceT1: 7300,  priceT2: 9000  },
      { id: 5,  province: "Hermanas Mirabal",            municipality: "Salcedo",                     priceT1: 7500,  priceT2: 0     },
      { id: 6,  province: "La Vega",                     municipality: "La Vega",                     priceT1: 8500,  priceT2: 11000 },
      { id: 7,  province: "Monseñor Nouel",              municipality: "Bonao",                       priceT1: 9000,  priceT2: 0     },
      { id: 8,  province: "La Vega",                     municipality: "Jarabacoa",                   priceT1: 9000,  priceT2: 0     },
      { id: 9,  province: "Sánchez Ramírez",             municipality: "Cotuí",                       priceT1: 9450,  priceT2: 0     },
      { id: 10, province: "Duarte",                      municipality: "San Francisco de Macorís",    priceT1: 9500,  priceT2: 13000 },
      { id: 11, province: "María Trinidad Sánchez",      municipality: "Nagua",                       priceT1: 10000, priceT2: 0     },
      { id: 12, province: "Puerto Plata",                municipality: "Cabarete",                    priceT1: 10360, priceT2: 0     },
      { id: 13, province: "La Vega",                     municipality: "Constanza",                   priceT1: 12000, priceT2: 0     },
      { id: 14, province: "Dajabón",                     municipality: "Dajabón",                     priceT1: 13400, priceT2: 20000 },
      { id: 15, province: "Samaná",                      municipality: "Santa Bárbara de Samaná",     priceT1: 14210, priceT2: 0     },
      { id: 16, province: "Valverde",                    municipality: "Esperanza",                   priceT1: 0,     priceT2: 10300 },
      { id: 17, province: "Valverde",                    municipality: "Mao",                         priceT1: 0,     priceT2: 13000 },
      { id: 18, province: "Santo Domingo / Distrito Nacional", municipality: "Santo Domingo de Guzmán", priceT1: 0, priceT2: 18000 },
      { id: 19, province: "San Juan",                    municipality: "San Juan de la Maguana",      priceT1: 0,     priceT2: 35000 },
      { id: 20, province: "Elías Piña",                  municipality: "Comendador",                  priceT1: 0,     priceT2: 38000 },
      { id: 21, province: "Independencia",               municipality: "Jimaní",                      priceT1: 0,     priceT2: 40000 },
    ],
  },
];

export const initPartners = [
  { id: 1, name: "Carlos Mìndez", phone: "+1 809 555 1111", email: "carlos@email.do", commissionPct: 15, negotiationType: "Net Profit %", notes: "Tiene 2 camiones", username: "carlos", password: "$2b$10$Pky8FUU1hAJUTk5rrRApM.pYPKSD6l59guFhkoVJldZrn9vXuGNAW" },
  { id: 2, name: "María López",   phone: "+1 809 555 2222", email: "maria@email.do",  commissionPct: 12, negotiationType: "Net Profit %", notes: "",              username: "maria",  password: "$2b$10$KlcIqOkDFFGkFJS7ZBmdJuTO3yr6isKKpaa8/7Af4cf86UcreKoH2" },
];

export const initTrucks = [
  { id: 1, plate: "A123456", type: "Flatbed",      size: "T2", owner: "own",     partnerId: null },
  { id: 2, plate: "B789012", type: "Refrigerated", size: "T1", owner: "own",     partnerId: null },
  { id: 3, plate: "C345678", type: "Dry Van",      size: "T1", owner: "partner", partnerId: 1 },
  { id: 4, plate: "D901234", type: "Flatbed",      size: "T2", owner: "partner", partnerId: 1 },
  { id: 5, plate: "E567890", type: "Flatbed",      size: "T2", owner: "partner", partnerId: 2 },
];

export const initDrivers = [
  { id: 1, name: "Juan Pérez",     phone: "+1 809 555 1234", license: "LIC-001", truckId: 1, salaryType: "perTrip", fixedAmount: 0,     username: "juan",    password: "$2b$10$apeRImCTKNTNIaHku1CbYut36izu6Miu03prQEcd/n0HFa17giuLi",
    rates: [{ id: 1, province: "Santiago", municipality: "Santiago de los Caballeros", priceT1: 2500, priceT2: 3500 }, { id: 2, province: "Puerto Plata", municipality: "San Felipe de Puerto Plata", priceT1: 3200, priceT2: 4500 }] },
  { id: 2, name: "Roberto Gómez", phone: "+1 809 555 5678", license: "LIC-002", truckId: 2, salaryType: "fixed",   fixedAmount: 25000, username: "roberto", password: "$2b$10$Gl4olUiqsekaPHzSw1eX3unaDmUUncR3fkMetTHC64nd5ChJar2KG", rates: [] },
  { id: 3, name: "Pedro Ramírez", phone: "+1 809 555 9012", license: "LIC-003", truckId: 3, salaryType: "perTrip", fixedAmount: 0,     username: "pedro",   password: "$2b$10$QdTU/DNo8i/4kMUJJ4SlXuAyg/uENz1cRW5bRV.9INOW7VgUSmyMq",
    rates: [{ id: 1, province: "Santiago", municipality: "Santiago de los Caballeros", priceT1: 2000, priceT2: 3000 }] },
];

export const initBrokers = [
  { id: 1, name: "Luis Broker Corp", contactPerson: "Luis García", phone: "+1 809 555 9999", email: "luis@brokercorp.do", commissionPct: 5, notes: "Principal intermediario" },
];

export const initSuppliers = [
  { id: 1, name: "PetroDom Fuel", contactPerson: "Manuel Díaz", phone: "+1 809 555 3333", email: "ventas@petrodom.do", paymentCondition: "credit", creditDays: 30, notes: "Combustible" },
  { id: 2, name: "TireMax RD",    contactPerson: "Sofía Cruz",   phone: "+1 809 555 4444", email: "sofia@tiremax.do",  paymentCondition: "cash",   creditDays: 0,  notes: "Neumáticos y partes" },
];

export const initTrips = [
  { id: 1, date: "2026-04-01", province: "Santiago",       municipality: "Santiago de los Caballeros", truckId: 1, driverId: 1, clientId: 1, brokerId: null, cargo: "Materiales",   weight: 18, revenue: 18000, status: "delivered",  createdBy: "admin", invoiceRef: "FAC-001", docStatus: "delivered", podDelivered: true,  cicloSeleccion: "ACM-2026-04", helpers: [{ name: "Miguel", pay: 1500 }], discounts: [] },
  { id: 2, date: "2026-04-02", province: "Santo Domingo",  municipality: "Santo Domingo Este",         truckId: 2, driverId: 2, clientId: 2, brokerId: null, cargo: "Alimentos",    weight: 12, revenue: 8000,  status: "delivered",  createdBy: "admin", invoiceRef: "",        docStatus: "delivered", podDelivered: true,  cicloSeleccion: "FRC-2026-04", helpers: [], discounts: [] },
  { id: 3, date: "2026-04-03", province: "Azua",           municipality: "Azua de Compostela",         truckId: 3, driverId: 3, clientId: 3, brokerId: 1,    cargo: "Construcción", weight: 20, revenue: 15000, status: "in_transit", createdBy: "juan",  invoiceRef: "",        docStatus: "pending",   podDelivered: false, cicloSeleccion: "",            helpers: [{ name: "José", pay: 1200 }, { name: "Ramón", pay: 1200 }], discounts: [{ desc: "Adelanto", amount: 500 }] },
  { id: 4, date: "2026-04-05", province: "Puerto Plata",   municipality: "San Felipe de Puerto Plata", truckId: 4, driverId: 1, clientId: 1, brokerId: null, cargo: "Equipos",      weight: 15, revenue: 22000, status: "in_transit", createdBy: "admin", invoiceRef: "FAC-004", docStatus: "pending",   podDelivered: false, cicloSeleccion: "ACM-2026-04", helpers: [], discounts: [] },
  { id: 5, date: "2026-04-07", province: "La Vega",        municipality: "La Vega",                    truckId: 1, driverId: 1, clientId: 1, brokerId: null, cargo: "Paquetes",     weight: 10, revenue: 12000, status: "pending",    createdBy: "pedro", invoiceRef: "FAC-005", docStatus: "pending",   podDelivered: false, cicloSeleccion: "ACM-2026-04", helpers: [{ name: "Carlos Jr", pay: 1000 }], discounts: [] },
];

export const initExpenses = [
  { id: 1,  tripId: 1, date: "2026-04-01", category: "fuel",             amount: 4500, paymentMethod: "credit",   description: "Diesel",                   supplierId: 1    },
  { id: 2,  tripId: 1, date: "2026-04-01", category: "toll",             amount: 1200, paymentMethod: "cash",     description: "Peajes",                   supplierId: null },
  { id: 3,  tripId: 1, date: "2026-04-01", category: "driverPay",        amount: 3500, paymentMethod: "transfer", description: "Pago conductor",           supplierId: null },
  { id: 4,  tripId: 2, date: "2026-04-02", category: "fuel",             amount: 3000, paymentMethod: "credit",   description: "Diesel",                   supplierId: 1    },
  { id: 5,  tripId: 2, date: "2026-04-02", category: "driverPay",        amount: 4000, paymentMethod: "transfer", description: "Pago conductor (fijo)",    supplierId: null },
  { id: 6,  tripId: 3, date: "2026-04-03", category: "fuel",             amount: 5200, paymentMethod: "credit",   description: "Diesel",                   supplierId: 1    },
  { id: 7,  tripId: 3, date: "2026-04-03", category: "toll",             amount: 800,  paymentMethod: "cash",     description: "Peajes",                   supplierId: null },
  { id: 8,  tripId: 3, date: "2026-04-03", category: "broker_commission",amount: 750,  paymentMethod: "transfer", description: "Comisión broker 5%",       supplierId: null },
  { id: 9,  tripId: 4, date: "2026-04-05", category: "fuel",             amount: 6000, paymentMethod: "credit",   description: "Diesel",                   supplierId: 1    },
  { id: 10, tripId: 4, date: "2026-04-05", category: "toll",             amount: 1800, paymentMethod: "cash",     description: "Peajes",                   supplierId: null },
];

export const initSettlementStatus = {};

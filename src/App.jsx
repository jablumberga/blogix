import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import * as lucide from "lucide-react";
import { loadData, saveData } from "./api.js";

// ─── Icons ───────────────────────────────────────────────────────────────────
const { Truck, Users, Route, DollarSign, BarChart3, Handshake, LayoutDashboard, Globe, Plus, Pencil, Trash2, X, ChevronRight, ChevronDown, Search, TrendingUp, TrendingDown, Package, MapPin, Calendar, Filter, Building2, FileCheck, AlertTriangle, CheckCircle2, ClipboardList, LogIn, Lock, Eye, EyeOff, Bell, FileText, Receipt, CreditCard, UserCheck, Briefcase, ShieldCheck, AlertCircle, Download, Printer, CircleDollarSign, Fuel, Wrench, Landmark, Clock, ArrowUpDown, Building, Store, Banknote, UserCog, Hash, Menu } = lucide;

// ─── Dominican Republic Destinations ─────────────────────────────────────────
const DR_PROVINCES = [
  { province: "Santo Domingo / Distrito Nacional", municipalities: ["Santo Domingo de Guzmán", "Santo Domingo Este", "Santo Domingo Norte", "Santo Domingo Oeste", "Boca Chica", "Los Alcarrizos", "San Antonio de Guerra"] },
  { province: "Santiago", municipalities: ["Santiago de los Caballeros", "Tamboril", "Villa González", "Licey al Medio", "San José de las Matas", "Bisonó"] },
  { province: "La Vega", municipalities: ["La Vega", "Constanza", "Jarabacoa"] },
  { province: "San Cristóbal", municipalities: ["San Cristóbal", "Bajos de Haina", "Villa Altagracia", "Cambita Garabitos", "San Gregorio de Nigua", "Yaguate"] },
  { province: "Duarte", municipalities: ["San Francisco de Macorís", "Las Guáranas", "Pimentel", "Villa Riva", "Castillo"] },
  { province: "Puerto Plata", municipalities: ["Puerto Plata", "Sosúa", "Imbert", "Altamira", "Luperón", "Villa Isabela"] },
  { province: "San Pedro de Macorís", municipalities: ["San Pedro de Macorís", "Guayacanes", "Quisqueya", "Consuelo", "Ramón Santana"] },
  { province: "La Romana", municipalities: ["La Romana", "Guaymate", "Villa Hermosa"] },
  { province: "La Altagracia", municipalities: ["Higüey", "Punta Cana", "San Rafael del Yuma"] },
  { province: "Espaillat", municipalities: ["Moca", "Gaspar Hernández", "Cayetano Germosén"] },
  { province: "Peravia", municipalities: ["Baní", "Nizao"] },
  { province: "Azua", municipalities: ["Azua de Compostela", "Las Charcas", "Padre Las Casas", "Estebanía", "Sabana Yegua"] },
  { province: "Monseñor Nouel", municipalities: ["Bonao", "Maimón", "Piedra Blanca"] },
  { province: "Monte Plata", municipalities: ["Monte Plata", "Yamasá", "Bayaguana", "Sabana Grande de Boyá"] },
  { province: "Sánchez Ramírez", municipalities: ["Cotuí", "Fantino", "Cevicos"] },
  { province: "Valverde", municipalities: ["Mao", "Esperanza", "Laguna Salada"] },
  { province: "María Trinidad Sánchez", municipalities: ["Nagua", "Río San Juan", "Cabrera"] },
  { province: "Hermanas Mirabal", municipalities: ["Salcedo", "Tenares", "Villa Tapia"] },
  { province: "Samaná", municipalities: ["Santa Bárbara de Samaná", "Las Terrenas", "Sánchez"] },
  { province: "Barahona", municipalities: ["Barahona", "Vicente Noble", "Enriquillo", "Paraíso", "Cabral"] },
  { province: "San Juan", municipalities: ["San Juan de la Maguana", "Las Matas de Farfán", "Bohechío", "El Cercado"] },
  { province: "Hato Mayor", municipalities: ["Hato Mayor del Rey", "Sabana de la Mar", "El Valle"] },
  { province: "El Seibo", municipalities: ["El Seibo", "Miches"] },
  { province: "Monte Cristi", municipalities: ["Monte Cristi", "Guayubín", "Villa Vásquez", "Pepillo Salcedo"] },
  { province: "Dajabón", municipalities: ["Dajabón", "Loma de Cabrera", "Restauración"] },
  { province: "Santiago Rodríguez", municipalities: ["San Ignacio de Sabaneta", "Monción", "Villa Los Almácigos"] },
  { province: "Bahoruco", municipalities: ["Neiba", "Tamayo", "Galván"] },
  { province: "Independencia", municipalities: ["Jimaní", "Duvergé", "La Descubierta"] },
  { province: "Pedernales", municipalities: ["Pedernales", "Oviedo"] },
  { province: "Elías Piña", municipalities: ["Comendador", "El Llano", "Bánica"] },
];

const ALL_DESTINATIONS = DR_PROVINCES.flatMap(p => p.municipalities.map(m => ({ province: p.province, municipality: m, label: `${m}, ${p.province}` })));

// ─── Expense & Payment Categories ────────────────────────────────────────────
const EXPENSE_CATEGORIES = ["salary", "fuel", "repair", "loan", "maintenance", "toll", "tire", "insurance", "driverPay", "helper", "broker_commission", "other"];
const PAYMENT_METHODS = ["cash", "transfer", "check", "credit_card", "credit"];

// ─── i18n ────────────────────────────────────────────────────────────────────
const t_en = {
  appName: "B-Logix", dashboard: "Dashboard", fleet: "Fleet", drivers: "Drivers", clients: "Clients",
  trips: "Trips", finances: "Finances", settlements: "Settlements", reports: "Reports",
  brokers: "Brokers", expenses: "Expenses", suppliers: "Suppliers", comingSoon: "Coming Soon",
  agents: "Agents", agentsTitle: "Supervisor Agents", agentError: "Critical", agentWarning: "Warning", agentInfo: "Info",
  allClear: "All systems normal — no alerts detected",
  agentCat: { duplicate: "Duplicates", revenue: "Missing Rate", invoice: "Invoice Ref", stale: "Stalled Transit", pending_trip: "Pending Trips", docs: "Pending Docs", payroll: "Driver Payroll", broker: "Broker Fee", settlement: "Settlements", cxp: "Accounts Payable", fleet: "Fleet", rates: "Rate Sheet" },
  language: "Language", login: "Login", logout: "Logout", username: "Username", password: "Password",
  partners: "Partners", addPartner: "Add Partner", editPartner: "Edit Partner", noPartners: "No partners yet.",
  role: "Role", admin: "Admin", partner: "Partner", driverRole: "Driver",
  welcomeBack: "Welcome back", loginTitle: "Sign in to B-Logix", invalidLogin: "Invalid credentials",
  // Trips
  newTrip: "New Trip", editTrip: "Edit Trip", origin: "Origin", destination: "Destination",
  date: "Date", truck: "Truck", driver: "Driver", client: "Client", cargo: "Cargo",
  weight: "Weight (tons)", revenue: "Revenue", status: "Status", inTransit: "In Transit",
  delivered: "Delivered", cancelled: "Cancelled", pending: "Pending", save: "Save", cancel: "Cancel",
  delete: "Delete", edit: "Edit", actions: "Actions", noTrips: "No trips registered.",
  createdBy: "Created by", conduce: "Conduce", document: "Document", addExpense: "Add Expense",
  rate: "Rate", filterBy: "Filter by...", searchPlaceholder: "Search trips...",
  province: "Province", municipality: "Municipality",
  invoiceRef: "Invoice Ref #", invoiceRefRequired: "Invoice ref. required for this client",
  helpers: "Helpers", helperName: "Helper name", addHelper: "Add Helper", numHelpers: "# Helpers", helperPayEach: "Pay per Helper", discount: "Discount",
  discounts: "Discounts", addDiscount: "Add Discount", discountDesc: "Description",
  // Expenses
  expenseDate: "Date", expenseCategory: "Category", expenseAmount: "Amount",
  paymentMethod: "Payment Method", expenseDesc: "Description",
  salary: "Salary", fuel: "Fuel", repair: "Repair", loan: "Loan", maintenance: "Maintenance",
  toll: "Toll", tire: "Tires", insurance: "Insurance", driverPay: "Driver Pay",
  helper: "Helper", broker_commission: "Broker Commission", other: "Other",
  cash: "Cash", transfer: "Transfer", check: "Check", credit_card: "Credit Card", credit: "Credit",
  totalExpenses: "Total Expenses", netProfit: "Net Profit", totalRevenue: "Total Revenue",
  tripExpenses: "Trip Expenses", cxp: "Accounts Payable", payroll: "Payroll",
  // Clients
  addClient: "Add Client", editClient: "Edit Client", companyName: "Company",
  contactPerson: "Contact", email: "Email", phone: "Phone",
  notes: "Notes", noClients: "No clients registered.", clientRates: "Rate Sheet",
  addRate: "Add Rate", ratePriceT1: "Rate T1 ($)", ratePriceT2: "Rate T2 ($)", noRates: "No rates defined.",
  clientRules: "Client Rules", paymentTerms: "Payment Terms (days)", paymentTermsDays: "days",
  requiresPOD: "Requires POD", requiresInvoiceRef: "Requires Invoice Ref",
  requiresDocuments: "Requires Documents", cicloSeleccion: "Billing Cycle #",
  cicloSeleccionShort: "Cycle #", yes: "Yes", no: "No", rules: "Rules", rates: "Rates",
  rateApplied: "Rate auto-applied", podRequired: "POD Required", selectClient: "Select Client",
  importRates: "Import Rates", active: "Active", inactive: "Inactive", statusLabel: "Status",
  // Fleet
  ownTruck: "Own", partnerTruck: "Partner", truckPlate: "Plate #", truckType: "Type", truckSize: "Size",
  ownerType: "Ownership", partnerName: "Partner Name", commissionPct: "Commission %",
  addTruck: "Add Truck", noTrucks: "No trucks registered.",
  // Drivers
  driverName: "Name", license: "License #", assignedTruck: "Assigned Truck",
  addDriver: "Add Driver", noDrivers: "No drivers registered.",
  salaryType: "Salary Type", fixedSalary: "Fixed", perTrip: "Per Trip", porcentaje: "Percentage",
  fixedAmount: "Fixed Amount", percentageAmount: "Percentage %", driverRateSheet: "Driver Rate Sheet",
  // Brokers
  addBroker: "Add Broker", editBroker: "Edit Broker", brokerName: "Broker Name",
  brokerCommission: "Commission %", noBrokers: "No brokers registered.",
  broker: "Broker", brokerFee: "Broker Fee", defaultBroker: "Default Broker", noBroker: "No Broker",
  brokerAutoDeducted: "Broker commission auto-deducted",
  // Suppliers
  addSupplier: "Add Supplier", editSupplier: "Edit Supplier", supplierName: "Supplier Name",
  paymentCondition: "Payment Condition", creditDays: "Credit Days",
  noSuppliers: "No suppliers registered.", supplier: "Supplier",
  // Settlements
  period: "Period", grossRevenue: "Gross Revenue", commission: "Your Commission",
  partnerEarnings: "Partner Earnings", noSettlements: "No data for this period.",
  paid: "Paid", unpaid: "Unpaid", markPaid: "Mark Paid", markUnpaid: "Mark Unpaid",
  invoiced: "Invoiced", uninvoiced: "Uninvoiced",
  // Dashboard
  activeTrucks: "Active Trucks", activeClients: "Active Clients",
  monthRevenue: "Month Revenue", monthExpenses: "Month Expenses", monthProfit: "Month Profit",
  recentTrips: "Recent Trips", topTrucks: "Top Trucks", alerts: "Alerts",
  pendingCxP: "Pending Payments", dueSoon: "Due Soon", overdue: "Overdue",
  noPendingAlerts: "No pending alerts.",
  // General
  all: "All", own: "Own", search: "Search...", total: "Total", none: "None",
  selectMonth: "Select Month", truckSummary: "Truck Summary", profitLoss: "P&L",
  margin: "Margin", totalTrips: "Total Trips", today: "Today", thisWeek: "This Week",
  thisMonth: "This Month", custom: "Custom", from: "From", to: "To", apply: "Apply",
  printConduce: "Print Conduce", generatePDF: "Generate PDF",
  pendingDocs: "Pending Docs", deliveredDocs: "Delivered",
  driverDashboard: "My Trips", partnerDashboard: "My Fleet",
  accumulated: "Accumulated", earnings: "Earnings",
  // Payroll
  payrollSummary: "Payroll Summary", tripPay: "Trip Pay", helperPay: "Helper Pay",
  totalEarnings: "Total Earnings", totalDiscounts: "Total Discounts", netPay: "Net Pay",
};

const t_es = {
  appName: "B-Logix", dashboard: "Panel", fleet: "Flota", drivers: "Conductores", clients: "Clientes",
  trips: "Viajes", finances: "Finanzas", settlements: "Liquidaciones", reports: "Reportes",
  brokers: "Intermediarios", expenses: "Gastos", suppliers: "Suplidores", comingSoon: "Próximamente",
  agents: "Agentes", agentsTitle: "Agentes de Supervisión", agentError: "Crítico", agentWarning: "Advertencia", agentInfo: "Info",
  allClear: "Todo en orden — no hay alertas activas",
  agentCat: { duplicate: "Duplicados", revenue: "Sin Tarifa", invoice: "Ref. Factura", stale: "En Tránsito Estancado", pending_trip: "Viajes Pendientes", docs: "Docs Pendientes", payroll: "Nómina Conductor", broker: "Comisión Broker", settlement: "Liquidaciones", cxp: "Cuentas por Pagar", fleet: "Flota", rates: "Tarifario" },
  language: "Idioma", login: "Iniciar Sesión", logout: "Cerrar Sesión", username: "Usuario",
  partners: "Socios", addPartner: "Agregar Socio", editPartner: "Editar Socio", noPartners: "Sin socios aún.",
  password: "Contraseña", role: "Rol", admin: "Admin", partner: "Socio", driverRole: "Conductor",
  welcomeBack: "Bienvenido", loginTitle: "Inicia sesión en B-Logix", invalidLogin: "Credenciales inválidas",
  newTrip: "Nuevo Viaje", editTrip: "Editar Viaje", origin: "Origen", destination: "Destino",
  date: "Fecha", truck: "Camión", driver: "Conductor", client: "Cliente", cargo: "Carga",
  weight: "Peso (tons)", revenue: "Ingreso", status: "Estado", inTransit: "En Tránsito",
  delivered: "Entregado", cancelled: "Cancelado", pending: "Pendiente", save: "Guardar",
  cancel: "Cancelar", delete: "Eliminar", edit: "Editar", actions: "Acciones",
  noTrips: "No hay viajes registrados.", createdBy: "Creado por", conduce: "Conduce",
  document: "Documento", addExpense: "Agregar Gasto", rate: "Tarifa",
  filterBy: "Filtrar por...", searchPlaceholder: "Buscar viajes...",
  province: "Provincia", municipality: "Municipio",
  invoiceRef: "Ref. Factura #", invoiceRefRequired: "Ref. factura requerida para este cliente",
  helpers: "Ayudantes", helperName: "Nombre ayudante", addHelper: "Agregar Ayudante", numHelpers: "# Ayudantes", helperPayEach: "Pago por Ayudante",
  discount: "Descuento", discounts: "Descuentos", addDiscount: "Agregar Descuento",
  discountDesc: "Descripción",
  expenseDate: "Fecha", expenseCategory: "Categoría", expenseAmount: "Monto",
  paymentMethod: "Método de Pago", expenseDesc: "Descripción",
  salary: "Salario", fuel: "Combustible", repair: "Reparación", loan: "Préstamo",
  maintenance: "Mantenimiento", toll: "Peaje", tire: "Neumáticos", insurance: "Seguro",
  driverPay: "Pago Conductor", helper: "Ayudante", broker_commission: "Comisión Broker",
  other: "Otro", cash: "Efectivo", transfer: "Transferencia", check: "Cheque",
  credit_card: "Tarjeta", credit: "Crédito",
  totalExpenses: "Total Gastos", netProfit: "Ganancia Neta", totalRevenue: "Ingreso Total",
  tripExpenses: "Gastos del Viaje", cxp: "Cuentas por Pagar", payroll: "Nómina",
  addClient: "Agregar Cliente", editClient: "Editar Cliente", companyName: "Empresa",
  contactPerson: "Contacto", email: "Correo", phone: "Teléfono",
  notes: "Notas", noClients: "No hay clientes registrados.", clientRates: "Tarifario",
  addRate: "Agregar Tarifa", ratePrice: "Tarifa ($)", noRates: "Sin tarifas definidas.",
  clientRules: "Reglas del Cliente", paymentTerms: "Plazo de Pago (días)",
  paymentTermsDays: "días", requiresPOD: "Requiere POD",
  requiresInvoiceRef: "Requiere Ref. Factura", requiresDocuments: "Requiere Documentos",
  cicloSeleccion: "Ciclo de Facturación #", cicloSeleccionShort: "Ciclo #",
  ratePriceT1: "Tarifa T1 ($)", ratePriceT2: "Tarifa T2 ($)",
  yes: "Sí", no: "No", rules: "Reglas", rates: "Tarifas",
  rateApplied: "Tarifa auto-aplicada", podRequired: "POD Requerido",
  selectClient: "Seleccionar Cliente", importRates: "Importar Tarifas",
  active: "Activo", inactive: "Inactivo", statusLabel: "Estado",
  ownTruck: "Propio", partnerTruck: "Asociado", truckPlate: "Placa", truckType: "Tipo", truckSize: "Tamaño",
  ownerType: "Propiedad", partnerName: "Nombre Socio", commissionPct: "Comisión %",
  addTruck: "Agregar Camión", noTrucks: "No hay camiones registrados.",
  driverName: "Nombre", license: "Licencia #", assignedTruck: "Camión Asignado",
  addDriver: "Agregar Conductor", noDrivers: "No hay conductores registrados.",
  salaryType: "Tipo Salario", fixedSalary: "Fijo", perTrip: "Por Viaje", porcentaje: "Porcentaje",
  fixedAmount: "Monto Fijo", percentageAmount: "Porcentaje %", driverRateSheet: "Tarifario Conductor",
  addBroker: "Agregar Broker", editBroker: "Editar Broker", brokerName: "Nombre Broker",
  brokerCommission: "Comisión %", noBrokers: "No hay brokers registrados.",
  broker: "Broker", brokerFee: "Comisión Broker", defaultBroker: "Broker por Defecto", noBroker: "Sin Broker",
  brokerAutoDeducted: "Comisión broker deducida automáticamente",
  addSupplier: "Agregar Suplidor", editSupplier: "Editar Suplidor",
  supplierName: "Nombre Suplidor", paymentCondition: "Condición de Pago",
  creditDays: "Días de Crédito", noSuppliers: "No hay suplidores registrados.",
  supplier: "Suplidor",
  period: "Período", grossRevenue: "Ingreso Bruto", commission: "Tu Comisión",
  partnerEarnings: "Ganancia Socio", noSettlements: "Sin datos para este período.",
  paid: "Pagado", unpaid: "Pendiente", markPaid: "Marcar Pagado", markUnpaid: "Marcar Pendiente",
  invoiced: "Facturado", uninvoiced: "Sin Facturar",
  activeTrucks: "Camiones Activos", activeClients: "Clientes Activos",
  monthRevenue: "Ingreso del Mes", monthExpenses: "Gastos del Mes",
  monthProfit: "Ganancia del Mes", recentTrips: "Viajes Recientes",
  topTrucks: "Top Camiones", alerts: "Alertas", pendingCxP: "Pagos Pendientes",
  dueSoon: "Por Vencer", overdue: "Vencido", noPendingAlerts: "Sin alertas pendientes.",
  all: "Todos", own: "Propios", search: "Buscar...", total: "Total", none: "Ninguno",
  selectMonth: "Seleccionar Mes", truckSummary: "Resumen por Camión", profitLoss: "G/P",
  margin: "Margen", totalTrips: "Total Viajes", today: "Hoy", thisWeek: "Esta Semana",
  thisMonth: "Este Mes", custom: "Personalizado", from: "Desde", to: "Hasta", apply: "Aplicar",
  printConduce: "Imprimir Conduce", generatePDF: "Generar PDF",
  pendingDocs: "Docs Pendientes", deliveredDocs: "Entregados",
  driverDashboard: "Mis Viajes", partnerDashboard: "Mi Flota",
  accumulated: "Acumulado", earnings: "Ingresos",
  payrollSummary: "Resumen Nómina", tripPay: "Pago Viajes", helperPay: "Pago Ayudantes",
  totalEarnings: "Total Ingresos", totalDiscounts: "Total Descuentos", netPay: "Pago Neto",
};

const translations = { en: t_en, es: t_es };

// ─── Sample Data ─────────────────────────────────────────────────────────────
const USERS = [
  { id: 1, username: "admin", password: "admin123", role: "admin", name: "Alexander", refId: null },
  { id: 2, username: "carlos", password: "partner1", role: "partner", name: "Carlos Mìndez", refId: 1 },
  { id: 3, username: "maria", password: "partner2", role: "partner", name: "María López", refId: 2 },
  { id: 4, username: "juan", password: "driver1", role: "driver", name: "Juan Pérez", refId: 1 },
  { id: 5, username: "roberto", password: "driver2", role: "driver", name: "Roberto Gómez", refId: 2 },
  { id: 6, username: "pedro", password: "driver3", role: "driver", name: "Pedro Ramírez", refId: 3 },
];

const initClients = [
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
      { id: 18, province: "Santo Domingo / Distrito Nacional", municipality: "Santo Domingo de Guzmán", priceT1: 0,  priceT2: 18000 },
      { id: 19, province: "San Juan",                    municipality: "San Juan de la Maguana",      priceT1: 0,     priceT2: 35000 },
      { id: 20, province: "Elías Piña",                  municipality: "Comendador",                  priceT1: 0,     priceT2: 38000 },
      { id: 21, province: "Independencia",               municipality: "Jimaní",                      priceT1: 0,     priceT2: 40000 },
    ],
  },
];

const initPartners = [
  { id: 1, name: "Carlos Mìndez", phone: "+1 809 555 1111", email: "carlos@email.do", commissionPct: 15, negotiationType: "Net Profit %", notes: "Tiene 2 camiones", username: "carlos", password: "partner1" },
  { id: 2, name: "María López", phone: "+1 809 555 2222", email: "maria@email.do", commissionPct: 12, negotiationType: "Net Profit %", notes: "", username: "maria", password: "partner2" },
];

const initTrucks = [
  { id: 1, plate: "A123456", type: "Flatbed", size: "T2", owner: "own", partnerId: null },
  { id: 2, plate: "B789012", type: "Refrigerated", size: "T1", owner: "own", partnerId: null },
  { id: 3, plate: "C345678", type: "Dry Van", size: "T1", owner: "partner", partnerId: 1 },
  { id: 4, plate: "D901234", type: "Flatbed", size: "T2", owner: "partner", partnerId: 1 },
  { id: 5, plate: "E567890", type: "Flatbed", size: "T2", owner: "partner", partnerId: 2 },
];

const initDrivers = [
  { id: 1, name: "Juan Pérez", phone: "+1 809 555 1234", license: "LIC-001", truckId: 1, salaryType: "perTrip", fixedAmount: 0, username: "juan", password: "driver1",
    rates: [{ id: 1, province: "Santiago", municipality: "Santiago de los Caballeros", priceT1: 2500, priceT2: 3500 }, { id: 2, province: "Puerto Plata", municipality: "San Felipe de Puerto Plata", priceT1: 3200, priceT2: 4500 }] },
  { id: 2, name: "Roberto Gómez", phone: "+1 809 555 5678", license: "LIC-002", truckId: 2, salaryType: "fixed", fixedAmount: 25000, username: "roberto", password: "driver2", rates: [] },
  { id: 3, name: "Pedro Ramírez", phone: "+1 809 555 9012", license: "LIC-003", truckId: 3, salaryType: "perTrip", fixedAmount: 0, username: "pedro", password: "driver3",
    rates: [{ id: 1, province: "Santiago", municipality: "Santiago de los Caballeros", priceT1: 2000, priceT2: 3000 }] },
];

const initBrokers = [
  { id: 1, name: "Luis Broker Corp", contactPerson: "Luis García", phone: "+1 809 555 9999", email: "luis@brokercorp.do", commissionPct: 5, notes: "Principal intermediario" },
];

const initSuppliers = [
  { id: 1, name: "PetroDom Fuel", contactPerson: "Manuel Díaz", phone: "+1 809 555 3333", email: "ventas@petrodom.do", paymentCondition: "credit", creditDays: 30, notes: "Combustible" },
  { id: 2, name: "TireMax RD", contactPerson: "Sofía Cruz", phone: "+1 809 555 4444", email: "sofia@tiremax.do", paymentCondition: "cash", creditDays: 0, notes: "Neumáticos y partes" },
];

const initTrips = [
  { id: 1, date: "2026-04-01", province: "Santiago", municipality: "Santiago de los Caballeros", truckId: 1, driverId: 1, clientId: 1, brokerId: null, cargo: "Materiales", weight: 18, revenue: 18000, status: "delivered", createdBy: "admin", invoiceRef: "FAC-001", docStatus: "delivered", podDelivered: true, cicloSeleccion: "ACM-2026-04", helpers: [{ name: "Miguel", pay: 1500 }], discounts: [] },
  { id: 2, date: "2026-04-02", province: "Santo Domingo", municipality: "Santo Domingo Este", truckId: 2, driverId: 2, clientId: 2, brokerId: null, cargo: "Alimentos", weight: 12, revenue: 8000, status: "delivered", createdBy: "admin", invoiceRef: "", docStatus: "delivered", podDelivered: true, cicloSeleccion: "FRC-2026-04", helpers: [], discounts: [] },
  { id: 3, date: "2026-04-03", province: "Azua", municipality: "Azua de Compostela", truckId: 3, driverId: 3, clientId: 3, brokerId: 1, cargo: "Construcción", weight: 20, revenue: 15000, status: "in_transit", createdBy: "juan", invoiceRef: "", docStatus: "pending", podDelivered: false, cicloSeleccion: "", helpers: [{ name: "José", pay: 1200 }, { name: "Ramón", pay: 1200 }], discounts: [{ desc: "Adelanto", amount: 500 }] },
  { id: 4, date: "2026-04-05", province: "Puerto Plata", municipality: "San Felipe de Puerto Plata", truckId: 4, driverId: 1, clientId: 1, brokerId: null, cargo: "Equipos", weight: 15, revenue: 22000, status: "in_transit", createdBy: "admin", invoiceRef: "FAC-004", docStatus: "pending", podDelivered: false, cicloSeleccion: "ACM-2026-04", helpers: [], discounts: [] },
  { id: 5, date: "2026-04-07", province: "La Vega", municipality: "La Vega", truckId: 1, driverId: 1, clientId: 1, brokerId: null, cargo: "Paquetes", weight: 10, revenue: 12000, status: "pending", createdBy: "pedro", invoiceRef: "FAC-005", docStatus: "pending", podDelivered: false, cicloSeleccion: "ACM-2026-04", helpers: [{ name: "Carlos Jr", pay: 1000 }], discounts: [] },
];

const initExpenses = [
  { id: 1, tripId: 1, date: "2026-04-01", category: "fuel", amount: 4500, paymentMethod: "credit", description: "Diesel", supplierId: 1 },
  { id: 2, tripId: 1, date: "2026-04-01", category: "toll", amount: 1200, paymentMethod: "cash", description: "Peajes", supplierId: null },
  { id: 3, tripId: 1, date: "2026-04-01", category: "driverPay", amount: 3500, paymentMethod: "transfer", description: "Pago conductor", supplierId: null },
  { id: 4, tripId: 2, date: "2026-04-02", category: "fuel", amount: 3000, paymentMethod: "credit", description: "Diesel", supplierId: 1 },
  { id: 5, tripId: 2, date: "2026-04-02", category: "driverPay", amount: 4000, paymentMethod: "transfer", description: "Pago conductor (fijo)", supplierId: null },
  { id: 6, tripId: 3, date: "2026-04-03", category: "fuel", amount: 5200, paymentMethod: "credit", description: "Diesel", supplierId: 1 },
  { id: 7, tripId: 3, date: "2026-04-03", category: "toll", amount: 800, paymentMethod: "cash", description: "Peajes", supplierId: null },
  { id: 8, tripId: 3, date: "2026-04-03", category: "broker_commission", amount: 750, paymentMethod: "transfer", description: "Comisión broker 5%", supplierId: null },
  { id: 9, tripId: 4, date: "2026-04-05", category: "fuel", amount: 6000, paymentMethod: "credit", description: "Diesel", supplierId: 1 },
  { id: 10, tripId: 4, date: "2026-04-05", category: "toll", amount: 1800, paymentMethod: "cash", description: "Peajes", supplierId: null },
];

const initSettlementStatus = {}; // { "partnerId-month": "paid"|"unpaid" }

// ─── Utility ─────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "DOP", minimumFractionDigits: 0 }).format(n);
const pct = (n) => (n * 100).toFixed(1) + "%";
const nxId = (arr) => (arr.length ? Math.max(...arr.map((x) => x.id)) + 1 : 1);
const today = () => new Date().toISOString().slice(0, 10);
const monthStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const daysDiff = (dateStr) => Math.floor((new Date(today()) - new Date(dateStr)) / 86400000);

// ─── Supervisor Agents ────────────────────────────────────────────────────────
function computeAlerts({ trips, expenses, clients, drivers, trucks, partners, brokers, settlementStatus }) {
  const alerts = [];

  // ── AGENT 1: Viajes duplicados ──────────────────────────────────────────────
  const seen = {};
  trips.filter(tr => tr.status !== "cancelled").forEach(tr => {
    const key = `${tr.date}-${tr.clientId}-${tr.municipality}-${tr.truckId}`;
    if (seen[key]) {
      alerts.push({ id: `dup-${tr.id}`, severity: "error", category: "duplicate", tripId: tr.id,
        msg: `Viaje duplicado: #${seen[key]} y #${tr.id} — mismo día, cliente, destino y camión` });
    } else { seen[key] = tr.id; }
  });

  // ── AGENT 2: Viajes sin tarifa ──────────────────────────────────────────────
  trips.filter(tr => tr.status !== "cancelled" && (!tr.revenue || tr.revenue === 0)).forEach(tr => {
    const cl = clients.find(c => c.id === tr.clientId);
    alerts.push({ id: `rev-${tr.id}`, severity: "error", category: "revenue", tripId: tr.id,
      msg: `Viaje #${tr.id} sin tarifa — ${cl?.companyName || "Sin cliente"} → ${tr.municipality || "Sin destino"} (${tr.date})` });
  });

  // ── AGENT 3: Ref. factura faltante ─────────────────────────────────────────
  trips.filter(tr => tr.status !== "cancelled" && !tr.invoiceRef).forEach(tr => {
    const cl = clients.find(c => c.id === tr.clientId);
    if (cl?.rules?.requiresInvoiceRef) {
      alerts.push({ id: `inv-${tr.id}`, severity: "error", category: "invoice", tripId: tr.id,
        msg: `Viaje #${tr.id} sin ref. factura — ${cl.companyName} la requiere (${tr.date})` });
    }
  });

  // ── AGENT 4: Viajes estancados en tránsito > 3 días ────────────────────────
  trips.filter(tr => tr.status === "in_transit").forEach(tr => {
    const days = daysDiff(tr.date);
    if (days > 3) {
      const cl = clients.find(c => c.id === tr.clientId);
      alerts.push({ id: `stale-${tr.id}`, severity: "warning", category: "stale", tripId: tr.id,
        msg: `Viaje #${tr.id} lleva ${days} días en tránsito — ${cl?.companyName || "—"} → ${tr.municipality} (iniciado ${tr.date})` });
    }
  });

  // ── AGENT 5: Viajes pendientes > 1 día ─────────────────────────────────────
  trips.filter(tr => tr.status === "pending").forEach(tr => {
    const days = daysDiff(tr.date);
    if (days > 1) {
      const cl = clients.find(c => c.id === tr.clientId);
      alerts.push({ id: `pend-${tr.id}`, severity: "warning", category: "pending_trip", tripId: tr.id,
        msg: `Viaje #${tr.id} sigue pendiente hace ${days} días — ${cl?.companyName || "—"} → ${tr.municipality}` });
    }
  });

  // ── AGENT 6: Documentos / POD pendientes en viajes entregados ──────────────
  trips.filter(tr => tr.status === "delivered" && tr.docStatus === "pending").forEach(tr => {
    const cl = clients.find(c => c.id === tr.clientId);
    if (cl?.rules?.requiresDocuments || cl?.rules?.requiresPOD) {
      alerts.push({ id: `doc-${tr.id}`, severity: "warning", category: "docs", tripId: tr.id,
        msg: `Viaje #${tr.id} entregado pero documentos pendientes — ${cl?.companyName || "—"} (${tr.date})` });
    }
  });

  // ── AGENT 7: Conductor por-viaje sin pago en viaje entregado ───────────────
  drivers.filter(d => d.salaryType === "perTrip" || d.salaryType === "porcentaje").forEach(driver => {
    trips.filter(tr => tr.driverId === driver.id && tr.status === "delivered").forEach(tr => {
      const hasPay = expenses.some(e => e.tripId === tr.id && e.category === "driverPay");
      if (!hasPay) {
        alerts.push({ id: `pay-${tr.id}`, severity: "warning", category: "payroll", tripId: tr.id,
          msg: `Conductor ${driver.name}: viaje #${tr.id} entregado sin pago de conductor registrado (${tr.date})` });
      }
    });
  });

  // ── AGENT 8: Broker asignado sin comisión deducida ─────────────────────────
  trips.filter(tr => tr.brokerId && tr.status !== "cancelled" && tr.revenue > 0).forEach(tr => {
    const hasFee = expenses.some(e => e.tripId === tr.id && e.category === "broker_commission");
    if (!hasFee) {
      const br = brokers.find(b => b.id === tr.brokerId);
      alerts.push({ id: `brk-${tr.id}`, severity: "warning", category: "broker", tripId: tr.id,
        msg: `Viaje #${tr.id} tiene broker "${br?.name || "—"}" pero sin comisión deducida (${tr.date})` });
    }
  });

  // ── AGENT 9: Liquidaciones de socios pendientes ────────────────────────────
  partners.forEach(p => {
    const pTruckIds = trucks.filter(tk => tk.partnerId === p.id).map(tk => tk.id);
    const unpaidTrips = trips.filter(tr => pTruckIds.includes(tr.truckId) && tr.status === "delivered");
    if (unpaidTrips.length > 0) {
      const key = `${p.id}-${monthStr()}`;
      if (!settlementStatus[key] || settlementStatus[key] === "unpaid") {
        alerts.push({ id: `settle-${p.id}`, severity: "warning", category: "settlement",
          msg: `Socio ${p.name}: ${unpaidTrips.length} viaje(s) entregado(s) con liquidación pendiente este mes` });
      }
    }
  });

  // ── AGENT 10: CxP pendientes ───────────────────────────────────────────────
  const cxpItems = expenses.filter(e => e.paymentMethod === "credit");
  if (cxpItems.length > 0) {
    const total = cxpItems.reduce((s, e) => s + e.amount, 0);
    alerts.push({ id: "cxp-total", severity: "info", category: "cxp",
      msg: `CxP: ${cxpItems.length} gasto(s) a crédito por pagar — Total: ${fmt(total)}` });
  }

  // ── AGENT 11: Camiones sin conductor ───────────────────────────────────────
  trucks.forEach(tk => {
    const hasDriver = drivers.some(d => d.truckId === tk.id);
    if (!hasDriver) {
      alerts.push({ id: `nodrv-${tk.id}`, severity: "info", category: "fleet",
        msg: `Camión ${tk.plate} (${tk.type}) no tiene conductor asignado` });
    }
  });

  // ── AGENT 12: Clientes activos sin tarifario ────────────────────────────────
  clients.filter(c => c.status === "active" && (!c.rates || c.rates.length === 0)).forEach(c => {
    alerts.push({ id: `norates-${c.id}`, severity: "info", category: "rates",
      msg: `Cliente "${c.companyName}" no tiene tarifario definido` });
  });

  return alerts;
}

const colors = {
  bg: "#0a0f1a", sidebar: "#111827", card: "#1a2236", cardHover: "#243049",
  accent: "#3b82f6", accentLight: "#60a5fa", green: "#22c55e", red: "#ef4444",
  yellow: "#eab308", orange: "#f97316", purple: "#a855f7", cyan: "#06b6d4",
  text: "#f1f5f9", textMuted: "#94a3b8", border: "#1e3a5f", inputBg: "#0d1525",
};

// ─── Shared UI ───────────────────────────────────────────────────────────────
function Card({ children, style }) { return <div style={{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.border}`, padding: 16, ...style }}>{children}</div>; }
function StatCard({ icon: Icon, label, value, color = colors.accent, sub }) {
  return <Card style={{ display: "flex", alignItems: "center", gap: 14 }}>
    <div style={{ width: 44, height: 44, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={20} color={color} /></div>
    <div><div style={{ color: colors.textMuted, fontSize: 11, marginBottom: 2 }}>{label}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>{sub && <div style={{ fontSize: 10, color: colors.textMuted }}>{sub}</div>}</div>
  </Card>;
}
function Inp({ label, ...p }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
    {label && <label style={{ fontSize: 11, color: colors.textMuted, fontWeight: 500 }}>{label}</label>}
    <input {...p} style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 13, outline: "none", ...(p.style || {}) }} />
  </div>;
}
function Sel({ label, children, ...p }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
    {label && <label style={{ fontSize: 11, color: colors.textMuted, fontWeight: 500 }}>{label}</label>}
    <select {...p} style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 13, outline: "none", ...(p.style || {}) }}>{children}</select>
  </div>;
}
function Chk({ label, checked, onChange }) {
  return <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
    <div onClick={onChange} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? colors.accent : colors.border}`, background: checked ? colors.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
      {checked && <CheckCircle2 size={12} color="white" />}
    </div><span>{label}</span>
  </label>;
}
function Btn({ children, variant = "primary", ...p }) {
  const s = { primary: { background: colors.accent, color: "white" }, danger: { background: colors.red, color: "white" }, ghost: { background: "transparent", color: colors.textMuted, border: `1px solid ${colors.border}` }, success: { background: colors.green, color: "white" }, warning: { background: colors.orange, color: "white" } };
  return <button {...p} style={{ padding: "7px 14px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, ...s[variant], ...(p.style || {}) }}>{children}</button>;
}
function Badge({ label, color, icon: Icon }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600, background: color + "18", color }}>{Icon && <Icon size={10} />} {label}</span>;
}
function StatusBadge({ status, t }) {
  const m = { delivered: { c: colors.green, l: t.delivered }, in_transit: { c: colors.yellow, l: t.inTransit }, pending: { c: colors.accent, l: t.pending }, cancelled: { c: colors.red, l: t.cancelled } };
  const s = m[status] || m.pending;
  return <Badge label={s.l} color={s.c} />;
}
function PageHeader({ title, action }) { return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{title}</h1>{action}</div>; }
function Th({ children, align = "left" }) { return <th style={{ textAlign: align, padding: "8px 4px", color: colors.textMuted, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>{children}</th>; }
function Td({ children, align = "left", bold, color: c }) { return <td style={{ padding: "10px 4px", textAlign: align, fontWeight: bold ? 600 : 400, color: c || colors.text, fontSize: 13 }}>{children}</td>; }

function DateFilter({ t, onFilter }) {
  const [mode, setMode] = useState("thisMonth");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const apply = (m) => {
    setMode(m);
    const now = new Date();
    let f, to2;
    if (m === "today") { f = today(); to2 = today(); }
    else if (m === "thisWeek") { const d = new Date(); d.setDate(d.getDate() - d.getDay()); f = d.toISOString().slice(0, 10); to2 = today(); }
    else if (m === "thisMonth") { f = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; to2 = today(); }
    else { f = from; to2 = to; }
    onFilter(f, to2);
  };
  useEffect(() => { apply("thisMonth"); }, []);
  return <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
    {["today", "thisWeek", "thisMonth", "custom"].map(m => (
      <button key={m} onClick={() => apply(m)} style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${mode === m ? colors.accent : colors.border}`, background: mode === m ? colors.accent + "18" : "transparent", color: mode === m ? colors.accentLight : colors.textMuted, cursor: "pointer", fontSize: 11, fontWeight: 500 }}>{t[m]}</button>
    ))}
    {mode === "custom" && <>
      <Inp type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ fontSize: 11, padding: "4px 8px" }} />
      <span style={{ color: colors.textMuted }}>→</span>
      <Inp type="date" value={to} onChange={e => setTo(e.target.value)} style={{ fontSize: 11, padding: "4px 8px" }} />
      <Btn onClick={() => apply("custom")} style={{ padding: "4px 10px", fontSize: 11 }}>{t.apply}</Btn>
    </>}
  </div>;
}

function DestinationSelect({ t, province, municipality, onProvinceChange, onMunicipalityChange }) {
  const prov = DR_PROVINCES.find(p => p.province === province);
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
    <Sel label={t.province} value={province} onChange={e => onProvinceChange(e.target.value)}>
      <option value="">--</option>
      {DR_PROVINCES.map(p => <option key={p.province} value={p.province}>{p.province}</option>)}
    </Sel>
    <Sel label={t.municipality} value={municipality} onChange={e => onMunicipalityChange(e.target.value)}>
      <option value="">--</option>
      {prov && prov.municipalities.map(m => <option key={m} value={m}>{m}</option>)}
    </Sel>
  </div>;
}

// ─── Conduce PDF Generator (in-browser) ──────────────────────────────────────
function generateConduce(trip, client, truck, driver, t) {
  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) return;
  const helpers = (trip.helpers || []).map((h, i) => `<tr><td>Ayudante ${i + 1}</td><td>${h.name}</td></tr>`).join("");
  w.document.write(`<!DOCTYPE html><html><head><title>Conduce #${trip.id}</title>
  <style>body{font-family:Arial,sans-serif;padding:40px;color:#222}
  .header{display:flex;justify-content:space-between;border-bottom:3px solid #1a3d7c;padding-bottom:15px;margin-bottom:20px}
  .logo{font-size:28px;font-weight:bold;color:#1a3d7c}
  .subtitle{color:#666;font-size:12px}
  table{width:100%;border-collapse:collapse;margin:15px 0}
  th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:13px}
  th{background:#f0f4f8;font-weight:600;color:#1a3d7c}
  .section{margin:20px 0;font-size:16px;font-weight:bold;color:#1a3d7c;border-bottom:1px solid #1a3d7c;padding-bottom:5px}
  .footer{margin-top:40px;display:flex;justify-content:space-between}
  .sig{border-top:1px solid #333;width:200px;text-align:center;padding-top:5px;font-size:12px}
  @media print{body{padding:20px}}</style></head><body>
  <div class="header"><div><div class="logo">B-Logix</div><div class="subtitle">Logística y Distribución | RNC: 000-000000-0</div>
  <div class="subtitle">Santo Domingo, República Dominicana</div></div>
  <div style="text-align:right"><div style="font-size:20px;font-weight:bold;color:#1a3d7c">CONDUCE</div>
  <div style="font-size:14px"># ${String(trip.id).padStart(6, "0")}</div>
  <div class="subtitle">Fecha: ${trip.date}</div></div></div>
  <div class="section">Información del Viaje</div>
  <table><tr><th>Destino</th><td>${trip.municipality}, ${trip.province}</td></tr>
  <tr><th>Cliente</th><td>${client?.companyName || "—"}</td></tr>
  <tr><th>Camión</th><td>${truck?.plate || "—"} (${truck?.type || ""})</td></tr>
  <tr><th>Conductor</th><td>${driver?.name || "—"} | Lic: ${driver?.license || "—"}</td></tr>
  <tr><th>Carga</th><td>${trip.cargo}</td></tr>
  <tr><th>Peso</th><td>${trip.weight} tons</td></tr>
  <tr><th>Tarifa</th><td>${fmt(trip.revenue)}</td></tr>
  ${trip.invoiceRef ? `<tr><th>Ref. Factura</th><td>${trip.invoiceRef}</td></tr>` : ""}
  ${helpers ? `<tr><th colspan="2" style="text-align:center">Personal</th></tr>${helpers}` : ""}
  </table>
  <div class="footer"><div class="sig">Despachador</div><div class="sig">Conductor</div><div class="sig">Recibido por</div></div>
  <script>setTimeout(()=>window.print(),500)</script></body></html>`);
  w.document.close();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── LOGIN PAGE ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function LoginPage({ t, onLogin, allUsers }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = () => {
    const user = allUsers.find(u => u.username === username && u.password === password);
    if (user) { onLogin(user); setError(""); }
    else setError(t.invalidLogin);
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg, ${colors.bg} 0%, #0a1628 50%, #0f1d35 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ width: 400, background: colors.card, borderRadius: 16, border: `1px solid ${colors.border}`, padding: 40, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${colors.accent}, ${colors.green})`, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <Truck size={28} color="white" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: colors.text, margin: "8px 0 4px", letterSpacing: -0.5 }}>B-Logix</h1>
          <p style={{ color: colors.textMuted, fontSize: 13, margin: 0 }}>{t.loginTitle}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Inp label={t.username} value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" onKeyDown={e => e.key === "Enter" && handleLogin()} />
          <div style={{ position: "relative" }}>
            <Inp label={t.password} type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" style={{ width: "100%", paddingRight: 36 }} onKeyDown={e => e.key === "Enter" && handleLogin()} />
            <button onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 8, bottom: 6, background: "none", border: "none", color: colors.textMuted, cursor: "pointer" }}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          {error && <div style={{ color: colors.red, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><AlertCircle size={14} /> {error}</div>}
          <Btn onClick={handleLogin} style={{ width: "100%", justifyContent: "center", padding: "10px 0", fontSize: 14, marginTop: 4 }}><LogIn size={16} /> {t.login}</Btn>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN APP ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// ─── CFO Chat (floating AI analyst) ──────────────────────────────────────────
function CfoChat({ data, t }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { role: "assistant", content: "¡Hola! Soy tu CFO analista. Tengo acceso a todos tus datos en tiempo real.\n¿En qué te ayudo hoy?" }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send() {
    if (!input.trim() || busy) return;
    const userMsg = { role: "user", content: input.trim() };
    const next = [...msgs, userMsg];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, history: msgs, data }),
      });
      const json = await res.json();
      setMsgs([...next, { role: "assistant", content: json.reply || json.error || "Error." }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "Error de conexión. Intenta de nuevo." }]);
    }
    setBusy(false);
  }

  return <>
    <button onClick={() => setOpen(o => !o)} title="CFO Analista IA" style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 1000, width: 52, height: 52,
      borderRadius: "50%", border: "none", background: `linear-gradient(135deg,${colors.accent},${colors.green})`,
      color: "#fff", fontSize: 22, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>💼</button>

    {open && <div style={{
      position: "fixed", bottom: 88, right: 24, zIndex: 1000, width: 360, height: 500,
      background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 14,
      display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.5)"
    }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: colors.text }}>💼 CFO Analista</div>
          <div style={{ fontSize: 10, color: colors.textMuted }}>Claude · datos en tiempo real</div>
        </div>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, fontSize: 16 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{
            maxWidth: "88%", padding: "8px 12px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.55,
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            background: m.role === "user" ? colors.accent : colors.bg,
            color: m.role === "user" ? "#fff" : colors.text, whiteSpace: "pre-wrap",
          }}>{m.content}</div>
        ))}
        {busy && <div style={{ alignSelf: "flex-start", padding: "8px 12px", borderRadius: 10, background: colors.bg, color: colors.textMuted, fontSize: 12 }}>Analizando datos...</div>}
        <div ref={endRef} />
      </div>

      <div style={{ padding: "10px 12px", borderTop: `1px solid ${colors.border}`, display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Pregunta sobre tus finanzas..."
          style={{ flex: 1, padding: "8px 11px", borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 12.5, outline: "none" }}
        />
        <button onClick={send} disabled={busy || !input.trim()} style={{
          padding: "8px 13px", borderRadius: 8, border: "none", fontSize: 15,
          background: busy || !input.trim() ? colors.border : colors.accent,
          color: "#fff", cursor: busy ? "not-allowed" : "pointer"
        }}>➤</button>
      </div>
    </div>}
  </>;
}

export default function App() {
  const [lang, setLang] = useState("es");
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth > 768 : true);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth <= 768 : false);
  useEffect(() => {
    const handle = () => { const m = window.innerWidth <= 768; setIsMobile(m); if (!m) setSidebarOpen(true); };
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);
  const t = translations[lang];

  // Data
  const [clients, setClients] = useState([]);
  const [partners, setPartners] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [trips, setTrips] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [brokers, setBrokers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [settlementStatus, setSettlementStatus] = useState(initSettlementStatus);
  const [syncStatus, setSyncStatus] = useState("idle"); // "idle" | "saving" | "saved" | "offline"
  const saveTimerRef = useRef(null);
  const dataLoadedRef = useRef(false); // guard: block auto-save until Supabase data is loaded
  
  // ── Load data from API / localStorage on first mount ─────────────────────
  useEffect(() => {
    loadData().then(({ source, data }) => {
      if (data && Object.keys(data).length > 0) {
        if (Array.isArray(data.clients)) setClients(data.clients);
        if (Array.isArray(data.partners))   setPartners(data.partners);
        if (Array.isArray(data.trucks))     setTrucks(data.trucks);
        if (Array.isArray(data.drivers))    setDrivers(data.drivers);
        if (Array.isArray(data.trips))      setTrips(data.trips);
        if (Array.isArray(data.expenses))   setExpenses(data.expenses);
        if (Array.isArray(data.brokers))    setBrokers(data.brokers);
        if (Array.isArray(data.suppliers))  setSuppliers(data.suppliers);
        if (data.settlementStatus)    setSettlementStatus(data.settlementStatus);
      }
      dataLoadedRef.current = true;
      dataLoadedRef.current = true; // now it's safe to auto-save
      setSyncStatus(source === "api" ? "saved" : "offline");
    });
  }, []);

  // ── Auto-save data whenever anything changes (debounced 1.5 s) ───────────
  useEffect(() => {
    if (!dataLoadedRef.current) return; // don't save until real data is loaded
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (!dataLoadedRef.current) return;
    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus("saving");
      const result = await saveData({ clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, settlementStatus });
      setSyncStatus(result.saved === "api" ? "saved" : "offline");
    }, 1500);
    return () => clearTimeout(saveTimerRef.current);
  }, [clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, settlementStatus]);

  // Build dynamic user list: static admins + all partners + all drivers
  const allUsers = [
    ...USERS.filter(u => u.role === "admin"),
    ...partners.map(p => ({ id: `p-${p.id}`, username: p.username, password: p.password, role: "partner", name: p.name, refId: p.id })),
    ...drivers.map(d => ({ id: `d-${d.id}`, username: d.username, password: d.password, role: "driver", name: d.name, refId: d.id })),
  ];

  if (!user) return <LoginPage t={t} allUsers={allUsers} onLogin={(u) => { setUser(u); setPage(u.role === "partner" ? "partnerDash" : u.role === "driver" ? "driverDash" : "dashboard"); }} />;

  const isAdmin = user.role === "admin";
  const isPartner = user.role === "partner";
  const isDriver = user.role === "driver";

  const alerts = isAdmin ? computeAlerts({ trips, expenses, clients, drivers, trucks, partners, brokers, settlementStatus }) : [];
  const alertErrors = alerts.filter(a => a.severity === "error").length;
  const alertWarnings = alerts.filter(a => a.severity === "warning").length;
  const alertCount = alertErrors + alertWarnings;

  const adminNav = [
    { id: "dashboard", icon: LayoutDashboard, label: t.dashboard },
    { id: "clients", icon: Building2, label: t.clients },
    { id: "trips", icon: Route, label: t.trips },
    { id: "fleet", icon: Truck, label: t.fleet },
    { id: "drivers", icon: Users, label: t.drivers },
    { id: "partners", icon: UserCog, label: t.partners },
    { id: "brokers", icon: Briefcase, label: t.brokers },
    { id: "expenses", icon: Receipt, label: t.expenses },
    { id: "suppliers", icon: Store, label: t.suppliers },
    { id: "settlements", icon: Handshake, label: t.settlements },
    { id: "agents", icon: ShieldCheck, label: t.agents, badge: alertCount },
  ];
  const partnerNav = [
    { id: "partnerDash", icon: LayoutDashboard, label: t.partnerDashboard },
    { id: "settlements", icon: Handshake, label: t.settlements },
  ];
  const driverNav = [
    { id: "driverDash", icon: LayoutDashboard, label: t.dashboard },
  ];
  const navItems = isAdmin ? adminNav : isPartner ? partnerNav : driverNav;

  // Partner-filtered data
  const partner = isPartner ? partners.find(p => p.name === user.name) : null;
  const partnerTruckIds = partner ? trucks.filter(tk => tk.partnerId === partner.id).map(tk => tk.id) : [];
  const driverObj = isDriver ? drivers.find(d => d.name === user.name) : null;

  const ctx = { t, user, clients, setClients, partners, setPartners, trucks, setTrucks, drivers, setDrivers, trips, setTrips, expenses, setExpenses, brokers, setBrokers, suppliers, setSuppliers, settlementStatus, setSettlementStatus, partner, partnerTruckIds, driverObj, alerts };

  return (
    <div style={{ display: "flex", height: "100vh", background: colors.bg, color: colors.text, fontFamily: "'Inter',-apple-system,sans-serif", fontSize: 13 }}>
      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 190 }} />}
      {/* Sidebar */}
      <div style={{ width: isMobile ? (sidebarOpen ? 220 : 0) : (sidebarOpen ? 220 : 60), ...(isMobile ? { position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200 } : {}), background: colors.sidebar, borderRight: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", transition: "width 0.2s", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 12px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${colors.border}`, cursor: "pointer" }} onClick={() => setSidebarOpen(!sidebarOpen)}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${colors.accent}, ${colors.green})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Truck size={16} color="white" /></div>
          {sidebarOpen && <span style={{ fontWeight: 700, fontSize: 16 }}>B-Logix</span>}
        </div>

        <nav style={{ flex: 1, padding: "10px 6px", display: "flex", flexDirection: "column", gap: 1 }}>
          {navItems.map(item => {
            const act = page === item.id; const Icon = item.icon;
            return <button key={item.id} onClick={() => { setPage(item.id); if (isMobile) setSidebarOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 7, border: "none", background: act ? colors.accent : "transparent", color: act ? "white" : colors.text, cursor: "pointer", fontSize: 13, textAlign: "left", width: "100%", transition: "background 0.15s", position: "relative" }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <Icon size={16} />
                {item.badge > 0 && <span style={{ position: "absolute", top: -5, right: -6, background: colors.red, color: "white", borderRadius: 10, fontSize: 9, fontWeight: 700, minWidth: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{item.badge > 99 ? "99+" : item.badge}</span>}
              </div>
              {sidebarOpen && <span style={{ whiteSpace: "nowrap", flex: 1 }}>{item.label}</span>}
              {sidebarOpen && item.badge > 0 && <span style={{ background: act ? "rgba(255,255,255,0.3)" : colors.red + "22", color: act ? "white" : colors.red, borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 7px" }}>{item.badge}</span>}
            </button>;
          })}
        </nav>

        <div style={{ padding: "8px 6px", borderTop: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={() => setLang(lang === "en" ? "es" : "en")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: 12, width: "100%" }}>
            <Globe size={14} />{sidebarOpen && <span>{lang === "en" ? "Español" : "English"}</span>}
          </button>
          <button onClick={() => setUser(null)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", color: colors.red, cursor: "pointer", fontSize: 12, width: "100%" }}>
            <LogIn size={14} />{sidebarOpen && <span>{t.logout}</span>}
          </button>
          {sidebarOpen && <div style={{ padding: "6px 10px", fontSize: 11, color: colors.textMuted }}><UserCheck size={12} /> {user.name} <Badge label={user.role} color={user.role === "admin" ? colors.green : user.role === "partner" ? colors.orange : colors.accent} /></div>}
          {sidebarOpen && (
            <div style={{ padding: "4px 10px 8px", fontSize: 10, color: syncStatus === "saved" ? colors.green : syncStatus === "saving" ? colors.orange : syncStatus === "offline" ? colors.textMuted : colors.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: syncStatus === "saved" ? colors.green : syncStatus === "saving" ? colors.orange : "#555", display: "inline-block" }} />
              {syncStatus === "saved" ? "Guardado ✓" : syncStatus === "saving" ? "Guardando..." : "Sin conexión (local)"}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "56px 14px 14px" : 20, position: "relative" }}>
        {/* Mobile hamburger */}
        {isMobile && <button onClick={() => setSidebarOpen(true)} style={{ position: "fixed", top: 10, left: 10, zIndex: 150, background: colors.accent, border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: "white", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}><Menu size={18} /></button>}
        {page === "dashboard" && isAdmin && <AdminDashboard {...ctx} setPage={setPage} />}
        {page === "partnerDash" && isPartner && <PartnerDashboard {...ctx} />}
        {page === "driverDash" && isDriver && <DriverDashboard {...ctx} />}
        {page === "clients" && <ClientsPage {...ctx} />}
        {page === "trips" && <TripsPage {...ctx} />}
        {page === "fleet" && <FleetPage {...ctx} />}
        {page === "drivers" && <DriversPage {...ctx} />}
        {page === "partners" && isAdmin && <PartnersPage {...ctx} />}
        {page === "brokers" && <BrokersPage {...ctx} />}
        {page === "expenses" && <ExpensesPage {...ctx} />}
        {page === "suppliers" && <SuppliersPage {...ctx} />}
        {page === "settlements" && <SettlementsPage {...ctx} />}
        {page === "agents" && isAdmin && <AgentsPage {...ctx} />}
      </div>
      {isAdmin && <CfoChat data={{ clients, partners, trucks, drivers, trips, expenses, brokers, suppliers, settlementStatus }} t={t} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function AdminDashboard({ t, trips, trucks, expenses, clients, partners, suppliers, alerts, setPage }) {
  const cm = monthStr();
  const mt = trips.filter(tr => tr.date.startsWith(cm));
  const rev = mt.reduce((s, tr) => s + tr.revenue, 0);
  const exp = expenses.filter(e => mt.some(tr => tr.id === e.tripId)).reduce((s, e) => s + e.amount, 0);
  const errCount = alerts.filter(a => a.severity === "error").length;
  const warnCount = alerts.filter(a => a.severity === "warning").length;
  const infoCount = alerts.filter(a => a.severity === "info").length;

  return <div>
    <PageHeader title={`${t.dashboard} — B-Logix`} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
      <StatCard icon={Truck} label={t.activeTrucks} value={trucks.length} color={colors.accent} />
      <StatCard icon={Building2} label={t.activeClients} value={clients.filter(c => c.status === "active").length} color={colors.purple} />
      <StatCard icon={TrendingUp} label={t.monthRevenue} value={fmt(rev)} color={colors.green} />
      <StatCard icon={TrendingDown} label={t.monthExpenses} value={fmt(exp)} color={colors.orange} />
      <StatCard icon={DollarSign} label={t.monthProfit} value={fmt(rev - exp)} color={rev - exp >= 0 ? colors.green : colors.red} />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
      {/* Agent Summary */}
      <Card style={{ cursor: "pointer" }} onClick={() => setPage("agents")}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={16} color={colors.accent} /> {t.agentsTitle}</h3>
        {alerts.length === 0
          ? <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", color: colors.green, fontSize: 13 }}><CheckCircle2 size={16} /> {t.allClear}</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {errCount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: colors.red + "12", borderRadius: 8, border: `1px solid ${colors.red}30` }}>
                <AlertCircle size={16} color={colors.red} />
                <span style={{ fontWeight: 700, color: colors.red, fontSize: 14 }}>{errCount}</span>
                <span style={{ color: colors.red, fontSize: 13 }}>{t.agentError}{errCount > 1 ? "s" : ""}</span>
              </div>}
              {warnCount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: colors.orange + "12", borderRadius: 8, border: `1px solid ${colors.orange}30` }}>
                <AlertTriangle size={16} color={colors.orange} />
                <span style={{ fontWeight: 700, color: colors.orange, fontSize: 14 }}>{warnCount}</span>
                <span style={{ color: colors.orange, fontSize: 13 }}>{t.agentWarning}{warnCount > 1 ? "s" : ""}</span>
              </div>}
              {infoCount > 0 && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: colors.accent + "12", borderRadius: 8, border: `1px solid ${colors.accent}30` }}>
                <Bell size={16} color={colors.accent} />
                <span style={{ fontWeight: 700, color: colors.accent, fontSize: 14 }}>{infoCount}</span>
                <span style={{ color: colors.accent, fontSize: 13 }}>{t.agentInfo}</span>
              </div>}
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>→ {t.agents} para ver detalles</div>
            </div>}
      </Card>

      {/* Recent Trips */}
      <Card>
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{t.recentTrips}</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            <Th>{t.date}</Th><Th>{t.client}</Th><Th>{t.destination}</Th><Th align="right">{t.rate}</Th><Th align="center">{t.status}</Th>
          </tr></thead>
          <tbody>
            {trips.slice(-5).reverse().map(tr => {
              const cl = clients.find(c => c.id === tr.clientId);
              return <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                <Td>{tr.date}</Td><Td bold>{cl?.companyName || "—"}</Td><Td>{tr.municipality}</Td>
                <Td align="right" bold color={colors.green}>{fmt(tr.revenue)}</Td>
                <Td align="center"><StatusBadge status={tr.status} t={t} /></Td>
              </tr>;
            })}
          </tbody>
        </table>
      </Card>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── AGENTS PAGE ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function AgentsPage({ t, alerts }) {
  const [filter, setFilter] = useState("all");
  const severityColor = { error: colors.red, warning: colors.orange, info: colors.accent };
  const severityIcon = { error: AlertCircle, warning: AlertTriangle, info: Bell };
  const severityBg = { error: colors.red + "10", warning: colors.orange + "10", info: colors.accent + "10" };
  const severityBorder = { error: colors.red + "30", warning: colors.orange + "30", info: colors.accent + "30" };

  const errCount = alerts.filter(a => a.severity === "error").length;
  const warnCount = alerts.filter(a => a.severity === "warning").length;
  const infoCount = alerts.filter(a => a.severity === "info").length;

  const visible = filter === "all" ? alerts : alerts.filter(a => a.severity === filter);

  // Group by category
  const grouped = {};
  visible.forEach(a => {
    if (!grouped[a.category]) grouped[a.category] = [];
    grouped[a.category].push(a);
  });

  return <div>
    <PageHeader title={t.agentsTitle} />

    {/* Summary bar */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
      {[
        { key: "all", label: "Total", count: alerts.length, color: colors.textMuted },
        { key: "error", label: t.agentError, count: errCount, color: colors.red },
        { key: "warning", label: t.agentWarning, count: warnCount, color: colors.orange },
        { key: "info", label: t.agentInfo, count: infoCount, color: colors.accent },
      ].map(s => (
        <button key={s.key} onClick={() => setFilter(s.key)} style={{ padding: "10px 14px", borderRadius: 10, border: `2px solid ${filter === s.key ? s.color : colors.border}`, background: filter === s.key ? s.color + "12" : colors.card, cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
          <div style={{ fontSize: 11, color: colors.textMuted }}>{s.label}</div>
        </button>
      ))}
    </div>

    {visible.length === 0
      ? <Card><div style={{ display: "flex", alignItems: "center", gap: 10, padding: 20, color: colors.green, fontSize: 14 }}><CheckCircle2 size={20} /> {t.allClear}</div></Card>
      : Object.entries(grouped).map(([cat, catAlerts]) => {
          const severity = catAlerts[0].severity;
          const Icon = severityIcon[severity];
          return <Card key={cat} style={{ marginBottom: 12, border: `1px solid ${severityBorder[severity]}`, background: severityBg[severity] }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Icon size={15} color={severityColor[severity]} />
              <span style={{ fontWeight: 700, fontSize: 13, color: severityColor[severity] }}>{t.agentCat?.[cat] || cat}</span>
              <span style={{ background: severityColor[severity] + "22", color: severityColor[severity], borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "2px 8px" }}>{catAlerts.length}</span>
            </div>
            {catAlerts.map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderTop: `1px solid ${severityColor[severity]}18` }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: severityColor[severity], marginTop: 5, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: colors.text, lineHeight: 1.5 }}>{a.msg}</span>
              </div>
            ))}
          </Card>;
        })}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PARTNER DASHBOARD ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function PartnerDashboard({ t, trips, trucks, expenses, partner, partnerTruckIds, clients, settlementStatus, setSettlementStatus }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [truckFilter, setTruckFilter] = useState("all");

  const myTrucks = trucks.filter(tk => partnerTruckIds.includes(tk.id));
  let filtered = trips.filter(tr => partnerTruckIds.includes(tr.truckId));
  if (dateFrom) filtered = filtered.filter(tr => tr.date >= dateFrom);
  if (dateTo) filtered = filtered.filter(tr => tr.date <= dateTo);
  if (truckFilter !== "all") filtered = filtered.filter(tr => tr.truckId === Number(truckFilter));

  const rev = filtered.reduce((s, tr) => s + tr.revenue, 0);
  const exp = expenses.filter(e => filtered.some(tr => tr.id === e.tripId)).reduce((s, e) => s + e.amount, 0);
  const net = rev - exp;
  const comm = net * ((partner?.commissionPct || 0) / 100);

  return <div>
    <PageHeader title={`${t.partnerDashboard} — ${partner?.name || ""}`} />
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
      <DateFilter t={t} onFilter={(f, to) => { setDateFrom(f); setDateTo(to); }} />
      <Sel value={truckFilter} onChange={e => setTruckFilter(e.target.value)} style={{ fontSize: 11 }}>
        <option value="all">Todos Mis Camiones</option>
        {myTrucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}
      </Sel>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 20 }}>
      <StatCard icon={Truck} label={t.activeTrucks} value={myTrucks.length} color={colors.accent} />
      <StatCard icon={Route} label={t.totalTrips} value={filtered.length} color={colors.cyan} />
      <StatCard icon={TrendingUp} label={t.totalRevenue} value={fmt(rev)} color={colors.green} />
      <StatCard icon={TrendingDown} label={t.totalExpenses} value={fmt(exp)} color={colors.orange} />
      <StatCard icon={DollarSign} label={t.profitLoss} value={fmt(net)} color={net >= 0 ? colors.green : colors.red} />
      <StatCard icon={Handshake} label={`${t.commission} (${partner?.commissionPct}%)`} value={fmt(comm)} color={colors.purple} sub={`${t.partnerEarnings}: ${fmt(net - comm)}`} />
    </div>
    <Card>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{t.trips}</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>{t.date}</Th><Th>{t.destination}</Th><Th>{t.client}</Th><Th>{t.truck}</Th><Th align="right">{t.revenue}</Th><Th align="center">{t.status}</Th><Th align="center">{t.document}</Th>
        </tr></thead>
        <tbody>
          {filtered.map(tr => {
            const cl = clients.find(c => c.id === tr.clientId);
            const tk = trucks.find(t => t.id === tr.truckId);
            return <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
              <Td>{tr.date}</Td><Td>{tr.municipality}</Td><Td>{cl?.companyName || "—"}</Td><Td>{tk?.plate || "—"}</Td>
              <Td align="right" bold color={colors.green}>{fmt(tr.revenue)}</Td>
              <Td align="center"><StatusBadge status={tr.status} t={t} /></Td>
              <Td align="center"><Badge label={tr.docStatus === "delivered" ? t.deliveredDocs : t.pendingDocs} color={tr.docStatus === "delivered" ? colors.green : colors.orange} /></Td>
            </tr>;
          })}
        </tbody>
      </table>
    </Card>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── DRIVER DASHBOARD ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function DriverDashboard({ t, user, trips, trucks, expenses, clients, drivers, driverObj, setTrips, setExpenses, brokers }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const [rateMsg, setRateMsg] = useState("");

  const emptyForm = { date: today(), province: "", municipality: "", truckId: driverObj?.truckId || trucks[0]?.id || "", driverId: driverObj?.id || "", clientId: "", brokerId: "", cargo: "", weight: "", revenue: "", status: "pending", invoiceRef: "", docStatus: "pending", podDelivered: false, numHelpers: 0, helperPayEach: "", discounts: [] };

  const openNew = () => { setForm({ ...emptyForm, createdBy: user?.name || driverObj?.name || "" }); setShowForm(true); setRateMsg(""); };

  const handleClientChange = (cid) => {
    const cl = clients.find(c => c.id === Number(cid));
    const f = { ...form, clientId: Number(cid) || "" };
    if (cl) {
      if (cl.rules.defaultBrokerId) f.brokerId = cl.rules.defaultBrokerId;
      tryApplyRate(f, cl);
    }
    setForm(f);
  };

  const tryApplyRate = (f, cl) => {
    if (!cl) cl = clients.find(c => c.id === Number(f.clientId));
    if (cl && f.province && f.municipality) {
      const rate = cl.rates.find(r => r.province === f.province && r.municipality === f.municipality);
      if (rate) {
        const tk = trucks.find(t2 => t2.id === Number(f.truckId));
        const size = tk?.size || "T1";
        const price = size === "T2" ? (rate.priceT2 ?? rate.price ?? 0) : (rate.priceT1 ?? rate.price ?? 0);
        f.revenue = price; setRateMsg(`${t.rateApplied} (${size}): ${fmt(price)}`); return;
      }
    }
    setRateMsg("");
  };

  const handleDestChange = (field, val) => {
    const f = { ...form, [field]: val };
    if (field === "province") { f.municipality = ""; setRateMsg(""); }
    else tryApplyRate(f, null);
    setForm(f);
  };

  const saveTrip = () => {
    if (!form.province || !form.municipality) return;
    const cl = clients.find(c => c.id === Number(form.clientId));
    if (cl?.rules.requiresInvoiceRef && !form.invoiceRef) { alert(t.invoiceRefRequired); return; }
    const helpersPay = Number(form.helperPayEach) || 0;
    const helpersArr = Array.from({ length: Number(form.numHelpers) || 0 }, (_, i) => ({ name: `Ayudante ${i + 1}`, pay: helpersPay }));
    const data = { ...form, truckId: Number(form.truckId), driverId: driverObj?.id, clientId: Number(form.clientId) || null, brokerId: Number(form.brokerId) || null, weight: Number(form.weight) || 0, revenue: Number(form.revenue) || 0, helpers: helpersArr };
    const newId = nxId(trips);
    const newTrips = [...trips, { ...data, id: newId }];
    setTrips(newTrips);
    // Auto-deduct broker commission if assigned
    const broker = data.brokerId ? brokers.find(b => b.id === data.brokerId) : null;
    if (broker && data.revenue > 0) {
      const fee = Math.round(data.revenue * broker.commissionPct / 100);
      setExpenses(prev => [...prev, { id: nxId(prev), tripId: newId, date: data.date, category: "broker_commission", amount: fee, paymentMethod: "transfer", description: `${t.brokerAutoDeducted}: ${broker.name} (${broker.commissionPct}%)`, supplierId: null }]);
    }
    setShowForm(false);
  };

  const addHelper = () => setForm({ ...form, helpers: [...(form.helpers || []), { name: "", pay: 0 }] });
  const addDiscountRow = () => setForm({ ...form, discounts: [...(form.discounts || []), { desc: "", amount: 0 }] });

  let myTrips = trips.filter(tr => tr.driverId === driverObj?.id);
  if (dateFrom) myTrips = myTrips.filter(tr => tr.date >= dateFrom);
  if (dateTo) myTrips = myTrips.filter(tr => tr.date <= dateTo);

  // Payroll calc
  const tripPay = myTrips.reduce((s, tr) => {
    if (driverObj?.salaryType === "perTrip") {
      const rate = (driverObj.rates || []).find(r => r.province === tr.province && r.municipality === tr.municipality);
      if (!rate) return s;
      const tk = trucks.find(t2 => t2.id === tr.truckId);
      const size = tk?.size || "T1";
      return s + (size === "T2" ? (rate.priceT2 ?? rate.price ?? 0) : (rate.priceT1 ?? rate.price ?? 0));
    }
    if (driverObj?.salaryType === "porcentaje") {
      const pct = (driverObj.percentageAmount || 0) / 100;
      return s + (tr.revenue || 0) * pct;
    }
    return s;
  }, 0);
  const helperPay = myTrips.reduce((s, tr) => s + (tr.helpers || []).reduce((h, x) => h + x.pay, 0), 0);
  const discountsTotal = myTrips.reduce((s, tr) => s + (tr.discounts || []).reduce((d, x) => d + x.amount, 0), 0);
  const fixedPay = driverObj?.salaryType === "fixed" ? driverObj.fixedAmount : 0;
  const totalEarnings = driverObj?.salaryType === "fixed" ? fixedPay : tripPay;

  const pendingDocs = myTrips.filter(tr => tr.docStatus === "pending").length;
  const completed = myTrips.filter(tr => tr.status === "delivered").length;
  const selectedClient = clients.find(c => c.id === Number(form.clientId));

  return <div>
    <PageHeader title={`${t.dashboard} — ${driverObj?.name || ""}`} action={<Btn onClick={openNew}><Plus size={14} /> {t.newTrip}</Btn>} />
    <DateFilter t={t} onFilter={(f, to) => { setDateFrom(f); setDateTo(to); }} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, margin: "16px 0" }}>
      <StatCard icon={Route} label={t.totalTrips} value={myTrips.length} color={colors.accent} />
      <StatCard icon={CheckCircle2} label={t.delivered} value={completed} color={colors.green} />
      <StatCard icon={Clock} label={t.pending} value={myTrips.filter(tr => tr.status === "pending" || tr.status === "in_transit").length} color={colors.yellow} />
      <StatCard icon={FileText} label={t.pendingDocs} value={pendingDocs} color={colors.orange} />
    </div>

    {/* Payroll Summary */}
    <Card style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}><Banknote size={16} color={colors.green} /> {t.payrollSummary}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <div><div style={{ fontSize: 11, color: colors.textMuted }}>{driverObj?.salaryType === "fixed" ? t.fixedSalary : driverObj?.salaryType === "porcentaje" ? `${t.porcentaje} (${driverObj.percentageAmount || 0}%)` : t.tripPay}</div><div style={{ fontSize: 20, fontWeight: 700, color: colors.green }}>{fmt(totalEarnings)}</div></div>
        <div><div style={{ fontSize: 11, color: colors.textMuted }}>{t.helperPay}</div><div style={{ fontSize: 20, fontWeight: 700, color: colors.orange }}>{fmt(helperPay)}</div></div>
        <div><div style={{ fontSize: 11, color: colors.textMuted }}>{t.totalDiscounts}</div><div style={{ fontSize: 20, fontWeight: 700, color: colors.red }}>{fmt(discountsTotal)}</div></div>
        <div><div style={{ fontSize: 11, color: colors.textMuted }}>{t.netPay}</div><div style={{ fontSize: 20, fontWeight: 700, color: colors.cyan }}>{fmt(totalEarnings + helperPay - discountsTotal)}</div></div>
      </div>
    </Card>

    {/* New Trip Modal */}
    {showForm && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
      <div onClick={e => e.stopPropagation()} style={{ background: colors.card, borderRadius: 14, padding: 24, width: 560, maxHeight: "88vh", overflowY: "auto", border: `1px solid ${colors.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}><Route size={18} color={colors.accent} /> {t.newTrip}</h3>
          <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 10 }}>
          <Inp label={t.date} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Sel label={t.client} value={form.clientId} onChange={e => handleClientChange(e.target.value)}>
            <option value="">{t.selectClient}</option>
            {clients.filter(c => c.status === "active").map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </Sel>
        </div>
        <DestinationSelect t={t} province={form.province} municipality={form.municipality} onProvinceChange={v => handleDestChange("province", v)} onMunicipalityChange={v => handleDestChange("municipality", v)} />
        <div style={{ marginTop: 10 }}>
          <Sel label={t.truck} value={form.truckId} onChange={e => setForm({ ...form, truckId: e.target.value })}>
            {trucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}
          </Sel>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
          <Sel label={t.status} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="pending">{t.pending}</option>
            <option value="in_transit">{t.inTransit}</option>
            <option value="delivered">{t.delivered}</option>
          </Sel>
          {selectedClient?.rules.requiresInvoiceRef && <Inp label={t.invoiceRef + " *"} value={form.invoiceRef} onChange={e => setForm({ ...form, invoiceRef: e.target.value })} style={{ borderColor: !form.invoiceRef ? colors.red : colors.border }} />}
        </div>

        {/* Helpers — quantity only */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}22` }}>
          <Sel label={t.numHelpers} value={form.numHelpers ?? 0} onChange={e => setForm({ ...form, numHelpers: Number(e.target.value) })}>
            {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n === 0 ? "0 — " + t.none : `${n} ayudante${n > 1 ? "s" : ""}`}</option>)}
          </Sel>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}33` }}>
          <Btn onClick={saveTrip} style={{ flex: 1, justifyContent: "center" }}>{t.save}</Btn>
          <Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn>
        </div>
      </div>
    </div>}

    {/* Trip list */}
    <Card>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{t.trips}</h3>
      {myTrips.length === 0
        ? <div style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", padding: 24 }}>{t.noTrips}</div>
        : <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            <Th>{t.date}</Th><Th>{t.destination}</Th><Th>{t.client}</Th><Th>{t.truck}</Th><Th align="right">{t.driverRole} {t.rate}</Th><Th align="center">{t.status}</Th><Th align="center">{t.document}</Th>
          </tr></thead>
          <tbody>
            {myTrips.map(tr => {
              const cl = clients.find(c => c.id === tr.clientId);
              const tk = trucks.find(tk2 => tk2.id === tr.truckId);
              const driverRateObj = driverObj?.salaryType === "perTrip"
                ? (driverObj.rates || []).find(r => r.province === tr.province && r.municipality === tr.municipality)
                : null;
              const driverRate = driverRateObj
                ? ((tk?.size || "T1") === "T2" ? (driverRateObj.priceT2 ?? driverRateObj.price ?? 0) : (driverRateObj.priceT1 ?? driverRateObj.price ?? 0))
                : driverObj?.salaryType === "porcentaje"
                  ? (tr.revenue || 0) * ((driverObj.percentageAmount || 0) / 100)
                  : null;
              const nextStatus = { pending: "in_transit", in_transit: "delivered", delivered: "pending" };
              const stColor = tr.status === "delivered" ? colors.green : tr.status === "in_transit" ? colors.yellow : colors.accent;
              return <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
                <Td>{tr.date}</Td>
                <Td>{tr.municipality}, {tr.province}</Td>
                <Td>{cl?.companyName || "—"}</Td>
                <Td>{tk?.plate || "—"}</Td>
                <Td align="right" bold color={colors.green}>
                  {driverObj?.salaryType === "fixed"
                    ? <span style={{ fontSize: 11, color: colors.textMuted }}>{t.fixedSalary}</span>
                    : driverObj?.salaryType === "porcentaje"
                      ? <span>{fmt(driverRate)} <span style={{ fontSize: 10, color: colors.textMuted }}>({driverObj.percentageAmount || 0}%)</span></span>
                      : driverRate != null ? fmt(driverRate) : <span style={{ fontSize: 11, color: colors.orange }}>—</span>}
                </Td>
                <Td align="center">
                  <button onClick={() => setTrips(trips.map(x => x.id === tr.id ? { ...x, status: nextStatus[x.status] || "pending" } : x))}
                    style={{ padding: "3px 8px", borderRadius: 10, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", background: stColor + "18", color: stColor }}>
                    {tr.status === "delivered" ? t.delivered : tr.status === "in_transit" ? t.inTransit : t.pending}
                  </button>
                </Td>
                <Td align="center"><Badge label={tr.docStatus === "delivered" ? t.deliveredDocs : t.pendingDocs} color={tr.docStatus === "delivered" ? colors.green : colors.orange} /></Td>
              </tr>;
            })}
          </tbody>
        </table>}
    </Card>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── TRIPS PAGE ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function TripsPage({ t, user, trips, setTrips, trucks, drivers, clients, expenses, setExpenses, brokers }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [expModal, setExpModal] = useState(null); // tripId
  const [expForm, setExpForm] = useState({ date: today(), category: "fuel", amount: "", paymentMethod: "cash", description: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  const [rateMsg, setRateMsg] = useState("");

  const emptyForm = { date: today(), province: "", municipality: "", truckId: trucks[0]?.id || "", driverId: drivers[0]?.id || "", clientId: "", brokerId: "", cargo: "", weight: "", revenue: "", status: "pending", invoiceRef: "", docStatus: "pending", podDelivered: false, numHelpers: 0, helperPayEach: "", discounts: [] };

  const openNew = () => { setForm({ ...emptyForm, createdBy: user.name }); setEditId(null); setShowForm(true); setRateMsg(""); };
  const openEdit = (tr) => { setForm({ ...tr }); setEditId(tr.id); setShowForm(true); setRateMsg(""); };

  const handleClientChange = (cid) => {
    const cl = clients.find(c => c.id === Number(cid));
    const f = { ...form, clientId: Number(cid) || "" };
    if (cl) {
      if (cl.rules.requiresDocuments) f.docStatus = "pending";
      if (cl.rules.defaultBrokerId) f.brokerId = cl.rules.defaultBrokerId;
      tryApplyRate(f, cl);
    }
    setForm(f);
  };

  const tryApplyRate = (f, cl) => {
    if (!cl) cl = clients.find(c => c.id === Number(f.clientId));
    if (cl && f.province && f.municipality) {
      const rate = cl.rates.find(r => r.province === f.province && r.municipality === f.municipality);
      if (rate) {
        const tk = trucks.find(t2 => t2.id === Number(f.truckId));
        const size = tk?.size || "T1";
        const price = size === "T2" ? (rate.priceT2 ?? rate.price ?? 0) : (rate.priceT1 ?? rate.price ?? 0);
        f.revenue = price; setRateMsg(`${t.rateApplied} (${size}): ${fmt(price)}`); return;
      }
    }
    setRateMsg("");
  };

  const handleDestChange = (field, val) => {
    const f = { ...form, [field]: val };
    if (field === "province") { f.municipality = ""; setRateMsg(""); }
    else tryApplyRate(f, null);
    setForm(f);
  };

  const saveTrip = () => {
    if (!form.province || !form.municipality) return;
    const cl = clients.find(c => c.id === Number(form.clientId));
    if (cl?.rules.requiresInvoiceRef && !form.invoiceRef) { alert(t.invoiceRefRequired); return; }
    const helpersPay = Number(form.helperPayEach) || 0;
    const helpersArr = Array.from({ length: Number(form.numHelpers) || 0 }, (_, i) => ({ name: `Ayudante ${i + 1}`, pay: helpersPay }));
    const data = { ...form, truckId: Number(form.truckId), driverId: Number(form.driverId), clientId: Number(form.clientId) || null, brokerId: Number(form.brokerId) || null, weight: Number(form.weight) || 0, revenue: Number(form.revenue) || 0, helpers: helpersArr };
    if (editId) {
      setTrips(trips.map(tr => tr.id === editId ? { ...data, id: editId } : tr));
    } else {
      const newId = nxId(trips);
      setTrips([...trips, { ...data, id: newId }]);
      // Auto-deduct broker commission on new trips if broker assigned
      const broker = data.brokerId ? brokers.find(b => b.id === data.brokerId) : null;
      if (broker && data.revenue > 0) {
        const fee = Math.round(data.revenue * broker.commissionPct / 100);
        setExpenses(prev => [...prev, { id: nxId(prev), tripId: newId, date: data.date, category: "broker_commission", amount: fee, paymentMethod: "transfer", description: `${t.brokerAutoDeducted}: ${broker.name} (${broker.commissionPct}%)`, supplierId: null }]);
      }
    }
    setShowForm(false);
  };

  const addExpense = () => {
    if (!expForm.amount || !expModal) return;
    setExpenses([...expenses, { id: nxId(expenses), tripId: expModal, date: expForm.date, category: expForm.category, amount: Number(expForm.amount), paymentMethod: expForm.paymentMethod, description: expForm.description, supplierId: null }]);
    setExpForm({ date: today(), category: "fuel", amount: "", paymentMethod: "cash", description: "" });
  };

  const addHelper = () => setForm({ ...form, helpers: [...form.helpers, { name: "", pay: 0 }] });
  const addDiscountRow = () => setForm({ ...form, discounts: [...form.discounts, { desc: "", amount: 0 }] });

  // Filters
  let filtered = trips;
  if (filterStatus !== "all") filtered = filtered.filter(tr => tr.status === filterStatus);
  if (filterClient !== "all") filtered = filtered.filter(tr => tr.clientId === Number(filterClient));
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(tr => {
      const cl = clients.find(c => c.id === tr.clientId);
      const dk = drivers.find(d => d.id === tr.driverId);
      const tk = trucks.find(t => t.id === tr.truckId);
      return [tr.date, tr.municipality, tr.province, cl?.companyName, dk?.name, tk?.plate, tr.invoiceRef, tr.createdBy, tr.cargo].some(x => x && x.toLowerCase().includes(s));
    });
  }

  const selectedClient = clients.find(c => c.id === Number(form.clientId));

  return <div>
    <PageHeader title={t.trips} action={<Btn onClick={openNew}><Plus size={14} /> {t.newTrip}</Btn>} />

    {/* Filters */}
    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: colors.textMuted }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchPlaceholder} style={{ width: "100%", padding: "7px 10px 7px 30px", borderRadius: 7, border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.text, fontSize: 12, outline: "none" }} />
      </div>
      {["all", "pending", "in_transit", "delivered", "cancelled"].map(s => (
        <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${filterStatus === s ? colors.accent : colors.border}`, background: filterStatus === s ? colors.accent + "18" : "transparent", color: filterStatus === s ? colors.accentLight : colors.textMuted, cursor: "pointer", fontSize: 11 }}>
          {s === "all" ? t.all : s === "in_transit" ? t.inTransit : t[s]}
        </button>
      ))}
      <Sel value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ fontSize: 11 }}>
        <option value="all">{t.all} {t.clients}</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
      </Sel>
    </div>

    {/* Trip Modal */}
    {showForm && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowForm(false)}>
      <div onClick={e => e.stopPropagation()} style={{ background: colors.card, borderRadius: 14, padding: 24, width: 620, maxHeight: "90vh", overflowY: "auto", border: `1px solid ${colors.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}><Route size={18} color={colors.accent} /> {editId ? t.editTrip : t.newTrip}</h3>
          <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: colors.textMuted, cursor: "pointer", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 12, marginBottom: 10 }}>
          <Inp label={t.date} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Sel label={t.client} value={form.clientId} onChange={e => handleClientChange(e.target.value)}>
            <option value="">{t.selectClient}</option>
            {clients.filter(c => c.status === "active").map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </Sel>
          <Sel label={t.status} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option value="pending">{t.pending}</option><option value="in_transit">{t.inTransit}</option><option value="delivered">{t.delivered}</option><option value="cancelled">{t.cancelled}</option>
          </Sel>
        </div>
        <DestinationSelect t={t} province={form.province} municipality={form.municipality} onProvinceChange={v => handleDestChange("province", v)} onMunicipalityChange={v => handleDestChange("municipality", v)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
          <Sel label={t.truck} value={form.truckId} onChange={e => setForm({ ...form, truckId: e.target.value })}>{trucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}</Sel>
          <Sel label={t.driver} value={form.driverId} onChange={e => setForm({ ...form, driverId: e.target.value })}>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</Sel>
          <Sel label={t.broker + " (opt.)"} value={form.brokerId || ""} onChange={e => setForm({ ...form, brokerId: e.target.value })}><option value="">{t.none}</option>{brokers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.commissionPct}%)</option>)}</Sel>
          <div>
            <Inp label={t.rate} type="number" value={form.revenue} onChange={e => setForm({ ...form, revenue: e.target.value })} />
            {rateMsg && <div style={{ fontSize: 10, color: colors.green, marginTop: 3 }}><CheckCircle2 size={10} /> {rateMsg}</div>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginTop: 10 }}>
          <Inp label={t.cargo} value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} />
          <Inp label={t.weight} type="number" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} />
          {selectedClient?.rules.requiresInvoiceRef && <Inp label={t.invoiceRef + " *"} value={form.invoiceRef} onChange={e => setForm({ ...form, invoiceRef: e.target.value })} style={{ borderColor: !form.invoiceRef ? colors.red : colors.border }} />}
        </div>

        {/* Client Rules Banner */}
        {selectedClient && <div style={{ margin: "10px 0", padding: 10, background: colors.purple + "08", borderRadius: 8, border: `1px solid ${colors.purple}30`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
          <Badge label={`${selectedClient.rules.paymentTerms}d`} color={colors.accent} icon={Calendar} />
          {selectedClient.rules.requiresPOD && <Badge label="POD" color={colors.orange} icon={FileCheck} />}
          {selectedClient.rules.requiresInvoiceRef && <Badge label={t.invoiceRef} color={colors.red} icon={Hash} />}
          {selectedClient.rules.requiresDocuments && <Badge label={t.document} color={colors.purple} icon={FileText} />}
          {selectedClient.rules.defaultBrokerId && (() => { const b = brokers.find(x => x.id === selectedClient.rules.defaultBrokerId); return b ? <Badge label={`${t.broker}: ${b.name} ${b.commissionPct}%`} color={colors.yellow} icon={Handshake} /> : null; })()}
        </div>}

        {/* Helpers */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}22` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Sel label={t.numHelpers} value={form.numHelpers ?? 0} onChange={e => setForm({ ...form, numHelpers: Number(e.target.value) })}>
              {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n === 0 ? "0 — " + t.none : `${n} ayudante${n > 1 ? "s" : ""}`}</option>)}
            </Sel>
            {Number(form.numHelpers) > 0 && <Inp label={t.helperPayEach} type="number" placeholder="RD$" value={form.helperPayEach} onChange={e => setForm({ ...form, helperPayEach: e.target.value })} />}
          </div>
        </div>

        {/* Discounts */}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.border}22` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.textMuted }}>{t.discounts}</span>
            <Btn onClick={addDiscountRow} style={{ padding: "3px 8px", fontSize: 10 }}><Plus size={10} /></Btn>
          </div>
          {(form.discounts || []).map((d, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
              <Inp placeholder={t.discountDesc} value={d.desc} onChange={e => { const ds = [...form.discounts]; ds[i] = { ...d, desc: e.target.value }; setForm({ ...form, discounts: ds }); }} style={{ flex: 1, fontSize: 11 }} />
              <Inp type="number" placeholder="$" value={d.amount} onChange={e => { const ds = [...form.discounts]; ds[i] = { ...d, amount: Number(e.target.value) }; setForm({ ...form, discounts: ds }); }} style={{ width: 80, fontSize: 11 }} />
              <button onClick={() => setForm({ ...form, discounts: form.discounts.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}><X size={12} /></button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}33` }}>
          <Btn onClick={saveTrip} style={{ flex: 1, justifyContent: "center" }}>{t.save}</Btn>
          <Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn>
        </div>
      </div>
    </div>}

    {/* Expense Modal */}
    {expModal && <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setExpModal(null)}>
      <div onClick={e => e.stopPropagation()} style={{ background: colors.card, borderRadius: 12, padding: 24, width: 460, border: `1px solid ${colors.border}` }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}><Receipt size={18} color={colors.orange} /> {t.addExpense} — #{t.trips} #{expModal}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
          <Inp label={t.expenseDate} type="date" value={expForm.date} onChange={e => setExpForm({ ...expForm, date: e.target.value })} />
          <Sel label={t.expenseCategory} value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })}>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{t[c] || c}</option>)}
          </Sel>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
          <Inp label={t.expenseAmount} type="number" value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} />
          <Sel label={t.paymentMethod} value={expForm.paymentMethod} onChange={e => setExpForm({ ...expForm, paymentMethod: e.target.value })}>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t[m] || m}</option>)}
          </Sel>
        </div>
        <Inp label={t.expenseDesc} value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} style={{ width: "100%", marginBottom: 12 }} />
        {/* Show existing expenses */}
        {expenses.filter(e => e.tripId === expModal).length > 0 && <div style={{ maxHeight: 120, overflow: "auto", marginBottom: 10 }}>
          {expenses.filter(e => e.tripId === expModal).map(e => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${colors.border}11`, fontSize: 11 }}>
              <span><Badge label={t[e.category] || e.category} color={colors.textMuted} /> {e.description}</span>
              <span style={{ fontWeight: 600, color: colors.red }}>{fmt(e.amount)}</span>
            </div>
          ))}
        </div>}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={addExpense}><Plus size={14} /> {t.addExpense}</Btn>
          <Btn variant="ghost" onClick={() => setExpModal(null)}>{t.cancel}</Btn>
        </div>
      </div>
    </div>}

    {/* Trip Table */}
    <Card style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>{t.date}</Th><Th>{t.destination}</Th><Th>{t.status}</Th><Th>{t.client}</Th><Th>{t.createdBy}</Th><Th>{t.driver}</Th><Th>{t.truck}</Th>
          <Th align="center">{t.conduce}</Th><Th align="center">{t.document}</Th><Th align="center">{t.expenses}</Th><Th align="right">{t.rate}</Th><Th align="right">{t.actions}</Th>
        </tr></thead>
        <tbody>
          {filtered.map(tr => {
            const cl = clients.find(c => c.id === tr.clientId);
            const dk = drivers.find(d => d.id === tr.driverId);
            const tk = trucks.find(t2 => t2.id === tr.truckId);
            const tripExp = expenses.filter(e => e.tripId === tr.id).reduce((s, e) => s + e.amount, 0);
            return <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
              <Td>{tr.date}</Td>
              <Td><span style={{ fontSize: 12 }}>{tr.municipality}</span><br /><span style={{ fontSize: 10, color: colors.textMuted }}>{tr.province}</span></Td>
              <Td><StatusBadge status={tr.status} t={t} /></Td>
              <Td bold>{cl?.companyName || "—"}{tr.invoiceRef && <><br /><span style={{ fontSize: 9, color: colors.textMuted }}>#{tr.invoiceRef}</span></>}</Td>
              <Td><span style={{ fontSize: 11, color: colors.textMuted }}>{tr.createdBy}</span></Td>
              <Td>{dk?.name || "—"}</Td>
              <Td>{tk?.plate || "—"}</Td>
              <Td align="center">
                <button onClick={() => generateConduce(tr, cl, tk, dk, t)} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${colors.cyan}40`, background: colors.cyan + "10", color: colors.cyan, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
                  <Printer size={10} /> PDF
                </button>
              </Td>
              <Td align="center">
                <button onClick={() => setTrips(trips.map(x => x.id === tr.id ? { ...x, docStatus: x.docStatus === "delivered" ? "pending" : "delivered" } : x))}
                  style={{ padding: "3px 8px", borderRadius: 10, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", background: tr.docStatus === "delivered" ? colors.green + "18" : colors.orange + "18", color: tr.docStatus === "delivered" ? colors.green : colors.orange }}>
                  {tr.docStatus === "delivered" ? t.deliveredDocs : t.pendingDocs}
                </button>
              </Td>
              <Td align="center">
                <button onClick={() => setExpModal(tr.id)} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${colors.orange}40`, background: colors.orange + "10", color: colors.orange, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>
                  <Receipt size={10} /> {fmt(tripExp)}
                </button>
              </Td>
              <Td align="right" bold color={colors.green}>{fmt(tr.revenue)}</Td>
              <Td align="right">
                <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                  <button onClick={() => openEdit(tr)} style={{ padding: 5, borderRadius: 5, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
                  <button onClick={() => { setTrips(trips.filter(x => x.id !== tr.id)); setExpenses(expenses.filter(e => e.tripId !== tr.id)); }} style={{ padding: 5, borderRadius: 5, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
                </div>
              </Td>
            </tr>;
          })}
        </tbody>
      </table>
      {filtered.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noTrips}</div>}
    </Card>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── CLIENTS PAGE ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function ClientsPage({ t, clients, setClients, brokers }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ companyName: "", contactPerson: "", phone: "", email: "", notes: "", status: "active", rules: { paymentTerms: 30, requiresPOD: false, requiresInvoiceRef: false, requiresDocuments: false, defaultBrokerId: null }, rates: [] });
  const [rForm, setRForm] = useState({ province: "", municipality: "", priceT1: "", priceT2: "" });

  const openNew = () => { setForm({ companyName: "", contactPerson: "", phone: "", email: "", notes: "", status: "active", rules: { paymentTerms: 30, requiresPOD: false, requiresInvoiceRef: false, requiresDocuments: false, defaultBrokerId: null }, rates: [] }); setEditId(null); setShowForm(true); };
  const openEdit = (c) => { setForm({ ...c }); setEditId(c.id); setShowForm(true); };
  const save = () => { if (!form.companyName) return; if (editId) setClients(clients.map(c => c.id === editId ? { ...form, id: editId } : c)); else setClients([...clients, { ...form, id: nxId(clients) }]); setShowForm(false); };
  const addRate = () => { if (!rForm.province || !rForm.municipality || !rForm.priceT1 || !rForm.priceT2) return; setForm({ ...form, rates: [...form.rates, { id: nxId(form.rates), province: rForm.province, municipality: rForm.municipality, priceT1: Number(rForm.priceT1), priceT2: Number(rForm.priceT2) }] }); setRForm({ province: "", municipality: "", priceT1: "", priceT2: "" }); };

  return <div>
    <PageHeader title={t.clients} action={<Btn onClick={openNew}><Plus size={14} /> {t.addClient}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{editId ? t.editClient : t.addClient}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.companyName} value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} />
        <Inp label={t.contactPerson} value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} />
        <Sel label={t.statusLabel} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">{t.active}</option><option value="inactive">{t.inactive}</option></Sel>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Inp label={t.email} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Inp label={t.notes} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      </div>

      {/* Rules */}
      <div style={{ background: colors.inputBg, borderRadius: 8, padding: 12, marginBottom: 12, border: `1px solid ${colors.border}` }}>
        <h4 style={{ margin: "0 0 10px", fontSize: 13, color: colors.accentLight }}><ClipboardList size={14} /> {t.clientRules}</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
          <Inp label={t.paymentTerms} type="number" value={form.rules.paymentTerms} onChange={e => setForm({ ...form, rules: { ...form.rules, paymentTerms: Number(e.target.value) } })} />
          <Sel label={t.defaultBroker} value={form.rules.defaultBrokerId || ""} onChange={e => setForm({ ...form, rules: { ...form.rules, defaultBrokerId: e.target.value ? Number(e.target.value) : null } })}>
            <option value="">{t.noBroker}</option>
            {brokers.map(b => <option key={b.id} value={b.id}>{b.name} ({b.commissionPct}%)</option>)}
          </Sel>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Chk label={t.requiresPOD} checked={form.rules.requiresPOD} onChange={() => setForm({ ...form, rules: { ...form.rules, requiresPOD: !form.rules.requiresPOD } })} />
          <Chk label={t.requiresInvoiceRef} checked={form.rules.requiresInvoiceRef} onChange={() => setForm({ ...form, rules: { ...form.rules, requiresInvoiceRef: !form.rules.requiresInvoiceRef } })} />
          <Chk label={t.requiresDocuments} checked={form.rules.requiresDocuments} onChange={() => setForm({ ...form, rules: { ...form.rules, requiresDocuments: !form.rules.requiresDocuments } })} />
        </div>
      </div>

      {/* Rate Sheet */}
      <div style={{ background: colors.inputBg, borderRadius: 8, padding: 12, marginBottom: 12, border: `1px solid ${colors.border}` }}>
        <h4 style={{ margin: "0 0 10px", fontSize: 13, color: colors.green }}><DollarSign size={14} /> {t.clientRates} — {t.province} / {t.municipality} / T1 / T2</h4>
        {form.rates.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            <td style={{ fontSize: 11, color: colors.textMuted, padding: "2px 0" }}>{t.province}</td>
            <td style={{ fontSize: 11, color: colors.textMuted }}>{t.municipality}</td>
            <td style={{ fontSize: 11, color: colors.accent, textAlign: "right" }}>T1</td>
            <td style={{ fontSize: 11, color: colors.orange, textAlign: "right" }}>T2</td>
            <td />
          </tr></thead>
          <tbody>{form.rates.map(r => <tr key={r.id} style={{ borderBottom: `1px solid ${colors.border}22` }}>
            <td style={{ padding: "6px 0", fontSize: 12 }}>{r.province}</td><td style={{ fontSize: 12 }}>{r.municipality}</td>
            <td style={{ textAlign: "right", fontWeight: 600, color: colors.accent, fontSize: 12 }}>{fmt(r.priceT1 ?? r.price ?? 0)}</td>
            <td style={{ textAlign: "right", fontWeight: 600, color: colors.orange, fontSize: 12 }}>{fmt(r.priceT2 ?? r.price ?? 0)}</td>
            <td style={{ width: 30, textAlign: "right" }}><button onClick={() => setForm({ ...form, rates: form.rates.filter(x => x.id !== r.id) })} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}><X size={10} /></button></td>
          </tr>)}</tbody>
        </table>}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <Sel label={t.province} value={rForm.province} onChange={e => { setRForm({ ...rForm, province: e.target.value, municipality: "" }); }} style={{ flex: 2, fontSize: 11 }}>
            <option value="">--</option>{DR_PROVINCES.map(p => <option key={p.province} value={p.province}>{p.province}</option>)}
          </Sel>
          <Sel label={t.municipality} value={rForm.municipality} onChange={e => setRForm({ ...rForm, municipality: e.target.value })} style={{ flex: 2, fontSize: 11 }}>
            <option value="">--</option>{(DR_PROVINCES.find(p => p.province === rForm.province)?.municipalities || []).map(m => <option key={m} value={m}>{m}</option>)}
          </Sel>
          <Inp label="T1 ($)" type="number" value={rForm.priceT1} onChange={e => setRForm({ ...rForm, priceT1: e.target.value })} style={{ width: 90, fontSize: 11 }} />
          <Inp label="T2 ($)" type="number" value={rForm.priceT2} onChange={e => setRForm({ ...rForm, priceT2: e.target.value })} style={{ width: 90, fontSize: 11 }} />
          <Btn onClick={addRate} style={{ padding: "7px 10px", fontSize: 11 }}><Plus size={12} /></Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}

    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>{t.companyName}</Th><Th>{t.contactPerson}</Th><Th>{t.phone}</Th><Th align="center">{t.rules}</Th><Th align="center">{t.rates}</Th><Th align="center">{t.statusLabel}</Th><Th align="right">{t.actions}</Th>
        </tr></thead>
        <tbody>{clients.map(c => <tr key={c.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td bold><Building2 size={12} color={colors.purple} style={{ marginRight: 4, verticalAlign: "middle" }} />{c.companyName}</Td>
          <Td>{c.contactPerson}</Td><Td>{c.phone}</Td>
          <Td align="center">
            <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
              <Badge label={`${c.rules.paymentTerms}d`} color={colors.accent} />
              {c.rules.requiresPOD && <Badge label="POD" color={colors.orange} />}
              {c.rules.requiresInvoiceRef && <Badge label="Ref" color={colors.red} />}
              {c.rules.requiresDocuments && <Badge label="Doc" color={colors.purple} />}
              {c.rules.defaultBrokerId && <Badge label={`B ${brokers.find(b => b.id === c.rules.defaultBrokerId)?.commissionPct || ""}%`} color={colors.yellow} />}
            </div>
          </Td>
          <Td align="center"><Badge label={`${c.rates.length}`} color={colors.green} /></Td>
          <Td align="center"><Badge label={c.status === "active" ? t.active : t.inactive} color={c.status === "active" ? colors.green : colors.red} /></Td>
          <Td align="right">
            <button onClick={() => openEdit(c)} style={{ padding: 4, borderRadius: 4, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
            <button onClick={() => setClients(clients.filter(x => x.id !== c.id))} style={{ padding: 4, borderRadius: 4, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
          </Td>
        </tr>)}</tbody>
      </table>
      {clients.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noClients}</div>}
    </Card>
  </div>;
}

// ─── FLEET PAGE ──────────────────────────────────────────────────────────────
function FleetPage({ t, trucks, setTrucks, partners }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ plate: "", type: "Flatbed", size: "T1", owner: "own", partnerId: "" });
  const openNew = () => { setForm({ plate: "", type: "Flatbed", size: "T1", owner: "own", partnerId: "" }); setEditId(null); setShowForm(true); };
  const openEdit = (tk) => { setForm({ ...tk, partnerId: tk.partnerId || "" }); setEditId(tk.id); setShowForm(true); };
  const save = () => { if (!form.plate) return; const d = { ...form, partnerId: form.owner === "partner" ? Number(form.partnerId) || null : null }; if (editId) setTrucks(trucks.map(t2 => t2.id === editId ? { ...d, id: editId } : t2)); else setTrucks([...trucks, { ...d, id: nxId(trucks) }]); setShowForm(false); };

  return <div>
    <PageHeader title={t.fleet} action={<Btn onClick={openNew}><Plus size={14} /> {t.addTruck}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Inp label={t.truckPlate} value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} />
        <Sel label={t.truckType} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option>Flatbed</option><option>Refrigerated</option><option>Dry Van</option><option>Tanker</option><option>Lowboy</option></Sel>
        <Sel label={t.truckSize} value={form.size || "T1"} onChange={e => setForm({ ...form, size: e.target.value })}><option value="T1">T1 — Pequeño</option><option value="T2">T2 — Grande</option></Sel>
        <Sel label={t.ownerType} value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })}><option value="own">{t.ownTruck}</option><option value="partner">{t.partnerTruck}</option></Sel>
      </div>
      {form.owner === "partner" && <Sel label={t.partnerName} value={form.partnerId} onChange={e => setForm({ ...form, partnerId: e.target.value })} style={{ marginBottom: 12 }}>
        <option value="">{t.none}</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Sel>}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>{t.truckPlate}</Th><Th>{t.truckType}</Th><Th>{t.truckSize}</Th><Th>{t.ownerType}</Th><Th>{t.partnerName}</Th><Th align="right">{t.actions}</Th></tr></thead>
        <tbody>{trucks.map(tk => {
          const pt = partners.find(p => p.id === tk.partnerId);
          return <tr key={tk.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
            <Td bold>{tk.plate}</Td><Td>{tk.type}</Td>
            <Td><Badge label={tk.size || "T1"} color={(tk.size || "T1") === "T2" ? colors.orange : colors.accent} /></Td>
            <Td><Badge label={tk.owner === "own" ? t.ownTruck : t.partnerTruck} color={tk.owner === "own" ? colors.accent : colors.orange} /></Td>
            <Td>{pt?.name || "—"}</Td>
            <Td align="right">
              <button onClick={() => openEdit(tk)} style={{ padding: 4, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
              <button onClick={() => setTrucks(trucks.filter(x => x.id !== tk.id))} style={{ padding: 4, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
            </Td>
          </tr>;
        })}</tbody>
      </table>
    </Card>
  </div>;
}

// ─── DRIVERS PAGE ────────────────────────────────────────────────────────────
function DriversPage({ t, drivers, setDrivers, trucks }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", license: "", truckId: "", salaryType: "perTrip", fixedAmount: 0, percentageAmount: 0, username: "", password: "", rates: [] });
  const [rForm, setRForm] = useState({ province: "", municipality: "", priceT1: "", priceT2: "" });

  const openNew = () => { setForm({ name: "", phone: "", license: "", truckId: "", salaryType: "perTrip", fixedAmount: 0, percentageAmount: 0, username: "", password: "", rates: [] }); setEditId(null); setShowForm(true); };
  const openEdit = (d) => { setForm({ ...d }); setEditId(d.id); setShowForm(true); };
  const save = () => { if (!form.name) return; const d = { ...form, truckId: Number(form.truckId) || null, fixedAmount: Number(form.fixedAmount) || 0, percentageAmount: Number(form.percentageAmount) || 0 }; if (editId) setDrivers(drivers.map(x => x.id === editId ? { ...d, id: editId } : x)); else setDrivers([...drivers, { ...d, id: nxId(drivers) }]); setShowForm(false); };
  const addRate = () => { if (!rForm.province || !rForm.municipality || !rForm.priceT1 || !rForm.priceT2) return; setForm({ ...form, rates: [...(form.rates || []), { id: nxId(form.rates || []), province: rForm.province, municipality: rForm.municipality, priceT1: Number(rForm.priceT1), priceT2: Number(rForm.priceT2) }] }); setRForm({ province: "", municipality: "", priceT1: "", priceT2: "" }); };

  return <div>
    <PageHeader title={t.drivers} action={<Btn onClick={openNew}><Plus size={14} /> {t.addDriver}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.driverName} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Inp label={t.license} value={form.license} onChange={e => setForm({ ...form, license: e.target.value })} />
        <Sel label={t.assignedTruck} value={form.truckId} onChange={e => setForm({ ...form, truckId: e.target.value })}><option value="">{t.none}</option>{trucks.map(tk => <option key={tk.id} value={tk.id}>{tk.plate}</option>)}</Sel>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Sel label={t.salaryType} value={form.salaryType} onChange={e => setForm({ ...form, salaryType: e.target.value })}><option value="fixed">{t.fixedSalary}</option><option value="perTrip">{t.perTrip}</option><option value="porcentaje">{t.porcentaje}</option></Sel>
        {form.salaryType === "fixed" && <Inp label={t.fixedAmount} type="number" value={form.fixedAmount} onChange={e => setForm({ ...form, fixedAmount: e.target.value })} />}
        {form.salaryType === "porcentaje" && <Inp label={t.percentageAmount} type="number" min="0" max="100" value={form.percentageAmount} onChange={e => setForm({ ...form, percentageAmount: e.target.value })} />}
        <Inp label={t.username} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
        <Inp label={t.password} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
      </div>
      {form.salaryType === "perTrip" && <div style={{ background: colors.inputBg, borderRadius: 8, padding: 10, marginBottom: 10, border: `1px solid ${colors.border}` }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 12, color: colors.green }}>{t.driverRateSheet} (T1 / T2)</h4>
        {(form.rates || []).map(r => <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 11 }}>
          <span style={{ flex: 1 }}>{r.municipality}, {r.province}</span>
          <span style={{ fontWeight: 600, color: colors.accent }}>T1: {fmt(r.priceT1 ?? r.price ?? 0)}</span>
          <span style={{ fontWeight: 600, color: colors.orange }}>T2: {fmt(r.priceT2 ?? r.price ?? 0)}</span>
          <button onClick={() => setForm({ ...form, rates: form.rates.filter(x => x.id !== r.id) })} style={{ background: "none", border: "none", color: colors.red, cursor: "pointer" }}><X size={10} /></button></div>)}
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "flex-end" }}>
          <Sel value={rForm.province} onChange={e => setRForm({ ...rForm, province: e.target.value, municipality: "" })} style={{ flex: 2, fontSize: 10 }}><option value="">Prov.</option>{DR_PROVINCES.map(p => <option key={p.province} value={p.province}>{p.province}</option>)}</Sel>
          <Sel value={rForm.municipality} onChange={e => setRForm({ ...rForm, municipality: e.target.value })} style={{ flex: 2, fontSize: 10 }}><option value="">Mun.</option>{(DR_PROVINCES.find(p => p.province === rForm.province)?.municipalities || []).map(m => <option key={m} value={m}>{m}</option>)}</Sel>
          <Inp type="number" placeholder="T1 $" value={rForm.priceT1} onChange={e => setRForm({ ...rForm, priceT1: e.target.value })} style={{ width: 70, fontSize: 10 }} />
          <Inp type="number" placeholder="T2 $" value={rForm.priceT2} onChange={e => setRForm({ ...rForm, priceT2: e.target.value })} style={{ width: 70, fontSize: 10 }} />
          <Btn onClick={addRate} style={{ padding: "5px 8px", fontSize: 10 }}><Plus size={10} /></Btn>
        </div>
      </div>}
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>{t.driverName}</Th><Th>{t.phone}</Th><Th>{t.license}</Th><Th>{t.assignedTruck}</Th><Th>{t.salaryType}</Th><Th align="right">{t.actions}</Th></tr></thead>
        <tbody>{drivers.map(d => {
          const tk = trucks.find(t2 => t2.id === d.truckId);
          return <tr key={d.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
            <Td bold>{d.name}</Td><Td>{d.phone}</Td><Td>{d.license}</Td><Td>{tk?.plate || "—"}</Td>
            <Td><Badge label={d.salaryType === "fixed" ? `${t.fixedSalary}: ${fmt(d.fixedAmount)}` : d.salaryType === "porcentaje" ? `${t.porcentaje}: ${d.percentageAmount || 0}%` : t.perTrip} color={d.salaryType === "fixed" ? colors.accent : d.salaryType === "porcentaje" ? colors.cyan : colors.green} /></Td>
            <Td align="right">
              <button onClick={() => openEdit(d)} style={{ padding: 4, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
              <button onClick={() => setDrivers(drivers.filter(x => x.id !== d.id))} style={{ padding: 4, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
            </Td>
          </tr>;
        })}</tbody>
      </table>
    </Card>
  </div>;
}

// ─── BROKERS PAGE ────────────────────────────────────────────────────────────
function BrokersPage({ t, brokers, setBrokers }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", contactPerson: "", phone: "", email: "", commissionPct: "", notes: "" });
  const openNew = () => { setForm({ name: "", contactPerson: "", phone: "", email: "", commissionPct: "", notes: "" }); setEditId(null); setShowForm(true); };
  const openEdit = (b) => { setForm({ ...b }); setEditId(b.id); setShowForm(true); };
  const save = () => { if (!form.name) return; const d = { ...form, commissionPct: Number(form.commissionPct) || 0 }; if (editId) setBrokers(brokers.map(b => b.id === editId ? { ...d, id: editId } : b)); else setBrokers([...brokers, { ...d, id: nxId(brokers) }]); setShowForm(false); };

  return <div>
    <PageHeader title={t.brokers} action={<Btn onClick={openNew}><Plus size={14} /> {t.addBroker}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.brokerName} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Inp label={t.contactPerson} value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} />
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Inp label={t.brokerCommission + " %"} type="number" value={form.commissionPct} onChange={e => setForm({ ...form, commissionPct: e.target.value })} />
      </div>
      <Inp label={t.notes} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: "100%", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>{t.brokerName}</Th><Th>{t.contactPerson}</Th><Th>{t.phone}</Th><Th align="center">{t.commissionPct}</Th><Th align="right">{t.actions}</Th></tr></thead>
        <tbody>{brokers.map(b => <tr key={b.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td bold>{b.name}</Td><Td>{b.contactPerson}</Td><Td>{b.phone}</Td><Td align="center"><Badge label={`${b.commissionPct}%`} color={colors.orange} /></Td>
          <Td align="right">
            <button onClick={() => openEdit(b)} style={{ padding: 4, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
            <button onClick={() => setBrokers(brokers.filter(x => x.id !== b.id))} style={{ padding: 4, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
          </Td>
        </tr>)}</tbody>
      </table>
      {brokers.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noBrokers}</div>}
    </Card>
  </div>;
}

// ─── PARTNERS PAGE ───────────────────────────────────────────────────────────
function PartnersPage({ t, partners, setPartners }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", commissionPct: "", negotiationType: "Net Profit %", notes: "", username: "", password: "" });

  const openNew = () => { setForm({ name: "", phone: "", email: "", commissionPct: "", negotiationType: "Net Profit %", notes: "", username: "", password: "" }); setEditId(null); setShowForm(true); };
  const openEdit = (p) => { setForm({ ...p }); setEditId(p.id); setShowForm(true); };
  const save = () => {
    if (!form.name) return;
    const d = { ...form, commissionPct: Number(form.commissionPct) || 0 };
    if (editId) setPartners(partners.map(p => p.id === editId ? { ...d, id: editId } : p));
    else setPartners([...partners, { ...d, id: nxId(partners) }]);
    setShowForm(false);
  };

  return <div>
    <PageHeader title={t.partners} action={<Btn onClick={openNew}><Plus size={14} /> {t.addPartner}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{editId ? t.editPartner : t.addPartner}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.driverName.replace("Conductor","Socio").replace("Driver","Partner") || "Nombre"} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" />
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Inp label={t.email} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.commissionPct || "Comisión %"} type="number" value={form.commissionPct} onChange={e => setForm({ ...form, commissionPct: e.target.value })} />
        <Sel label={t.negotiationType || "Tipo Negociación"} value={form.negotiationType} onChange={e => setForm({ ...form, negotiationType: e.target.value })}>
          <option value="Net Profit %">Net Profit %</option>
          <option value="Revenue %">Revenue %</option>
          <option value="Fixed">Fijo</option>
        </Sel>
        <Inp label={t.notes} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Inp label={t.username} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Usuario login" />
        <Inp label={t.password} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Contraseña login" />
      </div>
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>Nombre</Th><Th>{t.phone}</Th><Th>{t.email}</Th><Th align="center">Comisión</Th><Th align="center">Negociación</Th><Th>{t.username}</Th><Th align="right">{t.actions}</Th>
        </tr></thead>
        <tbody>{partners.map(p => <tr key={p.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td bold><UserCog size={12} color={colors.orange} style={{ marginRight: 4, verticalAlign: "middle" }} />{p.name}</Td>
          <Td>{p.phone}</Td>
          <Td>{p.email}</Td>
          <Td align="center"><Badge label={`${p.commissionPct}%`} color={colors.green} /></Td>
          <Td align="center"><Badge label={p.negotiationType || "Net Profit %"} color={colors.accent} /></Td>
          <Td>{p.username}</Td>
          <Td align="right">
            <button onClick={() => openEdit(p)} style={{ padding: 4, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
            <button onClick={() => setPartners(partners.filter(x => x.id !== p.id))} style={{ padding: 4, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
          </Td>
        </tr>)}</tbody>
      </table>
      {partners.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noPartners}</div>}
    </Card>
  </div>;
}

// ─── EXPENSES PAGE ───────────────────────────────────────────────────────────
function ExpensesPage({ t, expenses, setExpenses, trips, trucks, clients, suppliers, drivers }) {
  const [filterCat, setFilterCat] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), category: "fuel", amount: "", paymentMethod: "cash", description: "", tripId: "" });

  const byCategory = EXPENSE_CATEGORIES.map(c => ({ cat: c, label: t[c] || c, total: expenses.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const cxpTotal = expenses.filter(e => e.paymentMethod === "credit").reduce((s, e) => s + e.amount, 0);

  const filtered = filterCat === "all" ? expenses : expenses.filter(e => e.category === filterCat);

  const openNew = () => { setForm({ date: new Date().toISOString().slice(0,10), category: "fuel", amount: "", paymentMethod: "cash", description: "", tripId: "" }); setShowForm(true); };
  const save = () => {
    if (!form.amount || !form.date) return;
    setExpenses(prev => [...prev, { id: nxId(prev), ...form, amount: Number(form.amount), tripId: form.tripId ? Number(form.tripId) : null }]);
    setShowForm(false);
  };

  return <div>
    <PageHeader title={t.expenses} action={<Btn onClick={openNew}><Plus size={14} /> {t.addExpense}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 10 }}>
        <Inp label={t.expenseDate} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        <Sel label={t.expenseCategory} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{t[c] || c}</option>)}
        </Sel>
        <Inp label={t.expenseAmount} type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
        <Sel label={t.paymentMethod} value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t[m] || m}</option>)}
        </Sel>
        <Sel label="Viaje (opcional)" value={form.tripId} onChange={e => setForm({ ...form, tripId: e.target.value })}>
          <option value="">— Sin viaje —</option>
          {trips.map(tr => <option key={tr.id} value={tr.id}>#{tr.id} {tr.origin} → {tr.destination}</option>)}
        </Sel>
        <Inp label={t.expenseDesc} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
      </div>
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
      <StatCard icon={Receipt} label={t.totalExpenses} value={fmt(total)} color={colors.red} />
      <StatCard icon={CreditCard} label={t.cxp} value={fmt(cxpTotal)} color={colors.orange} />
      <StatCard icon={Banknote} label={t.payroll} value={fmt(expenses.filter(e => e.category === "driverPay" || e.category === "salary").reduce((s, e) => s + e.amount, 0))} color={colors.accent} />
    </div>

    {/* Category breakdown */}
    <Card style={{ marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>{t.expenseCategory}</h3>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => setFilterCat("all")} style={{ padding: "4px 12px", borderRadius: 14, border: `1px solid ${filterCat === "all" ? colors.accent : colors.border}`, background: filterCat === "all" ? colors.accent + "18" : "transparent", color: filterCat === "all" ? colors.accentLight : colors.textMuted, cursor: "pointer", fontSize: 11 }}>{t.all} ({fmt(total)})</button>
        {byCategory.map(c => <button key={c.cat} onClick={() => setFilterCat(c.cat)} style={{ padding: "4px 12px", borderRadius: 14, border: `1px solid ${filterCat === c.cat ? colors.accent : colors.border}`, background: filterCat === c.cat ? colors.accent + "18" : "transparent", color: filterCat === c.cat ? colors.accentLight : colors.textMuted, cursor: "pointer", fontSize: 11 }}>{c.label} ({fmt(c.total)})</button>)}
      </div>
    </Card>

    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>{t.date}</Th><Th>{t.expenseCategory}</Th><Th>{t.expenseDesc}</Th><Th>{t.paymentMethod}</Th><Th>Trip #</Th><Th align="right">{t.expenseAmount}</Th>
        </tr></thead>
        <tbody>{filtered.sort((a, b) => b.date?.localeCompare(a.date)).map(e => (
          <tr key={e.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
            <Td>{e.date || "—"}</Td><Td><Badge label={t[e.category] || e.category} color={colors.textMuted} /></Td><Td>{e.description}</Td>
            <Td><Badge label={t[e.paymentMethod] || e.paymentMethod} color={e.paymentMethod === "credit" ? colors.red : colors.green} /></Td>
            <Td>#{e.tripId}</Td><Td align="right" bold color={colors.red}>{fmt(e.amount)}</Td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  </div>;
}

// ─── SUPPLIERS PAGE ──────────────────────────────────────────────────────────
function SuppliersPage({ t, suppliers, setSuppliers }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", contactPerson: "", phone: "", email: "", paymentCondition: "cash", creditDays: 0, notes: "" });
  const openNew = () => { setForm({ name: "", contactPerson: "", phone: "", email: "", paymentCondition: "cash", creditDays: 0, notes: "" }); setEditId(null); setShowForm(true); };
  const openEdit = (s) => { setForm({ ...s }); setEditId(s.id); setShowForm(true); };
  const save = () => { if (!form.name) return; const d = { ...form, creditDays: Number(form.creditDays) || 0 }; if (editId) setSuppliers(suppliers.map(s => s.id === editId ? { ...d, id: editId } : s)); else setSuppliers([...suppliers, { ...d, id: nxId(suppliers) }]); setShowForm(false); };

  return <div>
    <PageHeader title={t.suppliers} action={<Btn onClick={openNew}><Plus size={14} /> {t.addSupplier}</Btn>} />
    {showForm && <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.supplierName} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Inp label={t.contactPerson} value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} />
        <Inp label={t.phone} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
        <Inp label={t.email} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Sel label={t.paymentCondition} value={form.paymentCondition} onChange={e => setForm({ ...form, paymentCondition: e.target.value })}><option value="cash">{t.cash}</option><option value="credit">{t.credit}</option></Sel>
        {form.paymentCondition === "credit" && <Inp label={t.creditDays} type="number" value={form.creditDays} onChange={e => setForm({ ...form, creditDays: e.target.value })} />}
      </div>
      <Inp label={t.notes} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: "100%", marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8 }}><Btn onClick={save}>{t.save}</Btn><Btn variant="ghost" onClick={() => setShowForm(false)}>{t.cancel}</Btn></div>
    </Card>}
    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}><Th>{t.supplierName}</Th><Th>{t.contactPerson}</Th><Th>{t.phone}</Th><Th>{t.paymentCondition}</Th><Th>{t.creditDays}</Th><Th align="right">{t.actions}</Th></tr></thead>
        <tbody>{suppliers.map(s => <tr key={s.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td bold>{s.name}</Td><Td>{s.contactPerson}</Td><Td>{s.phone}</Td>
          <Td><Badge label={s.paymentCondition === "credit" ? t.credit : t.cash} color={s.paymentCondition === "credit" ? colors.orange : colors.green} /></Td>
          <Td>{s.paymentCondition === "credit" ? `${s.creditDays}d` : "—"}</Td>
          <Td align="right">
            <button onClick={() => openEdit(s)} style={{ padding: 4, border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer" }}><Pencil size={12} /></button>
            <button onClick={() => setSuppliers(suppliers.filter(x => x.id !== s.id))} style={{ padding: 4, border: "none", background: "transparent", color: colors.red, cursor: "pointer" }}><Trash2 size={12} /></button>
          </Td>
        </tr>)}</tbody>
      </table>
      {suppliers.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noSuppliers}</div>}
    </Card>
  </div>;
}

// ─── SETTLEMENTS PAGE ────────────────────────────────────────────────────────
function SettlementsPage({ t, trips, trucks, expenses, clients, partners, settlementStatus, setSettlementStatus, user, partner, partnerTruckIds }) {
  const isPartnerView = user?.role === "partner";
  const [month, setMonth] = useState(monthStr());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const months = []; for (let i = 0; i < 12; i++) { const d = new Date(); d.setMonth(d.getMonth() - i); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }

  if (isPartnerView) {
    let myTrips = trips.filter(tr => (partnerTruckIds || []).includes(tr.truckId));
    if (dateFrom) myTrips = myTrips.filter(tr => tr.date >= dateFrom);
    if (dateTo) myTrips = myTrips.filter(tr => tr.date <= dateTo);
    const rev = myTrips.reduce((s, tr) => s + tr.revenue, 0);
    const exp = expenses.filter(e => myTrips.some(tr => tr.id === e.tripId)).reduce((s, e) => s + e.amount, 0);
    const net = rev - exp;
    const comm = net * ((partner?.commissionPct || 0) / 100);
    const key = `${partner?.id}-${monthStr()}`;
    const status = settlementStatus[key] || "unpaid";
    return <div>
      <PageHeader title={t.settlements} />
      <div style={{ marginBottom: 16 }}><DateFilter t={t} onFilter={(f, to) => { setDateFrom(f); setDateTo(to); }} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
        <StatCard icon={Route} label={t.totalTrips} value={myTrips.length} color={colors.cyan} />
        <StatCard icon={TrendingUp} label={t.grossRevenue} value={fmt(rev)} color={colors.green} />
        <StatCard icon={TrendingDown} label={t.totalExpenses} value={fmt(exp)} color={colors.orange} />
        <StatCard icon={DollarSign} label={t.netProfit} value={fmt(net)} color={net >= 0 ? colors.green : colors.red} />
        <StatCard icon={Handshake} label={`${t.commission} (${partner?.commissionPct}%)`} value={fmt(comm)} color={colors.purple} />
        <StatCard icon={CircleDollarSign} label={t.partnerEarnings} value={fmt(net - comm)} color={colors.accent} />
      </div>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{t.statusLabel}: <Badge label={status === "paid" ? t.paid : t.unpaid} color={status === "paid" ? colors.green : colors.red} /></h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            <Th>{t.date}</Th><Th>{t.destination}</Th><Th>{t.client}</Th><Th align="right">{t.revenue}</Th><Th align="center">{t.status}</Th>
          </tr></thead>
          <tbody>{myTrips.map(tr => {
            const cl = (clients || []).find(c => c.id === tr.clientId);
            return <tr key={tr.id} style={{ borderBottom: `1px solid ${colors.border}11` }}>
              <Td>{tr.date}</Td><Td>{tr.municipality}</Td><Td>{cl?.companyName || "—"}</Td>
              <Td align="right" bold color={colors.green}>{fmt(tr.revenue)}</Td>
              <Td align="center"><StatusBadge status={tr.status} t={t} /></Td>
            </tr>;
          })}</tbody>
        </table>
        {myTrips.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noSettlements}</div>}
      </Card>
    </div>;
  }

  // Admin view
  const mt = trips.filter(tr => tr.date.startsWith(month));
  const data = partners.map(p => {
    const pTrucks = trucks.filter(tk => tk.partnerId === p.id).map(tk => tk.id);
    const pTrips = mt.filter(tr => pTrucks.includes(tr.truckId));
    const rev = pTrips.reduce((s, tr) => s + tr.revenue, 0);
    const exp = expenses.filter(e => pTrips.some(tr => tr.id === e.tripId)).reduce((s, e) => s + e.amount, 0);
    const net = rev - exp;
    const comm = net * (p.commissionPct / 100);
    const key = `${p.id}-${month}`;
    const status = settlementStatus[key] || "unpaid";
    return { partner: p, trucks: pTrucks.length, trips: pTrips.length, revenue: rev, expenses: exp, net, commissionPct: p.commissionPct, commission: comm, partnerEarnings: net - comm, status, key };
  }).filter(d => d.trips > 0);

  const toggleStatus = (key) => setSettlementStatus({ ...settlementStatus, [key]: settlementStatus[key] === "paid" ? "unpaid" : "paid" });

  return <div>
    <PageHeader title={t.settlements} />
    <Sel value={month} onChange={e => setMonth(e.target.value)} style={{ marginBottom: 16 }}>{months.map(m => <option key={m} value={m}>{m}</option>)}</Sel>
    <Card>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Th>{t.partner}</Th><Th align="center">{t.totalTrips}</Th><Th align="right">{t.grossRevenue}</Th><Th align="right">{t.totalExpenses}</Th><Th align="right">{t.netProfit}</Th><Th align="center">%</Th><Th align="right">{t.commission}</Th><Th align="right">{t.partnerEarnings}</Th><Th align="center">{t.statusLabel}</Th>
        </tr></thead>
        <tbody>{data.map(d => <tr key={d.key} style={{ borderBottom: `1px solid ${colors.border}11` }}>
          <Td bold>{d.partner.name}</Td><Td align="center">{d.trips}</Td>
          <Td align="right">{fmt(d.revenue)}</Td><Td align="right" color={colors.red}>{fmt(d.expenses)}</Td>
          <Td align="right" bold color={d.net >= 0 ? colors.green : colors.red}>{fmt(d.net)}</Td>
          <Td align="center">{d.commissionPct}%</Td>
          <Td align="right" bold color={colors.green}>{fmt(d.commission)}</Td>
          <Td align="right" bold color={colors.accent}>{fmt(d.partnerEarnings)}</Td>
          <Td align="center">
            <button onClick={() => toggleStatus(d.key)} style={{ padding: "3px 10px", borderRadius: 10, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", background: d.status === "paid" ? colors.green + "18" : colors.red + "18", color: d.status === "paid" ? colors.green : colors.red }}>
              {d.status === "paid" ? t.paid : t.unpaid}
            </button>
          </Td>
        </tr>)}</tbody>
      </table>
      {data.length === 0 && <div style={{ textAlign: "center", padding: 30, color: colors.textMuted }}>{t.noSettlements}</div>}
    </Card>
  </div>;
}

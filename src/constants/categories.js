export const EXPENSE_CATEGORIES = [
  "salary", "fuel", "repair", "loan", "maintenance", "toll", "tire",
  "insurance", "driverPay", "adelanto_conductor", "adelanto_ayudante", "helper", "broker_commission", "other"
];

export const PAYMENT_METHODS = ["cash", "transfer", "check", "credit_card", "credit"];
/** Métodos con los que el gasto queda pagado al registrarlo (el dinero ya salió: efectivo, transferencia, cheque, tarjeta). Solo «crédito» queda pendiente. */
export const PAID_ON_ENTRY_METHODS = ["cash", "transfer", "check", "credit_card"];

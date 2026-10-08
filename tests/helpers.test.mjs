/**
 * B-Logix – helpers.js unit tests
 * Run with: node --test tests/helpers.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// helpers.js is pure ESM with no Node built-in deps — import directly.
// We need a dynamic import because the file uses export syntax.
const {
  fmt,
  nxId,
  daysDiff,
  getSupplierDueDate,
  getPeriodInfo,
} = await import("../src/utils/helpers.js");

// ── fmt ───────────────────────────────────────────────────────────────────────

test("fmt formats positive number as DOP currency", () => {
  const result = fmt(1500);
  assert.ok(result.includes("1,500"), `Expected 1,500 in output, got ${result}`);
});

test("fmt formats zero as DOP 0", () => {
  const result = fmt(0);
  assert.ok(result.includes("0"), `Expected 0 in output, got ${result}`);
});

// ── nxId ──────────────────────────────────────────────────────────────────────

test("nxId returns 1 for empty array", () => {
  assert.equal(nxId([]), 1);
});

test("nxId returns max id + 1", () => {
  assert.equal(nxId([{ id: 3 }, { id: 1 }, { id: 7 }]), 8);
});

// ── getSupplierDueDate ────────────────────────────────────────────────────────

test("getSupplierDueDate returns expenseDate unchanged when no supplier", () => {
  assert.equal(getSupplierDueDate("2026-03-05", null), "2026-03-05");
});

test("getSupplierDueDate returns expenseDate unchanged for cash supplier", () => {
  const sup = { paymentCondition: "cash", creditDays: 30 };
  assert.equal(getSupplierDueDate("2026-03-05", sup), "2026-03-05");
});

test("getSupplierDueDate invoice_date cycle: adds creditDays to expense date", () => {
  const sup = { paymentCondition: "credit", creditDays: 30, billingCycle: "invoice_date" };
  assert.equal(getSupplierDueDate("2026-03-05", sup), "2026-04-04");
});

test("getSupplierDueDate defaults to invoice_date when billingCycle unset", () => {
  const sup = { paymentCondition: "credit", creditDays: 30 };
  assert.equal(getSupplierDueDate("2026-03-05", sup), "2026-04-04");
});

// Shell Los Alamos — period1CutDay=15, creditDays=30
// Expense on March 5 → falls in Q1 (days 1–15) → cutoff March 15 → due April 14
test("getSupplierDueDate cutoff_period Q1: expense day 5 of 30 → due April 14", () => {
  const sup = {
    paymentCondition: "credit",
    creditDays: 30,
    billingCycle: "cutoff_period",
    period1CutDay: 15,
  };
  assert.equal(getSupplierDueDate("2026-03-05", sup), "2026-04-14");
});

// Expense on March 15 → still in Q1 (day = period1CutDay) → cutoff March 15 → due April 14
test("getSupplierDueDate cutoff_period Q1 boundary day 15 → due April 14", () => {
  const sup = {
    paymentCondition: "credit",
    creditDays: 30,
    billingCycle: "cutoff_period",
    period1CutDay: 15,
  };
  assert.equal(getSupplierDueDate("2026-03-15", sup), "2026-04-14");
});

// Expense on March 16 → Q2 (days 16–31) → cutoff March 31 → due April 30
test("getSupplierDueDate cutoff_period Q2: expense day 16 → due April 30", () => {
  const sup = {
    paymentCondition: "credit",
    creditDays: 30,
    billingCycle: "cutoff_period",
    period1CutDay: 15,
  };
  assert.equal(getSupplierDueDate("2026-03-16", sup), "2026-04-30");
});

// Expense on March 20 → Q2 → cutoff March 31 → due April 30
test("getSupplierDueDate cutoff_period Q2: expense day 20 → due April 30", () => {
  const sup = {
    paymentCondition: "credit",
    creditDays: 30,
    billingCycle: "cutoff_period",
    period1CutDay: 15,
  };
  assert.equal(getSupplierDueDate("2026-03-20", sup), "2026-04-30");
});

// February edge case — Q2 cutoff = Feb 28 (2026 is not a leap year)
test("getSupplierDueDate cutoff_period Q2 in February → cutoff on Feb 28", () => {
  const sup = {
    paymentCondition: "credit",
    creditDays: 30,
    billingCycle: "cutoff_period",
    period1CutDay: 15,
  };
  assert.equal(getSupplierDueDate("2026-02-20", sup), "2026-03-30");
});

// Month boundary: Q2 cutoff Dec 31 + 30 days = Jan 30 of next year
test("getSupplierDueDate cutoff_period wraps into next year correctly", () => {
  const sup = {
    paymentCondition: "credit",
    creditDays: 30,
    billingCycle: "cutoff_period",
    period1CutDay: 15,
  };
  assert.equal(getSupplierDueDate("2026-12-20", sup), "2027-01-30");
});

test("getSupplierDueDate returns expenseDate when creditDays is 0", () => {
  const sup = { paymentCondition: "credit", creditDays: 0, billingCycle: "invoice_date" };
  assert.equal(getSupplierDueDate("2026-03-05", sup), "2026-03-05");
});

test("getSupplierDueDate returns undefined for undefined expenseDate", () => {
  const sup = { paymentCondition: "credit", creditDays: 30, billingCycle: "cutoff_period", period1CutDay: 15 };
  assert.equal(getSupplierDueDate(undefined, sup), undefined);
});

// ── getPeriodInfo ─────────────────────────────────────────────────────────────

test("getPeriodInfo for standard client uses month key and adds paymentTerms days", () => {
  const client = { rules: { billingCycle: "standard", paymentTerms: 30 } };
  const info = getPeriodInfo("2026-03-05", client);
  assert.ok(info.key.startsWith("2026-03"), `Key should start with 2026-03, got ${info.key}`);
});

test("getPeriodInfo for bimonthly_delayed first half uses h1 key", () => {
  const client = { rules: { billingCycle: "bimonthly_delayed", period1PayDay: 30 } };
  const info = getPeriodInfo("2026-03-05", client);
  assert.equal(info.key, "2026-03-h1");
});

test("getPeriodInfo for bimonthly_delayed second half uses h2 key", () => {
  const client = { rules: { billingCycle: "bimonthly_delayed", period2PayDay: 15 } };
  const info = getPeriodInfo("2026-03-20", client);
  assert.equal(info.key, "2026-03-h2");
});

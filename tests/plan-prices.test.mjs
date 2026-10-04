// tests/plan-prices.test.mjs — run: npm test
//
// The landing pages print prices from src/lib/plan-prices.ts, the module the
// server charges from (subscriptions.ts re-exports it). These cases pin the
// formatting and the derived figures the copy relies on: "$5", "$33",
// "$79.08", "-25 %", "-45 %" and the lowest per-month price.

import { test } from "node:test";
import assert from "node:assert/strict";
import "./support/load-ts.mjs";

const pp = await import("../src/lib/plan-prices.ts");
const subs = await import("../src/lib/subscriptions.ts");

test("subscriptions.ts charges the prices the landing prints", () => {
  assert.equal(subs.PLAN_PRICES, pp.PLAN_PRICES);
  assert.equal(subs.DEVICE_ADDON_PRICE, pp.DEVICE_ADDON_PRICE);
  assert.equal(subs.MAX_SLOTS, pp.MAX_SLOTS);
  for (const kind of ["plan1", "plan3"]) {
    for (const term of pp.TERMS) {
      const r = subs.resolvePlan(kind, term);
      assert.equal(r.price, pp.PLAN_PRICES[kind][term].total, `${kind}/${term}`);
    }
  }
});

test("usd() drops zero cents and keeps the rest", () => {
  assert.equal(pp.usd(5), "$5");
  assert.equal(pp.usd(33), "$33");
  assert.equal(pp.usd(22.5), "$22.50");
  assert.equal(pp.usd(79.08), "$79.08");
  assert.equal(pp.usd(11.99), "$11.99");
  assert.equal(pp.usd2(5), "$5.00");
  assert.throws(() => pp.usd(-1), RangeError);
  assert.throws(() => pp.usd(Number.NaN), RangeError);
});

test("discounts are computed against paying monthly, per term", () => {
  assert.equal(pp.discountPercent("plan1", 1), 0);
  assert.equal(pp.discountPercent("plan1", 6), 25);
  assert.equal(pp.discountPercent("plan1", 12), 45);
  assert.equal(pp.discountPercent("plan3", 6), 25);
  assert.equal(pp.discountPercent("plan3", 12), 45);
});

test("per-month figures match total / term", () => {
  for (const kind of ["plan1", "plan3"]) {
    for (const term of pp.TERMS) {
      const p = pp.PLAN_PRICES[kind][term];
      assert.equal(Math.round((p.total / term) * 100) / 100, p.perMonth, `${kind}/${term}`);
    }
  }
  assert.equal(pp.lowestPerMonth(), 2.75);
});

test("planRows prints each term of a plan the way the pricing table shows it", () => {
  assert.deepEqual(pp.planRows("plan3"), [
    { term: 1, perMonth: "$11.99", total: "$11.99", vsMonthly: null, discount: 0 },
    { term: 6, perMonth: "$8.99", total: "$53.94", vsMonthly: "$71.94", discount: 25 },
    { term: 12, perMonth: "$6.59", total: "$79.08", vsMonthly: "$143.88", discount: 45 },
  ]);
  assert.deepEqual(pp.planRows("plan1"), [
    { term: 1, perMonth: "$5.00", total: "$5.00", vsMonthly: null, discount: 0 },
    { term: 6, perMonth: "$3.75", total: "$22.50", vsMonthly: "$30.00", discount: 25 },
    { term: 12, perMonth: "$2.75", total: "$33.00", vsMonthly: "$60.00", discount: 45 },
  ]);
});

test("planRows follows PLAN_PRICES: totals, per-month figures and the month-by-month price", () => {
  for (const kind of ["plan1", "plan3"]) {
    for (const row of pp.planRows(kind)) {
      const p = pp.PLAN_PRICES[kind][row.term];
      assert.equal(row.total, pp.usd2(p.total), `${kind}/${row.term} total`);
      assert.equal(row.perMonth, pp.usd2(p.perMonth), `${kind}/${row.term} per month`);
      assert.equal(row.vsMonthly, row.term === 1 ? null : pp.usd2(p.refMonthly * row.term), `${kind}/${row.term} vs monthly`);
      assert.equal(row.discount, pp.discountPercent(kind, row.term), `${kind}/${row.term} discount`);
    }
  }
});

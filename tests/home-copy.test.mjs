// tests/home-copy.test.mjs — run: npm test
//
// The landing's copy is plain data in src/lib/home-copy.ts, in five
// languages. The types already refuse a language that misses a key; these
// cases check the rest at run time:
//   • the same keys in every language, every value a non-empty string;
//   • no price typed by hand in the copy or in the view: a price is a
//     {placeholder} filled from src/lib/plan-prices.ts, the numbers the
//     server charges (a typed "$79.08" lives in ten copies and goes stale
//     without a sound);
//   • every placeholder is one the view fills, and none is left unfilled;
//   • the fill helpers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "./support/load-ts.mjs";

const copy = await import("../src/lib/home-copy.ts");
const pp = await import("../src/lib/plan-prices.ts");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LANGS = ["en", "ru", "es", "de", "fr"];
/** Filled per term inside the view, not by homeVars. */
const PER_TERM = ["n", "ref"];

/** A dollar amount written either way round: "$79.08", "79.08 $", "$ 5". */
const TYPED_PRICE = /\$\s?\d|\d[\d.,]*\s?\$/;

test("every language has the same keys, and every value is a non-empty string", () => {
  const want = Object.keys(copy.HOME_COPY.en).sort();
  assert.ok(want.length > 60, "the English copy is found");
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(copy.HOME_COPY[lang]).sort(), want, `${lang}: keys differ from English`);
    for (const [key, value] of Object.entries(copy.HOME_COPY[lang])) {
      assert.equal(typeof value, "string", `${lang}.${key}`);
      assert.ok(value.trim().length > 0, `${lang}.${key} is empty`);
    }
  }
});

test("no price is typed by hand in the copy", () => {
  const hits = [];
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(copy.HOME_COPY[lang])) {
      if (TYPED_PRICE.test(value)) hits.push(`${lang}.${key}: ${value}`);
    }
  }
  assert.deepEqual(hits, [], "a price in the copy must be a {placeholder} (see homeVars)");
});

test("the view types no price either: its tables and figures come from plan-prices", () => {
  const source = readFileSync(`${ROOT}src/app/HomeView.tsx`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const hits = source.split("\n").flatMap((line, i) => (TYPED_PRICE.test(line) ? [`HomeView.tsx:${i + 1} ${line.trim()}`] : []));
  assert.deepEqual(hits, []);
  assert.match(source, /planRows\(/, "the pricing table is read from the module");
});

test("every placeholder is one the view fills, and none is left unfilled", () => {
  const known = new Set([...PER_TERM, ...Object.keys(copy.homeVars("en"))]);
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(copy.HOME_COPY[lang])) {
      for (const m of value.matchAll(/\{(\w+)\}/g)) assert.ok(known.has(m[1]), `${lang}.${key}: unknown {${m[1]}}`);
      assert.ok(!/[{}]/.test(value.replace(/\{\w+\}/g, "")), `${lang}.${key}: a stray brace`);
    }
    const filled = copy.homeCopyFor(lang);
    for (const [key, value] of Object.entries(filled)) {
      for (const m of value.matchAll(/\{(\w+)\}/g)) {
        assert.ok(PER_TERM.includes(m[1]), `${lang}.${key}: {${m[1]}} left unfilled after homeCopyFor`);
      }
    }
  }
});

test("the placeholders in a language match the English copy's", () => {
  const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const lang of LANGS.filter((l) => l !== "en")) {
    for (const key of Object.keys(copy.HOME_COPY.en)) {
      assert.equal(holes(copy.HOME_COPY[lang][key]), holes(copy.HOME_COPY.en[key]), `${lang}.${key}`);
    }
  }
});

test("homeVars quote the prices the server charges", () => {
  const v = copy.homeVars("en");
  assert.equal(v.p3_12, pp.usd(pp.PLAN_PRICES.plan3[12].total));
  assert.equal(v.p3_12_mo, pp.usd(pp.PLAN_PRICES.plan3[12].perMonth));
  assert.equal(v.p1_12, pp.usd(pp.PLAN_PRICES.plan1[12].total));
  assert.equal(v.addon, pp.usd(pp.DEVICE_ADDON_PRICE));
});

test("a filled English FAQ answer carries the module's numbers", () => {
  const a = copy.homeCopyFor("en").faq_a2;
  assert.ok(a.includes(pp.usd(pp.PLAN_PRICES.plan3[12].total)), a);
  assert.ok(a.includes(pp.usd(pp.PLAN_PRICES.plan1[12].total)), a);
  assert.doesNotMatch(a, /[{}]/);
});

test("money is written the way each language writes it", () => {
  assert.equal(copy.formatMoney(79.08, "en"), "$79.08");
  assert.equal(copy.formatMoney(33, "en"), "$33");
  assert.equal(copy.formatMoney(5, "de"), "$5");
  assert.equal(copy.formatMoney(79.08, "fr"), "79.08 $", "French: after the number, a no-break space");
  assert.equal(copy.formatMoney(33, "fr"), "33 $");
  assert.throws(() => copy.formatMoney(-1, "en"), RangeError);
});

test("fillCopy fills known names, leaves unknown ones and never reads the prototype", () => {
  assert.equal(copy.fillCopy("a {x} b {y}", { x: "1" }), "a 1 b {y}");
  assert.equal(copy.fillCopy("{x}{x}", { x: "2" }), "22");
  assert.equal(copy.fillCopy("{constructor} {__proto__} {toString}", {}), "{constructor} {__proto__} {toString}");
  assert.equal(copy.fillCopy("no holes", { x: "1" }), "no holes");
  assert.equal(copy.fillCopy("", {}), "");
});

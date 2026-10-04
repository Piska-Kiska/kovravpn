// tests/site-meta.test.mjs — run: npm test
//
// The titles and descriptions of the landing pages (src/lib/site-meta.ts) are
// what a search result shows. They are held to the limits a result keeps
// (title at most 60 characters, description at most 160), they say what the
// service is without a promise it cannot keep, and the price in them is the
// one the server charges: computed, never typed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "./support/load-ts.mjs";

const meta = await import("../src/lib/site-meta.ts");
const pp = await import("../src/lib/plan-prices.ts");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGES = { home: meta.HOME_META, vless: meta.VLESS_META, crypto: meta.CRYPTO_META };

test("every title and description fits a search result", () => {
  assert.equal(meta.TITLE_MAX, 60);
  assert.equal(meta.DESCRIPTION_MAX, 160);
  for (const [name, m] of Object.entries(PAGES)) {
    assert.ok(m.title.length >= 20 && m.title.length <= meta.TITLE_MAX, `${name} title is ${m.title.length} characters`);
    assert.ok(m.description.length >= 100 && m.description.length <= meta.DESCRIPTION_MAX, `${name} description is ${m.description.length} characters`);
  }
});

test("titles and descriptions are unique, so no two pages compete for one result", () => {
  const titles = Object.values(PAGES).map((m) => m.title);
  const descriptions = Object.values(PAGES).map((m) => m.description);
  assert.equal(new Set(titles).size, titles.length);
  assert.equal(new Set(descriptions).size, descriptions.length);
});

test("the price in a description is the cheapest way in, computed from plan-prices", () => {
  const from = pp.usd(pp.PLAN_PRICES.plan1[1].perMonth);
  assert.equal(from, "$5");
  for (const [name, m] of Object.entries(PAGES)) {
    assert.ok(m.description.includes(`${from}/mo`) || m.description.includes(`${from}/month`), `${name}: ${m.description}`);
    // Any other dollar amount would be one nobody computed.
    const amounts = [...m.description.matchAll(/\$\d[\d.,]*/g)].map((x) => x[0]);
    assert.deepEqual([...new Set(amounts)], [from], `${name}: a price other than the computed one`);
  }
});

test("the copy promises nothing the service cannot keep", () => {
  for (const [name, m] of Object.entries(PAGES)) {
    const text = `${m.title} ${m.description}`;
    assert.doesNotMatch(text, /no[- ]logs|anonymous|unblockable|undetectable|works everywhere|military|post-quantum|ML-KEM|China|Iran|fastest|unlimited/i, name);
    assert.doesNotMatch(text, /[—–]/, `${name}: long dashes are not the brand's (short hyphens only)`);
    assert.doesNotMatch(text, /\b\d+\+?\s+(?:countries|locations|regions)\b/i, `${name}: a number of countries is never stated`);
  }
  assert.match(meta.HOME_META.description, /VLESS \+ REALITY/);
  assert.match(meta.VLESS_META.title, /Happ & INCY/);
  assert.match(meta.CRYPTO_META.description, /Telegram/);
});

test("the layout takes the home title and description from this module", () => {
  const layout = readFileSync(`${ROOT}src/app/layout.tsx`, "utf8");
  assert.match(layout, /DEFAULT_TITLE = HOME_META\.title/);
  assert.match(layout, /DEFAULT_DESC = HOME_META\.description/);
  assert.doesNotMatch(layout, /\$\d/, "no price typed in the layout");
});

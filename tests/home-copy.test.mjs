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
  const a = copy.homeCopyFor("en").faq_pay_a;
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

// ─── the first screen and the FAQ ──────────────────────────────────

test("the first screen carries the hook, and the retired hook is gone from every language", () => {
  const en = copy.HOME_COPY.en;
  assert.equal(en.badge, "VPN blocked on this network?");
  assert.equal(`${en.hero_t1} ${en.hero_t2}`, "To the network, it's just a website.");
  assert.match(en.hero_sub, /VLESS \+ REALITY/);
  assert.match(en.hero_sub, /Telegram/);
  assert.match(en.hero_sub, /USDT/);
  assert.match(en.hero_sub, /Happ or INCY/);
  const retired = /Privacy\.? ?Perfected|Приватность\. И точка|Privacidad\. Perfecta|Privatsphäre\. Perfektioniert|Confidentialité\. Perfectionnée/i;
  for (const lang of LANGS) {
    const { hero_t1, hero_t2, badge } = copy.HOME_COPY[lang];
    assert.doesNotMatch(`${hero_t1} ${hero_t2} ${badge}`, retired, lang);
  }
});

test("the call to action quotes the cheapest way in, computed", () => {
  for (const lang of LANGS) {
    const cta = copy.homeCopyFor(lang).hero_cta1;
    assert.ok(cta.includes(copy.formatMoney(pp.PLAN_PRICES.plan1[1].perMonth, lang)), `${lang}: ${cta}`);
  }
  assert.equal(copy.homeCopyFor("en").hero_cta1, "Get Kovra - from $5/mo");
});

test("the FAQ has the same nine questions in the same order in every language", () => {
  assert.equal(copy.HOME_FAQ_KEYS.length, 9);
  for (const key of copy.HOME_FAQ_KEYS) {
    for (const suffix of ["q", "a"]) assert.ok(`faq_${key}_${suffix}` in copy.HOME_COPY.en, `faq_${key}_${suffix}`);
  }
  for (const lang of LANGS) {
    const faq = copy.homeFaq(lang);
    assert.equal(faq.length, 9, lang);
    for (const item of faq) {
      assert.ok(item.q.trim().length > 5 && item.a.trim().length > 10, `${lang}: ${item.q}`);
      assert.doesNotMatch(item.q + item.a, /[{}]/, `${lang}: an unfilled placeholder in "${item.q}"`);
    }
    assert.equal(new Set(faq.map((f) => f.q)).size, 9, `${lang}: two questions are the same`);
  }
});

test("the English FAQ says what the code and the terms say, and no more", () => {
  const a = Object.fromEntries(copy.homeFaq("en").map((f) => [f.q, f.a]));
  const answer = (re) => Object.entries(a).find(([q]) => re.test(q))?.[1] ?? assert.fail(`no question matches ${re}`);

  // A network may still block it; the page says so next to the claim.
  assert.match(answer(/blocked on some networks/), /No protocol is guaranteed on every network/);
  // Email is optional only through Telegram.
  assert.match(answer(/email to sign up/), /Telegram[\s\S]*website signup uses email and a password/);
  // Crypto activation is what the cabinet says, and the buyer pays the network fee.
  assert.match(answer(/How do I pay/), /usually 5-30 minutes[\s\S]*network fees are added/);
  // Refunds: the terms as they are, with the window from the module.
  const refund = answer(/refund/);
  assert.match(refund, /fault on our side/);
  assert.ok(refund.includes(`within ${pp.REFUND_WINDOW_DAYS} days`), refund);
  assert.doesNotMatch(refund, /money[- ]back guarantee|full refund|if it does not connect/i);
  // Logs: the policy's words, never a promise of none.
  const logs = answer(/keep logs/);
  assert.match(logs, /traffic totals and last-connection time/);
  assert.doesNotMatch(logs, /no logs|zero logs|nothing recorded|don't keep/i);
  // Torrents and renewal.
  assert.match(answer(/torrents/), /BitTorrent is blocked on all Kovra servers/);
  assert.match(answer(/renew automatically/), /^No\./);
});

test("the limits line says what Kovra does not promise", () => {
  const { limits_b } = copy.HOME_COPY.en;
  assert.match(limits_b, /No protocol works on every network/);
  assert.match(limits_b, /BitTorrent is blocked on all servers/);
  assert.match(limits_b, /haven't tested Kovra from inside China or Iran/);
});

test("the Russian copy keeps to the brand rule: no \"VPN\", no talk of bypassing or blocking", () => {
  // The word, not a protocol's name: "OpenVPN" is what it is called.
  for (const [key, value] of Object.entries(copy.HOME_COPY.ru)) {
    assert.doesNotMatch(value, /\bVPN\b|обход|блокиров|РКН/i, `ru.${key}: ${value}`);
  }
});

test("the copy never states a number of countries, and uses short hyphens only", () => {
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(copy.homeCopyFor(lang))) {
      assert.doesNotMatch(value, /\b\d+\+?\s+(?:countries|locations|regions|стран|локаци|países|ubicaciones|Länder|Standorte|pays|emplacements)\b/i, `${lang}.${key}`);
      assert.doesNotMatch(value, /[—–]/, `${lang}.${key}: long dash`);
    }
  }
});

test("the page's revalidate window is the cached registry read's window", () => {
  const page = readFileSync(`${ROOT}src/app/page.tsx`, "utf8");
  const server = readFileSync(`${ROOT}src/lib/public-locations-server.ts`, "utf8");
  const pageWindow = page.match(/export const revalidate = (\d+);/)?.[1];
  const readWindow = server.match(/PUBLIC_COUNTRIES_REVALIDATE_S = (\d+);/)?.[1];
  assert.ok(pageWindow && readWindow, "both windows are literals");
  assert.equal(pageWindow, readWindow);
});

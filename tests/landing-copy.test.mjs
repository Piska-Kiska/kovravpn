// tests/landing-copy.test.mjs — run: npm test
//
// /vless and /crypto are English landing pages written from the claims bank
// of the 02.10.2026 research. This file holds them to it:
//   • prices, the refund window and the limits are the module's, never typed;
//   • every claim a FAQ answer makes is one the terms, the policy or the code
//     back up, and none of the promises the plan retired is there;
//   • the visible FAQ and the FAQPage markup are one array;
//   • every link goes somewhere that exists;
//   • the pages are in the sitemap, the IndexNow ping, llms.txt and the
//     footers, and the static llms.txt quotes only the module's prices.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "./support/load-ts.mjs";

const copy = await import("../src/lib/landing-copy.ts");
const home = await import("../src/lib/home-copy.ts");
const pp = await import("../src/lib/plan-prices.ts");
const meta = await import("../src/lib/site-meta.ts");
const { GUIDES } = await import("../src/lib/guides.ts");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFileSync(`${ROOT}${rel}`, "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Every string in a nested value. */
function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

const ALL_COPY = strings([copy.VLESS_PAGE, copy.CRYPTO_PAGE, copy.VLESS_FAQ, copy.CRYPTO_FAQ, copy.VLESS_MORE, copy.CRYPTO_MORE]);
const faq = (items, re) => items.find((f) => re.test(f.q))?.a ?? assert.fail(`no question matches ${re}`);

// ─── prices and shared text come from the modules ──────────────────

test("the prices these pages quote are the module's", () => {
  assert.deepEqual(copy.PRICES, {
    oneDeviceMonth: pp.usd(pp.PLAN_PRICES.plan1[1].total),
    oneDeviceYear: pp.usd(pp.PLAN_PRICES.plan1[12].total),
    threeDevicesMonth: pp.usd(pp.PLAN_PRICES.plan3[1].total),
    threeDevicesYear: pp.usd(pp.PLAN_PRICES.plan3[12].total),
    extraDevice: pp.usd(pp.DEVICE_ADDON_PRICE),
  });
});

test("no price is typed by hand in the landing copy, the pages or their components", () => {
  const files = [
    "src/lib/landing-copy.ts",
    "src/lib/site-meta.ts",
    "src/app/(landing)/vless/page.tsx",
    "src/app/(landing)/crypto/page.tsx",
    "src/components/LandingFaq.tsx",
    "src/components/LandingCrumbs.tsx",
  ];
  const hits = [];
  for (const file of files) {
    stripComments(read(file))
      .split("\n")
      .forEach((line, i) => {
        // "${price}" in a template literal is the point; "$5" or "$ 5" is not.
        if (/\$\s?\d|\d[\d.,]*\s?\$/.test(line)) hits.push(`${file}:${i + 1} ${line.trim()}`);
      });
  }
  assert.deepEqual(hits, []);
});

test("the refund, limits and payment text are the home page's, said once", () => {
  const en = home.homeCopyFor("en");
  assert.equal(copy.REFUND_TEXT, en.faq_refund_a);
  assert.equal(copy.LIMITS_TEXT, en.limits_b);
  assert.equal(copy.PAYMENT_TEXT, en.b4_b);
  assert.equal(copy.SAVINGS_TEXT, en.plan_savings);
  assert.deepEqual(copy.TERM_LABELS, { 1: en.term1, 6: en.term6, 12: en.term12 });
  assert.ok(copy.REFUND_TEXT.includes(`${pp.REFUND_WINDOW_DAYS} days`));
  assert.match(copy.REFUND_TEXT, /fault on our side/);
  assert.match(copy.LIMITS_TEXT, /China or Iran/);
  assert.match(copy.LIMITS_TEXT, /BitTorrent is blocked on all servers/);
});

// ─── facts typed in the copy are pinned to their sources ───────────

test("crypto timing in the copy is the cabinet's: 'usually 5-30 minutes' after network confirmation", async () => {
  const { DASH_DICT } = await import("../src/lib/dash-i18n.ts");
  const range = (text) => text.replace(/\u2013/g, "-").match(/usually (?:in )?(\d+-\d+) minutes/)?.[1];
  const cabinet = range(DASH_DICT.en.m_crypto_note);
  assert.ok(cabinet, "the cabinet quotes a range");
  assert.equal(range(copy.CRYPTO_TIMING_TEXT), cabinet);
  assert.equal(range(home.homeCopyFor("en").faq_pay_a), cabinet);
  for (const row of copy.CRYPTO_PAGE.rows) if (/confirmation/.test(row.p)) assert.equal(range(row.p), cabinet, row.p);
  // The range is the whole wait after the payment is sent, not a wait added to the confirmation.
  assert.doesNotMatch(strings(copy.CRYPTO_PAGE).join(" "), /minutes after the network confirms/);
});

test("the plan shape the copy words is the module's: 1 or 3 devices, terms of 1, 6 and 12 months, 30 days per extra device", () => {
  assert.deepEqual(pp.PLAN_SLOTS, { plan1: 1, plan3: 3 });
  assert.deepEqual([...pp.TERMS], [1, 6, 12]);
  assert.equal(pp.DEVICE_ADDON_DAYS, 30);
  const days = { en: /per (\d+) days/, ru: /за (\d+) дней/, es: /por (\d+) días/, de: /pro (\d+) Tage/, fr: /pour (\d+) jours/ };
  for (const [lang, re] of Object.entries(days)) {
    const c = home.homeCopyFor(lang);
    for (const key of ["b3_b", "faq_devices_a"]) assert.equal(Number(c[key].match(re)?.[1]), pp.DEVICE_ADDON_DAYS, `${lang}.${key}`);
  }
  const en = home.homeCopyFor("en");
  assert.match(en.faq_devices_a, /covers 1 or 3 devices/);
  assert.match(en.b3_b, /Up to 3 devices/);
  assert.match(en.price_meta, /1, 6 or 12 months/);
});

// ─── what the pages say ────────────────────────────────────────────

test("the hooks and headings are the plan's", () => {
  assert.equal(copy.VLESS_PAGE.kicker, "Need a VLESS subscription for Happ?");
  assert.equal(copy.VLESS_PAGE.h1, "Your VLESS link. We keep the servers running.");
  assert.equal(copy.CRYPTO_PAGE.kicker, "Pay in USDT. No email. One link.");
  assert.equal(copy.CRYPTO_PAGE.h1, "Pay in USDT. Sign up with Telegram.");
  assert.equal(copy.VLESS_PAGE.cta, `Get a link - from ${pp.usd(pp.PLAN_PRICES.plan1[1].total)}/mo`);
});

test("no promise the service cannot keep, no long dash, no number of countries", () => {
  const banned = /no[- ]logs|zero logs|nothing recorded|anonymity|unblockable|undetectable|works everywhere|military|post-quantum|ML-KEM|fastest|unlimited|guaranteed to work|100% /i;
  for (const text of ALL_COPY) {
    assert.doesNotMatch(text, banned, text);
    assert.doesNotMatch(text, /[—–]/, `long dash: ${text}`);
    assert.doesNotMatch(text, /\b\d+\+?\s+(?:countries|locations|regions)\b/i, `a number of countries: ${text}`);
    assert.doesNotMatch(text, /\b(?:V2RayTun|Streisand|Happ Plus|Kovra Ltd|Seychelles)\b/, `retired name: ${text}`);
  }
});

test("/vless: the answers say what the code and the terms say", () => {
  const f = copy.VLESS_FAQ;
  assert.equal(f.length, 6);
  assert.match(faq(f, /Which apps/), /We support and test Happ and INCY/);
  assert.match(faq(f, /Which apps/), /don't promise/);
  assert.match(faq(f, /two devices/), /^No\. Each link is bound to one device/);
  assert.ok(faq(f, /two devices/).includes(`${copy.PRICES.extraDevice} per 30 days`));
  assert.match(faq(f, /detectable/), /No protocol is guaranteed against every network/);
  const cost = faq(f, /How much/);
  for (const price of [copy.PRICES.oneDeviceMonth, copy.PRICES.oneDeviceYear, copy.PRICES.threeDevicesMonth, copy.PRICES.threeDevicesYear]) {
    assert.ok(cost.includes(price), `${price} in: ${cost}`);
  }
  assert.match(cost, /nothing renews automatically/);
  assert.match(faq(f, /free VLESS keys/), /maintained by us/);
});

test("/crypto: the answers say what the cabinet, the terms and the policy say", () => {
  const f = copy.CRYPTO_FAQ;
  assert.match(faq(f, /Which cryptocurrencies/), /USDT, BTC, ETH and more/);
  assert.match(faq(f, /Which cryptocurrencies/), /@CryptoBot with USDT, TON or BTC/);
  assert.match(faq(f, /How long/), /usually in 5-30 minutes/);
  assert.match(faq(f, /network fee/), /^You do; it is added at checkout\./);
  assert.match(faq(f, /email or a phone/), /No email if you sign up with Telegram, and we never ask for your phone/);
  assert.match(faq(f, /email or a phone/), /website signup uses email and a password/);
  const data = faq(f, /What data/);
  for (const stored of [/Telegram ID, username and display name/, /traffic totals/, /last-connection time/, /IP address at payment and at connection/, /device identifier/, /Privacy Policy/]) {
    assert.match(data, stored);
  }
  // Paying in crypto is not an anonymity claim.
  assert.match(faq(f, /anonymous/), /^Not by itself\./);
  const refund = faq(f, /refund/);
  assert.match(refund, /fault on our side/);
  assert.ok(refund.includes(`within ${pp.REFUND_WINDOW_DAYS} days`), refund);
  assert.match(refund, /same wallet in the same asset, less network fees/);
  assert.doesNotMatch(refund, /money[- ]back guarantee|full refund|if it does not connect/i);
});

test("each FAQ has distinct, non-empty questions and answers", () => {
  for (const items of [copy.VLESS_FAQ, copy.CRYPTO_FAQ]) {
    assert.ok(items.length >= 6);
    assert.equal(new Set(items.map((i) => i.q)).size, items.length);
    for (const i of items) assert.ok(i.q.endsWith("?") && i.a.trim().length > 20, i.q);
  }
});

// ─── links go somewhere ────────────────────────────────────────────

test("every internal link on the landing pages exists", () => {
  const slugs = new Set(GUIDES.map((g) => g.slug));
  const pages = new Set(["/guide", "/register", "/vless", "/crypto", "/guides"]);
  const links = [...copy.VLESS_MORE, ...copy.CRYPTO_MORE, ...copy.VLESS_PAGE.rows.flatMap((r) => ("links" in r ? r.links : []))];
  assert.ok(links.length >= 10);
  for (const { href, label } of links) {
    assert.ok(label.length > 2, href);
    const guide = href.match(/^\/guides\/([\w-]+)$/);
    assert.ok(guide ? slugs.has(guide[1]) : pages.has(href), `dead link: ${href}`);
  }
});

// ─── the pages are wired the way the tests assume ──────────────────

test("each page renders its FAQ and its FAQPage markup from one array, and takes its title from site-meta", () => {
  const vless = read("src/app/(landing)/vless/page.tsx");
  const crypto = read("src/app/(landing)/crypto/page.tsx");
  assert.match(vless, /<LandingFaq items=\{VLESS_FAQ\}/);
  assert.match(crypto, /<LandingFaq items=\{CRYPTO_FAQ\}/);
  assert.match(vless, /landingMetadata\(VLESS_META, "\/vless"/);
  assert.match(crypto, /landingMetadata\(CRYPTO_META, "\/crypto"/);
  assert.match(vless, /planRows\("plan1"\)[\s\S]*planRows\("plan3"\)/, "the price table is read from the module");
  assert.match(crypto, /botChatUrl\(\)/);
  const faqComponent = read("src/components/LandingFaq.tsx");
  assert.match(faqComponent, /buildFaqPageSchema\(items\)/);
  assert.match(faqComponent, /\{items\.map\(/);
  // The English-only shell, so lang says en.
  assert.match(read("src/app/(landing)/layout.tsx"), /EnglishShell/);
});

test("the landing metadata is absolute, canonical and carries the module's title", () => {
  for (const [path, m] of [["/vless", meta.VLESS_META], ["/crypto", meta.CRYPTO_META]]) {
    const out = meta.landingMetadata(m, path, "x");
    assert.deepEqual(out.title, { absolute: m.title });
    assert.equal(out.description, m.description);
    assert.equal(out.alternates.canonical, path);
    assert.equal(out.openGraph.url, path);
    assert.equal(out.openGraph.title, m.title);
    assert.match(out.openGraph.images[0].url, /^\/api\/og\?/);
  }
});

// ─── discoverability ───────────────────────────────────────────────

test("the landing pages are in the sitemap, the IndexNow ping, llms.txt and every footer", () => {
  assert.deepEqual(meta.LANDING_PAGES.map((p) => p.path), ["/vless", "/crypto"]);
  assert.match(read("src/app/sitemap.ts"), /LANDING_PAGES\.map/);
  assert.match(read("src/app/api/indexnow/cron/route.ts"), /LANDING_PAGES\.map/);
  const llms = read("public/llms.txt");
  for (const path of ["/vless", "/crypto"]) assert.ok(llms.includes(`https://kovravpn.com${path})`), `llms.txt lacks ${path}`);
  for (const file of ["src/components/EnglishShell.tsx", "src/app/HomeView.tsx"]) {
    const src = read(file);
    for (const path of ["/vless", "/crypto"]) assert.ok(src.includes(`"${path}"`), `${file} has no footer link to ${path}`);
  }
});

test("llms.txt quotes only the prices the module has", () => {
  const allowed = new Set([pp.usd(pp.DEVICE_ADDON_PRICE), pp.usd(pp.lowestPerMonth())]);
  for (const kind of ["plan1", "plan3"]) for (const term of pp.TERMS) allowed.add(pp.usd(pp.PLAN_PRICES[kind][term].total));
  const quoted = [...read("public/llms.txt").matchAll(/\$\d[\d.,]*\d|\$\d/g)].map((m) => m[0]);
  assert.ok(quoted.length >= 6, "llms.txt names the plans");
  for (const amount of quoted) assert.ok(allowed.has(amount), `llms.txt quotes ${amount}, which no plan charges`);
});

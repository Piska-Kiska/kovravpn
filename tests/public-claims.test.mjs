// tests/public-claims.test.mjs — run: npm test
//
// The public copy may only say what the code and the policy back up. On
// 02.10.2026 the site still promised zero logs, 25 Gbps across 30+ regions,
// "Renews at" prices, ML-KEM, a placeholder company in the Seychelles,
// V2RayTun and the removed "Happ Plus", signup with "one field", activation
// "in about a minute" and more (growth-2026-10-02 research, K1-K45). This
// test reads the files that render public copy and fails when one of those
// claims comes back, naming file:line.
//
// It reads text, not rendered pages, so it also catches a claim sitting in a
// dictionary or an FAQ constant before any page shows it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import "./support/load-ts.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

/** Every page.tsx under a directory, recursively. */
function pagesUnder(rel) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "page.tsx") out.push(relative(ROOT, full));
    }
  };
  walk(join(ROOT, rel));
  return out.sort();
}

/** Files whose text reaches visitors, search engines or answer engines. */
const PUBLIC_FILES = [
  "src/app/page.tsx",
  "src/app/HomeView.tsx",
  "src/lib/home-copy.ts",
  "src/app/layout.tsx",
  "src/app/guide/page.tsx",
  "src/app/register/layout.tsx",
  "src/components/GuideArticle.tsx",
  "src/lib/guides.ts",
  "src/lib/faq-items.ts",
  "src/i18n/legal.ts",
  "src/i18n/dict.ts",
  "src/lib/i18n-auth.ts",
  "public/llms.txt",
  ...pagesUnder("src/app/guides"),
];

/** Files that speak only about Kovra itself (no third-party comparisons). */
const KOVRA_OWN = [
  "src/app/page.tsx",
  "src/app/HomeView.tsx",
  "src/lib/home-copy.ts",
  "src/app/layout.tsx",
  "src/app/guide/page.tsx",
  "src/lib/faq-items.ts",
  "src/i18n/legal.ts",
  "src/i18n/dict.ts",
  "public/llms.txt",
];
// i18n-auth.ts is left out of KOVRA_OWN on purpose: its error strings say
// "try again in a minute", which is advice, not a timing claim.

/**
 * Claims that must not appear in public copy, with the reason. `allow` lists
 * files where the words appear as a statement of fact about somebody else (a
 * guide that says V2RayTun left the App Store, say); `only` limits a rule to
 * the files that speak about Kovra alone, where a generic phrase such as a
 * competitor's renewal price cannot occur.
 */
const FORBIDDEN = [
  { re: /Kovra Ltd|Seychelles|Сейшел/i, why: "Kovra has no registered company (owner, 02.10.2026)" },
  { re: /zero[- ]logs?|strict no-logs|nothing recorded|absolute anonymity|полная анонимность|ноль логов/i, why: "the policy lists what is stored" },
  { re: /next[- ]generation encryption|military[- ]grade|шифрование нового поколения/i, why: "REALITY is TLS 1.3 camouflage, not a new cipher" },
  { re: /\b25 ?Gbps|\d+ ?Gbit\/s|Гбит\/с|30\+ regions|under 20 ms/i, why: "speed and region counts were never measured" },
  { re: /Renews at|intro price|VAT may apply|Продлевается за|Может взиматься НДС/i, why: "plans are one-time payments with no auto-renewal", only: KOVRA_OWN },
  { re: /Happ Proxy Utility Plus|happ-proxy-utility-plus/i, why: "removed from every App Store since 12.08.2026" },
  { re: /\bV2RayTun\b/, why: "gone from the App Store, not offered by the cabinet", allow: ["src/app/guides/how-to-set-up-vpn-on-iphone/page.tsx", "src/app/guides/how-to-set-up-vpn-on-mac/page.tsx"] },
  { re: /\bStreisand\b/, why: "not a client Kovra supports", allow: ["src/app/guides/how-to-set-up-vpn-on-iphone/page.tsx", "src/app/guides/how-to-set-up-vpn-on-mac/page.tsx"] },
  { re: /one[- ]field|single field|random account ID\b/i, why: "the website signup takes email and password" },
  { re: /under a minute|online in 2 minutes|ready in 2 minutes|under two minutes|five-minute USDT/i, why: "crypto activates in usually 5-30 minutes; nothing else was timed" },
  { re: /about a minute|in a minute|за минуту|2[–-]3 минуты|5 минут/i, why: "nothing about Kovra was timed", only: KOVRA_OWN },
  { re: /Kovra'?s stack runs|nine Kovra locations|All nine/i, why: "no ML-KEM in the inbounds; no hardcoded location count" },
  { re: /3X-UI/, why: "internals of a public repository" },
  { re: /European rather than global|European server footprint|EU servers/i, why: "locations are in Europe, the US and Asia" },
  { re: /nobody else invoices|invoices USDT natively|native crypto invoicing/i, why: "Kovra goes through a processor too (NOWPayments)" },
  { re: /written by people who have not tested/i, why: "Kovra never tested from inside China" },
  { re: /Privacy\.? ?Perfected|Приватность\. И точка/i, why: "the retired first-screen hook: the hook is the question people ask when their network blocks them", only: KOVRA_OWN },
  { re: /\b\d+\+?\s+(?:countries|locations|regions)\b/i, why: "a number of countries is never stated: the list comes from the registry and a small number reads as weakness (owner, 01.10.2026)", only: KOVRA_OWN },
];

test("public copy carries none of the retired claims", () => {
  const hits = [];
  for (const file of PUBLIC_FILES) {
    const lines = read(file).split("\n");
    for (const rule of FORBIDDEN) {
      if (rule.allow?.includes(file)) continue;
      if (rule.only && !rule.only.includes(file)) continue;
      lines.forEach((line, i) => {
        if (rule.re.test(line)) hits.push(`${file}:${i + 1} ${rule.re} (${rule.why})`);
      });
    }
  }
  assert.deepEqual(hits, []);
});

test("the landing and llms.txt make no post-quantum or no-logs promise", () => {
  for (const file of ["src/lib/home-copy.ts", "src/app/HomeView.tsx", "src/app/layout.tsx", "public/llms.txt"]) {
    const text = read(file);
    assert.doesNotMatch(text, /ML-KEM|post-quantum/i, file);
    assert.doesNotMatch(text, /no-logs (VPN|policy|privacy)|"No logs/i, file);
  }
});

test("the privacy policy names the analytics it runs, in every language", async () => {
  const { LEGAL } = await import("../src/i18n/legal.ts");
  for (const [lang, docs] of Object.entries(LEGAL)) {
    const privacy = docs.privacy.sections.flatMap((s) => [s.h, ...s.p]).join("\n");
    assert.match(privacy, /Vercel Web Analytics/, `${lang}: analytics not named`);
    assert.match(privacy, /HWID/, `${lang}: device binding not named`);
    assert.match(privacy, /365/, `${lang}: binding lifetime not named`);
    assert.doesNotMatch(privacy, /third-party analytics|Аналитические и рекламные cookies сторонних|cookies de analítica ni|Analyse- oder Werbe-Cookies Dritter|cookies d'analyse ou de publicité tiers/i, `${lang}: denies analytics`);
    const terms = docs.terms.sections.flatMap((s) => [s.h, ...s.p]).join("\n");
    assert.match(terms, /support@kovravpn\.com/, `${lang}: terms lack the support contact`);
    assert.match(terms, /14/, `${lang}: refund window missing`);
  }
});

test("every guide that compares Kovra with other providers opens with the disclosure", async () => {
  const { GUIDES, COMPARISON_DISCLOSURE } = await import("../src/lib/guides.ts");
  const comparisons = [
    "best-crypto-vpn-2026",
    "mullvad-alternatives",
    "expressvpn-alternative",
    "nordvpn-alternative-crypto",
    "cheapest-private-vpn",
  ];
  for (const slug of comparisons) {
    const g = GUIDES.find((x) => x.slug === slug);
    assert.ok(g, slug);
    assert.equal(g.notice, COMPARISON_DISCLOSURE, `${slug}: no disclosure`);
    const page = read(`src/app/guides/${slug}/page.tsx`);
    assert.doesNotMatch(page, /Survives DPI|Strong by design/, `${slug}: unsourced DPI rating`);
  }
  // A guide body that names Kovra next to a competitor's name must be one of them.
  for (const file of pagesUnder("src/app/guides")) {
    const slug = file.split("/").at(-2);
    const text = read(file);
    const namesRival = /<th>(Mullvad|IVPN|NordVPN|ExpressVPN|AirVPN)<\/th>/.test(text);
    const namesKovra = /<th>Kovra/.test(text);
    if (namesRival && namesKovra) assert.ok(comparisons.includes(slug), `${slug}: compares Kovra without the disclosure`);
  }
});

test("the torrenting and China guides say what Kovra does not do, first", async () => {
  const { GUIDES } = await import("../src/lib/guides.ts");
  const torrent = GUIDES.find((g) => g.slug === "no-logs-vpn-for-torrenting");
  const china = GUIDES.find((g) => g.slug === "vpn-that-works-in-china");
  assert.match(torrent.notice ?? "", /blocks BitTorrent on all its servers/);
  assert.match(china.notice ?? "", /has not tested its service from inside China/);
});

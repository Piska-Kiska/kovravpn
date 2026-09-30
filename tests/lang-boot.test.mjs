// tests/lang-boot.test.mjs — run: npm test
//
// KP-08: /terms, /privacy and /guide opened in Russian for every visitor
// without a saved choice, and every page said lang="ru". Those pages exist
// in all five site languages, so they now open in the visitor's language
// like the cabinet (?lang, a real saved choice, the browser's languages,
// English), the Russian-only pages say "ru", and everything else says what
// it renders.
//
// The inline boot script (src/i18n/boot-script.ts) runs here, in a VM with a
// fake document, against bootLangFrom() (src/i18n/resolve.ts) over a matrix
// of pages and visitors, so the two cannot drift apart.

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import "./support/load-ts.mjs";

const { bootLangFrom, isVisitorLangPath, isRussianOnlyPath, isCabinetPath } = await import("../src/i18n/resolve.ts");
const { LANG_BOOT_SCRIPT } = await import("../src/i18n/boot-script.ts");

/** Run the boot script for one page and visitor; returns what it set. */
function boot({ pathname, search = "", saved = null, explicit = null, languages = [], throwOnStorage = false }) {
  const attrs = {};
  const classes = new Set();
  const store = { kovra_lang: saved, kovra_lang_explicit: explicit };
  const context = {
    URL,
    document: {
      documentElement: {
        setAttribute: (k, v) => {
          attrs[k] = v;
        },
        classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
      },
    },
    location: { pathname, href: `https://kovravpn.com${pathname}${search}` },
    localStorage: {
      getItem: (k) => {
        if (throwOnStorage) throw new Error("blocked");
        return store[k] ?? null;
      },
    },
    navigator: { languages, language: languages[0] ?? "" },
    setTimeout: () => 0,
  };
  vm.runInNewContext(LANG_BOOT_SCRIPT, context);
  return { lang: attrs.lang, dataLang: attrs["data-lang"], pending: classes.has("kc-lang-pending") };
}

const PAGES = ["/", "/terms", "/privacy", "/guide", "/guide/", "/guides", "/guides/vpn-in-turkey", "/login", "/register", "/dashboard", "/tg", "/promo", "/p/abcdefgh12", "/add/abcdefgh12", "/nope", "/termsx", "/pp"];
const VISITORS = [
  {},
  { languages: ["de-AT", "en"] },
  { languages: ["ru-RU"] },
  { languages: ["pt-BR", "fr"] },
  { saved: "en", languages: ["es"] },
  { saved: "en", explicit: "1", languages: ["es"] },
  { saved: "ru", languages: ["de"] },
  { search: "?lang=es", saved: "ru", explicit: "1" },
  { search: "?lang=xx", languages: ["fr-CA"] },
  { search: "?lang=ru" },
  { throwOnStorage: true, languages: ["de"] },
];

test("the boot script and bootLangFrom agree on every page for every visitor", () => {
  for (const pathname of PAGES) {
    for (const v of VISITORS) {
      const got = boot({ pathname, ...v });
      const urlLang = new URLSearchParams(v.search ?? "").get("lang");
      const want = bootLangFrom({
        pathname,
        urlLang,
        saved: v.throwOnStorage ? null : v.saved ?? null,
        explicit: v.throwOnStorage ? null : v.explicit ?? null,
        navigatorLanguages: v.languages ?? [],
      });
      assert.equal(got.lang, want, `${pathname} ${JSON.stringify(v)}`);
      assert.equal(got.dataLang, want);
    }
  }
});

test("a foreign visitor gets the Terms, the Privacy policy and the guide in their language", () => {
  for (const page of ["/terms", "/privacy", "/guide"]) {
    assert.equal(boot({ pathname: page, languages: ["de-DE", "en"] }).lang, "de", page);
    assert.equal(boot({ pathname: page, languages: ["en-US"] }).lang, "en", page);
    assert.equal(boot({ pathname: page, languages: ["ja-JP"] }).lang, "en", `${page}: no translation, English`);
    assert.equal(boot({ pathname: page }).lang, "en", `${page}: nothing known, English (it was Russian)`);
  }
});

test("a Russian visitor still gets Russian, and ?lang wins (the bot's links carry it)", () => {
  assert.equal(boot({ pathname: "/terms", languages: ["ru-RU", "en"] }).lang, "ru");
  assert.equal(boot({ pathname: "/terms", search: "?lang=fr", languages: ["ru"] }).lang, "fr");
  assert.equal(boot({ pathname: "/guide", saved: "ru", languages: ["en"] }).lang, "ru", "a saved Russian choice holds");
});

test("the translated pages are not hidden while they switch; the cabinet and the landing are", () => {
  assert.equal(boot({ pathname: "/terms", languages: ["de"] }).pending, false);
  assert.equal(boot({ pathname: "/dashboard", languages: ["de"] }).pending, true);
  assert.equal(boot({ pathname: "/", saved: "fr" }).pending, true);
  assert.equal(boot({ pathname: "/dashboard", languages: ["en"] }).pending, false);
});

test("Russian-only pages say ru, English-only guides say en, the rest say what they render", () => {
  assert.equal(boot({ pathname: "/promo", languages: ["en"] }).lang, "ru");
  assert.equal(boot({ pathname: "/p/abcdefgh12", languages: ["en"] }).lang, "ru");
  assert.equal(boot({ pathname: "/guides/vpn-in-turkey", saved: "ru", explicit: "1" }).lang, "en");
  assert.equal(boot({ pathname: "/add/abcdefgh12", search: "?lang=de" }).lang, "de");
  assert.equal(boot({ pathname: "/add/abcdefgh12", saved: "ru", explicit: "1" }).lang, "en", "/add renders ?lang or English");
});

test("the path helpers", () => {
  for (const p of ["/terms", "/privacy", "/guide", "/guide/", "/login", "/tg/"]) assert.equal(isVisitorLangPath(p), true, p);
  for (const p of ["/", "/guides", "/guides/x", "/termsx", "/promo", "/p/x"]) assert.equal(isVisitorLangPath(p), false, p);
  for (const p of ["/promo", "/p/abc", "/p"]) assert.equal(isRussianOnlyPath(p), true, p);
  for (const p of ["/pp", "/privacy", "/promo2"]) assert.equal(isRussianOnlyPath(p), false, p);
  assert.equal(isCabinetPath("/terms"), false, "the cabinet stays the cabinet: no DOM walks there");
});

test("the bot opens the translated pages in the bot's language", async () => {
  const { legalUrl, setupGuideUrl } = await import("../src/lib/bot-v2/links.ts");
  assert.equal(legalUrl("terms", "de"), "https://kovravpn.com/terms?lang=de");
  assert.equal(legalUrl("privacy", "ru"), "https://kovravpn.com/privacy?lang=ru");
  assert.equal(setupGuideUrl(null, "es"), "https://kovravpn.com/guide?lang=es");
  assert.equal(setupGuideUrl("iphone", "es"), "https://kovravpn.com/guides/how-to-set-up-vpn-on-iphone", "the English guides stay English");
  for (const lang of ["en", "ru", "es", "de", "fr"]) {
    const url = new URL(legalUrl("terms", lang));
    assert.equal(bootLangFrom({ pathname: url.pathname, urlLang: url.searchParams.get("lang"), saved: "ru", explicit: "1", navigatorLanguages: ["ja"] }), lang);
  }
});

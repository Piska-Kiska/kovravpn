// tests/lang-boot.test.mjs — run: npm test
//
// KP-08: /terms, /privacy and /guide opened in Russian for every visitor
// without a saved choice, and every page said lang="ru". They now open in the
// visitor's language like the cabinet (?lang, a real saved choice, the
// browser's languages, English) where the page exists in it: /terms and
// /privacy in all five, /guide in Russian and English only (its es/de/fr
// dictionary entries are copies of the English ones), so any other visitor
// reads it in English and the page says "en". The Russian-only pages say
// "ru", and everything else says what it renders.
//
// The inline boot script (src/i18n/boot-script.ts) runs here, in a VM with a
// fake document, against bootLangFrom() (src/i18n/resolve.ts) over a matrix
// of pages and visitors, so the two cannot drift apart.

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import "./support/load-ts.mjs";

const { bootLangFrom, isVisitorLangPath, isRussianOnlyPath, isCabinetPath, isEnglishOnlyPath, pageLang } = await import("../src/i18n/resolve.ts");
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

const PAGES = ["/", "/terms", "/privacy", "/guide", "/guide/", "/guides", "/guides/vpn-in-turkey", "/vless", "/vless/", "/crypto", "/login", "/register", "/dashboard", "/tg", "/promo", "/p/abcdefgh12", "/add/abcdefgh12", "/nope", "/termsx", "/pp"];
const VISITORS = [
  {},
  { languages: ["de-AT", "en"] },
  { search: "?lang=de" },
  { saved: "fr", explicit: "1", languages: ["ru"] },
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

test("a foreign visitor gets the Terms and the Privacy policy in their language", () => {
  for (const page of ["/terms", "/privacy"]) {
    assert.equal(boot({ pathname: page, languages: ["de-DE", "en"] }).lang, "de", page);
    assert.equal(boot({ pathname: page, languages: ["en-US"] }).lang, "en", page);
    assert.equal(boot({ pathname: page, languages: ["ja-JP"] }).lang, "en", `${page}: no translation, English`);
    assert.equal(boot({ pathname: page }).lang, "en", `${page}: nothing known, English (it was Russian)`);
  }
});

test("the guide exists in Russian and English only: every other visitor gets English, and lang says en", () => {
  for (const page of ["/guide", "/guide/"]) {
    for (const v of [
      { languages: ["de-DE", "en"] },
      { languages: ["es"] },
      { languages: ["fr-CA"] },
      { search: "?lang=de" },
      { saved: "es", explicit: "1" },
      { languages: ["ja-JP"] },
      {},
    ]) {
      const got = boot({ pathname: page, ...v });
      assert.equal(got.lang, "en", `${page} ${JSON.stringify(v)}`);
      assert.equal(got.dataLang, "en");
    }
    assert.equal(boot({ pathname: page, languages: ["ru-RU", "de"] }).lang, "ru", "a Russian visitor reads the Russian original");
    assert.equal(boot({ pathname: page, search: "?lang=ru", languages: ["de"] }).lang, "ru");
  }
});

test("pageLang narrows only the pages that lack a language", () => {
  for (const lang of ["es", "de", "fr", "en"]) assert.equal(pageLang("/guide", lang), "en", lang);
  assert.equal(pageLang("/guide", "ru"), "ru");
  for (const lang of ["en", "ru", "es", "de", "fr"]) {
    assert.equal(pageLang("/terms", lang), lang);
    assert.equal(pageLang("/privacy", lang), lang);
    assert.equal(pageLang("/dashboard", lang), lang);
  }
  assert.equal(pageLang("/guides/x", "de"), "de", "/guides is handled by its own rule, not this one");
});

test("the guide's languages match its dictionary: none of es/de/fr has text of its own yet", async () => {
  // When someone translates the guide into one of them, it must be added to
  // PAGE_LANGS in src/i18n/resolve.ts, or visitors keep getting English.
  const { dict } = await import("../src/i18n/dict.ts");
  const keys = Object.keys(dict.en).filter((k) => k.startsWith("guide.") || k.startsWith("faq.guide."));
  assert.ok(keys.length > 30, "the guide keys are found");
  for (const lang of ["es", "de", "fr"]) {
    const own = keys.filter((k) => typeof dict[lang][k] === "string" && dict[lang][k] !== dict.en[k]);
    const translated = own.length > 0;
    assert.equal(pageLang("/guide", lang) === lang, translated, `${lang}: ${own.length} own guide strings`);
  }
});

test("a Russian visitor still gets Russian, and ?lang wins (the bot's links carry it)", () => {
  assert.equal(boot({ pathname: "/terms", languages: ["ru-RU", "en"] }).lang, "ru");
  assert.equal(boot({ pathname: "/terms", search: "?lang=fr", languages: ["ru"] }).lang, "fr");
  assert.equal(boot({ pathname: "/guide", saved: "ru", languages: ["en"] }).lang, "ru", "a saved Russian choice holds");
  assert.equal(boot({ pathname: "/guide", saved: "en", explicit: "1", languages: ["ru"] }).lang, "en", "and an English one");
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

test("the English-only landing pages say en for every visitor, like the guides", () => {
  // Localizer.detectLang() would answer "ru" for a first-time visitor on a
  // path it does not know, so these pages are English-only on purpose.
  for (const pathname of ["/vless", "/vless/", "/crypto", "/crypto/"]) {
    for (const v of [
      {},
      { languages: ["ru-RU"] },
      { languages: ["de-DE", "en"] },
      { saved: "ru", explicit: "1" },
      { saved: "fr" },
      { search: "?lang=es" },
      { search: "?lang=ru", saved: "de" },
      { throwOnStorage: true, languages: ["fr"] },
    ]) {
      const got = boot({ pathname, ...v });
      assert.equal(got.lang, "en", `${pathname} ${JSON.stringify(v)}`);
      assert.equal(got.dataLang, "en");
      assert.equal(got.pending, false, "an English page is never hidden while it waits for a language");
    }
  }
});

test("the path helpers", () => {
  for (const p of ["/terms", "/privacy", "/guide", "/guide/", "/login", "/tg/"]) assert.equal(isVisitorLangPath(p), true, p);
  for (const p of ["/", "/guides", "/guides/x", "/vless", "/crypto", "/termsx", "/promo", "/p/x"]) assert.equal(isVisitorLangPath(p), false, p);
  for (const p of ["/guides", "/guides/x", "/vless", "/vless/", "/crypto", "/crypto/x"]) assert.equal(isEnglishOnlyPath(p), true, p);
  for (const p of ["/", "/guide", "/guide/", "/vlessx", "/cryptography", "/terms", "/login", "/promo"]) assert.equal(isEnglishOnlyPath(p), false, p);
  for (const p of ["/promo", "/p/abc", "/p"]) assert.equal(isRussianOnlyPath(p), true, p);
  for (const p of ["/pp", "/privacy", "/promo2"]) assert.equal(isRussianOnlyPath(p), false, p);
  assert.equal(isCabinetPath("/terms"), false, "the cabinet stays the cabinet: no DOM walks there");
});

test("the bot opens the translated pages in the bot's language", async () => {
  const { legalUrl, setupGuideUrl } = await import("../src/lib/bot-v2/links.ts");
  assert.equal(legalUrl("terms", "de"), "https://kovravpn.com/terms?lang=de");
  assert.equal(legalUrl("privacy", "ru"), "https://kovravpn.com/privacy?lang=ru");
  assert.equal(setupGuideUrl(null, "ru"), "https://kovravpn.com/guide?lang=ru");
  assert.equal(setupGuideUrl(null, "es"), "https://kovravpn.com/guide?lang=en", "the guide has no Spanish: English, and the link says so");
  assert.equal(setupGuideUrl("iphone", "es"), "https://kovravpn.com/guides/how-to-set-up-vpn-on-iphone", "the English guides stay English");
  for (const lang of ["en", "ru", "es", "de", "fr"]) {
    const url = new URL(legalUrl("terms", lang));
    assert.equal(bootLangFrom({ pathname: url.pathname, urlLang: url.searchParams.get("lang"), saved: "ru", explicit: "1", navigatorLanguages: ["ja"] }), lang);
  }
});

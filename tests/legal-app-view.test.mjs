// tests/legal-app-view.test.mjs — run: npm test
//
// The app view of the pages our app opens (/privacy, /terms, /support with
// `?src=app`, src/lib/legal-routes.ts) and the support page's texts
// (src/i18n/support.ts).
//
// Pinned here:
//   * only exactly `src=app` is the app view;
//   * the app view has no way home, keeps `?src=app` on its links to the
//     documents, shows the bot as plain text in the legal texts and leaves
//     it out of the support page, and counts nothing (analytics dropped);
//   * the support page says the same in all five languages, with no word
//     about money in what the app shows, and quotes the cabinet's and the
//     app's buttons as they are spelled.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "./support/load-ts.mjs";

const { isAppView, isAppViewUrl, legalHref, APP_VIEW_QUERY } = await import("../src/lib/legal-routes.ts");
const { SUPPORT } = await import("../src/i18n/support.ts");
const { DASH_DICT } = await import("../src/lib/dash-i18n.ts");

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const LANGS = ["en", "ru", "es", "de", "fr"];

describe("isAppView", () => {
  test("exactly src=app", () => {
    assert.equal(isAppView({ src: "app" }), true);
    for (const params of [undefined, {}, { src: "" }, { src: "APP" }, { src: "apps" }, { src: ["app", "app"] }, { source: "app" }]) {
      assert.equal(isAppView(params), false, JSON.stringify(params));
    }
  });

  test("the query is the one the app's allowlist compares as a whole", () => {
    assert.equal(APP_VIEW_QUERY, "?src=app");
    assert.equal(legalHref("/privacy", true), "/privacy?src=app");
    assert.equal(legalHref("/privacy", false), "/privacy");
  });
});

describe("isAppViewUrl", () => {
  test("absolute and root-relative app-view addresses", () => {
    for (const url of ["https://kovravpn.com/privacy?src=app", "/support?src=app", "https://kovravpn.com/terms?src=app#top", "/support?lang=ru&src=app"]) {
      assert.equal(isAppViewUrl(url), true, url);
    }
  });

  test("anything else", () => {
    for (const url of ["https://kovravpn.com/privacy", "/privacy?src=apps", "/privacy?src=app&src=app", "/privacy?src=", "", "http://[", "/dashboard"]) {
      assert.equal(isAppViewUrl(url), false, url);
    }
  });
});

describe("the pages", () => {
  for (const [path, view] of [
    ["app/privacy/page.tsx", "LegalView"],
    ["app/terms/page.tsx", "LegalView"],
    ["app/support/page.tsx", "SupportView"],
  ]) {
    test(`${path}: the app view has no way home`, () => {
      const page = read(path);
      assert.match(page, /const appView = isAppView\(await searchParams\);/);
      assert.match(page, /<SiteHeader home=\{!appView\}>/);
      assert.match(page, /\{appView \? null : \(\s*<Link href="\/" className="kh-link">/);
      assert.match(page, new RegExp(`<${view} [^>]*appView=\\{appView\\}`));
    });
  }

  test("the header's wordmark leads home only when asked to", () => {
    const header = read("components/chrome/SiteHeader.tsx");
    assert.match(header, /home = true/);
    assert.match(header, /\{home \? \(\s*<Link href="\/"/);
  });

  test("the legal texts show the bot as plain text in the app view, and keep it", () => {
    const view = read("components/LegalView.tsx");
    assert.match(view, /const APP_LINKS: readonly ContactLink\[\] = \[EMAIL_LINK\];/);
    assert.match(view, /const links = appView \? APP_LINKS : WEB_LINKS;/);
    assert.match(view, /legalHref\(`\/\$\{other\}`, appView\)/);
  });

  test("the support page leaves the bot out of the app view", () => {
    const view = read("components/SupportView.tsx");
    assert.match(view, /appView \? paras\.filter\(\(p\) => !p\.webOnly\) : paras/);
    for (const doc of ["privacy", "terms"]) assert.match(view, new RegExp(`legalHref\\("/${doc}", appView\\)`));
  });

  test("the app view counts nothing", () => {
    const layout = read("app/layout.tsx");
    assert.match(layout, /<SiteAnalytics \/>/);
    assert.doesNotMatch(layout, /<Analytics|<SpeedInsights|@vercel\/analytics|@vercel\/speed-insights/);
    const analytics = read("components/SiteAnalytics.tsx");
    assert.match(analytics, /isAppViewUrl\(event\.url\) \? null : event/);
    assert.match(analytics, /<Analytics beforeSend=/);
    assert.match(analytics, /<SpeedInsights beforeSend=/);
  });
});

/** Every paragraph of a language, with whether the app view shows it. */
function paragraphs(doc) {
  return [...doc.contact, ...doc.faq.flatMap((f) => f.a), ...doc.docs];
}

const textOf = (para) => para.parts.map((p) => (typeof p === "string" ? p : p.text)).join("");
const linksOf = (para) => para.parts.filter((p) => typeof p !== "string").map((p) => p.link);

describe("the support texts", () => {
  test("all five languages have the same shape and the same links", () => {
    const en = SUPPORT.en;
    for (const lang of LANGS) {
      const d = SUPPORT[lang];
      assert.equal(d.contact.length, en.contact.length, lang);
      assert.equal(d.faq.length, en.faq.length, lang);
      assert.equal(d.docs.length, en.docs.length, lang);
      d.faq.forEach((f, i) => assert.equal(f.a.length, en.faq[i].a.length, `${lang} faq ${i}`));
      const mine = paragraphs(d);
      paragraphs(en).forEach((p, i) => {
        assert.deepEqual(linksOf(mine[i]), linksOf(p), `${lang} paragraph ${i}`);
        assert.equal(Boolean(mine[i].webOnly), Boolean(p.webOnly), `${lang} paragraph ${i}`);
      });
    }
  });

  test("what the app view shows: no bot, no money, no other apps", () => {
    const FORBIDDEN =
      /@KovraVPN_bot|t\.me|(?<!\p{L})bot(?!\p{L})|(?<!\p{L})бот(?!\p{L})|\bbuy|price|\bpay|\bplan\b|top[\s-]?up|купи|оплат|тариф|пополн|баланс|cuenta de pago|precio|comprar|kaufen|preis|acheter|prix|other apps|другие приложения|otras apps|andere apps|autres apps/iu;
    for (const lang of LANGS) {
      for (const para of paragraphs(SUPPORT[lang]).filter((p) => !p.webOnly)) {
        assert.doesNotMatch(textOf(para), FORBIDDEN, `${lang}: ${textOf(para)}`);
        assert.ok(!linksOf(para).includes("bot"), `${lang}: ${textOf(para)}`);
      }
    }
  });

  test("the web view still names the bot", () => {
    for (const lang of LANGS) {
      assert.ok(paragraphs(SUPPORT[lang]).some((p) => p.webOnly && linksOf(p).includes("bot")), lang);
    }
  });

  test("every language says how to delete the account and links the policy", () => {
    for (const lang of LANGS) {
      const all = paragraphs(SUPPORT[lang]).flatMap(linksOf);
      for (const link of ["email", "delete", "privacy", "terms"]) assert.ok(all.includes(link), `${lang}: ${link}`);
    }
  });

  test("the buttons are quoted as the cabinet and the app spell them", () => {
    for (const lang of LANGS) {
      const signIn = textOf(SUPPORT[lang].faq[0].a[0]);
      assert.ok(signIn.includes(DASH_DICT[lang].app_code), `${lang}: the cabinet's button`);
      const appButton = lang === "ru" ? "Войти по коду из аккаунта" : "Sign in with a code from your account";
      assert.ok(signIn.includes(appButton), `${lang}: the app's button`);
    }
  });

  test("French puts a no-break space before its high punctuation", () => {
    for (const para of paragraphs(SUPPORT.fr)) {
      assert.doesNotMatch(textOf(para), / [?:;!»]|« /, textOf(para));
    }
    for (const f of SUPPORT.fr.faq) assert.doesNotMatch(f.q, / [?:;!]/, f.q);
  });
});

// tests/sub-notices-store.test.mjs — run: npm test
//
// The store form of the subscription notices (src/lib/client-dist.ts,
// src/lib/sub-notices.ts): what a store build of our app is shown when a
// link may not get servers, and what every other client still gets.
//
// Pinned here:
//   * a store build is the `x-client-dist: appstore|play` header or our app's
//     exact User-Agent; nothing else is, a Hiddify UA that ends in "; play)"
//     included;
//   * `lang` picks Russian or English, everything else reads English;
//   * every other client gets the very bytes it got before the store form
//     existed (hashes taken from the previous sub-notices.ts);
//   * the store form: a 200 with one dead 127.0.0.1:1 line, no word about
//     money, plans, the bot or the cabinet, no button, no link but our
//     support page, in both languages;
//   * the titles carry the markers the app names the refusal by;
//   * both feeds read the store marker and hand it to the notices.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import "./support/load-ts.mjs";

const { isStoreClient, storeLangOf, CLIENT_DIST_HEADER } = await import("../src/lib/client-dist.ts");
const { subRefusalResponse, feedUi, HAPP_UI, STORE_FEED_UI, STORE_SUPPORT_URL } = await import("../src/lib/sub-notices.ts");

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const headersOf = (map) => ({ get: (name) => map[name.toLowerCase()] ?? null });

const OUR_UA = "Kovra/0.3.14 (iOS; appstore)";

const REFUSALS = [
  { kind: "invalid" },
  { kind: "not-found", message: "Token not found" },
  { kind: "deleted" },
  { kind: "second-device" },
  { kind: "no-plan" },
  { kind: "paused" },
];
const STUBS = REFUSALS.filter((r) => r.kind !== "invalid" && r.kind !== "not-found");

/** sha256 of status, sorted headers and body, the way the hashes below were taken. */
async function fingerprint(res) {
  const headers = [...res.headers.entries()].sort();
  const body = await res.text();
  return createHash("sha256").update(JSON.stringify({ status: res.status, headers, body })).digest("hex");
}

/** Plain text of a header value, `base64:` unwrapped. */
function text(value) {
  if (value === null) return null;
  return value.startsWith("base64:") ? Buffer.from(value.slice(7), "base64").toString("utf8") : value;
}

/** The one line of a stub body, decoded. */
async function stubLine(res) {
  return Buffer.from(await res.text(), "base64").toString("utf8");
}

/** Words a store build may not show: money, plans, buying, the bot and the cabinet, in both languages. */
const FORBIDDEN_RE =
  /\bbuy|purchase|\bplan\b|\bplans\b|price|\bpay|top[\s-]?up|renew|balance|subscribe|discount|promo|\bslot|купи|покупк|оплат|оплач|тариф|пополн|баланс|продл|(?<!\p{L})цен|скидк|промокод|слот|\$|€|₽|\bbot\b|_bot\b|(?<!\p{L})бот(?:а|е|у|ом)?(?!\p{L})|telegram|телеграм|t\.me|dashboard|cabinet|кабинет/iu;

describe("isStoreClient", () => {
  test("the dist header names a store build, in any case", () => {
    for (const value of ["appstore", "play", "AppStore", " appstore "]) {
      assert.equal(isStoreClient(headersOf({ [CLIENT_DIST_HEADER]: value })), true, value);
    }
  });

  test("our app's User-Agent alone is enough", () => {
    assert.equal(isStoreClient(headersOf({ "user-agent": OUR_UA })), true);
    assert.equal(isStoreClient(headersOf({ "user-agent": "Kovra/0.3.14 (iPadOS; appstore)" })), true);
  });

  test("nobody else is a store build", () => {
    for (const map of [
      {},
      { [CLIENT_DIST_HEADER]: "" },
      { [CLIENT_DIST_HEADER]: "direct" },
      { [CLIENT_DIST_HEADER]: "appstore2" },
      { "user-agent": "Happ/3.2.1" },
      { "user-agent": "HiddifyNext/2.5.7 (android; play)" },
      { "user-agent": "ProxysVPN/0.3.14 (iOS; appstore)" },
      { "user-agent": `x ${OUR_UA}` },
      { "user-agent": "v2rayN/7.0" },
    ]) {
      assert.equal(isStoreClient(headersOf(map)), false, JSON.stringify(map));
    }
  });
});

describe("storeLangOf", () => {
  test("Russian for ru in its usual spellings, English for everything else", () => {
    for (const lang of ["ru", "RU", "ru-RU", "ru_RU", " ru "]) assert.equal(storeLangOf(lang), "ru", lang);
    for (const lang of ["en", "de", "", null, undefined, "rus", "uk", "fr-ru"]) assert.equal(storeLangOf(lang), "en", String(lang));
  });
});

describe("every other client", () => {
  // Taken from the previous src/lib/sub-notices.ts (before the store form).
  const BEFORE = {
    invalid: "170ca3097e41130f9e372f9d74c1e211b800d9a626261cde8aa83af591534a4f",
    "not-found": "973d5dd0397dedc99e3896ea7868c7e87b0064ba65d5c0f0a46a37de63808433",
    deleted: "b3d9d69f51266cb7faa760190989341be1c620b4797c661e9d4ba2962dc188f2",
    "second-device": "b7baf5cc47205b2ce5e2ba8c3de06fe4a19bff43d9002f136569d5dbb06b5571",
    "no-plan": "19a480c617994c54e092683564c971f21d622c6f0e4a0c9ff8310fdc2b4daa5d",
    paused: "b5af0632d9bca04a72ab2b747d61a149f7135b3b50ccbcbdba75f6ed75ef7c73",
  };

  test("gets the very notices it got before, byte for byte", async () => {
    for (const refusal of REFUSALS) {
      assert.equal(await fingerprint(subRefusalResponse(refusal)), BEFORE[refusal.kind], refusal.kind);
      assert.equal(await fingerprint(subRefusalResponse(refusal, null)), BEFORE[refusal.kind], refusal.kind);
    }
  });

  test("gets HAPP_UI itself on a working feed", () => {
    assert.equal(feedUi(null), HAPP_UI);
  });
});

describe("the store form", () => {
  test("a working feed: support is our page, no link home, the rest as before", () => {
    assert.equal(feedUi("en"), STORE_FEED_UI);
    assert.equal(feedUi("ru"), STORE_FEED_UI);
    assert.equal(STORE_FEED_UI["support-url"], STORE_SUPPORT_URL);
    assert.equal(STORE_SUPPORT_URL, "https://kovravpn.com/support?src=app");
    assert.equal("profile-web-page-url" in STORE_FEED_UI, false);
    for (const [name, value] of Object.entries(HAPP_UI)) {
      if (name === "support-url" || name === "profile-web-page-url") continue;
      assert.equal(STORE_FEED_UI[name], value, name);
    }
  });

  test("a bad or unknown token answers as for everybody", async () => {
    for (const refusal of REFUSALS.filter((r) => !STUBS.includes(r))) {
      for (const lang of ["en", "ru"]) {
        assert.equal(await fingerprint(subRefusalResponse(refusal, lang)), await fingerprint(subRefusalResponse(refusal)), refusal.kind);
      }
    }
  });

  test("each notice is a 200 with one dead line, not cached", async () => {
    for (const refusal of STUBS) {
      for (const lang of ["en", "ru"]) {
        const res = subRefusalResponse(refusal, lang);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("cache-control"), "no-cache, no-store");
        const line = await stubLine(res);
        assert.equal(line.split("\n").length, 1);
        assert.match(line, /^vless:\/\/00000000-0000-0000-0000-000000000000@127\.0\.0\.1:1\?/);
      }
    }
  });

  test("nothing about money, plans, the bot or the cabinet, in either language", async () => {
    for (const refusal of STUBS) {
      for (const lang of ["en", "ru"]) {
        const res = subRefusalResponse(refusal, lang);
        const shown = [
          text(res.headers.get("profile-title")),
          text(res.headers.get("announce")),
          text(res.headers.get("sub-info-text")),
          decodeURIComponent((await stubLine(res)).split("#")[1]),
        ];
        for (const words of shown) {
          assert.ok(words && words.trim() !== "", `${refusal.kind}/${lang}: empty`);
          assert.doesNotMatch(words, FORBIDDEN_RE, `${refusal.kind}/${lang}: ${words}`);
        }
      }
    }
  });

  test("the word check is not empty: it catches what everybody else is shown", () => {
    for (const kind of ["deleted", "second-device", "no-plan", "paused"]) {
      const res = subRefusalResponse({ kind });
      const shown = `${text(res.headers.get("announce"))} ${res.headers.get("support-url")}`;
      assert.match(shown, FORBIDDEN_RE, kind);
    }
  });

  test("no button, no link home, and support is our page", () => {
    for (const refusal of STUBS) {
      for (const lang of ["en", "ru"]) {
        const res = subRefusalResponse(refusal, lang);
        assert.equal(res.headers.get("sub-info-button-text"), null, refusal.kind);
        assert.equal(res.headers.get("sub-info-button-link"), null, refusal.kind);
        assert.equal(res.headers.get("profile-web-page-url"), null, refusal.kind);
        assert.equal(res.headers.get("announce-url"), null, refusal.kind);
        assert.equal(res.headers.get("support-url"), STORE_SUPPORT_URL, refusal.kind);
        for (const [name, value] of res.headers.entries()) {
          if (/https?:\/\//i.test(value)) assert.equal(value, STORE_SUPPORT_URL, name);
        }
      }
    }
  });

  test("the Russian texts are Russian, the English ones English", () => {
    for (const refusal of STUBS) {
      assert.match(text(subRefusalResponse(refusal, "ru").headers.get("announce")), /[а-яё]/i, refusal.kind);
      assert.doesNotMatch(text(subRefusalResponse(refusal, "en").headers.get("announce")), /[а-яё]/i, refusal.kind);
    }
  });

  test("the titles carry the markers the app names the refusal by", () => {
    // The app's subscription.rs refusal_error: DEVICE_TAKEN_MARKERS,
    // NO_DEVICES_MARKERS, and a title starting with ⚠ for "access ended".
    const all = (kind, lang) => {
      const res = subRefusalResponse({ kind }, lang);
      return `${text(res.headers.get("profile-title"))}\n${text(res.headers.get("announce"))}`;
    };
    assert.match(all("second-device", "en"), /Device limit/);
    assert.match(all("second-device", "ru"), /Сбросьте привязку/);
    assert.match(all("deleted", "en"), /Subscription removed/);
    assert.match(all("deleted", "ru"), /Эта ссылка больше не работает/);
    for (const lang of ["en", "ru"]) {
      assert.ok(text(subRefusalResponse({ kind: "no-plan" }, lang).headers.get("profile-title")).startsWith("⚠"), lang);
      assert.ok(!text(subRefusalResponse({ kind: "paused" }, lang).headers.get("profile-title")).startsWith("⚠"), lang);
    }
  });
});

describe("the feeds", () => {
  test("both read the store marker and hand it to the notices", () => {
    for (const path of ["app/api/sub/[token]/route.ts", "app/api/sub/[token]/vless/route.ts"]) {
      const route = read(path);
      assert.match(route, /isStoreClient\(req\.headers\) \? storeLangOf\(new URL\(req\.url\)\.searchParams\.get\("lang"\)\) : null/, path);
      assert.match(route, /return subRefusalResponse\(access, store\)/, path);
    }
  });

  test("the main feed builds every 200 from feedUi(store), never from HAPP_UI", () => {
    const route = read("app/api/sub/[token]/route.ts");
    assert.doesNotMatch(route, /HAPP_UI/);
    assert.equal(route.match(/\.\.\.feedUi\(store\)/g)?.length, 2);
    assert.doesNotMatch(route, /(?:plainHeaders|jsonHeaders)\(expire(?:Sec)?\)/, "every call passes the store form");
  });

  test("the vless feed's 200 carries no text and no link to filter", () => {
    const route = read("app/api/sub/[token]/vless/route.ts");
    const ok = route.slice(route.indexOf("function respondBase64"));
    assert.doesNotMatch(ok, /https?:\/\/|announce|sub-info|support-url/);
  });
});

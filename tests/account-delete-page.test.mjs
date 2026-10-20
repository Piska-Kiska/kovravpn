// tests/account-delete-page.test.mjs — run: npm test
//
// The account deletion page (/dashboard/account/delete): its reading of the
// endpoints (delete-flow.ts), its words in five languages
// (lib/account-delete-i18n.ts) and, at source level, what the view may link
// to. The Kovra app opens this page, so it must not lead to a page that
// sells (App Review Guideline 3.1.3(f)): no way home, none to the cabinet,
// no bot, no word that asks to buy.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "./support/load-ts.mjs";

const flow = await import("../src/app/dashboard/account/delete/delete-flow.ts");
const { ACCOUNT_DELETE_DICT } = await import("../src/lib/account-delete-i18n.ts");
const { LOGIN_RETURN_PATHS } = await import("../src/lib/login-return.ts");

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const LANGS = ["en", "ru", "es", "de", "fr"];

// ── Reading the endpoints ───────────────────────────────────────────────────

describe("readStatus", () => {
  test("401 asks to sign in; any other non-200 is an error", () => {
    assert.deepEqual(flow.readStatus(401, null), { kind: "auth" });
    for (const status of [0, 403, 500, 502, 204]) assert.deepEqual(flow.readStatus(status, { enabled: true }), { kind: "error" });
  });

  test("enabled false is closed; anything but an explicit true is an error, never a form", () => {
    assert.deepEqual(flow.readStatus(200, { enabled: false }), { kind: "closed" });
    for (const body of [null, "<html>", {}, { enabled: "true" }, { enabled: 1 }]) {
      assert.deepEqual(flow.readStatus(200, body), { kind: "error" }, JSON.stringify(body));
    }
  });

  test("an open status, read field by field", () => {
    const read = flow.readStatus(200, {
      enabled: true,
      dryRun: true,
      primary: true,
      channel: "telegram",
      walletCents: 1550,
      plans: 2,
      plansUntil: 1_800_000_000_000,
      devices: 3,
      linked: { email: true, telegram: true },
    });
    assert.deepEqual(read, {
      kind: "open",
      status: {
        dryRun: true,
        primary: true,
        channel: "telegram",
        walletCents: 1550,
        plans: 2,
        plansUntil: 1_800_000_000_000,
        devices: 3,
        linkedEmail: true,
        linkedTelegram: true,
      },
    });
  });

  test("broken fields fall to the safe side", () => {
    const read = flow.readStatus(200, { enabled: true, channel: "sms", walletCents: -5, plans: "x", devices: 2.7, linked: "yes" });
    assert.equal(read.kind, "open");
    assert.equal(read.status.channel, null);
    assert.equal(read.status.walletCents, 0);
    assert.equal(read.status.plans, 0);
    assert.equal(read.status.devices, 2);
    assert.equal(read.status.primary, true, "only an explicit false refuses");
    assert.equal(read.status.dryRun, false);
    assert.equal(read.status.linkedEmail, false);
    assert.equal(flow.readStatus(200, { enabled: true, primary: false }).status.primary, false);
  });
});

describe("readCodeResponse and readDeleteResponse", () => {
  test("a sent code names its channel; a 2xx without one is an error", () => {
    assert.deepEqual(flow.readCodeResponse(200, { status: "sent", channel: "email" }), { kind: "sent", channel: "email" });
    assert.deepEqual(flow.readCodeResponse(200, { status: "sent", channel: "fax" }), { kind: "error", error: "internal" });
    assert.deepEqual(flow.readCodeResponse(200, null), { kind: "error", error: "internal" });
  });

  test("known errors pass, unknown ones are internal, 429 carries the wait", () => {
    assert.deepEqual(flow.readCodeResponse(502, { error: "send_failed" }), { kind: "error", error: "send_failed" });
    assert.deepEqual(flow.readCodeResponse(500, { error: "kaboom" }), { kind: "error", error: "internal" });
    assert.deepEqual(flow.readCodeResponse(401, {}), { kind: "error", error: "unauthorized" });
    assert.deepEqual(flow.readCodeResponse(429, { retryAfter: 120 }), { kind: "error", error: "rate_limited", retryAfter: 120 });
    assert.deepEqual(flow.readCodeResponse(429, {}), { kind: "error", error: "rate_limited", retryAfter: 3600 });
  });

  test("202 and 200 deleted, the dry run, and a panel that did not let go", () => {
    assert.deepEqual(flow.readDeleteResponse(202, { status: "deleted" }), { kind: "deleted" });
    assert.deepEqual(flow.readDeleteResponse(200, { status: "deleted" }), { kind: "deleted" });
    assert.deepEqual(flow.readDeleteResponse(200, { status: "dry_run", keys: 14, devices: 1 }), { kind: "dry_run", keys: 14, devices: 1 });
    assert.deepEqual(flow.readDeleteResponse(202, { status: "dry_run" }), { kind: "error", error: "internal" });
    assert.deepEqual(flow.readDeleteResponse(502, { error: "panel_failed" }), { kind: "error", error: "panel_failed" });
    assert.deepEqual(flow.readDeleteResponse(400, { error: "code_expired" }), { kind: "error", error: "code_expired" });
  });
});

describe("helpers", () => {
  test("page-level errors change the page; the rest stay under the form", () => {
    for (const e of ["not_enabled", "linked_account", "unauthorized"]) assert.equal(flow.isPageError(e), true, e);
    for (const e of Object.keys(flow.ERROR_KEYS)) assert.equal(flow.isPageError(e), false, e);
  });

  test("only an expired code sends the page back to the send step; support shows when sending fails", () => {
    assert.deepEqual(Object.keys(flow.ERROR_KEYS).filter(flow.needsNewCode), ["code_expired"]);
    assert.deepEqual(Object.keys(flow.ERROR_KEYS).filter(flow.showsSupport).sort(), ["no_channel", "send_failed"]);
  });

  test("retryMinutes is whole minutes, at least one", () => {
    assert.equal(flow.retryMinutes(1), 1);
    assert.equal(flow.retryMinutes(61), 2);
    assert.equal(flow.retryMinutes(3600), 60);
    assert.equal(flow.retryMinutes(undefined), 60);
    assert.equal(flow.retryMinutes(-3), 60);
  });

  test("codeOf takes six digits or nothing", () => {
    assert.equal(flow.codeOf(["1", "2", "3", "4", "5", "6"]), "123456");
    assert.equal(flow.codeOf(["1", "2", "3", "4", "5", ""]), "");
    assert.equal(flow.codeOf(["1", "2", "3", "4", "5", "x"]), "");
    assert.equal(flow.codeOf([]), "");
  });

  test("/login returns to this page", () => {
    assert.ok(LOGIN_RETURN_PATHS.includes(flow.ACCOUNT_DELETE_PATH));
  });
});

// ── Words ───────────────────────────────────────────────────────────────────

const flat = (dict) =>
  Object.entries(dict).flatMap(([key, value]) =>
    typeof value === "string" ? [[key, value]] : Object.entries(value).map(([form, text]) => [`${key}.${form}`, text]),
  );
const tokens = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("the dictionary", () => {
  test("every language has every line, with the same placeholders", () => {
    const en = ACCOUNT_DELETE_DICT.en;
    for (const lang of LANGS) {
      const d = ACCOUNT_DELETE_DICT[lang];
      assert.deepEqual(Object.keys(d).sort(), Object.keys(en).sort(), lang);
      for (const key of Object.keys(en)) {
        const mine = typeof d[key] === "string" ? d[key] : d[key].other;
        const base = typeof en[key] === "string" ? en[key] : en[key].other;
        assert.deepEqual(tokens(mine), tokens(base), `${lang}.${key}`);
      }
    }
  });

  test("every error the form shows has its line", () => {
    for (const lang of LANGS) {
      for (const key of Object.values(flow.ERROR_KEYS)) assert.equal(typeof ACCOUNT_DELETE_DICT[lang][key], "string", `${lang}.${key}`);
    }
  });

  test("Russian plurals have all four forms", () => {
    for (const key of ["money_plans", "what_devices"]) {
      for (const form of ["one", "few", "many", "other"]) assert.ok(ACCOUNT_DELETE_DICT.ru[key][form], `${key}.${form}`);
    }
  });

  test("no Cyrillic outside ru, no emoji, no long dash in the copy", () => {
    for (const lang of LANGS) {
      for (const [key, text] of flat(ACCOUNT_DELETE_DICT[lang])) {
        if (lang !== "ru") assert.doesNotMatch(text, /\p{Script=Cyrillic}/u, `${lang}.${key}`);
        assert.doesNotMatch(text, /\p{Extended_Pictographic}|—/u, `${lang}.${key}`);
      }
    }
  });

  test("nothing asks to buy, and no word about the bot", () => {
    const FORBIDDEN =
      /(?<!\p{L})bot(?!\p{L})|(?<!\p{L})бот(?!\p{L})|\bbuy|purchase|top[\s-]?up|pric|купи|пополн|оплат|цен[аы]|comprar|precio|kaufen|preis|acheter|prix|vpn/iu;
    for (const lang of LANGS) {
      for (const [key, text] of flat(ACCOUNT_DELETE_DICT[lang])) assert.doesNotMatch(text, FORBIDDEN, `${lang}.${key}: ${text}`);
    }
  });

  test("French puts a no-break space before its high punctuation", () => {
    for (const [key, text] of flat(ACCOUNT_DELETE_DICT.fr)) assert.doesNotMatch(text, / [?:;!»]|« /, `fr.${key}`);
  });
});

// ── What the view may link to ───────────────────────────────────────────────

describe("the view", () => {
  const view = read("app/dashboard/account/delete/DeleteAccountView.tsx");

  test("no way home, to the cabinet, to a price or to the bot", () => {
    assert.doesNotMatch(view, /href=["{`]\/["`}]|href="\/dashboard"|\/pricing|t\.me|KovraVPN_bot|window\.confirm/);
    assert.match(view, /<span className="kc-brand" role="img" aria-label="Kovra">/);
    // The links it has: the support address and the policy in a new tab.
    const hrefs = [...view.matchAll(/href=(\S+?)[\s>]/g)].map((m) => m[1]);
    assert.deepEqual(hrefs, ["{`mailto:${SUPPORT_EMAIL}`}", "{`/privacy?lang=${lang}`}"]);
    assert.match(view, /<Link href=\{`\/privacy\?lang=\$\{lang\}`\} target="_blank" rel="noopener">/);
  });

  test("a lost session goes to /login and back here", () => {
    assert.match(view, /loginUrlFor\(ACCOUNT_DELETE_PATH, window\.location\.search\)/);
  });

  test("the last question is the cabinet's dialog, in the danger tone", () => {
    assert.match(view, /<ConfirmDialog[\s\S]*?tone="danger"/);
    assert.match(view, /onConfirm=\{\(\) => void remove\(\)\}/);
  });

  test("the page sits under the session check, out of the index", () => {
    const middleware = read("middleware.ts");
    assert.match(middleware, /matcher: \["\/dashboard\/:path\*"\]/);
    assert.match(read("app/dashboard/layout.tsx"), /robots: \{ index: false, follow: false \}/);
  });

  test("the support page and the view name the same address", () => {
    assert.equal(flow.SUPPORT_EMAIL, "support@kovravpn.com");
    assert.match(read("components/SupportView.tsx"), /mailto:support@kovravpn\.com/);
    assert.match(read("components/SupportView.tsx"), /\/dashboard\/account\/delete/);
  });
});

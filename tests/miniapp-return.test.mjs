// tests/miniapp-return.test.mjs — run: npm test
//
// Coming back from a payment (src/lib/payment-return.ts): the baseline saved
// before leaving, "has the payment arrived?" for plans and top-ups, the
// `?paid=` values and the Mini App's `startapp` parameters; and the language
// the Mini App picks (src/lib/miniapp-lang.ts).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import "./support/load-ts.mjs";

const {
  PAID_BASE_MAX_AGE_MS,
  detectPaid,
  isPaidReturnValue,
  parseBaseline,
  parseStartParam,
  serializeBaseline,
  startActionQuery,
} = await import("../src/lib/payment-return.ts");
const { langFromCode, pickMiniAppLang, searchWithLang } = await import("../src/lib/miniapp-lang.ts");

const NOW = 1_790_000_000_000;
const base = { maxExpiry: 5_000, activeSlots: 3, balanceCents: 1_250, kind: null };

describe("payment baseline", () => {
  test("round trip", () => {
    const raw = serializeBaseline({ ...base, kind: "topup" }, NOW);
    assert.deepEqual(parseBaseline(raw, NOW + 1000), { ...base, kind: "topup" });
  });

  test("stale, from the future, malformed or missing: null", () => {
    const raw = serializeBaseline(base, NOW);
    assert.equal(parseBaseline(raw, NOW + PAID_BASE_MAX_AGE_MS), null);
    assert.equal(parseBaseline(raw, NOW - 1), null);
    assert.equal(parseBaseline("{not json", NOW), null);
    assert.equal(parseBaseline("null", NOW), null);
    assert.equal(parseBaseline(JSON.stringify({ maxExpiry: "5", activeSlots: 3, at: NOW }), NOW), null);
    assert.equal(parseBaseline(null, NOW), null);
    assert.equal(parseBaseline("", NOW), null);
  });

  test("an old baseline without balance or kind still reads (plan only)", () => {
    const raw = JSON.stringify({ maxExpiry: 5_000, activeSlots: 3, at: NOW });
    assert.deepEqual(parseBaseline(raw, NOW), { maxExpiry: 5_000, activeSlots: 3, balanceCents: null, kind: null });
  });

  test("an unknown kind is dropped, not trusted", () => {
    const raw = JSON.stringify({ ...base, kind: "everything", at: NOW });
    assert.equal(parseBaseline(raw, NOW).kind, null);
  });
});

describe("detectPaid", () => {
  const same = { maxExpiry: 5_000, activeSlots: 3, balanceCents: 1_250 };

  test("nothing changed: not yet", () => {
    assert.equal(detectPaid(base, same, false), null);
  });

  test("the plan got longer or wider: plan", () => {
    assert.equal(detectPaid(base, { ...same, maxExpiry: 9_000 }, false), "plan");
    assert.equal(detectPaid(base, { ...same, activeSlots: 4 }, false), "plan");
  });

  test("the balance went up: top-up; down (a purchase elsewhere) is not a payment", () => {
    assert.equal(detectPaid(base, { ...same, balanceCents: 3_750 }, false), "topup");
    assert.equal(detectPaid(base, { ...same, balanceCents: 250 }, false), null);
  });

  test("a top-up waits for the balance even when the plan changed meanwhile", () => {
    const b = { ...base, kind: "topup" };
    assert.equal(detectPaid(b, { ...same, maxExpiry: 9_000 }, false), null);
    assert.equal(detectPaid(b, { ...same, balanceCents: 1_251 }, false), "topup");
  });

  test("a recent plan purchase counts for a plan return, never for a top-up", () => {
    assert.equal(detectPaid(null, same, true), "plan");
    assert.equal(detectPaid({ ...base, kind: "plan" }, same, true), "plan");
    assert.equal(detectPaid({ ...base, kind: "topup" }, same, true), null);
  });

  test("unknown balances never read as a top-up", () => {
    assert.equal(detectPaid({ ...base, balanceCents: null }, { ...same, balanceCents: 99_999 }, false), null);
    assert.equal(detectPaid(base, { ...same, balanceCents: null }, false), null);
  });

  test("no baseline and nothing recent: not yet", () => {
    assert.equal(detectPaid(null, same, false), null);
  });
});

describe("return parameters", () => {
  test("?paid= values", () => {
    assert.equal(isPaidReturnValue("1"), true);
    assert.equal(isPaidReturnValue("lava"), true);
    for (const v of [null, undefined, "", "0", "true", "LAVA"]) assert.equal(isPaidReturnValue(v), false, String(v));
  });

  test("startapp: paid, topup and the four views; everything else means nothing", () => {
    assert.deepEqual(parseStartParam("paid"), { kind: "paid" });
    assert.deepEqual(parseStartParam("topup"), { kind: "topup" });
    for (const v of ["devices", "plan", "rewards", "account"]) assert.deepEqual(parseStartParam(v), { kind: "view", view: v });
    for (const v of [null, undefined, "", "45288149", "help", "constructor", "__proto__", "PAID"]) {
      assert.equal(parseStartParam(v), null, String(v));
    }
  });

  test("start actions become the cabinet's own query", () => {
    assert.deepEqual(startActionQuery({ kind: "paid" }), ["paid", "1"]);
    assert.deepEqual(startActionQuery({ kind: "topup" }), ["view", "topup"]);
    assert.deepEqual(startActionQuery({ kind: "view", view: "rewards" }), ["view", "rewards"]);
  });
});

describe("Mini App language", () => {
  const none = { urlLang: null, accountLang: null, telegramLang: null, storedExplicit: null };

  test("the bot's ?lang= wins over everything", () => {
    assert.equal(pickMiniAppLang({ urlLang: "de", accountLang: "ru", telegramLang: "fr", storedExplicit: "es" }), "de");
  });

  test("then the account's language, then Telegram's, then a stored choice, then English", () => {
    assert.equal(pickMiniAppLang({ ...none, accountLang: "ru", telegramLang: "fr", storedExplicit: "es" }), "ru");
    assert.equal(pickMiniAppLang({ ...none, telegramLang: "fr-CA", storedExplicit: "es" }), "fr");
    assert.equal(pickMiniAppLang({ ...none, telegramLang: "it", storedExplicit: "es" }), "es");
    assert.equal(pickMiniAppLang(none), "en");
  });

  test("a ?lang= we do not speak is skipped, not trusted", () => {
    assert.equal(pickMiniAppLang({ ...none, urlLang: "xx", telegramLang: "de" }), "de");
    assert.equal(pickMiniAppLang({ ...none, urlLang: "DE", telegramLang: "fr" }), "fr");
  });

  test("language codes", () => {
    assert.equal(langFromCode("de-AT"), "de");
    assert.equal(langFromCode("PT_br"), null);
    assert.equal(langFromCode(" RU "), "ru");
    assert.equal(langFromCode(""), null);
    assert.equal(langFromCode(undefined), null);
  });

  test("the URL keeps its other parameters", () => {
    assert.equal(searchWithLang("?mock=1&view=plan", "de"), "?mock=1&view=plan&lang=de");
    assert.equal(searchWithLang("?lang=en&paid=1", "fr"), "?lang=fr&paid=1");
    assert.equal(searchWithLang("", "ru"), "?lang=ru");
  });
});

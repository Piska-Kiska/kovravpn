// tests/miniapp-bot-contract.test.mjs — run: npm test
//
// The seams between the bot (src/lib/bot-v2) and the Mini App cabinet
// (src/app/tg), built on two branches and merged:
//   • the bot's "Open Kovra" button opens /tg in the bot's language, and the
//     Mini App keeps that language over everything else it knows;
//   • both speak the same five languages, so neither side stores a language
//     the other cannot show;
//   • the menu button script opens the same page on the same origin;
//   • a payment started in the Mini App comes back as start_param "paid",
//     which the cabinet turns into its own "Checking payment…" return;
//   • the direct-link Mini App (TELEGRAM_MINIAPP_SHORT_NAME) keeps the
//     owner-first rollout: the bot's main Mini App would put an Open button
//     on the profile for everyone;
//   • nothing outside the gated bot v2 code links into /tg.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import "./support/load-ts.mjs";

const { BOT_LANGS } = await import("../src/lib/bot-i18n.ts");
const { miniAppPageUrl, SITE_ORIGIN } = await import("../src/lib/bot-v2/links.ts");
const { CABINET_LANGS_ORDER, isLang } = await import("../src/i18n/resolve.ts");
const { pickMiniAppLang } = await import("../src/lib/miniapp-lang.ts");
const { parseStartParam, startActionQuery, isPaidReturnValue } = await import("../src/lib/payment-return.ts");
const { miniAppUrl, miniAppShortName, miniAppPaymentReturn, paymentReturnFor } = await import("../src/lib/bot-link.ts");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MAIN = { TELEGRAM_BOT_USERNAME: "KovraTest_bot" };
const DIRECT = { TELEGRAM_BOT_USERNAME: "KovraTest_bot", TELEGRAM_MINIAPP_SHORT_NAME: "cabinet" };

/** What the Mini App shell does with a t.me link: start_param -> the cabinet's query. */
function cabinetQueryFor(tmeLink) {
  const u = new URL(tmeLink);
  assert.equal(u.hostname, "t.me");
  const action = parseStartParam(u.searchParams.get("startapp"));
  return action ? startActionQuery(action) : null;
}

describe("the bot's Open Kovra button and /tg", () => {
  test("every bot language opens /tg on the site origin with ?lang=", () => {
    for (const lang of BOT_LANGS) {
      const u = new URL(miniAppPageUrl(lang));
      assert.equal(u.origin, SITE_ORIGIN);
      assert.equal(u.pathname, "/tg");
      assert.deepEqual([...u.searchParams.keys()], ["lang"]);
      assert.equal(u.searchParams.get("lang"), lang);
    }
    assert.ok(existsSync(join(ROOT, "src/app/tg/page.tsx")), "the page the button opens exists");
  });

  test("the Mini App keeps the bot's ?lang= over the account and Telegram languages", () => {
    for (const lang of BOT_LANGS) {
      const other = lang === "de" ? "fr" : "de";
      const urlLang = new URL(miniAppPageUrl(lang)).searchParams.get("lang");
      assert.equal(pickMiniAppLang({ urlLang, accountLang: other, telegramLang: other, storedExplicit: other }), lang);
    }
  });

  test("the bot and the cabinet speak the same languages", () => {
    assert.deepEqual([...BOT_LANGS].sort(), [...CABINET_LANGS_ORDER].sort());
    for (const lang of BOT_LANGS) assert.equal(isLang(lang), true, lang);
  });

  test("the menu button script opens the same page", () => {
    const src = readFileSync(join(ROOT, "scripts/telegram-setup.mjs"), "utf8");
    const m = src.match(/const DEFAULT_URL = "([^"]+)";/);
    assert.ok(m, "DEFAULT_URL is declared");
    const u = new URL(m[1]);
    assert.equal(u.origin, SITE_ORIGIN);
    assert.equal(u.pathname, "/tg");
  });
});

describe("the return from a payment started in the Mini App", () => {
  for (const [name, env] of [
    ["main Mini App", MAIN],
    ["direct-link Mini App", DIRECT],
  ]) {
    test(`${name}: success reopens the cabinet as ?paid=1, a cancel as a plain open`, () => {
      const back = miniAppPaymentReturn(env);
      const paid = cabinetQueryFor(back.success);
      assert.deepEqual(paid, ["paid", "1"]);
      assert.equal(isPaidReturnValue(paid[1]), true);
      assert.equal(cabinetQueryFor(back.fail), null, "a cancel must not start 'Checking payment…'");
      assert.deepEqual(paymentReturnFor({ returnTo: "miniapp" }, env), back);
      assert.equal(paymentReturnFor({ returnTo: "web" }, env), undefined);
    });
  }
});

describe("TELEGRAM_MINIAPP_SHORT_NAME", () => {
  test("set: links go to the direct-link app", () => {
    assert.equal(miniAppShortName(DIRECT), "cabinet");
    assert.equal(miniAppUrl("paid", DIRECT), "https://t.me/KovraTest_bot/cabinet?startapp=paid");
    assert.equal(miniAppUrl(undefined, DIRECT), "https://t.me/KovraTest_bot/cabinet?startapp");
    assert.equal(miniAppUrl("topup", { ...DIRECT, TELEGRAM_MINIAPP_SHORT_NAME: "  cabinet \n" }), "https://t.me/KovraTest_bot/cabinet?startapp=topup");
  });

  test("unset or malformed: the main Mini App, never a broken URL", () => {
    for (const bad of [undefined, "", "ab", "a".repeat(31), "has space", "../evil", "x/y", "app?startapp=x", "émoji"]) {
      const env = { ...MAIN, TELEGRAM_MINIAPP_SHORT_NAME: bad };
      assert.equal(miniAppShortName(env), null, String(bad));
      assert.equal(miniAppUrl("paid", env), "https://t.me/KovraTest_bot?startapp=paid", String(bad));
    }
  });

  test("the payload is still checked", () => {
    assert.throws(() => miniAppUrl("a&b=c", DIRECT), /invalid startapp payload/);
    assert.throws(() => miniAppUrl("", DIRECT), /invalid startapp payload/);
  });
});

describe("owner-first: only the gated bot v2 code links into the Mini App", () => {
  /** Source files under src/, as paths relative to the repository. */
  function sources(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) out.push(...sources(path));
      else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(relative(ROOT, path));
    }
    return out;
  }

  test("no page, route or library outside src/lib/bot-v2 and src/app/tg builds a /tg link", () => {
    const allowed = (p) => p.startsWith("src/lib/bot-v2/") || p.startsWith("src/app/tg/");
    const hits = sources(join(ROOT, "src"))
      .filter((p) => !allowed(p))
      .filter((p) => /kovravpn\.com\/tg\b|["'`]\/tg\?|miniAppPageUrl\(/.test(readFileSync(join(ROOT, p), "utf8")));
    assert.deepEqual(hits, []);
  });
});

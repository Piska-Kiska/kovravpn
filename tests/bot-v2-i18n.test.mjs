// tests/bot-v2-i18n.test.mjs — run: npm test
//
// Texts of the new bot interface (src/lib/bot-v2/i18n.ts) in all five bot
// languages: the same keys (the compiler checks too), the same {variables},
// balanced Telegram HTML, and the copy rules (no "VPN", no em dash). Plus
// the formatters and the escaping of variables.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import "./support/load-ts.mjs";
const { V2_DICTS, V2_KEYS, tr, fmtUsd, fmtUsdShort, fmtDate, escapeHtml } = await import("../src/lib/bot-v2/i18n.ts");
const { BOT_LANGS } = await import("../src/lib/bot-i18n.ts");

const vars = (s) => [...s.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
const tags = (s) => [...s.matchAll(/<\/?([a-z]+)[^>]*>/g)].map((m) => m[0]);

describe("bot v2 dictionaries", () => {
  test("every language has exactly the English keys, none empty", () => {
    assert.deepEqual(BOT_LANGS, ["en", "ru", "es", "de", "fr"]);
    for (const lang of BOT_LANGS) {
      assert.deepEqual(Object.keys(V2_DICTS[lang]).sort(), [...V2_KEYS].sort(), lang);
      for (const key of V2_KEYS) assert.ok(V2_DICTS[lang][key].trim().length > 0, `${lang} ${key}`);
    }
  });

  test("the same {variables} in every language", () => {
    for (const key of V2_KEYS) {
      const en = vars(V2_DICTS.en[key]);
      for (const lang of BOT_LANGS) assert.deepEqual(vars(V2_DICTS[lang][key]), en, `${lang} ${key}`);
    }
  });

  test("only Telegram tags, balanced, and the same ones as English", () => {
    for (const key of V2_KEYS) {
      for (const lang of BOT_LANGS) {
        const text = V2_DICTS[lang][key];
        const stack = [];
        for (const t of tags(text)) {
          const m = /^<(\/?)([a-z]+)/.exec(t);
          assert.ok(["b", "i", "code"].includes(m[2]), `${lang} ${key}: <${m[2]}>`);
          if (m[1]) assert.equal(stack.pop(), m[2], `${lang} ${key}: unbalanced`);
          else stack.push(m[2]);
        }
        assert.deepEqual(stack, [], `${lang} ${key}: unclosed`);
        assert.deepEqual(tags(text), tags(V2_DICTS.en[key]), `${lang} ${key}: other tags than English`);
      }
    }
  });

  test('copy rules: no "VPN", no em dash', () => {
    for (const lang of BOT_LANGS) {
      for (const key of V2_KEYS) {
        const text = V2_DICTS[lang][key];
        assert.ok(!/\bVPN\b/i.test(text), `${lang} ${key}`);
        assert.ok(!text.includes("—"), `${lang} ${key}`);
      }
    }
  });

  test("buttons start with the same icon in every language", () => {
    for (const key of V2_KEYS.filter((k) => k.startsWith("btn."))) {
      const icon = (s) => [...s][0];
      for (const lang of BOT_LANGS) assert.equal(icon(V2_DICTS[lang][key]), icon(V2_DICTS.en[key]), `${lang} ${key}`);
    }
  });
});

describe("tr", () => {
  test("fills variables and escapes them", () => {
    assert.equal(tr("dev.title", "en", { icon: "🍎", dev: "<script>" }), "🍎 <b>&lt;script&gt;</b>");
    assert.equal(tr("home.balance", "de", { bal: "$1.00" }), "Guthaben: <b>$1.00</b>");
  });

  test("a value containing {name} is not expanded a second time", () => {
    assert.equal(tr("sum.plan", "en", { plan: "{term}", term: "6 months" }), "{term} · 6 months");
  });

  test("an unknown language falls back to English", () => {
    assert.equal(tr("btn.back", "pt"), V2_DICTS.en["btn.back"]);
  });
});

describe("formatters", () => {
  test("fmtUsd is exact on integer cents", () => {
    assert.equal(fmtUsd(0), "$0.00");
    assert.equal(fmtUsd(5), "$0.05");
    assert.equal(fmtUsd(1250), "$12.50");
    assert.equal(fmtUsd(7908), "$79.08");
    assert.equal(fmtUsd(-250), "-$2.50");
    assert.equal(fmtUsd(Number.NaN), "$0.00");
    assert.equal(fmtUsdShort(500), "$5");
    assert.equal(fmtUsdShort(550), "$5.50");
  });

  test("fmtDate: UTC, one style per language, no doubled full stop", () => {
    const ms = Date.UTC(2026, 8, 27, 23, 30);
    assert.equal(fmtDate(ms, "en"), "27 Sep 2026");
    assert.equal(fmtDate(ms, "ru"), "27 сентября 2026");
    assert.match(fmtDate(ms, "de"), /^27\. Sept?\. 2026$/);
    assert.match(fmtDate(ms, "fr"), /^27 sept\. 2026$/);
    assert.match(fmtDate(ms, "es"), /^27 sept? 2026$/);
    assert.equal(fmtDate(0, "en"), "-");
  });

  test("escapeHtml", () => {
    assert.equal(escapeHtml(`<a href="x">&</a>`), `&lt;a href="x"&gt;&amp;&lt;/a&gt;`);
  });
});

// tests/i18n-dash-dict.test.mjs — run: npm test
//
// Static checks on the dashboard dictionary (src/lib/dash-i18n.ts), read as
// text and split on the `const xx: DashDict = {` markers:
// - no Cyrillic in the en / es / de / fr blocks (no Russian leaking);
// - no emoji and no check / arrow glyphs in any string;
// - "V2RayTun" is gone;
// - every language defines the same keys as English, and plural keys carry
//   the forms their language needs (ru: one / few / many / other).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FILE = "../src/lib/dash-i18n.ts";
const LANGS = ["en", "ru", "es", "de", "fr"];
const CYRILLIC = /[А-Яа-яЁё]/;
const EMOJI = /\p{Extended_Pictographic}/u;
const GLYPHS = /[✓✔✗✕←→↑↓⟵⟶➜➔›‹]/;

const src = readFileSync(fileURLToPath(new URL(FILE, import.meta.url)), "utf8");

function block(lang) {
  const m = new RegExp(`const ${lang}: DashDict = \\{([\\s\\S]*?)\\n\\};`).exec(src);
  assert.ok(m, `block for ${lang} not found`);
  return m[1];
}

/** Every "..." string literal in a block. */
function strings(b) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(b))) out.push(m[1]);
  return out;
}

/** Top-level keys of a block: `key: "…"` or `key: {` at two-space indent. */
function keys(b) {
  const out = [];
  const re = /^ {2}(\w+):/gm;
  let m;
  while ((m = re.exec(b))) out.push(m[1]);
  return out.sort();
}

function pluralForms(b, key) {
  const m = new RegExp(`\\n {2}${key}: \\{([\\s\\S]*?)\\},[ \\t]*\\n`).exec("\n" + b);
  assert.ok(m, `plural ${key} not found`);
  return [...m[1].matchAll(/(\w+):\s*"/g)].map((x) => x[1]).sort();
}

const blocks = Object.fromEntries(LANGS.map((l) => [l, block(l)]));

test("dash-i18n: no Cyrillic in en / es / de / fr", () => {
  for (const lang of ["en", "es", "de", "fr"]) {
    assert.ok(!CYRILLIC.test(blocks[lang]), `${lang} block contains Cyrillic: ${(blocks[lang].match(/.*[А-Яа-яЁё].*/) || [""])[0].trim()}`);
  }
});

test("dash-i18n: no emoji or arrow / check glyphs in any string", () => {
  for (const lang of LANGS) {
    for (const v of strings(blocks[lang])) {
      assert.ok(!EMOJI.test(v), `${lang} has an emoji: ${v}`);
      assert.ok(!GLYPHS.test(v), `${lang} has a glyph: ${v}`);
    }
  }
});

test("dash-i18n: V2RayTun is not mentioned", () => {
  for (const lang of LANGS) {
    for (const v of strings(blocks[lang])) assert.ok(!/v2ray/i.test(v), `${lang} mentions V2RayTun: ${v}`);
  }
});

test("dash-i18n: every language has the same keys as en, all non-empty", () => {
  const en = keys(blocks.en);
  assert.ok(en.length > 100, `only ${en.length} keys parsed`);
  for (const lang of LANGS) {
    assert.deepEqual(keys(blocks[lang]), en, `${lang} keys differ from en`);
    for (const v of strings(blocks[lang])) assert.ok(v.trim().length > 0, `${lang} has an empty string`);
  }
});

test("dash-i18n: plural keys have the forms their language needs", () => {
  const PLURALS = ["hero_title_expiring", "days_left_unit", "slots_plan", "slots_free"];
  for (const key of PLURALS) {
    assert.deepEqual(pluralForms(blocks.ru, key), ["few", "many", "one", "other"], `ru.${key}`);
    for (const lang of ["en", "es", "de", "fr"]) {
      const f = pluralForms(blocks[lang], key);
      assert.ok(f.includes("one") && f.includes("other"), `${lang}.${key}: ${f}`);
    }
  }
});

test("dash-i18n: parameterized strings keep their placeholders in every language", () => {
  const re = (key) => new RegExp(`\\n {2}${key}: "((?:[^"\\\\]|\\\\.)*)"`);
  const TOKENS = { buy_device: ["{price}"], add_device_note: ["{days}"], ref_note: ["{days}"], ref_body: ["{days}"], pay_cta: ["{amount}"], renew_cta: ["{amount}"], delete_title: ["{name}"], setup_title: ["{device}"], slot_price: ["{price}", "{days}"], more_ways: ["{n}"] };
  for (const lang of LANGS) {
    for (const [key, toks] of Object.entries(TOKENS)) {
      const m = re(key).exec("\n" + blocks[lang]);
      assert.ok(m, `${lang}.${key} missing`);
      for (const tok of toks) assert.ok(m[1].includes(tok), `${lang}.${key} lost ${tok}: ${m[1]}`);
    }
  }
});

test("dash-i18n: typographic apostrophes; fr keeps a no-break space before ? ! : ; and inside « »", () => {
  for (const lang of LANGS) {
    for (const v of strings(blocks[lang])) assert.ok(!/\p{L}'\p{L}/u.test(v), `${lang} has a straight apostrophe: ${v}`);
  }
  for (const v of strings(blocks.fr)) {
    assert.ok(!/ [?!:;]/.test(v), `fr has a breaking space before punctuation: ${v}`);
    assert.ok(!/« | »/.test(v), `fr has a breaking space inside guillemets: ${v}`);
  }
});

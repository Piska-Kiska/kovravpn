// tests/i18n-cabinet-dicts.test.mjs — run: node --test tests/
//
// Static checks on the cabinet dictionaries (src/lib/i18n-shell.ts,
// src/lib/i18n-auth.ts), read as text and split on the `const xx:` markers:
// - no Cyrillic in the en / es / de / fr blocks (no Russian leaking);
// - no emoji and no check / arrow glyphs in any block;
// - every language block defines the same keys as English.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FILES = ["../src/lib/i18n-shell.ts", "../src/lib/i18n-auth.ts"];
const LANGS = ["en", "ru", "es", "de", "fr"];
const CYRILLIC = /[А-Яа-яЁё]/;
const EMOJI = /\p{Extended_Pictographic}/u;
const GLYPHS = /[✓✔✗✕←→↑↓⟵⟶➜➔›‹»«]/;

function blocks(file) {
  const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
  const out = {};
  for (const lang of LANGS) {
    const re = new RegExp(`const ${lang}: \\w+Dict = \\{([\\s\\S]*?)\\n\\};`);
    const m = re.exec(src);
    assert.ok(m, `${file}: block for ${lang} not found`);
    out[lang] = m[1];
  }
  return out;
}

function values(block) {
  const vals = [];
  const re = /^\s*(\w+):\s*"((?:[^"\\]|\\.)*)",?\s*$/gm;
  let m;
  while ((m = re.exec(block))) vals.push([m[1], m[2]]);
  return vals;
}

for (const file of FILES) {
  const b = blocks(file);

  test(`${file}: no Cyrillic in en / es / de / fr`, () => {
    for (const lang of ["en", "es", "de", "fr"]) {
      for (const [key, v] of values(b[lang])) assert.ok(!CYRILLIC.test(v), `${lang}.${key}: ${v}`);
      assert.ok(!CYRILLIC.test(b[lang]), `${lang} block contains Cyrillic`);
    }
  });

  test(`${file}: no emoji or arrow / check glyphs in any language`, () => {
    for (const lang of LANGS) {
      for (const [key, v] of values(b[lang])) {
        assert.ok(!EMOJI.test(v), `${lang}.${key} has an emoji: ${v}`);
        assert.ok(!GLYPHS.test(v.replace(/«[^»]*»/g, "")), `${lang}.${key} has a glyph: ${v}`);
      }
    }
  });

  test(`${file}: every language has the same keys as en, all non-empty`, () => {
    const enKeys = values(b.en).map(([k]) => k).sort();
    assert.ok(enKeys.length > 10);
    for (const lang of LANGS) {
      const vals = values(b[lang]);
      assert.deepEqual(vals.map(([k]) => k).sort(), enKeys, lang);
      for (const [k, v] of vals) assert.ok(v.trim().length > 0, `${lang}.${k} is empty`);
    }
  });

  test(`${file}: placeholders match English in every language`, () => {
    const tokens = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    const en = Object.fromEntries(values(b.en));
    for (const lang of LANGS) {
      for (const [k, v] of values(b[lang])) assert.equal(tokens(v), tokens(en[k]), `${lang}.${k}`);
    }
  });
  test(`${file}: typographic apostrophes; fr keeps a no-break space before ? ! : ;`, () => {
    for (const lang of LANGS) {
      for (const [k, v] of values(b[lang])) assert.ok(!/\p{L}'\p{L}/u.test(v), `${lang}.${k} has a straight apostrophe: ${v}`);
    }
    for (const [k, v] of values(b.fr)) assert.ok(!/ [?!:;]/.test(v), `fr.${k} has a breaking space before punctuation: ${v}`);
  });
}

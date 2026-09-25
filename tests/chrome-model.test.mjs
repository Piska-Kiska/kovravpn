// tests/chrome-model.test.mjs — run: node --test tests/
//
// Header chrome helpers (src/components/chrome/model.ts), loaded under Node's
// type stripping: the "d." monogram letter and the plan-status tone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { monogramChar, statusTone } from "../src/components/chrome/model.ts";

test("monogram: the first letter of the email, lower-cased", () => {
  assert.equal(monogramChar("D"), "d");
  assert.equal(monogramChar("daria.k@proton.me"), "d");
  assert.equal(monogramChar("Ж"), "ж");
  assert.equal(monogramChar("É"), "é");
});

test("monogram: leading whitespace is ignored", () => {
  assert.equal(monogramChar("  a"), "a");
  assert.equal(monogramChar("\tQ"), "q");
});

test("monogram: a digit is kept", () => {
  assert.equal(monogramChar("7"), "7");
});

test("monogram: lower-casing that adds a combining mark keeps the base letter", () => {
  assert.equal(monogramChar("İ"), "i");
});

test("monogram: no letter or digit gives null (the person glyph)", () => {
  assert.equal(monogramChar("+"), null);
  assert.equal(monogramChar("_x"), null);
  assert.equal(monogramChar("😀"), null);
  assert.equal(monogramChar(""), null);
  assert.equal(monogramChar("   "), null);
  assert.equal(monogramChar(null), null);
  assert.equal(monogramChar(undefined), null);
});

test("status tone: active ok, expiring warn, expired danger, none no line", () => {
  assert.equal(statusTone("active"), "ok");
  assert.equal(statusTone("expiring"), "warn");
  assert.equal(statusTone("expired"), "danger");
  assert.equal(statusTone("none"), null);
});

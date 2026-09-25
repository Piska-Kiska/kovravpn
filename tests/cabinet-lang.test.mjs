// tests/cabinet-lang.test.mjs — run: node --test tests/
//
// Cabinet language resolution (src/i18n/resolve.ts), loaded under Node's
// type stripping. The inline boot script in src/app/layout.tsx mirrors
// resolveCabinetLangFrom(); these cases pin the shared behaviour.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CABINET_LANGS_ORDER,
  isCabinetPath,
  isLang,
  matchNavigatorLang,
  resolveCabinetLangFrom,
  resolveCabinetLang,
} from "../src/i18n/resolve.ts";

const base = { urlLang: null, saved: null, explicit: null, navigatorLanguages: [] };

test("a fresh de-AT visitor gets German", () => {
  assert.equal(resolveCabinetLangFrom({ ...base, navigatorLanguages: ["de-AT", "en"] }), "de");
});

test("unsupported first navigator language falls through to the next supported one", () => {
  assert.equal(resolveCabinetLangFrom({ ...base, navigatorLanguages: ["pt-BR", "fr"] }), "fr");
});

test("a bare saved 'en' (written by the landing) is not a choice: navigator wins", () => {
  assert.equal(resolveCabinetLangFrom({ ...base, saved: "en", navigatorLanguages: ["de"] }), "de");
  assert.equal(resolveCabinetLangFrom({ ...base, saved: "en", explicit: "0", navigatorLanguages: ["de-DE"] }), "de");
});

test("saved 'en' with the explicit flag is honoured", () => {
  assert.equal(resolveCabinetLangFrom({ ...base, saved: "en", explicit: "1", navigatorLanguages: ["de"] }), "en");
});

test("a saved non-English language is always a real choice", () => {
  assert.equal(resolveCabinetLangFrom({ ...base, saved: "ru", navigatorLanguages: ["de"] }), "ru");
  assert.equal(resolveCabinetLangFrom({ ...base, saved: "fr", explicit: null, navigatorLanguages: [] }), "fr");
});

test("?lang= wins over storage and navigator", () => {
  assert.equal(resolveCabinetLangFrom({ ...base, urlLang: "es", saved: "ru", explicit: "1", navigatorLanguages: ["de"] }), "es");
});

test("junk input everywhere resolves to English", () => {
  assert.equal(resolveCabinetLangFrom({ urlLang: "xx", saved: "klingon", explicit: "yes", navigatorLanguages: ["", "zz-ZZ", "123"] }), "en");
  assert.equal(resolveCabinetLangFrom(base), "en");
  assert.equal(resolveCabinetLangFrom({ ...base, urlLang: "EN" }), "en");
  assert.equal(resolveCabinetLangFrom({ ...base, urlLang: "DE", navigatorLanguages: ["pt"] }), "en");
});

test("matchNavigatorLang takes the primary subtag, case-insensitively", () => {
  assert.equal(matchNavigatorLang(["de-AT"]), "de");
  assert.equal(matchNavigatorLang(["ES-419"]), "es");
  assert.equal(matchNavigatorLang(["ru_RU"]), "ru");
  assert.equal(matchNavigatorLang(["pt-BR"]), null);
  assert.equal(matchNavigatorLang(["pt-BR", "zh", "fr-CA", "de"]), "fr");
  assert.equal(matchNavigatorLang([]), null);
  assert.equal(matchNavigatorLang([""]), null);
});

test("isCabinetPath matches only the cabinet routes", () => {
  for (const p of ["/login", "/register", "/dashboard", "/dashboard/", "/dashboard/x", "/login/"]) assert.equal(isCabinetPath(p), true, p);
  for (const p of ["/", "/loginx", "/guide", "/terms", "/privacy", "/guides/login", "/register-now"]) assert.equal(isCabinetPath(p), false, p);
});

test("isLang accepts exactly the five cabinet languages", () => {
  assert.deepEqual([...CABINET_LANGS_ORDER], ["en", "ru", "es", "de", "fr"]);
  for (const l of CABINET_LANGS_ORDER) assert.equal(isLang(l), true);
  for (const v of ["EN", "pt", "", null, undefined, 1, {}]) assert.equal(isLang(v), false);
});

test("resolveCabinetLang is 'en' without a window (server)", () => {
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(resolveCabinetLang(), "en");
});

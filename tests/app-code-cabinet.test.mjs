// tests/app-code-cabinet.test.mjs — run: npm test
//
// "Code for the app" in the cabinet: the parser of the route's 200, the
// countdown, and source guards on the dialog and the device card. The five
// languages are checked by tests/i18n-dash-dict.test.mjs like every other key.
//
// Pinned here:
//   * parseAppCode takes XXXX-XXXX over the code alphabet and a sane
//     lifetime, and nothing else;
//   * formatLeft: m:ss, rounded up, never negative;
//   * the card's menu offers the code first, on every device;
//   * the dialog posts the device id alone to /api/vpn/pair-code, asks for a
//     fresh code on each opening, says that the link moves before the code
//     is typed, and names the app's own button in the language the app has.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "./support/load-ts.mjs";

const { parseAppCode, formatLeft } = await import("../src/lib/dashboard/app-code.ts");
const { formatPairCode, generatePairCode } = await import("../src/lib/pair-code.ts");
const { DASH_DICT } = await import("../src/lib/dash-i18n.ts");

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const NOW = 1_783_000_000_000;

describe("parseAppCode", () => {
  test("the route's 200 becomes a code dated from now", () => {
    assert.deepEqual(parseAppCode({ code: "K7QM2XPA", display: "K7QM-2XPA", expiresIn: 600 }, NOW), { display: "K7QM-2XPA", expiresAt: NOW + 600_000 });
  });

  test("every code the site can issue is accepted", () => {
    for (let i = 0; i < 200; i += 1) {
      const display = formatPairCode(generatePairCode());
      assert.ok(parseAppCode({ display, expiresIn: 600 }, NOW), display);
    }
  });

  test("anything else is not a code", () => {
    for (const body of [
      null,
      undefined,
      "K7QM-2XPA",
      [],
      {},
      { display: "K7QM2XPA", expiresIn: 600 },
      { display: "K7QM-2XP0", expiresIn: 600 },
      { display: "K7QM-2XPI", expiresIn: 600 },
      { display: "k7qm-2xpa", expiresIn: 600 },
      { display: "K7QM-2XPA" },
      { display: "K7QM-2XPA", expiresIn: 0 },
      { display: "K7QM-2XPA", expiresIn: -5 },
      { display: "K7QM-2XPA", expiresIn: 1.5 },
      { display: "K7QM-2XPA", expiresIn: "600" },
      { display: "K7QM-2XPA", expiresIn: 86_400 },
      { error: "Too many requests", retryAfter: 3600 },
    ]) {
      assert.equal(parseAppCode(body, NOW), null, JSON.stringify(body));
    }
  });
});

describe("formatLeft", () => {
  test("m:ss from ten minutes down", () => {
    assert.equal(formatLeft(600_000), "10:00");
    assert.equal(formatLeft(599_000), "9:59");
    assert.equal(formatLeft(61_000), "1:01");
    assert.equal(formatLeft(60_000), "1:00");
    assert.equal(formatLeft(9_000), "0:09");
  });

  test("rounded up, so 0:00 never shows while the code works; never negative", () => {
    assert.equal(formatLeft(999), "0:01");
    assert.equal(formatLeft(1), "0:01");
    assert.equal(formatLeft(0), "0:00");
    assert.equal(formatLeft(-5_000), "0:00");
  });
});

describe("the card and the dialog", () => {
  test("the card's menu offers the code first, on every device", () => {
    const card = read("components/dashboard/DeviceCard.tsx");
    const items = card.slice(card.indexOf("const items: MenuItem[] = ["), card.indexOf("];", card.indexOf("const items: MenuItem[] = [")));
    const first = items.split("\n").find((line) => line.includes('id: "'));
    assert.match(first, /id: "app-code".*label: t\.app_code\b.*onSelect: onRequestAppCode/);
    assert.doesNotMatch(first, /\.\.\.\(/, "not behind a condition");
  });

  test("the view opens the dialog for the card's own device", () => {
    const view = read("components/dashboard/DashboardView.tsx");
    assert.match(view, /onRequestAppCode=\{\(uuid\) => setAppCodeFor\(uuid\)\}/);
    assert.match(view, /<AppCodeDialog uuid=\{appCodeFor\}/);
    assert.match(view, /overlayOpen = [^;]*appCodeFor !== null/);
  });

  test("the dialog posts the device id alone, once per opening", () => {
    const dialog = read("components/dashboard/AppCodeDialog.tsx");
    assert.match(dialog, /fetch\("\/api\/vpn\/pair-code"/);
    assert.match(dialog, /body: JSON\.stringify\(\{ uuid \}\)/);
    assert.match(dialog, /\{uuid !== null \? <AppCodeBody/, "the body mounts with each opening, so each asks anew");
    assert.match(dialog, /t\.app_code_moves/, "the link's move is said where the code is shown");
  });

  test("the dialog names the app's own button: Russian in ru, the English one elsewhere", () => {
    // The app speaks Russian and English (its src/i18n.ts, pair.appstore.code.open).
    assert.match(DASH_DICT.ru.app_code_body, /«Войти по коду из аккаунта»/);
    for (const lang of ["en", "es", "de", "fr"]) {
      assert.ok(DASH_DICT[lang].app_code_body.includes("Sign in with a code from your account"), lang);
    }
    for (const lang of ["en", "ru", "es", "de", "fr"]) {
      assert.ok(DASH_DICT[lang].app_code_left.includes("{time}"), lang);
      assert.ok(DASH_DICT[lang].app_code_moves.includes("Kovra"), lang);
    }
  });

  test("the app's hint names the cabinet's button as the cabinet does", () => {
    // The app says: tap «Code for the app» / «Код для приложения» on your device.
    assert.equal(DASH_DICT.en.app_code, "Code for the app");
    assert.equal(DASH_DICT.ru.app_code, "Код для приложения");
  });
});

// tests/uuid-pool-guard.test.mjs — run: npm test
//
// A source guard: every new device gets its UUID from the reserve the PRO
// nodes preload (src/lib/uuid-pool.ts takeDeviceUuid), and every screen that
// shows the "other countries within 3 minutes" line shows it only for a
// device that did not get a reserve UUID.
//
// Today one route creates devices, /api/vpn/create; bot v1, bot v2, the web
// cabinet and the Mini App (the same DashboardView) all call it. A second
// place that mints a VLESS UUID or writes a device record would bypass the
// reserve, so this test fails until it is routed through takeDeviceUuid (or
// added to the lists below with a reason).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(path);
  }
  return out;
}

const FILES = sources(SRC).map((path) => ({ rel: relative(ROOT, path).split("\\").join("/"), text: readFileSync(path, "utf8") }));
const read = (rel) => {
  const f = FILES.find((x) => x.rel === rel);
  assert.ok(f, `${rel} exists`);
  return f.text;
};
/** Files whose code (comments stripped) matches `re`. */
function filesMatching(re) {
  return FILES.filter((f) => re.test(f.text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""))).map((f) => f.rel).sort();
}

const CREATE_ROUTE = "src/app/api/vpn/create/route.ts";

describe("one way to a device UUID", () => {
  test("randomUUID() is called only by the reserve and by code that makes no device", () => {
    assert.deepEqual(filesMatching(/\brandomUUID\s*\(/), [
      "src/lib/session.ts", // session ids
      "src/lib/uuid-pool.ts", // the reserve itself and its fallback
      "src/lib/yookassa.ts", // payment idempotence keys
    ]);
  });

  test("no other UUID library", () => {
    assert.deepEqual(filesMatching(/from\s+["']uuid["']|require\(\s*["']uuid["']\s*\)/), []);
  });

  test("device records and panel clients are written by the create route only", () => {
    assert.deepEqual(filesMatching(/(?<!function\s)\baddProfile\s*\(/), [CREATE_ROUTE]);
    assert.deepEqual(filesMatching(/(?<!function\s)\baddClientToStaticPanels\s*\(/), [CREATE_ROUTE]);
    // Device records are written through accounts.ts only (addProfile, removeProfile, ensureProfileSubToken).
    assert.deepEqual(filesMatching(/\.set\(\s*`profiles:/), ["src/lib/accounts.ts"]);
  });

  test("the create route takes the UUID from the reserve, drops the mark after the record, and says instant", () => {
    const src = read(CREATE_ROUTE);
    assert.doesNotMatch(src, /randomUUID/);
    const take = src.indexOf("await takeDeviceUuid(");
    const record = src.indexOf("await addProfile(");
    const release = src.indexOf("await releaseTakenMark(uuid)");
    assert.ok(take > 0 && record > take && release > record, "take, then the record, then the mark");
    assert.ok(take > src.indexOf("canCreateProfileAsync(userId)"), "taken only after the slot check");
    assert.match(src, /NextResponse\.json\(\{[^}]*\binstant,/s);
  });

  test("every client creates devices through that route", () => {
    assert.deepEqual(filesMatching(/["'`][^"'`]*\/api\/vpn\/create["'`]/), [
      "src/app/api/auth/telegram/webhook/route.ts", // bot v1
      "src/components/dashboard/DashboardView.tsx", // web cabinet and Mini App
      "src/lib/bot-v2/controller.ts", // bot v2
    ]);
    // The Mini App is the same DashboardView.
    assert.match(read("src/app/tg/TgShell.tsx"), /DashboardView/);
  });
});

describe("the waiting line only for a fresh UUID", () => {
  test("bot v2 reads `instant` and adds dev.readyWhere only without it", () => {
    const src = read("src/lib/bot-v2/controller.ts");
    assert.match(src, /instant: data\.instant === true/);
    const uses = src.split("\n").filter((l) => l.includes('"dev.readyWhere"'));
    assert.equal(uses.length, 1);
    assert.match(uses[0], /r\.instant \? readyLine :/);
  });

  test("the cabinet and the Mini App pass `instant` down and the steps drop the line with it", () => {
    assert.match(read("src/components/dashboard/DashboardView.tsx"), /setLastCreatedInstant\(d\.instant === true\)/);
    assert.match(read("src/components/dashboard/DevicesSection.tsx"), /instant=\{p\.lastCreatedInstant\}/);
    const steps = read("src/components/dashboard/SetupSteps.tsx");
    const uses = steps.split("\n").filter((l) => l.includes("setup_locations"));
    assert.equal(uses.length, 1);
    assert.match(uses[0], /instant \? null :/);
    assert.deepEqual(
      filesMatching(/\bsetup_locations\b/).filter((f) => f !== "src/lib/dash-i18n.ts"),
      ["src/components/dashboard/SetupSteps.tsx"],
    );
  });
});

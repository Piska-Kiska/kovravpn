// tests/app-links.test.mjs — run: npm test
//
// KP-12: the bot and /guide sent iPhone, Mac and Apple TV users to V2RayTun's
// App Store app (id6476628951), which no longer exists: its page answers 404
// and the iTunes lookup is empty in every store checked. Apple devices now
// get INCY, the alternative the cabinet already recommends, and V2RayTun is
// offered only where it still ships (Google Play, Windows).
//
// Runs the legacy bot against an in-memory Redis with fetch stubbed. Ids and
// secrets are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SECRET = ["kovra", "apps", "test", "secret"].join("-");
process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
process.env.TELEGRAM_BOT_TOKEN = ["444444444", "KOVRA-apps-test"].join(":");
delete process.env.KOVRA_STATIC_PANELS;
delete process.env.KOVRA_BOT_V2_ALL;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { POST } = await import("../src/app/api/auth/telegram/webhook/route.ts");
const { INCY_LINKS, V2RAYTUN_LINKS } = await import("../src/lib/dashboard/apps.ts");
const { t } = await import("../src/lib/bot-i18n.ts");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEAD_APP = /apps\.apple\.com\/[^"'\s)]*id6476628951/;
const USER = 100000055;
const UUID = "0a1b2c3d-0000-4000-8000-0000000000c1";
/** A made-up subscription token (32 hex, built here so no scanner mistakes it for a key). */
const SUB_TOKEN = "0".repeat(24) + "c1c1c1c1";

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx|mjs|js|json|md|txt)$/.test(name)) yield path;
  }
}

test("no link to the removed V2RayTun App Store app anywhere in the app", () => {
  const hits = [];
  for (const dir of ["src", "lib", "public", "scripts"]) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      if (DEAD_APP.test(readFileSync(file, "utf8"))) hits.push(file.slice(ROOT.length));
    }
  }
  assert.deepEqual(hits, []);
});

test("INCY's App Store link is the cabinet's one; V2RayTun only where it ships", () => {
  assert.match(INCY_LINKS.apple, /^https:\/\/apps\.apple\.com\/app\/id6756943388$/);
  assert.match(V2RAYTUN_LINKS.android, /^https:\/\/play\.google\.com\//);
  assert.match(V2RAYTUN_LINKS.windows, /\.exe$/);
});

test("the bot's first guide step names an app that exists on every platform", () => {
  for (const lang of ["en", "ru", "es", "de", "fr"]) {
    const s1 = t("guide.s1", lang);
    assert.match(s1, /Happ/, lang);
    assert.match(s1, /INCY/, lang);
    assert.doesNotMatch(s1, /V2RayTun/, lang);
    assert.equal(t("btn.incy", lang), "📥 INCY");
  }
});

describe("the legacy bot's buttons", () => {
  let tgCalls;
  let updateSeq = 7000;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    mem.reset();
    tgCalls = [];
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url);
      if (!u.startsWith("https://api.telegram.org/")) throw new Error(`unexpected fetch in test: ${u}`);
      tgCalls.push({ method: u.split("/").pop(), body: init.body ? JSON.parse(init.body) : null });
      return Response.json({ ok: true, result: { message_id: 1 } });
    };
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function press(data) {
    const res = await POST(
      new NextRequest("https://kovra.test/api/auth/telegram/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
        body: JSON.stringify({
          update_id: updateSeq++,
          callback_query: {
            id: String(updateSeq),
            from: { id: USER, first_name: "T", language_code: "en" },
            message: { chat: { id: USER }, message_id: 42 },
            data,
          },
        }),
      }),
    );
    assert.equal(res.status, 200);
    const edits = tgCalls.filter((c) => c.method === "editMessageText");
    return edits[edits.length - 1].body.reply_markup.inline_keyboard.flat();
  }

  test("the guide screen: INCY for Apple devices, V2RayTun for Windows and Android", async () => {
    const buttons = await press("guide");
    const urls = buttons.map((b) => b.url).filter(Boolean);
    assert.ok(urls.includes(INCY_LINKS.apple));
    assert.ok(urls.includes(V2RAYTUN_LINKS.windows) && urls.includes(V2RAYTUN_LINKS.android));
    assert.ok(!urls.some((u) => DEAD_APP.test(u)));
  });

  for (const [deviceType, app, url] of [
    ["iphone", "INCY", () => INCY_LINKS.apple],
    ["mac", "INCY", () => INCY_LINKS.apple],
    ["tv", "INCY", () => INCY_LINKS.apple],
    ["android", "V2RayTun", () => V2RAYTUN_LINKS.android],
    ["windows", "V2RayTun", () => V2RAYTUN_LINKS.windows],
  ]) {
    test(`a ${deviceType} device's link screen offers Happ and ${app}`, async () => {
      mem.store.set(
        `profiles:tg_${USER}`,
        JSON.stringify([{ uuid: UUID, clientEmail: "vpn_x", vlessUrl: "vless://x", createdAt: 1, deviceType, subToken: SUB_TOKEN }]),
      );
      const buttons = await press(`link_${UUID}`);
      const alt = buttons.find((b) => b.text === `📥 ${app}`);
      assert.ok(alt, JSON.stringify(buttons));
      assert.equal(alt.url, url());
      assert.ok(buttons.some((b) => b.text === "📥 Happ"));
    });
  }
});

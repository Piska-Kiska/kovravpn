// tests/lava-hold.test.mjs — run: npm test
//
// lava.top on hold (src/lib/lava.ts, `lavaOffered`).
//
// 13.11.2026 the owner had lava.top hidden from the payments of every project
// for now. What is held here:
//   • the line stays configured, and is not offered;
//   • every place that OFFERS the method or issues a new invoice asks
//     `lavaOffered`: the account answer (cabinet and Mini App), the bot's
//     top-up menu and its callback, the purchase route, the wallet top-up
//     (which also feeds the second bot's method list);
//   • the receiver of lava.top's events still asks `lavaConfigured`, so an
//     invoice issued before the hold is credited.
//
// Keys and ids are made up; nothing leaves the process.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.LAVA_API_KEY = ["test", "lava", "key"].join("-");
process.env.LAVA_OFFER_ID = "0a1b2c3d-0000-4000-8000-00000000000f";
process.env.LAVA_BUYER_EMAIL = "receipts@kovra.test";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const lava = await import("../src/lib/lava.ts");

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");

test("the line is configured and is not offered", () => {
  assert.equal(lava.lavaConfigured, true);
  assert.equal(lava.lavaOffered, false);
});

test("the switch is one line in lib/lava.ts", () => {
  const src = read("src/lib/lava.ts");
  assert.match(src, /const LAVA_ON_HOLD = true;/);
  assert.match(src, /export const lavaOffered = lavaConfigured && !LAVA_ON_HOLD;/);
});

test("every place that offers lava.top asks lavaOffered", () => {
  const places = {
    "src/app/api/account/route.ts": /lavaEnabled: lavaOffered,/,
    "src/app/api/auth/telegram/webhook/route.ts": /\.\.\.\(lavaOffered\s*\?/,
    "src/app/api/subscribe/lava/route.ts": /if \(!lavaOffered\) \{/,
    "src/lib/wallet-topup.ts": /return lavaOffered;/,
  };
  for (const [file, offers] of Object.entries(places)) {
    const src = read(file);
    assert.match(src, offers, `${file} must ask lavaOffered`);
    assert.doesNotMatch(src, /\blavaConfigured\b/, `${file} must not offer by lavaConfigured, or the hold does not reach it`);
  }
});

test("the bot's lava callback falls back to the top-up menu while held", () => {
  const src = read("src/app/api/auth/telegram/webhook/route.ts");
  assert.match(src, /data === "topup_m_lava"\) \{\s*if \(!lavaOffered\) await screenTopup\(chatId, msgId\);/);
});

test("the receiver of lava.top events keeps crediting by lavaConfigured", () => {
  const src = read("src/lib/lava-webhook-handler.ts");
  assert.match(src, /if \(!lavaConfigured\) \{/);
  assert.doesNotMatch(src, /\blavaOffered\b/);
});

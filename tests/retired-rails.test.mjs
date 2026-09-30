// tests/retired-rails.test.mjs — run: npm test
//
// KM-15: /api/payment/create created YooKassa payments while its webhook was
// already retired (410), so a payment could never be granted. It answers 410
// now, like the other retired rails, and touches nothing.

import { test } from "node:test";
import assert from "node:assert/strict";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const create = await import("../src/app/api/payment/create/route.ts");
const webhook = await import("../src/app/api/payment/webhook/route.ts");

test("the YooKassa create route is retired: 410, no Redis, no provider call", async () => {
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => {
    fetched += 1;
    throw new Error("no network in this test");
  };
  try {
    const post = await create.POST();
    assert.equal(post.status, 410);
    assert.deepEqual(await post.json(), { error: "Payment method not available" });
    assert.equal((await create.GET()).status, 410);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(fetched, 0);
  assert.equal(mem.calls.size, 0);
});

test("its webhook stays retired", async () => {
  assert.equal((await webhook.POST()).status, 410);
});

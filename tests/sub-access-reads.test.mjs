// tests/sub-access-reads.test.mjs — run: npm test
//
// Optimization review 15.10.2026: lib/sub-access.ts read Redis six or seven
// times in a row per subscription fetch. It now reads the deleted-link
// marker and the token's two records in one MGET, then the binding, the
// account, the devices and the plans at once. Pinned here: the reads, and
// that each verdict still depends only on its own read, so a read that fails
// changes an answer only where it did before.
//
// Runs against the in-memory Redis. Ids, tokens and keys are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { resolveSubAccess } = await import("../src/lib/sub-access.ts");

const DAY = 86_400_000;
const USER = "tg_100000002";
const UUID = "0a1b2c3d-0000-4000-8000-000000000101";
const TOKEN = "readsaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const LEGACY = "readslegacyaaaaaaaaaaaaaaaaaaaaa";
const NOW = Date.now();

beforeEach(() => {
  mem.reset();
  mem.store.set(`account:${USER}`, JSON.stringify({ plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: 1 }));
  mem.store.set(
    `profiles:${USER}`,
    JSON.stringify([{ uuid: UUID, clientEmail: `vpn_${USER}_1`, vlessUrl: "", createdAt: DAY, deviceType: "android", subToken: TOKEN }]),
  );
  mem.store.set(`sub_prof:${TOKEN}`, JSON.stringify({ userId: USER, uuid: UUID }));
  mem.store.set(`sub_token:${LEGACY}`, USER);
  mem.store.set(
    `subs:${USER}`,
    JSON.stringify([{ id: "p30", kind: "plan3", slots: 3, startedAt: 1, expiresAt: NOW + 30 * DAY }]),
  );
});

describe("the reads of one fetch", () => {
  test("a device link: one MGET for its keys, then four GETs, no other reads", async () => {
    const access = await resolveSubAccess(TOKEN, "hwid-a", NOW);
    assert.equal(access.kind, "device");
    assert.equal(mem.calls.get("mget"), 1);
    assert.equal(mem.calls.get("get"), 4, "binding, account, devices, plans");
    assert.equal(mem.calls.get("set"), 1, "the first fetch binds the link");
  });

  test("a legacy link is found through the same MGET", async () => {
    const access = await resolveSubAccess(LEGACY, null, NOW);
    assert.equal(access.kind, "account");
    assert.equal(mem.calls.get("mget"), 1);
    assert.equal(mem.calls.get("get"), 3, "account, devices, plans; no binding without x-hwid");
  });

  test("a deleted link answers from the MGET alone", async () => {
    mem.store.set(`sub_deleted:${TOKEN}`, USER);
    assert.deepEqual(await resolveSubAccess(TOKEN, "hwid-a", NOW), { kind: "deleted" });
    assert.equal(mem.calls.get("get") ?? 0, 0);
  });

  test("an unknown token answers not-found from the MGET alone", async () => {
    assert.deepEqual(await resolveSubAccess("unknownaaaaaaaaaaaaaaaaaaaaaaaaa", null, NOW), {
      kind: "not-found",
      message: "Token not found",
    });
    assert.equal(mem.calls.get("get") ?? 0, 0);
  });
});

describe("a failed read changes only its own verdict", () => {
  test("negative: a failed MGET throws, as a failed token read did", async () => {
    mem.failNext("mget");
    await assert.rejects(resolveSubAccess(TOKEN, null, NOW), /injected mget failure/);
  });

  test("a second device is refused even when the account read fails", async () => {
    mem.store.set(`sub:${TOKEN}:hwid`, "hwid-a");
    mem.failNext("get", { key: `account:${USER}` });
    assert.deepEqual(await resolveSubAccess(TOKEN, "hwid-b", NOW), { kind: "second-device" });
  });

  test("a missing device answers not-found even when the plans read fails", async () => {
    mem.store.set(`sub_prof:${TOKEN}`, JSON.stringify({ userId: USER, uuid: "0a1b2c3d-0000-4000-8000-00000000dead" }));
    mem.failNext("get", { key: `subs:${USER}` });
    assert.deepEqual(await resolveSubAccess(TOKEN, null, NOW), { kind: "not-found", message: "Profile not found" });
  });

  test("negative: a failed account read still throws when the account is needed", async () => {
    mem.failNext("get", { key: `account:${USER}` });
    await assert.rejects(resolveSubAccess(TOKEN, null, NOW), /injected get failure/);
  });

  test("negative: a failed plans read still throws when the plans are needed", async () => {
    mem.failNext("get", { key: `subs:${USER}` });
    await assert.rejects(resolveSubAccess(TOKEN, null, NOW), /injected get failure/);
  });
});

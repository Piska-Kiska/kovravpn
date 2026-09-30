// tests/profile-delete.test.mjs — run: npm test
//
// Deleting a device (lib/profile-delete.ts, used by the bot and
// POST /api/vpn/delete): a panel that does not confirm keeps the device and
// alerts the owner, instead of freeing the slot while the old link works on.
// removeProfile (lib/accounts.ts) itself touches nothing for a uuid that is
// not one of the user's devices: hy2:<uuid> is keyed by the uuid alone.
//
// Ids, codes and tokens are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = ["333333333", "KOVRA-money-test"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { deleteOwnProfile } = await import("../src/lib/profile-delete.ts");
const { removeProfile } = await import("../src/lib/accounts.ts");

const TG = "tg_100000001";

beforeEach(() => mem.reset());

describe("deleting a device keeps it when a panel does not confirm", () => {
  const UUID = "0a1b2c3d-0000-4000-8000-00000000d001";
  beforeEach(() => {
    mem.store.set(
      `profiles:${TG}`,
      JSON.stringify([{ uuid: UUID, clientEmail: "kovra_d001", vlessUrl: "", createdAt: 1, deviceType: "iphone" }]),
    );
  });

  test("a failed panel: the profile stays and the owner is alerted", async () => {
    const alerts = [];
    const r = await deleteOwnProfile(TG, UUID, {
      removeFromPanels: async () => [
        { key: "de", ok: true, status: 200 },
        { key: "uk", ok: false, status: 0, error: "timeout" },
      ],
      syncExpiry: async () => {},
      alertOwner: async (text) => alerts.push(text),
    });
    assert.equal(r, "panel_failed");
    assert.equal(JSON.parse(mem.store.get(`profiles:${TG}`)).length, 1);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /uk/);
  });

  test("a panel call that throws counts as failed", async () => {
    const r = await deleteOwnProfile(TG, UUID, {
      removeFromPanels: async () => {
        throw new Error("network");
      },
      syncExpiry: async () => {},
      alertOwner: async () => {},
    });
    assert.equal(r, "panel_failed");
    assert.equal(JSON.parse(mem.store.get(`profiles:${TG}`)).length, 1);
  });

  test("every panel confirms: removed", async () => {
    let synced = 0;
    const r = await deleteOwnProfile(TG, UUID, {
      removeFromPanels: async () => [{ key: "de", ok: true, status: 200 }],
      syncExpiry: async () => {
        synced += 1;
      },
      alertOwner: async () => assert.fail("no alert"),
    });
    assert.equal(r, "deleted");
    assert.deepEqual(JSON.parse(mem.store.get(`profiles:${TG}`)), []);
    assert.equal(synced, 1);
  });

  test("someone else's uuid: nothing is called", async () => {
    const r = await deleteOwnProfile("tg_100000009", UUID, {
      removeFromPanels: async () => assert.fail("no panel call"),
      syncExpiry: async () => {},
      alertOwner: async () => {},
    });
    assert.equal(r, "not_found");
    assert.equal(JSON.parse(mem.store.get(`profiles:${TG}`)).length, 1);
  });
});

describe("removeProfile touches nothing for a uuid the user does not own", () => {
  const MINE = "0a1b2c3d-0000-4000-8000-00000000d00a";
  const THEIRS = "0a1b2c3d-0000-4000-8000-00000000d00b";
  const OTHER = "tg_100000002";
  const prof = (uuid) => ({ uuid, clientEmail: `kovra_${uuid.slice(-4)}`, vlessUrl: "", createdAt: 1, deviceType: "android" });

  beforeEach(() => {
    mem.store.set(`profiles:${TG}`, JSON.stringify([prof(MINE)]));
    mem.store.set(`profiles:${OTHER}`, JSON.stringify([prof(THEIRS)]));
    mem.store.set(`hy2:${MINE}`, TG);
    mem.store.set(`hy2:${THEIRS}`, OTHER);
  });

  test("another user's uuid: no write, no delete, their hy2 entry stays", async () => {
    const snapshot = new Map(mem.store);
    await removeProfile(TG, THEIRS);
    assert.deepEqual(new Map(mem.store), snapshot);
    assert.equal(mem.calls.get("set") ?? 0, 0);
    assert.equal(mem.calls.get("del") ?? 0, 0);
  });

  test("the user's own uuid goes, with its hy2 entry", async () => {
    await removeProfile(TG, MINE);
    assert.deepEqual(JSON.parse(mem.store.get(`profiles:${TG}`)), []);
    assert.equal(mem.store.has(`hy2:${MINE}`), false);
    assert.equal(mem.store.get(`hy2:${THEIRS}`), OTHER);
  });
});

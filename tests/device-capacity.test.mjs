// tests/device-capacity.test.mjs — run: npm test
//
// KM-03: device slots were enforced only when a device was created. When a
// 3-device plan ended and only a 14-day referral bonus (or a $5 add-on) was
// left, every old device came back to life on that one slot. Now each device
// holds one slot, newest first (lib/device-capacity.ts), and the rest are
// paused where access is decided: the panels (syncAllExpiry), the
// subscription link (/api/sub/<token>) and the PRO-node list. Paused devices
// are shown honestly in the bot and the cabinet; nothing is deleted.
//
// Runs against an in-memory Redis; the panel call is injected. Ids and
// tokens are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = ["333333333", "KOVRA-money-test"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { deviceAccess, slotEnds, accessOf } = await import("../src/lib/device-capacity.ts");
const { syncAllExpiry } = await import("../src/lib/balance.ts");
const { NextRequest } = await import("next/server");
const { GET: subGet } = await import("../src/app/api/sub/[token]/route.ts");
const { POST: accountPost } = await import("../src/app/api/account/route.ts");
const { createSession } = await import("../src/lib/session.ts");
const { accountView } = await import("../src/lib/bot-v2/controller.ts");
const { devicesScreen, deviceScreen } = await import("../src/lib/bot-v2/screens.ts");
const { V2_DICTS } = await import("../src/lib/bot-v2/i18n.ts");

const NOW = 1_790_000_000_000;
const DAY = 86_400_000;
const USER = "tg_100000001";
const EN = V2_DICTS.en;

const uuid = (n) => `0a1b2c3d-0000-4000-8000-00000000${String(n).padStart(4, "0")}`;
/** Three devices, created on days 1, 2 and 3: device 3 is the newest. */
const PROFILES = [1, 2, 3].map((n) => ({
  uuid: uuid(n),
  clientEmail: `kovra_${n}`,
  vlessUrl: "",
  createdAt: NOW - (10 - n) * DAY,
  deviceType: "android",
  subToken: `tok${n}${"0".repeat(29)}`,
}));
const plan3 = (days) => ({ id: "p3", kind: "plan3", slots: 3, createdAt: NOW - 40 * DAY, expiresAt: NOW + days * DAY });
const referral = (days) => ({ id: "r1", kind: "referral", slots: 1, createdAt: NOW - DAY, expiresAt: NOW + days * DAY });
const addon = (id, days) => ({ id, kind: "device", slots: 1, createdAt: NOW - DAY, expiresAt: NOW + days * DAY });

describe("deviceAccess (pure)", () => {
  test("a running 3-device plan: all three active until its end", () => {
    const a = deviceAccess(PROFILES, [plan3(20)], NOW);
    assert.deepEqual(a.map((x) => x.state), ["active", "active", "active"]);
    assert.ok(a.every((x) => x.until === NOW + 20 * DAY));
  });

  test("the plan ended, a 14-day referral bonus is left: only the NEWEST device is active", () => {
    const a = deviceAccess(PROFILES, [plan3(-1), referral(14)], NOW);
    assert.deepEqual(a.map((x) => x.state), ["paused", "paused", "active"]);
    assert.equal(a[2].until, NOW + 14 * DAY);
    assert.equal(a[0].until, 0);
  });

  test("the plan renewed: all three active again", () => {
    const a = deviceAccess(PROFILES, [plan3(-1), referral(14), { ...plan3(30), id: "p3b" }], NOW);
    assert.deepEqual(a.map((x) => x.state), ["active", "active", "active"]);
    // The longest slots go to the newest devices.
    assert.deepEqual(a.map((x) => x.until), [NOW + 30 * DAY, NOW + 30 * DAY, NOW + 30 * DAY]);
  });

  test("slots of different lengths: the newest devices hold the longest ones", () => {
    const a = deviceAccess(PROFILES, [addon("d1", 5), addon("d2", 25)], NOW);
    assert.deepEqual(a.map((x) => [x.state, x.until]), [
      ["paused", 0],
      ["active", NOW + 5 * DAY],
      ["active", NOW + 25 * DAY],
    ]);
  });

  test("nothing runs: every device is expired (not paused), as before", () => {
    const a = deviceAccess(PROFILES, [plan3(-3)], NOW);
    assert.deepEqual(a.map((x) => x.state), ["expired", "expired", "expired"]);
  });

  test("order in the answer follows the profiles; ties by createdAt go by uuid", () => {
    const same = [
      { uuid: uuid(9), createdAt: 5 },
      { uuid: uuid(8), createdAt: 5 },
    ];
    const a = deviceAccess(same, [referral(3)], NOW);
    assert.deepEqual(a.map((x) => [x.uuid, x.state]), [
      [uuid(9), "paused"],
      [uuid(8), "active"],
    ]);
    assert.equal(accessOf(uuid(8), same, [referral(3)], NOW).state, "active");
    assert.equal(accessOf(uuid(7), same, [referral(3)], NOW), null);
  });

  test("slotEnds ignores broken or ended subscriptions and caps at 100", () => {
    assert.deepEqual(slotEnds([{ slots: 2, expiresAt: NOW + DAY }, { slots: 1.5, expiresAt: NOW + DAY }, { slots: 1, expiresAt: NOW - 1 }], NOW), [
      NOW + DAY,
      NOW + DAY,
    ]);
    assert.equal(slotEnds([{ slots: 500, expiresAt: NOW + DAY }], NOW).length, 100);
  });
});

describe("syncAllExpiry pushes each device its own date", () => {
  beforeEach(() => {
    mem.reset();
    mem.store.set(`account:${USER}`, JSON.stringify({ plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: 1 }));
    mem.store.set(`profiles:${USER}`, JSON.stringify(PROFILES));
  });

  async function sync(subs) {
    mem.store.set(`subs:${USER}`, JSON.stringify(subs));
    const writes = new Map();
    await syncAllExpiry(USER, {
      now: () => NOW,
      updateClient: async (spec) => {
        writes.set(spec.uuid, spec.expiryTimeMs);
        return [{ key: "de", ok: true, status: 200 }];
      },
    });
    return writes;
  }

  test("plan ends, referral left: the newest device keeps 14 days, the other two are switched off now", async () => {
    const w = await sync([plan3(-1), referral(14)]);
    assert.equal(w.get(uuid(3)), NOW + 14 * DAY);
    assert.equal(w.get(uuid(2)), NOW);
    assert.equal(w.get(uuid(1)), NOW);
  });

  test("plan renewed: all three get the plan's end again", async () => {
    await sync([plan3(-1), referral(14)]);
    const w = await sync([plan3(-1), referral(14), { ...plan3(30), id: "p3b" }]);
    assert.deepEqual([...w.values()], [NOW + 30 * DAY, NOW + 30 * DAY, NOW + 30 * DAY]);
    assert.equal(JSON.parse(mem.store.get(`account:${USER}`)).paidUntil, NOW + 30 * DAY);
  });

  test("nothing runs: every device is switched off now", async () => {
    const w = await sync([plan3(-2)]);
    assert.deepEqual([...w.values()], [NOW, NOW, NOW]);
  });
});

describe("/api/sub/<token> serves only devices that hold a slot", () => {
  beforeEach(() => {
    mem.reset();
    mem.store.set(`account:${USER}`, JSON.stringify({ plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: 1 }));
    mem.store.set(`profiles:${USER}`, JSON.stringify(PROFILES));
    for (const p of PROFILES) mem.store.set(`sub_prof:${p.subToken}`, JSON.stringify({ userId: USER, uuid: p.uuid }));
  });

  const fetchSub = async (token) => {
    const res = await subGet(new NextRequest(`https://kovra.test/api/sub/${token}`), { params: Promise.resolve({ token }) });
    return { res, text: await res.text() };
  };
  const decoded = (body) => Buffer.from(body, "base64").toString("utf8");

  test("a paused (older) device gets the notice, not servers", async () => {
    mem.store.set(`subs:${USER}`, JSON.stringify([plan3(-1), { ...referral(14), expiresAt: Date.now() + 14 * DAY }]));
    const { res, text } = await fetchSub(PROFILES[0].subToken);
    assert.equal(res.status, 200);
    assert.match(decoded(text), /Device%20paused/);
    const info = Buffer.from(res.headers.get("sub-info-text").slice("base64:".length), "base64").toString("utf8");
    assert.match(info, /more devices than slots/);
  });

  test("the newest device is served with its own slot's date", async () => {
    const until = Date.now() + 14 * DAY;
    mem.store.set(`subs:${USER}`, JSON.stringify([plan3(-1), { ...referral(14), expiresAt: until }]));
    const { res, text } = await fetchSub(PROFILES[2].subToken);
    assert.equal(res.status, 200);
    assert.doesNotMatch(decoded(text), /paused/);
    assert.match(res.headers.get("subscription-userinfo"), new RegExp(`expire=${Math.floor(until / 1000)}`));
  });

  test("nothing runs: the no-plan notice, as before", async () => {
    mem.store.set(`subs:${USER}`, JSON.stringify([plan3(-1)]));
    const { text } = await fetchSub(PROFILES[2].subToken);
    assert.match(decoded(text), /No%20active%20plan/);
  });
});

describe("the cabinet and the bot show paused devices", () => {
  beforeEach(() => {
    mem.reset();
    mem.store.set(`account:${USER}`, JSON.stringify({ plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: 1 }));
    mem.store.set(`profiles:${USER}`, JSON.stringify(PROFILES));
    mem.store.set(`subs:${USER}`, JSON.stringify([plan3(-40), { ...referral(14), expiresAt: Date.now() + 14 * DAY }]));
  });

  test("/api/account marks each device active or paused", async () => {
    const sid = await createSession(USER);
    const res = await accountPost(
      new NextRequest("https://kovra.test/api/account", { method: "POST", headers: { authorization: `Bearer ${sid}` } }),
    );
    const body = await res.json();
    assert.deepEqual(body.profiles.map((p) => p.access), ["paused", "paused", "active"]);
    assert.ok(body.profiles[2].accessUntil > Date.now());
    assert.equal(body.profiles[0].accessUntil, 0);
  });

  test("bot v2: My devices counts the paused ones and marks them; a paused device says how to turn it on", () => {
    const subs = [plan3(-40), referral(14)];
    const v = accountView(subs, PROFILES, 0, "en", NOW);
    assert.deepEqual(v.devices.map((d) => d.paused), [true, true, false]);
    const list = devicesScreen(v, "en");
    assert.ok(list.text.includes(EN["devs.slotPaused"].replace("{n}", "2")));
    const labels = list.kb.flat().map((b) => b.text);
    assert.equal(labels.filter((l) => l.startsWith("⏸")).length, 2);

    const paused = deviceScreen(v, { ...v.devices[0], subToken: "t", subUrl: "https://kovra.test/api/sub/t" }, "en");
    assert.ok(paused.text.includes(EN["dev.slotPaused"]));
    assert.ok(paused.text.includes(EN["dev.slotHow"]));
    assert.ok(!paused.text.includes(EN["dev.readyWhere"]), "the locations line belongs to the fresh device only");
    const active = deviceScreen(v, { ...v.devices[2], subToken: "t", subUrl: "https://kovra.test/api/sub/t" }, "en");
    assert.ok(!active.text.includes(EN["dev.slotPaused"]));
  });

  test("bot v2: with no plan at all the old 'no active plan' wording stays", () => {
    const v = accountView([plan3(-40)], PROFILES, 0, "en", NOW);
    const list = devicesScreen(v, "en");
    assert.ok(list.text.includes(EN["devs.paused"]));
    assert.ok(!list.text.includes(EN["devs.slotPaused"].slice(0, 12)));
  });
});

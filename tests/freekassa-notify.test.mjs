// tests/freekassa-notify.test.mjs — run: npm test
//
// KM-11: the Freekassa notify route kept the grant, markTopup, the
// subscription read and the notification in one try, and released the dedup
// key on ANY throw. A failure after the grant answered 500, FK retried, and
// the plan was granted twice. The dedup key was also built from `intid`,
// which SIGN does not cover, so the same signed payment with a new intid was
// granted again.
//
// Now: dedup on the signed MERCHANT_ORDER_ID; only a failed grant releases
// the key and answers 500; everything after the grant is best-effort.
// POST (src/app/api/freekassa/notify/route.ts) is called directly against an
// in-memory Redis. The shop id, secret and ids are made up; the sender
// address is taken from the route's own allow-list.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const SHOP_ID = "90001";
const SECRET2 = ["fk", "test", "secret2"].join("-");
process.env.FREEKASSA_SHOP_ID = SHOP_ID;
process.env.FREEKASSA_SECRET2 = SECRET2;
delete process.env.FREEKASSA_DISABLE_IP_CHECK;
process.env.TELEGRAM_BOT_TOKEN = "";
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { POST } = await import("../src/app/api/freekassa/notify/route.ts");
const { FK_IPS } = await import("../src/lib/freekassa.ts");

const DAY = 86_400_000;
const USER = "tg_100000001";
const PLAN_ORDER = `sub_plan3_12_${USER}_1790000000000`;
const DEVICE_ORDER = `dev_${USER}_1790000000001`;
const FK_IP = [...FK_IPS][0];

const md5 = (s) => createHash("md5").update(s).digest("hex");

function notify({ orderId = PLAN_ORDER, amount = "79.08", intid = "5550001", sign, ip = FK_IP } = {}) {
  const form = new URLSearchParams({
    MERCHANT_ID: SHOP_ID,
    AMOUNT: amount,
    MERCHANT_ORDER_ID: orderId,
    intid,
    CUR_ID: "32",
    SIGN: sign ?? md5(`${SHOP_ID}:${amount}:${SECRET2}:${orderId}`),
  });
  return POST(
    new Request("https://kovra.test/api/freekassa/notify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip },
      body: form,
    }),
  );
}

const subs = () => JSON.parse(mem.store.get(`subs:${USER}`) ?? "[]");
/** Days of access the user has, from now. */
const daysOfAccess = () => {
  const max = Math.max(0, ...subs().map((s) => s.expiresAt));
  return Math.round((max - Date.now()) / DAY);
};

beforeEach(() => mem.reset());

describe("freekassa notify", () => {
  test("a paid plan3 / 12 months is granted once: 360 days", async () => {
    const res = await notify();
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "YES");
    assert.equal(subs().length, 1);
    assert.equal(subs()[0].slots, 3);
    assert.equal(daysOfAccess(), 360);
    assert.equal(mem.store.get(`has_topup:${USER}`), "1");
    assert.ok(mem.store.has(`fk_payment_done:${PLAN_ORDER}`), "dedup is keyed by the signed order id");
  });

  test("the same signed payment with a new intid is not granted again", async () => {
    await notify({ intid: "5550001" });
    const res = await notify({ intid: "5550002" });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "YES");
    assert.equal(daysOfAccess(), 360, "still 360 days, not 720");
  });

  test("a failure AFTER the grant answers YES and a retry does not grant twice", async () => {
    mem.failNext("set", { key: `has_topup:${USER}` });
    const first = await notify();
    assert.equal(first.status, 200, "no 500: the grant already happened");
    assert.equal(await first.text(), "YES");
    const retry = await notify();
    assert.equal(retry.status, 200);
    assert.equal(daysOfAccess(), 360, "one grant, not two");
  });

  test("a failed read for the payment notice after the grant also answers YES", async () => {
    // subs:<user> is read twice: by the grant, then for the notice. Only the
    // second read fails. (The proxy in memory-redis forwards to its target,
    // so the method can be wrapped for one test.)
    let seen = 0;
    const realGet = mem.redis.get;
    mem.redis.get = async (key) => {
      if (key === `subs:${USER}` && ++seen === 2) throw new Error("injected read failure");
      return realGet(key);
    };
    let res;
    try {
      res = await notify();
    } finally {
      mem.redis.get = realGet;
    }
    assert.equal(seen, 2, "the notice read was reached");
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "YES");
    assert.equal(daysOfAccess(), 360);
  });

  test("a failed grant answers 500 and releases the key, so the retry grants once", async () => {
    mem.failNext("set", { key: `subs:${USER}` });
    const first = await notify();
    assert.equal(first.status, 500);
    assert.deepEqual(subs(), []);
    assert.equal(mem.store.has(`fk_payment_done:${PLAN_ORDER}`), false);
    const retry = await notify();
    assert.equal(retry.status, 200);
    assert.equal(await retry.text(), "YES");
    assert.equal(daysOfAccess(), 360);
  });

  test("Redis failing at the dedup reserve answers 500, so FK retries and grants once", async () => {
    mem.failNext("set", { key: `fk_payment_done:${PLAN_ORDER}` });
    const first = await notify();
    assert.equal(first.status, 500);
    assert.deepEqual(subs(), []);
    const retry = await notify();
    assert.equal(retry.status, 200);
    assert.equal(await retry.text(), "YES");
    assert.equal(daysOfAccess(), 360);
  });

  test("a device add-on is one slot for 30 days", async () => {
    const res = await notify({ orderId: DEVICE_ORDER, amount: "5.00" });
    assert.equal(res.status, 200);
    assert.deepEqual(subs().map((s) => [s.kind, s.slots]), [["device", 1]]);
    assert.equal(daysOfAccess(), 30);
  });

  test("a wrong SIGN is refused before any Redis write", async () => {
    const res = await notify({ sign: md5("forged") });
    assert.equal(res.status, 400);
    assert.equal(mem.store.size, 0);
  });

  test("an amount that does not match the SIGN is refused", async () => {
    const res = await notify({ amount: "0.01", sign: md5(`${SHOP_ID}:79.08:${SECRET2}:${PLAN_ORDER}`) });
    assert.equal(res.status, 400);
    assert.deepEqual(subs(), []);
  });

  test("a sender outside the Freekassa list is refused", async () => {
    const res = await notify({ ip: "192.0.2.10" });
    assert.equal(res.status, 403);
    assert.equal(mem.store.size, 0);
  });
});

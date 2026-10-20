// tests/account-delete.test.mjs — run: npm test
//
// Self-service account deletion (src/lib/account-delete.ts, the handlers of
// /api/account/delete and /api/account/delete/confirm) end to end against
// the in-memory Redis of tests/support/memory-redis.mjs. Panels, Telegram and
// e-mail are stubs that record their calls; nothing leaves the process. The
// devices go through the real lib/profile-delete.ts with its panel call
// stubbed.
//
// Pinned here:
//   * the owner-first gate: outside `acctdel:users` nothing is sent or
//     deleted; "*" opens it for everyone;
//   * the code: stored hashed with a 10-minute TTL, sent to the account's
//     own channel (e-mail account: a letter, Telegram account: a message,
//     falling back to the linked one), 3 per hour;
//   * a wrong code: 400 and nothing deleted; an expired one: 400; the fifth
//     wrong one burns it; 5 attempts per hour: 429;
//   * the right code: 202, every device off the panels BEFORE the records
//     go, every record of the wipe gone, the devices' links answering
//     "removed", every session of the account ended, the audit entry, the
//     owner told the money; a stranger's records untouched;
//   * a panel that does not let go: 502, the account kept, the code still
//     good, and the retry finishes;
//   * the same request again: 200 "deleted";
//   * the owner's own account (by id or by linked Telegram): a dry run;
//   * a payment that lands while the devices are removed is in the owner's
//     message.
//
// Ids, addresses and tokens are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const del = await import("../src/lib/account-delete.ts");
const { deleteOwnProfile } = await import("../src/lib/profile-delete.ts");
const { deleteCodeEmail, deleteCodeTelegram } = await import("../src/lib/account-delete-copy.ts");
const { ADMIN_TG_ID } = await import("../src/lib/bot-owner.ts");

const DAY = 86_400_000;
const EMAIL = "person@example.test";
const UID = `em_${EMAIL}`;
const TG = "555000111";
const OTHER = "tg_777000222";
const OWNER = `tg_${ADMIN_TG_ID}`;
const START = Date.UTC(2026, 9, 21, 12, 0, 0);

// ── Seeding ─────────────────────────────────────────────────────────────────

const put = (key, value) => mem.store.set(key, typeof value === "string" ? value : JSON.stringify(value));
const has = (key) => mem.store.has(key) || mem.sets.has(key);

function profile(uuid, subToken) {
  return { uuid, clientEmail: `kv_${uuid}`, vlessUrl: "vless://x", createdAt: START - 30 * DAY, subToken };
}

/** A linked e-mail + Telegram account with money and two devices, plus a stranger. */
function seedAccount() {
  put(`account:${UID}`, { plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: START - 60 * DAY });
  put(`user:${UID}`, { authMethod: "linked", email: EMAIL, telegramId: TG, tgUsername: "person_tg", createdAt: 1 });
  put(`profiles:${UID}`, [profile("u-1", "tok1"), profile("u-2", "tok2")]);
  put(`alias:tg_${TG}`, UID);
  put("username:person_tg", UID);
  put(`balance_usd:${UID}`, "1250");
  put(`balance_usd:tg_${TG}`, "300");
  put(`subs:${UID}`, [{ id: "p1", kind: "plan3", slots: 3, createdAt: START - DAY, expiresAt: Date.now() + 20 * DAY }]);
  put(`sub_token_of:${UID}`, "accttok");
  put("sub_token:accttok", UID);
  put("sub_prof:tok1", { userId: UID, uuid: "u-1" });
  put("sub_prof:tok2", { userId: UID, uuid: "u-2" });
  put("sub:tok1:hwid", "hwid-a");
  put(`ref_code:${UID}`, "ab12cd34");
  put("ref_lookup:ab12cd34", UID);
  put(`has_topup:${UID}`, "1");
  // A stranger whose records must survive.
  put(`account:${OTHER}`, { plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: 1 });
  put(`user:${OTHER}`, { authMethod: "telegram", telegramId: "777000222", createdAt: 1 });
  put(`balance_usd:${OTHER}`, "999");
  put("alias:tg_888", OTHER);
  // The gate: this account only.
  mem.sets.set(del.ACCOUNT_DELETE_USERS_KEY, new Set([UID]));
}

/** A session of `userId`, listed in its per-user index as createSession lists it. */
function session(userId) {
  const sid = randomUUID();
  put(`session:${sid}`, { userId, createdAt: Date.now(), lastActivity: Date.now(), remember: false });
  const index = `user_sessions:${userId}`;
  mem.sets.set(index, new Set([...(mem.sets.get(index) ?? []), sid]));
  return sid;
}

function request(path, { sid, method = "POST", body, bearer = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (sid && bearer) headers.authorization = `Bearer ${sid}`;
  else if (sid) headers.cookie = `sid=${sid}`;
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// ── Stub deps ───────────────────────────────────────────────────────────────

let now = START;
let sent; // { telegram: [{chatId, html}], email: [{to, letter}] }
let owner; // owner messages
let panelCalls; // uuids taken off the panels, in order
let panelFails; // uuids whose panel refuses
let deliver; // { telegram: boolean, email: boolean }
let onDevice; // called before each device leaves

function deps() {
  return {
    sendTelegram: async (chatId, html) => {
      sent.telegram.push({ chatId, html });
      return deliver.telegram;
    },
    sendEmail: async (to, letter) => {
      sent.email.push({ to, letter });
      return deliver.email;
    },
    notifyOwner: async (html) => {
      owner.push(html);
    },
    deleteDevice: (userId, uuid) =>
      deleteOwnProfile(userId, uuid, {
        removeFromPanels: async (id) => {
          await onDevice(id);
          panelCalls.push(id);
          return [{ key: "nl", ok: !panelFails.has(id), status: panelFails.has(id) ? 502 : 200 }];
        },
        syncExpiry: async () => undefined,
        alertOwner: async () => undefined,
      }),
    newCode: () => "424242",
    now: () => now,
  };
}

beforeEach(() => {
  mem.reset();
  now = START;
  sent = { telegram: [], email: [] };
  owner = [];
  panelCalls = [];
  panelFails = new Set();
  deliver = { telegram: true, email: true };
  onDevice = async () => undefined;
  seedAccount();
});

const status = async (sid) => {
  const res = await del.handleDeleteStatus(request("/api/account/delete", { sid, method: "GET" }));
  return { status: res.status, body: await res.json() };
};
const sendCode = async (sid, lang = "en") => {
  const res = await del.handleDeleteCode(request("/api/account/delete/confirm", { sid, body: { lang } }), deps());
  return { status: res.status, body: await res.json(), res };
};
const remove = async (sid, code = "424242", opts = {}) => {
  const res = await del.handleDelete(request("/api/account/delete", { sid, body: { code }, ...opts }), deps());
  return { status: res.status, body: await res.json(), res };
};

/** Every record the wipe deletes for the seeded account. */
const ACCOUNT_KEYS = [
  `account:${UID}`,
  `user:${UID}`,
  `profiles:${UID}`,
  `alias:tg_${TG}`,
  "username:person_tg",
  `balance_usd:${UID}`,
  `balance_usd:tg_${TG}`,
  `subs:${UID}`,
  `sub_token_of:${UID}`,
  "sub_token:accttok",
  "sub_prof:tok1",
  "sub_prof:tok2",
  "sub:tok1:hwid",
  `ref_code:${UID}`,
  "ref_lookup:ab12cd34",
  `has_topup:${UID}`,
];

// ── Gate ────────────────────────────────────────────────────────────────────

describe("the gate", () => {
  test("an account outside the set gets no form, no code and no deletion", async () => {
    mem.sets.set(del.ACCOUNT_DELETE_USERS_KEY, new Set(["em_someone@example.test"]));
    const sid = session(UID);
    assert.deepEqual((await status(sid)).body, { enabled: false });
    const code = await sendCode(sid);
    assert.equal(code.status, 403);
    assert.equal(code.body.error, "not_enabled");
    const gone = await remove(sid);
    assert.equal(gone.status, 403);
    assert.equal(sent.email.length + sent.telegram.length, 0);
    for (const key of ACCOUNT_KEYS) assert.ok(has(key), key);
  });

  test('"*" opens it for everyone', async () => {
    mem.sets.set(del.ACCOUNT_DELETE_USERS_KEY, new Set([del.ACCOUNT_DELETE_EVERYONE]));
    assert.equal((await status(session(UID))).body.enabled, true);
  });

  test("a failed read of the set is a no", async () => {
    mem.failNext("smismember");
    assert.deepEqual((await status(session(UID))).body, { enabled: false });
  });

  test("no session, or a malformed Bearer one, is 401 everywhere", async () => {
    assert.equal((await status(undefined)).status, 401);
    assert.equal((await sendCode(undefined)).status, 401);
    assert.equal((await remove(undefined)).status, 401);
    assert.equal((await remove("not-a-session", "424242", { bearer: true })).status, 401);
  });
});

// ── Status ──────────────────────────────────────────────────────────────────

describe("GET /api/account/delete", () => {
  test("what would be lost: the account's and its linked Telegram id's money, the plans, the devices", async () => {
    const { status: code, body } = await status(session(UID));
    assert.equal(code, 200);
    assert.equal(body.enabled, true);
    assert.equal(body.dryRun, false);
    assert.equal(body.primary, true);
    assert.equal(body.channel, "email");
    assert.equal(body.walletCents, 1550);
    assert.equal(body.plans, 1);
    assert.ok(body.plansUntil > Date.now());
    assert.equal(body.devices, 2);
    assert.deepEqual(body.linked, { email: true, telegram: true });
  });

  test("a Bearer session (the Mini App) is read the same way", async () => {
    const sid = session(UID);
    const res = await del.handleDeleteStatus(request("/api/account/delete", { sid, method: "GET", bearer: true }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).devices, 2);
  });
});

// ── Code ────────────────────────────────────────────────────────────────────

describe("POST /api/account/delete/confirm", () => {
  test("an e-mail account gets a letter; only a hash is stored, for 10 minutes", async () => {
    const out = await sendCode(session(UID), "de");
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, { status: "sent", channel: "email" });
    assert.equal(sent.email.length, 1);
    assert.equal(sent.email[0].to, EMAIL);
    assert.match(sent.email[0].letter.subject, /^424242 — .*Kovra-Kontos/);
    assert.equal(sent.email[0].letter.from, "Kovra <noreply@kovravpn.com>");
    const raw = mem.store.get(del.deleteCodeKey(UID));
    assert.ok(raw && !raw.includes("424242"), "the code itself is not stored");
    assert.deepEqual(mem.ttls.get(del.deleteCodeKey(UID)), { ex: del.CODE_TTL_SEC, px: undefined });
  });

  test("a Telegram account gets a message", async () => {
    put(`account:${OTHER}`, { plan: "free", maxProfiles: 1, extraProfiles: 0, paidUntil: 0, createdAt: 1 });
    mem.sets.set(del.ACCOUNT_DELETE_USERS_KEY, new Set([OTHER]));
    const out = await sendCode(session(OTHER), "ru");
    assert.deepEqual(out.body, { status: "sent", channel: "telegram" });
    assert.equal(sent.telegram[0].chatId, "777000222");
    assert.match(sent.telegram[0].html, /<b>424242<\/b>/);
    assert.match(sent.telegram[0].html, /аккаунта Kovra/);
  });

  test("a letter that does not go falls back to the linked Telegram", async () => {
    deliver.email = false;
    const out = await sendCode(session(UID));
    assert.deepEqual(out.body, { status: "sent", channel: "telegram" });
    assert.equal(sent.telegram[0].chatId, TG);
  });

  test("nothing delivered: 502 and no code left behind", async () => {
    deliver = { telegram: false, email: false };
    const out = await sendCode(session(UID));
    assert.equal(out.status, 502);
    assert.equal(out.body.error, "send_failed");
    assert.equal(has(del.deleteCodeKey(UID)), false);
  });

  test("an account with nowhere to send: 409 no_channel", async () => {
    const id = "ap_000111";
    put(`account:${id}`, { plan: "free", maxProfiles: 1, extraProfiles: 0, paidUntil: 0, createdAt: 1 });
    put(`user:${id}`, { authMethod: "apple", createdAt: 1 });
    mem.sets.set(del.ACCOUNT_DELETE_USERS_KEY, new Set([id]));
    const out = await sendCode(session(id));
    assert.equal(out.status, 409);
    assert.equal(out.body.error, "no_channel");
  });

  test("three codes an hour, then 429 with Retry-After", async () => {
    const sid = session(UID);
    for (let i = 0; i < del.CODE_SENDS_PER_HOUR; i++) assert.equal((await sendCode(sid)).status, 200);
    const out = await sendCode(sid);
    assert.equal(out.status, 429);
    assert.equal(out.body.error, "rate_limited");
    assert.ok(Number(out.res.headers.get("retry-after")) > 0);
  });

  test("a session under an id that is an alias of another account: 409 linked_account", async () => {
    // An old e-mail session from before the e-mail was linked to a Telegram account.
    const alias = "em_old@example.test";
    put(`alias:${alias}`, OTHER);
    mem.sets.set(del.ACCOUNT_DELETE_USERS_KEY, new Set([alias]));
    const out = await sendCode(session(alias));
    assert.equal(out.status, 409);
    assert.equal(out.body.error, "linked_account");
    assert.equal(sent.email.length, 0);
  });
});

// ── Delete ──────────────────────────────────────────────────────────────────

describe("POST /api/account/delete", () => {
  test("a wrong code: 400, nothing deleted; the fifth wrong one burns the code", async () => {
    const sid = session(UID);
    await sendCode(sid);
    for (let i = 1; i < del.MAX_WRONG_CODES; i++) {
      const out = await remove(sid, "000000");
      assert.equal(out.status, 400);
      assert.equal(out.body.error, "code_invalid");
    }
    assert.ok(has(del.deleteCodeKey(UID)));
    assert.equal((await remove(sid, "000000")).body.error, "code_invalid");
    assert.equal(has(del.deleteCodeKey(UID)), false, "burnt");
    for (const key of ACCOUNT_KEYS) assert.ok(has(key), key);
    assert.deepEqual(panelCalls, []);
  });

  test("an expired code: 400 code_expired", async () => {
    const sid = session(UID);
    await sendCode(sid);
    now += del.CODE_TTL_SEC * 1000 + 1;
    const out = await remove(sid);
    assert.equal(out.status, 400);
    assert.equal(out.body.error, "code_expired");
    assert.ok(has(`account:${UID}`));
  });

  test("no code asked for: code_expired; not six digits: code_invalid", async () => {
    const sid = session(UID);
    assert.equal((await remove(sid)).body.error, "code_expired");
    // Four more: with the one above, the five attempts an hour allows.
    for (const code of ["12345", "1234567", "12a456", 424242]) {
      const out = await remove(sid, code);
      assert.equal(out.status, 400);
      assert.equal(out.body.error, "code_invalid", String(code));
    }
  });

  test("five attempts an hour, then 429", async () => {
    const sid = session(UID);
    for (let i = 0; i < del.DELETE_ATTEMPTS_PER_HOUR; i++) assert.equal((await remove(sid, "000000")).status, 400);
    assert.equal((await remove(sid)).status, 429);
  });

  test("the account lock held by a device being created: 409 busy, nothing deleted", async () => {
    const sid = session(UID);
    await sendCode(sid);
    put(`lock:user:${UID}`, "tsomeoneelse");
    const out = await remove(sid);
    assert.equal(out.status, 409);
    assert.equal(out.body.error, "busy");
    assert.ok(has(`account:${UID}`));
  });

  test("the right code: devices off the panels first, then every record, every session, the audit, the owner told", async () => {
    const sid = session(UID);
    const second = session(UID); // another browser of the same person
    const viaTelegram = session(`tg_${TG}`); // a Telegram session that resolves to the account
    const strangers = session(OTHER);
    // Records must still be there while the devices leave the panels.
    onDevice = async () => {
      assert.ok(has(`account:${UID}`), "records deleted before the devices left the panels");
    };
    await sendCode(sid);
    const out = await remove(sid);
    assert.equal(out.status, 202);
    assert.deepEqual(out.body, { status: "deleted" });
    assert.match(out.res.headers.get("set-cookie") ?? "", /sid=;.*Max-Age=0/i);

    assert.deepEqual(panelCalls, ["u-1", "u-2"]);
    for (const key of ACCOUNT_KEYS) assert.equal(has(key), false, key);
    // The devices' links answer "removed" from now on.
    assert.equal(mem.store.get("sub_deleted:tok1"), UID);
    assert.equal(mem.store.get("sub_deleted:tok2"), UID);
    assert.equal(has(del.deleteCodeKey(UID)), false);
    // Every session of the account ended; the stranger's kept.
    for (const s of [sid, second, viaTelegram]) assert.equal(has(`session:${s}`), false, s);
    assert.ok(has(`session:${strangers}`));
    assert.equal(has(`user_sessions:${UID}`), false);
    // A stranger's records untouched.
    for (const key of [`account:${OTHER}`, `user:${OTHER}`, `balance_usd:${OTHER}`, "alias:tg_888"]) assert.ok(has(key), key);
    // The audit entry.
    const audits = [...mem.store.keys()].filter((k) => /^audit:\d+:account\.delete\.self$/.test(k));
    assert.equal(audits.length, 1);
    const entry = JSON.parse(mem.store.get(audits[0]));
    assert.equal(entry.userId, UID);
    assert.equal(entry.devicesRemoved, 2);
    assert.equal(entry.walletCents, 1550);
    assert.equal(entry.moneyChanged, false);
    // The owner is told the money.
    assert.equal(owner.length, 1);
    assert.match(owner[0], /\$15\.50/);
    assert.match(owner[0], /тарифов в силе: 1/);
    assert.doesNotMatch(owner[0], /Деньги изменились/);
  });

  test("the same request again: 200 deleted, cookie cleared", async () => {
    const sid = session(UID);
    await sendCode(sid);
    assert.equal((await remove(sid)).status, 202);
    const again = await remove(sid);
    assert.equal(again.status, 200);
    assert.deepEqual(again.body, { status: "deleted" });
    assert.match(again.res.headers.get("set-cookie") ?? "", /sid=;/);
  });

  test("a panel that does not let go: 502, the account kept, the code good, and the retry finishes", async () => {
    const sid = session(UID);
    await sendCode(sid);
    panelFails.add("u-2");
    const out = await remove(sid);
    assert.equal(out.status, 502);
    assert.equal(out.body.error, "panel_failed");
    // u-1 is gone, u-2 is kept with its link; the account is whole.
    assert.deepEqual(
      JSON.parse(mem.store.get(`profiles:${UID}`)).map((p) => p.uuid),
      ["u-2"],
    );
    assert.ok(has("sub_prof:tok2"));
    for (const key of [`account:${UID}`, `user:${UID}`, `balance_usd:${UID}`, `subs:${UID}`]) assert.ok(has(key), key);
    assert.ok(has(del.deleteCodeKey(UID)), "the code is still good");
    assert.ok(has(`session:${sid}`));
    assert.equal(owner.length, 0);

    panelFails.clear();
    const retry = await remove(sid);
    assert.equal(retry.status, 202);
    assert.deepEqual(panelCalls, ["u-1", "u-2", "u-2"]);
    for (const key of ACCOUNT_KEYS) assert.equal(has(key), false, key);
  });

  test("a payment that lands while the devices leave is in the owner's message", async () => {
    const sid = session(UID);
    await sendCode(sid);
    onDevice = async (uuid) => {
      if (uuid === "u-2") put(`balance_usd:${UID}`, "2250");
    };
    assert.equal((await remove(sid)).status, 202);
    assert.match(owner[0], /\$25\.50/);
    assert.match(owner[0], /Деньги изменились/);
    assert.equal(has(`balance_usd:${UID}`), false);
  });

  test("a device created behind the lock is met on the next round", async () => {
    const sid = session(UID);
    await sendCode(sid);
    let added = false;
    onDevice = async () => {
      if (added) return;
      added = true;
      const list = JSON.parse(mem.store.get(`profiles:${UID}`));
      put(`profiles:${UID}`, [...list, profile("u-3", "tok3")]);
      put("sub_prof:tok3", { userId: UID, uuid: "u-3" });
    };
    assert.equal((await remove(sid)).status, 202);
    assert.deepEqual(panelCalls, ["u-1", "u-2", "u-3"]);
    assert.equal(mem.store.get("sub_deleted:tok3"), UID);
  });

  test("an account already gone: 200 deleted", async () => {
    const sid = session(UID);
    await sendCode(sid);
    mem.store.delete(`account:${UID}`);
    mem.store.delete(`user:${UID}`);
    const out = await remove(sid);
    assert.equal(out.status, 200);
    assert.equal(has(`session:${sid}`), false);
  });
});

// ── The owner ───────────────────────────────────────────────────────────────

describe("the owner's own account", () => {
  function seedOwner(id, user) {
    put(`account:${id}`, { plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: 1 });
    put(`user:${id}`, user);
    put(`profiles:${id}`, [profile("o-1", "otok")]);
    put("sub_prof:otok", { userId: id, uuid: "o-1" });
  }

  test("is let in without the set, and the last step is a dry run", async () => {
    seedOwner(OWNER, { authMethod: "telegram", telegramId: ADMIN_TG_ID, createdAt: 1 });
    mem.sets.delete(del.ACCOUNT_DELETE_USERS_KEY);
    const sid = session(OWNER);
    const st = await status(sid);
    assert.equal(st.body.enabled, true);
    assert.equal(st.body.dryRun, true);
    assert.equal((await sendCode(sid)).body.channel, "telegram");
    const out = await remove(sid);
    assert.equal(out.status, 200);
    assert.equal(out.body.status, "dry_run");
    assert.equal(out.body.devices, 1);
    assert.ok(out.body.keys > 0);
    assert.deepEqual(panelCalls, []);
    for (const key of [`account:${OWNER}`, `user:${OWNER}`, `profiles:${OWNER}`, "sub_prof:otok", `session:${sid}`]) assert.ok(has(key), key);
    assert.equal(has(del.deleteCodeKey(OWNER)), false, "the code is used up");
    assert.ok([...mem.store.keys()].some((k) => /^audit:\d+:account\.delete\.self\.dryrun$/.test(k)));
  });

  test("an e-mail account with the owner's Telegram linked is the owner too", async () => {
    const id = "em_owner@example.test";
    seedOwner(id, { authMethod: "linked", email: "owner@example.test", telegramId: ADMIN_TG_ID, createdAt: 1 });
    const sid = session(id);
    assert.equal((await status(sid)).body.dryRun, true);
    await sendCode(sid);
    assert.equal((await remove(sid)).body.status, "dry_run");
    assert.ok(has(`account:${id}`));
  });
});

// ── The code's words ────────────────────────────────────────────────────────

describe("the code letter and message", () => {
  test("say what the code does in every language, and English for anything else", () => {
    for (const lang of ["en", "ru", "es", "de", "fr"]) {
      const letter = deleteCodeEmail(lang, "123456");
      assert.match(letter.subject, /^123456 — /);
      assert.match(letter.html, /Kovra/);
      assert.match(letter.html, /123456/);
      assert.match(letter.html, new RegExp(`lang="${lang}"`));
      assert.match(deleteCodeTelegram(lang, "123456"), /<b>123456<\/b>/);
    }
    for (const lang of [undefined, null, "zz", "<b>", 7]) {
      assert.match(deleteCodeEmail(lang, "123456").html, /lang="en"/);
    }
  });

  test("refuse a code that is not six digits", () => {
    for (const code of ["12345", "1234567", "abcdef", ""]) {
      assert.throws(() => deleteCodeEmail("en", code), RangeError);
      assert.throws(() => deleteCodeTelegram("en", code), RangeError);
    }
  });

  test("French puts a no-break space before its colons", () => {
    const fr = deleteCodeEmail("fr", "123456").html + deleteCodeTelegram("fr", "123456");
    assert.doesNotMatch(fr, / :/);
  });
});

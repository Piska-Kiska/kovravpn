// tests/telegram-webapp.test.mjs — run: npm test
//
// Mini App initData validation (src/lib/telegram-webapp.ts): a real signature
// passes, anything edited, stale, unsigned or signed by another bot does not.
//
// Tokens and ids are made up. Tokens are assembled from parts: a literal in
// the shape "digits:letters" trips secret scanners.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  INIT_DATA_MAX_AGE_SEC,
  INIT_DATA_MAX_LEN,
  validateWebAppInitData,
} from "../src/lib/telegram-webapp.ts";

const TOKEN = ["111111111", "KOVRA-test-token"].join(":");
const OTHER = ["222222222", "OTHER-test-token"].join(":");
const NOW_MS = Date.UTC(2026, 8, 30, 12, 0, 0);
const NOW_SEC = Math.floor(NOW_MS / 1000);
const USER_ID = 100000001;
const opts = { now: NOW_MS };

function sign(fields, token) {
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  return createHmac("sha256", secret).update(dataCheckString).digest("hex");
}

function build(fields, token, hashOverride) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, v);
  params.set("hash", hashOverride ?? sign(fields, token));
  return params.toString();
}

function fields(overrides = {}) {
  return {
    user: JSON.stringify({ id: USER_ID, first_name: "Test", username: "tester", language_code: "de" }),
    auth_date: String(NOW_SEC - 30),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    signature: "c2lnbmF0dXJlLW9mLXRoZS10ZXN0",
    ...overrides,
  };
}

describe("validateWebAppInitData", () => {
  test("a valid signature returns the user, auth_date and query id", () => {
    const res = validateWebAppInitData(build(fields(), TOKEN), TOKEN, opts);
    assert.equal(res.ok, true);
    assert.equal(res.user.id, USER_ID);
    assert.equal(res.user.username, "tester");
    assert.equal(res.user.language_code, "de");
    assert.equal(res.authDate, NOW_SEC - 30);
    assert.equal(res.queryId, "AAHdF6IQAAAAAN0XohDhrOrc");
    assert.equal(res.startParam, undefined);
  });

  test("the signature field takes part in the check (only hash is excluded)", () => {
    const f = fields();
    const withoutSignature = { ...f };
    delete withoutSignature.signature;
    // Signed without `signature`, then sent with it: must fail.
    const params = new URLSearchParams(build(withoutSignature, TOKEN));
    params.set("signature", f.signature);
    assert.deepEqual(validateWebAppInitData(params.toString(), TOKEN, opts), { ok: false, reason: "bad_hash" });
  });

  test("an uppercase hex hash is accepted", () => {
    const f = fields();
    const res = validateWebAppInitData(build(f, TOKEN, sign(f, TOKEN).toUpperCase()), TOKEN, opts);
    assert.equal(res.ok, true);
  });

  test("start_param is returned when it has the allowed shape, dropped otherwise", () => {
    const good = validateWebAppInitData(build(fields({ start_param: "paid" }), TOKEN), TOKEN, opts);
    assert.equal(good.ok, true);
    assert.equal(good.startParam, "paid");
    const odd = validateWebAppInitData(build(fields({ start_param: "a b<c>" }), TOKEN), TOKEN, opts);
    assert.equal(odd.ok, true);
    assert.equal(odd.startParam, undefined);
  });

  test("unknown keys inside user are not carried over", () => {
    const f = fields({ user: JSON.stringify({ id: USER_ID, first_name: "T", role: "admin", balance: 1e9 }) });
    const res = validateWebAppInitData(build(f, TOKEN), TOKEN, opts);
    assert.equal(res.ok, true);
    assert.deepEqual(res.user, { id: USER_ID, first_name: "T" });
  });

  test("a tampered user id is rejected", () => {
    const signed = build(fields(), TOKEN);
    const tampered = signed.replace(encodeURIComponent(String(USER_ID)), encodeURIComponent("100000002"));
    assert.notEqual(tampered, signed);
    assert.deepEqual(validateWebAppInitData(tampered, TOKEN, opts), { ok: false, reason: "bad_hash" });
  });

  test("a field added after signing is rejected", () => {
    const extra = `${build(fields(), TOKEN)}&start_param=paid`;
    assert.deepEqual(validateWebAppInitData(extra, TOKEN, opts), { ok: false, reason: "bad_hash" });
  });

  test("a field removed after signing is rejected", () => {
    const params = new URLSearchParams(build(fields(), TOKEN));
    params.delete("query_id");
    assert.deepEqual(validateWebAppInitData(params.toString(), TOKEN, opts), { ok: false, reason: "bad_hash" });
  });

  test("another bot's token does not validate", () => {
    assert.deepEqual(validateWebAppInitData(build(fields(), OTHER), TOKEN, opts), { ok: false, reason: "bad_hash" });
  });

  test("a zeroed hash is bad_hash; a missing, short, non-hex or repeated hash is no_hash", () => {
    assert.deepEqual(validateWebAppInitData(build(fields(), TOKEN, "0".repeat(64)), TOKEN, opts), {
      ok: false,
      reason: "bad_hash",
    });
    assert.deepEqual(validateWebAppInitData(build(fields(), TOKEN, "abc"), TOKEN, opts), { ok: false, reason: "no_hash" });
    assert.deepEqual(validateWebAppInitData(build(fields(), TOKEN, "z".repeat(64)), TOKEN, opts), {
      ok: false,
      reason: "no_hash",
    });
    const noHash = new URLSearchParams(fields()).toString();
    assert.deepEqual(validateWebAppInitData(noHash, TOKEN, opts), { ok: false, reason: "no_hash" });
    const twice = `${build(fields(), TOKEN)}&hash=${"0".repeat(64)}`;
    assert.deepEqual(validateWebAppInitData(twice, TOKEN, opts), { ok: false, reason: "no_hash" });
  });

  test("stale auth_date is expired; exactly at the limit is still fresh", () => {
    const stale = fields({ auth_date: String(NOW_SEC - INIT_DATA_MAX_AGE_SEC - 1) });
    assert.deepEqual(validateWebAppInitData(build(stale, TOKEN), TOKEN, opts), { ok: false, reason: "expired" });
    const edge = fields({ auth_date: String(NOW_SEC - INIT_DATA_MAX_AGE_SEC) });
    assert.equal(validateWebAppInitData(build(edge, TOKEN), TOKEN, opts).ok, true);
  });

  test("maxAgeSec narrows the window", () => {
    const f = fields({ auth_date: String(NOW_SEC - 120) });
    assert.deepEqual(validateWebAppInitData(build(f, TOKEN), TOKEN, { now: NOW_MS, maxAgeSec: 60 }), {
      ok: false,
      reason: "expired",
    });
  });

  test("missing or junk auth_date is expired (after a matching signature)", () => {
    const noDate = fields();
    delete noDate.auth_date;
    assert.deepEqual(validateWebAppInitData(build(noDate, TOKEN), TOKEN, opts), { ok: false, reason: "expired" });
    const junk = fields({ auth_date: "yesterday" });
    assert.deepEqual(validateWebAppInitData(build(junk, TOKEN), TOKEN, opts), { ok: false, reason: "expired" });
  });

  test("stale AND forged answers bad_hash, not expired", () => {
    const stale = fields({ auth_date: String(NOW_SEC - 7200) });
    assert.deepEqual(validateWebAppInitData(build(stale, OTHER), TOKEN, opts), { ok: false, reason: "bad_hash" });
  });

  test("signed initData without a user, or with a bad id, is no_user", () => {
    const noUser = fields();
    delete noUser.user;
    assert.deepEqual(validateWebAppInitData(build(noUser, TOKEN), TOKEN, opts), { ok: false, reason: "no_user" });
    for (const id of [0, -5, 1.5, "100000001", null]) {
      const f = fields({ user: JSON.stringify({ id, first_name: "T" }) });
      assert.deepEqual(validateWebAppInitData(build(f, TOKEN), TOKEN, opts), { ok: false, reason: "no_user" }, String(id));
    }
  });

  test("signed initData with broken user JSON is malformed", () => {
    const f = fields({ user: "{not json" });
    assert.deepEqual(validateWebAppInitData(build(f, TOKEN), TOKEN, opts), { ok: false, reason: "malformed" });
  });

  test("empty, oversized or non-string input is malformed; an empty token is no_token", () => {
    assert.deepEqual(validateWebAppInitData("", TOKEN, opts), { ok: false, reason: "malformed" });
    assert.deepEqual(validateWebAppInitData("x".repeat(INIT_DATA_MAX_LEN + 1), TOKEN, opts), {
      ok: false,
      reason: "malformed",
    });
    assert.deepEqual(validateWebAppInitData(undefined, TOKEN, opts), { ok: false, reason: "malformed" });
    assert.deepEqual(validateWebAppInitData(build(fields(), TOKEN), "", opts), { ok: false, reason: "no_token" });
  });
});

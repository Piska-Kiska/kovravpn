// tests/pair-code.test.mjs
//
// «Код для приложения», contract pair-code v1.1 (src/lib/pair-code.ts): the
// pure helpers and the issue / redeem logic over an in-memory store, limiter,
// clock and logger. Nothing here touches Redis.
//
// Pinned here:
//   * normalisation exactly as the app does it: uppercase, whitespace (the
//     app's set: Unicode White_Space plus U+FEFF, every BMP character checked)
//     and dashes dropped, then 8 characters of 23456789ABCDEFGHJKMNPQRSTUVWXYZ
//     or malformed (0 1 I L O, wrong length, non-strings, huge input);
//   * generation draws every character from the injected CSPRNG, the default
//     being crypto.randomInt; a bad draw throws instead of yielding a bad code;
//   * XXXX-XXXX display; the key `paircode:<CODE>`; TTL 600 s; NX on write and
//     a retry on a collision;
//   * the stored link must be https on a ladder host (no port, no userinfo);
//   * redeem: malformed → bad_code without a store call; wrong, expired,
//     used, unreadable, foreign host → one `not_found`; a second redeem of the
//     same code and two parallel redeems → exactly one `ready`;
//   * v1.1 request ids: /^[A-Za-z0-9_-]{22,64}$/ or ignored; the redeem that
//     takes the code with one leaves `paircode:done:<CODE>` = {subUrl, rid:
//     sha256 hex} for 300 s in the same atomic step (never the id itself);
//     the same id gets the same link back until then, a replay never extends
//     it; another id, no id or a malformed one is the same `not_found` as a
//     wrong code; parallel redeems with different ids give one `ready`, with
//     the same id all get the link; a step whose answer was lost (retried by
//     the store, or failed and asked again) and a slow first name both end in
//     the link; a replay record the step could not write does not cost the
//     answer; the store is one EVAL of PAIR_CODE_REDEEM_SCRIPT and a reply it
//     never gives is a fault, not a not_found;
//   * limits: 20 issues per account per hour, 10 redeems a minute and 60 a
//     day per address; a limiter fault lets the call through with one warning;
//   * a request no app sends (not JSON, or a page of another site) is told
//     apart before it may spend the address's budget;
//   * nothing logged carries the code, the link, a token, a uuid, a request
//     id or its hash.
//
// Every value below is synthetic.
//
// Run: npm test

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createHash } from "node:crypto";

import "./support/load-ts.mjs";
import { runPairCodeRedeem } from "./support/pair-code-redeem-model.mjs";

const pc = await import("../src/lib/pair-code.ts");
const {
  PAIR_CODE_ALPHABET,
  PAIR_CODE_LENGTH,
  PAIR_CODE_TTL_SEC,
  PAIR_CODE_ISSUE_MAX,
  PAIR_CODE_ISSUE_WINDOW_SEC,
  PAIR_SUB_HOSTS,
  PAIR_CODE_DONE_KEY_PREFIX,
  PAIR_CODE_DONE_TTL_SEC,
  PAIR_REQUEST_ID_RE,
  PAIR_CODE_REDEEM_SCRIPT,
  normalisePairCode,
  normalisePairRequestId,
  pairRequestIdHash,
  pairCodeDoneKey,
  parsePairCodeDoneRecord,
  parsePairCodeRedeemReply,
  generatePairCode,
  formatPairCode,
  pairCodeKey,
  isPairableSubUrl,
  parsePairCodeRecord,
  redactForLog,
  createRedisPairCodeStore,
  issuePairCode,
  redeemPairCode,
  redeemRetryAfter,
  redeemRequestRefusal,
} = pc;

const USER = "tg_100";
const DEVICE = "11111111-0000-4000-8000-000000000001";
const TOKEN = "0123456789abcdef0123456789abcdef"; // gitleaks:allow — synthetic test value
const SUB = `https://kovravpn.com/api/sub/${TOKEN}`;
// Request ids as the app makes them: 32 bytes, base64url, no padding (43 characters).
const RID_A = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWY"; // gitleaks:allow — synthetic test value
const RID_B = "c3ludGhldGljLXJlcXVlc3QtaWQtbnVtYmVyLXR3by0"; // gitleaks:allow — synthetic test value
const RID_C = "dGhpcmQtc3ludGhldGljLXJlcXVlc3QtaWQtX2FiY2Q"; // gitleaks:allow — synthetic test value
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * An in-memory store with Redis's semantics: NX writes, and the redeem as one
 * atomic step (the script's model, tests/support/pair-code-redeem-model.mjs,
 * run synchronously), TTL against a clock. Its replies go through the real
 * parsePairCodeRedeemReply.
 */
function memStore(clock = { now: 0 }) {
  const data = new Map();
  const log = [];
  const live = (key) => {
    const cur = data.get(key);
    if (cur === undefined) return null;
    if (cur.expiresAt <= clock.now) {
      data.delete(key);
      return null;
    }
    return cur;
  };
  const db = {
    getdel(key) {
      const cur = live(key);
      data.delete(key);
      return cur === null ? null : cur.value;
    },
    get(key) {
      const cur = live(key);
      return cur === null ? null : cur.value;
    },
    set(key, value, ttlSec) {
      data.set(key, { value, expiresAt: clock.now + ttlSec * 1000, ttlSec });
    },
  };
  return {
    data,
    log,
    clock,
    async putNew(key, value, ttlSec) {
      log.push(["putNew", key, ttlSec]);
      if (live(key) !== null) return false;
      db.set(key, value, ttlSec);
      return true;
    },
    async redeem(codeKey, doneKey, rid, ttlSec) {
      log.push(["redeem", codeKey, doneKey, rid, ttlSec]);
      return parsePairCodeRedeemReply(runPairCodeRedeem(db, [codeKey, doneKey], [rid ?? "", String(ttlSec)]));
    },
  };
}

/** A fixed-window limiter like lib/ratelimit.ts rateLimit. */
function memLimiter() {
  const counts = new Map();
  const calls = [];
  const limit = async (key, max, windowSec) => {
    calls.push([key, max, windowSec]);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    return n > max ? { ok: false, remaining: 0, retryAfter: windowSec } : { ok: true, remaining: max - n, retryAfter: 0 };
  };
  return { limit, counts, calls };
}

/** randomInt over a fixed list of indices, then cycling. */
function seq(indices) {
  let i = 0;
  return (max) => {
    assert.equal(max, PAIR_CODE_ALPHABET.length);
    const v = indices[i % indices.length];
    i += 1;
    return v;
  };
}

function deps(over = {}) {
  const clock = over.clock ?? { now: 1_000_000 };
  const store = over.store ?? memStore(clock);
  const limiter = over.limiter ?? memLimiter();
  const events = [];
  return {
    store,
    limiter,
    events,
    clock,
    d: {
      store,
      limit: limiter.limit,
      now: () => clock.now,
      log: (e) => events.push(e),
      ...(over.randomInt ? { randomInt: over.randomInt } : {}),
    },
  };
}

describe("the alphabet and the shape", () => {
  test("31 characters, none of 0 1 I L O, 8 per code, 10 minutes", () => {
    assert.equal(PAIR_CODE_ALPHABET, "23456789ABCDEFGHJKMNPQRSTUVWXYZ");
    assert.equal(PAIR_CODE_ALPHABET.length, 31);
    assert.equal(new Set(PAIR_CODE_ALPHABET).size, 31);
    for (const c of "01ILO") assert.ok(!PAIR_CODE_ALPHABET.includes(c), c);
    assert.equal(PAIR_CODE_LENGTH, 8);
    assert.equal(PAIR_CODE_TTL_SEC, 600);
    assert.equal(PAIR_CODE_ISSUE_MAX, 20);
    assert.equal(PAIR_CODE_ISSUE_WINDOW_SEC, 3600);
  });

  test("the ladder hosts are the app's", () => {
    assert.deepEqual([...PAIR_SUB_HOSTS].sort(), ["kovravpn.com"]);
  });
});

describe("normalisePairCode", () => {
  test("upper case, spaces and dashes dropped", () => {
    assert.equal(normalisePairCode("K7QM2XPA"), "K7QM2XPA");
    assert.equal(normalisePairCode("k7qm-2xpa"), "K7QM2XPA");
    assert.equal(normalisePairCode(" K7QM 2XPA "), "K7QM2XPA");
    assert.equal(normalisePairCode("k-7-q-m 2 x p a"), "K7QM2XPA");
    assert.equal(normalisePairCode("--K7QM--2XPA--"), "K7QM2XPA");
  });

  test("the wrong length is malformed", () => {
    for (const s of ["", "K7QM2XP", "K7QM2XPAB", "K7QM-2XP", "-", "        "]) assert.equal(normalisePairCode(s), null, JSON.stringify(s));
  });

  test("0 1 I L O and anything outside the alphabet are malformed", () => {
    for (const s of ["K7QM2XP0", "K7QM2XP1", "K7QM2XPI", "K7QM2XPL", "K7QM2XPO", "k7qm2xpo", "K7QM_2XP", "K7QM.2XP", "K7QM2XP!", "К7QM2XPA" /* Cyrillic К */]) {
      assert.equal(normalisePairCode(s), null, s);
    }
  });

  // The app's set (pair_code.rs normalise_pair_code: char::is_whitespace,
  // U+FEFF, '-'; its window's src/pairCode.ts: /[\s\u0085-]/): Unicode
  // White_Space, which is what Rust's is_whitespace tests, plus U+FEFF.
  const APP_DROPS = new Set([
    ...[0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680],
    ...Array.from({ length: 11 }, (_, i) => 0x2000 + i),
    ...[0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff, 0x2d],
  ]);

  test("whitespace the app drops is dropped too: tab, newline, no-break space, BOM", () => {
    for (const s of ["K7QM\t2XPA", "K7QM\n2XPA", "K7QM\r\n2XPA", "K7QM\u00a02XPA", "\ufeffK7QM\u20092XPA", "K7QM\u00852XPA", "K7QM\u30002XPA", " k7qm\u00a0-\u00a02xpa\t"]) {
      assert.equal(normalisePairCode(s), "K7QM2XPA", JSON.stringify(s));
    }
  });

  test("exactly the app's set is dropped, every other BMP character is kept (and makes the code malformed)", () => {
    const dropped = [];
    for (let cp = 0; cp <= 0xffff; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const c = String.fromCharCode(cp);
      const out = normalisePairCode(`K7QM${c}2XPA`);
      if (out === "K7QM2XPA") dropped.push(cp);
      else assert.equal(out, null, `U+${cp.toString(16).padStart(4, "0")}`);
    }
    assert.deepEqual(dropped, [...APP_DROPS].sort((a, b) => a - b));
  });

  test("other separators are not dropped: en dash, zero-width space, soft hyphen, underscore", () => {
    for (const s of ["K7QM\u20132XPA", "K7QM\u200b2XPA", "K7QM\u00ad2XPA", "K7QM\u180e2XPA", "K7QM_2XPA", "K7QM\u22122XPA"]) {
      assert.equal(normalisePairCode(s), null, JSON.stringify(s));
    }
  });

  test("non-strings and huge input are malformed without work", () => {
    for (const v of [undefined, null, 12345678, {}, [], true, Symbol.iterator]) assert.equal(normalisePairCode(v), null);
    assert.equal(normalisePairCode(`K7QM2XPA${" ".repeat(100)}`), null);
    assert.equal(normalisePairCode("-".repeat(10_000)), null);
  });
});

describe("generatePairCode", () => {
  test("every character comes from the injected source, in order", () => {
    assert.equal(generatePairCode(seq([0, 1, 2, 3, 4, 5, 6, 7])), "23456789");
    assert.equal(generatePairCode(seq([30])), "ZZZZZZZZ");
  });

  test("a draw outside [0, 31) throws instead of producing a bad code", () => {
    for (const bad of [31, -1, 1.5, Number.NaN, Infinity]) {
      assert.throws(() => generatePairCode(() => bad), RangeError, String(bad));
    }
  });

  test("the default is crypto.randomInt: valid, and 2000 codes do not repeat", () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i += 1) {
      const code = generatePairCode();
      assert.equal(normalisePairCode(code), code);
      seen.add(code);
    }
    assert.equal(seen.size, 2000);
  });

  test("the module draws with crypto.randomInt, never Math.random", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/lib/pair-code.ts", import.meta.url), "utf8");
    assert.match(src, /import \{[^}]*\brandomInt as cryptoRandomInt\b[^}]*\} from "crypto";/);
    assert.doesNotMatch(src, /Math\.random/);
  });
});

describe("formatPairCode and pairCodeKey", () => {
  test("XXXX-XXXX from any accepted spelling", () => {
    assert.equal(formatPairCode("K7QM2XPA"), "K7QM-2XPA");
    assert.equal(formatPairCode("k7qm 2xpa"), "K7QM-2XPA");
  });
  test("a malformed code throws", () => {
    assert.throws(() => formatPairCode("K7QM2XP0"), RangeError);
    assert.throws(() => formatPairCode(""), RangeError);
  });
  test("the key", () => {
    assert.equal(pairCodeKey("K7QM2XPA"), "paircode:K7QM2XPA");
  });
});

describe("isPairableSubUrl", () => {
  test("https on each ladder host", () => {
    for (const host of PAIR_SUB_HOSTS) assert.ok(isPairableSubUrl(`https://${host}/api/sub/${TOKEN}`), host);
    assert.ok(isPairableSubUrl(`https://KOVRAVPN.COM/api/sub/${TOKEN}`));
    assert.ok(isPairableSubUrl(`https://kovravpn.com/p/${TOKEN}`));
  });

  test("everything else is refused", () => {
    for (const url of [
      `http://kovravpn.com/api/sub/${TOKEN}`,
      `https://evil.example/api/sub/${TOKEN}`,
      `https://evil.kovravpn.com/api/sub/${TOKEN}`,
      `https://kovravpn.com.evil.example/api/sub/${TOKEN}`,
      `https://kovravpn.com:8443/api/sub/${TOKEN}`,
      `https://user:pass@kovravpn.com/api/sub/${TOKEN}`,
      "https://kovravpn.com/",
      "https://kovravpn.com",
      "javascript:alert(1)",
      "not a url",
      "",
      `https://kovravpn.com/${"a".repeat(3000)}`,
    ]) {
      assert.equal(isPairableSubUrl(url), false, url.slice(0, 80));
    }
    for (const v of [undefined, null, 1, {}]) assert.equal(isPairableSubUrl(v), false);
  });
});

describe("parsePairCodeRecord", () => {
  const rec = { subUrl: SUB, userId: USER, deviceId: DEVICE, createdAt: 5 };
  test("a JSON string or an already parsed object", () => {
    assert.deepEqual(parsePairCodeRecord(JSON.stringify(rec)), rec);
    assert.deepEqual(parsePairCodeRecord(rec), rec);
  });
  test("anything broken is null", () => {
    for (const raw of [
      "not json",
      "[]",
      "null",
      42,
      [],
      { ...rec, subUrl: "http://kovravpn.com/x" },
      { ...rec, subUrl: "https://evil.example/x" },
      { ...rec, userId: "" },
      { ...rec, userId: "*" },
      { ...rec, deviceId: "../../etc" },
      { ...rec, createdAt: "now" },
      { subUrl: SUB },
    ]) {
      assert.equal(parsePairCodeRecord(raw), null, JSON.stringify(raw));
    }
  });
});

describe("request ids and the replay record (v1.1)", () => {
  test("the constants: paircode:done:<CODE> for 300 s, ids of 22 to 64 base64url characters", () => {
    assert.equal(PAIR_CODE_DONE_KEY_PREFIX, "paircode:done:");
    assert.equal(PAIR_CODE_DONE_TTL_SEC, 300);
    assert.equal(PAIR_REQUEST_ID_RE.source, "^[A-Za-z0-9_-]{22,64}$");
    assert.equal(pairCodeDoneKey("K7QM2XPA"), "paircode:done:K7QM2XPA");
    assert.equal(normalisePairCode("done:K7QM"), null, "a done key's tail is never a code");
  });

  test("an id as the app makes it, and the bounds 22 and 64, are taken as they are", () => {
    for (const id of [RID_A, RID_B, "a".repeat(22), "Z".repeat(64), "-".repeat(30), `${"_".repeat(21)}9`]) {
      assert.equal(normalisePairRequestId(id), id, id);
    }
  });

  test("anything else is no id at all: short, long, padded, base64 proper, spaces, non-strings", () => {
    for (const bad of [
      "a".repeat(21),
      "a".repeat(65),
      `${RID_A}=`,
      `${RID_A.slice(0, 40)}+/A`,
      ` ${RID_A}`,
      `${RID_A}\n`,
      `${RID_A.slice(0, 30)} ${RID_A.slice(31)}`,
      `${RID_A.slice(0, 30)}é${RID_A.slice(31)}`,
      `${RID_A.slice(0, 30)}.${RID_A.slice(31)}`,
      "",
      "x".repeat(10_000),
    ]) {
      assert.equal(normalisePairRequestId(bad), null, JSON.stringify(bad).slice(0, 60));
    }
    for (const v of [undefined, null, 43, true, {}, [RID_A], { id: RID_A }]) assert.equal(normalisePairRequestId(v), null, JSON.stringify(v));
  });

  test("the stored hash is SHA-256 of the id, lowercase hex", () => {
    assert.equal(pairRequestIdHash(RID_A), sha256(RID_A));
    assert.match(pairRequestIdHash(RID_A), /^[0-9a-f]{64}$/);
    assert.notEqual(pairRequestIdHash(RID_A), pairRequestIdHash(RID_B));
    assert.equal(pairRequestIdHash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  test("parsePairCodeDoneRecord: a JSON string or a parsed object", () => {
    const rec = { subUrl: SUB, rid: sha256(RID_A) };
    assert.deepEqual(parsePairCodeDoneRecord(JSON.stringify(rec)), rec);
    assert.deepEqual(parsePairCodeDoneRecord(rec), rec);
  });

  test("parsePairCodeDoneRecord: anything broken is null, a foreign link included", () => {
    const rid = sha256(RID_A);
    for (const raw of [
      "not json",
      "null",
      "[]",
      42,
      null,
      { subUrl: SUB },
      { rid },
      { subUrl: "https://evil.example/api/sub/x", rid },
      { subUrl: `http://kovravpn.com/api/sub/${TOKEN}`, rid },
      { subUrl: SUB, rid: rid.toUpperCase() },
      { subUrl: SUB, rid: rid.slice(1) },
      { subUrl: SUB, rid: `${rid}0` },
      { subUrl: SUB, rid: RID_A },
      { subUrl: SUB, rid: 5 },
    ]) {
      assert.equal(parsePairCodeDoneRecord(raw), null, JSON.stringify(raw));
    }
  });

  test("the hashes are compared with crypto.timingSafeEqual", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/lib/pair-code.ts", import.meta.url), "utf8");
    assert.match(src, /import \{[^}]*\btimingSafeEqual\b[^}]*\} from "crypto";/);
    assert.match(src, /timingSafeEqual\(Buffer\.from\(a, "hex"\), Buffer\.from\(b, "hex"\)\)/);
  });
});

describe("createRedisPairCodeStore", () => {
  function client(reply = null) {
    const calls = [];
    return {
      calls,
      client: {
        async set(key, value, opts) {
          calls.push(["set", key, value, opts]);
          return key.endsWith("TAKEN") ? null : "OK";
        },
        async eval(script, keys, args) {
          calls.push(["eval", script, keys, args]);
          return typeof reply === "function" ? reply() : reply;
        },
      },
    };
  }

  test("SET NX EX for a new code", async () => {
    const { client: c, calls } = client();
    const store = createRedisPairCodeStore(c);
    assert.equal(await store.putNew("paircode:FREE", "v", 600), true);
    assert.equal(await store.putNew("paircode:TAKEN", "v", 600), false);
    assert.deepEqual(calls, [
      ["set", "paircode:FREE", "v", { nx: true, ex: 600 }],
      ["set", "paircode:TAKEN", "v", { nx: true, ex: 600 }],
    ]);
  });

  test("a redeem is one EVAL of the redeem script: both keys, the hash and the TTL, nothing else", async () => {
    const { client: c, calls } = client(["taken", { subUrl: SUB }, 1]);
    const rid = sha256(RID_A);
    assert.deepEqual(await createRedisPairCodeStore(c).redeem("paircode:X", "paircode:done:X", rid, 300), { kind: "taken", value: { subUrl: SUB }, replaySaved: true });
    assert.deepEqual(calls, [["eval", PAIR_CODE_REDEEM_SCRIPT, ["paircode:X", "paircode:done:X"], [rid, "300"]]]);
  });

  test("without an id the script is told so with an empty ARGV[1]: it then neither writes nor reads a record", async () => {
    const { client: c, calls } = client(null);
    assert.deepEqual(await createRedisPairCodeStore(c).redeem("paircode:X", "paircode:done:X", null, 300), { kind: "none" });
    assert.deepEqual(calls[0][3], ["", "300"]);
  });

  test("a hash that is not one, or a TTL that is not whole positive seconds: refused before Redis is asked", async () => {
    const { client: c, calls } = client(null);
    const store = createRedisPairCodeStore(c);
    for (const rid of [RID_A, sha256(RID_A).toUpperCase(), sha256(RID_A).slice(1), "", `${sha256(RID_A)}\n`]) {
      await assert.rejects(store.redeem("paircode:X", "paircode:done:X", rid, 300), RangeError, JSON.stringify(rid));
    }
    for (const ttl of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "300"]) {
      await assert.rejects(store.redeem("paircode:X", "paircode:done:X", null, ttl), RangeError, String(ttl));
    }
    assert.deepEqual(calls, []);
  });

  test("an EVAL that fails rejects as it is (the route's 503)", async () => {
    const { client: c } = client(() => {
      throw new Error("fetch failed");
    });
    await assert.rejects(createRedisPairCodeStore(c).redeem("paircode:X", "paircode:done:X", null, 300), /fetch failed/);
  });

  test("a reply the script never gives rejects instead of passing for a not_found", async () => {
    const { client: c } = client(["taken"]);
    await assert.rejects(createRedisPairCodeStore(c).redeem("paircode:X", "paircode:done:X", null, 300), /unexpected reply from the redeem script/);
  });
});

describe("parsePairCodeRedeemReply", () => {
  test("the three replies of the script, the values as the client hands them (a string or parsed JSON)", () => {
    assert.deepEqual(parsePairCodeRedeemReply(null), { kind: "none" });
    assert.deepEqual(parsePairCodeRedeemReply(undefined), { kind: "none" });
    assert.deepEqual(parsePairCodeRedeemReply(["taken", "v", 1]), { kind: "taken", value: "v", replaySaved: true });
    assert.deepEqual(parsePairCodeRedeemReply(["taken", { subUrl: SUB }, 0]), { kind: "taken", value: { subUrl: SUB }, replaySaved: false });
    assert.deepEqual(parsePairCodeRedeemReply(["done", "v"]), { kind: "done", value: "v" });
    assert.deepEqual(parsePairCodeRedeemReply(["done", { subUrl: SUB, rid: "r" }]), { kind: "done", value: { subUrl: SUB, rid: "r" } });
  });

  test("anything else throws, and the message carries nothing of the reply", () => {
    for (const reply of [
      false,
      0,
      "taken",
      "OK",
      {},
      { kind: "taken" },
      [],
      ["taken"],
      ["taken", "v"],
      ["taken", null, 1],
      ["taken", "v", 2],
      ["taken", "v", "1"],
      ["taken", "v", true],
      ["taken", "v", 1, "extra"],
      ["done"],
      ["done", null],
      ["done", "v", 1],
      ["none", "v"],
      [SUB, sha256(RID_A)],
    ]) {
      assert.throws(
        () => parsePairCodeRedeemReply(reply),
        (err) => err instanceof Error && !err.message.includes(SUB) && !err.message.includes("taken") && !err.message.includes(sha256(RID_A)),
        JSON.stringify(reply),
      );
    }
  });
});

describe("issuePairCode", () => {
  test("stores the record under paircode:<CODE> for 600 s and answers the code", async () => {
    const { d, store, events } = deps({ randomInt: seq([9, 5, 22, 17, 0, 28, 20, 8]) });
    const r = await issuePairCode(d, { userId: USER, deviceId: DEVICE, subUrl: SUB });
    assert.deepEqual(r, { ok: true, code: "B7RK2XPA", display: "B7RK-2XPA", expiresIn: 600 });
    const stored = store.data.get(`paircode:${r.code}`);
    assert.ok(stored, "stored under the bare code");
    assert.equal(stored.ttlSec, 600);
    assert.deepEqual(JSON.parse(stored.value), { subUrl: SUB, userId: USER, deviceId: DEVICE, createdAt: 1_000_000 });
    assert.deepEqual(events, [{ event: "pair_code_issued", userId: USER }]);
  });

  test("the injected draws decide the code", async () => {
    const { d } = deps({ randomInt: seq([0, 1, 2, 3, 4, 5, 6, 7]) });
    const r = await issuePairCode(d, { userId: USER, deviceId: DEVICE, subUrl: SUB });
    assert.equal(r.code, "23456789");
    assert.equal(r.display, "2345-6789");
  });

  test("a collision draws again; NX never overwrites a live code", async () => {
    const { d, store } = deps({ randomInt: seq([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]) });
    store.data.set("paircode:22222222", { value: "someone else's", expiresAt: Infinity, ttlSec: 600 });
    const r = await issuePairCode(d, { userId: USER, deviceId: DEVICE, subUrl: SUB });
    assert.equal(r.code, "33333333");
    assert.equal(store.data.get("paircode:22222222").value, "someone else's");
  });

  test("five collisions in a row throw (and nothing is overwritten)", async () => {
    const { d, store } = deps({ randomInt: seq([0]) });
    store.data.set("paircode:22222222", { value: "taken", expiresAt: Infinity, ttlSec: 600 });
    await assert.rejects(issuePairCode(d, { userId: USER, deviceId: DEVICE, subUrl: SUB }), /no free code/);
    assert.equal(store.data.get("paircode:22222222").value, "taken");
    assert.equal(store.log.filter(([op]) => op === "putNew").length, 5);
  });

  test("bad input: nothing limited, nothing stored", async () => {
    const { d, store, limiter } = deps();
    for (const input of [
      { userId: "", deviceId: DEVICE, subUrl: SUB },
      { userId: "*", deviceId: DEVICE, subUrl: SUB },
      { userId: "x".repeat(400), deviceId: DEVICE, subUrl: SUB },
      { userId: USER, deviceId: "", subUrl: SUB },
      { userId: USER, deviceId: "a/b", subUrl: SUB },
      { userId: USER, deviceId: DEVICE, subUrl: "" },
      { userId: USER, deviceId: DEVICE, subUrl: `http://kovravpn.com/api/sub/${TOKEN}` },
      { userId: USER, deviceId: DEVICE, subUrl: `https://attacker.example/api/sub/${TOKEN}` },
      { userId: 5, deviceId: DEVICE, subUrl: SUB },
      null,
    ]) {
      assert.deepEqual(await issuePairCode(d, input), { ok: false, reason: "bad_input" }, JSON.stringify(input));
    }
    assert.equal(store.data.size, 0);
    assert.equal(limiter.calls.length, 0);
  });

  test("20 an hour per account; the 21st is rate_limited, another account is not", async () => {
    const { d, limiter, events } = deps();
    for (let i = 0; i < 20; i += 1) assert.equal((await issuePairCode(d, { userId: USER, deviceId: DEVICE, subUrl: SUB })).ok, true, `#${i + 1}`);
    const over = await issuePairCode(d, { userId: USER, deviceId: DEVICE, subUrl: SUB });
    assert.deepEqual(over, { ok: false, reason: "rate_limited", retryAfter: 3600 });
    assert.deepEqual(limiter.calls.at(-1), [`pair-code-issue:${USER}`, 20, 3600]);
    assert.equal((await issuePairCode(d, { userId: "tg_200", deviceId: DEVICE, subUrl: SUB })).ok, true);
    assert.deepEqual(events.filter((e) => e.event === "pair_code_issue_limited"), [{ event: "pair_code_issue_limited", userId: USER }]);
  });

  test("a limiter's own retryAfter is passed on, rounded up; a nonsense one becomes the window", async () => {
    const a = deps({ limiter: { limit: async () => ({ ok: false, retryAfter: 12.2 }), calls: [] } });
    assert.deepEqual(await issuePairCode(a.d, { userId: USER, deviceId: DEVICE, subUrl: SUB }), { ok: false, reason: "rate_limited", retryAfter: 13 });
    const b = deps({ limiter: { limit: async () => ({ ok: false, retryAfter: -1 }), calls: [] } });
    assert.deepEqual(await issuePairCode(b.d, { userId: USER, deviceId: DEVICE, subUrl: SUB }), { ok: false, reason: "rate_limited", retryAfter: 3600 });
  });

  test("a limiter fault lets the code through with one warning", async () => {
    const { d, events } = deps({
      limiter: {
        limit: async () => {
          throw new Error(`upstash: fetch failed for ${SUB}`);
        },
        calls: [],
      },
    });
    const r = await issuePairCode(d, { userId: USER, deviceId: DEVICE, subUrl: SUB });
    assert.equal(r.ok, true);
    const down = events.filter((e) => e.event === "pair_code_limiter_down");
    assert.equal(down.length, 1);
    assert.equal(down[0].scope, "issue");
    assert.doesNotMatch(down[0].error, /kovravpn|0123456789abcdef/, "the link in the error is cut out");
  });

  test("a store failure rejects (the route answers 500)", async () => {
    const store = {
      async putNew() {
        throw new Error("ECONNRESET");
      },
      async take() {
        return null;
      },
    };
    const { d } = deps({ store });
    await assert.rejects(issuePairCode(d, { userId: USER, deviceId: DEVICE, subUrl: SUB }), /ECONNRESET/);
  });

  test("a logger that throws does not cost the code", async () => {
    const { d } = deps();
    const r = await issuePairCode(
      {
        ...d,
        log: () => {
          throw new Error("log down");
        },
      },
      { userId: USER, deviceId: DEVICE, subUrl: SUB },
    );
    assert.equal(r.ok, true);
  });
});

describe("redeemPairCode", () => {
  async function issued(over = {}) {
    const ctx = deps(over);
    const r = await issuePairCode(ctx.d, { userId: USER, deviceId: DEVICE, subUrl: SUB });
    assert.equal(r.ok, true);
    ctx.events.length = 0;
    return { ...ctx, code: r.code, display: r.display };
  }

  test("the code gives the link once; the key is gone after", async () => {
    const { d, store, code } = await issued();
    assert.deepEqual(await redeemPairCode(d, code), { status: "ready", subUrl: SUB, userId: USER, deviceId: DEVICE });
    assert.equal(store.data.has(`paircode:${code}`), false);
  });

  test("the displayed form, lower case and spaces work the same", async () => {
    for (const spell of [(c) => formatPairCode(c), (c) => c.toLowerCase(), (c) => ` ${c.slice(0, 4)} ${c.slice(4)} `]) {
      const { d, code } = await issued();
      assert.equal((await redeemPairCode(d, spell(code))).status, "ready");
    }
  });

  test("a second redeem of the same code: not_found", async () => {
    const { d, code } = await issued();
    assert.equal((await redeemPairCode(d, code)).status, "ready");
    assert.deepEqual(await redeemPairCode(d, code), { status: "not_found" });
  });

  test("two parallel redeems: exactly one ready", async () => {
    const { d, code } = await issued();
    const results = await Promise.all([redeemPairCode(d, code), redeemPairCode(d, code), redeemPairCode(d, formatPairCode(code))]);
    assert.equal(results.filter((r) => r.status === "ready").length, 1);
    assert.equal(results.filter((r) => r.status === "not_found").length, 2);
  });

  test("the redeem reads and deletes in one step (the script's GETDEL), never a separate read", async () => {
    const { d, store, code } = await issued();
    store.log.length = 0;
    await redeemPairCode(d, code);
    assert.deepEqual(store.log, [["redeem", `paircode:${code}`, `paircode:done:${code}`, null, 300]]);
  });

  test("expired: not_found, the same answer as wrong", async () => {
    const { d, clock, code } = await issued();
    clock.now += 600_000;
    assert.deepEqual(await redeemPairCode(d, code), { status: "not_found" });
    const fresh = await issued();
    fresh.clock.now += 599_999;
    assert.equal((await redeemPairCode(fresh.d, fresh.code)).status, "ready", "a code is good to its last millisecond");
  });

  test("a wrong code: not_found", async () => {
    const { d, code } = await issued({ randomInt: seq([0, 1, 2, 3, 4, 5, 6, 7]) });
    assert.equal(code, "23456789");
    assert.deepEqual(await redeemPairCode(d, "23456788"), { status: "not_found" });
    assert.equal((await redeemPairCode(d, code)).status, "ready", "a wrong guess does not burn the real code");
  });

  test("malformed: bad_code, and the store is not asked", async () => {
    const { d, store } = deps();
    for (const raw of ["", "K7QM2XP0", "K7QM2XP", "K7QM2XPAA", undefined, null, 12345678, { code: "K7QM2XPA" }]) {
      assert.deepEqual(await redeemPairCode(d, raw), { status: "bad_code" }, JSON.stringify(raw));
    }
    assert.deepEqual(store.log, []);
  });

  test("an unreadable record or a foreign host in it: not_found, logged as corrupt", async () => {
    for (const value of ["garbage", JSON.stringify({ subUrl: "https://attacker.example/x", userId: USER, deviceId: DEVICE, createdAt: 1 })]) {
      const { d, store, events } = deps();
      store.data.set("paircode:23456789", { value, expiresAt: Infinity, ttlSec: 600 });
      assert.deepEqual(await redeemPairCode(d, "23456789"), { status: "not_found" });
      assert.deepEqual(events, [{ event: "pair_code_redeem", outcome: "corrupt" }]);
      assert.equal(store.data.has("paircode:23456789"), false, "taken out anyway");
    }
  });

  test("a store failure rejects (the route answers 503)", async () => {
    const store = {
      async putNew() {
        return true;
      },
      async redeem() {
        throw new Error("ECONNRESET");
      },
    };
    await assert.rejects(redeemPairCode({ store, log: () => {} }, "23456789"), /ECONNRESET/);
  });

  test("the outcome classes as logged", async () => {
    const { d, events, code } = await issued();
    await redeemPairCode(d, "nope");
    await redeemPairCode(d, "23456788");
    await redeemPairCode(d, code);
    assert.deepEqual(events, [
      { event: "pair_code_redeem", outcome: "bad_code" },
      { event: "pair_code_redeem", outcome: "not_found" },
      { event: "pair_code_redeem", outcome: "ready", userId: USER },
    ]);
  });
});

describe("redeemPairCode with a request id (v1.1)", () => {
  async function issued(over = {}) {
    const ctx = deps(over);
    const r = await issuePairCode(ctx.d, { userId: USER, deviceId: DEVICE, subUrl: SUB });
    assert.equal(r.ok, true);
    ctx.events.length = 0;
    ctx.store.log.length = 0;
    return { ...ctx, code: r.code, display: r.display };
  }

  /** The store's redeem step as the site asks it for `code`, with the id's hash or none. */
  const step = (code, id) => ["redeem", `paircode:${code}`, `paircode:done:${code}`, id === null ? null : sha256(id), 300];

  test("the redeem that takes the code leaves {subUrl, rid} under paircode:done:<CODE> for 300 s in the same step, then answers", async () => {
    const { d, store, code, events } = await issued();
    assert.deepEqual(await redeemPairCode(d, code, RID_A), { status: "ready", subUrl: SUB, userId: USER, deviceId: DEVICE });
    assert.deepEqual(store.log, [step(code, RID_A)], "one step takes the code and leaves the record");
    const done = store.data.get(`paircode:done:${code}`);
    assert.equal(done.ttlSec, 300);
    assert.deepEqual(JSON.parse(done.value), { subUrl: SUB, rid: sha256(RID_A) });
    assert.equal(store.data.has(`paircode:${code}`), false);
    assert.deepEqual(events, [{ event: "pair_code_redeem", outcome: "ready", userId: USER }]);
  });

  test("only the hash of the id is stored or handed to the store, never the id", async () => {
    const { d, store, code } = await issued();
    await redeemPairCode(d, code, RID_A);
    await redeemPairCode(d, code, RID_A);
    const everything = JSON.stringify([...store.data]) + JSON.stringify(store.log);
    assert.ok(!everything.includes(RID_A), everything);
    assert.ok(everything.includes(sha256(RID_A)));
  });

  test("the same id after the code is spent: the same link again, as `replayed`, and the record untouched", async () => {
    const { d, store, events, code, display } = await issued();
    await redeemPairCode(d, code, RID_A);
    const before = { ...store.data.get(`paircode:done:${code}`) };
    store.log.length = 0;
    events.length = 0;
    for (const spelling of [code, display, code.toLowerCase(), ` ${code.slice(0, 4)} ${code.slice(4)} `]) {
      assert.deepEqual(await redeemPairCode(d, spelling, RID_A), { status: "replayed", subUrl: SUB }, spelling);
    }
    assert.deepEqual(store.data.get(`paircode:done:${code}`), before, "a replay writes nothing");
    assert.deepEqual(store.log, Array(4).fill(step(code, RID_A)));
    assert.deepEqual(events, Array(4).fill({ event: "pair_code_redeem", outcome: "replayed" }), "not a second redeem, and no user id to count twice");
  });

  test("another id: not_found, exactly what a code that never existed gets", async () => {
    const { d, events, code } = await issued({ randomInt: seq([0, 1, 2, 3, 4, 5, 6, 7]) });
    await redeemPairCode(d, code, RID_A);
    events.length = 0;
    const other = await redeemPairCode(d, code, RID_B);
    const never = await redeemPairCode(d, "23456788", RID_B);
    assert.deepEqual(other, { status: "not_found" });
    assert.deepEqual(other, never);
    assert.deepEqual(events, [
      { event: "pair_code_redeem", outcome: "not_found" },
      { event: "pair_code_redeem", outcome: "not_found" },
    ]);
    assert.deepEqual(await redeemPairCode(d, code, RID_A), { status: "replayed", subUrl: SUB }, "a wrong id does not spoil the record");
  });

  test("no id after the code is spent: not_found, the step asked without a hash", async () => {
    const { d, store, code } = await issued();
    await redeemPairCode(d, code, RID_A);
    store.log.length = 0;
    assert.deepEqual(await redeemPairCode(d, code), { status: "not_found" });
    assert.deepEqual(await redeemPairCode(d, code, undefined), { status: "not_found" });
    assert.deepEqual(store.log, [step(code, null), step(code, null)]);
  });

  test("a malformed id is no id: the redeem still works, leaves no record, and cannot replay", async () => {
    for (const bad of ["short", `${RID_A}=`, 43, { id: RID_A }, null, ""]) {
      const { d, store, code } = await issued();
      assert.equal((await redeemPairCode(d, code, bad)).status, "ready", JSON.stringify(bad));
      assert.equal(store.data.has(`paircode:done:${code}`), false, JSON.stringify(bad));
      assert.deepEqual(await redeemPairCode(d, code, bad), { status: "not_found" }, JSON.stringify(bad));
      assert.deepEqual(store.log, [step(code, null), step(code, null)], JSON.stringify(bad));
    }
  });

  test("a malformed id after a good redeem is ignored too: not_found", async () => {
    const { d, code } = await issued();
    await redeemPairCode(d, code, RID_A);
    assert.deepEqual(await redeemPairCode(d, code, `${RID_A}=`), { status: "not_found" });
    assert.deepEqual(await redeemPairCode(d, code, ` ${RID_A}`), { status: "not_found" });
  });

  test("a malformed code with an id: bad_code, the store is not asked", async () => {
    const { d, store } = deps();
    assert.deepEqual(await redeemPairCode(d, "K7QM2XP0", RID_A), { status: "bad_code" });
    assert.deepEqual(store.log, []);
  });

  test("the replay is good to 299.999 s and gone at 300 s", async () => {
    const { d, clock, code } = await issued();
    await redeemPairCode(d, code, RID_A);
    clock.now += 299_999;
    assert.equal((await redeemPairCode(d, code, RID_A)).status, "replayed");
    clock.now += 1;
    assert.deepEqual(await redeemPairCode(d, code, RID_A), { status: "not_found" });
  });

  test("replays do not extend the 300 s", async () => {
    const { d, store, clock, code } = await issued();
    await redeemPairCode(d, code, RID_A);
    const expiresAt = store.data.get(`paircode:done:${code}`).expiresAt;
    for (let i = 0; i < 29; i += 1) {
      clock.now += 10_000;
      assert.equal((await redeemPairCode(d, code, RID_A)).status, "replayed", `at ${(i + 1) * 10} s`);
      assert.equal(store.data.get(`paircode:done:${code}`).expiresAt, expiresAt);
    }
    clock.now += 10_000;
    assert.deepEqual(await redeemPairCode(d, code, RID_A), { status: "not_found" }, "300 s after the redeem, however many replays");
  });

  test("parallel redeems with different ids: exactly one ready, and only its id replays", async () => {
    const { d, code } = await issued();
    const ids = [RID_A, RID_B, RID_C];
    const results = await Promise.all(ids.map((id) => redeemPairCode(d, code, id)));
    const winners = results.flatMap((r, i) => (r.status === "ready" ? [ids[i]] : []));
    assert.equal(winners.length, 1);
    assert.equal(results.filter((r) => r.status === "not_found").length, 2);
    for (const id of ids) {
      assert.equal((await redeemPairCode(d, code, id)).status, id === winners[0] ? "replayed" : "not_found");
    }
  });

  test("parallel redeems with the same id: every one gets the link", async () => {
    const { d, code } = await issued();
    const results = await Promise.all([redeemPairCode(d, code, RID_A), redeemPairCode(d, code, RID_A), redeemPairCode(d, formatPairCode(code), RID_A)]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["ready", "replayed", "replayed"]);
    for (const r of results) assert.equal(r.subUrl, SUB);
  });

  test("a step whose answer was lost after it ran, retried by the store as the Upstash client does: the link (replayed), not not_found", async () => {
    // The step ran in Redis (the code is gone, its record written); its answer
    // never came back, so the client sent the same step again.
    const clock = { now: 1_000_000 };
    const inner = memStore(clock);
    let lost = 0;
    const store = {
      ...inner,
      async redeem(...args) {
        const first = await inner.redeem(...args);
        if (lost > 0) return first;
        lost += 1;
        return inner.redeem(...args);
      },
    };
    const { d, events, code } = await issued({ clock, store });
    assert.deepEqual(await redeemPairCode(d, code, RID_A), { status: "replayed", subUrl: SUB });
    assert.deepEqual(events, [{ event: "pair_code_redeem", outcome: "replayed" }]);
    assert.equal(inner.data.has(`paircode:${code}`), false);
  });

  test("a step that ran but whose answer never came back (the store rejects): the next redeem with the same id gets the link", async () => {
    const clock = { now: 1_000_000 };
    const inner = memStore(clock);
    let calls = 0;
    const store = {
      ...inner,
      async redeem(...args) {
        const answer = await inner.redeem(...args);
        calls += 1;
        if (calls === 1) throw new TypeError("fetch failed");
        return answer;
      },
    };
    const { d, code } = await issued({ clock, store });
    await assert.rejects(redeemPairCode(d, code, RID_A), /fetch failed/);
    assert.equal(inner.data.has(`paircode:${code}`), false, "the code was spent by the step whose answer was lost");
    assert.deepEqual(await redeemPairCode(d, code, RID_A), { status: "replayed", subUrl: SUB }, "the ladder's next name, or the next press");
    assert.deepEqual(await redeemPairCode(d, code, RID_B), { status: "not_found" }, "and nobody else's");
  });

  test("the slow first name: its step still in flight, the next name's redeem with the same id runs first; both get the link", async () => {
    // kovravpn.com is silent past the app's 8 s, the app asks the next name
    // with the same id; the first request reaches Redis only after that.
    const clock = { now: 1_000_000 };
    const inner = memStore(clock);
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    let first = true;
    const store = {
      ...inner,
      async redeem(...args) {
        if (first) {
          first = false;
          await held;
        }
        return inner.redeem(...args);
      },
    };
    const { d, code } = await issued({ clock, store });
    const slow = redeemPairCode(d, code, RID_A);
    const next = await redeemPairCode(d, formatPairCode(code), RID_A);
    assert.deepEqual(next, { status: "ready", subUrl: SUB, userId: USER, deviceId: DEVICE });
    release();
    assert.deepEqual(await slow, { status: "replayed", subUrl: SUB });
  });

  test("the record belongs to the latest redeem of a code: a code issued again and redeemed with a new id", async () => {
    const draws = [0, 1, 2, 3, 4, 5, 6, 7];
    const { d, code } = await issued({ randomInt: seq(draws) });
    await redeemPairCode(d, code, RID_A);
    const again = await issuePairCode(d, { userId: "tg_200", deviceId: DEVICE, subUrl: `https://kovravpn.com/api/sub/${TOKEN}` });
    assert.equal(again.code, code, "the same code string, drawn again after the first was spent");
    assert.equal((await redeemPairCode(d, code, RID_B)).status, "ready");
    assert.deepEqual(await redeemPairCode(d, code, RID_A), { status: "not_found" }, "the earlier id has no claim on the new link");
    assert.deepEqual(await redeemPairCode(d, code, RID_B), { status: "replayed", subUrl: `https://kovravpn.com/api/sub/${TOKEN}` });
  });

  test("a replay record the step could not write: the answer still goes out, one warning without secrets", async () => {
    const clock = { now: 1_000_000 };
    const inner = memStore(clock);
    const store = {
      ...inner,
      // As the script answers when cjson or the record's SET failed: the code taken, 0.
      async redeem(codeKey, doneKey, _rid, ttlSec) {
        const r = await inner.redeem(codeKey, doneKey, null, ttlSec);
        return r.kind === "taken" ? { ...r, replaySaved: false } : r;
      },
    };
    const { d, events, code } = await issued({ clock, store });
    assert.deepEqual(await redeemPairCode(d, code, RID_A), { status: "ready", subUrl: SUB, userId: USER, deviceId: DEVICE });
    assert.deepEqual(events, [{ event: "pair_code_replay_unsaved" }, { event: "pair_code_redeem", outcome: "ready", userId: USER }]);
    assert.equal(inner.data.has(`paircode:${code}`), false, "the code is spent all the same");
    assert.deepEqual(await redeemPairCode(d, code, RID_A), { status: "not_found" }, "and with no record there is nothing to replay");
  });

  test("no warning when there was no id to keep a record for", async () => {
    const clock = { now: 1_000_000 };
    const inner = memStore(clock);
    const store = {
      ...inner,
      async redeem(...args) {
        const r = await inner.redeem(...args);
        return r.kind === "taken" ? { ...r, replaySaved: false } : r;
      },
    };
    const { d, events, code } = await issued({ clock, store });
    assert.equal((await redeemPairCode(d, code)).status, "ready");
    assert.deepEqual(events, [{ event: "pair_code_redeem", outcome: "ready", userId: USER }]);
  });

  test("a store that answers a replay record to a redeem without an id is not believed: not_found", async () => {
    const store = {
      async putNew() {
        return true;
      },
      async redeem() {
        return { kind: "done", value: JSON.stringify({ subUrl: SUB, rid: sha256(RID_A) }) };
      },
    };
    const events = [];
    assert.deepEqual(await redeemPairCode({ store, log: (e) => events.push(e) }, "23456789"), { status: "not_found" });
    assert.deepEqual(events, [{ event: "pair_code_redeem", outcome: "not_found" }]);
  });

  test("an unreadable replay record or a foreign link in it: not_found, logged as corrupt", async () => {
    for (const value of ["garbage", JSON.stringify({ subUrl: "https://attacker.example/x", rid: sha256(RID_A) }), JSON.stringify({ subUrl: SUB, rid: RID_A })]) {
      const { d, store, events } = deps();
      store.data.set("paircode:done:23456789", { value, expiresAt: Infinity, ttlSec: 300 });
      assert.deepEqual(await redeemPairCode(d, "23456789", RID_A), { status: "not_found" }, value);
      assert.deepEqual(events, [{ event: "pair_code_redeem", outcome: "corrupt" }], value);
    }
  });

  test("a v1 redeem without an id is v1 exactly: one step without a hash, no record", async () => {
    const { d, store, code } = await issued();
    assert.equal((await redeemPairCode(d, code)).status, "ready");
    assert.deepEqual(store.log, [step(code, null)]);
    assert.deepEqual([...store.data.keys()], []);
  });
});

describe("redeemRetryAfter", () => {
  test("10 a minute per address; the 11th waits; another address does not", async () => {
    const lim = memLimiter();
    const events = [];
    const log = (e) => events.push(e);
    for (let i = 0; i < 10; i += 1) assert.equal(await redeemRetryAfter(lim.limit, "a", log), null, `#${i + 1}`);
    assert.equal(await redeemRetryAfter(lim.limit, "a", log), 60);
    assert.equal(await redeemRetryAfter(lim.limit, "b", log), null);
    assert.deepEqual(events, [{ event: "pair_code_redeem", outcome: "rate_limited" }]);
    assert.deepEqual(lim.calls[0], ["pair-code-redeem:min:a", 10, 60]);
    assert.deepEqual(lim.calls[1], ["pair-code-redeem:day:a", 60, 86400]);
  });

  test("60 a day per address, whatever the minutes", async () => {
    const lim = memLimiter();
    lim.counts.set("pair-code-redeem:day:a", 60);
    assert.equal(await redeemRetryAfter(lim.limit, "a", () => {}), 86400);
  });

  test("a limiter fault is not an overrun, one warning without the address", async () => {
    const events = [];
    const r = await redeemRetryAfter(
      async () => {
        throw new Error("down");
      },
      "addr-1",
      (e) => events.push(e),
    );
    assert.equal(r, null);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "pair_code_limiter_down");
    assert.equal(events[0].scope, "redeem");
    assert.doesNotMatch(JSON.stringify(events), /addr-1/);
  });
});

describe("redeemRequestRefusal", () => {
  const h = (o) => new Headers(o);

  test("the app's request (JSON, no Origin) is served", () => {
    for (const type of ["application/json", "application/json; charset=utf-8", "Application/JSON", " application/json ;charset=UTF-8"]) {
      assert.equal(redeemRequestRefusal(h({ "content-type": type })), null, type);
    }
  });

  test("anything but JSON is not_json: a no-cors fetch, a form, no type at all, a JSON look-alike", () => {
    for (const type of [
      "text/plain;charset=UTF-8",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
      "application/json-patch+json",
      "application/jsonx",
      "text/plain; application/json",
      "",
    ]) {
      assert.equal(redeemRequestRefusal(h({ "content-type": type })), "not_json", JSON.stringify(type));
    }
    assert.equal(redeemRequestRefusal(h({})), "not_json");
  });

  test("a page of another site is foreign_origin, JSON or not", () => {
    for (const origin of [
      "https://evil.example",
      "null",
      "http://kovravpn.com",
      "https://kovravpn.com:8443",
      "https://kovravpn.com.evil.example",
      "https://evil.example/https://kovravpn.com",
      "",
    ]) {
      assert.equal(redeemRequestRefusal(h({ "content-type": "application/json", origin })), "foreign_origin", JSON.stringify(origin));
      assert.equal(redeemRequestRefusal(h({ "content-type": "text/plain", origin })), "foreign_origin", JSON.stringify(origin));
    }
  });

  test("a page of our own sites is served like the app", () => {
    for (const host of PAIR_SUB_HOSTS) {
      assert.equal(redeemRequestRefusal(h({ "content-type": "application/json", origin: `https://${host}` })), null, host);
    }
    assert.equal(redeemRequestRefusal(h({ "content-type": "application/json", origin: "https://KOVRAVPN.COM" })), null);
    assert.equal(redeemRequestRefusal(h({ "content-type": "text/plain", origin: "https://kovravpn.com" })), "not_json");
  });
});

describe("nothing secret in logs", () => {
  test("a whole issue → redeem → reuse round logs only events, user ids and outcomes", async () => {
    const ctx = deps();
    const r = await issuePairCode(ctx.d, { userId: USER, deviceId: DEVICE, subUrl: SUB });
    await redeemPairCode(ctx.d, r.display);
    await redeemPairCode(ctx.d, r.code);
    await redeemPairCode(ctx.d, "garbage");
    const text = JSON.stringify(ctx.events);
    for (const secret of [r.code, r.display, SUB, TOKEN, DEVICE, "kovravpn.com"]) assert.ok(!text.includes(secret), secret);
    for (const e of ctx.events) {
      assert.deepEqual(Object.keys(e).filter((k) => !["event", "userId", "outcome"].includes(k)), [], JSON.stringify(e));
    }
  });

  test("a v1.1 round (redeem with an id, replay, another id, a malformed one) logs no id and no hash", async () => {
    const ctx = deps();
    const r = await issuePairCode(ctx.d, { userId: USER, deviceId: DEVICE, subUrl: SUB });
    await redeemPairCode(ctx.d, r.display, RID_A);
    await redeemPairCode(ctx.d, r.code, RID_A);
    await redeemPairCode(ctx.d, r.code, RID_B);
    await redeemPairCode(ctx.d, r.code, `${RID_C}=`);
    const text = JSON.stringify(ctx.events);
    for (const secret of [r.code, r.display, SUB, TOKEN, DEVICE, RID_A, RID_B, RID_C, sha256(RID_A), sha256(RID_B), "kovravpn.com"]) {
      assert.ok(!text.includes(secret), secret);
    }
    assert.deepEqual(
      ctx.events.map((e) => e.outcome ?? e.event),
      ["pair_code_issued", "ready", "replayed", "not_found", "not_found"],
    );
    for (const e of ctx.events) {
      assert.deepEqual(Object.keys(e).filter((k) => !["event", "userId", "outcome"].includes(k)), [], JSON.stringify(e));
    }
  });

  test("the default logger writes one tagged JSON line", async () => {
    const lines = [];
    const saved = { info: console.info, warn: console.warn };
    console.info = (...a) => lines.push(["info", ...a]);
    console.warn = (...a) => lines.push(["warn", ...a]);
    try {
      pc.defaultPairCodeLog({ event: "pair_code_issued", userId: USER });
      pc.defaultPairCodeLog({ event: "pair_code_limiter_down", scope: "redeem", error: "x" });
      pc.defaultPairCodeLog({ event: "pair_code_replay_unsaved" });
      pc.defaultPairCodeLog({ event: "pair_code_redeem", outcome: "replayed" });
    } finally {
      Object.assign(console, saved);
    }
    assert.deepEqual(lines, [
      ["info", `[pair-code] {"event":"pair_code_issued","userId":"${USER}"}`],
      ["warn", '[pair-code] {"event":"pair_code_limiter_down","scope":"redeem","error":"x"}'],
      ["warn", '[pair-code] {"event":"pair_code_replay_unsaved"}'],
      ["info", '[pair-code] {"event":"pair_code_redeem","outcome":"replayed"}'],
    ]);
  });

  test("redactForLog cuts links, codes, uuids and tokens out of an error", () => {
    const err = new Error(`ERR on SET paircode:K7QM2XPA {"subUrl":"${SUB}","deviceId":"${DEVICE}"} K7QM-2XPA ${TOKEN}`);
    const out = redactForLog(err);
    for (const secret of ["K7QM2XPA", "K7QM-2XPA", SUB, TOKEN, DEVICE, "kovravpn.com"]) assert.ok(!out.includes(secret), `${secret} in ${out}`);
    assert.match(out, /^Error: ERR on SET/);
    assert.equal(redactForLog("ECONNREFUSED"), "ECONNREFUSED", "an ordinary word is left alone");
    assert.equal(redactForLog(42), "number");
    assert.ok(redactForLog(new Error("x".repeat(1000))).length <= 301);
  });

  test("redactForLog cuts request ids and their hashes out too", () => {
    const rid = sha256(RID_A);
    const out = redactForLog(new Error(`ERR SET paircode:done:K7QM2XPA {"rid":"${rid}"} id=${RID_A} -${RID_B}- (${RID_C})`));
    for (const secret of [RID_A, RID_B, RID_C, rid, "K7QM2XPA"]) assert.ok(!out.includes(secret), `${secret} in ${out}`);
    assert.match(out, /^Error: ERR SET /);
    assert.equal(redactForLog(new Error("UpstashError: fetch failed")), "Error: UpstashError: fetch failed", "short words stay");
  });
});

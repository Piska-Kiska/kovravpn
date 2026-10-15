// tests/client-ip.test.mjs — run: npm test
//
// Audit 15.10.2026, item 3: every per-address limit (`login:<ip>`,
// `register:<ip>`, `reg_ip:<ip>` for the welcome bonus, `forgot:<ip>` ...)
// was keyed on the full client address. An IPv6 line holds a whole /64 and
// the device picks any address in it, so one person had an endless supply of
// fresh buckets. Now an IPv6 client counts by its /64; IPv4 is unchanged.
//
// Addresses are from the documentation ranges (RFC 5737, RFC 3849).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import "./support/load-ts.mjs";

const { rateLimitSubject } = await import("../src/lib/client-ip.ts");
const { getClientIp } = await import("../src/lib/ratelimit.ts");

const req = (headers) => new Request("https://kovra.test/api/auth/login", { method: "POST", headers });

describe("rateLimitSubject", () => {
  test("IPv4 stays as it is", () => {
    assert.equal(rateLimitSubject("198.51.100.7"), "198.51.100.7");
    assert.equal(rateLimitSubject(" 203.0.113.9 "), "203.0.113.9");
  });

  test("two addresses in one /64 share a key", () => {
    const a = rateLimitSubject("2001:db8:4010:c05::8a");
    const b = rateLimitSubject("2001:db8:4010:c05:ffff:1:2:3");
    assert.equal(a, "2001:db8:4010:c05::");
    assert.equal(a, b);
  });

  test("neighbouring /64 networks stay apart", () => {
    assert.notEqual(rateLimitSubject("2001:db8:4010:c05::1"), rateLimitSubject("2001:db8:4010:c06::1"));
  });

  test("case, leading zeros and the :: shorthand do not change the key", () => {
    const full = rateLimitSubject("2001:0DB8:0000:0001:0000:0000:0000:0001");
    assert.equal(full, "2001:db8:0:1::");
    assert.equal(rateLimitSubject("2001:db8:0:1::abcd"), full);
  });

  test(":: at either end", () => {
    assert.equal(rateLimitSubject("::1"), "0:0:0:0::");
    assert.equal(rateLimitSubject("::"), "0:0:0:0::");
    assert.equal(rateLimitSubject("2001:db8::"), "2001:db8:0:0::");
  });

  test("an IPv4-mapped address counts as that IPv4 address", () => {
    assert.equal(rateLimitSubject("::ffff:198.51.100.7"), "198.51.100.7");
    assert.equal(rateLimitSubject("::FFFF:c633:6407"), "198.51.100.7");
  });

  test("NAT64 is IPv6 with an IPv4 tail: counted by the /64", () => {
    assert.equal(rateLimitSubject("64:ff9b::198.51.100.7"), "64:ff9b:0:0::");
  });

  test("junk is kept as is, cut to 45 characters", () => {
    assert.equal(rateLimitSubject("unknown"), "unknown");
    assert.equal(rateLimitSubject("1::2::3"), "1::2::3");
    assert.equal(rateLimitSubject("1:2:3:4:5:6:7:8:9"), "1:2:3:4:5:6:7:8:9");
    assert.equal(rateLimitSubject("::ffff:300.1.1.1"), "::ffff:300.1.1.1");
    assert.equal(rateLimitSubject("a:".repeat(40)).length, 45);
    assert.equal(rateLimitSubject("x".repeat(500)).length, 45);
  });
});

describe("getClientIp", () => {
  test("first x-forwarded-for entry, IPv4 unchanged", () => {
    assert.equal(getClientIp(req({ "x-forwarded-for": "198.51.100.7, 203.0.113.1" })), "198.51.100.7");
  });

  test("an IPv6 client comes back as its /64", () => {
    const one = getClientIp(req({ "x-forwarded-for": "2001:db8:1:2:aaaa::1" }));
    const other = getClientIp(req({ "x-forwarded-for": "2001:db8:1:2:bbbb::9, 203.0.113.1" }));
    assert.equal(one, "2001:db8:1:2::");
    assert.equal(one, other);
  });

  test("x-real-ip when there is no chain, unknown when nothing", () => {
    assert.equal(getClientIp(req({ "x-real-ip": "2001:db8:5:6::7" })), "2001:db8:5:6::");
    assert.equal(getClientIp(req({})), "unknown");
  });
});

// tests/exit-ip.test.mjs — run: npm test
//
// The app's tunnel check (src/lib/exit-ip.ts, /api/exit-ip and
// /api/tools/whoami): the shape the app's probe.rs parses, the address it
// carries, and that no answer is ever cached.
//
// Pinned here:
//   * `{"ip":"..."}` with the first x-forwarded-for entry, else x-real-ip;
//   * "::ffff:192.0.2.1" comes back as "192.0.2.1", IPv6 as it is;
//   * anything that is not an address is `{"ip":null}`, never the junk;
//   * both routes answer GET with the body and HEAD without one, no-store;
//   * neither route touches Redis or logs anything.
//
// Every address below is from the documentation ranges.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import "./support/load-ts.mjs";

const { exitIpFrom, exitIpBody, EXIT_IP_HEADERS } = await import("../src/lib/exit-ip.ts");
const { NextRequest } = await import("next/server");
const routes = {
  "exit-ip": await import("../src/app/api/exit-ip/route.ts"),
  "tools/whoami": await import("../src/app/api/tools/whoami/route.ts"),
};

const headersOf = (map) => ({ get: (name) => map[name.toLowerCase()] ?? null });

describe("exitIpFrom", () => {
  test("the first x-forwarded-for entry", () => {
    assert.equal(exitIpFrom(headersOf({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
    assert.equal(exitIpFrom(headersOf({ "x-forwarded-for": " 203.0.113.9 , 198.51.100.7" })), "203.0.113.9");
    assert.equal(exitIpFrom(headersOf({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.7" })), "203.0.113.9");
  });

  test("x-real-ip when there is no x-forwarded-for", () => {
    assert.equal(exitIpFrom(headersOf({ "x-real-ip": "198.51.100.7" })), "198.51.100.7");
    assert.equal(exitIpFrom(headersOf({ "x-forwarded-for": " ", "x-real-ip": "198.51.100.7" })), "198.51.100.7");
  });

  test("IPv6 as it is, a mapped IPv4 unwrapped", () => {
    assert.equal(exitIpFrom(headersOf({ "x-forwarded-for": "2001:db8::1" })), "2001:db8::1");
    assert.equal(exitIpFrom(headersOf({ "x-forwarded-for": "::ffff:203.0.113.9" })), "203.0.113.9");
    assert.equal(exitIpFrom(headersOf({ "x-forwarded-for": "::FFFF:203.0.113.9" })), "203.0.113.9");
  });

  test("anything that is not an address is null", () => {
    for (const map of [
      {},
      { "x-forwarded-for": "" },
      { "x-forwarded-for": "unknown" },
      { "x-forwarded-for": "203.0.113.999" },
      { "x-forwarded-for": "203.0.113.9:443" },
      { "x-forwarded-for": "<script>" },
      { "x-forwarded-for": "2001:db8::1".repeat(10) },
      { "x-real-ip": "example.com" },
      { "x-forwarded-for": "junk", "x-real-ip": "198.51.100.7" },
    ]) {
      assert.equal(exitIpFrom(headersOf(map)), null, JSON.stringify(map));
    }
  });

  test("the body is exactly what the app parses", () => {
    assert.equal(exitIpBody(headersOf({ "x-forwarded-for": "203.0.113.9" })), '{"ip":"203.0.113.9"}');
    assert.equal(exitIpBody(headersOf({})), '{"ip":null}');
  });
});

describe("the routes", () => {
  for (const [path, route] of Object.entries(routes)) {
    test(`/api/${path}: GET answers the address, never cached`, async () => {
      const req = new NextRequest(`https://kovravpn.com/api/${path}`, { headers: { "x-forwarded-for": "203.0.113.9" } });
      const res = route.GET(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.match(res.headers.get("content-type"), /^application\/json/);
      assert.deepEqual(await res.json(), { ip: "203.0.113.9" });
    });

    test(`/api/${path}: HEAD answers without a body`, async () => {
      const res = route.HEAD();
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.equal(await res.text(), "");
    });

    test(`/api/${path}: no database, no log line`, () => {
      const source = readFileSync(new URL(`../src/app/api/${path}/route.ts`, import.meta.url), "utf8");
      assert.doesNotMatch(source, /redis|console\./);
    });
  }

  test("the shared headers say no-store", () => {
    assert.equal(EXIT_IP_HEADERS["Cache-Control"], "no-store");
  });

  test("the helper itself never logs", () => {
    const source = readFileSync(new URL("../src/lib/exit-ip.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /console\.|redis/);
  });
});

// tests/security-headers.test.mjs — run: npm test
//
// Audit 15.10.2026, item 5: the site sent no header against framing, so the
// sign-in and the cabinet could be laid under a decoy page and clicked
// through it. next.config.ts now gives every page frame-ancestors (the site
// and Telegram, for the Mini App), nosniff and a referrer policy.
//
// The headers of a path are worked out the way Next.js applies the rules: in
// order, each matching rule sets its headers. Each source is compiled by
// Next's own buildCustomRoute, the regex that goes into the routes manifest:
// raw path-to-regexp in strict mode would say `/:path*` misses the bare `/`,
// which the manifest regex matches.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import "./support/load-ts.mjs";

const { buildCustomRoute } = createRequire(import.meta.url)("next/dist/lib/build-custom-route");
const { default: nextConfig } = await import("../next.config.ts");
const rules = await nextConfig.headers();

/** The headers Next.js would send for `path`. */
function headersOf(path) {
  const out = {};
  for (const rule of rules) {
    if (!new RegExp(buildCustomRoute("header", rule).regex).test(path)) continue;
    for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
}

describe("every page", () => {
  for (const path of ["/", "/login", "/register", "/dashboard", "/tg", "/add/AbCdEf123456", "/p/AbCdEf123456", "/guides/vless-reality-protocol", "/api/auth/login"]) {
    test(`${path}: framed only by us and Telegram; nosniff; origin-only referrer`, () => {
      const h = headersOf(path);
      assert.match(h["Content-Security-Policy"] ?? "", /^frame-ancestors 'self' /);
      assert.equal(h["X-Content-Type-Options"], "nosniff");
      assert.equal(h["Referrer-Policy"], "strict-origin-when-cross-origin");
    });
  }

  test("the Mini App may be framed by Telegram Web", () => {
    assert.match(headersOf("/tg")["Content-Security-Policy"], / https:\/\/web\.telegram\.org( |$)/);
  });

  test("negative: no wildcard, no plain http, nobody but the listed hosts", () => {
    const sources = headersOf("/dashboard")["Content-Security-Policy"].replace(/^frame-ancestors /, "").split(" ");
    for (const s of sources) {
      assert.ok(s === "'self'" || /^https:\/\/(\*\.)?(web\.)?telegram\.org$/.test(s), `unexpected frame ancestor ${s}`);
    }
  });

  test("no X-Frame-Options: it would override the list for Telegram Web in some browsers", () => {
    for (const rule of rules) assert.ok(!rule.headers.some((h) => h.key === "X-Frame-Options"));
  });
});

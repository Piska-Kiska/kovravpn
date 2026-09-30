// tests/vpn-host.test.mjs — run: npm test
//
// KS-8: src/lib/xpanel.ts and src/lib/inbound-resolver.ts fell back to
// panel.proxysvpn.com when VPN_SERVER_HOST / VPN_HOST were unset. That name
// belongs to ProxysVPN and pointed at an address released to the hoster, so
// a missing variable would have sent Kovra users to whoever holds it now.
// The host now comes from the environment only (src/lib/vpn-host.ts), and
// no source file keeps a quoted ProxysVPN host as a default.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { requiredVpnHost } = await import("../src/lib/vpn-host.ts");

test("the host comes from the variable, trimmed", () => {
  assert.equal(requiredVpnHost("VPN_HOST", { VPN_HOST: " edge.example.test " }), "edge.example.test");
  assert.equal(requiredVpnHost("VPN_SERVER_HOST", { VPN_SERVER_HOST: "203.0.113.10" }), "203.0.113.10");
});

test("unset or blank: an error naming the variable, never a default", () => {
  assert.throws(() => requiredVpnHost("VPN_HOST", {}), /VPN_HOST is not set/);
  assert.throws(() => requiredVpnHost("VPN_SERVER_HOST", { VPN_SERVER_HOST: "   " }), /VPN_SERVER_HOST is not set/);
  assert.throws(() => requiredVpnHost("VPN_HOST", { VPN_SERVER_HOST: "x" }), /VPN_HOST is not set/, "one variable does not stand in for the other");
});

test("no ProxysVPN host is left as a default in the link builders", () => {
  for (const file of [
    "src/lib/xpanel.ts",
    "src/lib/inbound-resolver.ts",
    "src/app/api/sub/[token]/happ/route.ts",
    "src/app/p/[token]/page.tsx",
  ]) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /["'`]https?:\/\/[a-z0-9.-]*proxysvpn\.com|["'`][a-z0-9.-]*proxysvpn\.com["'`]/, file);
  }
});

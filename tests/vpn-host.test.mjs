// tests/vpn-host.test.mjs — run: npm test
//
// KS-8: src/lib/xpanel.ts and src/lib/inbound-resolver.ts fell back to
// panel.proxysvpn.com when VPN_SERVER_HOST / VPN_HOST were unset. That name
// belongs to ProxysVPN and pointed at an address released to the hoster, so
// a missing variable would have sent Kovra users to whoever holds it now.
// The host now comes from the environment only (src/lib/vpn-host.ts), and
// no source file keeps a quoted ProxysVPN host as a default.

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { requiredVpnHost } = await import("../src/lib/vpn-host.ts");
const { buildAllProfilesForUuid } = await import("../src/lib/xray-subscription.ts");

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

test("the xray JSON feed leaves out a panel location it cannot build and keeps the rest (no 500)", async (t) => {
  // A static location (documentation address) and a panel one; VPN_HOST is unset.
  mem.reset();
  mem.store.set(
    "inbounds:registry",
    JSON.stringify([
      {
        key: "static-a",
        label: "A",
        enabled: true,
        priority: 0,
        source: "static",
        address: "203.0.113.10",
        port: 8443,
        serverName: "example.com",
        publicKey: "pk",
        shortId: "ab",
      },
      { key: "panel-b", label: "B", enabled: true, priority: 1, source: "panel", inboundId: 7 },
    ]),
  );
  const saved = process.env.VPN_HOST;
  delete process.env.VPN_HOST;
  t.after(() => {
    if (saved === undefined) delete process.env.VPN_HOST;
    else process.env.VPN_HOST = saved;
  });
  mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ success: true, obj: [{ id: 7, port: 443, settings: '{"clients":[]}', streamSettings: "{}" }] })),
  );
  const errors = [];
  mock.method(console, "error", (...args) => errors.push(args.join(" ")));
  t.after(() => mock.restoreAll());

  const profiles = await buildAllProfilesForUuid("0a1b2c3d-0000-4000-8000-00000000000a");
  assert.equal(profiles.length, 1, "the static location alone: no balancer, no throw");
  assert.equal(profiles[0].outbounds[0].settings.vnext[0].address, "203.0.113.10");
  assert.ok(errors.some((e) => e.includes("panel-b") && e.includes("VPN_HOST is not set")), errors.join("\n"));
});

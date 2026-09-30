// src/lib/vpn-host.ts
//
// The host clients connect to for panel-sourced inbounds, from the
// environment only (KS-8). Both panel helpers used to fall back to
// panel.proxysvpn.com, a ProxysVPN name whose address had been released to
// the hoster: with the variable unset, links would have pointed Kovra users
// at whoever holds that address now. There is no default on purpose; a
// missing variable fails the one link being built, loudly.
//
// Read at call time, not at import, so a missing variable never breaks the
// build or the routes that do not build panel links.

export type VpnHostVar = "VPN_HOST" | "VPN_SERVER_HOST";

/** The trimmed value of `name`, or an Error naming the variable. */
export function requiredVpnHost(name: VpnHostVar, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is not set: there is no address to build the link from, and no default on purpose`);
  return value;
}

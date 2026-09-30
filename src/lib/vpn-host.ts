// src/lib/vpn-host.ts
//
// The host clients connect to for panel-sourced inbounds, from the
// environment only (KS-8). Both panel helpers used to fall back to
// panel.proxysvpn.com, a ProxysVPN name whose address had been released to
// the hoster: with the variable unset, links would have pointed Kovra users
// at whoever holds that address now. There is no default on purpose; a
// missing variable fails every link to a panel-sourced location, loudly (an
// error in the log), and each feed leaves those locations out and keeps the
// rest: the base64 feed per line (sub/[token]/route.ts), the xray JSON feed
// per location (lib/xray-subscription.ts).
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

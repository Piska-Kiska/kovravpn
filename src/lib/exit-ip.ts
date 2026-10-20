// src/lib/exit-ip.ts
//
// The address a request came from, as the app's tunnel check reads it
// (`parse_exit_ip` in the app's probe.rs: `{"ip":"..."}`, one parser for
// every address on its ladder). Served at /api/exit-ip and
// /api/tools/whoami, the two addresses Kovra's brand.rs lists.
//
// Why the app asks: an answer proves bytes went out through the tunnel and
// came back, and the address is the node's exit. The app sends everything
// through the tunnel once the feed has said `routing-enable: false`
// (HAPP_UI in lib/sub-notices.ts), kovravpn.com included, so the answer is
// not the person's home address.
//
// Nothing is stored or logged: the answer is what any site the person opens
// sees anyway. No rate limit on purpose: every person on one node shares its
// exit address, so a per-address limit would lock out a whole node at once,
// and the answer costs no database call.
//
// Pure apart from `node:net`: tests load it under plain Node type stripping.

import { isIP } from "node:net";

/** The subset of Headers read here. */
export interface HeaderLike {
  get(name: string): string | null;
}

/** Longer than any address with its zone; a longer value is not one. */
const ADDRESS_MAX_LENGTH = 64;

const MAPPED_V4_RE = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** `value` as an address the app can parse, or null. "::ffff:192.0.2.1" comes back as "192.0.2.1". */
function addressOf(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (raw === "" || raw.length > ADDRESS_MAX_LENGTH) return null;
  const mapped = MAPPED_V4_RE.exec(raw);
  const ip = mapped ? mapped[1] : raw;
  return isIP(ip) === 0 ? null : ip;
}

/**
 * The client's address: the first `x-forwarded-for` entry, which the
 * platform writes itself and does not take from the client, else
 * `x-real-ip`; null when neither holds an address.
 */
export function exitIpFrom(headers: HeaderLike): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.trim() !== "") return addressOf(forwarded.split(",")[0]);
  return addressOf(headers.get("x-real-ip"));
}

/** Headers of every answer: never cached, so a cache never hands one person's exit to another. */
export const EXIT_IP_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

/** The body: `{"ip":"203.0.113.9"}`, or `{"ip":null}` when the address is unknown. */
export function exitIpBody(headers: HeaderLike): string {
  return JSON.stringify({ ip: exitIpFrom(headers) });
}

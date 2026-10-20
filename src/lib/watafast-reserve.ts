// src/lib/watafast-reserve.ts
//
// The reserve path of the app: nodes of our own protocol (WataFast) that the
// app falls back to when none of an account's locations connects. This module
// reads which nodes there are from a setting and shapes them for the signed
// manifest (lib/watafast-manifest.ts, payload field `reserve`).
//
// ── Why a setting and not the registry ──────────────────
// The registry (lib/inbounds.ts) is what the subscription is built from, and
// the subscription is read by apps that are not ours. A node of our own
// protocol must never turn up as a line there: no other app can use it, and
// its address is not something to hand to every client that asks. Kept apart,
// nothing that builds a subscription can reach these entries at all.
//
// `WATAFAST_RESERVE_NODES` is a JSON list, one object per node:
//
//   [{
//     "id": "r1",                          1-32 of [a-z0-9-], unique
//     "label": "Amsterdam",                optional: the place the app names
//                                          the node by, 1-40 characters
//     "flag": "🇳🇱",                         optional, only with `label`: one
//                                          country flag
//     "wire": 2,                           the version of the protocol the node
//                                          speaks, 1-255; there is no default
//     "server": "site.example:443",        the node's site: name and port
//     "addresses": ["203.0.113.5:443"],    optional, at most 8: where to
//                                          connect instead of resolving the name
//     "path": "/the/request/path",         the request that carries the session
//     "node_public_key": "<64 hex>",       the node's static public key
//     "look": "chrome",                    optional: "chrome" or "plain"
//     "udp": false                         optional: whether the node carries UDP
//   }]
//
// The names are the ones the protocol's own client reads its settings under
// (`server`, `addresses`, `path`, `node_public_key`, `look`), so the app hands
// an entry over as it came. Every value is held to the client's own rule for
// it: an entry the client would refuse is not signed into a manifest.
//
// `label` and `flag` are what an ordinary location carries under the same
// names (lib/watafast-manifest.ts), and the app shows them the same way. A
// node without a label is named by the app itself ("Reserve", "Reserve 2"). They
// are for the screen only: the protocol's client is never handed them. A label
// should not repeat the label of a location the same account sees: the window
// tells its rows apart by name.
//
// `wire` is never guessed. A node of one version answers a client of another
// as a stranger, and nodes are moved to a new version one at a time, so the
// list names both kinds while a move lasts and each app takes the ones the
// client it carries can talk to. An entry that does not say is not signed.
//
// An entry that does not read is left out alone and counted; the count goes to
// the log, never the entry: an address, a path and a key are in it.
//
// PURE ON PURPOSE: node:crypto and node:net, no redis, no next. Who is given
// the reserve is lib/watafast-reserve-gate.ts.

import { createHash } from "node:crypto";
import { isIP } from "node:net";

/** What the app is told about one reserve node. */
export interface ManifestReserveNode {
  readonly id: string;
  /**
   * The place the app names the node by, as a location's `label`. Absent: the
   * app names the node itself.
   */
  readonly label?: string;
  /** One country flag, as a location's `flag`. Never without `label`. */
  readonly flag?: string;
  /** The kind of entry; an app that does not know a kind skips the entry. */
  readonly protocol: "watafast";
  /** What the session travels in: one long HTTPS request to the node's site. */
  readonly carrier: "h2";
  /**
   * The version of the protocol the node speaks. An app shows a node only when
   * the client it carries speaks the same one.
   */
  readonly wire: number;
  /** `name:port` of the node's site; the name is also the name of its certificate. */
  readonly server: string;
  /** `address:port`, at most eight. Absent: the app resolves the name. */
  readonly addresses?: readonly string[];
  readonly path: string;
  /** 64 lowercase hex characters. */
  readonly node_public_key: string;
  readonly look?: "chrome" | "plain";
  /**
   * Whether the node carries UDP. While it is false the app must say so where
   * the person sees it: calls and most games do not work on such a path, and
   * the reserve is never to be passed off as an ordinary location.
   */
  readonly udp: boolean;
}

export interface ReserveSettings {
  /** The nodes that read, in the order written. */
  readonly nodes: ManifestReserveNode[];
  /**
   * How many entries did not read and were left out; 1 for a value that is
   * not a list at all. A count and not the entries.
   */
  readonly ignored: number;
}

/** Nodes one manifest carries. The plan is two or three; eight is room to move. */
export const MAX_RESERVE_NODES = 8;
/** Addresses one node may name; the client takes as many. */
const MAX_ADDRESSES = 8;
/** A list of eight nodes is under four kilobytes; a longer text is not one. */
const MAX_SETTING_CHARS = 16 * 1024;

const ID_RE = /^[a-z0-9-]{1,32}$/;
const HOST_LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const HOST_MAX_LENGTH = 253;
const PATH_RE = /^\/[A-Za-z0-9/_.-]{1,127}$/;
const KEY_RE = /^[0-9a-fA-F]{64}$/;
const PORT_RE = /^[1-9]\d{0,4}$/;
/** Versions of the protocol a node may name. */
const MAX_WIRE = 255;
/** A place name is a word or two; the app's list has one line for it. */
const LABEL_MAX_CHARS = 40;
/**
 * What a label may not carry: anything that is not drawn (controls, format
 * characters, line breaks), anything that is not a character of text at all
 * (half of a surrogate pair, private use, unassigned: the app's reader refuses
 * a whole document over the first), the "·" the app splits a name from its
 * note at, and the letters flags are made of (a flag goes in `flag`).
 */
const LABEL_FORBIDDEN_RE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\u00B7\u{1F1E6}-\u{1F1FF}]/u;
/** One country flag: two regional indicator letters, what the app reads as a flag. */
const FLAG_RE = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;

const KNOWN_FIELDS: ReadonlySet<string> = new Set([
  "id",
  "label",
  "flag",
  "wire",
  "server",
  "addresses",
  "path",
  "node_public_key",
  "look",
  "udp",
]);

function portOf(text: string): number | null {
  if (!PORT_RE.test(text)) return null;
  const port = Number(text);
  return port <= 65535 ? port : null;
}

/**
 * A name a certificate can be issued for: labels of letters, digits and
 * hyphens, at least two of them, and not an address written with digits.
 */
function isSiteName(name: string): boolean {
  if (name.length === 0 || name.length > HOST_MAX_LENGTH) return false;
  const labels = name.split(".");
  if (labels.length < 2 || !labels.every((label) => HOST_LABEL_RE.test(label))) return false;
  return /[A-Za-z]/.test(name) && isIP(name) === 0;
}

/** `name:port` as the manifest carries it (lower case), or null. */
function siteServer(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const at = value.lastIndexOf(":");
  if (at <= 0) return null;
  const name = value.slice(0, at).toLowerCase();
  const port = portOf(value.slice(at + 1));
  return port !== null && isSiteName(name) ? `${name}:${port}` : null;
}

/** `address:port` (`[address]:port` for IPv6) with a real address and port, or null. */
function socketAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v6 = /^\[([0-9A-Fa-f:.]+)\]:(\d+)$/.exec(value);
  if (v6) {
    const port = portOf(v6[2]);
    if (port === null || isIP(v6[1]) !== 6 || /^[0:]+$/.test(v6[1])) return null;
    return `[${v6[1].toLowerCase()}]:${port}`;
  }
  const at = value.lastIndexOf(":");
  if (at <= 0) return null;
  const address = value.slice(0, at);
  const port = portOf(value.slice(at + 1));
  if (port === null || isIP(address) !== 4 || address === "0.0.0.0") return null;
  return `${address}:${port}`;
}

function addressList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ADDRESSES) return null;
  const out: string[] = [];
  for (const item of value) {
    const address = socketAddress(item);
    // One address that does not read refuses the entry: half a list of
    // addresses is not what was written.
    if (address === null) return null;
    if (!out.includes(address)) out.push(address);
  }
  return out;
}

/**
 * A place name as the manifest carries it: trimmed, 1 to `LABEL_MAX_CHARS`
 * characters, nothing of `LABEL_FORBIDDEN_RE`. Null for anything else.
 */
function placeLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  const chars = [...label].length;
  if (chars === 0 || chars > LABEL_MAX_CHARS || LABEL_FORBIDDEN_RE.test(label)) return null;
  return label;
}

function reserveNode(raw: unknown): ManifestReserveNode | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  // A misspelt `addresses` must not become "no addresses given".
  if (!Object.keys(entry).every((field) => KNOWN_FIELDS.has(field))) return null;

  const { id, wire, path, node_public_key: key, look, udp } = entry;
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  if (typeof wire !== "number" || !Number.isInteger(wire) || wire < 1 || wire > MAX_WIRE) return null;
  const server = siteServer(entry.server);
  if (server === null) return null;
  const addresses = addressList(entry.addresses);
  if (addresses === null) return null;
  if (typeof path !== "string" || !PATH_RE.test(path)) return null;
  if (typeof key !== "string" || !KEY_RE.test(key)) return null;
  if (look !== undefined && look !== "chrome" && look !== "plain") return null;
  if (udp !== undefined && typeof udp !== "boolean") return null;
  // A name that does not read refuses the entry like any other field: a node
  // shown under a name nobody wrote is not what was set.
  const label = entry.label === undefined ? undefined : placeLabel(entry.label);
  if (label === null) return null;
  const { flag } = entry;
  if (flag !== undefined && (typeof flag !== "string" || !FLAG_RE.test(flag) || label === undefined)) return null;

  return {
    id,
    ...(label !== undefined ? { label } : {}),
    ...(flag !== undefined ? { flag } : {}),
    protocol: "watafast",
    carrier: "h2",
    wire,
    server,
    ...(addresses.length > 0 ? { addresses } : {}),
    path,
    node_public_key: key.toLowerCase(),
    ...(look !== undefined ? { look } : {}),
    udp: udp === true,
  };
}

const NO_RESERVE: ReserveSettings = Object.freeze({ nodes: [], ignored: 0 });

/**
 * The reserve nodes of this deployment, out of `WATAFAST_RESERVE_NODES`.
 * Unset or blank is "no reserve": the manifest is then what it was before the
 * field existed. Never throws.
 */
export function reserveNodesFromEnv(value: string | undefined): ReserveSettings {
  if (typeof value !== "string" || value.trim() === "") return NO_RESERVE;
  if (value.length > MAX_SETTING_CHARS) return { nodes: [], ignored: 1 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { nodes: [], ignored: 1 };
  }
  if (!Array.isArray(parsed)) return { nodes: [], ignored: 1 };

  const nodes: ManifestReserveNode[] = [];
  const seen = new Set<string>();
  let ignored = 0;
  for (const raw of parsed) {
    const node = reserveNode(raw);
    if (node === null || seen.has(node.id) || nodes.length >= MAX_RESERVE_NODES) {
      ignored += 1;
      continue;
    }
    seen.add(node.id);
    nodes.push(node);
  }
  return { nodes, ignored };
}

/**
 * The same nodes in the order one device is to try them.
 *
 * Every app starts from the first entry, so one order for everybody would put
 * every device on the first node and leave the others idle until it fell.
 * Each node gets a weight from the device and the node's id together, and the
 * heaviest goes first: a device keeps its order from one manifest to the
 * next, devices spread evenly, and a node added or removed moves only the
 * devices that had it first. O(n log n) for n nodes, at most eight.
 */
export function reserveOrderFor(nodes: readonly ManifestReserveNode[], deviceUuid: string): ManifestReserveNode[] {
  const weight = (node: ManifestReserveNode): string =>
    createHash("sha256").update(`wf1-reserve-order\n${deviceUuid}\n${node.id}`, "utf8").digest("hex");
  return nodes
    .map((node) => ({ node, weight: weight(node) }))
    .sort((a, b) => (a.weight < b.weight ? 1 : a.weight > b.weight ? -1 : 0))
    .map((item) => item.node);
}

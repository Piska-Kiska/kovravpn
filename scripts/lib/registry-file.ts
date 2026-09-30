// scripts/lib/registry-file.ts
//
// The pure part of scripts/set-registry.ts: read the local registry file and
// plan how it merges into `inbounds:registry`. No I/O, so tests load it under
// Node's type stripping (tests/registry-file.test.mjs).
//
// Why a local file: this repository is public, and node addresses are never
// published. The data lives in `registry.local.json` (git-ignored; the shape
// is in registry.example.json, on a documentation address).
//
// Why a merge and not a replace: the live registry carries entries this file
// may not know (the PRO locations are written by the ops tooling), and a
// stale local file used to replace the whole list, taking every location it
// did not list offline. A merge adds and updates by key and never drops one.

/** A location as src/lib/inbounds.ts InboundEntry stores it. */
export interface RegistryEntry {
  key: string;
  label: string;
  flag?: string;
  enabled: boolean;
  priority: number;
  source?: "static" | "panel";
  inboundId?: number;
  address?: string;
  port?: number;
  serverName?: string;
  publicKey?: string;
  shortId?: string;
  spiderX?: string;
  fingerprint?: string;
  encryption?: string;
  flow?: string;
  protocol?: "vless" | "hysteria2";
  hy2Sni?: string;
  hy2Insecure?: boolean;
  hy2Pin?: string;
}

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
/** A host name or an address: no spaces, no scheme, no path. */
const HOST_RE = /^[A-Za-z0-9.:-]{1,253}$/;

/** REALITY fields a static vless entry must carry; a missing one breaks every link silently. */
const VLESS_REQUIRED = ["serverName", "publicKey", "shortId", "spiderX", "fingerprint", "encryption", "flow"] as const;

function fail(file: string, what: string): never {
  throw new Error(`${file}: ${what}`);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Validate one entry; returns it typed or throws with the reason. */
function checkEntry(item: unknown, i: number, file: string): RegistryEntry {
  if (typeof item !== "object" || item === null || Array.isArray(item)) fail(file, `entry ${i} is not an object`);
  const e = item as Record<string, unknown>;
  const name = typeof e.key === "string" ? e.key : `#${i}`;

  if (typeof e.key !== "string" || !KEY_RE.test(e.key)) fail(file, `entry ${i}: key must match ${KEY_RE.source}`);
  if (!isNonEmptyString(e.label)) fail(file, `${name}: label is missing`);
  if (typeof e.enabled !== "boolean") fail(file, `${name}: enabled must be true or false`);
  if (typeof e.priority !== "number" || !Number.isFinite(e.priority)) fail(file, `${name}: priority must be a number`);

  const source = e.source ?? "panel";
  if (source === "panel") {
    if (typeof e.inboundId !== "number" || !Number.isInteger(e.inboundId)) fail(file, `${name}: a panel entry needs an integer inboundId`);
    return e as unknown as RegistryEntry;
  }
  if (source !== "static") fail(file, `${name}: source must be "static" or "panel"`);

  if (!isNonEmptyString(e.address) || !HOST_RE.test(e.address)) fail(file, `${name}: address is missing or malformed`);
  if (typeof e.port !== "number" || !Number.isInteger(e.port) || e.port < 1 || e.port > 65535) {
    fail(file, `${name}: port ${String(e.port)} is out of range`);
  }
  const protocol = e.protocol ?? "vless";
  if (protocol !== "vless" && protocol !== "hysteria2") fail(file, `${name}: protocol must be "vless" or "hysteria2"`);
  if (protocol === "vless") {
    for (const field of VLESS_REQUIRED) {
      if (typeof e[field] !== "string" || (field !== "shortId" && e[field] === "")) fail(file, `${name}: ${field} is missing`);
    }
  }
  return e as unknown as RegistryEntry;
}

/** Parse and validate the local file. Throws with a message naming the problem. O(n). */
export function parseRegistryFile(raw: string, file: string): RegistryEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(file, `not valid JSON (${(err as Error).message})`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) fail(file, "expected a non-empty array of entries");
  const seen = new Set<string>();
  return parsed.map((item, i) => {
    const entry = checkEntry(item, i, file);
    if (seen.has(entry.key)) fail(file, `key ${entry.key} appears twice`);
    seen.add(entry.key);
    return entry;
  });
}

/** Parse what Redis holds (a JSON string, an already parsed array, or nothing). */
export function parseStoredRegistry(stored: unknown): RegistryEntry[] {
  if (stored === null || stored === undefined) return [];
  const value = typeof stored === "string" ? (JSON.parse(stored) as unknown) : stored;
  if (!Array.isArray(value)) throw new Error("inbounds:registry holds something that is not an array; fix it by hand first");
  return value as RegistryEntry[];
}

export interface RegistryPlan {
  /** The registry after the merge: stored order kept, new keys appended. */
  next: RegistryEntry[];
  added: string[];
  changed: string[];
  unchanged: string[];
  /** Keys in the store that the file does not mention: kept as they are. */
  kept: string[];
}

function sameEntry(a: RegistryEntry, b: RegistryEntry): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (JSON.stringify((a as unknown as Record<string, unknown>)[k]) !== JSON.stringify((b as unknown as Record<string, unknown>)[k])) {
      return false;
    }
  }
  return true;
}

/** Merge the file into the stored registry by key; never drops a stored key. O(n + m). */
export function mergeRegistry(current: readonly RegistryEntry[], incoming: readonly RegistryEntry[]): RegistryPlan {
  const byKey = new Map(incoming.map((e) => [e.key, e]));
  const plan: RegistryPlan = { next: [], added: [], changed: [], unchanged: [], kept: [] };
  const stored = new Set<string>();
  for (const old of current) {
    stored.add(old.key);
    const fresh = byKey.get(old.key);
    if (!fresh) {
      plan.kept.push(old.key);
      plan.next.push(old);
    } else if (sameEntry(old, fresh)) {
      plan.unchanged.push(old.key);
      plan.next.push(old);
    } else {
      plan.changed.push(old.key);
      plan.next.push(fresh);
    }
  }
  for (const e of incoming) {
    if (stored.has(e.key)) continue;
    plan.added.push(e.key);
    plan.next.push(e);
  }
  return plan;
}

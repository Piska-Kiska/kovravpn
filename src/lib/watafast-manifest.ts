// src/lib/watafast-manifest.ts
//
// Watafast CandidateManifest v1: payload shape and signing, per the
// protocol's MANIFEST-v1.md (agreed 27.09.2026), as ProxysVPN's site signs it.
// The Kovra app reads it with the same code as the ProxysVPN app (the brand
// only picks which public key it trusts), so the bytes must match exactly:
// the envelope and the signature below are ProxysVPN's, line for line, and
// tests/watafast-manifest.test.mjs pins them against a fixed vector.
//
// What is Kovra's own: the registry (lib/inbounds.ts) has VLESS Reality and
// Hysteria2 entries and nothing else, so a location carries a `vision`
// candidate or a `hysteria2` one. ProxysVPN's XHTTP fan-out, per-device
// addresses, port hopping and the list of advertising names have no
// counterpart here and are not written.
//
// PURE ON PURPOSE: node:crypto, and types only from the registry. Panel
// resolution (lib/inbound-resolver.ts) needs Redis and the network, so the
// route injects it as `resolveEntry`; this module only shapes what comes back.
// That keeps the file testable under plain Node type stripping and keeps the
// signing key out of every module that does not need to touch it.
//
// ── What this module does NOT decide ────────────────────
// Token resolution, the HWID binding, rate limiting and whether the account
// may connect are the route's (src/app/api/watafast/v1/[token]/route.ts,
// through lib/sub-access.ts as /api/sub decides them). This module receives
// the decided `account` and the enabled `entries` and turns them into the
// signed envelope.

import { createHash, createPrivateKey, sign as edSign, type KeyObject } from "node:crypto";
import type { InboundEntry } from "./inbounds";
import type { ManifestReserveNode } from "./watafast-reserve";

// ── Envelope / signing ──────────────────────────────────

/** Domain-separation prefix for the signed message (MANIFEST-v1.md "Envelope"). */
const SIGNED_MESSAGE_PREFIX = Buffer.from("watafast-manifest-v1\n", "ascii");

/** Ed25519 seed length, RFC 8032. */
const SEED_BYTES = 32;

/**
 * PKCS8 DER header for a raw Ed25519 seed (RFC 8410 `id-Ed25519`, the
 * OID written as 06032b6570 below): `SEQUENCE { INTEGER 0, SEQUENCE { OID
 * id-Ed25519 }, OCTET STRING { OCTET STRING <32-byte seed> } }`. Node's crypto has no
 * "build an Ed25519 key from a raw seed" entry point; PKCS8-wrapping it by
 * hand is the documented way. Fixed bytes: the constant is exactly the
 * wrapper and nothing else varies.
 */
const ED25519_PKCS8_PREFIX_HEX = "302e020100300506032b657004220420";

export interface ManifestEnvelope {
  readonly v: 1;
  readonly kid: string;
  /** base64url, no padding, of the UTF-8 payload JSON bytes. */
  readonly payload: string;
  /** base64url, no padding, of the 64-byte Ed25519 signature. */
  readonly sig: string;
}

/** First 16 hex characters of SHA-256(token): binds a manifest to its link. */
export function manifestTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex").slice(0, 16);
}

/**
 * The Ed25519 private key from `WATAFAST_MANIFEST_KEY` (standard base64 of the
 * 32-byte seed), or null when the value is missing or not a 32-byte seed.
 * Never throws: a malformed key must produce the contract's 503, not a 500.
 */
function privateKeyFromSeed(seedBase64: string): KeyObject | null {
  return ed25519PrivateKeyFromSeed(Buffer.from(seedBase64, "base64"));
}

/**
 * An Ed25519 private key from its raw 32-byte seed, or null when `seed` is
 * not 32 bytes. Exported for the one other key the site signs with
 * (lib/watafast-credential.ts): the wrapping is the same, the keys are not.
 */
export function ed25519PrivateKeyFromSeed(seed: Buffer): KeyObject | null {
  if (seed.length !== SEED_BYTES) return null;
  try {
    const der = Buffer.concat([Buffer.from(ED25519_PKCS8_PREFIX_HEX, "hex"), seed]);
    return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } catch {
    return null;
  }
}

export interface ManifestKeyConfig {
  /** `WATAFAST_MANIFEST_KEY`: standard base64 of the 32-byte Ed25519 seed. */
  readonly seedBase64: string | undefined;
  /** `WATAFAST_MANIFEST_KID`: which public key the app verifies with (Kovra's is `kw1`). */
  readonly kid: string | undefined;
}

/** The key a manifest is signed with, and the kid the app looks it up by. */
export interface ManifestSigner {
  readonly kid: string;
  readonly key: KeyObject;
}

export type ManifestSignerResult =
  | { readonly ok: true; readonly signer: ManifestSigner }
  /** `reason` is for our own log only: it names the variable, never its value. */
  | { readonly ok: false; readonly reason: string };

export type ManifestSignResult =
  | { readonly ok: true; readonly envelope: ManifestEnvelope }
  /** `reason` is for our own log only: never put it in a response body. */
  | { readonly ok: false; readonly reason: string };

/**
 * The signing key and kid out of their variables, or why not. The route asks
 * this before anything else: a deployment that cannot sign answers 503 at
 * once, without reading the store or writing a device binding.
 */
export function manifestSignerFromEnv(config: ManifestKeyConfig): ManifestSignerResult {
  const kid = config.kid?.trim();
  if (!kid) return { ok: false, reason: "WATAFAST_MANIFEST_KID missing" };
  if (!config.seedBase64) return { ok: false, reason: "WATAFAST_MANIFEST_KEY missing" };
  const key = privateKeyFromSeed(config.seedBase64);
  if (!key) return { ok: false, reason: "WATAFAST_MANIFEST_KEY is not a valid 32-byte Ed25519 seed" };
  return { ok: true, signer: { kid, key } };
}

/** Sign `payload` into the envelope the contract describes. */
export function signManifestWith(payload: ManifestPayload, signer: ManifestSigner): ManifestSignResult {
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf-8");
  let sig: Buffer;
  try {
    // `null`: pure Ed25519 (RFC 8032, no prehash), what the app verifies.
    sig = edSign(null, Buffer.concat([SIGNED_MESSAGE_PREFIX, payloadBytes]), signer.key);
  } catch (err) {
    return { ok: false, reason: `signing failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  return {
    ok: true,
    envelope: { v: 1, kid: signer.kid, payload: payloadBytes.toString("base64url"), sig: sig.toString("base64url") },
  };
}

/**
 * Sign `payload` with the key of `config`, or report why not. A missing or
 * invalid key or kid is NOT an exception: the route turns `ok: false` into
 * 503 `{"error":"unavailable"}` with one log line that names the reason and
 * never the key material.
 */
export function signManifestPayload(payload: ManifestPayload, config: ManifestKeyConfig): ManifestSignResult {
  const read = manifestSignerFromEnv(config);
  return read.ok ? signManifestWith(payload, read.signer) : read;
}

// ── Payload ──────────────────────────────────────────────

/**
 * How long a signed manifest stays good: 30 days, as ProxysVPN's.
 *
 * The app keeps the last verified manifest on disk and connects by it when
 * none of our names answers, so a person back from a month away still has a
 * way in. What it costs: the list of a device that was removed meanwhile is
 * honoured from that copy while our names stay unreachable for that app. A
 * refusal that does reach the app wipes the copy, and a node stops serving a
 * removed device whatever the copy says.
 */
export const MANIFEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ManifestAccountStatus = "active" | "no_funds" | "expired";
/** Kovra has one plan; `pro` is a code of the contract this site never writes. */
export type ManifestPlan = "base" | "pro";

export interface ManifestAccountInfo {
  readonly status: ManifestAccountStatus;
  readonly plan: ManifestPlan;
  /** Text to show when `status !== "active"`; null when active. */
  readonly notice: string | null;
}

interface ManifestCandidateCommon {
  readonly id: string;
  readonly address: string;
  readonly port: number;
  readonly uuid: string;
  readonly sni?: string;
  readonly pbk?: string;
  readonly sid?: string;
  readonly fp?: string;
  readonly spx?: string;
}

export interface ManifestVisionCandidate extends ManifestCandidateCommon {
  readonly protocol: "vision";
  readonly flow?: string;
}

export interface ManifestHysteria2Candidate extends ManifestCandidateCommon {
  readonly protocol: "hysteria2";
  readonly pin_sha256?: string;
  readonly insecure?: boolean;
}

export type ManifestCandidate = ManifestVisionCandidate | ManifestHysteria2Candidate;

export interface ManifestLocation {
  readonly id: string;
  readonly label: string;
  readonly flag?: string;
  readonly priority: number;
  readonly note: string | null;
  readonly candidates: readonly ManifestCandidate[];
}

export interface ManifestPayload {
  readonly manifest_version: number;
  readonly issued_at: number;
  readonly expires_at: number;
  readonly token_hash: string;
  readonly account: ManifestAccountInfo;
  readonly hosts: readonly string[];
  /**
   * Names the app must not use any more: a signed "do not use this name".
   * Left out of the document when there is none; an app that does not know
   * the field reads past it.
   */
  readonly withdrawn_hosts?: readonly string[];
  readonly locations: readonly ManifestLocation[];
  /**
   * Nodes of our own protocol the app may fall back to when no location
   * connects (lib/watafast-reserve.ts). Left out when there is none.
   */
  readonly reserve?: readonly ManifestReserveNode[];
}

/**
 * What the builder needs from resolving one entry for one device: a
 * structural subset of lib/inbound-resolver.ts `ConnectionParams`, so
 * `resolveInbound` can be passed as `resolveEntry` without an adapter.
 * Declared here so this file never imports the resolver, which pulls in the
 * panel client and, through it, Redis.
 */
export interface ManifestResolvedParams {
  readonly address: string;
  readonly port: number;
  readonly serverName?: string;
  readonly publicKey?: string;
  readonly shortId?: string;
  readonly spiderX?: string;
  readonly fingerprint?: string;
  readonly encryption?: string;
  readonly flow?: string;
}

export type ManifestEntryResolver = (uuid: string, entry: InboundEntry) => Promise<ManifestResolvedParams | null>;

export interface BuildManifestPayloadInput {
  /** The enabled entries for this account (lib/inbounds.ts getEnabledInboundsForUser), in their order. */
  readonly entries: readonly InboundEntry[];
  /** Resolves one entry's connection parameters (lib/inbound-resolver.ts resolveInbound, injected). */
  readonly resolveEntry: ManifestEntryResolver;
  readonly deviceUuid: string;
  readonly token: string;
  readonly account: ManifestAccountInfo;
  /** The names the app may ask, in preference order; validated and capped at 8. */
  readonly hosts: readonly string[];
  /** Names to withdraw: taken out of `hosts` too, so a document never both lists and withdraws a name. */
  readonly withdrawn?: readonly string[];
  /** The reserve nodes this account is given, already validated. Written for an active account only. */
  readonly reserve?: readonly ManifestReserveNode[];
  readonly now: number;
}

const MAX_HOSTS = 8;
/** Names a document may withdraw; the app takes as many. */
const MAX_WITHDRAWN_HOSTS = 16;
const HOST_LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const HOST_MAX_LENGTH = 253;

/** Whether `value` is a plain host name: no scheme, port, path, query or fragment. */
function isPlainHost(value: string): boolean {
  if (value.length === 0 || value.length > HOST_MAX_LENGTH) return false;
  if (/[/:?#@\s]/.test(value)) return false;
  const labels = value.split(".");
  if (labels.length < 2) return false;
  return labels.every((l) => HOST_LABEL_RE.test(l));
}

/**
 * `hosts` trimmed, lower-cased, filtered to plain host names, deduplicated,
 * in order, at most `cap`. A malformed entry is dropped silently: a bad name
 * must not cost the person the rest of the manifest.
 */
function plainHosts(hosts: readonly unknown[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of hosts) {
    if (typeof raw !== "string") continue;
    const value = raw.trim().toLowerCase();
    if (!isPlainHost(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= cap) break;
  }
  return out;
}

/** `hosts` as the payload carries them: plain host names, deduplicated, in order, at most 8. */
export function validateManifestHosts(hosts: readonly unknown[]): string[] {
  return plainHosts(hosts, MAX_HOSTS);
}

/** The names a document withdraws: the same shape of name as `hosts`, at most 16. */
export function validateWithdrawnHosts(hosts: readonly unknown[]): string[] {
  return plainHosts(hosts, MAX_WITHDRAWN_HOSTS);
}

/**
 * A registry label split on its first " · " into the place name and the
 * text after it, or `{ label, note: null }` when there is none. A segment
 * that only names a transport ("Austria · TCP") is dropped instead of
 * becoming a note: the manifest states the transport per candidate, and the
 * app prints it under the name.
 */
export function splitLocationLabel(rawLabel: string): { readonly label: string; readonly note: string | null } {
  const idx = rawLabel.indexOf(" · ");
  if (idx === -1) return { label: rawLabel, note: null };
  const rest = rawLabel
    .slice(idx + 3)
    .split(" · ")
    .filter((segment) => !TRANSPORT_SEGMENT.test(segment.trim()));
  return { label: rawLabel.slice(0, idx), note: rest.length > 0 ? rest.join(" · ") : null };
}

/** A label segment that only names a transport. */
const TRANSPORT_SEGMENT = /^(?:xhttp|tcp|udp|vision|reality|hysteria2?|hy2|watafast)$/i;

/**
 * VLESS encryption the app connects with. The manifest has no field for any
 * other (the app's candidate carries none), so an inbound with VLESS
 * encryption turned on cannot be described to it: such a candidate is left
 * out rather than sent in a form that cannot connect.
 */
function plainVless(encryption: string | undefined): boolean {
  return encryption === undefined || encryption === "" || encryption === "none";
}

function commonFields(id: string, uuid: string, params: ManifestResolvedParams): ManifestCandidateCommon {
  return {
    id,
    address: params.address,
    port: params.port,
    uuid,
    ...(params.serverName ? { sni: params.serverName } : {}),
    ...(params.publicKey ? { pbk: params.publicKey } : {}),
    ...(params.shortId ? { sid: params.shortId } : {}),
    ...(params.fingerprint ? { fp: params.fingerprint } : {}),
    ...(params.spiderX ? { spx: params.spiderX } : {}),
  };
}

/**
 * The Hysteria2 candidate for `entry`, as /api/sub writes its hy2:// line:
 * the registry's address and port, SNI www.bing.com unless set, a pinned
 * certificate when there is a pin, otherwise insecure unless the registry
 * says not.
 */
function hysteria2Candidate(entry: InboundEntry, deviceUuid: string): ManifestHysteria2Candidate | null {
  if (!entry.address) return null;
  return {
    id: entry.key,
    protocol: "hysteria2",
    address: entry.address,
    port: entry.port ?? 443,
    uuid: deviceUuid,
    sni: entry.hy2Sni ?? "www.bing.com",
    ...(entry.hy2Pin ? { pin_sha256: entry.hy2Pin } : {}),
    insecure: entry.hy2Pin ? false : entry.hy2Insecure !== false,
  };
}

/**
 * The VLESS Reality candidate for `entry`, or null when it does not resolve
 * (a broken static entry, a panel that did not answer, an inbound with VLESS
 * encryption). A resolver that throws is a panel that did not answer: one
 * location is lost, never the manifest.
 */
async function visionCandidate(
  entry: InboundEntry,
  deviceUuid: string,
  resolveEntry: ManifestEntryResolver,
): Promise<ManifestVisionCandidate | null> {
  let params: ManifestResolvedParams | null;
  try {
    params = await resolveEntry(deviceUuid, entry);
  } catch (err) {
    console.warn(`[watafast-manifest] entry ${entry.key} did not resolve:`, err instanceof Error ? err.message : "error");
    return null;
  }
  if (!params || !plainVless(params.encryption)) return null;
  return {
    ...commonFields(entry.key, deviceUuid, params),
    protocol: "vision",
    ...(params.flow ? { flow: params.flow } : {}),
  };
}

/**
 * The payload for one manifest: one location per enabled entry, in the order
 * the subscription lists them. An entry that resolves to nothing is dropped,
 * as /api/sub drops a line it could not build. O(n) resolutions for n entries,
 * one after another (panel answers are cached for 10 s by the resolver).
 */
export async function buildManifestPayload(input: BuildManifestPayloadInput): Promise<ManifestPayload> {
  const locations: ManifestLocation[] = [];

  if (input.account.status === "active") {
    for (const entry of input.entries) {
      const candidate =
        entry.protocol === "hysteria2"
          ? hysteria2Candidate(entry, input.deviceUuid)
          : await visionCandidate(entry, input.deviceUuid, input.resolveEntry);
      if (candidate === null) continue;
      const { label, note } = splitLocationLabel(entry.label);
      locations.push({
        id: entry.key,
        label,
        ...(entry.flag ? { flag: entry.flag } : {}),
        priority: entry.priority,
        note,
        candidates: [candidate],
      });
    }
  }

  const withdrawn = validateWithdrawnHosts(input.withdrawn ?? []);
  const gone = new Set(withdrawn);
  // An account that is not active gets no way in at all, the reserve included.
  const reserve = input.account.status === "active" ? (input.reserve ?? []) : [];
  return {
    manifest_version: input.now,
    issued_at: input.now,
    expires_at: input.now + MANIFEST_TTL_MS,
    token_hash: manifestTokenHash(input.token),
    account: input.account,
    hosts: validateManifestHosts(input.hosts.filter((host) => typeof host !== "string" || !gone.has(host.trim().toLowerCase()))),
    ...(withdrawn.length > 0 ? { withdrawn_hosts: withdrawn } : {}),
    locations,
    ...(reserve.length > 0 ? { reserve } : {}),
  };
}

// ── The names, from a setting ───────────────────────────

/** An environment, as `process.env` is one. */
export type ManifestHostEnv = Readonly<Record<string, string | undefined>>;

export interface ManifestHostSettings {
  /** What goes into `hosts`, validated: the setting, or the defaults when there is none. */
  readonly hosts: string[];
  /** What goes into `withdrawn_hosts`, validated. */
  readonly withdrawn: string[];
  /** How many entries of the two variables were not host names. A count, never the entries. */
  readonly ignored: number;
}

/** An address literal is not a name: the app asks names, and a name can be moved. */
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Host names out of a setting's text: split on commas, semicolons and blank space. */
function hostNamesOf(raw: string | undefined): { readonly names: string[]; readonly ignored: number } | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const names: string[] = [];
  let ignored = 0;
  for (const token of raw.split(/[\s,;]+/)) {
    if (token === "") continue;
    const value = token.toLowerCase().replace(/\.$/, "");
    if (isPlainHost(value) && !IPV4_RE.test(value)) names.push(value);
    else ignored += 1;
  }
  return { names, ignored };
}

/**
 * The names a manifest carries and withdraws, from `WATAFAST_MANIFEST_HOSTS`
 * and `WATAFAST_MANIFEST_HOSTS_WITHDRAWN`. Pure: the route hands `process.env` over.
 *
 *  - `WATAFAST_MANIFEST_HOSTS` unset or blank: `defaults`.
 *  - set: its names, in its order, at most eight. A value from which not one
 *    name can be read is a mistake in the variable: the defaults stand and
 *    `ignored` says so.
 *  - a withdrawn name is taken out of `hosts` whichever list it came from.
 */
export function manifestHostSettings(env: ManifestHostEnv, defaults: readonly string[]): ManifestHostSettings {
  const listed = hostNamesOf(env["WATAFAST_MANIFEST_HOSTS"]);
  const retired = hostNamesOf(env["WATAFAST_MANIFEST_HOSTS_WITHDRAWN"]);
  const withdrawn = validateWithdrawnHosts(retired?.names ?? []);
  const gone = new Set(withdrawn);
  const wanted = listed !== null && listed.names.length > 0 ? listed.names : validateManifestHosts(defaults);
  const hosts = validateManifestHosts(wanted.filter((host) => !gone.has(host)));
  return { hosts, withdrawn, ignored: (listed?.ignored ?? 0) + (retired?.ignored ?? 0) };
}

// src/lib/watafast-endpoint.ts
//
// The app's own endpoint, the two routes' whole logic (the route files only
// hand the request over), so the node tests can run every branch against the
// in-memory store (tests/watafast-endpoint.test.mjs).
//
// ── GET /api/watafast/v1/<token>[?lang=ru|en] ───────────
// The signed manifest (MANIFEST-v1.md): the account's locations, the names
// the app may ask, and the reserve nodes of our own protocol when the
// account is given them. The Kovra app verifies it with Kovra's public key
// (kid `kw1`), never ProxysVPN's.
//
// | status | body                       |
// |--------|----------------------------|
// | 200    | signed envelope            |
// | 403    | {"error":"second_device"}  |
// | 404    | {"error":"not_found"}      |
// | 429    | {"error":"rate_limited"}   |
// | 503    | {"error":"unavailable"}    |
//
// 503 is also the answer of a deployment that has no signing key: the app
// then keeps to the subscription, which is what it does today. Asked first,
// before the store: such a deployment reads nothing and binds nothing.
//
// ── GET /api/watafast/v1/<token>/credential/<key> ───────
// A credential for the reserve path (lib/watafast-credential.ts): the device
// sends the public half of its own key, and gets a statement, signed with
// Kovra's issuer key, that the key is this link's device's for three days.
//
// | status | body                                   |
// |--------|----------------------------------------|
// | 200    | {v, credential, not_before, not_after} |
// | 400    | {"error":"bad_request"}                |
// | 403    | {"error":"second_device"}              |
// | 403    | {"error":"not_active"}                 |
// | 403    | {"error":"not_offered"}                |
// | 404    | {"error":"not_found"}                  |
// | 429    | {"error":"rate_limited"}               |
// | 503    | {"error":"unavailable"}                |
//
// Who gets one: exactly the links whose manifest names a reserve node
// (lib/watafast-access.ts). Stricter than the manifest in two ways, as at
// ProxysVPN: `x-hwid` is required (a link bound to one device must not hand
// credentials to any holder of the link), and the limiter fails closed (a
// signature is owed to nobody while the limiter cannot count). A deployment
// that offers no reserve answers `not_offered` before the store is asked.
//
// Every response is `application/json` with `Cache-Control: no-store`. The
// log names reasons and counts, never a token, key, credential or address.

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getEnabledInboundsForUser, type InboundEntry } from "./inbounds";
import { getUserRecord, type UserRecord } from "./accounts";
import { resolveSubAccess, type SubAccess } from "./sub-access";
import { storeLangOf, type StoreLang } from "./client-dist";
import { isOwnAppUa } from "./own-app";
import { resolveInbound } from "./inbound-resolver";
import { rateLimit } from "./ratelimit";
import { redis } from "./redis";
import { storeRefusalText } from "./sub-notices";
import {
  credentialsCanBeIssued,
  linkAccessOf,
  offeredReserveNodes,
  reserveNodesForAccount,
  type WatafastEnv,
} from "./watafast-access";
import { admitDeviceKey, type DeviceKeyStore } from "./watafast-device-keys";
import { idKeyFromEnv, issueCredential, issuerKeyFromEnv, parseDevicePublicKey, rateLimitFromEnv } from "./watafast-credential";
import {
  buildManifestPayload,
  manifestHostSettings,
  manifestSignerFromEnv,
  signManifestWith,
  type ManifestAccountInfo,
  type ManifestEntryResolver,
} from "./watafast-manifest";
import type { ReserveGateStore } from "./watafast-reserve-gate";

/** The names the manifest carries when `WATAFAST_MANIFEST_HOSTS` says nothing: Kovra's own, and nothing of ProxysVPN's. */
export const DEFAULT_MANIFEST_HOSTS: readonly string[] = ["kovravpn.com", "www.kovravpn.com"];

/** Every token the service issues is hex; nothing longer or stranger is worth a question to the store. */
const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
/** A device id of ours is a short token; a longer header is not one. */
const MAX_HWID_CHARS = 256;

/** The manifest: 30 per minute per link, the subscription's own budget, in a counter of its own. */
export const MANIFEST_LIMIT = 30;
export const MANIFEST_WINDOW_S = 60;
/**
 * Credentials: 30 in ten minutes per link and device id. An app asks about
 * once a day (a credential is good for three), but one asking is several
 * requests over its ladder of names.
 */
export const CREDENTIAL_LIMIT = 30;
export const CREDENTIAL_WINDOW_S = 600;
/** How long a link that holds as many keys as it may is told to wait. */
const KEYS_FULL_RETRY_S = 3600;

export interface RateLimitAnswer {
  readonly ok: boolean;
  readonly retryAfter: number;
}

export interface WatafastEndpointDeps {
  readonly env: WatafastEnv;
  readonly now: () => number;
  readonly rateLimit: (key: string, max: number, windowSec: number) => Promise<RateLimitAnswer>;
  /** lib/sub-access.ts resolveSubAccess. */
  readonly resolveAccess: (token: string, hwid: string | null, now: number, ownApp: boolean) => Promise<SubAccess>;
  /** lib/own-app.ts isOwnAppUa. */
  readonly isOwnApp: (ua: string | null) => boolean;
  /** lib/inbounds.ts getEnabledInboundsForUser. */
  readonly entriesFor: (userId: string) => Promise<InboundEntry[]>;
  /** lib/inbound-resolver.ts resolveInbound. */
  readonly resolveEntry: ManifestEntryResolver;
  /** lib/accounts.ts getUserRecord. */
  readonly userOf: (userId: string) => Promise<UserRecord | null>;
  /** lib/sub-notices.ts storeRefusalText. */
  readonly refusalText: (kind: "no-plan" | "paused", lang: StoreLang) => string;
  /** lib/client-dist.ts storeLangOf. */
  readonly langOf: (lang: string | null) => StoreLang;
  /** Redis: the reserve gate and the ledger of device keys. */
  readonly store: ReserveGateStore & DeviceKeyStore;
}

/** The deps of the deployment: the store, the registry, the panel, the environment at the request. */
export function defaultWatafastEndpointDeps(): WatafastEndpointDeps {
  return {
    env: process.env,
    now: Date.now,
    rateLimit,
    resolveAccess: resolveSubAccess,
    isOwnApp: isOwnAppUa,
    entriesFor: getEnabledInboundsForUser,
    resolveEntry: resolveInbound,
    userOf: getUserRecord,
    refusalText: storeRefusalText,
    langOf: storeLangOf,
    store: redis,
  };
}

function jsonNoStore(body: unknown, status: number, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

/** Said once per process and reason: one line is enough to send the owner to the variable. */
const warned = new Set<string>();

function unavailable(tag: string, reason: string): NextResponse {
  if (!warned.has(`${tag}:${reason}`)) {
    warned.add(`${tag}:${reason}`);
    // Why, never a value of a variable.
    console.error(`[${tag}] unavailable:`, reason);
  }
  return jsonNoStore({ error: "unavailable" }, 503);
}

/** The x-hwid header, trimmed; "" when absent. */
function hwidOf(req: Request): string {
  return (req.headers.get("x-hwid") ?? "").trim();
}

/** The manifest's names: the setting, or Kovra's own. */
function manifestNames(env: WatafastEnv): { readonly hosts: string[]; readonly withdrawn: string[] } {
  const settings = manifestHostSettings(env, DEFAULT_MANIFEST_HOSTS);
  if (settings.ignored > 0 && !warned.has("hosts")) {
    warned.add("hosts");
    console.warn(
      `[watafast-manifest] ${settings.ignored} entries of WATAFAST_MANIFEST_HOSTS / WATAFAST_MANIFEST_HOSTS_WITHDRAWN are not host names and were left out`,
    );
  }
  return { hosts: settings.hosts, withdrawn: settings.withdrawn };
}

/** GET /api/watafast/v1/<token>. */
export async function handleManifest(req: Request, token: string, deps: WatafastEndpointDeps): Promise<NextResponse> {
  try {
    if (!TOKEN_RE.test(token)) return jsonNoStore({ error: "not_found" }, 404);

    const signer = manifestSignerFromEnv({ seedBase64: deps.env["WATAFAST_MANIFEST_KEY"], kid: deps.env["WATAFAST_MANIFEST_KID"] });
    if (!signer.ok) return unavailable("watafast-manifest", signer.reason);

    // Fails open, as /api/sub: a limiter fault must not cost the app its list.
    try {
      const rl = await deps.rateLimit(`wfm:${token.slice(0, 32)}`, MANIFEST_LIMIT, MANIFEST_WINDOW_S);
      if (!rl.ok) return jsonNoStore({ error: "rate_limited" }, 429, { "Retry-After": String(rl.retryAfter) });
    } catch (err) {
      console.warn("[watafast-manifest] limiter:", err instanceof Error ? err.message : "error");
    }

    const now = deps.now();
    const hwid = hwidOf(req);
    const access = linkAccessOf(
      await deps.resolveAccess(token, hwid === "" ? null : hwid, now, deps.isOwnApp(req.headers.get("user-agent"))),
    );
    if (access.kind === "not_found") return jsonNoStore({ error: "not_found" }, 404);
    if (access.kind === "second_device") return jsonNoStore({ error: "second_device" }, 403);

    // Only our app asks for this list, and every Kovra build is a store
    // build: the notice is the neutral text the subscription gives it.
    const lang = deps.langOf(new URL(req.url).searchParams.get("lang"));
    const account: ManifestAccountInfo =
      access.kind === "open"
        ? { status: "active", plan: "base", notice: null }
        : { status: "expired", plan: "base", notice: deps.refusalText(access.refusal, lang) };

    const open = access.kind === "open";
    const entries = open ? await deps.entriesFor(access.userId) : [];
    const deviceUuid = open ? access.device.uuid : "";
    const reserve = open
      ? await reserveNodesForAccount(access.userId, deviceUuid, { store: deps.store, userOf: deps.userOf, env: deps.env })
      : [];

    const names = manifestNames(deps.env);
    const payload = await buildManifestPayload({
      entries,
      resolveEntry: deps.resolveEntry,
      deviceUuid,
      token,
      account,
      hosts: names.hosts,
      withdrawn: names.withdrawn,
      reserve,
      now,
    });
    const signed = signManifestWith(payload, signer.signer);
    if (!signed.ok) return unavailable("watafast-manifest", signed.reason);
    return jsonNoStore(signed.envelope, 200);
  } catch (err) {
    // The contract has no 500: a fault means "keep to the subscription", which 503 says.
    console.error("[watafast-manifest]", err instanceof Error ? err.message : "error");
    return jsonNoStore({ error: "unavailable" }, 503);
  }
}

/** GET /api/watafast/v1/<token>/credential/<key>. */
export async function handleCredential(req: Request, token: string, key: string, deps: WatafastEndpointDeps): Promise<NextResponse> {
  try {
    if (!TOKEN_RE.test(token)) return jsonNoStore({ error: "not_found" }, 404);

    // What needs no store goes first: a request this route cannot read costs nothing.
    const hwid = hwidOf(req);
    const devicePublicKey = parseDevicePublicKey(key);
    if (devicePublicKey === null || hwid === "" || hwid.length > MAX_HWID_CHARS) {
      return jsonNoStore({ error: "bad_request" }, 400);
    }

    // A deployment that offers no reserve says so to everyone, unread.
    if (offeredReserveNodes(deps.env).length === 0) return jsonNoStore({ error: "not_offered" }, 403);
    const issuer = issuerKeyFromEnv(deps.env["WATAFAST_ISSUER_KEY"]);
    const idKey = idKeyFromEnv(deps.env["WATAFAST_ID_KEY"]);
    const rateLimitKbps = rateLimitFromEnv(deps.env["WATAFAST_RESERVE_RATE_KBPS"]);
    // offeredReserveNodes asked credentialsCanBeIssued: these read. Checked again for the types.
    if (!issuer.ok || !idKey.ok || rateLimitKbps === null || !credentialsCanBeIssued(deps.env)) {
      return jsonNoStore({ error: "not_offered" }, 403);
    }

    // One counter for a link and a device id: whoever asks with another
    // device id spends a budget of their own, not the device's.
    const asker = createHash("sha256").update(hwid, "utf8").digest("hex").slice(0, 16);
    let limited: RateLimitAnswer;
    try {
      limited = await deps.rateLimit(`wfc:${token.slice(0, 32)}:${asker}`, CREDENTIAL_LIMIT, CREDENTIAL_WINDOW_S);
    } catch (err) {
      console.error("[watafast-credential] limiter:", err instanceof Error ? err.message : "error");
      return jsonNoStore({ error: "unavailable" }, 503);
    }
    if (!limited.ok) return jsonNoStore({ error: "rate_limited" }, 429, { "Retry-After": String(limited.retryAfter) });

    const now = deps.now();
    // The binding is lib/sub-access.ts's: the link's first device id binds
    // it, as at /api/sub, which the app has asked with this id already.
    const access = linkAccessOf(await deps.resolveAccess(token, hwid, now, deps.isOwnApp(req.headers.get("user-agent"))));
    if (access.kind === "not_found") return jsonNoStore({ error: "not_found" }, 404);
    if (access.kind === "second_device") return jsonNoStore({ error: "second_device" }, 403);
    if (access.kind === "closed") return jsonNoStore({ error: "not_active" }, 403);

    // The question the manifest asks before it names a reserve node.
    const nodes = await reserveNodesForAccount(access.userId, access.device.uuid, {
      store: deps.store,
      userOf: deps.userOf,
      env: deps.env,
    });
    if (nodes.length === 0) return jsonNoStore({ error: "not_offered" }, 403);

    // A ledger that cannot count is a fault (it throws), and nothing is signed.
    if ((await admitDeviceKey(deps.store, token, devicePublicKey.toString("hex"), now)) === "full") {
      return jsonNoStore({ error: "rate_limited" }, 429, { "Retry-After": String(KEYS_FULL_RETRY_S) });
    }

    const issued = issueCredential({
      issuer: issuer.issuer,
      idKey: idKey.idKey,
      userId: access.userId,
      deviceUuid: access.device.uuid,
      devicePublicKey,
      pro: false,
      rateLimitKbps,
      now,
    });
    if (!issued) return unavailable("watafast-credential", "a credential could not be signed");

    console.log(
      "[watafast-credential] issued",
      JSON.stringify({ device: issued.deviceId.toString("hex").slice(0, 8), key_id: issuer.issuer.keyId, not_after: issued.notAfter }),
    );
    return jsonNoStore(
      { v: 1, credential: issued.bytes.toString("hex"), not_before: issued.notBefore, not_after: issued.notAfter },
      200,
    );
  } catch (err) {
    console.error("[watafast-credential]", err instanceof Error ? err.message : "error");
    return jsonNoStore({ error: "unavailable" }, 503);
  }
}

// src/lib/bot-v2/callbacks.ts
//
// callback_data of the new bot interface: a typed action, encoded as a short
// string with the prefix "k:" and parsed back. Pure, no I/O.
//
// Everything here comes from the client and can be forged: every field is
// validated, and a uuid is only a claim, checked against the caller's own
// profiles by the controller before anything is shown or deleted.
//
// Buttons of the OLD interface still sit in people's chats. `parseCallback`
// maps them onto the new actions too, so a gated user who taps an old
// "menu" or "buyterm_…" button lands on the new screen. One difference on
// purpose: the old buttons that PAID at once (buyterm_…, adddev_<n>) open the
// order screen with its "Pay" button instead of charging.

import { BOT_LANGS, type BotLang } from "../bot-i18n";
import { lavaMethod, type LavaMethodId } from "../lava-methods";
import type { PlanKind, Term } from "../subscriptions";
import type { TopupMethod } from "../wallet-topup";

export type DeviceKind = "android" | "iphone" | "mac" | "windows" | "tv";
export const DEVICE_KINDS: readonly DeviceKind[] = ["android", "iphone", "mac", "windows", "tv"];

/** What an order buys: a plan tier or one extra device slot. */
export type ProductKey = PlanKind | "slot";
const PRODUCT_KEYS: readonly ProductKey[] = ["plan1", "plan3", "slot"];

/**
 * Where a purchase flow started, for its Back buttons: "c" from "Connect a
 * device" (back ends on the menu), "w" from "Balance & plans".
 */
export type Origin = "c" | "w";

export type LavaCurrencyChoice = "USD" | "EUR";

const TERMS: readonly Term[] = [1, 6, 12];
const TOPUP_METHODS: readonly TopupMethod[] = ["card", "cryptobot", "crypto", "lava"];

export type V2Action =
  | { a: "home" }
  | { a: "connect" }
  | { a: "new"; device: DeviceKind }
  | { a: "devs" }
  | { a: "dev"; uuid: string }
  | { a: "qr"; uuid: string }
  | { a: "qrhide" }
  | { a: "del"; uuid: string }
  | { a: "delok"; uuid: string }
  | { a: "wallet" }
  | { a: "plans"; from: Origin }
  | { a: "terms"; kind: PlanKind; from: Origin }
  | { a: "slot"; from: Origin }
  | { a: "order"; product: ProductKey; term: Term; from: Origin }
  | { a: "pay"; product: ProductKey; term: Term; nonce: string; from: Origin }
  | { a: "renew" }
  | { a: "topup" }
  | { a: "topfor"; product: ProductKey; term: Term; from: Origin }
  | { a: "topm"; method: TopupMethod }
  | { a: "topa"; method: TopupMethod; cents: number }
  | { a: "topx"; method: TopupMethod }
  | { a: "lava"; cents: number; method: LavaMethodId; currency: LavaCurrencyChoice }
  | { a: "promo" }
  | { a: "invite" }
  | { a: "help" }
  | { a: "lang" }
  | { a: "setlang"; lang: BotLang };

export const CALLBACK_PREFIX = "k:";
/** Telegram's limit on callback_data, in bytes. */
export const CALLBACK_MAX_BYTES = 64;

const UUID_RE = /^[A-Za-z0-9-]{8,64}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{6,16}$/;
/** Top-up amounts in cents: $1 … $1000 (the method's own minimum is checked later). */
const MIN_CENTS = 100;
const MAX_CENTS = 100_000;

function isDevice(v: string | undefined): v is DeviceKind {
  return v !== undefined && (DEVICE_KINDS as readonly string[]).includes(v);
}
function isProduct(v: string | undefined): v is ProductKey {
  return v !== undefined && (PRODUCT_KEYS as readonly string[]).includes(v);
}
function isPlanKind(v: string | undefined): v is PlanKind {
  return v === "plan1" || v === "plan3";
}
function isMethod(v: string | undefined): v is TopupMethod {
  return v !== undefined && (TOPUP_METHODS as readonly string[]).includes(v);
}
function isLang(v: string | undefined): v is BotLang {
  return v !== undefined && (BOT_LANGS as readonly string[]).includes(v);
}
function isUuid(v: string | undefined): v is string {
  return v !== undefined && UUID_RE.test(v);
}
function parseTerm(v: string | undefined): Term | null {
  if (v === undefined || !/^[0-9]{1,2}$/.test(v)) return null;
  const n = Number(v);
  return (TERMS as readonly number[]).includes(n) ? (n as Term) : null;
}
function parseCents(v: string | undefined): number | null {
  if (v === undefined || !/^[0-9]{1,6}$/.test(v)) return null;
  const n = Number(v);
  return n >= MIN_CENTS && n <= MAX_CENTS ? n : null;
}
/** Legacy amounts were dollars, possibly with a fraction ("12.5"). */
function parseLegacyDollars(v: string | undefined): number | null {
  if (v === undefined || !/^[0-9]{1,4}(\.[0-9]{1,2})?$/.test(v)) return null;
  return parseCents(String(Math.round(Number(v) * 100)));
}
function parseOrigin(v: string | undefined): Origin | null {
  if (v === undefined || v === "w") return "w";
  return v === "c" ? "c" : null;
}
function parseLavaMethod(v: string | undefined): LavaMethodId | null {
  if (v === undefined) return null;
  const spec = lavaMethod(v);
  // Bancontact needs the payer's full name, which the bot never asks for.
  return spec !== null && spec.needsFullName !== true ? spec.id : null;
}
function parseLavaCurrency(v: string | undefined): LavaCurrencyChoice | null {
  return v === "USD" || v === "EUR" ? v : null;
}

/** Encode an action as callback_data. Throws if the result exceeds Telegram's 64 bytes (a bug, never user input). */
export function cb(action: V2Action): string {
  const data = CALLBACK_PREFIX + encodeBody(action);
  if (Buffer.byteLength(data, "utf8") > CALLBACK_MAX_BYTES) {
    throw new Error(`bot-v2: callback_data over ${CALLBACK_MAX_BYTES} bytes: ${data}`);
  }
  return data;
}

function withOrigin(body: string, from: Origin): string {
  return from === "c" ? `${body}:c` : body;
}

function encodeBody(x: V2Action): string {
  switch (x.a) {
    case "home":
    case "connect":
    case "devs":
    case "qrhide":
    case "wallet":
    case "renew":
    case "topup":
    case "promo":
    case "invite":
    case "help":
    case "lang":
      return x.a;
    case "new":
      return `new:${x.device}`;
    case "dev":
    case "qr":
    case "del":
    case "delok":
      return `${x.a}:${x.uuid}`;
    case "plans":
      return withOrigin("plans", x.from);
    case "terms":
      return withOrigin(`terms:${x.kind}`, x.from);
    case "slot":
      return withOrigin("slot", x.from);
    case "order":
      return withOrigin(`ord:${x.product}:${x.term}`, x.from);
    case "pay":
      return withOrigin(`pay:${x.product}:${x.term}:${x.nonce}`, x.from);
    case "topfor":
      return withOrigin(`topfor:${x.product}:${x.term}`, x.from);
    case "topm":
      return `topm:${x.method}`;
    case "topa":
      return `topa:${x.method}:${x.cents}`;
    case "topx":
      return `topx:${x.method}`;
    case "lava":
      return `lava:${x.cents}:${x.method}:${x.currency}`;
    case "setlang":
      return `lang:${x.lang}`;
  }
}

const SIMPLE: Readonly<Record<string, V2Action>> = {
  home: { a: "home" },
  connect: { a: "connect" },
  devs: { a: "devs" },
  qrhide: { a: "qrhide" },
  wallet: { a: "wallet" },
  renew: { a: "renew" },
  topup: { a: "topup" },
  promo: { a: "promo" },
  invite: { a: "invite" },
  help: { a: "help" },
  lang: { a: "lang" },
};

function parseV2(body: string): V2Action | null {
  const simple = SIMPLE[body];
  if (simple) return simple;
  const p = body.split(":");
  const [head] = p;
  switch (head) {
    case "new":
      return p.length === 2 && isDevice(p[1]) ? { a: "new", device: p[1] } : null;
    case "dev":
    case "qr":
    case "del":
    case "delok":
      return p.length === 2 && isUuid(p[1]) ? { a: head, uuid: p[1] } : null;
    case "plans": {
      const from = p.length <= 2 ? parseOrigin(p[1]) : null;
      return from ? { a: "plans", from } : null;
    }
    case "terms": {
      const from = p.length <= 3 ? parseOrigin(p[2]) : null;
      return isPlanKind(p[1]) && from ? { a: "terms", kind: p[1], from } : null;
    }
    case "slot": {
      const from = p.length <= 2 ? parseOrigin(p[1]) : null;
      return from ? { a: "slot", from } : null;
    }
    case "ord":
    case "topfor": {
      const term = parseTerm(p[2]);
      const from = p.length <= 4 ? parseOrigin(p[3]) : null;
      if (!isProduct(p[1]) || term === null || !from) return null;
      return head === "ord"
        ? { a: "order", product: p[1], term, from }
        : { a: "topfor", product: p[1], term, from };
    }
    case "pay": {
      const term = parseTerm(p[2]);
      const nonce = p[3];
      const from = p.length <= 5 ? parseOrigin(p[4]) : null;
      if (!isProduct(p[1]) || term === null || nonce === undefined || !NONCE_RE.test(nonce) || !from) return null;
      return { a: "pay", product: p[1], term, nonce, from };
    }
    case "topm":
    case "topx":
      return p.length === 2 && isMethod(p[1]) ? { a: head, method: p[1] } : null;
    case "topa": {
      const cents = parseCents(p[2]);
      return p.length === 3 && isMethod(p[1]) && cents !== null ? { a: "topa", method: p[1], cents } : null;
    }
    case "lava": {
      const cents = parseCents(p[1]);
      const method = parseLavaMethod(p[2]);
      const currency = parseLavaCurrency(p[3]);
      return p.length === 4 && cents !== null && method && currency ? { a: "lava", cents, method, currency } : null;
    }
    case "lang":
      return p.length === 2 && isLang(p[1]) ? { a: "setlang", lang: p[1] } : null;
    default:
      return null;
  }
}

/** Buttons of the old interface, mapped onto new actions (see the header). */
function parseLegacy(data: string): V2Action | null {
  switch (data) {
    case "menu":
      return { a: "home" };
    case "account":
    case "pricing":
      return { a: "wallet" };
    case "profiles":
      return { a: "devs" };
    case "create":
      return { a: "connect" };
    case "guide":
    case "help":
    case "docs":
      return { a: "help" };
    case "referral":
      return { a: "invite" };
    case "promo":
      return { a: "promo" };
    case "topup":
      return { a: "topup" };
    case "buyplan":
      return { a: "plans", from: "w" };
    case "adddev":
      return { a: "slot", from: "w" };
    case "lang":
      return { a: "lang" };
  }
  const us = data.indexOf("_");
  const head = us === -1 ? data : data.slice(0, us);
  const rest = us === -1 ? "" : data.slice(us + 1);
  switch (head) {
    case "dev":
      return isDevice(rest) ? { a: "new", device: rest } : null;
    case "link":
      return isUuid(rest) ? { a: "dev", uuid: rest } : null;
    case "del":
      return isUuid(rest) ? { a: "del", uuid: rest } : null;
    case "cdel":
      return isUuid(rest) ? { a: "delok", uuid: rest } : null;
    case "setlang":
      return isLang(rest) ? { a: "setlang", lang: rest } : null;
    case "copy":
      return rest.startsWith("ref_") ? { a: "invite" } : null;
    case "buyplan":
      return isPlanKind(rest) ? { a: "terms", kind: rest, from: "w" } : null;
    case "buyterm": {
      const [kind, t] = rest.split("_");
      const term = parseTerm(t);
      return isPlanKind(kind) && term !== null ? { a: "order", product: kind, term, from: "w" } : null;
    }
    case "adddev": {
      // adddev_<term> or adddev_<term>_<nonce>
      const term = parseTerm(rest.split("_")[0]);
      return term !== null ? { a: "order", product: "slot", term, from: "w" } : null;
    }
    case "topup": {
      // topup_m_<method>
      const [m, method] = rest.split("_");
      return m === "m" && isMethod(method) ? { a: "topm", method } : null;
    }
    case "tu": {
      // tu_<method>_<dollars> | tu_<method>_manual
      const [method, val] = rest.split("_");
      if (!isMethod(method)) return null;
      if (val === "manual") return { a: "topx", method };
      const cents = parseLegacyDollars(val);
      return cents !== null ? { a: "topa", method, cents } : null;
    }
    case "lv": {
      // lv_<dollars>_<method>_<currency>
      const [amt, method, cur] = rest.split("_");
      const cents = parseLegacyDollars(amt);
      const m = parseLavaMethod(method);
      const currency = parseLavaCurrency(cur);
      return cents !== null && m && currency ? { a: "lava", cents, method: m, currency } : null;
    }
    default:
      return null;
  }
}

/**
 * Parse any callback_data a v2 chat can send: a new "k:" action or a button
 * of the old interface. Null for anything else (the caller shows the menu).
 */
export function parseCallback(data: unknown): V2Action | null {
  if (typeof data !== "string" || data.length === 0 || Buffer.byteLength(data, "utf8") > CALLBACK_MAX_BYTES) {
    return null;
  }
  if (data.startsWith(CALLBACK_PREFIX)) return parseV2(data.slice(CALLBACK_PREFIX.length));
  return parseLegacy(data);
}

/** Is this callback_data from the new interface? (The old router shows its menu for these.) */
export function isV2CallbackData(data: unknown): boolean {
  return typeof data === "string" && data.startsWith(CALLBACK_PREFIX);
}

// src/lib/bot-v2/screens.ts
//
// Every screen of the new bot interface as a pure function: a view model in,
// Telegram HTML and a keyboard out. No I/O, so the tests and the offline
// screen harness (scripts/bot-screens.mjs) render exactly what a person sees.
//
// Layout rules, the same on every screen:
//   • a bold title line with one icon, then at most a few short lines;
//   • the main action first, full width; pairs of secondary actions per row;
//   • "← Back" last, alone, to the screen's one parent (listed per screen).

import { LANG_NAMES, BOT_LANGS, type BotLang } from "../bot-i18n";
import { PLAN_PRICES, DEVICE_ADDON_PRICE, REFERRAL_REWARD_DAYS, type PlanKind, type Term } from "../subscriptions";
import { productPriceCents } from "../wallet-purchase";
import type { TopupMethod } from "../wallet-topup";
import type { LavaMethodId } from "../lava-methods";
import { cb, DEVICE_KINDS, type DeviceKind, type Origin, type ProductKey, type V2Action, type LavaCurrencyChoice } from "./callbacks";
import { escapeHtml, fmtDate, fmtUsd, fmtUsdShort, tr, type V2Key } from "./i18n";
import {
  HELP_LINKS,
  SUPPORT_EMAIL,
  addToHappUrl,
  happDownloads,
  miniAppPageUrl,
  setupGuideUrl,
  legalUrl,
  shareUrl,
} from "./links";
import type { InlineButton, Keyboard, Screen } from "./telegram";

// ─── View models ────────────────────────────────────────────────────────────

export interface DeviceView {
  uuid: string;
  kind: DeviceKind | null;
  /** "iPhone", "iPhone 2", localized. */
  label: string;
  /**
   * More devices than running slots and this one is not among the newest
   * (lib/device-capacity.ts): paused, not deleted. Absent = not paused.
   */
  paused?: boolean;
  /** End of the slot this device holds; absent or 0 = use the account's. */
  until?: number;
}

export interface AccountView {
  balanceCents: number;
  /** Device slots of every running subscription. */
  activeSlots: number;
  /** Furthest running expiry, 0 when nothing runs. */
  activeUntil: number;
  /** Most recent expiry ever, for "ended on …"; 0 for a new account. */
  lastExpiry: number;
  /** The plan tier that runs now, or null. */
  planKind: PlanKind | null;
  /** When the running plan tier ends (0 without one). */
  planUntil: number;
  /** The tier of the most recent plan, running or not, for "Renew". */
  lastPlanKind: PlanKind | null;
  devices: DeviceView[];
}

export const PLAN_ICON: Readonly<Record<PlanKind, string>> = { plan1: "👤", plan3: "👥" };
export const DEVICE_ICON: Readonly<Record<DeviceKind, string>> = {
  android: "🤖",
  iphone: "🍎",
  mac: "💻",
  windows: "🪟",
  tv: "📺",
};

const b = (text: string, action: V2Action): InlineButton => ({ text, callback_data: cb(action) });
const url = (text: string, href: string): InlineButton => ({ text, url: href });
const back = (lang: BotLang, to: V2Action): InlineButton[] => [b(tr("btn.back", lang), to)];

function lines(...parts: (string | null | false | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === "string").join("\n");
}

function isActive(v: AccountView): boolean {
  return v.activeUntil > 0;
}

/** Where Back leads from the first screen of a purchase flow started at `from`. */
function originParent(from: Origin): V2Action {
  return from === "c" ? { a: "home" } : from === "d" ? { a: "devs" } : { a: "wallet" };
}

/** "Extra slot" is sold only on top of a running plan (lib/wallet-purchase.ts). */
function slotButton(v: AccountView, lang: BotLang, from: Origin): InlineButton | null {
  return v.planKind ? b(tr("btn.addslot", lang, { price: fmtUsdShort(SLOT_MONTH_CENTS) }), { a: "slot", from }) : null;
}

export function planName(kind: PlanKind, lang: BotLang): string {
  return tr(kind === "plan3" ? "plan.plan3" : "plan.plan1", lang);
}

export function deviceName(kind: DeviceKind | null, lang: BotLang): string {
  if (kind === null) return tr("dev.other", lang);
  const key: Record<DeviceKind, V2Key> = {
    android: "dev.android",
    iphone: "dev.iphone",
    mac: "dev.mac",
    windows: "dev.windows",
    tv: "dev.tv",
  };
  return tr(key[kind], lang);
}

function termName(term: Term, lang: BotLang): string {
  return tr(term === 1 ? "term.1" : term === 6 ? "term.6" : "term.12", lang);
}

/** "3 devices · 6 months" / "Extra slot · 6 months". */
export function productSummary(product: ProductKey, term: Term, lang: BotLang): string {
  if (product === "slot") return tr("sum.slot", lang, { term: termName(term, lang) });
  return tr("sum.plan", lang, { plan: planName(product, lang), term: termName(term, lang) });
}

export function productCents(product: ProductKey, term: Term): number {
  return productPriceCents({ kind: product === "slot" ? "device" : product, term });
}

function perMonthCents(kind: PlanKind, term: Term): number {
  return Math.round(PLAN_PRICES[kind][term].perMonth * 100);
}

const SLOT_MONTH_CENTS = Math.round(DEVICE_ADDON_PRICE * 100);
const TERMS: readonly Term[] = [1, 6, 12];

function pairs(buttons: InlineButton[]): Keyboard {
  const rows: Keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
}

/** A notice line above a screen ("✅ iPhone removed."), already HTML. */
function withNotice(notice: string | undefined, body: string): string {
  return notice ? `${notice}\n\n${body}` : body;
}

// ─── Home ───────────────────────────────────────────────────────────────────
// Parent: none. Six buttons at most.

export function homeScreen(v: AccountView, lang: BotLang, now: number, notice?: string): Screen {
  const used = v.devices.length;
  let status: string;
  let details: string | null = null;
  let hint: string | null = null;
  if (isActive(v)) {
    status = tr("home.active", lang, { date: fmtDate(v.activeUntil, lang) });
    details = tr("home.devices", lang, { used, slots: v.activeSlots });
    if (used === 0) hint = tr("home.hintFirst", lang);
  } else if (v.lastExpiry > 0 && v.lastExpiry <= now) {
    status = tr("home.ended", lang, { date: fmtDate(v.lastExpiry, lang) });
    if (used > 0) details = tr("home.paused", lang, { used });
    hint = tr("home.hintEnded", lang);
  } else {
    status = tr("home.none", lang);
    hint = tr("home.hintNone", lang);
  }
  const text = withNotice(
    notice,
    lines(tr("home.head", lang), "", status, details, tr("home.balance", lang, { bal: fmtUsd(v.balanceCents) }), hint && "", hint),
  );
  return {
    text,
    kb: [
      [{ text: tr("btn.open", lang), web_app: { url: miniAppPageUrl(lang) } }],
      [b(tr("btn.connect", lang), { a: "connect" }), b(tr("btn.devices", lang), { a: "devs" })],
      [b(tr("btn.wallet", lang), { a: "wallet" }), b(tr("btn.help", lang), { a: "help" })],
      [b(tr("btn.lang", lang, { name: LANG_NAMES[lang] }), { a: "lang" })],
    ],
  };
}

// ─── Connect ────────────────────────────────────────────────────────────────
// Parent: home. Without a plan it IS the plan choice (plansScreen from "c").

export function connectScreen(v: AccountView, lang: BotLang): Screen {
  if (!isActive(v) || v.activeSlots === 0) return plansScreen(v, lang, "c");
  const free = v.activeSlots - v.devices.length;
  if (free <= 0) {
    const slot = slotButton(v, lang, "c");
    return {
      text: lines(
        tr("connect.title", lang),
        "",
        tr("connect.full", lang, { used: v.devices.length, slots: v.activeSlots, price: fmtUsdShort(SLOT_MONTH_CENTS) }),
      ),
      kb: [
        slot ? [slot] : [b(tr("btn.buy", lang), { a: "plans", from: "c" })],
        [b(tr("btn.devices", lang), { a: "devs" })],
        back(lang, { a: "home" }),
      ],
    };
  }
  const picks = DEVICE_KINDS.map((d) => b(`${DEVICE_ICON[d]} ${deviceName(d, lang)}`, { a: "new", device: d }));
  return {
    text: lines(tr("connect.title", lang), "", tr("connect.pick", lang, { free, slots: v.activeSlots })),
    kb: [...pairs(picks), back(lang, { a: "home" })],
  };
}

/**
 * While the device is being created: one short line and a way out. Back is
 * harmless meanwhile (the creation finishes and draws the device anyway), and
 * a chat is never left on a frame without buttons if the request dies.
 */
export function creatingScreen(device: DeviceKind, lang: BotLang): Screen {
  return { text: tr("connect.creating", lang, { dev: deviceName(device, lang) }), kb: [back(lang, { a: "devs" })] };
}

export type CreateFailure = "busy" | "unavailable";

export function createFailedScreen(device: DeviceKind, reason: CreateFailure, lang: BotLang): Screen {
  return {
    text: lines(
      tr("connect.failTitle", lang, { dev: deviceName(device, lang) }),
      "",
      tr(reason === "busy" ? "connect.failBusy" : "connect.failDown", lang),
    ),
    kb: [[b(tr("btn.retry", lang), { a: "new", device })], back(lang, { a: "connect" })],
  };
}

// ─── Devices ────────────────────────────────────────────────────────────────
// Parent: home.

/** Paused for want of a slot, while a plan or slot still runs (not "the plan ended"). */
function slotPaused(v: AccountView, d: DeviceView): boolean {
  return isActive(v) && d.paused === true;
}

export function devicesScreen(v: AccountView, lang: BotLang, notice?: string): Screen {
  const used = v.devices.length;
  const pausedCount = v.devices.filter((d) => slotPaused(v, d)).length;
  const body =
    used === 0
      ? lines(tr("devs.title", lang), "", tr("devs.empty", lang))
      : lines(
          tr("devs.title", lang),
          "",
          isActive(v)
            ? tr("devs.count", lang, { used, slots: v.activeSlots })
            : tr("devs.paused", lang),
          ...(pausedCount > 0 ? [tr("devs.slotPaused", lang, { n: pausedCount })] : []),
          tr("devs.pick", lang),
        );
  const deviceButtons = v.devices.map((d) =>
    b(`${slotPaused(v, d) ? "⏸" : d.kind ? DEVICE_ICON[d.kind] : "📱"} ${d.label}`, { a: "dev", uuid: d.uuid }),
  );
  const kb: Keyboard = [...pairs(deviceButtons)];
  // A plan that ended: renew it. Never had one: "Connect" leads to the plans.
  // All slots in use: one more slot, on top of a running plan.
  if (!isActive(v) && (v.lastPlanKind || v.lastExpiry > 0)) kb.push([b(tr("btn.renew", lang), { a: "renew", from: "d" })]);
  else if (!isActive(v) || used < v.activeSlots) kb.push([b(tr("btn.connect", lang), { a: "connect" })]);
  else {
    const slot = slotButton(v, lang, "d");
    kb.push([slot ?? b(tr("btn.buy", lang), { a: "plans", from: "d" })]);
  }
  kb.push(back(lang, { a: "home" }));
  return { text: withNotice(notice, body), kb };
}

export interface DeviceDetail extends DeviceView {
  /** The subscription link the app imports (plain /api/sub/<token>). */
  subUrl: string;
  subToken: string;
}

/** One device: its key, one-tap import, QR, instructions. Parent: devices. */
export function deviceScreen(v: AccountView, d: DeviceDetail, lang: BotLang, notice?: string): Screen {
  const tv = d.kind === "tv";
  const icon = d.kind ? DEVICE_ICON[d.kind] : "📱";
  const noSlot = slotPaused(v, d);
  const status = !isActive(v)
    ? [tr("dev.paused", lang)]
    : noSlot
      ? [tr("dev.slotPaused", lang), tr("dev.slotHow", lang)]
      : [tr("dev.active", lang, { date: fmtDate(d.until && d.until > 0 ? d.until : v.activeUntil, lang) })];
  const body = lines(
    tr("dev.title", lang, { icon, dev: d.label }),
    ...status,
    "",
    tr(tv ? "dev.stepsTv" : "dev.steps", lang),
    "",
    tr("dev.key", lang),
    `<code>${escapeHtml(d.subUrl)}</code>`,
    tr("dev.private", lang),
  );
  const dl = happDownloads(d.kind);
  const kb: Keyboard = [];
  if (!isActive(v)) kb.push([b(tr("btn.renew", lang), { a: "renew", from: "d" })]);
  else if (noSlot) kb.push([slotButton(v, lang, "d") ?? b(tr("btn.buy", lang), { a: "plans", from: "d" })]);
  if (!tv) kb.push([url(tr("btn.addHapp", lang), addToHappUrl(d.subToken, lang))]);
  if (dl.main) kb.push([url(tr("btn.getHapp", lang), dl.main), b(tr("btn.qr", lang), { a: "qr", uuid: d.uuid })]);
  else {
    kb.push([url("📥 Android TV", dl.androidTv ?? ""), url("📥 Apple TV", dl.appleTv ?? "")]);
    kb.push([b(tr("btn.qr", lang), { a: "qr", uuid: d.uuid })]);
  }
  kb.push([url(tr("btn.guide", lang), setupGuideUrl(d.kind, lang)), b(tr("btn.remove", lang), { a: "del", uuid: d.uuid })]);
  kb.push(back(lang, { a: "devs" }));
  return { text: withNotice(notice, body), kb };
}

/** Caption and keyboard of the QR photo (a separate message; "Hide" deletes it). */
export function qrPhoto(label: string, lang: BotLang): Screen {
  return { text: tr("qr.caption", lang, { dev: label }), kb: [[b(tr("btn.hide", lang), { a: "qrhide" })]] };
}

/** Parent: the device. */
export function deleteConfirmScreen(d: DeviceView, lang: BotLang): Screen {
  return {
    text: lines(tr("del.title", lang, { dev: d.label }), "", tr("del.text", lang)),
    kb: [[b(tr("btn.removeYes", lang), { a: "delok", uuid: d.uuid })], back(lang, { a: "dev", uuid: d.uuid })],
  };
}

/** While a device is being removed. Back is harmless (see creatingScreen). */
export function deletingScreen(label: string, lang: BotLang): Screen {
  return { text: tr("del.progress", lang, { dev: label }), kb: [back(lang, { a: "devs" })] };
}

/** The QR code could not be sent: back to the device, where the link is. */
export function qrFailScreen(uuid: string, lang: BotLang): Screen {
  return { text: tr("qr.fail", lang), kb: [back(lang, { a: "dev", uuid })] };
}

// ─── Balance & plans ────────────────────────────────────────────────────────
// Parent: home.

export function walletScreen(v: AccountView, lang: BotLang): Screen {
  let planLine: string;
  if (v.planKind) planLine = tr("bal.plan", lang, { plan: planName(v.planKind, lang), date: fmtDate(v.planUntil, lang) });
  else if (isActive(v)) planLine = tr("bal.access", lang, { date: fmtDate(v.activeUntil, lang) });
  else if (v.lastExpiry > 0) planLine = tr("bal.ended", lang, { date: fmtDate(v.lastExpiry, lang) });
  else planLine = tr("bal.none", lang);
  const text = lines(
    tr("bal.title", lang),
    "",
    tr("bal.balance", lang, { bal: fmtUsd(v.balanceCents) }),
    planLine,
    isActive(v) ? tr("bal.devices", lang, { used: v.devices.length, slots: v.activeSlots }) : null,
    "",
    tr("bal.note", lang),
  );
  const main =
    v.planKind || v.lastPlanKind ? b(tr("btn.renew", lang), { a: "renew", from: "w" }) : b(tr("btn.buy", lang), { a: "plans", from: "w" });
  const slot = slotButton(v, lang, "w");
  return {
    text,
    kb: [
      [main],
      ...(slot ? [[slot]] : []),
      [b(tr("btn.topup", lang), { a: "topup" }), b(tr("btn.promo", lang), { a: "promo" })],
      [b(tr("btn.invite", lang), { a: "invite" })],
      back(lang, { a: "home" }),
    ],
  };
}

/** The plan choice. Parent: home from "Connect" (c), Balance & plans (w), the devices (d). */
export function plansScreen(v: AccountView, lang: BotLang, from: Origin): Screen {
  const kinds: readonly PlanKind[] = ["plan1", "plan3"];
  const text = lines(
    tr("plans.title", lang),
    from === "c" ? tr("plans.leadConnect", lang) : null,
    "",
    ...kinds.map((k) =>
      tr("plans.line", lang, { icon: PLAN_ICON[k], plan: planName(k, lang), per: fmtUsd(perMonthCents(k, 12)) }),
    ),
    "",
    tr("plans.hint", lang),
    tr("plans.balance", lang, { bal: fmtUsd(v.balanceCents) }),
  );
  return {
    text,
    kb: [
      kinds.map((k) => b(`${PLAN_ICON[k]} ${planName(k, lang)}`, { a: "terms", kind: k, from })),
      back(lang, originParent(from)),
    ],
  };
}

/** Terms of one tier; a renewal while that tier runs. Parent: plans (or wallet for a renewal). */
export function termsScreen(v: AccountView, kind: PlanKind, lang: BotLang, from: Origin): Screen {
  const renewal = v.planKind === kind;
  const head = renewal
    ? lines(
        tr("terms.renewTitle", lang, { plan: planName(kind, lang) }),
        tr("terms.renewText", lang, { date: fmtDate(v.planUntil, lang) }),
      )
    : tr("terms.title", lang, { icon: PLAN_ICON[kind], plan: planName(kind, lang) });
  const rows: Keyboard = TERMS.map((term) => {
    const total = fmtUsd(productCents(kind, term));
    const text =
      term === 1
        ? tr("btn.term1", lang, { total })
        : tr("btn.termN", lang, { n: term, total, per: fmtUsd(perMonthCents(kind, term)) });
    return [b(text, { a: "order", product: kind, term, from })];
  });
  const parent: V2Action = renewal ? originParent(from) : { a: "plans", from };
  return {
    text: lines(head, tr("terms.balance", lang, { bal: fmtUsd(v.balanceCents) }), "", tr("terms.pick", lang)),
    kb: [...rows, back(lang, parent)],
  };
}

/** An extra device slot, 1/6/12 months. Parent: connect (c), wallet (w) or the devices (d). */
export function slotScreen(v: AccountView, lang: BotLang, from: Origin): Screen {
  const buttons = TERMS.map((term) => {
    const total = fmtUsd(productCents("slot", term));
    const text = term === 1 ? tr("btn.term1", lang, { total }) : tr("btn.slotN", lang, { n: term, total });
    return b(text, { a: "order", product: "slot", term, from });
  });
  return {
    text: lines(
      tr("slot.title", lang),
      tr("slot.text", lang, { price: fmtUsdShort(SLOT_MONTH_CENTS) }),
      tr("terms.balance", lang, { bal: fmtUsd(v.balanceCents) }),
    ),
    kb: [...buttons.map((x) => [x]), back(lang, from === "c" ? { a: "connect" } : originParent(from))],
  };
}

/**
 * The order: price and what the balance will be. With enough money, one
 * "Pay" button (its nonce makes a double tap idempotent); otherwise the
 * missing amount and a top-up. Parent: the term list it came from.
 */
export function orderScreen(
  v: AccountView,
  product: ProductKey,
  term: Term,
  nonce: string,
  lang: BotLang,
  from: Origin,
): Screen {
  const price = productCents(product, term);
  const enough = v.balanceCents >= price;
  const renewal = product !== "slot" && v.planKind === product;
  const text = lines(
    tr("ord.title", lang, { summary: productSummary(product, term, lang) }),
    renewal ? tr("ord.renew", lang) : null,
    "",
    tr("ord.price", lang, { price: fmtUsd(price) }),
    enough
      ? tr("ord.after", lang, { bal: fmtUsd(v.balanceCents), after: fmtUsd(v.balanceCents - price) })
      : tr("ord.short", lang, { bal: fmtUsd(v.balanceCents), need: fmtUsd(price - v.balanceCents) }),
    enough ? null : "",
    enough ? null : tr("ord.hint", lang),
  );
  const parent: V2Action = product === "slot" ? { a: "slot", from } : { a: "terms", kind: product, from };
  const main = enough
    ? b(tr("btn.pay", lang, { price: fmtUsd(price) }), { a: "pay", product, term, nonce, from })
    : b(tr("btn.topupNeed", lang, { need: fmtUsd(price - v.balanceCents) }), { a: "topfor", product, term, from });
  return { text, kb: [[main], back(lang, parent)] };
}

/** After a successful payment. Parent: home. */
export function paidScreen(v: AccountView, product: ProductKey, term: Term, lang: BotLang): Screen {
  const free = isActive(v) ? v.activeSlots - v.devices.length : 0;
  const text = lines(
    tr("paid.title", lang, { summary: productSummary(product, term, lang) }),
    isActive(v) ? tr("paid.until", lang, { date: fmtDate(v.activeUntil, lang) }) : null,
    tr("paid.balance", lang, { bal: fmtUsd(v.balanceCents) }),
    free > 0 ? "" : null,
    free > 0 ? tr("paid.next", lang) : null,
  );
  const kb: Keyboard = [];
  if (free > 0) kb.push([b(tr("btn.connect", lang), { a: "connect" })]);
  kb.push([b(tr("btn.devices", lang), { a: "devs" })]);
  kb.push(back(lang, { a: "home" }));
  return { text, kb };
}

export type PayProblem = "other_plan" | "no_plan" | "refunded" | "stuck" | "failed";

/** A purchase that did not go through. Parent: the order's own parent. */
export function payProblemScreen(
  problem: PayProblem,
  lang: BotLang,
  retry: V2Action,
  activePlan: PlanKind | null,
): Screen {
  if (problem === "other_plan" && activePlan) {
    return {
      text: tr("pay.otherPlan", lang, { plan: planName(activePlan, lang) }),
      kb: [
        [b(tr("btn.renew", lang), { a: "terms", kind: activePlan, from: "w" })],
        [b(tr("btn.addslot", lang, { price: fmtUsdShort(SLOT_MONTH_CENTS) }), { a: "slot", from: "w" })],
        back(lang, { a: "wallet" }),
      ],
    };
  }
  if (problem === "no_plan") {
    return {
      text: tr("pay.noPlan", lang),
      kb: [[b(tr("btn.buy", lang), { a: "plans", from: "w" })], back(lang, { a: "wallet" })],
    };
  }
  const key: V2Key = problem === "refunded" ? "pay.refunded" : problem === "stuck" ? "pay.stuck" : "pay.failed";
  return { text: tr(key, lang, { email: SUPPORT_EMAIL }), kb: [back(lang, retry)] };
}

// ─── Top up ─────────────────────────────────────────────────────────────────

export interface TopupMethodView {
  id: TopupMethod;
  minUsd: number;
}

export interface PendingOrderView {
  product: ProductKey;
  term: Term;
  needCents: number;
}

const METHOD_KEY: Readonly<Record<TopupMethod, V2Key>> = {
  card: "m.card",
  cryptobot: "m.cryptobot",
  crypto: "m.crypto",
  lava: "m.lava",
};

export function methodLabel(method: TopupMethod, lang: BotLang): string {
  return tr(METHOD_KEY[method], lang);
}

/** Payment methods (only the configured ones). Parent: wallet, or the order it tops up for. */
export function topupScreen(
  v: AccountView,
  methods: readonly TopupMethodView[],
  lang: BotLang,
  pending: (PendingOrderView & { from: Origin }) | null,
): Screen {
  const parent: V2Action = pending
    ? { a: "order", product: pending.product, term: pending.term, from: pending.from }
    : { a: "wallet" };
  const text = lines(
    tr("top.title", lang),
    "",
    tr("top.balance", lang, { bal: fmtUsd(v.balanceCents) }),
    pending && pending.needCents > 0
      ? tr("top.for", lang, { summary: productSummary(pending.product, pending.term, lang), need: fmtUsd(pending.needCents) })
      : null,
    "",
    methods.length > 0 ? tr("top.pick", lang) : tr("top.none", lang),
  );
  return {
    text,
    kb: [
      ...methods.map((m) => [
        b(tr("btn.method", lang, { label: methodLabel(m.id, lang), min: `$${m.minUsd}` }), { a: "topm", method: m.id }),
      ]),
      back(lang, parent),
    ],
  };
}

/** Amounts for one method; with a pending order, its missing amount first. Parent: top-up. */
export function topupAmountScreen(
  method: TopupMethod,
  minUsd: number,
  maxUsd: number,
  quickUsd: readonly number[],
  lang: BotLang,
  needCents: number,
): Screen {
  const buttons: InlineButton[] = [];
  const quick = quickUsd.filter((a) => a >= minUsd && a <= maxUsd);
  const kb: Keyboard = [];
  if (needCents > 0) {
    // Whole dollars, at least the method's minimum.
    const needUsd = Math.min(maxUsd, Math.max(minUsd, Math.ceil(needCents / 100)));
    kb.push([b(tr("btn.amountNeed", lang, { amount: `$${needUsd}` }), { a: "topa", method, cents: needUsd * 100 })]);
  }
  for (const a of quick) buttons.push(b(`$${a}`, { a: "topa", method, cents: a * 100 }));
  kb.push(...pairs(buttons));
  kb.push([b(tr("btn.amountOther", lang), { a: "topx", method })]);
  kb.push(back(lang, { a: "topup" }));
  return {
    text: lines(`<b>${escapeHtml(methodLabel(method, lang))}</b>`, "", tr("topm.range", lang, { min: `$${minUsd}`, max: `$${maxUsd}` })),
    kb,
  };
}

/** "Send the amount as a message". Parent: the method's amounts. */
export function topupManualScreen(method: TopupMethod, minUsd: number, maxUsd: number, lang: BotLang, bad = false): Screen {
  const range = { min: `$${minUsd}`, max: `$${maxUsd}` };
  return {
    text: bad ? lines(tr("topx.bad", lang, range), "", tr("topx.ask", lang, range)) : tr("topx.ask", lang, range),
    kb: [back(lang, { a: "topm", method })],
  };
}

/** The invoice: one pay button. Parent: the method's amounts. */
export function invoiceScreen(
  method: TopupMethod,
  amountCents: number,
  payUrl: string,
  payLabel: string,
  lang: BotLang,
): Screen {
  const how: V2Key =
    method === "card" ? "inv.card" : method === "cryptobot" ? "inv.cryptobot" : method === "lava" ? "inv.lava" : "inv.crypto";
  return {
    text: lines(tr("inv.title", lang, { amount: fmtUsd(amountCents) }), "", tr(how, lang), tr("inv.auto", lang)),
    kb: [[url(tr("btn.payUrl", lang, { amount: payLabel }), payUrl)], back(lang, { a: "topm", method })],
  };
}

export function invoiceErrorScreen(method: TopupMethod, lang: BotLang): Screen {
  return { text: tr("inv.err", lang), kb: [back(lang, { a: "topm", method })] };
}

export interface LavaChoiceView {
  id: LavaMethodId;
  currency: LavaCurrencyChoice;
  /** What the provider will charge, e.g. "€9.20". */
  charge: string;
}

const LAVA_LABEL: Readonly<Partial<Record<LavaMethodId, string>>> = {
  paypal: "🅿️ PayPal",
  applepay: "🍎 Apple Pay",
  pix: "🇧🇷 Pix",
  sepa: "🇪🇺 SEPA",
  ideal: "🇳🇱 iDEAL",
  mbway: "🇵🇹 MB WAY",
};

export function lavaLabel(id: LavaMethodId, lang: BotLang): string | null {
  if (id === "card") return tr("lava.card", lang);
  return LAVA_LABEL[id] ?? null;
}

/** lava.top: which method (the gateway shows exactly one per invoice). Parent: the lava amounts. */
export function lavaMethodsScreen(amountCents: number, choices: readonly LavaChoiceView[], lang: BotLang): Screen {
  const buttons: InlineButton[] = [];
  for (const c of choices) {
    const label = lavaLabel(c.id, lang);
    if (label) buttons.push(b(`${label} · ${c.charge}`, { a: "lava", cents: amountCents, method: c.id, currency: c.currency }));
  }
  return {
    text: lines(tr("lava.title", lang, { amount: fmtUsd(amountCents) }), "", tr("lava.text", lang), tr("inv.lava", lang)),
    kb: [...pairs(buttons), back(lang, { a: "topm", method: "lava" })],
  };
}

// ─── Promo, invite, help, language ──────────────────────────────────────────

/** Parent: wallet. */
export function promoAskScreen(lang: BotLang): Screen {
  return { text: lines(tr("promo.title", lang), "", tr("promo.ask", lang)), kb: [back(lang, { a: "wallet" })] };
}

export type PromoOutcome =
  | { ok: true; amountCents: number; balanceCents: number }
  | { ok: false; error: "format" | "not_found" | "expired" | "used_up" | "already_used" | "busy" | "internal" | "empty" };

/** The result of a promo code, sent as a new message. Parent: wallet. */
export function promoResultScreen(r: PromoOutcome, lang: BotLang): Screen {
  if (r.ok) {
    return {
      text: lines(tr("promo.ok", lang, { amount: fmtUsd(r.amountCents) }), tr("bal.balance", lang, { bal: fmtUsd(r.balanceCents) })),
      kb: [[b(tr("btn.wallet", lang), { a: "wallet" })], back(lang, { a: "home" })],
    };
  }
  const key: Record<typeof r.error, V2Key> = {
    format: "promo.format",
    empty: "promo.format",
    not_found: "promo.notFound",
    expired: "promo.expired",
    used_up: "promo.usedUp",
    already_used: "promo.already",
    busy: "promo.busy",
    internal: "promo.internal",
  };
  return {
    text: lines(tr(key[r.error], lang), "", tr("promo.ask", lang)),
    kb: [back(lang, { a: "wallet" })],
  };
}

export interface InviteView {
  link: string;
  total: number;
  paid: number;
}

/** Parent: wallet. */
export function inviteScreen(x: InviteView, lang: BotLang): Screen {
  return {
    text: lines(
      tr("ref.title", lang),
      "",
      tr("ref.text", lang, { days: REFERRAL_REWARD_DAYS }),
      tr("ref.stats", lang, { total: x.total, paid: x.paid }),
      "",
      tr("ref.link", lang),
      `<code>${escapeHtml(x.link)}</code>`,
    ),
    kb: [[url(tr("btn.share", lang), shareUrl(x.link, tr("ref.share", lang)))], back(lang, { a: "wallet" })],
  };
}

/** Parent: home. `notice` goes above (e.g. "this chat is not read by a person"). */
export function helpScreen(lang: BotLang, notice?: string): Screen {
  return {
    text: withNotice(notice, lines(
      tr("help.title", lang),
      "",
      tr("help.fixTitle", lang),
      tr("help.fix1", lang),
      tr("help.fix2", lang),
      tr("help.fix3", lang),
      "",
      tr("help.support", lang, { email: SUPPORT_EMAIL }),
    )),
    kb: [
      [url(tr("btn.guides", lang), HELP_LINKS.guides), url(tr("btn.troubleshoot", lang), HELP_LINKS.troubleshooting)],
      [url(tr("btn.terms", lang), legalUrl("terms", lang)), url(tr("btn.privacy", lang), legalUrl("privacy", lang))],
      back(lang, { a: "home" }),
    ],
  };
}

/** Parent: home. Two languages per row, the current one ticked. */
export function languageScreen(lang: BotLang): Screen {
  const buttons = BOT_LANGS.map((l) => b(`${l === lang ? "✓ " : ""}${LANG_NAMES[l]}`, { a: "setlang", lang: l }));
  return { text: tr("lang.title", lang), kb: [...pairs(buttons), back(lang, { a: "home" })] };
}

/** Something failed that the person cannot fix. Parent: home. */
export function errorScreen(lang: BotLang, to: V2Action = { a: "home" }): Screen {
  return { text: tr("err.generic", lang), kb: [back(lang, to)] };
}

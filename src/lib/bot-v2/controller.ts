// src/lib/bot-v2/controller.ts
//
// The new bot interface (bot v2): what each button, command and typed reply
// does. The webhook calls in here only for chats behind the gate (gate.ts);
// everyone else keeps the old handlers in the webhook route.
//
// One conversation, one live message. A button edits the message it sits on
// (telegram.ts editScreen). A command or a typed reply sends the next screen
// as a new message at the bottom and deletes the previous live one, so the
// chat never collects stale menus. The live message id is kept in Redis
// (`kovra:bot:live:{chatId}`, 47 h: Telegram lets a bot delete its messages
// for 48 h).
//
// Everything a button carries is a claim: device uuids are checked against
// the caller's own profiles, prices are computed here, and a payment is
// keyed by a nonce minted with the order screen, so a double tap on "Pay"
// replays the first result instead of charging twice.

import { randomBytes } from "crypto";
import { redis } from "../redis";
import {
  ensureAccount,
  ensureProfileSubToken,
  getProfiles,
  resolveUserId,
  setUserLang,
  type VpnProfile,
} from "../accounts";
import { resolveLang, type BotLang } from "../bot-i18n";
import { getBalanceCents } from "../bot-wallet";
import { getReferralStats, getReferrer, recordReferral, resolveReferralCode } from "../referrals";
import { redeemPromoToWallet } from "../promo";
import { acquireLock, rateLimit } from "../ratelimit";
import { deviceAccess, type DeviceAccess } from "../device-capacity";
import {
  REFERRAL_REWARD_DAYS,
  activePlanKindOf,
  getSubscriptions,
  summarize,
  type PlanKind,
  type Subscription,
} from "../subscriptions";
import { purchaseFromWallet } from "../wallet-purchase";
import {
  MAX_TOPUP_USD,
  QUICK_TOPUP_USD,
  createWalletTopupInvoice,
  lavaTopupChoices,
  minTopupUsd,
  walletTopupConfig,
  type TopupMethod,
} from "../wallet-topup";
import { formatCharge } from "../lava-price";
import { deleteOwnProfile } from "../profile-delete";
import { generateQR } from "../qr";
import { DEVICE_KINDS, parseCallback, type DeviceKind, type V2Action } from "./callbacks";
import { fmtUsd, tr } from "./i18n";
import { SITE_ORIGIN, referralLink } from "./links";
import { clearPendingOrder, readPendingOrder, savePendingOrder } from "./pending-order";
import {
  connectScreen,
  createFailedScreen,
  creatingScreen,
  deleteConfirmScreen,
  deletingScreen,
  deviceName,
  deviceScreen,
  devicesScreen,
  errorScreen,
  helpScreen,
  homeScreen,
  inviteScreen,
  invoiceErrorScreen,
  invoiceScreen,
  languageScreen,
  lavaMethodsScreen,
  orderScreen,
  paidScreen,
  payProblemScreen,
  plansScreen,
  productCents,
  promoAskScreen,
  promoResultScreen,
  qrFailScreen,
  qrPhoto,
  slotScreen,
  termsScreen,
  topupAmountScreen,
  topupManualScreen,
  topupScreen,
  walletScreen,
  type AccountView,
  type CreateFailure,
  type DeviceDetail,
  type DeviceView,
  type PendingOrderView,
  type PromoOutcome,
} from "./screens";
import {
  answerCallback,
  createTelegramApi,
  deleteMessage,
  editScreen,
  sendPhotoPng,
  sendScreen,
  sendTyping,
  type Screen,
  type TelegramApi,
} from "./telegram";

// ─── Dependencies (real by default, replaced in tests and the harness) ─────

export type CreateDeviceResult =
  | { ok: true; subToken: string | null }
  | { ok: false; reason: "limit" | CreateFailure };

export interface BotV2Deps {
  api: TelegramApi;
  now(): number;
  /** Create a profile for the device (the site's /api/vpn/create). */
  createDevice(userId: string, device: DeviceKind): Promise<CreateDeviceResult>;
  qrPng(text: string): Promise<Uint8Array>;
  nonce(): string;
}

/** Where the bot reaches the site's own API (unchanged from the old bot). */
function internalSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://www.kovravpn.com").replace(/\/$/, "");
}

async function createDeviceViaApi(userId: string, device: DeviceKind): Promise<CreateDeviceResult> {
  // No fallback to the bot token (KS-7): lib/auth.ts accepts INTERNAL_API_KEY only.
  const key = process.env.INTERNAL_API_KEY || "";
  try {
    const res = await fetch(`${internalSiteUrl()}/api/vpn/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": key },
      body: JSON.stringify({ userId, deviceType: device }),
      signal: AbortSignal.timeout(25_000),
    });
    const data = (await res.json().catch(() => null)) as { success?: boolean; subToken?: unknown; limit?: boolean } | null;
    if (res.ok && data?.success === true) {
      return { ok: true, subToken: typeof data.subToken === "string" ? data.subToken : null };
    }
    if (res.status === 403 || data?.limit === true) return { ok: false, reason: "limit" };
    if (res.status === 429) return { ok: false, reason: "busy" };
    console.error(JSON.stringify({ evt: "bot.create_failed", userId, status: res.status }));
    return { ok: false, reason: "unavailable" };
  } catch (err) {
    console.error(JSON.stringify({ evt: "bot.create_failed", userId, error: err instanceof Error ? err.message : String(err) }));
    return { ok: false, reason: "unavailable" };
  }
}

export function defaultBotV2Deps(): BotV2Deps {
  return {
    api: createTelegramApi(process.env.TELEGRAM_BOT_TOKEN || ""),
    now: () => Date.now(),
    createDevice: createDeviceViaApi,
    qrPng: async (text) => new Uint8Array(await generateQR(text)),
    nonce: () => randomBytes(6).toString("base64url"),
  };
}

// ─── Redis keys ─────────────────────────────────────────────────────────────

const LIVE_TTL_SEC = 47 * 3600;
const liveKey = (chatId: number) => `kovra:bot:live:${chatId}`;
/** The same keys the old interface uses for typed replies. */
const promoAwaitKey = (chatId: number) => `promo_await:${chatId}`;
const topupAwaitKey = (chatId: number) => `topup_usd_await:${chatId}`;
const AWAIT_TTL_SEC = 300;

// ─── Loading what a screen shows ────────────────────────────────────────────

interface Session {
  chatId: number;
  userId: string;
  lang: BotLang;
  deps: BotV2Deps;
}

async function openSession(chatId: number, deps: BotV2Deps): Promise<Session> {
  const userId = await resolveUserId(`tg_${chatId}`);
  const lang = await resolveLang(userId);
  return { chatId, userId, lang, deps };
}

function deviceKindOf(p: VpnProfile): DeviceKind | null {
  const t = (p.deviceType ?? "").replace(/_ru$/, "");
  return (DEVICE_KINDS as readonly string[]).includes(t) ? (t as DeviceKind) : null;
}

/**
 * Devices with localized labels; a repeated type gets a number ("iPhone 2").
 * `access` (lib/device-capacity.ts, in the order of `profiles`) marks the
 * devices paused for want of a slot and the end of each one's slot.
 */
export function deviceViews(
  profiles: readonly VpnProfile[],
  lang: BotLang,
  access: readonly DeviceAccess[] = [],
): DeviceView[] {
  return profiles.map((p, i) => {
    const kind = deviceKindOf(p);
    const same = (q: VpnProfile) => deviceKindOf(q) === kind;
    const total = profiles.filter(same).length;
    const before = profiles.slice(0, i).filter(same).length;
    const name = deviceName(kind, lang);
    const a = access[i];
    return {
      uuid: p.uuid,
      kind,
      label: total > 1 ? `${name} ${before + 1}` : name,
      paused: a?.state === "paused",
      until: a?.state === "active" ? a.until : 0,
    };
  });
}

/** The account as the screens show it, from subscriptions, profiles and the wallet. */
export function accountView(
  subs: readonly Subscription[],
  profiles: readonly VpnProfile[],
  balanceCents: number,
  lang: BotLang,
  now: number,
): AccountView {
  const s = summarize([...subs], now);
  const planKind = activePlanKindOf([...subs], now);
  const planUntil = planKind
    ? subs.filter((x) => x.kind === planKind && x.expiresAt > now).reduce((m, x) => Math.max(m, x.expiresAt), 0)
    : 0;
  const lastExpiry = subs.reduce((m, x) => Math.max(m, x.expiresAt), 0);
  const lastPlan = subs
    .filter((x) => x.kind === "plan1" || x.kind === "plan3")
    .sort((a, b) => b.expiresAt - a.expiresAt)[0];
  return {
    balanceCents,
    activeSlots: s.activeSlots,
    activeUntil: s.maxExpiry,
    lastExpiry,
    planKind,
    planUntil,
    lastPlanKind: lastPlan ? (lastPlan.kind as PlanKind) : null,
    devices: deviceViews(profiles, lang, deviceAccess(profiles, subs, now)),
  };
}

async function loadView(s: Session): Promise<{ view: AccountView; profiles: VpnProfile[] }> {
  const [subs, profiles, balanceCents] = await Promise.all([
    getSubscriptions(s.userId),
    getProfiles(s.userId),
    getBalanceCents(s.userId),
  ]);
  return { view: accountView(subs, profiles, balanceCents, s.lang, s.deps.now()), profiles };
}

// ─── Showing screens ────────────────────────────────────────────────────────

async function rememberLive(chatId: number, messageId: number): Promise<void> {
  try {
    await redis.set(liveKey(chatId), String(messageId), { ex: LIVE_TTL_SEC });
  } catch (err) {
    console.warn("[bot-v2] live message not stored:", err instanceof Error ? err.message : err);
  }
}

/** Send `screen` as the new live message at the bottom; delete the previous live one. */
export async function showNew(s: Session, screen: Screen): Promise<number | null> {
  const sent = await sendScreen(s.deps.api, s.chatId, screen);
  if (sent === null) return null;
  const previous = await readLive(s.chatId);
  if (previous !== null && previous !== sent) await deleteMessage(s.deps.api, s.chatId, previous);
  await rememberLive(s.chatId, sent);
  return sent;
}

async function readLive(chatId: number): Promise<number | null> {
  try {
    const n = Number(await redis.get<unknown>(liveKey(chatId)));
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Edit the message a button sits on. When that is not the live screen (a
 * button on a payment notice, or on an older menu), it becomes the live one
 * and the previous live screen is deleted: one live message, always.
 */
async function showEdit(s: Session, messageId: number, screen: Screen): Promise<void> {
  const previous = await readLive(s.chatId);
  const out = await editScreen(s.deps.api, s.chatId, messageId, screen);
  if (out.kind === "failed") return;
  if (previous !== null && previous !== messageId && previous !== out.messageId) {
    await deleteMessage(s.deps.api, s.chatId, previous);
  }
  await rememberLive(s.chatId, out.messageId);
}

async function clearAwaits(chatId: number): Promise<void> {
  try {
    await redis.del(promoAwaitKey(chatId), topupAwaitKey(chatId));
  } catch {
    /* a stale prompt expires by TTL */
  }
}

// ─── Referral bookkeeping (as the old interface did on "Connect") ──────────

async function settlePendingReferral(chatId: number, userId: string): Promise<void> {
  try {
    const pending = await redis.get<unknown>(`pending_ref:${chatId}`);
    if (!pending) return;
    if (!(await getReferrer(userId))) {
      const referrerId = await resolveReferralCode(String(pending));
      if (referrerId && referrerId !== userId) await recordReferral(referrerId, userId);
    }
    await redis.del(`pending_ref:${chatId}`);
  } catch (err) {
    console.warn("[bot-v2] referral not settled:", err instanceof Error ? err.message : err);
  }
}

// ─── Buttons ────────────────────────────────────────────────────────────────

export interface CallbackInput {
  chatId: number;
  messageId: number;
  callbackId: string;
  data: string;
}

/** Answer the callback once; later calls do nothing. */
function answerOnce(api: TelegramApi, callbackId: string): (text?: string) => Promise<void> {
  let done = false;
  return async (text?: string) => {
    if (done) return;
    done = true;
    await answerCallback(api, callbackId, text);
  };
}

/** Handle a button press in a v2 chat. Never throws. */
export async function handleV2Callback(input: CallbackInput, deps: BotV2Deps = defaultBotV2Deps()): Promise<void> {
  const answer = answerOnce(deps.api, input.callbackId);
  try {
    const s = await openSession(input.chatId, deps);
    const action = parseCallback(input.data) ?? ({ a: "home" } as const);
    if (action.a !== "promo" && action.a !== "topx") await clearAwaits(input.chatId);
    await route(s, input.messageId, action, answer);
  } catch (err) {
    console.error("[bot-v2] callback failed:", err instanceof Error ? err.message : err);
    try {
      const lang = await resolveLang(await resolveUserId(`tg_${input.chatId}`)).catch(() => "en" as const);
      await editScreen(deps.api, input.chatId, input.messageId, errorScreen(lang));
    } catch {
      /* nothing more to do */
    }
  } finally {
    await answer();
  }
}

type Answer = (text?: string) => Promise<void>;

async function route(s: Session, msgId: number, x: V2Action, answer: Answer): Promise<void> {
  const { lang } = s;
  switch (x.a) {
    case "home": {
      await answer();
      const { view } = await loadView(s);
      return showEdit(s, msgId, homeScreen(view, lang, s.deps.now()));
    }
    case "connect": {
      await answer();
      await ensureAccount(s.userId);
      await settlePendingReferral(s.chatId, s.userId);
      const { view } = await loadView(s);
      return showEdit(s, msgId, connectScreen(view, lang));
    }
    case "new":
      return createDevice(s, msgId, x.device, answer);
    case "devs": {
      await answer();
      const { view } = await loadView(s);
      return showEdit(s, msgId, devicesScreen(view, lang));
    }
    case "dev": {
      await answer();
      return showDevice(s, msgId, x.uuid);
    }
    case "qr":
      return sendQr(s, x.uuid, answer);
    case "qrhide": {
      await answer();
      await deleteMessage(s.deps.api, s.chatId, msgId);
      return;
    }
    case "del": {
      await answer();
      const { view } = await loadView(s);
      const d = view.devices.find((v) => v.uuid === x.uuid);
      if (!d) return showEdit(s, msgId, devicesScreen(view, lang, tr("devs.notFound", lang)));
      return showEdit(s, msgId, deleteConfirmScreen(d, lang));
    }
    case "delok":
      return removeDevice(s, msgId, x.uuid, answer);
    case "wallet": {
      await answer();
      const { view } = await loadView(s);
      return showEdit(s, msgId, walletScreen(view, lang));
    }
    case "plans": {
      await answer();
      const { view } = await loadView(s);
      // While a tier runs, buying means renewing that tier (see activePlanKindOf).
      if (view.planKind) return showEdit(s, msgId, termsScreen(view, view.planKind, lang, x.from));
      return showEdit(s, msgId, plansScreen(view, lang, x.from));
    }
    case "terms": {
      await answer();
      const { view } = await loadView(s);
      const kind = view.planKind ?? x.kind;
      return showEdit(s, msgId, termsScreen(view, kind, lang, x.from));
    }
    case "renew": {
      await answer();
      const { view } = await loadView(s);
      const kind = view.planKind ?? view.lastPlanKind;
      if (!kind) return showEdit(s, msgId, plansScreen(view, lang, x.from));
      return showEdit(s, msgId, termsScreen(view, kind, lang, x.from));
    }
    case "slot": {
      await answer();
      const { view } = await loadView(s);
      // A slot sits on a running plan (an old button can still ask for one).
      if (!view.planKind) return showEdit(s, msgId, payProblemScreen("no_plan", lang, { a: "wallet" }, null));
      return showEdit(s, msgId, slotScreen(view, lang, x.from));
    }
    case "order": {
      await answer();
      const { view } = await loadView(s);
      if (x.product !== "slot" && view.planKind && view.planKind !== x.product) {
        return showEdit(s, msgId, payProblemScreen("other_plan", lang, { a: "wallet" }, view.planKind));
      }
      if (x.product === "slot" && !view.planKind) {
        return showEdit(s, msgId, payProblemScreen("no_plan", lang, { a: "wallet" }, null));
      }
      return showEdit(s, msgId, orderScreen(view, x.product, x.term, s.deps.nonce(), lang, x.from));
    }
    case "pay":
      return pay(s, msgId, x, answer);
    case "topup": {
      await answer();
      await clearPendingOrder(s.userId);
      const { view } = await loadView(s);
      return showEdit(s, msgId, topupScreen(view, enabledMethods(), lang, null));
    }
    case "topfor": {
      await answer();
      const { view } = await loadView(s);
      const need = productCents(x.product, x.term) - view.balanceCents;
      if (need <= 0) return showEdit(s, msgId, orderScreen(view, x.product, x.term, s.deps.nonce(), lang, x.from));
      await savePendingOrder(s.userId, { product: x.product, term: x.term, from: x.from });
      return showEdit(
        s,
        msgId,
        topupScreen(view, enabledMethods(), lang, { product: x.product, term: x.term, needCents: need, from: x.from }),
      );
    }
    case "topm": {
      await answer();
      if (!enabledMethods().some((m) => m.id === x.method)) {
        const { view } = await loadView(s);
        return showEdit(s, msgId, topupScreen(view, enabledMethods(), lang, null));
      }
      const pending = await pendingNeed(s);
      return showEdit(
        s,
        msgId,
        topupAmountScreen(x.method, minTopupUsd(x.method), MAX_TOPUP_USD, QUICK_TOPUP_USD, lang, pending?.needCents ?? 0),
      );
    }
    case "topx": {
      await answer();
      await redis.del(promoAwaitKey(s.chatId)).catch(() => 0);
      await redis.set(topupAwaitKey(s.chatId), x.method, { ex: AWAIT_TTL_SEC });
      return showEdit(s, msgId, topupManualScreen(x.method, minTopupUsd(x.method), MAX_TOPUP_USD, lang));
    }
    case "topa": {
      const screen = await topupAmount(s, x.method, x.cents, answer);
      if (screen) return showEdit(s, msgId, screen);
      return;
    }
    case "lava": {
      const screen = await lavaInvoice(s, x.cents, x.method, x.currency, answer);
      if (screen) return showEdit(s, msgId, screen);
      return;
    }
    case "promo": {
      await answer();
      await redis.del(topupAwaitKey(s.chatId)).catch(() => 0);
      await redis.set(promoAwaitKey(s.chatId), "1", { ex: AWAIT_TTL_SEC });
      return showEdit(s, msgId, promoAskScreen(lang));
    }
    case "invite": {
      await answer();
      await ensureAccount(s.userId);
      const stats = await getReferralStats(s.userId);
      return showEdit(s, msgId, inviteScreen({ link: referralLink(stats.code), total: stats.total, paid: stats.rewarded }, lang));
    }
    case "help":
      await answer();
      return showEdit(s, msgId, helpScreen(lang));
    case "lang":
      await answer();
      return showEdit(s, msgId, languageScreen(lang));
    case "setlang": {
      await answer();
      await setUserLang(s.userId, x.lang);
      const next: Session = { ...s, lang: x.lang };
      const { view } = await loadView(next);
      return showEdit(next, msgId, homeScreen(view, x.lang, s.deps.now()));
    }
  }
}

// ─── Devices ────────────────────────────────────────────────────────────────

async function deviceDetail(s: Session, profiles: readonly VpnProfile[], view: AccountView, uuid: string): Promise<DeviceDetail | null> {
  const d = view.devices.find((v) => v.uuid === uuid);
  if (!d || !profiles.some((p) => p.uuid === uuid)) return null;
  const subToken = await ensureProfileSubToken(s.userId, uuid);
  // The plain link, the one every client imports (and the /add bridge adds).
  return { ...d, subToken, subUrl: `${SITE_ORIGIN}/api/sub/${subToken}` };
}

async function showDevice(s: Session, msgId: number, uuid: string, notice?: string): Promise<void> {
  const { view, profiles } = await loadView(s);
  const detail = await deviceDetail(s, profiles, view, uuid);
  if (!detail) return showEdit(s, msgId, devicesScreen(view, s.lang, tr("devs.notFound", s.lang)));
  return showEdit(s, msgId, deviceScreen(view, detail, s.lang, notice));
}

async function createDevice(s: Session, msgId: number, device: DeviceKind, answer: Answer): Promise<void> {
  await ensureAccount(s.userId);
  await settlePendingReferral(s.chatId, s.userId);
  const before = await loadView(s);
  if (before.view.activeUntil === 0 || before.view.devices.length >= before.view.activeSlots) {
    await answer();
    return showEdit(s, msgId, connectScreen(before.view, s.lang));
  }
  // One creation at a time per account: a double tap must not leave a
  // "busy" screen on top of the device that the first tap created.
  const unlock = await acquireLock(`botcreate:${s.userId}`, 40);
  if (!unlock) return answer(tr("toast.creating", s.lang));
  try {
    await answer();
    await showEdit(s, msgId, creatingScreen(device, s.lang));
    await sendTyping(s.deps.api, s.chatId);
    const r = await s.deps.createDevice(s.userId, device);
    if (!r.ok) {
      if (r.reason === "limit") {
        const { view } = await loadView(s);
        return showEdit(s, msgId, connectScreen(view, s.lang));
      }
      return showEdit(s, msgId, createFailedScreen(device, r.reason, s.lang));
    }
    const { view, profiles } = await loadView(s);
    const created =
      (r.subToken ? profiles.find((p) => p.subToken === r.subToken) : undefined) ?? profiles[profiles.length - 1];
    if (!created) return showEdit(s, msgId, devicesScreen(view, s.lang));
    const detail = await deviceDetail(s, profiles, view, created.uuid);
    if (!detail) return showEdit(s, msgId, devicesScreen(view, s.lang));
    return showEdit(s, msgId, deviceScreen(view, detail, s.lang, tr("dev.ready", s.lang, { dev: detail.label })));
  } finally {
    await unlock().catch(() => undefined);
  }
}

async function removeDevice(s: Session, msgId: number, uuid: string, answer: Answer): Promise<void> {
  await answer();
  const { view } = await loadView(s);
  const d = view.devices.find((v) => v.uuid === uuid);
  // Ownership first: the uuid came from the client.
  if (!d) return showEdit(s, msgId, devicesScreen(view, s.lang, tr("devs.notFound", s.lang)));
  await showEdit(s, msgId, deletingScreen(d.label, s.lang));
  const r = await deleteOwnProfile(s.userId, uuid);
  // A panel did not confirm: the device stays, and says so (profile-delete.ts).
  if (r === "panel_failed") return showDevice(s, msgId, uuid, tr("devs.removeFailed", s.lang));
  const after = await loadView(s);
  const notice = r === "deleted" ? tr("devs.removed", s.lang, { dev: d.label }) : tr("devs.notFound", s.lang);
  return showEdit(s, msgId, devicesScreen(after.view, s.lang, notice));
}

const QR_PER_MINUTE = 6;

async function sendQr(s: Session, uuid: string, answer: Answer): Promise<void> {
  const { view, profiles } = await loadView(s);
  const detail = await deviceDetail(s, profiles, view, uuid);
  if (!detail) return answer(tr("devs.notFound", s.lang).replace(/<[^>]+>/g, ""));
  const rl = await rateLimit(`botqr:${s.chatId}`, QR_PER_MINUTE, 60);
  if (!rl.ok) return answer(tr("toast.qrSent", s.lang));
  await answer();
  try {
    const png = await s.deps.qrPng(detail.subUrl);
    const photo = qrPhoto(detail.label, s.lang);
    const sent = await sendPhotoPng(s.deps.api, s.chatId, png, photo.text, photo.kb);
    if (sent !== null) return;
  } catch (err) {
    console.error("[bot-v2] QR failed:", err instanceof Error ? err.message : err);
  }
  await sendScreen(s.deps.api, s.chatId, qrFailScreen(uuid, s.lang));
}

// ─── Paying from the wallet ─────────────────────────────────────────────────

async function pay(
  s: Session,
  msgId: number,
  x: Extract<V2Action, { a: "pay" }>,
  answer: Answer,
): Promise<void> {
  // A friend's link opened this chat: record it before the first purchase,
  // whose reward it is (wallet-purchase.ts rewards the referrer).
  await settlePendingReferral(s.chatId, s.userId);
  const r = await purchaseFromWallet({
    userId: s.userId,
    product: { kind: x.product === "slot" ? "device" : x.product, term: x.term },
    requestId: `tgb-${s.chatId}-${x.nonce}`,
    source: "bot",
  });
  const retry: V2Action = { a: "order", product: x.product, term: x.term, from: x.from };
  if (r.status === "conflict" && (r.reason === "busy" || r.reason === "in_progress")) {
    // The first tap is still running and will draw the result.
    return answer(tr("toast.paying", s.lang));
  }
  await answer();
  const { view } = await loadView(s);
  switch (r.status) {
    case "ok": {
      const pending = await readPendingOrder(s.userId);
      if (pending && pending.product === x.product && pending.term === x.term) {
        await clearPendingOrder(s.userId);
      }
      return showEdit(s, msgId, paidScreen(view, x.product, x.term, s.lang));
    }
    case "insufficient":
      return showEdit(s, msgId, orderScreen(view, x.product, x.term, s.deps.nonce(), s.lang, x.from));
    case "conflict":
      if (r.reason === "other_plan_active") {
        return showEdit(s, msgId, payProblemScreen("other_plan", s.lang, retry, r.activePlan ?? view.planKind));
      }
      if (r.reason === "no_plan") return showEdit(s, msgId, payProblemScreen("no_plan", s.lang, retry, null));
      // request_reused: a nonce from another order; draw a fresh order.
      return showEdit(s, msgId, orderScreen(view, x.product, x.term, s.deps.nonce(), s.lang, x.from));
    case "error":
      if (r.reason === "grant_failed") {
        return showEdit(s, msgId, payProblemScreen(r.refunded ? "refunded" : "stuck", s.lang, retry, null));
      }
      return showEdit(s, msgId, payProblemScreen("failed", s.lang, retry, null));
  }
}

// ─── Top-ups ────────────────────────────────────────────────────────────────

function enabledMethods(): { id: TopupMethod; minUsd: number }[] {
  return walletTopupConfig()
    .methods.filter((m) => m.enabled)
    .map((m) => ({ id: m.id, minUsd: m.minUsd }));
}

async function pendingNeed(s: Session): Promise<PendingOrderView | null> {
  const pending = await readPendingOrder(s.userId);
  if (!pending) return null;
  const balance = await getBalanceCents(s.userId);
  return { product: pending.product, term: pending.term, needCents: productCents(pending.product, pending.term) - balance };
}

/** Invoices one user may create per minute from the bot (both interfaces share the budget). */
export const INVOICES_PER_MINUTE = 10;

/** The rate-limit key of that budget (lib/ratelimit.ts adds `rl:`). */
export function botInvoiceRateKey(userId: string): string {
  return `bottopup:${userId}`;
}

/** An amount was chosen: the lava method list, or the invoice itself. Null when only a toast was shown. */
async function topupAmount(s: Session, method: TopupMethod, cents: number, answer: Answer): Promise<Screen | null> {
  const min = minTopupUsd(method);
  if (!enabledMethods().some((m) => m.id === method)) {
    await answer();
    const { view } = await loadView(s);
    return topupScreen(view, enabledMethods(), s.lang, null);
  }
  if (cents < min * 100 || cents > MAX_TOPUP_USD * 100) {
    await answer();
    return topupManualScreen(method, min, MAX_TOPUP_USD, s.lang, true);
  }
  if (method === "lava") {
    await answer();
    const amountUsd = cents / 100;
    const choices = lavaTopupChoices(amountUsd, "USD").flatMap((c) =>
      c.currency === "USD" || c.currency === "EUR"
        ? [{ id: c.id, currency: c.currency, charge: formatCharge(amountUsd, c.currency) }]
        : [],
    );
    return lavaMethodsScreen(cents, choices, s.lang);
  }
  const rl = await rateLimit(botInvoiceRateKey(s.userId), INVOICES_PER_MINUTE, 60);
  if (!rl.ok) {
    await answer(tr("toast.paying", s.lang));
    return null;
  }
  await answer();
  await sendTyping(s.deps.api, s.chatId);
  await settlePendingReferral(s.chatId, s.userId);
  const r = await createWalletTopupInvoice({ userId: s.userId, method, amountUsd: cents / 100, returnTo: "bot" });
  if (r.ok) return invoiceScreen(method, r.amountCents, r.payUrl, fmtUsd(r.amountCents), s.lang);
  if (r.error === "invalid_amount") return topupManualScreen(method, min, MAX_TOPUP_USD, s.lang, true);
  return invoiceErrorScreen(method, s.lang);
}

async function lavaInvoice(
  s: Session,
  cents: number,
  method: Extract<V2Action, { a: "lava" }>["method"],
  currency: "USD" | "EUR",
  answer: Answer,
): Promise<Screen | null> {
  const rl = await rateLimit(botInvoiceRateKey(s.userId), INVOICES_PER_MINUTE, 60);
  if (!rl.ok) {
    await answer(tr("toast.paying", s.lang));
    return null;
  }
  await answer();
  await sendTyping(s.deps.api, s.chatId);
  await settlePendingReferral(s.chatId, s.userId);
  const r = await createWalletTopupInvoice({
    userId: s.userId,
    method: "lava",
    amountUsd: cents / 100,
    returnTo: "bot",
    lavaMethodId: method,
    lavaCurrency: currency,
    locale: s.lang === "ru" ? "ru" : "en",
  });
  if (r.ok) return invoiceScreen("lava", r.amountCents, r.payUrl, r.chargeLabel, s.lang);
  if (r.error === "invalid_amount") return topupManualScreen("lava", minTopupUsd("lava"), MAX_TOPUP_USD, s.lang, true);
  return invoiceErrorScreen("lava", s.lang);
}

// ─── Commands and typed replies ─────────────────────────────────────────────

export type V2Command = "menu" | "devices" | "balance" | "help" | "language";

/** Map a command message ("/devices", "/devices@KovraVPN_bot") to a v2 command. */
export function parseCommand(text: string): V2Command | null {
  const m = /^\/([a-z]+)(?:@[A-Za-z0-9_]{5,32})?$/.exec(text.trim());
  if (!m) return null;
  switch (m[1]) {
    case "start":
    case "menu":
      return "menu";
    case "devices":
      return "devices";
    case "balance":
      return "balance";
    case "help":
      return "help";
    case "language":
      return "language";
    default:
      return null;
  }
}

/** A command as a new message at the bottom. */
export async function handleV2Command(
  chatId: number,
  command: V2Command,
  deps: BotV2Deps = defaultBotV2Deps(),
  notice?: string,
): Promise<void> {
  const s = await openSession(chatId, deps);
  await clearAwaits(chatId);
  if (command === "help") {
    await showNew(s, helpScreen(s.lang));
    return;
  }
  if (command === "language") {
    await showNew(s, languageScreen(s.lang));
    return;
  }
  const { view } = await loadView(s);
  if (command === "devices") await showNew(s, devicesScreen(view, s.lang, notice));
  else if (command === "balance") await showNew(s, walletScreen(view, s.lang));
  else await showNew(s, homeScreen(view, s.lang, deps.now(), notice));
}

/**
 * `/start <payload>` in a v2 chat. Handles the referral and payment-return
 * payloads; anything else (a login code) is "pass" for the old handler.
 */
export async function handleV2Start(
  chatId: number,
  payload: string,
  deps: BotV2Deps = defaultBotV2Deps(),
): Promise<"handled" | "pass"> {
  const p = payload.trim();
  if (/^ref_[A-Za-z0-9]{1,32}$/i.test(p)) {
    const refCode = p.slice(4);
    const userId = await resolveUserId(`tg_${chatId}`);
    await redis.set(`pending_ref:${chatId}`, refCode, { ex: 86400 });
    const lang = await resolveLang(userId);
    // Record it at once, creating the account: the friend's first purchase
    // may come from any screen (Balance & plans, a top-up), not only from
    // "Connect", and it must find the referral recorded. Whoever already
    // has a referrer keeps it (settlePendingReferral).
    try {
      await ensureAccount(userId);
      await settlePendingReferral(chatId, userId);
    } catch (err) {
      console.warn("[bot-v2] referral not recorded at /start:", err instanceof Error ? err.message : err);
    }
    await handleV2Command(chatId, "menu", deps, tr("note.ref", lang, { days: REFERRAL_REWARD_DAYS }));
    return "handled";
  }
  if (p === "paid" || p === "paidcrypto" || p === "paidcryptobot" || p === "paidenot") {
    const lang = await resolveLang(await resolveUserId(`tg_${chatId}`));
    await handleV2Command(chatId, "menu", deps, tr("note.paid", lang));
    return "handled";
  }
  return "pass";
}

const PROMO_FORMAT = /^[\p{L}\p{N}_-]{3,32}$/u;

/** Promo answers after which the next message is read as a code again. */
const PROMO_RETRY_ERRORS: ReadonlySet<string> = new Set(["not_found", "expired", "used_up", "already_used"]);

/**
 * A typed reply the bot asked for (a promo code, a top-up amount). False
 * when nothing was awaited, so the caller goes on with its own handling.
 */
export async function handleV2Reply(chatId: number, text: string, deps: BotV2Deps = defaultBotV2Deps()): Promise<boolean> {
  const [promoAwait, topupAwait] = await Promise.all([
    redis.get<unknown>(promoAwaitKey(chatId)),
    redis.get<unknown>(topupAwaitKey(chatId)),
  ]);
  if (promoAwait) {
    await redis.del(promoAwaitKey(chatId));
    // Something that cannot be a code ("how?", a sentence) is not an answer
    // to the prompt: the prompt closes and the message is handled as any
    // other (the caller's fallback).
    if (!PROMO_FORMAT.test(text.trim().toUpperCase())) return false;
    const s = await openSession(chatId, deps);
    const outcome = await redeemPromo(s, text);
    // A code that did not work keeps the prompt open ("Send the code as a
    // message"), so a corrected code can follow. The rate limit in
    // redeemPromo bounds the guessing.
    if (!outcome.ok && PROMO_RETRY_ERRORS.has(outcome.error)) {
      await redis.set(promoAwaitKey(chatId), "1", { ex: AWAIT_TTL_SEC });
    }
    await showNew(s, promoResultScreen(outcome, s.lang));
    return true;
  }
  if (typeof topupAwait === "string" && ["card", "cryptobot", "crypto", "lava"].includes(topupAwait)) {
    await redis.del(topupAwaitKey(chatId));
    const s = await openSession(chatId, deps);
    const method = topupAwait as TopupMethod;
    const usd = Number(text.trim().replace(",", ".").replace(/^\$/, ""));
    const cents = Number.isFinite(usd) ? Math.round(usd * 100) : NaN;
    if (!Number.isFinite(cents) || cents < minTopupUsd(method) * 100 || cents > MAX_TOPUP_USD * 100) {
      await redis.set(topupAwaitKey(chatId), method, { ex: AWAIT_TTL_SEC });
      await showNew(s, topupManualScreen(method, minTopupUsd(method), MAX_TOPUP_USD, s.lang, true));
      return true;
    }
    const noop: Answer = async () => undefined;
    const screen = await topupAmount(s, method, cents, noop);
    await showNew(s, screen ?? errorScreen(s.lang, { a: "topup" }));
    return true;
  }
  return false;
}

async function redeemPromo(s: Session, text: string): Promise<PromoOutcome> {
  const code = text.trim().toUpperCase();
  if (!PROMO_FORMAT.test(code)) return { ok: false, error: "format" };
  // Shared with the web cabinet's budget (rl:promo:u:{userId}): guessing
  // codes costs the same wherever it is tried.
  const rl = await rateLimit(`promo:u:${s.userId}`, 10, 600);
  if (!rl.ok) return { ok: false, error: "busy" };
  await ensureAccount(s.userId);
  const r = await redeemPromoToWallet(code, s.userId);
  return r.ok ? { ok: true, amountCents: r.amountCents, balanceCents: r.balanceCents } : { ok: false, error: r.error };
}

/**
 * Any other message in a v2 chat. An unknown command gets the menu with a
 * hint to use the buttons. Anything a person wrote or sent (a question, a
 * screenshot) gets Help, saying plainly that nobody reads this chat and
 * where support is: the bot must not look like it swallowed a question.
 */
export async function handleV2Fallback(
  chatId: number,
  text: string | null,
  deps: BotV2Deps = defaultBotV2Deps(),
): Promise<void> {
  if (text !== null && text.trim().startsWith("/")) {
    const lang = await resolveLang(await resolveUserId(`tg_${chatId}`));
    await handleV2Command(chatId, "menu", deps, tr("note.unknown", lang));
    return;
  }
  await handleV2Note(chatId, "support", deps);
}

/** A one-line note over a screen the webhook route asks for. */
export type V2Note = "authOk" | "authLinked" | "codeGone" | "support";

const NOTE_KEY: Readonly<Record<V2Note, "note.authOk" | "note.authLinked" | "note.codeGone" | "note.support">> = {
  authOk: "note.authOk",
  authLinked: "note.authLinked",
  codeGone: "note.codeGone",
  support: "note.support",
};

/**
 * Sign-in and link results, an unknown /start parameter, and messages nobody
 * reads, as a v2 screen at the bottom (the previous live one goes): the menu
 * with the note, or Help for "support".
 */
export async function handleV2Note(chatId: number, note: V2Note, deps: BotV2Deps = defaultBotV2Deps()): Promise<void> {
  const s = await openSession(chatId, deps);
  const text = tr(NOTE_KEY[note], s.lang);
  if (note === "support") {
    await clearAwaits(chatId);
    await showNew(s, helpScreen(s.lang, text));
    return;
  }
  await handleV2Command(chatId, "menu", deps, text);
}

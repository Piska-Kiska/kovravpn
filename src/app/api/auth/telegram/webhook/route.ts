// src/app/api/auth/telegram/webhook/route.ts
import { features } from "@/lib/features";
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  getAccount,
  createAccount,
  getProfiles,
  addProfile,
  getProfileLimit,
  resolveUserId,
  getUserRecord,
  hasTopup,
  getSubUrl,
  getDeviceLabel,
  ensureProfileSubToken,
  DEVICE_NAMES,
  syncTelegramIdentity,
  formatTelegramIdentity,
  setUserLang,
  getUserLang,
} from "@/lib/accounts";
import { t, resolveLang, normalizeLang, BOT_LANGS, LANG_NAMES, type BotLang } from "@/lib/bot-i18n";
import { deleteOwnProfile } from "@/lib/profile-delete";
import { safeEqual } from "@/lib/safe-compare";
import { getReferralStats, resolveReferralCode, recordReferral, grantReferralReward } from "@/lib/referrals";
import { isReferralCode } from "@/lib/telegram-login";
import { redeemPromoToWallet, PROMO_ERROR_TEXT, PROMO_MAX_USD, createPromo, listPromos, deletePromo } from "@/lib/promo";
import { LAVA_MIN_AMOUNT, lavaConfigured } from "@/lib/lava";
import type { LavaCurrency, LavaMethodId } from "@/lib/lava-methods";
import { formatCharge } from "@/lib/lava-price";
import {
  MAX_TOPUP_USD,
  MIN_TOPUP_CARD_USD,
  MIN_TOPUP_CRYPTOBOT_USD,
  MIN_TOPUP_NOWPAY_USD,
  QUICK_TOPUP_USD as QUICK_TOPUP,
  createWalletTopupInvoice,
  lavaTopupChoices,
  minTopupUsd as minForMethod,
  type TopupMethod,
} from "@/lib/wallet-topup";
import { getBalanceUsd } from "@/lib/bot-wallet";
import { PLAN_PRICES, activePlanKindOf, DEVICE_ADDON_PRICE, summarize, getSubscriptions, type PlanKind, type Term } from "@/lib/subscriptions";
import { purchaseFromWallet, type WalletProduct } from "@/lib/wallet-purchase";
import { createEnotInvoice, type EnotKind } from "@/lib/enot";
import { checkRateLimit } from "@/lib/ratelimit";
import { randomBytes, randomUUID } from "crypto";
import {
  tryHandleAdminCallback,
  tryHandleAdminText,
} from "@/lib/admin-bot";
import { ADMIN_TG_ID, isAdminChat } from "@/lib/bot-owner";
import { createTelegramApi } from "@/lib/bot-v2/telegram";
import { forwardToSupport, isNotForSupport, relayOwnerReply, type ForwardResult } from "@/lib/support-relay";
import { isBotV2 } from "@/lib/bot-v2/gate";
import { isV2CallbackData } from "@/lib/bot-v2/callbacks";
import {
  INVOICES_PER_MINUTE,
  botInvoiceRateKey,
  handleV2Callback,
  handleV2Command,
  handleV2Fallback,
  handleV2Note,
  handleV2Reply,
  handleV2Start,
  parseCommand,
} from "@/lib/bot-v2/controller";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
// No fallback to the bot token (KS-7): lib/auth.ts accepts INTERNAL_API_KEY only.
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://www.kovravpn.com").replace(/\/$/, "");
const BANNER_URL = `${SITE_URL}/og-image.png`;
const PLAN_NAMES: Record<string, string> = {
  free: "Пробный",
  base: "Базовый",
  optimal: "Оптимальный",
  max: "Максимальный",
};

// ─── Telegram API helpers ────────────────────────────

type InlineBtn = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };

async function tg(method: string, body: object) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function tgWithResponse(method: string, body: object) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function send(chatId: number, text: string, kb?: InlineBtn[][]) {
  await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(kb ? { reply_markup: { inline_keyboard: kb } } : {}),
  });
}

async function edit(chatId: number, msgId: number, text: string, kb?: InlineBtn[][]) {
  const markup = kb ? { inline_keyboard: kb } : undefined;

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, message_id: msgId, text, parse_mode: "HTML",
      ...(markup ? { reply_markup: markup } : {}),
    }),
  });

  if (!res.ok) {
    // The same screen again (a double tap, Back to where one already is):
    // nothing to change. Deleting and resending here made the message jump.
    if (await isNotModified(res)) return;
    const res2 = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId, message_id: msgId, caption: text, parse_mode: "HTML",
        ...(markup ? { reply_markup: markup } : {}),
      }),
    });

    if (!res2.ok && !(await isNotModified(res2))) {
      try { await tg("deleteMessage", { chat_id: chatId, message_id: msgId }); } catch {}
      await send(chatId, text, kb);
    }
  }
}

/** Telegram's "message is not modified" answer to an edit. */
async function isNotModified(res: Response): Promise<boolean> {
  const body = (await res.json().catch(() => null)) as { description?: unknown } | null;
  return typeof body?.description === "string" && body.description.includes("message is not modified");
}

async function answerCb(id: string, text?: string) {
  await tg("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

async function sendPhoto(chatId: number, photo: string, caption: string, kb?: InlineBtn[][]) {
  await tg("sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: "HTML",
    ...(kb ? { reply_markup: { inline_keyboard: kb } } : {}),
  });
}

async function getUserId(chatId: number): Promise<string> {
  return resolveUserId(`tg_${chatId}`);
}

function extractMediaRef(message: {
  photo?: { file_id: string }[];
  animation?: { file_id: string };
  video?: { file_id: string };
  document?: { file_id: string };
}):
  | { type: "photo"; file_id: string }
  | { type: "animation"; file_id: string }
  | { type: "video"; file_id: string }
  | { type: "document"; file_id: string }
  | null {
  if (message.animation?.file_id) {
    return { type: "animation", file_id: message.animation.file_id };
  }
  if (message.video?.file_id) {
    return { type: "video", file_id: message.video.file_id };
  }
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    const largest = message.photo[message.photo.length - 1];
    if (largest?.file_id) {
      return { type: "photo", file_id: largest.file_id };
    }
  }
  if (message.document?.file_id) {
    return { type: "document", file_id: message.document.file_id };
  }
  return null;
}

// ─── Keyboard helpers ────────────────────────────────

const backBtn = (to = "menu", lang: BotLang = "en"): InlineBtn[] => [{ text: t("common.back", lang), callback_data: to }];

function mainMenuKb(lang: BotLang = "en"): InlineBtn[][] {
  return [
    [{ text: t("menu.connect", lang), callback_data: "create" }],
    [{ text: t("menu.account", lang), callback_data: "account" }],
    [{ text: t("menu.devices", lang), callback_data: "profiles" }],
    [{ text: t("menu.pricing", lang), callback_data: "pricing" }],
    [{ text: t("menu.topup", lang), callback_data: "topup" }],
    [{ text: t("menu.referral", lang), callback_data: "referral" }],
    [{ text: t("menu.guide", lang), callback_data: "guide" }, { text: t("menu.help", lang), callback_data: "help" }],
    [{ text: t("menu.language", lang), callback_data: "lang" }],
    [{ text: t("menu.site", lang), url: SITE_URL }],
  ];
}

// ─── Screens ─────────────────────────────────────────

async function screenMenu(chatId: number, msgId?: number) {
  const lang = await resolveLang(await getUserId(chatId));
  const body = t("menu.title", lang);
  if (msgId) await edit(chatId, msgId, body, mainMenuKb(lang));
  else await sendPhoto(chatId, BANNER_URL, body, mainMenuKb(lang));
}

async function screenLanguage(chatId: number, msgId: number) {
  const lang = await resolveLang(await getUserId(chatId));
  const kb: InlineBtn[][] = BOT_LANGS.map((l) => [
    { text: (l === lang ? "✅ " : "") + LANG_NAMES[l], callback_data: `setlang_${l}` },
  ]);
  kb.push(backBtn("menu", lang));
  await edit(chatId, msgId, t("lang.title", lang), kb);
}

async function handleSetLang(chatId: number, msgId: number, code: string) {
  const lang = (normalizeLang(code) ?? "en") as BotLang;
  await setUserLang(await getUserId(chatId), lang);
  await screenMenu(chatId, msgId);
}

async function screenAccount(chatId: number, msgId: number) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  const account = await getAccount(userId);

  if (!account) {
    return edit(chatId, msgId, t("acc.notfound", lang), [
      [{ text: t("menu.connect", lang), callback_data: "create" }],
      backBtn("menu", lang),
    ]);
  }

  const user = await getUserRecord(userId);
  const balUsd = await getBalanceUsd(userId);
  const subs = await getSubscriptions(userId);
  const sum = summarize(subs);

  const lines = [
    t("acc.title", lang),
    ``,
    t("acc.balance", lang, { bal: balUsd.toFixed(2) }),
    t("acc.devices", lang, { n: sum.activeSlots }),
  ];
  if (sum.maxExpiry > 0) {
    lines.push(t("acc.until", lang, { date: new Date(sum.maxExpiry).toISOString().slice(0, 10) }));
  }
  if (user?.email) lines.push(t("acc.email", lang, { email: user.email }));
  if (user?.telegramId) lines.push(t("acc.tg", lang, { id: String(user.telegramId) }));

  const kb: InlineBtn[][] = [
    [{ text: t("acc.buy", lang), callback_data: "buyplan" }],
    [{ text: t("acc.adddev", lang), callback_data: "adddev" }],
    [{ text: t("acc.topup", lang), callback_data: "topup" }],
  ];
  if (!user?.email && !userId.startsWith("em_")) {
    kb.push([{ text: t("acc.linkemail", lang), url: `${SITE_URL}/dashboard` }]);
  }
  kb.push([{ text: t("acc.promo", lang), callback_data: "promo" }]);
  kb.push(backBtn("menu", lang));

  await edit(chatId, msgId, lines.join("\n"), kb);
}

async function screenProfiles(chatId: number, msgId: number) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  const account = await getAccount(userId);

  if (!account) {
    return edit(chatId, msgId, t("prof.notfound", lang), [
      [{ text: t("menu.connect", lang), callback_data: "create" }],
      backBtn("menu", lang),
    ]);
  }

  const profiles = await getProfiles(userId);

  if (profiles.length === 0) {
    return edit(chatId, msgId, t("prof.empty", lang), [
      [{ text: t("prof.add", lang), callback_data: "create" }],
      backBtn("menu", lang),
    ]);
  }

  const text =
    t("prof.title", lang, { n: profiles.length }) + "\n\n" +
    profiles.map((_, i) => `${i + 1}. ${getDeviceLabel(profiles, i)}`).join("\n");

  const kb: InlineBtn[][] = profiles.map((p, i) => [
    { text: `🔗 ${getDeviceLabel(profiles, i)}`, callback_data: `link_${p.uuid}` },
    { text: t("prof.del", lang), callback_data: `del_${p.uuid}` },
  ]);
  kb.push([{ text: t("prof.add", lang), callback_data: "create" }]);
  kb.push(backBtn("menu", lang));

  await edit(chatId, msgId, text, kb);
}

async function handleCreate(chatId: number, msgId: number) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  let account = await getAccount(userId);
  if (!account) account = await createAccount(userId);

  // Record referral if pending
  const pendingRef = await redis.get(`pending_ref:${chatId}`);
  if (pendingRef) {
    const { getReferrer } = await import("@/lib/referrals");
    const existingRef = await getReferrer(userId);
    if (!existingRef) {
      const referrerId = await resolveReferralCode(String(pendingRef));
      if (referrerId && referrerId !== userId) {
        await recordReferral(referrerId, userId);
      }
    }
    await redis.del(`pending_ref:${chatId}`);
  }

  const profiles = await getProfiles(userId);

  // Balance check
  const { canCreateProfile } = await import("@/lib/balance");
  const check = canCreateProfile(account, profiles.length);
  if (!check.ok) {
    return edit(chatId, msgId, t("shop.insufficient", lang, { price: "—", bal: "—", need: "—" }), [
      [{ text: t("acc.topup", lang), callback_data: "topup" }],
      backBtn("menu", lang),
    ]);
  }

  // Device selection screen
  await edit(chatId, msgId, t("create.pick", lang), [
    [{ text: t("create.android", lang), callback_data: "dev_android" }],
    [{ text: t("create.iphone", lang), callback_data: "dev_iphone" }],
    [{ text: t("create.mac", lang), callback_data: "dev_mac" }],
    [{ text: t("create.windows", lang), callback_data: "dev_windows" }],
    backBtn("menu", lang),
  ]);
}

const DEVICE_LINKS: Record<string, { name: string; happ: string; v2ray: string }> = {
  android: {
    name: "Android",
    happ: "https://play.google.com/store/apps/details?id=com.happproxy",
    v2ray: "https://play.google.com/store/apps/details?id=com.v2raytun.android",
  },
  iphone: {
    name: "iPhone",
    happ: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
    v2ray: "https://apps.apple.com/us/app/v2raytun/id6476628951",
  },
  mac: {
    name: "Mac",
    happ: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
    v2ray: "https://apps.apple.com/us/app/v2raytun/id6476628951",
  },
  windows: {
    name: "Windows",
    happ: "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe",
    v2ray: "https://storage.v2raytun.com/v2RayTun_Setup.exe",
  },
  tv: {
    name: "Apple TV",
    happ: "https://apps.apple.com/us/app/happ-proxy-utility-for-tv/id6748297274",
    v2ray: "https://apps.apple.com/us/app/v2raytun/id6476628951",
  },
};

async function handleCreateDevice(chatId: number, msgId: number, device: string) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  let account = await getAccount(userId);
  if (!account) account = await createAccount(userId);

  const devInfo = DEVICE_LINKS[device] || DEVICE_LINKS.android;

  const frames = [
    t("create.f1", lang, { dev: devInfo.name }),
    t("create.f2", lang, { dev: devInfo.name }),
    t("create.f3", lang, { dev: devInfo.name }),
  ];

  await edit(chatId, msgId, frames[0], []);

  try {
    const createPromise = fetch(`${SITE_URL}/api/vpn/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": INTERNAL_API_KEY },
      body: JSON.stringify({ userId, deviceType: device }),
    });

    for (let i = 1; i < frames.length; i++) {
      await new Promise((r) => setTimeout(r, 800));
      await edit(chatId, msgId, frames[i], []);
    }

    const res = await createPromise;
    const data = await res.json();

    if (!data.success) {
      return edit(chatId, msgId, t("create.failed", lang, { msg: data.error || t("create.err.generic", lang) }), [
        [{ text: t("acc.topup", lang), callback_data: "topup" }],
        backBtn("menu", lang),
      ]);
    }

    let subUrl: string = data.subUrl;
    if (!subUrl) {
      const profs = await getProfiles(userId);
      const latest = profs[profs.length - 1];
      if (latest) {
        const tok = await ensureProfileSubToken(userId, latest.uuid);
        subUrl = getSubUrl(tok, userId);
      }
    }

    await edit(chatId, msgId, [
      t("link.ready", lang, { dev: devInfo.name }),
      ``,
      `━━━━━━━━━━━━━━━`,
      t("link.sub", lang),
      t("link.tap", lang),
      ``,
      `<pre>${subUrl || t("link.fallback", lang)}</pre>`,
      `━━━━━━━━━━━━━━━`,
      ``,
      t("link.warn", lang),
      ``,
      t("link.install", lang),
    ].join("\n"), [
      [{ text: t("btn.happ", lang), url: devInfo.happ }, { text: t("btn.v2ray", lang), url: devInfo.v2ray }],
      [{ text: t("btn.devices", lang), callback_data: "profiles" }],
      [{ text: t("link.howto", lang), callback_data: "guide" }],
      backBtn("menu", lang),
    ]);
  } catch (err) {
    await edit(chatId, msgId, t("common.error", lang, { msg: err instanceof Error ? err.message : String(err) }), [backBtn("menu", lang)]);
  }
}

async function handleLink(chatId: number, msgId: number, uuid: string) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  const profiles = await getProfiles(userId);
  const idx = profiles.findIndex((x) => x.uuid === uuid);
  if (idx === -1) return edit(chatId, msgId, t("link.notfound", lang), [backBtn("profiles", lang)]);

  const token = await ensureProfileSubToken(userId, uuid);
  const subUrl = getSubUrl(token, userId);
  const label = getDeviceLabel(profiles, idx);

  const devInfo = DEVICE_LINKS[profiles[idx].deviceType || ""] || DEVICE_LINKS.android;

  await edit(chatId, msgId,
    [
      t("link.ready", lang, { dev: label }),
      ``,
      `━━━━━━━━━━━━━━━`,
      t("link.sub", lang),
      t("link.tap", lang),
      ``,
      `<pre>${subUrl}</pre>`,
      `━━━━━━━━━━━━━━━`,
      ``,
      t("link.warn", lang),
      ``,
      t("link.install", lang),
    ].join("\n"),
    [
      [{ text: t("btn.happ", lang), url: devInfo.happ }, { text: t("btn.v2ray", lang), url: devInfo.v2ray }],
      [{ text: t("link.howto", lang), callback_data: "guide" }],
      backBtn("profiles", lang),
    ],
  );
}

async function handleDel(chatId: number, msgId: number, uuid: string) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  const profiles = await getProfiles(userId);
  if (!profiles.some((p) => p.uuid === uuid)) {
    await edit(chatId, msgId, t("link.notfound", lang), [backBtn("profiles", lang)]);
    return;
  }
  await edit(chatId, msgId, t("del.confirm", lang), [
    [{ text: t("del.yes", lang), callback_data: `cdel_${uuid}` }, { text: t("del.no", lang), callback_data: "profiles" }],
  ]);
}

async function handleConfirmDel(chatId: number, msgId: number, uuid: string) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  // Ownership first: `cdel_<uuid>` is client data, and a forged one used to
  // remove another user's device from the panels.
  if (!(await getProfiles(userId)).some((p) => p.uuid === uuid)) {
    await edit(chatId, msgId, t("link.notfound", lang), [backBtn("profiles", lang)]);
    return;
  }
  await edit(chatId, msgId, t("del.progress", lang), []);
  const r = await deleteOwnProfile(userId, uuid);
  if (r === "panel_failed") {
    await edit(chatId, msgId, t("del.fail", lang), [
      [{ text: t("del.yes", lang), callback_data: `cdel_${uuid}` }],
      backBtn("profiles", lang),
    ]);
    return;
  }
  await edit(chatId, msgId, t("del.done", lang), [
    [{ text: t("del.toprof", lang), callback_data: "profiles" }],
    backBtn("menu", lang),
  ]);
}

async function screenGuide(chatId: number, msgId: number) {
  const lang = await resolveLang(await getUserId(chatId));
  await edit(chatId, msgId, [
    t("guide.title", lang),
    ``,
    t("guide.s1", lang),
    t("guide.s2", lang),
    t("guide.s3", lang),
    t("guide.s4", lang),
    t("guide.s5", lang),
    ``,
    t("guide.dl", lang),
  ].join("\n"), [
    [
      { text: "🪟 Windows", url: "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe" },
      { text: "🤖 Android", url: "https://play.google.com/store/apps/details?id=com.happproxy" },
    ],
    [
      { text: "🍎 iOS/macOS", url: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215" },
    ],
    [{ text: "── V2RayTun ──", callback_data: "guide" }],
    [
      { text: "🪟 Windows", url: "https://storage.v2raytun.com/v2RayTun_Setup.exe" },
      { text: "🤖 Android/TV", url: "https://play.google.com/store/apps/details?id=com.v2raytun.android" },
    ],
    [
      { text: "🍎 iOS/macOS", url: "https://apps.apple.com/us/app/v2raytun/id6476628951" },
    ],
    [{ text: t("guide.full", lang), url: `${SITE_URL}/guide` }],
    backBtn("menu", lang),
  ]);
}

async function screenHelp(chatId: number, msgId: number) {
  const lang = await resolveLang(await getUserId(chatId));
  await edit(chatId, msgId, [
    t("help.title", lang),
    ``,
    t("help.iftit", lang),
    t("help.i1", lang),
    t("help.i2", lang),
    t("help.i3", lang),
    ``,
    t("help.support", lang),
    `📧 <code>noreply@kovravpn.com</code>`,
  ].join("\n"), [
    [{ text: t("help.btn.support", lang), url: "https://t.me/kovravpn_bot" }],
    [{ text: t("help.btn.site", lang), url: SITE_URL }],
    [{ text: t("help.btn.docs", lang), callback_data: "docs" }],
    backBtn("menu", lang),
  ]);
}

async function screenDocs(chatId: number, msgId: number) {
  const lang = await resolveLang(await getUserId(chatId));
  await edit(chatId, msgId, [
    t("docs.title", lang),
    ``,
    t("docs.text", lang),
  ].join("\n"), [
    [{ text: t("docs.btn.terms", lang), url: `${SITE_URL}/terms` }],
    [{ text: t("docs.btn.privacy", lang), url: `${SITE_URL}/privacy` }],
    backBtn("help", lang),
  ]);
}

async function screenPricing(chatId: number, msgId: number) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  const balUsd = await getBalanceUsd(userId);

  const p1 = PLAN_PRICES.plan1, p3 = PLAN_PRICES.plan3;
  const lines = [
    `💳 <b>Kovra</b>`,
    ``,
    `👤 <b>${t("buy.plan1.name", lang)}</b> — $${p1[1].total}/mo · $${p1[6].perMonth}/mo (6mo) · $${p1[12].perMonth}/mo (12mo)`,
    `👥 <b>${t("buy.plan3.name", lang)}</b> — $${p3[1].total}/mo · $${p3[6].perMonth}/mo (6mo) · $${p3[12].perMonth}/mo (12mo)`,
    `➕ +1 — $${DEVICE_ADDON_PRICE}/mo`,
  ];
  if (balUsd > 0) {
    lines.push(``);
    lines.push(t("acc.balance", lang, { bal: balUsd.toFixed(2) }));
  }
  await edit(chatId, msgId, lines.join("\n"), [
    [{ text: t("acc.buy", lang), callback_data: "buyplan" }],
    [{ text: t("acc.adddev", lang), callback_data: "adddev" }],
    [{ text: t("acc.topup", lang), callback_data: "topup" }],
    backBtn("menu", lang),
  ]);
}

// Currently active main-plan tier, or null. Re-buying the same tier only
// extends time (applyPlanPurchase stacks expiry), so when a plan is active we
// switch the buy flow into renewal mode and lock it to that tier; extra device
// capacity comes from the Add-device add-on, not from re-buying the plan.
async function activePlanKind(userId: string): Promise<PlanKind | null> {
  return activePlanKindOf(await getSubscriptions(userId));
}

async function screenBuyPlan(chatId: number, msgId: number) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  const ak = await activePlanKind(userId);
  if (ak) { await screenBuyTerm(chatId, msgId, ak); return; }
  await edit(chatId, msgId, t("buy.title", lang), [
    [{ text: t("buy.plan1", lang), callback_data: "buyplan_plan1" }],
    [{ text: t("buy.plan3", lang), callback_data: "buyplan_plan3" }],
    backBtn("menu", lang),
  ]);
}

/**
 * One-use value in the callback_data of a screen that pays at once: the
 * purchase's requestId is `tgb-{chatId}-{nonce}`, so a double tap on the same
 * button replays the first purchase instead of charging twice (the callback
 * id is new on every tap and cannot do that). Hex: "_" splits callback_data.
 */
function buyNonce(): string {
  return randomBytes(5).toString("hex");
}
const BUY_NONCE_RE = /^[0-9a-f]{10}$/;

async function screenBuyTerm(chatId: number, msgId: number, kind: PlanKind) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  const now = Date.now();
  const nonce = buyNonce();
  const subs = await getSubscriptions(userId);
  const planSub = subs
    .filter((s) => s.kind === kind && s.expiresAt > now)
    .sort((a, b) => b.expiresAt - a.expiresAt)[0];
  const isRenewal = !!planSub;
  const planName = t(`buy.${kind}.name`, lang);
  const rows: InlineBtn[][] = ([1, 6, 12] as Term[]).map((term) => {
    const pr = PLAN_PRICES[kind][term];
    return [{
      text: t(`buy.term.${term}`, lang, { total: pr.total.toFixed(2), perMonth: pr.perMonth.toFixed(2) }),
      callback_data: `buyterm_${kind}_${term}_${nonce}`,
    }];
  });
  rows.push(backBtn(isRenewal ? "menu" : "buyplan", lang));
  if (isRenewal) {
    const until = new Date(planSub.expiresAt).toISOString().slice(0, 10);
    await edit(chatId, msgId, t("buy.renew.title", lang, { plan: planName, until }), rows);
  } else {
    await edit(chatId, msgId, t("buy.term.title", lang, { plan: planName }), rows);
  }
}

async function handleBuyPlan(chatId: number, msgId: number, kind: PlanKind, term: Term, requestId: string) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  await buyFromWallet(chatId, msgId, lang, userId, { kind, term }, requestId,
    t(`shop.sum.${kind}`, lang, { term }), `buyplan_${kind}`);
}

// ─── Add-device (1/6/12 mo × $5) ─────────────────────
async function screenAddDevice(chatId: number, msgId: number) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  // An extra device sits on a running plan (lib/wallet-purchase.ts refuses it otherwise).
  if (!(await activePlanKind(userId))) {
    await edit(chatId, msgId, t("buy.noplan", lang), [
      [{ text: t("acc.buy", lang), callback_data: "buyplan" }],
      backBtn("account", lang),
    ]);
    return;
  }
  const nonce = buyNonce();
  const rows: InlineBtn[][] = ([1, 6, 12] as Term[]).map((term) => {
    const total = DEVICE_ADDON_PRICE * term;
    return [{ text: t(`dev.term.${term}`, lang, { total: total.toFixed(2) }), callback_data: `adddev_${term}_${nonce}` }];
  });
  rows.push(backBtn("account", lang));
  await edit(chatId, msgId, t("dev.title", lang), rows);
}

async function handleAddDevice(chatId: number, msgId: number, term: Term, requestId: string) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  await buyFromWallet(chatId, msgId, lang, userId, { kind: "device", term }, requestId,
    t("shop.sum.device", lang, { days: term * 30 }), "adddev");
}

/**
 * Pay from the wallet (lib/wallet-purchase.ts: lock, idempotency by the
 * nonce of the screen the button sits on, charge then grant, refund on
 * failure) and render the outcome.
 * `backTo` is the retry target.
 */
async function buyFromWallet(
  chatId: number, msgId: number, lang: BotLang, userId: string,
  product: WalletProduct, requestId: string, summary: string, backTo: string,
) {
  const r = await purchaseFromWallet({ userId, product, requestId, source: "bot" });
  const usd = (cents: number) => (cents / 100).toFixed(2);
  if (r.status === "ok") {
    await edit(chatId, msgId,
      t("shop.ok", lang, { summary, bal: usd(r.balanceCents) }),
      [
        [{ text: t("menu.devices", lang), callback_data: "profiles" }],
        backBtn("menu", lang),
      ]);
    return;
  }
  if (r.status === "insufficient") {
    await edit(chatId, msgId,
      t("shop.insufficient", lang, { price: usd(r.priceCents), bal: usd(r.balanceCents), need: usd(r.needCents) }),
      [
        [{ text: t("shop.topup.btn", lang, { need: usd(r.needCents) }), callback_data: "topup" }],
        backBtn(backTo, lang),
      ]);
    return;
  }
  // A second tap while the first purchase runs: that one renders the result.
  if (r.status === "conflict" && (r.reason === "busy" || r.reason === "in_progress")) return;
  if (r.status === "conflict" && r.reason === "no_plan") {
    await edit(chatId, msgId, t("buy.noplan", lang), [
      [{ text: t("acc.buy", lang), callback_data: "buyplan" }],
      backBtn("account", lang),
    ]);
    return;
  }
  await edit(chatId, msgId, t("buy.err", lang), [backBtn(backTo, lang)]);
}

// ─── Top-up balance (USD) ────────────────────────────
// Amounts, minimums and the invoices themselves live in lib/wallet-topup.ts,
// shared with the web cabinet and the Mini App.

async function screenTopup(chatId: number, msgId: number) {
  const lang = await resolveLang(await getUserId(chatId));
  await redis.del(`topup_usd_await:${chatId}`);
  await edit(chatId, msgId, t("topup.title", lang), [
    [{ text: t("topup.m.card", lang) + ` · $${MIN_TOPUP_CARD_USD}+`, callback_data: "topup_m_card" }],
    [{ text: t("topup.m.cryptobot", lang) + ` · $${MIN_TOPUP_CRYPTOBOT_USD}+`, callback_data: "topup_m_cryptobot" }],
    [{ text: t("topup.m.crypto", lang) + ` · $${MIN_TOPUP_NOWPAY_USD}+`, callback_data: "topup_m_crypto" }],
    ...(lavaConfigured
      ? [[{ text: t("topup.m.lava", lang) + ` · $${LAVA_MIN_AMOUNT.USD}+`, callback_data: "topup_m_lava" }]]
      : []),
    backBtn("account", lang),
  ]);
}

async function screenTopupAmount(chatId: number, msgId: number, method: TopupMethod) {
  const lang = await resolveLang(await getUserId(chatId));
  const min = minForMethod(method);
  const quick = QUICK_TOPUP.filter((a) => a >= min);
  const rows: InlineBtn[][] = [];
  for (let i = 0; i < quick.length; i += 2) {
    rows.push(quick.slice(i, i + 2).map((a) => ({
      text: `$${a}`, callback_data: `tu_${method}_${a}`,
    })));
  }
  rows.push([{ text: t("topup.manual", lang), callback_data: `tu_${method}_manual` }]);
  rows.push(backBtn("topup", lang));
  await edit(chatId, msgId, t("topup.pick", lang, { min, max: MAX_TOPUP_USD }), rows);
}

/** Подписи способов. Bancontact пропущен: он один требует имя покупателя. */
const LAVA_BOT_LABEL: Partial<Record<LavaMethodId, string>> = {
  card: "💳 Card",
  paypal: "🅿️ PayPal",
  applepay: "🍎 Apple Pay",
  pix: "🇧🇷 Pix",
  sepa: "🇪🇺 SEPA",
  ideal: "🇳🇱 iDEAL",
  mbway: "🇵🇹 MB WAY",
};

/**
 * Второй уровень выбора: чем именно платить.
 *
 * Отдельным экраном, потому что лава показывает покупателю РОВНО ОДИН способ
 * на счёт — списка на её странице нет. Сумма подписана у каждого: в евро она
 * другая, и человек должен видеть списание до перехода.
 */
async function screenLavaMethods(chatId: number, msgId: number, amountUsd: number) {
  const lang = await resolveLang(await getUserId(chatId));
  const min = minForMethod("lava");
  if (!Number.isFinite(amountUsd) || amountUsd < min || amountUsd > MAX_TOPUP_USD) {
    await edit(chatId, msgId, t("topup.bad", lang, { min, max: MAX_TOPUP_USD }), [backBtn("topup", lang)]);
    return;
  }
  // Способы, которых лава на эту сумму не примет, не показываем вовсе: на $5
  // евровые отпадают, и показанная кнопка довела бы до отказа после нажатия.
  const chips = lavaTopupChoices(amountUsd, "USD").filter((c) => LAVA_BOT_LABEL[c.id] !== undefined);
  const rows: InlineBtn[][] = [];
  for (let i = 0; i < chips.length; i += 2) {
    rows.push(chips.slice(i, i + 2).map((c) => ({
      text: `${LAVA_BOT_LABEL[c.id]} · ${formatCharge(amountUsd, c.currency)}`,
      callback_data: `lv_${amountUsd}_${c.id}_${c.currency}`,
    })));
  }
  rows.push(backBtn("topup_m_lava", lang));
  await edit(chatId, msgId, [
    `🌍 <b>Top up $${amountUsd.toFixed(2)}</b>`,
    ``,
    `Choose how to pay — the button shows the exact amount.`,
    ``,
    `<i>The payment page will offer only the method you pick: that is how the gateway works.</i>`,
  ].join("\n"), rows);
}

/**
 * Every tap on an amount creates a real invoice at the provider (Cashera,
 * NOWPayments, CryptoBot, lava.top), and Cashera and lava also keep a record
 * in Redis. The cabinet's routes are limited, the old bot interface was not
 * (KP-13): it now shares bot v2's budget of INVOICES_PER_MINUTE per user.
 * False after telling the person to try later.
 */
async function invoiceAllowed(chatId: number, msgId: number, userId: string, lang: BotLang): Promise<boolean> {
  const rl = await checkRateLimit(botInvoiceRateKey(userId), INVOICES_PER_MINUTE, 60);
  if (rl.allowed) return true;
  console.warn(JSON.stringify({ evt: "bot.invoice_rate_limited", userId }));
  await edit(chatId, msgId, t("topup.err", lang), [backBtn("topup", lang)]);
  return false;
}

async function handleTopupLava(
  chatId: number,
  msgId: number,
  amountUsd: number,
  method: LavaMethodId,
  currency: LavaCurrency,
) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  if (!(await invoiceAllowed(chatId, msgId, userId, lang))) return;
  const r = await createWalletTopupInvoice({
    userId,
    method: "lava",
    amountUsd,
    returnTo: "bot",
    lavaMethodId: method,
    lavaCurrency: currency,
    locale: lang === "ru" ? "ru" : "en",
  });
  if (r.ok) {
    await edit(chatId, msgId,
      t("topup.invoice", lang, { amount: r.amountUsd.toFixed(2) }),
      [
        [{ text: r.chargeLabel, url: r.payUrl }],
        backBtn("topup_m_lava", lang),
      ]);
  } else if (r.error === "invalid_amount") {
    const min = minForMethod("lava");
    await edit(chatId, msgId, t("topup.bad", lang, { min, max: MAX_TOPUP_USD }), [backBtn("topup", lang)]);
  } else {
    await edit(chatId, msgId, t("topup.err", lang), [backBtn("topup", lang)]);
  }
}

async function handleTopupBalance(chatId: number, msgId: number, method: TopupMethod, amountUsd: number) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  if (!(await invoiceAllowed(chatId, msgId, userId, lang))) return;
  const r = await createWalletTopupInvoice({ userId, method, amountUsd, returnTo: "bot" });
  if (r.ok) {
    await edit(chatId, msgId,
      t(method === "card" ? "topup.invoice.card" : "topup.invoice", lang, { amount: r.amountUsd.toFixed(2) }),
      [
        [{ text: t("topup.pay", lang), url: r.payUrl }],
        backBtn("topup", lang),
      ]);
  } else if (r.error === "invalid_amount") {
    const min = minForMethod(method);
    await edit(chatId, msgId, t("topup.bad", lang, { min, max: MAX_TOPUP_USD }), [backBtn("topup", lang)]);
  } else {
    await edit(chatId, msgId, t("topup.err", lang), [backBtn("topup", lang)]);
  }
}

async function screenReferral(chatId: number, msgId: number) {
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  const account = await getAccount(userId);

  if (!account) {
    return edit(chatId, msgId, t("prof.notfound", lang), [
      [{ text: t("menu.connect", lang), callback_data: "create" }],
      backBtn("menu", lang),
    ]);
  }

  const stats = await getReferralStats(userId);

  await edit(chatId, msgId, [
    t("ref.title", lang),
    ``,
    t("ref.earn", lang),
    t("ref.reward", lang),
    ``,
    t("ref.stats", lang),
    t("ref.invited", lang, { n: stats.total }),
    t("ref.paid", lang, { n: stats.rewarded }),
    ``,
    t("ref.link", lang),
    `<code>${SITE_URL}/register?ref=${stats.code}</code>`,
    ``,
    t("ref.orbot", lang),
    `<code>https://t.me/kovravpn_bot?start=ref_${stats.code}</code>`,
  ].join("\n"), [
    [{ text: t("ref.copy", lang), callback_data: `copy_ref_${stats.code}` }],
    backBtn("menu", lang),
  ]);
}

async function handleCopyRef(chatId: number, callbackId: string, code: string) {
  const lang = await resolveLang(await getUserId(chatId));
  await send(chatId, `${SITE_URL}/register?ref=${code}`);
  await answerCb(callbackId, t("ref.sent", lang));
}

// ─── Auth code handlers ──────────────────────────────

async function tryAuth(code: string, chatId: number): Promise<boolean> {
  const raw = await redis.get(`auth:${code}`);
  if (!raw) return false;
  const d = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (d.verified) return false;
  // Keep the referral code the site stored with the sign-in code
  // (/register?ref=…): /verify applies it when it creates the account (KP-03).
  const ref = isReferralCode(d.ref) ? { ref: d.ref } : {};
  await redis.set(`auth:${code}`, JSON.stringify({ ...ref, verified: true, telegramId: chatId }), { ex: 600 });
  return true;
}

async function tryLink(code: string, chatId: number): Promise<boolean> {
  const raw = await redis.get(`link_tg:${code}`);
  if (!raw) return false;
  const d = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (d.verified) return false;
  await redis.set(`link_tg:${code}`, JSON.stringify({ ...d, verified: true, telegramId: chatId }), { ex: 600 });
  return true;
}

/** A message a person sent that is not text: a photo, a file, a voice or video note, a sticker. */
function isPersonalMedia(message: Record<string, unknown>): boolean {
  return ["photo", "document", "video", "voice", "video_note", "audio", "sticker", "animation"].some(
    (k) => message[k] !== undefined && message[k] !== null,
  );
}

// ─── Support relay (lib/support-relay.ts) ────────────

interface RelayableMessage {
  message_id?: number;
  from?: { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string };
}

/** Forward a user's message to the owner; "failed" when it has no id to forward. */
async function relayToSupport(chatId: number, message: RelayableMessage): Promise<ForwardResult> {
  if (typeof message.message_id !== "number") return "failed";
  const userId = await getUserId(chatId);
  const lang = await resolveLang(userId);
  return forwardToSupport(createTelegramApi(BOT_TOKEN), {
    chatId,
    messageId: message.message_id,
    from: message.from,
    userId,
    lang,
  });
}

/** Tell the person what happened to the message, in the interface they use. */
async function ackSupport(chatId: number, result: ForwardResult, v2: boolean): Promise<void> {
  if (v2) {
    await handleV2Note(chatId, result === "forwarded" ? "forwarded" : result === "rate_limited" ? "supportSlow" : "support");
    return;
  }
  const lang = await resolveLang(await getUserId(chatId));
  const key = result === "forwarded" ? "support.forwarded" : result === "rate_limited" ? "support.slow" : "fallback.user";
  await send(chatId, t(key, lang), mainMenuKb(lang));
}

async function handleCode(code: string, chatId: number): Promise<"auth" | "link" | false> {
  if (await tryAuth(code, chatId)) return "auth";
  if (await tryLink(code, chatId)) return "link";
  return false;
}

// ─── Webhook entry ───────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (!expectedSecret || !safeEqual(secret, expectedSecret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    // Дедуп по номеру обновления.
    //
    // Telegram повторяет доставку всего, на что не получил 2xx вовремя, а
    // покупка внутри бота списывает кошелёк и выдаёт подписку ДО того, как
    // отправит ответное сообщение. Стоит вызову к api.telegram.org подвиснуть —
    // и повтор пройдёт весь путь заново: деньги спишутся дважды, подписка
    // выдастся дважды, и ни одной тревоги. Отсекаем повтор до любых действий.
    const updateId = body?.update_id;
    if (typeof updateId === "number") {
      const fresh = await redis.set(`kovra:tg:upd:${updateId}`, "1", { nx: true, ex: 3600 });
      if (fresh === null) return NextResponse.json({ ok: true });
    }

    // Sync Telegram identity on every update. Awaited and one after the
    // other: both rewrite the same `user:` record (read-modify-write), so
    // running them in parallel could drop one write, and on Vercel a promise
    // left running after the response is simply lost. Failures never block
    // the update.
    const fromUser = body.message?.from ?? body.callback_query?.from;
    if (fromUser?.id) {
      try {
        const syncUserId = await resolveUserId(`tg_${fromUser.id}`);
        await syncTelegramIdentity(syncUserId, {
          username: fromUser.username,
          first_name: fromUser.first_name,
          last_name: fromUser.last_name,
        });
        // First-contact language: persist Telegram language_code only if unset.
        const tgLang = normalizeLang(fromUser.language_code);
        if (tgLang && !(await getUserLang(syncUserId))) await setUserLang(syncUserId, tgLang);
      } catch (e) {
        console.warn("[tg] identity/lang sync failed:", e instanceof Error ? e.message : e);
      }
    }

    if (body.callback_query) {
      const cb = body.callback_query;
      // Buttons on inline-mode messages carry no message; the bot has none.
      if (!cb.message?.chat?.id || typeof cb.data !== "string") {
        if (typeof cb.id === "string") await answerCb(cb.id);
        return NextResponse.json({ ok: true });
      }
      const chatId: number = cb.message.chat.id;
      const msgId: number = cb.message.message_id;
      const data: string = cb.data;

      // New interface (owner first, then the kovra:botv2:users set). It
      // answers the callback itself, with a toast where one is needed.
      if (!data.startsWith("adm:") && (await isBotV2(chatId))) {
        await handleV2Callback({ chatId, messageId: msgId, callbackId: String(cb.id), data });
        return NextResponse.json({ ok: true });
      }

      // The copy button answers with its own toast ("Link sent").
      if (!data.startsWith("copy_ref_")) await answerCb(cb.id);

      if (data.startsWith("adm:")) {
        const handled = await tryHandleAdminCallback(chatId, msgId, data, send, edit);
        if (handled) return NextResponse.json({ ok: true });
      }

      // A button of the new interface in a chat that is back on the old one
      // (the gate was narrowed): the old menu instead of silence.
      if (isV2CallbackData(data)) await screenMenu(chatId, msgId);
      else if (data === "menu") await screenMenu(chatId, msgId);
      else if (data === "lang") await screenLanguage(chatId, msgId);
      else if (data.startsWith("setlang_")) await handleSetLang(chatId, msgId, data.slice(8));
      else if (data === "account") await screenAccount(chatId, msgId);
      else if (data === "profiles") await screenProfiles(chatId, msgId);
      else if (data === "create") await handleCreate(chatId, msgId);
      else if (data.startsWith("dev_")) await handleCreateDevice(chatId, msgId, data.slice(4));
      else if (data === "guide") await screenGuide(chatId, msgId);
      else if (data === "help") await screenHelp(chatId, msgId);
      else if (data === "docs") await screenDocs(chatId, msgId);
      else if (data === "pricing") await screenPricing(chatId, msgId);
      else if (data === "referral") await screenReferral(chatId, msgId);
      else if (data === "promo") {
        const lang = await resolveLang(await getUserId(chatId));
        await redis.set(`promo_await:${chatId}`, "1", { ex: 300 });
        await edit(chatId, msgId, t("promo.ask", lang), [backBtn("menu", lang)]);
      }
      else if (data === "topup") await screenTopup(chatId, msgId);
      else if (data.startsWith("buyterm_")) {
        // buyterm_<kind>_<term>_<nonce>. A button without the nonce (sent
        // before it existed) shows the terms again instead of charging.
        const [, k, tm, nonce] = data.split("_");
        if ((k === "plan1" || k === "plan3") && (tm === "1" || tm === "6" || tm === "12")) {
          if (nonce !== undefined && BUY_NONCE_RE.test(nonce))
            await handleBuyPlan(chatId, msgId, k as PlanKind, Number(tm) as Term, `tgb-${chatId}-${nonce}`);
          else await screenBuyTerm(chatId, msgId, k as PlanKind);
        }
      }
      else if (data === "buyplan") await screenBuyPlan(chatId, msgId);
      else if (data === "adddev") await screenAddDevice(chatId, msgId);
      else if (data.startsWith("adddev_")) {
        // adddev_<term>_<nonce>; without the nonce: the term list again.
        const [tm, nonce] = data.slice("adddev_".length).split("_");
        if (tm === "1" || tm === "6" || tm === "12") {
          if (nonce !== undefined && BUY_NONCE_RE.test(nonce))
            await handleAddDevice(chatId, msgId, Number(tm) as Term, `tgb-${chatId}-${nonce}`);
          else await screenAddDevice(chatId, msgId);
        }
      }
      else if (data === "topup_m_crypto") await screenTopupAmount(chatId, msgId, "crypto");
      else if (data === "topup_m_cryptobot") await screenTopupAmount(chatId, msgId, "cryptobot");
      else if (data === "topup_m_card") await screenTopupAmount(chatId, msgId, "card");
      else if (data === "topup_m_lava") {
        if (!lavaConfigured) await screenTopup(chatId, msgId);
        else await screenTopupAmount(chatId, msgId, "lava");
      }
      else if (data.startsWith("lv_")) {
        const [, amt, method, cur] = data.split("_");
        const n = Number(amt);
        if (Number.isFinite(n) && method && cur) {
          await handleTopupLava(chatId, msgId, n, method as LavaMethodId, cur as LavaCurrency);
        }
      }
      else if (data.startsWith("tu_")) {
        const parts = data.split("_");
        const method: TopupMethod =
          parts[1] === "cryptobot"
            ? "cryptobot"
            : parts[1] === "card"
              ? "card"
              : parts[1] === "lava"
                ? "lava"
                : "crypto";
        const val = parts[2];
        if (val === "manual") {
          await redis.set(`topup_usd_await:${chatId}`, method, { ex: 300 });
          const lang = await resolveLang(await getUserId(chatId));
          await edit(chatId, msgId, t("topup.amount", lang, { min: minForMethod(method), max: MAX_TOPUP_USD }), [backBtn("topup", lang)]);
        } else {
          const amt = parseInt(val);
          if (Number.isFinite(amt)) {
            // У валютной линии между суммой и счётом стоит выбор способа:
            // лава показывает ровно один на счёт.
            if (method === "lava") await screenLavaMethods(chatId, msgId, amt);
            else await handleTopupBalance(chatId, msgId, method, amt);
          }
        }
      }
      else if (data.startsWith("buyplan_")) {
        const k = data.slice("buyplan_".length);
        if (k === "plan1" || k === "plan3") await screenBuyTerm(chatId, msgId, k as PlanKind);
      }
      else if (data.startsWith("copy_ref_")) await handleCopyRef(chatId, cb.id, data.slice(9));
      else if (data.startsWith("link_")) await handleLink(chatId, msgId, data.slice(5));
      else if (data.startsWith("del_")) await handleDel(chatId, msgId, data.slice(4));
      else if (data.startsWith("cdel_")) await handleConfirmDel(chatId, msgId, data.slice(5));

      return NextResponse.json({ ok: true });
    }

    // Text messages
    const message = body.message;

    // The owner answers a forwarded support message with a Telegram reply:
    // it goes to that user (lib/support-relay.ts), before any admin screen.
    if (message && String(message.chat?.id) === ADMIN_TG_ID && message.reply_to_message) {
      const relayed = await relayOwnerReply(createTelegramApi(BOT_TOKEN), message);
      if (relayed !== "not_a_support_reply") return NextResponse.json({ ok: true });
    }

    // Admin media intake (broadcast composer)
    if (message && String(message.chat?.id) === ADMIN_TG_ID) {
      const adminChatId: number = message.chat.id;
      const fsmState = await import("@/lib/admin-fsm").then((m) =>
        m.getAdminState(adminChatId),
      );
      if (fsmState.step === "awaiting_broadcast_content") {
        const mediaRef = extractMediaRef(message);
        if (mediaRef) {
          const caption: string = (message.caption ?? "").toString();
          const { handleBroadcastContent } = await import("@/lib/admin-bot");
          await handleBroadcastContent(adminChatId, send, fsmState, caption, mediaRef);
          return NextResponse.json({ ok: true });
        }
      }
    }

    if (!message?.text) {
      // A photo, a screenshot, a voice message… goes to support, and the
      // person is told so (both interfaces).
      const mChat = message?.chat;
      if (
        mChat?.type === "private" &&
        typeof mChat.id === "number" &&
        String(mChat.id) !== ADMIN_TG_ID &&
        isPersonalMedia(message) &&
        !isNotForSupport(message.caption)
      ) {
        const result = await relayToSupport(mChat.id, message);
        await ackSupport(mChat.id, result, await isBotV2(mChat.id));
      }
      return NextResponse.json({ ok: true });
    }

    const chatId: number = message.chat.id;
    const text: string = message.text.trim();

    // 6-char auth/link code first (before admin lookup)
    {
      const maybeCode = text.toUpperCase();
      if (/^[A-Z0-9]{6}$/.test(maybeCode)) {
        const result = await handleCode(maybeCode, chatId);
        if (result !== false && (await isBotV2(chatId))) {
          await handleV2Note(chatId, result === "auth" ? "authOk" : "authLinked");
          return NextResponse.json({ ok: true });
        }
        if (result === "auth") {
          const lang = await resolveLang(await getUserId(chatId));
          await send(chatId, t("auth.ok", lang), [[{ text: t("common.menu", lang), callback_data: "menu" }]]);
          return NextResponse.json({ ok: true });
        } else if (result === "link") {
          const lang = await resolveLang(await getUserId(chatId));
          await send(chatId, t("auth.linked", lang), [[{ text: t("common.menu", lang), callback_data: "menu" }]]);
          return NextResponse.json({ ok: true });
        }
      }
    }

    {
      const handled = await tryHandleAdminText(chatId, text, send);
      if (handled) return NextResponse.json({ ok: true });
    }

    // New interface for this chat? (Owner first; see lib/bot-v2/gate.ts.)
    const v2 = await isBotV2(chatId);

    // /start with code
    if (text.startsWith("/start ")) {
      const param = text.replace("/start ", "").trim();
      // Referral and payment-return links; a login code goes on below.
      if (v2 && (await handleV2Start(chatId, param)) === "handled") return NextResponse.json({ ok: true });
      if (v2) {
        // A login or link code, else any other parameter (an ad or partner
        // link, an old sign-in link): the menu, never a dead end.
        const result = await handleCode(param.toUpperCase(), chatId);
        if (result === "auth") await handleV2Note(chatId, "authOk");
        else if (result === "link") await handleV2Note(chatId, "authLinked");
        else if (/^[A-Za-z0-9]{6}$/.test(param)) await handleV2Note(chatId, "codeGone");
        else await handleV2Command(chatId, "menu");
        return NextResponse.json({ ok: true });
      }
      const lang = await resolveLang(await getUserId(chatId));

      // Referral link: /start ref_CODE
      if (param.toLowerCase().startsWith("ref_")) {
        const refCode = param.slice(4);
        await redis.set(`pending_ref:${chatId}`, refCode, { ex: 86400 });

        const uid = await getUserId(chatId);
        const acc = await getAccount(uid);
        if (acc) {
          const { getReferrer } = await import("@/lib/referrals");
          const existing = await getReferrer(uid);
          if (!existing) {
            const referrerId = await resolveReferralCode(refCode);
            if (referrerId && referrerId !== uid) {
              await recordReferral(referrerId, uid);
              await redis.del(`pending_ref:${chatId}`);
            }
          }
        }

        await send(chatId, t("ref.start", lang), mainMenuKb(lang));
        return NextResponse.json({ ok: true });
      }

      // Payment return links
      if (param === "paidcryptobot" || param === "paidcrypto" || param === "paidenot" || param === "paid") {
        await send(chatId, t("pay.accepted", lang), [[{ text: t("common.menu", lang), callback_data: "menu" }]]);
        return NextResponse.json({ ok: true });
      }

      const code = param.toUpperCase();
      const result = await handleCode(code, chatId);
      if (result === "auth") {
        await send(chatId, t("auth.ok", lang), [[{ text: t("common.menu", lang), callback_data: "menu" }]]);
      } else if (result === "link") {
        await send(chatId, t("auth.linked", lang), [[{ text: t("common.menu", lang), callback_data: "menu" }]]);
      } else {
        await send(chatId, t("auth.notfound", lang));
      }
      return NextResponse.json({ ok: true });
    }

    // /whoami | /me | /id — admin/support identity card (RU, admin-only
    // utility). Anyone else gets the ordinary reply to an unknown message.
    if (isAdminChat(chatId) && (text === "/whoami" || text === "/me" || text === "/id")) {
      const uid = await resolveUserId(`tg_${chatId}`);
      const [user, account, profiles] = await Promise.all([
        getUserRecord(uid),
        getAccount(uid),
        getProfiles(uid),
      ]);
      const lines: string[] = [
        "🆔 <b>Ваш профиль</b>",
        "",
        `ID: <code>${uid}</code>`,
        `Telegram: ${formatTelegramIdentity(user)}`,
      ];
      if (account) {
        const planName = PLAN_NAMES[account.plan] ?? account.plan;
        lines.push(
          "",
          `Тариф: ${planName}`,
          `Баланс: ${account.balance} ₽`,
          `Устройств: ${profiles.length} из ${getProfileLimit(account)}`,
        );
        if (account.paidUntil > 0) {
          lines.push(
            `Оплачено до: ${new Date(account.paidUntil).toLocaleDateString("ru-RU")}`,
          );
        }
      } else {
        lines.push("", "Аккаунт ещё не создан. Нажмите /start.");
      }
      await send(chatId, lines.join("\n"), [
        [{ text: "📊 Открыть меню", callback_data: "menu" }],
      ]);
      return NextResponse.json({ ok: true });
    }

    if (v2) {
      // Commands (/start, /menu, /devices, /balance, /help, /language) and
      // the typed replies the new screens ask for (promo code, amount).
      const command = parseCommand(text);
      if (command) {
        await handleV2Command(chatId, command);
        return NextResponse.json({ ok: true });
      }
      if (await handleV2Reply(chatId, text)) return NextResponse.json({ ok: true });
    }

    // /start or /menu
    if (text === "/start" || text === "/menu") {
      await screenMenu(chatId);
      return NextResponse.json({ ok: true });
    }

    // Promo code input
    const promoAwaiting = await redis.get(`promo_await:${chatId}`);
    if (promoAwaiting) {
      await redis.del(`promo_await:${chatId}`);
      const lang = await resolveLang(await getUserId(chatId));
      const promoCode = text.trim().toUpperCase();
      if (promoCode.length < 3 || promoCode.length > 32) {
        await send(chatId, t("promo.bad", lang), [backBtn("menu", lang)]);
        return NextResponse.json({ ok: true });
      }
      try {
        const userId = await getUserId(chatId);
        const account = await getAccount(userId);
        if (!account) await createAccount(userId);
        // Same function as the web cabinet: once per code and user, and a
        // code is never burned without the wallet credit.
        const r = await redeemPromoToWallet(promoCode, userId);
        if (r.ok) {
          await send(chatId, [
            t("promo.ok", lang),
            ``,
            t("promo.credit", lang, { amount: (r.amountCents / 100).toFixed(2) }),
            t("acc.balance", lang, { bal: (r.balanceCents / 100).toFixed(2) }),
          ].join("\n"), mainMenuKb(lang));
        } else {
          await send(chatId, t("common.error", lang, { msg: PROMO_ERROR_TEXT[r.error] }), [backBtn("menu", lang)]);
        }
      } catch (err) {
        await send(chatId, t("common.error", lang, { msg: err instanceof Error ? err.message : "Error" }), [backBtn("menu", lang)]);
      }
      return NextResponse.json({ ok: true });
    }

    // Своя сумма пополнения в долларах — для любого способа кошелька.
    const topupMethod = await redis.get(`topup_usd_await:${chatId}`);
    if (topupMethod) {
      const lang = await resolveLang(await getUserId(chatId));
      const saved = String(topupMethod);
      const method: TopupMethod =
        saved === "cryptobot"
          ? "cryptobot"
          : saved === "card"
            ? "card"
            : saved === "lava"
              ? "lava"
              : "crypto";
      const amt = parseFloat(String(text).replace(",", "."));
      await redis.del(`topup_usd_await:${chatId}`);
      const msg = await tgWithResponse("sendMessage", {
        chat_id: chatId,
        text: t("topup.wait", lang),
        parse_mode: "HTML",
      });
      const newMsgId = msg?.result?.message_id;
      if (newMsgId) {
        if (method === "lava") await screenLavaMethods(chatId, newMsgId, amt);
        else await handleTopupBalance(chatId, newMsgId, method, amt);
      }
      return NextResponse.json({ ok: true });
    }

    // 6-digit code (fallback path)
    const code = text.toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(code)) {
      const lang = await resolveLang(await getUserId(chatId));
      const result = await handleCode(code, chatId);
      if (result === "auth") {
        await send(chatId, t("auth.ok", lang), [[{ text: t("common.menu", lang), callback_data: "menu" }]]);
      } else if (result === "link") {
        await send(chatId, t("auth.linked", lang), [[{ text: t("common.menu", lang), callback_data: "menu" }]]);
      } else {
        await send(chatId, t("auth.notfound", lang));
      }
      return NextResponse.json({ ok: true });
    }

    // Admin promo commands (RU, admin-only)
    if (String(chatId) === ADMIN_TG_ID) {
      if (text.startsWith("/promo_create ")) {
        const parts = text.split(" ");
        const pCode = parts[1];
        const pAmount = Number((parts[2] || "0").replace(",", "."));
        const pMaxRaw = parseInt(parts[3] || "0", 10);
        const pMax = Number.isSafeInteger(pMaxRaw) && pMaxRaw > 0 ? pMaxRaw : 0;
        if (!pCode || !pAmount) {
          await send(chatId, `Формат: /promo_create КОД СУММА_В_$ [МАКС_ИСПОЛЬЗОВАНИЙ]\nСумма в долларах, до $${PROMO_MAX_USD}.`);
          return NextResponse.json({ ok: true });
        }
        try {
          const promo = await createPromo({ code: pCode, amount: pAmount, maxUses: pMax, createdBy: `tg_${chatId}` });
          await send(chatId, `✅ Промокод создан:\n\n<code>${promo.code}</code>\n💵 $${promo.amount}\n👥 Макс: ${promo.maxUses || "∞"}\n📅 Использовано: ${promo.usedCount}`);
        } catch (err) {
          await send(chatId, `❌ ${err instanceof Error ? err.message : "Ошибка"}`);
        }
        return NextResponse.json({ ok: true });
      }

      if (text === "/promo_list") {
        const promos = await listPromos();
        if (promos.length === 0) {
          await send(chatId, "Нет промокодов.");
          return NextResponse.json({ ok: true });
        }
        const lines = promos.map(p => {
          const exp = p.expiresAt > 0 ? new Date(p.expiresAt).toLocaleDateString() : "∞";
          return `<code>${p.code}</code> — $${p.amount}, ${p.usedCount}/${p.maxUses || "∞"}, до ${exp}`;
        });
        await send(chatId, `🎟 <b>Промокоды:</b>\n\n${lines.join("\n")}`);
        return NextResponse.json({ ok: true });
      }

      if (text.startsWith("/promo_delete ")) {
        const dCode = text.split(" ")[1];
        if (dCode) {
          await deletePromo(dCode);
          await send(chatId, `✅ Промокод ${dCode} удалён.`);
        }
        return NextResponse.json({ ok: true });
      }
    }

    // Admin fallback
    if (String(chatId) === ADMIN_TG_ID) {
      console.warn(
        `[admin-fallback] chatId=${chatId} text="${text.slice(0, 100)}" — admin handler did not consume this`,
      );
      await send(
        chatId,
        "🛠 Команда не распознана. Используйте /admin для админ-панели.",
      );
      return NextResponse.json({ ok: true });
    }

    // User fallback: free text no screen is waiting for goes to support.
    // Commands and six-character codes never do (they are handled above, and
    // isNotForSupport checks again).
    if (message.chat?.type === "private" && !isNotForSupport(text)) {
      const result = await relayToSupport(chatId, message);
      await ackSupport(chatId, result, v2);
      return NextResponse.json({ ok: true });
    }
    if (v2) {
      await handleV2Fallback(chatId, text);
      return NextResponse.json({ ok: true });
    }
    const lang = await resolveLang(await getUserId(chatId));
    await send(chatId, t("fallback.user", lang), mainMenuKb(lang));
    return NextResponse.json({ ok: true });
  } catch (error) {
    // 200, а не 500, и это осознанно.
    //
    // На 5xx Telegram повторяет обновление, а обработчик к моменту падения мог
    // уже списать кошелёк и выдать подписку — повтор сделал бы это второй раз.
    // Дедуп по update_id выше отсекает повтор и сам по себе, но ответ 200
    // закрывает вопрос ещё до него: потерять уведомление дешевле, чем списать
    // деньги дважды.
    console.error("Webhook error:", error);
    return NextResponse.json({ ok: false });
  }
}

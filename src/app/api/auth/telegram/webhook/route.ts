// src/app/api/auth/telegram/webhook/route.ts
import { features } from "@/lib/features";
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  getAccount,
  createAccount,
  getProfiles,
  addProfile,
  removeProfile,
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
import { listInbounds, buildVlessUrl } from "@/lib/xpanel";
import { addClientSync, deleteClientSync } from "@/lib/xpanel-sync";
import { getReferralStats, resolveReferralCode, recordReferral, grantReferralReward } from "@/lib/referrals";
import { syncAllExpiry } from "@/lib/balance";
import { redeemPromo, createPromo, listPromos, deletePromo } from "@/lib/promo";
import { createInvoice } from "@/lib/nowpayments";
import { getBalanceUsd, addBalanceUsd, chargeBalanceUsd, buildTopupOrderId } from "@/lib/bot-wallet";
import { PLAN_PRICES, resolvePlan, applyPlanPurchase, applyDeviceAddon, DEVICE_ADDON_PRICE, summarize, getSubscriptions, type PlanKind, type Term } from "@/lib/subscriptions";
import { createCryptoBotInvoice } from "@/lib/cryptobot";
import { createEnotInvoice, type EnotKind } from "@/lib/enot";
import { checkRateLimit } from "@/lib/ratelimit";
import { randomUUID } from "crypto";
import {
  tryHandleAdminCallback,
  tryHandleAdminText,
} from "@/lib/admin-bot";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
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

  // Try editMessageText first (text messages)
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, message_id: msgId, text, parse_mode: "HTML",
      ...(markup ? { reply_markup: markup } : {}),
    }),
  });

  if (!res.ok) {
    // Try editMessageCaption (photo/media messages)
    const res2 = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId, message_id: msgId, caption: text, parse_mode: "HTML",
        ...(markup ? { reply_markup: markup } : {}),
      }),
    });

    if (!res2.ok) {
      // Last resort: delete and send new
      try { await tg("deleteMessage", { chat_id: chatId, message_id: msgId }); } catch {}
      await send(chatId, text, kb);
    }
  }
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

/**
 * Extract a Telegram media reference (file_id) from an incoming message.
 * Returns the largest photo size, or the document/animation/video file_id.
 * Returns null if the message has no recognized media.
 */
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
    // Telegram sends multiple photo sizes; the last one is the largest.
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
  const account = await getAccount(userId);

  if (!account) {
    return edit(chatId, msgId, "❌ Аккаунт не найден.\n\nСоздайте первый профиль:", [
      [{ text: "➕ Подключить", callback_data: "create" }],
      backBtn(),
    ]);
  }

  const profiles = await getProfiles(userId);

  if (profiles.length === 0) {
    return edit(chatId, msgId, "📡 <b>Мои устройства</b>\n\nУ вас пока нет устройств.", [
      [{ text: "➕ Добавить устройство", callback_data: "create" }],
      backBtn(),
    ]);
  }

  const text =
    `📡 <b>Мои устройства</b> (${profiles.length})\n\n` +
    profiles.map((_, i) => `${i + 1}. ${getDeviceLabel(profiles, i)}`).join("\n");

  const kb: InlineBtn[][] = profiles.map((p, i) => [
    { text: `🔗 ${getDeviceLabel(profiles, i)}`, callback_data: `link_${p.uuid}` },
    { text: '🗑 Удалить', callback_data: `del_${p.uuid}` },
  ]);
  kb.push([{ text: "➕ Добавить устройство", callback_data: "create" }]);
  kb.push(backBtn());

  await edit(chatId, msgId, text, kb);
}

async function handleCreate(chatId: number, msgId: number) {
  const userId = await getUserId(chatId);
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
    return edit(chatId, msgId, `❌ ${check.error}`, [
      [{ text: "💰 Пополнить баланс", callback_data: "topup" }],
      backBtn(),
    ]);
  }

  // Device selection screen
  await edit(chatId, msgId, [
    `📱 <b>Выберите устройство</b>`,
    ``,
    `Профиль будет создан для выбранного устройства.`,
  ].join("\n"), [
    [{ text: "🤖 Android", callback_data: "dev_android" }],
    [{ text: "🍎 iPhone (Global)", callback_data: "dev_iphone" }, { text: "🇷🇺 iPhone (RU)", callback_data: "dev_iphone_ru" }],
    [{ text: "💻 Mac (Global)", callback_data: "dev_mac" }, { text: "🇷🇺 Mac (RU)", callback_data: "dev_mac_ru" }],
    [{ text: "🪟 Windows", callback_data: "dev_windows" }],
    backBtn(),
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
  iphone_ru: {
    name: "iPhone (RU)",
    happ: "https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973",
    v2ray: "https://apps.apple.com/us/app/v2raytun/id6476628951",
  },
  mac: {
    name: "Mac",
    happ: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
    v2ray: "https://apps.apple.com/us/app/v2raytun/id6476628951",
  },
  mac_ru: {
    name: "Mac (RU)",
    happ: "https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973",
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
  let account = await getAccount(userId);
  if (!account) account = await createAccount(userId);

  const devInfo = DEVICE_LINKS[device] || DEVICE_LINKS.android;

  // Loading animation
  const frames = [
    `⏳ <b>Создаём профиль для ${devInfo.name}...</b>\n\n🔧 Генерируем ключи шифрования...`,
    `⏳ <b>Создаём профиль для ${devInfo.name}...</b>\n\n🔐 Настраиваем VLESS Reality...`,
    `⏳ <b>Создаём профиль для ${devInfo.name}...</b>\n\n🌐 Подключаем к серверу...`,
  ];

  await edit(chatId, msgId, frames[0], []);

  try {
    // Animate while creating
    const createPromise = fetch(`${SITE_URL}/api/vpn/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": BOT_TOKEN },
      body: JSON.stringify({ userId, deviceType: device }),
    });

    // Show animation frames
    for (let i = 1; i < frames.length; i++) {
      await new Promise((r) => setTimeout(r, 800));
      await edit(chatId, msgId, frames[i], []);
    }

    const res = await createPromise;
    const data = await res.json();

    if (!data.success) {
      return edit(chatId, msgId, `❌ ${data.error || "Ошибка создания"}`, [
        [{ text: "💰 Пополнить", callback_data: "topup" }],
        backBtn(),
      ]);
    }

    // data.subUrl is per-profile (returned by /api/vpn/create).
    // Fallback: fetch latest profile and lazy-create per-profile token.
    // NEVER fall back to user-level URL (it returns all profiles in one sub).
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
      `✅ <b>Профиль для ${devInfo.name} готов!</b>`,
      ``,
      `━━━━━━━━━━━━━━━`,
      `🔗 <b>Ваша ссылка подписки</b>`,
      `<i>нажмите чтобы скопировать</i>`,
      ``,
      `<pre>${subUrl || "(ошибка генерации ссылки — зайдите в «📡 Мои устройства»)"}</pre>`,
      `━━━━━━━━━━━━━━━`,
      ``,
      `⚠️ Ссылка привязана к этому устройству — не делитесь ею.`,
      ``,
      `📥 Скачайте приложение и вставьте ссылку:`,
    ].join("\n"), [
      [{ text: "📥 Happ", url: devInfo.happ }, { text: "📥 V2RayTun", url: devInfo.v2ray }],
      [{ text: "📡 Мои устройства", callback_data: "profiles" }],
      [{ text: "📖 Как подключить", callback_data: "guide" }],
      backBtn(),
    ]);
  } catch (err) {
    await edit(chatId, msgId, `❌ Ошибка: ${err instanceof Error ? err.message : err}`, [backBtn()]);
  }
}




async function handleLink(chatId: number, msgId: number, uuid: string) {
  const userId = await getUserId(chatId);
  const profiles = await getProfiles(userId);
  const idx = profiles.findIndex((x) => x.uuid === uuid);
  if (idx === -1) return edit(chatId, msgId, "❌ Профиль не найден.", [backBtn("profiles")]);

  const token = await ensureProfileSubToken(userId, uuid);
  const subUrl = getSubUrl(token, userId);
  const label = getDeviceLabel(profiles, idx);

  const devInfo = DEVICE_LINKS[profiles[idx].deviceType || ""] || DEVICE_LINKS.android;

  await edit(chatId, msgId,
    [
      `✅ <b>${label} — профиль активен</b>`,
      ``,
      `━━━━━━━━━━━━━━━`,
      `🔗 <b>Ваша ссылка подписки</b>`,
      `<i>нажмите чтобы скопировать</i>`,
      ``,
      `<pre>${subUrl}</pre>`,
      `━━━━━━━━━━━━━━━`,
      ``,
      `⚠️ Ссылка привязана к этому устройству — не делитесь ею.`,
      ``,
      `📥 Скачайте приложение и вставьте ссылку:`,
    ].join("\n"),
    [
      [{ text: "📥 Happ", url: devInfo.happ }, { text: "📥 V2RayTun", url: devInfo.v2ray }],
      [{ text: "📖 Как подключить", callback_data: "guide" }],
      backBtn("profiles"),
    ],
  );
}

async function handleDel(chatId: number, msgId: number, uuid: string) {
  await edit(chatId, msgId, "🗑 <b>Удалить профиль?</b>\n\nСсылка перестанет работать.", [
    [{ text: "✅ Да, удалить", callback_data: `cdel_${uuid}` }, { text: "❌ Отмена", callback_data: "profiles" }],
  ]);
}

async function handleConfirmDel(chatId: number, msgId: number, uuid: string) {
  const userId = await getUserId(chatId);
  await edit(chatId, msgId, "⏳ <b>Удаляем устройство...</b>\n\nЭто займёт несколько секунд.", []);
  try { await deleteClientSync(1, uuid); } catch { /* ok */ }
  await removeProfile(userId, uuid);
  await syncAllExpiry(userId); // Recalculate expiry for remaining profiles
  await edit(chatId, msgId, "✅ Профиль удалён.", [
    [{ text: "📡 К профилям", callback_data: "profiles" }],
    backBtn(),
  ]);
}

async function screenGuide(chatId: number, msgId: number) {
  await edit(chatId, msgId, [
    `📖 <b>Инструкция</b>`,
    ``,
    `1️⃣ Скачайте Happ или V2RayTun`,
    `2️⃣ Добавьте устройство (➕)`,
    `3️⃣ Скопируйте ссылку подписки`,
    `4️⃣ Вставьте в приложение — «Импорт из буфера»`,
    `5️⃣ Подключайтесь`,
    ``,
    `<b>Скачать Happ:</b>`,
  ].join("\n"), [
    [
      { text: "🪟 Windows", url: "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe" },
      { text: "🤖 Android", url: "https://play.google.com/store/apps/details?id=com.happproxy" },
    ],
    [
      { text: "🍎 iOS/macOS", url: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215" },
      { text: "🇷🇺 iOS RU", url: "https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973" },
    ],
    [{ text: "── V2RayTun ──", callback_data: "guide" }],
    [
      { text: "🪟 Windows", url: "https://storage.v2raytun.com/v2RayTun_Setup.exe" },
      { text: "🤖 Android/TV", url: "https://play.google.com/store/apps/details?id=com.v2raytun.android" },
    ],
    [
      { text: "🍎 iOS/macOS", url: "https://apps.apple.com/us/app/v2raytun/id6476628951" },
    ],
    [{ text: "📖 Полная инструкция", url: `${SITE_URL}/guide` }],
    backBtn(),
  ]);
}

async function screenHelp(chatId: number, msgId: number) {
  await edit(chatId, msgId, [
    `❓ <b>Помощь</b>`,
    ``,
    `Если не работает:`,
    `• Удалите профиль и создайте новый`,
    `• Обновите приложение`,
    `• Перезагрузите подключение`,
    ``,
    `Проблема осталась — напишите в поддержку:`,
    `📧 <code>noreply@kovravpn.com</code>`,
  ].join("\n"), [
    [{ text: "💬 Поддержка", url: "https://t.me/kovravpn_bot" }],
    [{ text: "🌐 Сайт", url: SITE_URL }],
    backBtn(),
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
    `👤 <b>1 device</b> — $${p1[1].total}/mo · $${p1[6].perMonth}/mo (6mo) · $${p1[12].perMonth}/mo (12mo)`,
    `👥 <b>3 devices</b> — $${p3[1].total}/mo · $${p3[6].perMonth}/mo (6mo) · $${p3[12].perMonth}/mo (12mo)`,
    `➕ Extra device — $${DEVICE_ADDON_PRICE}/mo`,
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


async function screenBuyPlan(chatId: number, msgId: number) {
  const lang = await resolveLang(await getUserId(chatId));
  await edit(chatId, msgId, t("buy.title", lang), [
    [{ text: t("buy.plan1", lang), callback_data: "buyplan_plan1" }],
    [{ text: t("buy.plan3", lang), callback_data: "buyplan_plan3" }],
    [{ text: t("common.back", lang), callback_data: "menu" }],
  ]);
}

async function screenBuyTerm(chatId: number, msgId: number, kind: PlanKind) {
  const lang = await resolveLang(await getUserId(chatId));
  const planName = t(`buy.${kind}.name`, lang);
  const rows = ([1, 6, 12] as Term[]).map((term) => {
    const pr = PLAN_PRICES[kind][term];
    return [{
      text: t(`buy.term.${term}`, lang, { total: pr.total.toFixed(2), perMonth: pr.perMonth.toFixed(2) }),
      callback_data: `buyterm_${kind}_${term}`,
    }];
  });
  rows.push([{ text: t("common.back", lang), callback_data: "topup" }]);
  await edit(chatId, msgId, t("buy.term.title", lang, { plan: planName }), rows);
}

async function handleBuyPlan(chatId: number, msgId: number, kind: PlanKind, term: Term) {
  const lang = await resolveLang(await getUserId(chatId));
  const userId = await getUserId(chatId);
  if (!userId) { await edit(chatId, msgId, t("common.error", lang, { msg: "user not found" }), [backBtn("menu", lang)]); return; }
  const plan = resolvePlan(kind, term);
  if (!plan) { await edit(chatId, msgId, t("buy.err", lang), [backBtn("menu", lang)]); return; }
  await chargeAndGrant(chatId, msgId, lang, userId, plan.price, async () => {
    await applyPlanPurchase(userId, plan);
    const label = kind === "plan3" ? t("buy.plan3.name", lang) : t("buy.plan1.name", lang);
    return `${label} · ${term} ${term === 1 ? "mo" : "mo"}`;
  }, `buyplan_${kind}`);
}

// ─── Add-device (1/6/12 mo × $5) ─────────────────────
async function screenAddDevice(chatId: number, msgId: number) {
  const lang = await resolveLang(await getUserId(chatId));
  const rows = ([1, 6, 12] as Term[]).map((term) => {
    const total = DEVICE_ADDON_PRICE * term;
    return [{ text: t(`dev.term.${term}`, lang, { total: total.toFixed(2) }), callback_data: `adddev_${term}` }];
  });
  rows.push([{ text: t("common.back", lang), callback_data: "account" }]);
  await edit(chatId, msgId, t("dev.title", lang), rows);
}

async function handleAddDevice(chatId: number, msgId: number, term: Term) {
  const lang = await resolveLang(await getUserId(chatId));
  const userId = await getUserId(chatId);
  if (!userId) { await edit(chatId, msgId, t("common.error", lang, { msg: "user not found" }), [backBtn("account", lang)]); return; }
  const price = DEVICE_ADDON_PRICE * term;
  await chargeAndGrant(chatId, msgId, lang, userId, price, async () => {
    for (let i = 0; i < term; i++) await applyDeviceAddon(userId);
    return `+1 device · ${term * 30} days`;
  }, "adddev");
}

/**
 * Atomic charge-then-grant. Checks balance, charges, runs grant(); on grant
 * failure refunds. Renders insufficient/success. `backTo` is the retry target.
 */
async function chargeAndGrant(
  chatId: number, msgId: number, lang: BotLang, userId: string,
  price: number, grant: () => Promise<string>, backTo: string,
) {
  const bal = await getBalanceUsd(userId);
  if (bal < price) {
    const need = price - bal;
    await edit(chatId, msgId,
      t("shop.insufficient", lang, { price: price.toFixed(2), bal: bal.toFixed(2), need: need.toFixed(2) }),
      [
        [{ text: t("shop.topup.btn", lang, { need: need.toFixed(2) }), callback_data: "topup" }],
        backBtn(backTo, lang),
      ]);
    return;
  }
  const charged = await chargeBalanceUsd(userId, price);
  if (!charged) {
    await edit(chatId, msgId, t("buy.err", lang), [backBtn(backTo, lang)]);
    return;
  }
  let summary: string;
  try {
    summary = await grant();
    await syncAllExpiry(userId);
  } catch (err) {
    console.error("[bot] grant failed, refunding:", err);
    await addBalanceUsd(userId, price); // refund
    await edit(chatId, msgId, t("buy.err", lang), [backBtn(backTo, lang)]);
    return;
  }
  const newBal = await getBalanceUsd(userId);
  await edit(chatId, msgId,
    t("shop.ok", lang, { summary, bal: newBal.toFixed(2) }),
    [
      [{ text: t("menu.devices", lang), callback_data: "profiles" }],
      backBtn("menu", lang),
    ]);
}

// ─── Top-up balance (USD) ────────────────────────────
const MIN_TOPUP_CRYPTOBOT_USD = 5;
const MIN_TOPUP_NOWPAY_USD = 8;
const MAX_TOPUP_USD = 1000;
const QUICK_TOPUP = [10, 20, 50, 100];

function minForMethod(method: "crypto" | "cryptobot"): number {
  return method === "cryptobot" ? MIN_TOPUP_CRYPTOBOT_USD : MIN_TOPUP_NOWPAY_USD;
}

async function screenTopup(chatId: number, msgId: number) {
  const lang = await resolveLang(await getUserId(chatId));
  await redis.del(`topup_usd_await:${chatId}`);
  await edit(chatId, msgId, t("topup.title", lang), [
    [{ text: t("topup.m.cryptobot", lang) + ` · $${MIN_TOPUP_CRYPTOBOT_USD}+`, callback_data: "topup_m_cryptobot" }],
    [{ text: t("topup.m.crypto", lang) + ` · $${MIN_TOPUP_NOWPAY_USD}+`, callback_data: "topup_m_crypto" }],
    backBtn("account", lang),
  ]);
}

async function screenTopupAmount(chatId: number, msgId: number, method: "crypto" | "cryptobot") {
  const lang = await resolveLang(await getUserId(chatId));
  const min = minForMethod(method);
  // quick amounts >= method minimum
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

async function handleTopupBalance(chatId: number, msgId: number, method: "crypto" | "cryptobot", amountUsd: number) {
  const lang = await resolveLang(await getUserId(chatId));
  const userId = await getUserId(chatId);
  if (!userId) { await edit(chatId, msgId, t("common.error", lang, { msg: "user not found" }), [backBtn("topup", lang)]); return; }
  const min = minForMethod(method);
  if (!Number.isFinite(amountUsd) || amountUsd < min || amountUsd > MAX_TOPUP_USD) {
    await edit(chatId, msgId, t("topup.bad", lang, { min, max: MAX_TOPUP_USD }), [backBtn("topup", lang)]);
    return;
  }
  try {
    let payUrl: string;
    if (method === "cryptobot") {
      const inv = await createCryptoBotInvoice({ userId, amountUsd, source: "bot" });
      payUrl = inv.payUrl;
    } else {
      const orderId = buildTopupOrderId(userId);
      const inv = await createInvoice({ orderId, amountUsd, description: `Kovra top-up $${amountUsd.toFixed(2)}`, source: "bot" });
      payUrl = inv.invoiceUrl;
    }
    await edit(chatId, msgId,
      t("topup.invoice", lang, { amount: amountUsd.toFixed(2) }),
      [
        [{ text: t("topup.pay", lang), url: payUrl }],
        backBtn("topup", lang),
      ]);
  } catch (err) {
    console.error("[bot] topup invoice error:", err);
    await edit(chatId, msgId, t("topup.err", lang), [backBtn("topup", lang)]);
  }
}
async function screenReferral(chatId: number, msgId: number) {
  const userId = await getUserId(chatId);
  const account = await getAccount(userId);

  if (!account) {
    return edit(chatId, msgId, "❌ Сначала создайте аккаунт.", [
      [{ text: "➕ Подключить", callback_data: "create" }],
      backBtn(),
    ]);
  }

  const stats = await getReferralStats(userId);

  await edit(chatId, msgId, [
    `🎁 <b>Пригласить друга</b>`,
    ``,
    `Приглашайте друзей и зарабатывайте:`,
    `├ <b>+50 ₽</b> при первом пополнении друга`,
    `└ <b>Лимит: 30 рефералов</b>`,
    ``,
    `📊 <b>Статистика:</b>`,
    `├ Приглашено: <b>${stats.total}</b>`,
    `└ Оплатили: <b>${stats.rewarded}</b>`,
    ``,
    `🔗 <b>Ваша ссылка:</b>`,
    `<code>${SITE_URL}/register?ref=${stats.code}</code>`,
    ``,
    `Или ссылка на бота:`,
    `<code>https://t.me/kovravpn_bot?start=ref_${stats.code}</code>`,
  ].join("\n"), [
    [{ text: "📋 Копировать ссылку", callback_data: `copy_ref_${stats.code}` }],
    backBtn(),
  ]);
}

async function handleCopyRef(chatId: number, msgId: number, code: string) {
  // Can't actually copy in TG, but we can send the link as a separate message
  await send(chatId, `${SITE_URL}/register?ref=${code}`);
  await answerCb("", "Ссылка отправлена");
}

// ─── Auth code handlers ──────────────────────────────

async function tryAuth(code: string, chatId: number): Promise<boolean> {
  const raw = await redis.get(`auth:${code}`);
  if (!raw) return false;
  const d = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (d.verified) return false;
  await redis.set(`auth:${code}`, JSON.stringify({ verified: true, telegramId: chatId }), { ex: 600 });
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

async function handleCode(code: string, chatId: number): Promise<"auth" | "link" | false> {
  if (await tryAuth(code, chatId)) return "auth";
  if (await tryLink(code, chatId)) return "link";
  return false;
}

// ─── Webhook entry ───────────────────────────────────

export async function POST(req: NextRequest) {
  // Verify request is from Telegram
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    // Callback queries (inline keyboard)
    // Sync Telegram identity on every update (fire-and-forget).
    // Runs for both messages and callbacks. Redis hiccups must not break message flow.
    const fromUser = body.message?.from ?? body.callback_query?.from;
    if (fromUser?.id) {
      const syncUserId = await resolveUserId(`tg_${fromUser.id}`);
      syncTelegramIdentity(syncUserId, {
        username: fromUser.username,
        first_name: fromUser.first_name,
        last_name: fromUser.last_name,
      }).catch((e) => console.warn("[tg] syncTelegramIdentity failed:", e));
      // First-contact language: persist Telegram language_code only if the
      // user has no stored choice yet (never overwrites a manual selection).
      const tgLang = normalizeLang(fromUser.language_code);
      if (tgLang) {
        getUserLang(syncUserId).then((cur) => {
          if (!cur) setUserLang(syncUserId, tgLang).catch(() => {});
        }).catch(() => {});
      }
    }

    if (body.callback_query) {
      const cb = body.callback_query;
      const chatId: number = cb.message.chat.id;
      const msgId: number = cb.message.message_id;
      const data: string = cb.data;

      await answerCb(cb.id);

      // Admin panel takes priority over the regular dispatch.
      if (data.startsWith("adm:")) {
        const handled = await tryHandleAdminCallback(chatId, msgId, data, send, edit);
        if (handled) return NextResponse.json({ ok: true });
      }

      if (data === "menu") await screenMenu(chatId, msgId);
      else if (data === "lang") await screenLanguage(chatId, msgId);
      else if (data.startsWith("setlang_")) await handleSetLang(chatId, msgId, data.slice(8));
      else if (data === "account") await screenAccount(chatId, msgId);
      else if (data === "profiles") await screenProfiles(chatId, msgId);
      else if (data === "create") await handleCreate(chatId, msgId);
      else if (data.startsWith("dev_")) await handleCreateDevice(chatId, msgId, data.slice(4));
      else if (data === "guide") await screenGuide(chatId, msgId);
      else if (data === "help") await screenHelp(chatId, msgId);
      else if (data === "pricing") await screenPricing(chatId, msgId);
      else if (data === "referral") await screenReferral(chatId, msgId);
      else if (data === "promo") {
        await redis.set(`promo_await:${chatId}`, "1", { ex: 300 });
        await edit(chatId, msgId, "🎟 <b>Введите промокод</b>\n\nОтправьте промокод в чат:", [backBtn()]);
      }
      else if (data === "topup") await screenTopup(chatId, msgId);
      else if (data.startsWith("buyterm_")) {
        const [, k, tm] = data.split("_");
        if ((k === "plan1" || k === "plan3") && (tm === "1" || tm === "6" || tm === "12"))
          await handleBuyPlan(chatId, msgId, k as PlanKind, Number(tm) as Term);
      }
      else if (data === "buyplan") await screenBuyPlan(chatId, msgId);
      else if (data === "adddev") await screenAddDevice(chatId, msgId);
      else if (data.startsWith("adddev_")) {
        const tm = data.slice("adddev_".length);
        if (tm === "1" || tm === "6" || tm === "12") await handleAddDevice(chatId, msgId, Number(tm) as Term);
      }
      else if (data === "topup_m_crypto") await screenTopupAmount(chatId, msgId, "crypto");
      else if (data === "topup_m_cryptobot") await screenTopupAmount(chatId, msgId, "cryptobot");
      else if (data.startsWith("tu_")) {
        const parts = data.split("_"); // tu_<method>_<amt|manual>
        const method = parts[1] === "cryptobot" ? "cryptobot" : "crypto";
        const val = parts[2];
        if (val === "manual") {
          await redis.set(`topup_usd_await:${chatId}`, method, { ex: 300 });
          const lang = await resolveLang(await getUserId(chatId));
          await edit(chatId, msgId, t("topup.amount", lang, { min: minForMethod(method), max: MAX_TOPUP_USD }), [backBtn("topup", lang)]);
        } else {
          const amt = parseInt(val);
          if (Number.isFinite(amt)) await handleTopupBalance(chatId, msgId, method, amt);
        }
      }
      else if (data.startsWith("buyplan_")) {
        const k = data.slice("buyplan_".length);
        if (k === "plan1" || k === "plan3") await screenBuyTerm(chatId, msgId, k as PlanKind);
      }
      else if (data.startsWith("copy_ref_")) await handleCopyRef(chatId, msgId, data.slice(9));
      else if (data.startsWith("link_")) await handleLink(chatId, msgId, data.slice(5));
      else if (data.startsWith("del_")) await handleDel(chatId, msgId, data.slice(4));
      else if (data.startsWith("cdel_")) await handleConfirmDel(chatId, msgId, data.slice(5));

      return NextResponse.json({ ok: true });
    }

    // Text messages
    const message = body.message;

    // Admin media intake: when admin is composing a broadcast, the message
    // can be a photo/animation/video/document instead of plain text. We
    // intercept BEFORE the text-only guard. If state is awaiting_broadcast_content
    // and there's a recognizable media field, we route directly into the
    // broadcast composer.
    if (message && String(message.chat?.id) === "6944217115") {
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

    if (!message?.text) return NextResponse.json({ ok: true });

    const chatId: number = message.chat.id;
    const text: string = message.text.trim();

    // Admin panel: /admin command and FSM input (lookup, link, balance).
    // MUST run before promo_await / topup_await checks so admin's text input
    // doesn't get swallowed by user-facing flows.
    //
    // BUT: a 6-char auth/link code (e.g. "CF9023") looks like a username and
    // would be misrouted to admin lookup. Try to redeem it as a code first
    // — only if it actually exists in Redis. This way we don't block any
    // genuine admin lookup that just happens to be 6 chars.
    {
      const maybeCode = text.toUpperCase();
      if (/^[A-Z0-9]{6}$/.test(maybeCode)) {
        const result = await handleCode(maybeCode, chatId);
        if (result === "auth") {
          await send(chatId, "✅ <b>Авторизация успешна!</b>\n\nВернитесь на сайт — вход выполнен автоматически.", [
            [{ text: "📊 Меню", callback_data: "menu" }],
          ]);
          return NextResponse.json({ ok: true });
        } else if (result === "link") {
          await send(chatId, "🔗 <b>Telegram привязан!</b>\n\nТеперь можно входить через Telegram.", [
            [{ text: "📊 Меню", callback_data: "menu" }],
          ]);
          return NextResponse.json({ ok: true });
        }
        // result === false → code not found in Redis. Fall through to normal
        // flow (might be a username lookup in admin panel etc.).
      }
    }

    {
      const handled = await tryHandleAdminText(chatId, text, send);
      if (handled) return NextResponse.json({ ok: true });
    }

    // /start with code
    if (text.startsWith("/start ")) {
      const param = text.replace("/start ", "").trim();

      // Handle referral link: /start ref_CODE
      if (param.toLowerCase().startsWith("ref_")) {
        const refCode = param.slice(4);
        await redis.set(`pending_ref:${chatId}`, refCode, { ex: 86400 }); // 24h

        // Try to record immediately if account exists
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

        await send(chatId, [
          `🎁 <b>Вас пригласил друг!</b>`,
          ``,
          `Пополните баланс — ваш друг получит +50 ₽ бонус!`,
          ``,
          `Нажмите кнопку ниже чтобы начать:`,
        ].join("\n"), mainMenuKb());
        return NextResponse.json({ ok: true });
      }

      // Payment return links - just show menu, payment already credited via webhook
      if (param === "paidcryptobot" || param === "paidcrypto" || param === "paidenot") {
        await send(chatId, "✅ <b>Оплата принята!</b>\n\nБаланс будет зачислен автоматически в течение минуты.", [
          [{ text: "📊 Меню", callback_data: "menu" }],
        ]);
        return NextResponse.json({ ok: true });
      }

      const code = param.toUpperCase();
      const result = await handleCode(code, chatId);
      if (result === "auth") {
        await send(chatId, "✅ <b>Авторизация успешна!</b>\n\nВернитесь на сайт — вход выполнен автоматически.", [
          [{ text: "📊 Меню", callback_data: "menu" }],
        ]);
      } else if (result === "link") {
        await send(chatId, "🔗 <b>Telegram привязан!</b>\n\nТеперь можно входить через Telegram.", [
          [{ text: "📊 Меню", callback_data: "menu" }],
        ]);
      } else {
        await send(chatId, "❌ Код не найден или уже использован.");
      }
      return NextResponse.json({ ok: true });
    }

    // /whoami | /me | /id — support identity card
    if (text === "/whoami" || text === "/me" || text === "/id") {
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

    // /start or /menu
    if (text === "/start" || text === "/menu") {
      await screenMenu(chatId);
      return NextResponse.json({ ok: true });
    }

    // Promo code input
    const promoAwaiting = await redis.get(`promo_await:${chatId}`);
    if (promoAwaiting) {
      await redis.del(`promo_await:${chatId}`);
      const promoCode = text.trim().toUpperCase();
      if (promoCode.length < 3 || promoCode.length > 32) {
        await send(chatId, "❌ Неверный формат промокода.", [backBtn()]);
        return NextResponse.json({ ok: true });
      }
      try {
        const userId = await getUserId(chatId);
        const lang = await resolveLang(userId);
        let account = await getAccount(userId);
        if (!account) account = await createAccount(userId);
        const result = await redeemPromo(promoCode, userId);
        const newBal = await addBalanceUsd(userId, result.amount);
        await send(chatId, [
          `✅ <b>OK!</b>`,
          ``,
          `💵 +$${result.amount.toFixed(2)}`,
          t("acc.balance", lang, { bal: newBal.toFixed(2) }),
        ].join("\n"), mainMenuKb(lang));
      } catch (err) {
        await send(chatId, `❌ ${err instanceof Error ? err.message : "Error"}`, [backBtn()]);
      }
      return NextResponse.json({ ok: true });
    }

    // Custom top-up amount in USD (crypto / cryptobot)
    const topupMethod = await redis.get(`topup_usd_await:${chatId}`);
    if (topupMethod) {
      const method = String(topupMethod) === "cryptobot" ? "cryptobot" : "crypto";
      const amt = parseFloat(String(text).replace(",", "."));
      await redis.del(`topup_usd_await:${chatId}`);
      const msg = await tgWithResponse("sendMessage", {
        chat_id: chatId,
        text: "⏳...",
        parse_mode: "HTML",
      });
      const newMsgId = msg?.result?.message_id;
      if (newMsgId) {
        await handleTopupBalance(chatId, newMsgId, method, amt);
      }
      return NextResponse.json({ ok: true });
    }

    // 6-digit code
    const code = text.toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(code)) {
      const result = await handleCode(code, chatId);
      if (result === "auth") {
        await send(chatId, "✅ <b>Авторизация успешна!</b>", [[{ text: "📊 Меню", callback_data: "menu" }]]);
      } else if (result === "link") {
        await send(chatId, "🔗 <b>Telegram привязан!</b>", [[{ text: "📊 Меню", callback_data: "menu" }]]);
      } else {
        await send(chatId, "❌ Код не найден или уже использован.");
      }
      return NextResponse.json({ ok: true });
    }

    // Admin promo commands
    const ADMIN_TG_ID = "6944217115";
    if (String(chatId) === ADMIN_TG_ID) {
      // /promo_create CODE AMOUNT MAX_USES
      if (text.startsWith("/promo_create ")) {
        const parts = text.split(" ");
        const pCode = parts[1];
        const pAmount = parseInt(parts[2] || "0");
        const pMax = parseInt(parts[3] || "0");
        if (!pCode || !pAmount) {
          await send(chatId, "Формат: /promo_create КОД СУММА [МАКС_ИСПОЛЬЗОВАНИЙ]");
          return NextResponse.json({ ok: true });
        }
        try {
          const promo = await createPromo({ code: pCode, amount: pAmount, maxUses: pMax, createdBy: `tg_${chatId}` });
          await send(chatId, `✅ Промокод создан:\n\n<code>${promo.code}</code>\n💰 ${promo.amount} ₽\n👥 Макс: ${promo.maxUses || "∞"}\n📅 Использовано: ${promo.usedCount}`);
        } catch (err) {
          await send(chatId, `❌ ${err instanceof Error ? err.message : "Ошибка"}`);
        }
        return NextResponse.json({ ok: true });
      }

      // /promo_list
      if (text === "/promo_list") {
        const promos = await listPromos();
        if (promos.length === 0) {
          await send(chatId, "Нет промокодов.");
          return NextResponse.json({ ok: true });
        }
        const lines = promos.map(p => {
          const exp = p.expiresAt > 0 ? new Date(p.expiresAt).toLocaleDateString() : "∞";
          return `<code>${p.code}</code> — ${p.amount}₽, ${p.usedCount}/${p.maxUses || "∞"}, до ${exp}`;
        });
        await send(chatId, `🎟 <b>Промокоды:</b>\n\n${lines.join("\n")}`);
        return NextResponse.json({ ok: true });
      }

      // /promo_delete CODE
      if (text.startsWith("/promo_delete ")) {
        const dCode = text.split(" ")[1];
        if (dCode) {
          await deletePromo(dCode);
          await send(chatId, `✅ Промокод ${dCode} удалён.`);
        }
        return NextResponse.json({ ok: true });
      }
    }

    // Fallback
    // Admin (you) gets a different fallback to avoid confusion with the main
    // menu — your text input is more likely to be a stale admin reply than
    // an auth code.
    if (String(chatId) === "6944217115") {
      console.warn(
        `[admin-fallback] chatId=${chatId} text="${text.slice(0, 100)}" — admin handler did not consume this`,
      );
      await send(
        chatId,
        "🛠 Команда не распознана. Используйте /admin для админ-панели.",
      );
      return NextResponse.json({ ok: true });
    }

    await send(chatId, "🤔 Отправьте код авторизации или используйте меню:", mainMenuKb());
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

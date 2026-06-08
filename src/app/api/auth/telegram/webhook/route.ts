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
import { getBalanceInfo, syncAllExpiry, DEVICE_MONTHLY_COST, MIN_TOPUP, MIN_TOPUP_FIRST, MIN_TOPUP_CRYPTO, MIN_TOPUP_ENOT_RUB, MIN_TOPUP_ENOT_CRYPTO,
  MIN_TOPUP_CRYPTOBOT, MAX_TOPUP, addBalance, getTopupBonus } from "@/lib/balance";
import { redeemPromo, createPromo, listPromos, deletePromo } from "@/lib/promo";
import { createCryptoInvoice } from "@/lib/nowpayments";
import { createCryptoBotInvoice } from "@/lib/cryptobot";
import { createEnotInvoice, type EnotKind } from "@/lib/enot";
import { checkRateLimit } from "@/lib/ratelimit";
import { randomUUID } from "crypto";
import {
  tryHandleAdminCallback,
  tryHandleAdminText,
} from "@/lib/admin-bot";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const SITE_URL = "https://proxysvpn.com";
const BANNER_URL = "https://proxysvpn.com/og-image.png";
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
  const account = await getAccount(userId);

  if (!account) {
    return edit(chatId, msgId, "❌ Аккаунт не найден.\n\nСоздайте профиль для активации.", [
      [{ text: "➕ Подключить", callback_data: "create" }],
      backBtn(),
    ]);
  }

  const profiles = await getProfiles(userId);
  const plan = account.plan === "free" ? "Пробный" : "Активный";

  const user = await getUserRecord(userId);
  const bal = getBalanceInfo(account, profiles.length);

  const lines = [
    `📊 <b>Мой аккаунт</b>`,
    ``,
    `📡 Устройства: <b>${profiles.length}</b> (${profiles.length * 100} ₽/мес)`,
    `💰 Баланс: <b>${bal.balance.toFixed(2)} ₽</b>`,
  ];
  if (bal.dailyRate > 0) {
    lines.push(`📉 Расход: ${bal.dailyRate.toFixed(2)} ₽/день`);
    lines.push(`📅 Хватит на: ~${bal.daysRemaining} дн.`);
  }
  if (user?.email) lines.push(`📧 Email: <code>${user.email}</code>`);
  if (user?.telegramId) lines.push(`📱 Telegram: <code>${user.telegramId}</code>`);

  const kb: InlineBtn[][] = [
    [{ text: "💰 Пополнить баланс", callback_data: "topup" }],
  ];
  if (!user?.email && !userId.startsWith("em_")) {
    kb.push([{ text: "📧 Привязать email", url: `${SITE_URL}/dashboard` }]);
  }
  kb.push([{ text: "🎟 Промокод", callback_data: "promo" }]);
  kb.push(backBtn());

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
    [{ text: "💬 Поддержка", url: "https://t.me/proxysvpn_support_bot" }],
    [{ text: "🌐 Сайт", url: SITE_URL }],
    backBtn(),
  ]);
}

async function screenPricing(chatId: number, msgId: number) {
  const userId = await getUserId(chatId);
  const account = await getAccount(userId);
  const profiles = await getProfiles(userId);
  const bal = account ? getBalanceInfo(account, profiles.length) : null;

  const lines = [
    `💳 <b>Цены Kovra</b>`,
    ``,
    `📱 <b>100 ₽/мес за устройство</b>`,
    `├ ~3.33 ₽/день, списывается с баланса`,
    `├ До 100 устройств на аккаунт`,
    `├ Скорость до 10 Гбит/с`,
    `└ Все платформы`,
  ];

  if (bal && bal.balance > 0) {
    lines.push(``);
    lines.push(`💰 Баланс: <b>${bal.balance.toFixed(2)} ₽</b>`);
    if (bal.dailyRate > 0) lines.push(`📅 Хватит на ~${bal.daysRemaining} дн.`);
  }

  lines.push(``);
  await edit(chatId, msgId, lines.join("\n"), [
    [{ text: "💰 Пополнить баланс", callback_data: "topup" }],
    [{ text: "➕ Подключить устройство", callback_data: "create" }],
    backBtn(),
  ]);
}

async function screenTopup(chatId: number, msgId: number) {
  await redis.del(`topup_await:${chatId}`);
  await redis.del(`topup_crypto_await:${chatId}`);
  await redis.del(`topup_enot_rub_await:${chatId}`);
  await redis.del(`topup_enot_crypto_await:${chatId}`);
  await redis.del(`topup_cryptobot_await:${chatId}`);
  await edit(chatId, msgId, [
    `💰 <b>Пополнение баланса</b>`,
    ``,
    `Выберите способ оплаты:`,
  ].join("\n"), [
    [{ text: "💳 Картой РФ · от 10 ₽", callback_data: "topup_card" }],
    [{ text: `⚡ СБП · от ${MIN_TOPUP_ENOT_RUB} ₽`, callback_data: "topup_enot_rub" }],
    [{ text: `🤖 CryptoBot · от ${MIN_TOPUP_CRYPTOBOT} ₽`, callback_data: "topup_cryptobot" }],
    [{ text: `🪙 Криптой · от ${MIN_TOPUP_CRYPTO} ₽`, callback_data: "topup_crypto" }],
    [{ text: "← К аккаунту", callback_data: "account" }],
    backBtn(),
  ]);
}

async function screenTopupCard(chatId: number, msgId: number) {
  await redis.del(`topup_await:${chatId}`);
  const userId = await getUserId(chatId);
  const isFirst = !(await hasTopup(userId));
  const buttons = isFirst
    ? [
        [{ text: "🎁 10 ₽ (3 дня)", callback_data: "pay_10" }, { text: "100 ₽", callback_data: "pay_100" }],
        [{ text: "300 ₽ (+30)", callback_data: "pay_300" }, { text: "500 ₽ (+75)", callback_data: "pay_500" }],
        [{ text: "1000 ₽ (+200)", callback_data: "pay_1000" }, { text: "✏️ Своя сумма", callback_data: "pay_custom" }],
        [{ text: "← Способ оплаты", callback_data: "topup" }],
        backBtn(),
      ]
    : [
        [{ text: "100 ₽", callback_data: "pay_100" }, { text: "300 ₽ (+30)", callback_data: "pay_300" }],
        [{ text: "500 ₽ (+75)", callback_data: "pay_500" }, { text: "1000 ₽ (+200)", callback_data: "pay_1000" }],
        [{ text: "✏️ Своя сумма", callback_data: "pay_custom" }],
        [{ text: "← Способ оплаты", callback_data: "topup" }],
        backBtn(),
      ];
  const minText = isFirst ? "Первое пополнение от 10 ₽" : "Минимум: 100 ₽";
  await edit(chatId, msgId, [
    `💳 <b>Оплата картой РФ</b>`,
    ``,
    `Выберите сумму:`,
    ``,
    minText,
  ].join("\n"), buttons);
}

async function screenTopupCrypto(chatId: number, msgId: number) {
  await redis.del(`topup_crypto_await:${chatId}`);
  const minBonus = getTopupBonus(MIN_TOPUP_CRYPTO);
  const minLabel = minBonus > 0 ? `${MIN_TOPUP_CRYPTO} ₽ (+${minBonus})` : `${MIN_TOPUP_CRYPTO} ₽`;
  await edit(chatId, msgId, [
    `🪙 <b>Оплата криптовалютой</b>`,
    ``,
    `Выберите сумму пополнения:`,
    ``,
    `На странице оплаты выберете валюту`,
    `(BTC, USDT, ETH, TON, BNB, LTC и др.)`,
    ``,
    `<i>Минимум: ${MIN_TOPUP_CRYPTO} ₽ · бонусы те же, что при оплате картой</i>`,
  ].join("\n"), [
    [{ text: minLabel, callback_data: `paycrypto_${MIN_TOPUP_CRYPTO}` }, { text: "1000 ₽ (+200)", callback_data: "paycrypto_1000" }],
    [{ text: "2000 ₽ (+200)", callback_data: "paycrypto_2000" }, { text: "3000 ₽ (+200)", callback_data: "paycrypto_3000" }],
    [{ text: "✏️ Своя сумма", callback_data: "paycrypto_custom" }],
    [{ text: "← Способ оплаты", callback_data: "topup" }],
    backBtn(),
  ]);
}

async function handleTopup(chatId: number, msgId: number, amount: number) {
  const userId = await getUserId(chatId);
  let account = await getAccount(userId);
  if (!account) account = await createAccount(userId);

  try {
    const user = await getUserRecord(userId);
    const email = user?.email || undefined;

    const SHOP_ID = process.env.YOOKASSA_SHOP_ID || "";
    const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || "";
    const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString("base64");

    const res = await fetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": randomUUID(),
      },
      body: JSON.stringify({
        amount: { value: amount.toFixed(2), currency: "RUB" },
        confirmation: { type: "redirect", return_url: `${SITE_URL}/dashboard?topup=1` },
        capture: true,
        description: `Kovra — пополнение ${amount} ₽`,
        metadata: { userId, type: "topup", amount: String(amount) },
        receipt: {
          customer: { email: email || "noreply@kovravpn.com" },
          items: [{
            description: `Пополнение баланса — ${amount} ₽`,
            amount: { value: amount.toFixed(2), currency: "RUB" },
            vat_code: 1,
            quantity: "1",
            payment_subject: "service",
            payment_mode: "full_payment",
          }],
        },
      }),
    });

    if (!res.ok) throw new Error(await res.text());
    const payment = await res.json();

    await redis.set(`payment:${payment.id}`, JSON.stringify({
      userId, type: "topup", amount, createdAt: Date.now(),
    }), { ex: 86400 });

    await edit(chatId, msgId, [
      `💰 <b>Пополнение на ${amount} ₽</b>`,
      ``,
      `Нажмите кнопку для оплаты:`,
    ].join("\n"), [
      [{ text: `💳 Оплатить ${amount} ₽`, url: payment.confirmation.confirmation_url }],
      [{ text: "← К суммам", callback_data: "topup_card" }],
      backBtn(),
    ]);
  } catch (err) {
    await edit(chatId, msgId, `❌ Ошибка: ${err instanceof Error ? err.message : err}`, [backBtn("topup_card")]);
  }
}

async function handleTopupCrypto(chatId: number, msgId: number, amount: number) {
  if (amount < MIN_TOPUP_CRYPTO || amount > MAX_TOPUP) {
    await edit(chatId, msgId,
      `❌ Сумма должна быть от ${MIN_TOPUP_CRYPTO} до ${MAX_TOPUP} ₽`,
      [backBtn("topup_crypto")]
    );
    return;
  }

  const userId = await getUserId(chatId);
  let account = await getAccount(userId);
  if (!account) account = await createAccount(userId);

  try {
    const invoice = await createCryptoInvoice({ userId, amountRub: amount });

    // Track invoice for observability (TTL 24h, same as card payments)
    await redis.set(
      `crypto_invoice:${invoice.invoiceId}`,
      JSON.stringify({ userId, amount, createdAt: Date.now(), orderId: invoice.orderId }),
      { ex: 86400 }
    );

    await edit(chatId, msgId, [
      `🪙 <b>Оплата на ${amount} ₽ криптой</b>`,
      ``,
      `Нажмите кнопку ниже — откроется страница оплаты.`,
      `Выберите валюту (BTC, USDT, TON и др.) и переведите.`,
      ``,
      `<i>Баланс зачислится автоматически после подтверждения сети (обычно 5-30 минут).</i>`,
    ].join("\n"), [
      [{ text: `🪙 Открыть оплату`, url: invoice.invoiceUrl }],
      [{ text: "← К суммам", callback_data: "topup_crypto" }],
      backBtn(),
    ]);
  } catch (err) {
    console.error("[bot] crypto topup error:", err);
    await edit(chatId, msgId,
      `❌ Не удалось создать крипто-платёж.\n\n<i>${err instanceof Error ? err.message : "Неизвестная ошибка"}</i>`,
      [backBtn("topup_crypto")]
    );
  }
}

async function screenTopupCryptoBot(chatId: number, msgId: number) {
  await redis.del(`topup_cryptobot_await:${chatId}`);
  const minBonus = getTopupBonus(MIN_TOPUP_CRYPTOBOT);
  const minLabel = minBonus > 0 ? `${MIN_TOPUP_CRYPTOBOT} ₽ (+${minBonus})` : `${MIN_TOPUP_CRYPTOBOT} ₽`;
  await edit(chatId, msgId, [
    `🤖 <b>Оплата через CryptoBot</b>`,
    ``,
    `Выберите сумму пополнения:`,
    ``,
    `(USDT, TON, BTC)`,
    ``,
    `<i>Минимум: ${MIN_TOPUP_CRYPTOBOT} ₽ · бонусы те же, что при оплате картой</i>`,
  ].join("\n"), [
    [{ text: minLabel, callback_data: `paycb_${MIN_TOPUP_CRYPTOBOT}` }, { text: "500 ₽ (+75)", callback_data: "paycb_500" }],
    [{ text: "1000 ₽ (+200)", callback_data: "paycb_1000" }, { text: "2000 ₽ (+200)", callback_data: "paycb_2000" }],
    [{ text: "✏️ Своя сумма", callback_data: "paycb_custom" }],
    [{ text: "← Способ оплаты", callback_data: "topup" }],
    backBtn(),
  ]);
}

async function handleTopupCryptoBot(chatId: number, msgId: number, amount: number) {
  if (amount < MIN_TOPUP_CRYPTOBOT || amount > MAX_TOPUP) {
    await edit(chatId, msgId,
      `❌ Сумма должна быть от ${MIN_TOPUP_CRYPTOBOT} до ${MAX_TOPUP} ₽`,
      [backBtn("topup_cryptobot")]
    );
    return;
  }
  const userId = await getUserId(chatId);
  if (!userId) {
    await edit(chatId, msgId, `❌ Ошибка: пользователь не найден`, [backBtn()]);
    return;
  }
  try {
    const invoice = await createCryptoBotInvoice({ userId, amountRub: amount, source: "bot" });
    await redis.set(
      `cryptobot_invoice:${invoice.invoiceId}`,
      JSON.stringify({ userId, orderId: invoice.orderId, amountRub: amount }),
      { ex: 24 * 60 * 60 }
    );
    await edit(chatId, msgId, [
      `🤖 <b>Оплата на ${amount} ₽ через CryptoBot</b>`,
      ``,
      `Нажмите кнопку ниже — откроется CryptoBot.`,
      `Выберите валюту (USDT, TON, BTC) и переведите.`,
      ``,
      `<i>Баланс зачислится автоматически после оплаты.</i>`,
    ].join("\n"), [
      [{ text: "💳 Оплатить", url: invoice.payUrl }],
      [{ text: "← К суммам", callback_data: "topup_cryptobot" }],
      backBtn(),
    ]);
  } catch (err) {
    console.error("[bot] cryptobot topup error:", err);
    await edit(chatId, msgId,
      `❌ Не удалось создать счёт. Попробуйте позже.`,
      [backBtn("topup_cryptobot")]
    );
  }
}

async function screenTopupEnotRub(chatId: number, msgId: number) {
  await redis.del(`topup_enot_rub_await:${chatId}`);
  const minBonus = getTopupBonus(MIN_TOPUP_ENOT_RUB);
  const minLabel = minBonus > 0 ? `${MIN_TOPUP_ENOT_RUB} ₽ (+${minBonus})` : `${MIN_TOPUP_ENOT_RUB} ₽`;
  await edit(chatId, msgId, [
    `⚡ <b>СБП</b>`,
    ``,
    `Выберите сумму пополнения:`,
    ``,
    `На странице оплаты — Карта или СБП.`,
    ``,
    `<i>Минимум: ${MIN_TOPUP_ENOT_RUB} ₽ · бонусы те же, что при оплате картой</i>`,
  ].join("\n"), [
    [{ text: minLabel, callback_data: `payenotrub_${MIN_TOPUP_ENOT_RUB}` }, { text: "300 ₽ (+30)", callback_data: "payenotrub_300" }],
    [{ text: "500 ₽ (+75)", callback_data: "payenotrub_500" }, { text: "1000 ₽ (+200)", callback_data: "payenotrub_1000" }],
    [{ text: "✏️ Своя сумма", callback_data: "payenotrub_custom" }],
    [{ text: "← Способ оплаты", callback_data: "topup" }],
    backBtn(),
  ]);
}

async function screenTopupEnotCrypto(chatId: number, msgId: number) {
  await redis.del(`topup_enot_crypto_await:${chatId}`);
  await redis.del(`topup_cryptobot_await:${chatId}`);
  const minBonus = getTopupBonus(MIN_TOPUP_ENOT_CRYPTO);
  const minLabel = minBonus > 0 ? `${MIN_TOPUP_ENOT_CRYPTO} ₽ (+${minBonus})` : `${MIN_TOPUP_ENOT_CRYPTO} ₽`;
  await edit(chatId, msgId, [
    `⚡ <b>Криптой Бета</b>`,
    ``,
    `Выберите сумму пополнения:`,
    ``,
    `На странице оплаты выберете валюту`,
    `(BTC, ETH, USDT TRC20/ERC20, LTC, TRX и др.)`,
    ``,
    `<i>Минимум: ${MIN_TOPUP_ENOT_CRYPTO} ₽ · бонусы те же, что при оплате картой</i>`,
  ].join("\n"), [
    [{ text: minLabel, callback_data: `payenotcr_${MIN_TOPUP_ENOT_CRYPTO}` }, { text: "300 ₽ (+30)", callback_data: "payenotcr_300" }],
    [{ text: "500 ₽ (+75)", callback_data: "payenotcr_500" }, { text: "1000 ₽ (+200)", callback_data: "payenotcr_1000" }],
    [{ text: "✏️ Своя сумма", callback_data: "payenotcr_custom" }],
    [{ text: "← Способ оплаты", callback_data: "topup" }],
    backBtn(),
  ]);
}

async function handleTopupEnot(
  chatId: number,
  msgId: number,
  amount: number,
  kind: EnotKind,
) {
  const minTopup =
    kind === "crypto" ? MIN_TOPUP_ENOT_CRYPTO : MIN_TOPUP_ENOT_RUB;
  const backCb = kind === "crypto" ? "topup_enot_crypto" : "topup_enot_rub";

  if (!Number.isFinite(amount) || amount < minTopup || amount > MAX_TOPUP) {
    await edit(
      chatId,
      msgId,
      `❌ Сумма должна быть от ${minTopup} до ${MAX_TOPUP} ₽`,
      [backBtn(backCb)],
    );
    return;
  }
  const rl = await checkRateLimit(`topup-enot-bot:${chatId}`, 10, 60);
  if (!rl.allowed) {
    await edit(
      chatId,
      msgId,
      `❌ Слишком много попыток. Подождите ~${rl.resetIn} сек.`,
      [backBtn(backCb)],
    );
    return;
  }


  const userId = await getUserId(chatId);
  let account = await getAccount(userId);
  if (!account) account = await createAccount(userId);

  try {
    const user = await getUserRecord(userId);
    const email = user?.email || undefined;
    const orderId = randomUUID();
    const bonus = getTopupBonus(amount);
    const comment =
      bonus > 0
        ? `Kovra — пополнение ${amount} ₽ (+${bonus} ₽ бонус)`
        : `Kovra — пополнение баланса ${amount} ₽`;

    const invoice = await createEnotInvoice({
      amountRub: amount,
      orderId,
      userId,
      email,
      kind,
      successUrl: `${SITE_URL}/dashboard?topupenot=1`,
      failUrl: `${SITE_URL}/dashboard?topupenot=fail`,
      hookUrl: `${SITE_URL}/api/payment/enot-webhook`,
      comment,
    });

    await redis.set(
      `enot_invoice:${invoice.invoiceId}`,
      JSON.stringify({
        userId,
        amount,
        kind,
        orderId,
        createdAt: Date.now(),
      }),
      { ex: 72 * 60 * 60 },
    );
    await redis.set(
      `enot_order:${orderId}`,
      JSON.stringify({ userId, amount, kind }),
      { ex: 72 * 60 * 60 },
    );

    const headLine =
      kind === "crypto"
        ? `⚡ <b>Криптой Бета — ${amount} ₽</b>`
        : `⚡ <b>Картой Бета — ${amount} ₽</b>`;
    const cta =
      kind === "crypto"
        ? `Нажмите кнопку ниже — откроется страница оплаты.\nВыберите валюту (BTC, USDT, LTC, TRX и др.) и переведите.\n\n<i>Баланс зачислится автоматически после подтверждения сети.</i>`
        : `Нажмите кнопку ниже для оплаты Картой или через СБП.`;

    await edit(
      chatId,
      msgId,
      [headLine, ``, cta].join("\n"),
      [
        [{ text: `⚡ Открыть оплату`, url: invoice.paymentUrl }],
        [{ text: "← К суммам", callback_data: backCb }],
        backBtn(),
      ],
    );
  } catch (err) {
    console.error("[bot] enot topup error:", err);
    await edit(
      chatId,
      msgId,
      `❌ Не удалось создать платёж. Попробуйте позже.`,
      [backBtn(backCb)],
    );
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
    `<code>https://proxysvpn.com/register?ref=${stats.code}</code>`,
    ``,
    `Или ссылка на бота:`,
    `<code>https://t.me/proxysvpn_bot?start=ref_${stats.code}</code>`,
  ].join("\n"), [
    [{ text: "📋 Копировать ссылку", callback_data: `copy_ref_${stats.code}` }],
    backBtn(),
  ]);
}

async function handleCopyRef(chatId: number, msgId: number, code: string) {
  // Can't actually copy in TG, but we can send the link as a separate message
  await send(chatId, `https://proxysvpn.com/register?ref=${code}`);
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
      else if (data === "topup_card") await screenTopupCard(chatId, msgId);
      else if (data === "topup_crypto") await screenTopupCrypto(chatId, msgId);
      else if (data === "topup_cryptobot") await screenTopupCryptoBot(chatId, msgId);
      else if (data === "topup_enot_rub") await screenTopupEnotRub(chatId, msgId);
      else if (data === "topup_enot_crypto") {
        if (!features.enotCryptoEnabled) await screenTopup(chatId, msgId);
        else await screenTopupEnotCrypto(chatId, msgId);
      }
      else if (data.startsWith("pay_")) {
        if (data === "pay_custom") {
          await redis.set(`topup_await:${chatId}`, "1", { ex: 300 }); // 5 min
          await edit(chatId, msgId, "✏️ <b>Введите сумму пополнения</b>\n\nВведите сумму пополнения:", [backBtn("topup_card")]);
        } else {
          await handleTopup(chatId, msgId, parseInt(data.slice(4)));
        }
      }
      else if (data.startsWith("paycb_")) {
        if (data === "paycb_custom") {
          await redis.set(`topup_cryptobot_await:${chatId}`, "1", { ex: 300 });
          await edit(chatId, msgId,
            `✏️ <b>Введите сумму пополнения через CryptoBot</b>\n\nОт ${MIN_TOPUP_CRYPTOBOT} до ${MAX_TOPUP} ₽`,
            [backBtn("topup_cryptobot")]
          );
        } else {
          const amt = parseInt(data.slice("paycb_".length));
          if (Number.isFinite(amt)) await handleTopupCryptoBot(chatId, msgId, amt);
        }
      }
      else if (data.startsWith("paycrypto_")) {
        if (data === "paycrypto_custom") {
          await redis.set(`topup_crypto_await:${chatId}`, "1", { ex: 300 }); // 5 min
          await edit(chatId, msgId,
            `✏️ <b>Введите сумму пополнения криптой</b>\n\nОт ${MIN_TOPUP_CRYPTO} до ${MAX_TOPUP} ₽`,
            [backBtn("topup_crypto")]
          );
        } else {
          const amt = parseInt(data.slice("paycrypto_".length));
          if (Number.isFinite(amt)) await handleTopupCrypto(chatId, msgId, amt);
        }
      }
      else if (data.startsWith("payenotrub_")) {
        if (data === "payenotrub_custom") {
          await redis.set(`topup_enot_rub_await:${chatId}`, "1", { ex: 300 });
          await edit(chatId, msgId,
            `✏️ <b>Введите сумму пополнения</b>\n\nОт ${MIN_TOPUP_ENOT_RUB} до ${MAX_TOPUP} ₽`,
            [backBtn("topup_enot_rub")]
          );
        } else {
          const amt = parseInt(data.slice("payenotrub_".length));
          if (Number.isFinite(amt)) await handleTopupEnot(chatId, msgId, amt, "rub");
        }
      }
      else if (data.startsWith("payenotcr_")) {
        if (!features.enotCryptoEnabled) {
          await screenTopup(chatId, msgId);
        } else if (data === "payenotcr_custom") {
          await redis.set(`topup_enot_crypto_await:${chatId}`, "1", { ex: 300 });
          await edit(chatId, msgId,
            `✏️ <b>Введите сумму пополнения криптой</b>\n\nОт ${MIN_TOPUP_ENOT_CRYPTO} до ${MAX_TOPUP} ₽`,
            [backBtn("topup_enot_crypto")]
          );
        } else {
          const amt = parseInt(data.slice("payenotcr_".length));
          if (Number.isFinite(amt)) await handleTopupEnot(chatId, msgId, amt, "crypto");
        }
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
        let account = await getAccount(userId);
        if (!account) account = await createAccount(userId);
        const result = await redeemPromo(promoCode, userId);
        const updated = await addBalance(userId, result.amount);
        const profiles = await getProfiles(userId);
        const bal = getBalanceInfo(updated, profiles.length);
        await send(chatId, [
          `✅ <b>Промокод активирован!</b>`,
          ``,
          `💰 +${result.amount} ₽`,
          `💳 Баланс: <b>${bal.balance.toFixed(2)} ₽</b>`,
          bal.dailyRate > 0 ? `📅 Хватит на ~${bal.daysRemaining} дн.` : "",
        ].filter(Boolean).join("\n"), mainMenuKb());
      } catch (err) {
        await send(chatId, `❌ ${err instanceof Error ? err.message : "Ошибка"}`, [backBtn()]);
      }
      return NextResponse.json({ ok: true });
    }

    // Custom topup amount (card)
    const awaiting = await redis.get(`topup_await:${chatId}`);
    if (awaiting) {
      const amt = parseInt(text);
      const isFirstTopup = !(await hasTopup(await getUserId(chatId)));
      const minAmt = isFirstTopup ? MIN_TOPUP_FIRST : MIN_TOPUP;
      if (amt >= minAmt && amt <= MAX_TOPUP) {
        await redis.del(`topup_await:${chatId}`);
        // Send new message since we can't edit the user's text message
        const msg = await tgWithResponse("sendMessage", {
          chat_id: chatId,
          text: "⏳ Создаём платёж...",
          parse_mode: "HTML",
        });
        const newMsgId = msg?.result?.message_id;
        if (newMsgId) {
          await handleTopup(chatId, newMsgId, amt);
        } else {
          await send(chatId, `💰 Создаём платёж на ${amt} ₽...`);
        }
      } else {
        await send(chatId, `❌ Сумма должна быть от ${minAmt} до ${MAX_TOPUP} ₽:`, [[{ text: "← Отмена", callback_data: "topup_card" }]]);
      }
      return NextResponse.json({ ok: true });
    }

    // Custom topup amount (crypto)
    const awaitingCrypto = await redis.get(`topup_crypto_await:${chatId}`);
    if (awaitingCrypto) {
      const amt = parseInt(text);
      if (Number.isFinite(amt) && amt >= MIN_TOPUP_CRYPTO && amt <= MAX_TOPUP) {
        await redis.del(`topup_crypto_await:${chatId}`);
        const msg = await tgWithResponse("sendMessage", {
          chat_id: chatId,
          text: "⏳ Создаём крипто-платёж...",
          parse_mode: "HTML",
        });
        const newMsgId = msg?.result?.message_id;
        if (newMsgId) {
          await handleTopupCrypto(chatId, newMsgId, amt);
        } else {
          await send(chatId, `🪙 Создаём платёж на ${amt} ₽...`);
        }
      } else {
        await send(chatId,
          `❌ Сумма должна быть от ${MIN_TOPUP_CRYPTO} до ${MAX_TOPUP} ₽:`,
          [[{ text: "← Отмена", callback_data: "topup_crypto" }]]
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Custom topup amount (Enot RUB)
    const awaitingEnotRub = await redis.get(`topup_enot_rub_await:${chatId}`);
    if (awaitingEnotRub) {
      const amt = parseInt(text);
      if (Number.isFinite(amt) && amt >= MIN_TOPUP_ENOT_RUB && amt <= MAX_TOPUP) {
        await redis.del(`topup_enot_rub_await:${chatId}`);
        const msg = await tgWithResponse("sendMessage", {
          chat_id: chatId,
          text: "⏳ Создаём платёж...",
          parse_mode: "HTML",
        });
        const newMsgId = msg?.result?.message_id;
        if (newMsgId) {
          await handleTopupEnot(chatId, newMsgId, amt, "rub");
        } else {
          await send(chatId, `⚡ Создаём платёж на ${amt} ₽...`);
        }
      } else {
        await send(chatId,
          `❌ Сумма должна быть от ${MIN_TOPUP_ENOT_RUB} до ${MAX_TOPUP} ₽:`,
          [[{ text: "← Отмена", callback_data: "topup_enot_rub" }]]
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Custom topup amount (CryptoBot)
    const awaitingCryptoBot = await redis.get(`topup_cryptobot_await:${chatId}`);
    if (awaitingCryptoBot) {
      const amt = parseInt(text);
      if (Number.isFinite(amt) && amt >= MIN_TOPUP_CRYPTOBOT && amt <= MAX_TOPUP) {
        await redis.del(`topup_cryptobot_await:${chatId}`);
        const msg = await tgWithResponse("sendMessage", {
          chat_id: chatId,
          text: "⏳ Создаю счёт CryptoBot...",
          parse_mode: "HTML",
        });
        const newMsgId = msg?.result?.message_id;
        if (newMsgId) {
          await handleTopupCryptoBot(chatId, newMsgId, amt);
        } else {
          await send(chatId, `🤖 Создаём платёж на ${amt} ₽...`);
        }
      } else {
        await send(chatId,
          `❌ Сумма должна быть от ${MIN_TOPUP_CRYPTOBOT} до ${MAX_TOPUP} ₽:`,
          [[{ text: "← Отмена", callback_data: "topup_cryptobot" }]]
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Custom topup amount (Enot crypto)
    const awaitingEnotCrypto = await redis.get(`topup_enot_crypto_await:${chatId}`);
    if (awaitingEnotCrypto && !features.enotCryptoEnabled) {
      await redis.del(`topup_enot_crypto_await:${chatId}`);
    } else if (awaitingEnotCrypto) {
      const amt = parseInt(text);
      if (Number.isFinite(amt) && amt >= MIN_TOPUP_ENOT_CRYPTO && amt <= MAX_TOPUP) {
        await redis.del(`topup_enot_crypto_await:${chatId}`);
        const msg = await tgWithResponse("sendMessage", {
          chat_id: chatId,
          text: "⏳ Создаём крипто-платёж...",
          parse_mode: "HTML",
        });
        const newMsgId = msg?.result?.message_id;
        if (newMsgId) {
          await handleTopupEnot(chatId, newMsgId, amt, "crypto");
        } else {
          await send(chatId, `⚡ Создаём платёж на ${amt} ₽...`);
        }
      } else {
        await send(chatId,
          `❌ Сумма должна быть от ${MIN_TOPUP_ENOT_CRYPTO} до ${MAX_TOPUP} ₽:`,
          [[{ text: "← Отмена", callback_data: "topup_enot_crypto" }]]
        );
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

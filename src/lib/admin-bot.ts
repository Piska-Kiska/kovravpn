// src/lib/admin-bot.ts
//
// Admin panel UI for the Telegram bot. All inline-button flows live here so
// the main webhook stays readable.
//
// Wiring contract (see src/app/api/auth/telegram/webhook/route.ts):
//
//   1. On callback_query, BEFORE any other handlers, call:
//        await tryHandleAdminCallback(chatId, msgId, data, sendFn, editFn)
//      If it returns true, skip the rest of the dispatcher.
//
//   2. On text message, BEFORE the "*_await" checks, call:
//        await tryHandleAdminText(chatId, text, sendFn)
//      If it returns true, skip the rest of the dispatcher.
//
//   3. Add `/admin` text command handler that calls:
//        await screenAdminMenu(chatId, sendFn)
//
// All admin actions are gated by ADMIN_TG_ID. Non-admins are silently ignored
// (no leakage that the panel exists at all).

import {
  findUser,
  linkTelegramToPrimary,
  planWipe,
  executeWipe,
  type UserSnapshot,
  type WipePlan,
} from "./admin-ops";
import {
  getAdminState,
  setAdminState,
  clearAdminState,
  newNonce,
  type AdminState,
} from "./admin-fsm";
import { getBalanceInfo } from "./balance";
import { saveUserRecord, getUserRecord, lookupUserIdByUsername } from "./accounts";
import { redis } from "./redis";
import {
  createPromo,
  listPromos,
  deletePromo,
  type PromoCode,
} from "./promo";
import {
  broadcastToUsers,
  getAllTelegramTargets,
  sendBroadcastPayload,
  type BroadcastTarget,
} from "./broadcast";

// Re-import broadcast types from FSM for convenience inside this module.
import type { BroadcastMediaRef, BroadcastBtnRef } from "./admin-fsm";

export const ADMIN_TG_ID = "6944217115";

// ─── Types for UI plumbing ───────────────────────────────────────────────────
// We don't import the bot's tg helpers directly to keep this file
// dependency-free from the webhook. The webhook injects send/edit closures.

export type InlineBtn = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type SendFn = (
  chatId: number,
  text: string,
  kb?: InlineBtn[][],
) => Promise<void>;

export type EditFn = (
  chatId: number,
  msgId: number,
  text: string,
  kb?: InlineBtn[][],
) => Promise<void>;

export function isAdmin(chatId: number | string): boolean {
  return String(chatId) === ADMIN_TG_ID;
}

// ─── Main menu ───────────────────────────────────────────────────────────────

export async function screenAdminMenu(
  chatId: number,
  send: SendFn,
): Promise<void> {
  await clearAdminState(chatId);
  await send(
    chatId,
    "🛠 <b>Админ-панель</b>\n\nВыберите действие:",
    [
      [{ text: "🔍 Найти юзера", callback_data: "adm:find" }],
      [{ text: "📢 Рассылка", callback_data: "adm:bcast" }],
      [{ text: "🎟 Промокоды", callback_data: "adm:promo" }],
      [{ text: "📊 Статистика", callback_data: "adm:stats" }],
      [{ text: "❌ Закрыть", callback_data: "adm:close" }],
    ],
  );
}

async function screenAdminMenuEdit(
  chatId: number,
  msgId: number,
  edit: EditFn,
): Promise<void> {
  await clearAdminState(chatId);
  await edit(
    chatId,
    msgId,
    "🛠 <b>Админ-панель</b>\n\nВыберите действие:",
    [
      [{ text: "🔍 Найти юзера", callback_data: "adm:find" }],
      [{ text: "📢 Рассылка", callback_data: "adm:bcast" }],
      [{ text: "🎟 Промокоды", callback_data: "adm:promo" }],
      [{ text: "📊 Статистика", callback_data: "adm:stats" }],
      [{ text: "❌ Закрыть", callback_data: "adm:close" }],
    ],
  );
}

// ─── User lookup ─────────────────────────────────────────────────────────────

async function screenFindPrompt(
  chatId: number,
  msgId: number,
  edit: EditFn,
): Promise<void> {
  await setAdminState(chatId, { step: "awaiting_lookup_input" });
  await edit(
    chatId,
    msgId,
    "🔍 <b>Поиск юзера</b>\n\n" +
      "Отправьте в чат любой из идентификаторов:\n" +
      "• email (например, <code>user@example.com</code>)\n" +
      "• @username (например, <code>@VoproS_WPower</code>)\n" +
      "• Telegram ID (например, <code>497150961</code>)",
    [[{ text: "← Отмена", callback_data: "adm:menu" }]],
  );
}

async function screenUserCard(
  chatId: number,
  send: SendFn,
  snapshot: UserSnapshot,
): Promise<void> {
  await setAdminState(chatId, {
    step: "idle",
    selectedUserId: snapshot.userId,
    selectedUserSummary: summarize(snapshot),
  });

  const text = formatUserCard(snapshot);
  const hasTg = !!snapshot.user?.telegramId;

  const kb: InlineBtn[][] = [
    [{ text: "💰 Изменить баланс", callback_data: "adm:bal" }],
    hasTg
      ? [{ text: "🔓 Отвязать Telegram", callback_data: "adm:unlink_tg" }]
      : [{ text: "🔗 Привязать Telegram", callback_data: "adm:link_tg" }],
    [{ text: "🗑 Удалить аккаунт", callback_data: "adm:wipe_ask" }],
    [{ text: "🔄 Обновить", callback_data: "adm:refresh" }],
    [{ text: "← В меню", callback_data: "adm:menu" }],
  ];

  await send(chatId, text, kb);
}

async function screenUserCardEdit(
  chatId: number,
  msgId: number,
  edit: EditFn,
  snapshot: UserSnapshot,
): Promise<void> {
  await setAdminState(chatId, {
    step: "idle",
    selectedUserId: snapshot.userId,
    selectedUserSummary: summarize(snapshot),
  });

  const text = formatUserCard(snapshot);
  const hasTg = !!snapshot.user?.telegramId;

  const kb: InlineBtn[][] = [
    [{ text: "💰 Изменить баланс", callback_data: "adm:bal" }],
    hasTg
      ? [{ text: "🔓 Отвязать Telegram", callback_data: "adm:unlink_tg" }]
      : [{ text: "🔗 Привязать Telegram", callback_data: "adm:link_tg" }],
    [{ text: "🗑 Удалить аккаунт", callback_data: "adm:wipe_ask" }],
    [{ text: "🔄 Обновить", callback_data: "adm:refresh" }],
    [{ text: "← В меню", callback_data: "adm:menu" }],
  ];

  await edit(chatId, msgId, text, kb);
}

function formatUserCard(s: UserSnapshot): string {
  const acc = s.account;
  const u = s.user;
  const balance = acc
    ? getBalanceInfo(acc, s.profiles.length).balance.toFixed(2)
    : "—";
  const paidUntil =
    acc && acc.paidUntil > 0
      ? new Date(acc.paidUntil).toLocaleDateString("ru-RU")
      : "—";

  const lines: string[] = [
    `👤 <b>${escape(s.userId)}</b>`,
    "",
  ];

  if (u?.telegramId) lines.push(`📱 TG ID: <code>${escape(u.telegramId)}</code>`);
  if (u?.tgUsername) lines.push(`🏷 @${escape(u.tgUsername)}`);
  const fullName = [u?.tgFirstName, u?.tgLastName].filter(Boolean).join(" ");
  if (fullName) lines.push(`📝 ${escape(fullName)}`);
  if (u?.email) lines.push(`✉️ ${escape(u.email)}`);
  if (u?.authMethod) lines.push(`🔐 Auth: ${escape(u.authMethod)}`);

  lines.push("");
  lines.push(`💰 Баланс: <b>${balance} ₽</b>`);
  lines.push(`📅 Подписка до: ${paidUntil}`);
  lines.push(`📡 Устройств: ${s.profiles.length}`);

  if (s.resolvedVia === "alias") {
    lines.push("");
    lines.push(
      `<i>(найден через alias: ${escape(s.candidateId)} → ${escape(s.userId)})</i>`,
    );
  } else if (s.resolvedVia === "username") {
    lines.push("");
    lines.push(`<i>(найден по @${escape(s.candidateId.replace(/^[a-z]+_/, ""))})</i>`);
  }

  return lines.join("\n");
}

function summarize(s: UserSnapshot): NonNullable<AdminState["selectedUserSummary"]> {
  const balance = s.account
    ? getBalanceInfo(s.account, s.profiles.length).balance
    : 0;
  return {
    primaryUserId: s.userId,
    telegramId: s.user?.telegramId,
    tgUsername: s.user?.tgUsername,
    email: s.user?.email,
    balance,
    profilesCount: s.profiles.length,
  };
}

// ─── Wipe flow ───────────────────────────────────────────────────────────────

async function screenWipeAsk3xui(
  chatId: number,
  msgId: number,
  edit: EditFn,
  state: AdminState,
): Promise<void> {
  if (!state.selectedUserId) {
    await screenAdminMenuEdit(chatId, msgId, edit);
    return;
  }
  const summary = state.selectedUserSummary;
  const profilesCount = summary?.profilesCount ?? 0;

  if (profilesCount === 0) {
    // No 3X-UI clients to worry about, go straight to confirm
    await screenWipeConfirm(chatId, msgId, edit, state, false);
    return;
  }

  await edit(
    chatId,
    msgId,
    `🗑 <b>Удаление аккаунта</b> <code>${state.selectedUserId}</code>\n\n` +
      `У юзера <b>${profilesCount}</b> устройств в 3X-UI.\n\n` +
      `Удалить их тоже?`,
    [
      [{ text: "🗑 Удалить из 3X-UI и Redis", callback_data: "adm:wipe_full" }],
      [{ text: "📦 Только Redis (оставить в 3X-UI)", callback_data: "adm:wipe_redis" }],
      [{ text: "← Отмена", callback_data: "adm:refresh" }],
    ],
  );
}

async function screenWipeConfirm(
  chatId: number,
  msgId: number,
  edit: EditFn,
  state: AdminState,
  with3xui: boolean,
): Promise<void> {
  if (!state.selectedUserId) {
    await screenAdminMenuEdit(chatId, msgId, edit);
    return;
  }

  const plan = await planWipe(state.selectedUserId);
  const nonce = newNonce();
  const action: "wipe_redis_only" | "wipe_with_3xui" = with3xui
    ? "wipe_with_3xui"
    : "wipe_redis_only";

  await setAdminState(chatId, {
    ...state,
    pendingActionNonce: nonce,
    pendingAction: action,
  });

  const lines: string[] = [
    `⚠️ <b>Подтвердите удаление</b>`,
    "",
    `<b>UserId:</b> <code>${plan.userId}</code>`,
    "",
    `Будет удалено в Redis (${plan.redisKeys.length} ключей):`,
    ...plan.redisKeys.slice(0, 12).map((k) => `  • <code>${escape(k)}</code>`),
  ];
  if (plan.redisKeys.length > 12) {
    lines.push(`  • <i>...и ещё ${plan.redisKeys.length - 12}</i>`);
  }

  if (with3xui && plan.vpnClients.length > 0) {
    lines.push("");
    lines.push(`Будет удалено клиентов в 3X-UI: <b>${plan.vpnClients.length}</b>`);
  } else if (!with3xui && plan.vpnClients.length > 0) {
    lines.push("");
    lines.push(`<i>⚠️ ${plan.vpnClients.length} клиент(ов) в 3X-UI останутся (orphan)</i>`);
  }

  lines.push("");
  lines.push("<b>Это действие нельзя отменить.</b>");

  await edit(chatId, msgId, lines.join("\n"), [
    [
      {
        text: "⚠️ Подтвердить удаление",
        callback_data: `adm:wipe_go:${nonce}`,
      },
    ],
    [{ text: "← Отмена", callback_data: "adm:refresh" }],
  ]);
}

async function performWipe(
  chatId: number,
  msgId: number,
  edit: EditFn,
  state: AdminState,
  receivedNonce: string,
): Promise<void> {
  if (
    !state.selectedUserId ||
    !state.pendingActionNonce ||
    state.pendingActionNonce !== receivedNonce ||
    !state.pendingAction ||
    !state.pendingAction.startsWith("wipe_")
  ) {
    await edit(
      chatId,
      msgId,
      "❌ Сессия подтверждения истекла или невалидна. Начните заново.",
      [[{ text: "← В меню", callback_data: "adm:menu" }]],
    );
    return;
  }

  const with3xui = state.pendingAction === "wipe_with_3xui";
  const plan = await planWipe(state.selectedUserId);

  await edit(chatId, msgId, "⏳ Удаление...");

  const result = await executeWipe(plan, { deleteFrom3xui: with3xui });

  await clearAdminState(chatId);

  const lines = [
    `✅ <b>Удаление завершено</b>`,
    "",
    `<b>UserId:</b> <code>${plan.userId}</code>`,
    `Redis ключей удалено: <b>${result.redisDeleted}</b>`,
  ];
  if (with3xui) {
    lines.push(`3X-UI клиентов удалено: <b>${result.vpnDeleted}</b>`);
    if (result.vpnFailed > 0) {
      lines.push(`<i>⚠️ Не удалось удалить ${result.vpnFailed} клиент(ов) — проверьте панель</i>`);
    }
  }

  await edit(chatId, msgId, lines.join("\n"), [
    [{ text: "← В меню", callback_data: "adm:menu" }],
  ]);
}

// ─── Link Telegram flow ──────────────────────────────────────────────────────

async function screenLinkTgPrompt(
  chatId: number,
  msgId: number,
  edit: EditFn,
  state: AdminState,
): Promise<void> {
  if (!state.selectedUserId) {
    await screenAdminMenuEdit(chatId, msgId, edit);
    return;
  }
  await setAdminState(chatId, {
    ...state,
    step: "awaiting_link_telegram_id",
  });
  await edit(
    chatId,
    msgId,
    `🔗 <b>Привязать Telegram</b>\n\n` +
      `Текущий userId: <code>${state.selectedUserId}</code>\n\n` +
      `Отправьте Telegram ID пользователя (только цифры).`,
    [[{ text: "← Отмена", callback_data: "adm:refresh" }]],
  );
}

async function performLink(
  chatId: number,
  send: SendFn,
  state: AdminState,
  telegramId: string,
): Promise<void> {
  if (!state.selectedUserId) {
    await send(chatId, "❌ Сессия истекла. Начните заново через /admin.");
    return;
  }
  if (!/^\d+$/.test(telegramId)) {
    await send(chatId, "❌ Telegram ID должен быть числом. Попробуйте ещё раз:", [
      [{ text: "← Отмена", callback_data: "adm:refresh" }],
    ]);
    return;
  }

  const result = await linkTelegramToPrimary(state.selectedUserId, telegramId);

  if (!result.success) {
    await send(
      chatId,
      `❌ Привязка не удалась:\n\n<code>${escape(result.reason ?? "unknown")}</code>`,
      [[{ text: "← Назад", callback_data: "adm:refresh" }]],
    );
    return;
  }

  const lines = [
    `✅ <b>Привязка создана</b>`,
    "",
    `Primary: <code>${result.primaryUserId}</code>`,
    `Telegram: <code>${result.telegramId}</code>`,
  ];
  if (result.removedEmptyStandalone) {
    lines.push("", `<i>Пустой standalone tg_${telegramId} удалён.</i>`);
  }

  // Refresh card
  const fresh = await findUser(state.selectedUserId);
  if (fresh) {
    await setAdminState(chatId, {
      step: "idle",
      selectedUserId: fresh.userId,
      selectedUserSummary: summarize(fresh),
    });
  }

  await send(chatId, lines.join("\n"), [
    [{ text: "🔄 Открыть карточку", callback_data: "adm:refresh" }],
    [{ text: "← В меню", callback_data: "adm:menu" }],
  ]);
}

// ─── Unlink Telegram flow ────────────────────────────────────────────────────

async function performUnlinkTg(
  chatId: number,
  msgId: number,
  edit: EditFn,
  state: AdminState,
): Promise<void> {
  if (!state.selectedUserId) {
    await screenAdminMenuEdit(chatId, msgId, edit);
    return;
  }
  const user = await getUserRecord(state.selectedUserId);
  if (!user || !user.telegramId) {
    await edit(chatId, msgId, "❌ У юзера нет привязанного Telegram.", [
      [{ text: "← Назад", callback_data: "adm:refresh" }],
    ]);
    return;
  }

  const tgId = user.telegramId;
  const tgUsername = user.tgUsername;

  // Remove alias and TG fields from user record
  await redis.del(`alias:tg_${tgId}`);
  if (tgUsername) await redis.del(`username:${tgUsername}`);

  const patched = { ...user };
  delete patched.telegramId;
  delete patched.tgUsername;
  delete patched.tgFirstName;
  delete patched.tgLastName;
  delete patched.tgIdentityUpdatedAt;
  if (patched.passwordHash) {
    patched.authMethod = "email";
  }
  await saveUserRecord(state.selectedUserId, patched);

  await edit(
    chatId,
    msgId,
    `✅ Telegram <code>${tgId}</code> отвязан от <code>${state.selectedUserId}</code>.`,
    [
      [{ text: "🔄 Открыть карточку", callback_data: "adm:refresh" }],
      [{ text: "← В меню", callback_data: "adm:menu" }],
    ],
  );
}

// ─── Balance edit flow ───────────────────────────────────────────────────────

async function screenBalancePrompt(
  chatId: number,
  msgId: number,
  edit: EditFn,
  state: AdminState,
): Promise<void> {
  if (!state.selectedUserId) {
    await screenAdminMenuEdit(chatId, msgId, edit);
    return;
  }
  await setAdminState(chatId, {
    ...state,
    step: "awaiting_balance_amount",
  });
  await edit(
    chatId,
    msgId,
    `💰 <b>Изменить баланс</b>\n\n` +
      `userId: <code>${state.selectedUserId}</code>\n\n` +
      `Отправьте сумму в чат:\n` +
      `• <code>+100</code> — добавить 100 ₽\n` +
      `• <code>-50</code> — списать 50 ₽\n` +
      `• <code>=0</code> — установить баланс в 0\n` +
      `• <code>=300</code> — установить баланс в 300`,
    [[{ text: "← Отмена", callback_data: "adm:refresh" }]],
  );
}

async function performBalanceChange(
  chatId: number,
  send: SendFn,
  state: AdminState,
  raw: string,
): Promise<void> {
  if (!state.selectedUserId) return;

  const trimmed = raw.trim();
  const m = /^([+\-=])\s*(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (!m) {
    await send(
      chatId,
      "❌ Неверный формат. Используйте <code>+N</code>, <code>-N</code> или <code>=N</code>.",
      [[{ text: "← Отмена", callback_data: "adm:refresh" }]],
    );
    return;
  }

  const op = m[1];
  const amount = parseFloat(m[2]);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
    await send(chatId, "❌ Сумма вне допустимого диапазона.", [
      [{ text: "← Отмена", callback_data: "adm:refresh" }],
    ]);
    return;
  }

  // Acquire balance lock to avoid races with addBalance/payment webhooks.
  const { acquireLock } = await import("./ratelimit");
  const unlock = await acquireLock(`bal:${state.selectedUserId}`, 15);
  if (!unlock) {
    await send(
      chatId,
      "⏳ Другая операция с балансом этого пользователя в процессе. Попробуйте через секунду.",
      [[{ text: "🔁 Повторить", callback_data: "adm:bal" }]],
    );
    return;
  }

  try {
    // Read-modify-write on account
    const accRaw = await redis.get(`account:${state.selectedUserId}`);
    if (!accRaw) {
      await send(chatId, "❌ Аккаунт не найден.", [
        [{ text: "← Назад", callback_data: "adm:menu" }],
      ]);
      return;
    }
    const account =
      typeof accRaw === "string" ? JSON.parse(accRaw) : (accRaw as Record<string, unknown>);

    const oldBalance = Number(account.balance) || 0;
    let newBalance: number;
    if (op === "+") newBalance = oldBalance + amount;
    else if (op === "-") newBalance = Math.max(0, oldBalance - amount);
    else newBalance = amount;

    account.balance = Math.round(newBalance * 100) / 100;
    account.balanceUpdatedAt = Date.now();

    await redis.set(`account:${state.selectedUserId}`, JSON.stringify(account));

    await clearAdminState(chatId);

    await send(
      chatId,
      `✅ Баланс <code>${escape(state.selectedUserId)}</code> изменён:\n\n` +
        `Было: <b>${oldBalance.toFixed(2)} ₽</b>\n` +
        `Стало: <b>${(account.balance as number).toFixed(2)} ₽</b>`,
      [
        [{ text: "🔄 Открыть карточку", callback_data: "adm:refresh" }],
        [{ text: "← В меню", callback_data: "adm:menu" }],
      ],
    );
  } finally {
    await unlock();
  }
}

// ─── Promo flow ──────────────────────────────────────────────────────────────

async function screenPromoMenu(
  chatId: number,
  msgId: number,
  edit: EditFn,
): Promise<void> {
  await edit(
    chatId,
    msgId,
    "🎟 <b>Промокоды</b>\n\n" +
      "Можно использовать кнопки ниже или текстовые команды:\n" +
      "• <code>/promo_create КОД СУММА [МАКС]</code>\n" +
      "• <code>/promo_list</code>\n" +
      "• <code>/promo_delete КОД</code>",
    [
      [{ text: "📋 Список промокодов", callback_data: "adm:promo_list" }],
      [{ text: "← В меню", callback_data: "adm:menu" }],
    ],
  );
}

async function screenPromoList(
  chatId: number,
  msgId: number,
  edit: EditFn,
): Promise<void> {
  const promos = await listPromos();
  if (promos.length === 0) {
    await edit(chatId, msgId, "📭 Промокодов нет.", [
      [{ text: "← Назад", callback_data: "adm:promo" }],
    ]);
    return;
  }

  const lines = ["🎟 <b>Промокоды:</b>", ""];
  for (const p of promos as PromoCode[]) {
    const exp =
      p.expiresAt > 0
        ? new Date(p.expiresAt).toLocaleDateString("ru-RU")
        : "∞";
    lines.push(
      `<code>${p.code}</code> — ${p.amount}₽, ` +
        `${p.usedCount}/${p.maxUses || "∞"}, до ${exp}`,
    );
  }

  await edit(chatId, msgId, lines.join("\n"), [
    [{ text: "← Назад", callback_data: "adm:promo" }],
  ]);
}

// ─── Broadcast ───────────────────────────────────────────────────────────────
//
// Compose flow:
//   menu → audience picker → (manual: targets input) → content input
//        → keyboard input (optional) → live preview (real Telegram render)
//        → confirm → send → report.
//
// Content input accepts ANY of: plain text, photo with caption, GIF/video,
// document. The webhook captures media uploads from the admin in
// awaiting_broadcast_content state and forwards them here.
//
// Keyboard input is a small DSL:
//   Текст | https://example.com
//   Кнопка 2 | https://example.com/2
//   ---
//   Web App | webapp:https://proxysvpn.com/dashboard
// where "---" starts a new keyboard row, and "webapp:" prefix marks a
// web_app button (the rest are URL buttons).

async function screenBroadcastMenu(
  chatId: number,
  msgId: number,
  edit: EditFn,
): Promise<void> {
  await setAdminState(chatId, { step: "idle" });
  await edit(
    chatId,
    msgId,
    "📢 <b>Рассылка</b>\n\n" +
      "Выберите получателей:\n\n" +
      "• <b>Всем подписчикам</b> — все, у кого привязан Telegram\n" +
      "• <b>Выбрать вручную</b> — список через @username, ID или email",
    [
      [{ text: "👥 Всем подписчикам", callback_data: "adm:bcast_all" }],
      [{ text: "🎯 Выбрать вручную", callback_data: "adm:bcast_manual" }],
      [{ text: "← В меню", callback_data: "adm:menu" }],
    ],
  );
}

async function screenBroadcastTargetsPrompt(
  chatId: number,
  msgId: number,
  edit: EditFn,
): Promise<void> {
  await setAdminState(chatId, {
    step: "awaiting_broadcast_targets",
    broadcastDraft: { audience: "manual" },
  });
  await edit(
    chatId,
    msgId,
    "🎯 <b>Получатели</b>\n\n" +
      "Отправьте список через запятую, пробел или новую строку.\n\n" +
      "Поддерживается:\n" +
      "• <code>@username</code>\n" +
      "• Telegram ID (число)\n" +
      "• <code>tg_12345</code> / <code>em_user@x.com</code>\n" +
      "• Email\n\n" +
      "Пример:\n<code>@alice, 12345, em_bob@example.com</code>",
    [[{ text: "← Отмена", callback_data: "adm:bcast" }]],
  );
}

async function screenBroadcastAllConfirmTargets(
  chatId: number,
  msgId: number,
  edit: EditFn,
): Promise<void> {
  await edit(chatId, msgId, "⏳ Считаем подписчиков...");
  const targets = await getAllTelegramTargets();
  const count = targets.length;

  if (count === 0) {
    await edit(
      chatId,
      msgId,
      "❌ Нет получателей с привязанным Telegram.",
      [[{ text: "← Назад", callback_data: "adm:bcast" }]],
    );
    return;
  }

  await setAdminState(chatId, {
    step: "awaiting_broadcast_content",
    broadcastDraft: {
      audience: "all",
      resolvedChatIds: targets.map((t) => t.chatId),
      resolvedSummary: { ok: count, notFound: 0, noTelegram: 0 },
    },
  });

  await edit(
    chatId,
    msgId,
    `👥 <b>Аудитория: все подписчики</b>\n\n` +
      `Получателей: <b>${count}</b>\n\n` +
      contentPromptText(),
    [[{ text: "← Отмена", callback_data: "adm:bcast" }]],
  );
}

function contentPromptText(): string {
  return (
    "📝 <b>Контент рассылки</b>\n\n" +
    "Отправьте в чат <b>одно сообщение</b>:\n" +
    "• текст (с HTML),\n" +
    "• или фото / GIF / видео / документ — с подписью или без.\n\n" +
    "Поддерживаемые HTML-теги: <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>, " +
    "<code>&lt;u&gt;</code>, <code>&lt;s&gt;</code>, <code>&lt;a href&gt;</code>, " +
    "<code>&lt;code&gt;</code>, <code>&lt;pre&gt;</code>."
  );
}

interface ResolvedTargets {
  ok: BroadcastTarget[];
  notFoundTokens: string[];
  noTelegramTokens: string[];
}

async function resolveBroadcastTargetsFromText(raw: string): Promise<ResolvedTargets> {
  const tokens = raw
    .split(/[,\s]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const ok: BroadcastTarget[] = [];
  const notFound: string[] = [];
  const noTg: string[] = [];
  const seenChatIds = new Set<number>();

  for (const tokRaw of tokens) {
    const tok = tokRaw.replace(/^@/, "");
    if (tok.length === 0) continue;

    let userId: string | null = null;

    if (/^\d+$/.test(tok)) {
      userId = `tg_${tok}`;
    } else if (tok.startsWith("tg_") || tok.startsWith("em_")) {
      userId = tok;
    } else if (tok.includes("@") && tok.includes(".")) {
      userId = `em_${tok.toLowerCase()}`;
    } else {
      const viaUsername = await lookupUserIdByUsername(tok);
      if (viaUsername) userId = viaUsername;
    }

    if (!userId) {
      notFound.push(tokRaw);
      continue;
    }

    let chatId: number | null = null;
    if (userId.startsWith("tg_")) {
      const n = Number(userId.slice(3));
      if (Number.isFinite(n) && n > 0) chatId = n;
    } else {
      const userRaw = await redis.get(`user:${userId}`);
      if (userRaw) {
        const u = typeof userRaw === "string" ? JSON.parse(userRaw) : userRaw;
        const tgId = (u as { telegramId?: number | string })?.telegramId;
        if (tgId !== undefined && tgId !== null) {
          const n = Number(tgId);
          if (Number.isFinite(n) && n > 0) chatId = n;
        }
      }
    }

    if (!chatId) {
      noTg.push(tokRaw);
      continue;
    }

    if (seenChatIds.has(chatId)) continue;
    seenChatIds.add(chatId);
    ok.push({ userId, chatId });
  }

  return { ok, notFoundTokens: notFound, noTelegramTokens: noTg };
}

async function handleBroadcastTargetsInput(
  chatId: number,
  send: SendFn,
  state: AdminState,
  raw: string,
): Promise<void> {
  if (raw.length > 5000) {
    await send(
      chatId,
      "❌ Слишком длинный список. Максимум 5000 символов.",
      [[{ text: "← Отмена", callback_data: "adm:bcast" }]],
    );
    return;
  }

  const resolved = await resolveBroadcastTargetsFromText(raw);

  if (resolved.ok.length === 0) {
    await send(
      chatId,
      "❌ Не распознано ни одного получателя с Telegram. Попробуйте ещё раз:",
      [[{ text: "← Назад", callback_data: "adm:bcast" }]],
    );
    return;
  }

  await setAdminState(chatId, {
    ...state,
    step: "awaiting_broadcast_content",
    broadcastDraft: {
      audience: "manual",
      resolvedChatIds: resolved.ok.map((t) => t.chatId),
      resolvedSummary: {
        ok: resolved.ok.length,
        notFound: resolved.notFoundTokens.length,
        noTelegram: resolved.noTelegramTokens.length,
      },
    },
  });

  const lines: string[] = [
    `🎯 <b>Получатели</b>`,
    "",
    `✓ Распознано: <b>${resolved.ok.length}</b>`,
  ];
  if (resolved.notFoundTokens.length > 0) {
    const sample = resolved.notFoundTokens.slice(0, 5).map(escape).join(", ");
    lines.push(
      `✗ Не найдено: ${resolved.notFoundTokens.length} ` +
        `(<i>${sample}${resolved.notFoundTokens.length > 5 ? "..." : ""}</i>)`,
    );
  }
  if (resolved.noTelegramTokens.length > 0) {
    const sample = resolved.noTelegramTokens.slice(0, 5).map(escape).join(", ");
    lines.push(
      `✗ Без TG: ${resolved.noTelegramTokens.length} ` +
        `(<i>${sample}${resolved.noTelegramTokens.length > 5 ? "..." : ""}</i>)`,
    );
  }
  lines.push("");
  lines.push(contentPromptText());

  await send(chatId, lines.join("\n"), [
    [{ text: "← Отмена", callback_data: "adm:bcast" }],
  ]);
}

/**
 * Public entry: called by the webhook when the admin sent a content message
 * (text or media) while in awaiting_broadcast_content state.
 *
 * `media` may be undefined → text-only broadcast.
 * `text` is either the message text (for text msgs) or the caption (for media).
 */
export async function handleBroadcastContent(
  chatId: number,
  send: SendFn,
  state: AdminState,
  text: string,
  media: BroadcastMediaRef | undefined,
): Promise<void> {
  const draft = state.broadcastDraft;
  if (!draft || !draft.resolvedChatIds || draft.resolvedChatIds.length === 0) {
    await send(chatId, "❌ Сессия истекла. Начните заново через /admin.");
    return;
  }

  // Media: caption is bounded by 1024 by Telegram; text-only by 4096.
  const limit = media ? 1024 : 4096;
  if (text.length > limit) {
    await send(
      chatId,
      `❌ Текст длиннее ${limit} символов (Telegram режет на ${limit} для ${
        media ? "подписи к медиа" : "обычных сообщений"
      }). Переотправьте короче.`,
      [[{ text: "← Отмена", callback_data: "adm:bcast" }]],
    );
    return;
  }

  if (!media && text.length === 0) {
    await send(
      chatId,
      "❌ Пустое сообщение. Отправьте текст или прикрепите медиа.",
      [[{ text: "← Отмена", callback_data: "adm:bcast" }]],
    );
    return;
  }

  // Quick HTML balance check on text/caption.
  const opens = (text.match(/<(b|i|u|s|code|pre|a)\b[^>]*>/gi) || []).length;
  const closes = (text.match(/<\/(b|i|u|s|code|pre|a)>/gi) || []).length;
  if (opens !== closes) {
    await setAdminState(chatId, {
      ...state,
      broadcastDraft: { ...draft, message: text, media },
    });
    await send(
      chatId,
      `⚠️ HTML-теги несбалансированы (открытых: ${opens}, закрытых: ${closes}). ` +
        `Telegram может вернуть ошибку и не доставить сообщение.\n\n` +
        `Продолжить или переписать?`,
      [
        [{ text: "✅ Всё равно продолжить", callback_data: "adm:bcast_kb_ask" }],
        [{ text: "← Переписать контент", callback_data: "adm:bcast" }],
      ],
    );
    return;
  }

  await setAdminState(chatId, {
    ...state,
    broadcastDraft: { ...draft, message: text, media },
  });

  await screenBroadcastKeyboardAsk(chatId, send);
}

async function screenBroadcastKeyboardAsk(
  chatId: number,
  send: SendFn,
): Promise<void> {
  await send(
    chatId,
    "🔘 <b>Inline-кнопки</b>\n\n" +
      "Хотите прикрепить кнопки к сообщению?",
    [
      [{ text: "➕ Добавить кнопки", callback_data: "adm:bcast_kb_add" }],
      [{ text: "🚀 Без кнопок — к превью", callback_data: "adm:bcast_preview" }],
      [{ text: "← Отмена", callback_data: "adm:bcast" }],
    ],
  );
}

async function screenBroadcastKeyboardPrompt(
  chatId: number,
  msgId: number,
  edit: EditFn,
  state: AdminState,
): Promise<void> {
  await setAdminState(chatId, {
    ...state,
    step: "awaiting_broadcast_buttons",
  });
  await edit(
    chatId,
    msgId,
    "🔘 <b>Формат inline-кнопок</b>\n\n" +
      "Каждая строка — одна кнопка:\n" +
      "<code>Текст | URL</code>\n\n" +
      "Разрыв строк клавиатуры — отдельная строка <code>---</code>.\n" +
      "Web-app кнопка — префикс <code>webapp:</code> перед URL.\n\n" +
      "Пример:\n<pre>" +
      "Открыть сайт | https://proxysvpn.com\n" +
      "Канал | https://t.me/proxysvpn\n" +
      "---\n" +
      "Личный кабинет | webapp:https://proxysvpn.com/dashboard" +
      "</pre>",
    [
      [{ text: "← Без кнопок", callback_data: "adm:bcast_preview" }],
      [{ text: "← Отмена", callback_data: "adm:bcast" }],
    ],
  );
}

interface ParsedKeyboard {
  rows: BroadcastBtnRef[][];
  errors: string[];
}

function parseKeyboardDsl(raw: string): ParsedKeyboard {
  const lines = raw.split(/\r?\n/);
  const rows: BroadcastBtnRef[][] = [];
  const errors: string[] = [];
  let currentRow: BroadcastBtnRef[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    if (/^-{3,}$/.test(line)) {
      if (currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [];
      }
      continue;
    }

    const sep = line.indexOf("|");
    if (sep === -1) {
      errors.push(`строка ${i + 1}: нет разделителя <code>|</code>`);
      continue;
    }
    const text = line.slice(0, sep).trim();
    const targetRaw = line.slice(sep + 1).trim();
    if (!text) {
      errors.push(`строка ${i + 1}: пустой текст кнопки`);
      continue;
    }
    if (text.length > 64) {
      errors.push(`строка ${i + 1}: текст кнопки длиннее 64 символов`);
      continue;
    }

    let isWebApp = false;
    let target = targetRaw;
    if (target.toLowerCase().startsWith("webapp:")) {
      isWebApp = true;
      target = target.slice("webapp:".length).trim();
    }

    if (!/^https:\/\/\S+$/i.test(target)) {
      errors.push(`строка ${i + 1}: URL должен начинаться с <code>https://</code>`);
      continue;
    }

    if (currentRow.length >= 8) {
      // Telegram allows up to 8 buttons per row.
      rows.push(currentRow);
      currentRow = [];
    }

    currentRow.push(
      isWebApp
        ? { type: "web_app", text, url: target }
        : { type: "url", text, url: target },
    );
  }
  if (currentRow.length > 0) rows.push(currentRow);

  if (rows.length > 8) {
    errors.push("больше 8 рядов — Telegram отрисует не все");
  }

  return { rows, errors };
}

async function handleBroadcastButtonsInput(
  chatId: number,
  send: SendFn,
  state: AdminState,
  raw: string,
): Promise<void> {
  const draft = state.broadcastDraft;
  if (!draft) {
    await send(chatId, "❌ Сессия истекла. Начните заново через /admin.");
    return;
  }

  if (raw.length > 4000) {
    await send(
      chatId,
      "❌ Слишком длинный DSL клавиатуры. Сократите.",
      [[{ text: "← Назад", callback_data: "adm:bcast_kb_add" }]],
    );
    return;
  }

  const parsed = parseKeyboardDsl(raw);

  if (parsed.errors.length > 0) {
    const errs = parsed.errors.slice(0, 8).map((e) => `• ${e}`).join("\n");
    await send(
      chatId,
      `❌ Ошибки в формате кнопок:\n\n${errs}\n\nОтправьте исправленный DSL ещё раз:`,
      [
        [{ text: "🚫 Без кнопок", callback_data: "adm:bcast_preview" }],
        [{ text: "← Отмена", callback_data: "adm:bcast" }],
      ],
    );
    return;
  }

  if (parsed.rows.length === 0) {
    await send(chatId, "❌ Не распознано ни одной кнопки. Попробуйте снова:", [
      [{ text: "🚫 Без кнопок", callback_data: "adm:bcast_preview" }],
      [{ text: "← Отмена", callback_data: "adm:bcast" }],
    ]);
    return;
  }

  await setAdminState(chatId, {
    ...state,
    step: "idle",
    broadcastDraft: { ...draft, keyboard: parsed.rows },
  });

  // Jump straight to preview after successful keyboard input.
  await sendBroadcastPreview(chatId, send);
}

/**
 * Send a real broadcast message to the admin themselves so they see exactly
 * what users will see. Then send a confirm prompt right after.
 */
async function sendBroadcastPreview(chatId: number, send: SendFn): Promise<void> {
  const state = await getAdminState(chatId);
  const draft = state.broadcastDraft;
  if (!draft || !draft.message || !draft.resolvedChatIds) {
    await send(chatId, "❌ Черновик пуст. Начните заново.", [
      [{ text: "← В меню", callback_data: "adm:menu" }],
    ]);
    return;
  }

  await send(chatId, "🔎 <b>Превью</b> — так увидят получатели:");

  const previewResult = await sendBroadcastPayload(chatId, {
    text: draft.message,
    media: draft.media,
    keyboard: draft.keyboard,
  });

  if (!previewResult.ok) {
    await send(
      chatId,
      `❌ Telegram отклонил превью:\n<code>${escape(previewResult.error)}</code>\n\n` +
        `Скорее всего проблема в HTML-разметке или DSL кнопок. Поправьте и попробуйте заново.`,
      [
        [{ text: "← Переписать контент", callback_data: "adm:bcast" }],
      ],
    );
    return;
  }

  // Now ask for final confirmation, with nonce.
  const nonce = newNonce();
  await setAdminState(chatId, {
    ...state,
    pendingActionNonce: nonce,
    pendingAction: "broadcast",
  });

  const audience =
    draft.audience === "all"
      ? `<b>всем подписчикам</b>`
      : `<b>выбранным юзерам</b>`;

  const eta = Math.ceil(draft.resolvedChatIds.length / 25);

  await send(
    chatId,
    `📨 Отправить рассылку?\n\n` +
      `Получателей: <b>${draft.resolvedChatIds.length}</b> (${audience})\n` +
      `Длина текста: ${draft.message.length} символов\n` +
      (draft.media ? `Медиа: <b>${draft.media.type}</b>\n` : "") +
      (draft.keyboard
        ? `Кнопок: <b>${draft.keyboard.flat().length}</b>\n`
        : "") +
      `\n<i>Отправка займёт ~${eta} сек.</i>`,
    [
      [{ text: "📨 Отправить", callback_data: `adm:bcast_go:${nonce}` }],
      [{ text: "✏️ Переписать контент", callback_data: "adm:bcast" }],
      [{ text: "← Отмена", callback_data: "adm:menu" }],
    ],
  );
}

async function performBroadcast(
  chatId: number,
  send: SendFn,
  state: AdminState,
  receivedNonce: string,
): Promise<void> {
  const draft = state.broadcastDraft;
  if (
    !draft ||
    !draft.resolvedChatIds ||
    !draft.message ||
    !state.pendingActionNonce ||
    state.pendingActionNonce !== receivedNonce ||
    state.pendingAction !== "broadcast"
  ) {
    await send(chatId, "❌ Сессия подтверждения истекла. Начните заново.", [
      [{ text: "← В меню", callback_data: "adm:menu" }],
    ]);
    return;
  }

  let targets: BroadcastTarget[];
  if (draft.audience === "all") {
    targets = await getAllTelegramTargets();
  } else {
    targets = draft.resolvedChatIds.map((id) => ({
      userId: `tg_${id}`,
      chatId: id,
    }));
  }

  await send(chatId, `⏳ Отправка ${targets.length} получателям...`);

  const result = await broadcastToUsers(
    {
      text: draft.message,
      media: draft.media,
      keyboard: draft.keyboard,
    },
    targets,
  );

  await clearAdminState(chatId);

  const lines = [
    `✅ <b>Рассылка завершена</b>`,
    "",
    `Всего: <b>${result.total}</b>`,
    `✓ Доставлено: <b>${result.sent}</b>`,
  ];
  if (result.blocked > 0) {
    lines.push(`🚫 Заблокировали бота: <b>${result.blocked}</b>`);
  }
  if (result.failed > 0) {
    lines.push(`❌ Ошибок: <b>${result.failed}</b>`);
    if (result.errors.length > 0) {
      lines.push("");
      lines.push("<i>Первые ошибки:</i>");
      for (const e of result.errors.slice(0, 5)) {
        lines.push(`• <code>${escape(e.userId)}</code>: ${escape(e.error.slice(0, 80))}`);
      }
    }
  }

  await send(chatId, lines.join("\n"), [
    [{ text: "📢 Новая рассылка", callback_data: "adm:bcast" }],
    [{ text: "← В меню", callback_data: "adm:menu" }],
  ]);
}

// ─── Stats ───────────────────────────────────────────────────────────────────

async function screenStats(
  chatId: number,
  msgId: number,
  edit: EditFn,
): Promise<void> {
  // Best-effort stats: cheap KEYS scan with prefix patterns. On Upstash,
  // KEYS is O(N) but acceptable on a DB of <1k keys (current DBSIZE: 539).
  const [accounts, users, withTopup] = await Promise.all([
    redis.keys("account:*"),
    redis.keys("user:*"),
    redis.keys("has_topup:*"),
  ]);

  const lines = [
    "📊 <b>Статистика</b>",
    "",
    `Всего аккаунтов: <b>${accounts.length}</b>`,
    `Юзер-записей: <b>${users.length}</b>`,
    `Хоть раз пополняли: <b>${withTopup.length}</b>`,
  ];

  await edit(chatId, msgId, lines.join("\n"), [
    [{ text: "← В меню", callback_data: "adm:menu" }],
  ]);
}

// ─── Public entry: callbacks ─────────────────────────────────────────────────

/**
 * Try to handle an admin callback. Returns true if handled, false otherwise.
 */
export async function tryHandleAdminCallback(
  chatId: number,
  msgId: number,
  data: string,
  send: SendFn,
  edit: EditFn,
): Promise<boolean> {
  if (!isAdmin(chatId)) return false;
  if (!data.startsWith("adm:")) return false;

  const action = data.slice(4);
  const state = await getAdminState(chatId);

  try {
    if (action === "menu") {
      await screenAdminMenuEdit(chatId, msgId, edit);
      return true;
    }
    if (action === "close") {
      await clearAdminState(chatId);
      await edit(chatId, msgId, "Админ-панель закрыта.");
      return true;
    }
    if (action === "find") {
      await screenFindPrompt(chatId, msgId, edit);
      return true;
    }
    if (action === "promo") {
      await screenPromoMenu(chatId, msgId, edit);
      return true;
    }
    if (action === "promo_list") {
      await screenPromoList(chatId, msgId, edit);
      return true;
    }
    if (action === "stats") {
      await screenStats(chatId, msgId, edit);
      return true;
    }
    if (action === "bcast") {
      await screenBroadcastMenu(chatId, msgId, edit);
      return true;
    }
    if (action === "bcast_all") {
      await screenBroadcastAllConfirmTargets(chatId, msgId, edit);
      return true;
    }
    if (action === "bcast_manual") {
      await screenBroadcastTargetsPrompt(chatId, msgId, edit);
      return true;
    }
    if (action === "bcast_force") {
      // Skip HTML balance check, go straight to keyboard ask with stored draft.
      const msg = state.broadcastDraft?.message;
      if (!msg) {
        await edit(chatId, msgId, "❌ Сессия истекла.", [
          [{ text: "← В меню", callback_data: "adm:menu" }],
        ]);
        return true;
      }
      await edit(chatId, msgId, "⏭ Пропускаем проверку HTML...");
      await screenBroadcastKeyboardAsk(chatId, send);
      return true;
    }
    if (action === "bcast_kb_ask") {
      // Same as bcast_force entry but reachable from confirmed-content path.
      await edit(chatId, msgId, "⏳ Готовим следующий шаг...");
      await screenBroadcastKeyboardAsk(chatId, send);
      return true;
    }
    if (action === "bcast_kb_add") {
      await screenBroadcastKeyboardPrompt(chatId, msgId, edit, state);
      return true;
    }
    if (action === "bcast_preview") {
      await edit(chatId, msgId, "⏳ Готовим превью...");
      await sendBroadcastPreview(chatId, send);
      return true;
    }
    if (action.startsWith("bcast_go:")) {
      const nonce = action.slice("bcast_go:".length);
      await performBroadcast(chatId, send, state, nonce);
      return true;
    }
    if (action === "refresh") {
      if (!state.selectedUserId) {
        await screenAdminMenuEdit(chatId, msgId, edit);
        return true;
      }
      const fresh = await findUser(state.selectedUserId);
      if (!fresh) {
        await edit(chatId, msgId, "❌ Аккаунт больше не существует.", [
          [{ text: "← В меню", callback_data: "adm:menu" }],
        ]);
        return true;
      }
      await screenUserCardEdit(chatId, msgId, edit, fresh);
      return true;
    }
    if (action === "bal") {
      await screenBalancePrompt(chatId, msgId, edit, state);
      return true;
    }
    if (action === "link_tg") {
      await screenLinkTgPrompt(chatId, msgId, edit, state);
      return true;
    }
    if (action === "unlink_tg") {
      await performUnlinkTg(chatId, msgId, edit, state);
      return true;
    }
    if (action === "wipe_ask") {
      await screenWipeAsk3xui(chatId, msgId, edit, state);
      return true;
    }
    if (action === "wipe_full") {
      await screenWipeConfirm(chatId, msgId, edit, state, true);
      return true;
    }
    if (action === "wipe_redis") {
      await screenWipeConfirm(chatId, msgId, edit, state, false);
      return true;
    }
    if (action.startsWith("wipe_go:")) {
      const nonce = action.slice("wipe_go:".length);
      await performWipe(chatId, msgId, edit, state, nonce);
      return true;
    }
  } catch (err) {
    console.error("[admin-bot] callback error:", err);
    await send(
      chatId,
      `❌ Ошибка: <code>${escape(err instanceof Error ? err.message : "unknown")}</code>`,
      [[{ text: "← В меню", callback_data: "adm:menu" }]],
    );
    return true;
  }

  return false;
}

// ─── Public entry: text ──────────────────────────────────────────────────────

/**
 * Try to handle an admin text message. Returns true if handled, false otherwise.
 *
 * Two responsibilities:
 *   1. /admin command → opens panel.
 *   2. Plain text input while FSM is awaiting something (lookup, TG ID, balance).
 *   3. Legacy /promo_* commands stay handled by the existing webhook code,
 *      we don't intercept them here.
 */
export async function tryHandleAdminText(
  chatId: number,
  text: string,
  send: SendFn,
): Promise<boolean> {
  if (!isAdmin(chatId)) return false;

  const trimmed = text.trim();

  if (trimmed === "/admin") {
    await screenAdminMenu(chatId, send);
    return true;
  }

  const state = await getAdminState(chatId);

  if (state.step === "awaiting_lookup_input") {
    const found = await findUser(trimmed);
    if (!found) {
      await send(chatId, `❌ Юзер по запросу <code>${escape(trimmed)}</code> не найден.`, [
        [{ text: "🔍 Попробовать снова", callback_data: "adm:find" }],
        [{ text: "← В меню", callback_data: "adm:menu" }],
      ]);
      return true;
    }
    await screenUserCard(chatId, send, found);
    return true;
  }

  if (state.step === "awaiting_link_telegram_id") {
    await performLink(chatId, send, state, trimmed);
    return true;
  }

  if (state.step === "awaiting_balance_amount") {
    await performBalanceChange(chatId, send, state, trimmed);
    return true;
  }

  if (state.step === "awaiting_broadcast_targets") {
    await handleBroadcastTargetsInput(chatId, send, state, trimmed);
    return true;
  }

  if (state.step === "awaiting_broadcast_content") {
    // Pure text in this step (no media). Webhook handles media uploads
    // separately and calls handleBroadcastContent directly.
    const rawMsg = text.replace(/^\s+|\s+$/g, "");
    await handleBroadcastContent(chatId, send, state, rawMsg, undefined);
    return true;
  }

  if (state.step === "awaiting_broadcast_buttons") {
    const rawDsl = text.replace(/^\s+|\s+$/g, "");
    await handleBroadcastButtonsInput(chatId, send, state, rawDsl);
    return true;
  }

  // Auto-recovery: state may have been lost (TTL expired, redis hiccup,
  // double webhook). If the text *looks* like a user identifier — @username,
  // email, or numeric TG ID — treat it as a lookup and bring the admin back
  // to the user card without forcing them to re-click "🔍 Найти юзера".
  if (looksLikeIdentifier(trimmed)) {
    console.log(`[admin] auto-recovery lookup for "${trimmed}" (state was: ${state.step})`);
    const found = await findUser(trimmed);
    if (found) {
      await screenUserCard(chatId, send, found);
      return true;
    }
    // If it looked like an identifier but didn't resolve, still tell the
    // admin clearly instead of falling through to the user-facing fallback.
    await send(
      chatId,
      `❌ Юзер по запросу <code>${escape(trimmed)}</code> не найден.\n\n` +
        `<i>(state был ${escape(state.step)} — возможно сессия истекла)</i>`,
      [
        [{ text: "🔍 Новый поиск", callback_data: "adm:find" }],
        [{ text: "← В меню", callback_data: "adm:menu" }],
      ],
    );
    return true;
  }

  return false;
}

/** Quick check: does this text look like something the admin would search? */
function looksLikeIdentifier(s: string): boolean {
  if (s.length < 2 || s.length > 200) return false;
  // @username
  if (/^@[a-zA-Z0-9_]{2,32}$/.test(s)) return true;
  // bare username (3-32 alnum/underscore)
  if (/^[a-zA-Z][a-zA-Z0-9_]{2,31}$/.test(s)) return true;
  // email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return true;
  // pure digits (TG ID)
  if (/^\d{5,15}$/.test(s)) return true;
  // prefixed
  if (/^(em_|tg_)\S+/.test(s)) return true;
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escape(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Re-export for legacy /promo_* commands so they keep working unchanged.
export { createPromo, listPromos, deletePromo };

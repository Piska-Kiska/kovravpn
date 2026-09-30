// src/lib/bot-owner.ts
//
// The owner's Telegram chat: the admin panel, admin alerts, and the first
// (and until rollout the only) chat that sees new bot UI. One definition,
// imported by the admin panel, the webhook, the payment webhooks and the bot
// v2 gate. The value itself has been public in admin-bot.ts since the start.

export const ADMIN_TG_ID = "6944217115";

/** Is this chat the owner's? Accepts the id as Telegram sends it or as a string. */
export function isAdminChat(chatId: number | string | null | undefined): boolean {
  return chatId !== null && chatId !== undefined && String(chatId) === ADMIN_TG_ID;
}

// src/lib/admin-alert.ts
//
// One Telegram message to the owner's chat (ADMIN_TG_ID) from server code
// that must not fail because of it: payment webhooks asking a provider to
// retry, money that needs a manual look. Never throws; returns whether
// Telegram accepted the message.

import { ADMIN_TG_ID } from "./bot-owner";
import { fetchWithTimeout } from "./fetch-timeout";

/** Escape text for Telegram's HTML parse mode. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The message of an error, escaped and cut to `max` characters, for an alert. */
export function errorText(err: unknown, max = 300): string {
  const msg = err instanceof Error ? err.message : String(err);
  return escapeHtml(msg.slice(0, max));
}

export async function alertAdmin(html: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) return false;
  try {
    const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: ADMIN_TG_ID, text: html, parse_mode: "HTML" }),
      timeoutMs: 5000,
    });
    return res.ok;
  } catch (err) {
    console.error("[admin-alert] not sent:", err instanceof Error ? err.message : err);
    return false;
  }
}

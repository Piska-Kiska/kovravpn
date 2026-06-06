// src/app/api/cron/expiry-check/route.ts
//
// Daily cron (Vercel). Scans subscriptions and notifies via Telegram:
//   1) "expires in ~N hours" when 0 < timeLeft < 24h (per-user, deduped)
//   2) "expired"             when the furthest sub just lapsed (within 7d)
//
// In the subscription model, the relevant clock is the FURTHEST active
// subscription expiry (when the user fully loses access). We scan `subs:*`.
//
// Dedup flags (cleared once user has >1d again, so reminders re-arm):
//   expiry_notified_1d:{userId}      TTL 7 days
//   expiry_notified_expired:{userId} TTL 30 days
//
// Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.

import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { summarize, type Subscription } from "@/lib/subscriptions";

const CRON_SECRET = process.env.CRON_SECRET || "";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_API = "https://api.telegram.org/bot";

const ONE_DAY_MS = 86400000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

interface UserRecordLike {
  telegramId?: number | string;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const stats = {
    scanned: 0,
    notified_1d: 0,
    notified_expired: 0,
    cleared_flags: 0,
    skipped: 0,
    errors: 0,
  };

  let cursor: string | number = 0;

  do {
    const scanResult = (await redis.scan(cursor, {
      match: "subs:*",
      count: 200,
    })) as [string | number, string[]];
    const nextCursor: string | number = scanResult[0];
    const keys: string[] = scanResult[1];

    for (const key of keys) {
      stats.scanned++;
      try {
        const raw = await redis.get(key);
        if (!raw) {
          stats.skipped++;
          continue;
        }
        const subs: Subscription[] =
          typeof raw === "string" ? JSON.parse(raw) : (raw as Subscription[]);
        if (!Array.isArray(subs) || subs.length === 0) {
          stats.skipped++;
          continue;
        }

        const s = summarize(subs, now);
        // Furthest active expiry = moment the user fully loses access.
        const expiry = s.maxExpiry;

        // If nothing was ever active or it expired long ago, find the most
        // recent expiry to honor the "just expired within 7d" window.
        const lastExpiry =
          expiry > 0
            ? expiry
            : subs.reduce((m, x) => (x.expiresAt > m ? x.expiresAt : m), 0);

        const userId = key.replace("subs:", "");
        const chatId = await resolveChatId(userId);
        if (!chatId) {
          stats.skipped++;
          continue;
        }

        const msLeft = lastExpiry - now;

        // 1 day before
        if (msLeft > 0 && msLeft < ONE_DAY_MS) {
          const flagKey = `expiry_notified_1d:${userId}`;
          const already = await redis.get(flagKey);
          if (!already) {
            const hoursLeft = Math.max(1, Math.round(msLeft / 3600000));
            const ok = await sendTg(chatId, build1dMessage(hoursLeft));
            if (ok) {
              await redis.set(flagKey, "1", { ex: 7 * 86400 });
              stats.notified_1d++;
            } else {
              stats.errors++;
            }
          }
          continue;
        }

        // Just expired (within 7 days)
        if (msLeft <= 0 && msLeft > -SEVEN_DAYS_MS) {
          const flagKey = `expiry_notified_expired:${userId}`;
          const already = await redis.get(flagKey);
          if (!already) {
            const ok = await sendTg(chatId, buildExpiredMessage());
            if (ok) {
              await redis.set(flagKey, "1", { ex: 30 * 86400 });
              stats.notified_expired++;
            } else {
              stats.errors++;
            }
          }
          continue;
        }

        // Plenty of time left → clear stale flags so next cycle re-arms.
        if (msLeft > ONE_DAY_MS) {
          const f1 = await redis.del(`expiry_notified_1d:${userId}`);
          const f2 = await redis.del(`expiry_notified_expired:${userId}`);
          if ((Number(f1) || 0) + (Number(f2) || 0) > 0) {
            stats.cleared_flags++;
          }
        }
      } catch (e) {
        console.error(`[cron/expiry-check] error processing ${key}:`, e);
        stats.errors++;
      }
    }

    cursor = nextCursor;
  } while (Number(cursor) !== 0);

  console.log("[cron/expiry-check] done", stats);
  return NextResponse.json({ ok: true, stats, ts: now });
}

// ---- helpers ----

async function resolveChatId(userId: string): Promise<number | null> {
  if (userId.startsWith("tg_")) {
    const id = Number(userId.replace("tg_", ""));
    return isNaN(id) || id <= 0 ? null : id;
  }
  const raw = await redis.get(`user:${userId}`);
  if (!raw) return null;
  const user: UserRecordLike =
    typeof raw === "string" ? JSON.parse(raw) : (raw as UserRecordLike);
  if (!user.telegramId) return null;
  const id = Number(user.telegramId);
  return isNaN(id) || id <= 0 ? null : id;
}

async function sendTg(chatId: number, text: string): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  try {
    const resp = await fetch(`${TG_API}${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return resp.ok;
  } catch (e) {
    console.error("[cron/expiry-check] sendTg error:", e);
    return false;
  }
}

function build1dMessage(hoursLeft: number): string {
  return [
    `⚠️ <b>Your subscription is ending soon</b>`,
    ``,
    `In ~${hoursLeft}h your devices will be disconnected.`,
    `Renew your plan to keep Kovra running.`,
  ].join("\n");
}

function buildExpiredMessage(): string {
  return [
    `🔴 <b>Subscription expired</b>`,
    ``,
    `Your devices are now disconnected.`,
    `Buy a plan to turn everything back on automatically.`,
  ].join("\n");
}

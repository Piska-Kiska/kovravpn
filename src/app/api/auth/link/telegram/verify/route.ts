// src/app/api/auth/link/telegram/verify/route.ts
//
// Verify a pending Telegram link.
//
// History: this endpoint used to return 409 if EITHER alias:tg_X or user:tg_X
// existed, which silently broke the most common flow: user does /start in the
// bot first (creates an empty standalone tg_X), then registers via email,
// then tries to link Telegram in the dashboard → 409 even though both
// "accounts" are the same person. See incident 2026-05-02.
//
// Current behaviour:
//   - Already linked to THIS session         → idempotent success (no-op).
//   - Already linked to ANOTHER account       → 409.
//   - Standalone tg_X exists, EMPTY           → auto-wipe + create alias.
//   - Standalone tg_X exists, has data        → 409 with explicit reason
//                                                (admin must merge manually).
//   - No tg_X at all                          → create alias normally.

import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getSessionFromRequest } from "@/lib/session";
import { linkTelegramToPrimary } from "@/lib/admin-ops";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ linked: false, error: "No code" }, { status: 400 });
  }

  const raw = await redis.get(`link_tg:${code}`);
  if (!raw) {
    return NextResponse.json({ linked: false, error: "Expired" }, { status: 404 });
  }

  const data = typeof raw === "string" ? JSON.parse(raw) : raw;

  // Код принадлежит той сессии, которая его завела.
  //
  // Без этой сверки любой вошедший мог погасить ЧУЖОЙ код. Атакующий заводит
  // код у себя, подтверждает его своим Telegram и заманивает жертву на этот
  // адрес: обработчик — GET, а кука `sameSite: "lax"` уходит при обычном
  // переходе по ссылке. Его Telegram привязывался бы к аккаунту жертвы, и
  // дальше каждое его сообщение боту приводило бы в чужой аккаунт — устройства,
  // ссылки подписки, баланс. Соседний `link/email/verify` эту сверку делает,
  // здесь её просто не было.
  if (data.userId !== session.userId) {
    return NextResponse.json(
      { linked: false, error: "Код принадлежит другому аккаунту" },
      { status: 403 },
    );
  }

  if (!data.verified) {
    // Polling: user hasn't sent the code to the bot yet.
    return NextResponse.json({ linked: false });
  }

  const telegramId = String(data.telegramId);

  // Defensive: if session's user already has a different telegramId attached,
  // refuse — admin must unlink old TG first.
  const sessionUser = await redis.get(`user:${session.userId}`);
  if (sessionUser) {
    const parsed =
      typeof sessionUser === "string" ? JSON.parse(sessionUser) : sessionUser;
    if (parsed.telegramId && parsed.telegramId !== telegramId) {
      await redis.del(`link_tg:${code}`);
      return NextResponse.json(
        {
          linked: false,
          error: "У вашего аккаунта уже привязан другой Telegram. Сначала отвяжите старый.",
        },
        { status: 409 },
      );
    }
  }

  // Idempotency: if the alias already points at THIS session's user, return
  // success without touching anything. Helps double-clicks, retries, etc.
  const existingAlias = await redis.get(`alias:tg_${telegramId}`);
  if (existingAlias && existingAlias === session.userId) {
    await redis.del(`link_tg:${code}`);
    return NextResponse.json({
      linked: true,
      telegramId,
      alreadyLinked: true,
    });
  }

  // Try smart link via shared admin-ops logic. This handles:
  //  - alias to a DIFFERENT primary  → returns success:false with reason
  //  - empty standalone tg_X         → wipes it cleanly, creates alias
  //  - non-empty standalone tg_X     → returns success:false (manual merge)
  //  - no tg_X                       → creates alias normally
  const result = await linkTelegramToPrimary(session.userId, telegramId);

  if (!result.success) {
    // Always clean up the pending link code so the user can retry from scratch.
    await redis.del(`link_tg:${code}`);
    return NextResponse.json(
      {
        linked: false,
        error: friendlyError(result.reason),
        // Hint for support / debugging — never shown to user but logged.
        debugReason: result.reason,
      },
      { status: 409 },
    );
  }

  await redis.del(`link_tg:${code}`);

  return NextResponse.json({
    linked: true,
    telegramId,
    mergedEmptyStandalone: result.removedEmptyStandalone,
  });
}

function friendlyError(reason?: string): string {
  if (!reason) return "Не удалось привязать Telegram";
  // Translate machine reasons → user-facing strings, but never leak internals.
  if (reason.includes("aliased to")) {
    return "Этот Telegram уже привязан к другому аккаунту";
  }
  if (reason.includes("has data")) {
    return "На этом Telegram-аккаунте уже есть данные. Напишите в поддержку для объединения.";
  }
  if (reason.includes("not found")) {
    return "Аккаунт не найден";
  }
  return "Не удалось привязать Telegram";
}

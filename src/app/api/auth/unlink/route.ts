// src/app/api/auth/unlink/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getSessionFromRequest } from "@/lib/session";
import { getUserRecord, saveUserRecord } from "@/lib/accounts";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { type } = await req.json(); // "email" | "telegram"

    if (type !== "email" && type !== "telegram") {
      return NextResponse.json(
        { error: "Тип должен быть email или telegram" },
        { status: 400 }
      );
    }

    const user = await getUserRecord(session.userId);
    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Can only unlink secondary identity (alias), not primary
    if (type === "email") {
      if (session.userId.startsWith("em_")) {
        return NextResponse.json(
          { error: "Нельзя отвязать основной способ входа" },
          { status: 403 }
        );
      }
      if (!user.email) {
        return NextResponse.json(
          { error: "Email не привязан" },
          { status: 400 }
        );
      }

      // Remove alias
      await redis.del(`alias:em_${user.email}`);

      // Update user record
      delete user.email;
      delete user.passwordHash;
      if (user.authMethod === "linked") user.authMethod = "telegram";
      await saveUserRecord(session.userId, user);
    }

    if (type === "telegram") {
      if (session.userId.startsWith("tg_")) {
        return NextResponse.json(
          { error: "Нельзя отвязать основной способ входа" },
          { status: 403 }
        );
      }
      if (!user.telegramId) {
        return NextResponse.json(
          { error: "Telegram не привязан" },
          { status: 400 }
        );
      }

      // Remove alias
      await redis.del(`alias:tg_${user.telegramId}`);

      // Update user record
      delete user.telegramId;
      if (user.authMethod === "linked") user.authMethod = "email";
      await saveUserRecord(session.userId, user);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/unlink]", error);
    return NextResponse.json(
      { error: "Ошибка отвязки" },
      { status: 500 }
    );
  }
}

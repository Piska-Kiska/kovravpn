// src/app/api/auth/link/email/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getSessionFromRequest } from "@/lib/session";
import { getUserRecord, saveUserRecord, createAlias } from "@/lib/accounts";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return NextResponse.json({ error: "Email и код обязательны" }, { status: 400 });
    }

    const normalized = email.toLowerCase().trim();
    const key = `link_em:${normalized}`;
    const raw = await redis.get(key);

    if (!raw) {
      return NextResponse.json(
        { error: "Код истёк — запросите новый" },
        { status: 400 }
      );
    }

    const data = typeof raw === "string" ? JSON.parse(raw) : raw;

    if (data.userId !== session.userId) {
      return NextResponse.json({ error: "Недопустимо" }, { status: 403 });
    }

    if (String(data.code) !== String(code)) {
      return NextResponse.json({ error: "Неверный код" }, { status: 400 });
    }

    // Create alias: em_{email} → primary userId
    await createAlias(`em_${normalized}`, session.userId);

    // Update user record with email + passwordHash
    const user = await getUserRecord(session.userId);
    if (user) {
      user.email = normalized;
      user.passwordHash = data.passwordHash;
      if (user.authMethod === "telegram") user.authMethod = "linked";
      await saveUserRecord(session.userId, user);
    }

    // Clean up
    await redis.del(key);

    return NextResponse.json({ linked: true, email: normalized });
  } catch (error) {
    console.error("[auth/link/email/verify]", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// src/app/api/vpn/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAccount, createAccount, getProfiles, addProfile, createProfileSubToken, getSubUrl, DEVICE_NAMES } from "@/lib/accounts";
import { listInbounds, buildVlessForClient, addClient } from "@/lib/xpanel";
import { addClientSync } from "@/lib/xpanel-sync";
import { addClientToDE } from "@/lib/xpanel-de";
import { getEnabledInbounds } from "@/lib/inbounds";
import { canCreateProfile, getCurrentBalance, calcExpiry, syncAllExpiry } from "@/lib/balance";
import { authenticateRequest } from "@/lib/auth";
import { rateLimit, acquireLock } from "@/lib/ratelimit";
import { redis } from "@/lib/redis";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  if (!process.env.XPANEL_URL) {
    return NextResponse.json({ error: "XPANEL not configured" }, { status: 500 });
  }

  try {
    // Parse body ONCE, then pass to auth helper to avoid stream double-read
    const body = (await req.json().catch(() => ({}))) as { userId?: string; deviceType?: string };
    const rawDeviceType = typeof body.deviceType === "string" ? body.deviceType.trim() : "";
    const deviceType = rawDeviceType && DEVICE_NAMES[rawDeviceType] ? rawDeviceType : "";

    const auth = await authenticateRequest(req, body);
    if (!auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = auth.userId;

    // Rate limit: 5 creates per minute per user
    const rl = await rateLimit(`create:${userId}`, 5, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: `ÐÐ¾Ð´Ð¾Ð¶Ð´Ð¸ÑÐµ ${rl.retryAfter} ÑÐµÐº` }, { status: 429 });
    }

    let account = await getAccount(userId);
    if (!account) account = await createAccount(userId);

    // Acquire lock to prevent race condition
    const unlock = await acquireLock(`user:${userId}`, 15);
    if (!unlock) {
      return NextResponse.json({ error: "ÐÐ¾Ð´Ð¾Ð¶Ð´Ð¸ÑÐµ, Ð¾Ð¿ÐµÑÐ°ÑÐ¸Ñ Ð²ÑÐ¿Ð¾Ð»Ð½ÑÐµÑÑÑ" }, { status: 429 });
    }

    try {
      // Re-read after lock
      account = await getAccount(userId);
      if (!account) account = await createAccount(userId);
      const profiles = await getProfiles(userId);

      const check = canCreateProfile(account, profiles.length);
      if (!check.ok) {
        return NextResponse.json({ error: check.error, limit: true }, { status: 403 });
      }

      const inbounds = await listInbounds();
      const inbound = inbounds.obj?.[0];
      if (!inbound) return NextResponse.json({ error: "No inbound" }, { status: 500 });

      const uuid = randomUUID();
      const email = `vpn_${userId}_${Date.now()}`;

      const balance = getCurrentBalance(account, profiles.length);
      const newDeviceCount = profiles.length + 1;
      const expiryTime = calcExpiry(balance, newDeviceCount);

      account.balance = balance;
      account.balanceUpdatedAt = Date.now();
      account.paidUntil = expiryTime;
      await redis.set(`account:${userId}`, JSON.stringify(account));

      await addClientSync(inbound.id, email, uuid, expiryTime);

      // Best-effort mirror into other panel-managed inbounds (e.g. NL-Backup :8443)
      // so new clients appear on all servers. Failures here must NOT break
      // profile creation — the primary inbound write already succeeded.
      try {
        const allInbounds = await getEnabledInbounds();
        for (const ib of allInbounds) {
          if (ib.source === "panel" && ib.inboundId && ib.inboundId !== inbound.id) {
            addClient(ib.inboundId, `${email}_ib${ib.inboundId}`, uuid, expiryTime).catch((e) =>
              console.warn(`[vpn/create] mirror to inbound ${ib.inboundId} failed:`, e instanceof Error ? e.message : e)
            );
          }
        }
      } catch (e) {
        console.warn("[vpn/create] inbound mirror skipped:", e instanceof Error ? e.message : e);
      }

      // Mirror to DE panel (separate server/panel, not in main panel API).
      addClientToDE(`${email}_de`, uuid, expiryTime).catch((e) =>
        console.warn("[vpn/create] DE mirror failed:", e instanceof Error ? e.message : e)
      );

      // Build from CURRENT inbound config (no hardcoded host/keys).
      // buildVlessForClient re-fetches the same inbound from cache, so
      // it stays consistent with what /api/sub/[token] will return later.
      const vlessUrl = await buildVlessForClient(uuid);

      const subToken = await createProfileSubToken(userId, uuid);
      await redis.set(`hy2:${uuid}`, "1");
      await addProfile(userId, {
        uuid,
        clientEmail: email,
        vlessUrl,
        createdAt: Date.now(),
        deviceType,
        subToken,
      });

      if (profiles.length > 0) {
        await syncAllExpiry(userId);
      }

      return NextResponse.json({
        success: true,
        vlessUrl,
        profileCount: profiles.length + 1,
        subToken,
        subUrl: getSubUrl(subToken, userId),
      });
    } finally {
      await unlock();
    }
  } catch (error) {
    console.error("[vpn/create]", error);
    return NextResponse.json({ error: "ÐÑÐ¸Ð±ÐºÐ° ÑÐ¾Ð·Ð´Ð°Ð½Ð¸Ñ Ð¿ÑÐ¾ÑÐ¸Ð»Ñ" }, { status: 500 });
  }
}

// src/app/api/vpn/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getAccount,
  createAccount,
  getProfiles,
  addProfile,
  createProfileSubToken,
  getSubUrl,
  DEVICE_NAMES,
} from "@/lib/accounts";
import { buildVlessUrl } from "@/lib/xpanel";
import { getEnabledInbounds } from "@/lib/inbounds";
import { resolveInbound } from "@/lib/inbound-resolver";
import { addClientToStaticPanels } from "@/lib/kovra-servers-sync";
import { canCreateProfileAsync, syncAllExpiry, calcExpiryForUser } from "@/lib/balance";
import { authenticateRequest } from "@/lib/auth";
import { rateLimit, acquireLock } from "@/lib/ratelimit";
import { redis } from "@/lib/redis";
import { randomUUID } from "crypto";

/** VLESS url из первой резолвящейся записи реестра (DE priority 0). */
async function buildPrimaryVlessUrl(uuid: string): Promise<string> {
  const entries = (await getEnabledInbounds()).filter(
    (e) => (e.protocol ?? "vless") === "vless"
  );
  for (const entry of entries) {
    const p = await resolveInbound(uuid, entry);
    if (!p) continue;
    const tag = (entry.flag ? `${entry.flag} ` : "") + entry.label;
    return buildVlessUrl(
      uuid,
      p.address,
      p.port,
      p.serverName,
      p.publicKey,
      p.shortId,
      p.spiderX,
      p.fingerprint,
      p.encryption,
      tag,
      p.flow || "xtls-rprx-vision"
    );
  }
  throw new Error("no resolvable inbound in registry");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      userId?: string;
      deviceType?: string;
    };
    const rawDeviceType =
      typeof body.deviceType === "string" ? body.deviceType.trim() : "";
    const deviceType =
      rawDeviceType && DEVICE_NAMES[rawDeviceType] ? rawDeviceType : "";

    const auth = await authenticateRequest(req, body);
    if (!auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = auth.userId;

    const rl = await rateLimit(`create:${userId}`, 5, 60);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Please wait ${rl.retryAfter}s` },
        { status: 429 }
      );
    }

    let account = await getAccount(userId);
    if (!account) account = await createAccount(userId);

    const unlock = await acquireLock(`user:${userId}`, 15);
    if (!unlock) {
      return NextResponse.json(
        { error: "Operation in progress, please wait" },
        { status: 429 }
      );
    }

    try {
      account = await getAccount(userId);
      if (!account) account = await createAccount(userId);
      const profiles = await getProfiles(userId);

      const check = await canCreateProfileAsync(userId);
      if (!check.ok) {
        return NextResponse.json(
          { error: check.error, limit: true },
          { status: 403 }
        );
      }

      const uuid = randomUUID();
      const email = `vpn_${userId}_${Date.now()}`;

      const expiryTime = await calcExpiryForUser(userId);
      account.paidUntil = expiryTime;
      await redis.set(`account:${userId}`, JSON.stringify(account));

      // Пишем клиента на все статик-панели (DE/UK). Успех = принял хотя бы один сервер.
      const sync = await addClientToStaticPanels({
        uuid,
        email,
        subId: email,
        expiryTimeMs: expiryTime,
      });
      if (sync.length === 0 || !sync.some((r) => r.ok)) {
        console.error("[vpn/create] all panel writes failed", sync);
        return NextResponse.json(
          { error: "VPN servers are temporarily unavailable, try again in a minute" },
          { status: 503 }
        );
      }

      const vlessUrl = await buildPrimaryVlessUrl(uuid);

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
    return NextResponse.json({ error: "Profile creation failed" }, { status: 500 });
  }
}

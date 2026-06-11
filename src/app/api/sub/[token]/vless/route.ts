// src/app/api/sub/[token]/vless/route.ts
//
// Plain base64 vless subscription endpoint, designed specifically for the
// Happ encrypted-subscription flow.
//
// Unlike the main /api/sub/[token] endpoint, this one:
//   - Does NOT honor SUBSCRIPTION_FORMAT_DEFAULT (always returns base64 vless)
//   - Does NOT use query parameters (the Happ crypto API has been observed
//     stripping them when encrypting URLs, leaving Happ to fetch without
//     ?format=vless and receive an Xray JSON array → "ошибка 39")
//   - Includes ALL enabled inbounds (e.g. main + aeza), not just primary,
//     so encrypted subscriptions show multiple servers
//
// Old /api/sub/[token] endpoint stays untouched — backwards compat preserved.

import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getProfiles, getAccount } from "@/lib/accounts";
import { buildVlessForClient } from "@/lib/xpanel";
import { buildVlessForInbound } from "@/lib/xpanel-multi";
import { getEnabledInbounds, getEnabledInboundsForUser } from "@/lib/inbounds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token || token.length < 8) {
      return new NextResponse("Invalid token", { status: 403 });
    }

    // Per-profile token (current model)
    const profData = await redis.get(`sub_prof:${token}`);
    if (profData) {
      const { userId, uuid } =
        typeof profData === "string"
          ? JSON.parse(profData)
          : (profData as { userId: string; uuid: string });

      const account = await getAccount(userId);
      if (!account)
        return new NextResponse("Account not found", { status: 404 });

      const profiles = await getProfiles(userId);
      const profile = profiles.find((p) => p.uuid === uuid);
      if (!profile)
        return new NextResponse("Profile not found", { status: 404 });

      const expire =
        account.paidUntil > 0 ? Math.floor(account.paidUntil / 1000) : 0;
      const urls = await buildAllInboundUrls(profile.uuid, profile.vlessUrl, userId);
      return respondBase64(urls, expire);
    }

    // Legacy user-level token fallback
    const userId = await redis.get(`sub_token:${token}`);
    if (!userId || typeof userId !== "string") {
      return new NextResponse("Token not found", { status: 404 });
    }
    const account = await getAccount(userId);
    if (!account) return new NextResponse("Account not found", { status: 404 });
    const profiles = await getProfiles(userId);
    if (profiles.length === 0)
      return new NextResponse("No profiles", { status: 404 });

    const expire =
      account.paidUntil > 0 ? Math.floor(account.paidUntil / 1000) : 0;

    const all: string[] = [];
    for (const p of profiles) {
      const urls = await buildAllInboundUrls(p.uuid, p.vlessUrl, userId);
      all.push(...urls);
    }
    return respondBase64(all, expire);
  } catch (err) {
    console.error("[sub/vless]", err);
    return new NextResponse("Server error", { status: 500 });
  }
}

async function buildAllInboundUrls(
  uuid: string,
  storedFallback: string,
  userId?: string
): Promise<string[]> {
  const inbounds = await getEnabledInboundsForUser(userId);
  if (inbounds.length === 0) {
    try {
      return [await buildVlessForClient(uuid)];
    } catch (err) {
      console.warn("[sub/vless] legacy build failed:", err);
      return [storedFallback];
    }
  }

  const out: string[] = [];
  for (const entry of inbounds) {
    try {
      const url = await buildVlessForInbound(uuid, entry);
      if (url) out.push(url);
    } catch (err) {
      console.error(
        `[sub/vless] inbound build failed key=${entry.key}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return out;
}

function respondBase64(urls: string[], expireSec: number): NextResponse {
  if (urls.length === 0) {
    return new NextResponse("No servers", { status: 500 });
  }
  const base64 = Buffer.from(urls.join("\n")).toString("base64");
  return new NextResponse(base64, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "profile-title": "base64:8J+boe+4jyBLb3ZyYSDwn4yN",
      "profile-update-interval": "12",
      "subscription-userinfo": `upload=0; download=0; total=0; expire=${expireSec}`,
      "Cache-Control": "no-cache, no-store",
    },
  });
}

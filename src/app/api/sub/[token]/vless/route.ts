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
// Who gets servers is NOT different (KS-5): the same decision as the main
// endpoint (lib/sub-access.ts) — a deleted link, a second device on a bound
// link, an account without a running plan and a paused device get the same
// notices, and a legacy per-account link serves only the devices that hold
// a slot. Before 30.09.2026 this feed skipped all of that.

import { NextRequest, NextResponse } from "next/server";
import { resolveSubAccess, isSubGrant } from "@/lib/sub-access";
import { subRefusalResponse } from "@/lib/sub-notices";
import { buildVlessForClient } from "@/lib/xpanel";
import { buildVlessForInbound } from "@/lib/xpanel-multi";
import { getEnabledInboundsForUser } from "@/lib/inbounds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const access = await resolveSubAccess(token, req.headers.get("x-hwid"));
    if (!isSubGrant(access)) return subRefusalResponse(access);

    const devices = access.kind === "device" ? [access.profile] : access.profiles;
    const all: string[] = [];
    for (const p of devices) {
      const urls = await buildAllInboundUrls(p.uuid, p.vlessUrl, access.userId);
      all.push(...urls);
    }
    return respondBase64(all, access.expireSec);
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

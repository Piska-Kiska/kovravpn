// src/app/api/sub/[token]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getProfiles, getAccount } from "@/lib/accounts";
import { getSubscriptions, activeSlots } from "@/lib/subscriptions";
import { buildVlessForClient } from "@/lib/xpanel";
import { buildVlessForInbound } from "@/lib/xpanel-multi";
import { getEnabledInbounds, getEnabledInboundsForUser, type InboundEntry } from "@/lib/inbounds";
import { buildAllProfilesForUuid } from "@/lib/xray-subscription";
import type { VpnProfile } from "@/lib/accounts";

/**
 * Format selection:
 *   - ?format=xray  → xray subscription. Single JSON if registry has one
 *                     enabled inbound, multi-profile otherwise.
 *   - ?format=vless → legacy base64 vless URL list (primary inbound only)
 *   - default       → SUBSCRIPTION_FORMAT_DEFAULT env (vless if unset)
 *
 * Multi-profile wire format (only matters when 2+ profiles produced):
 *   - ?multi=ndjson → newline-separated single-line JSONs (plain text)
 *   - ?multi=array  → JSON array of profile objects
 *   - ?multi=b64    → base64-encoded NDJSON (Xray vless-list convention)
 *   - default       → ndjson — empirically what Happ-family clients accept
 */
type SubFormat = "vless" | "xray";
type MultiFormat = "ndjson" | "array" | "b64";

function resolveFormat(req: NextRequest): SubFormat {
  const q = new URL(req.url).searchParams.get("format")?.toLowerCase();
  if (q === "xray" || q === "json") return "xray";
  if (q === "vless" || q === "base64") return "vless";
  const env = process.env.SUBSCRIPTION_FORMAT_DEFAULT?.toLowerCase();
  return env === "xray" ? "xray" : "vless";
}

function resolveMultiFormat(req: NextRequest): MultiFormat {
  const q = new URL(req.url).searchParams.get("multi")?.toLowerCase();
  if (q === "array") return "array";
  if (q === "b64" || q === "base64") return "b64";
  return "array";
}

async function buildLinesForProfile(
  profile: VpnProfile,
  inbounds: InboundEntry[]
): Promise<string[]> {
  if (inbounds.length === 0) {
    try {
      return [await buildVlessForClient(profile.uuid)];
    } catch (err) {
      console.error("[sub] legacy build failed, using stored", err);
      return [profile.vlessUrl];
    }
  }
  const lines: string[] = [];
  for (const entry of inbounds) {
    if (entry.protocol === "hysteria2") {
      if (!entry.address) continue;
      const sni = entry.hy2Sni ?? "www.bing.com";
      const label = (entry.flag ? entry.flag + " " : "") + entry.label;
      const params: Record<string, string> = { sni };
      // Modern Xray cores removed allowInsecure; pin self-signed cert by SHA256.
      if (entry.hy2Pin) params.pinSHA256 = entry.hy2Pin;
      else params.insecure = entry.hy2Insecure === false ? "0" : "1";
      const q = new URLSearchParams(params);
      lines.push(`hy2://${encodeURIComponent(profile.uuid)}@${entry.address}:${entry.port ?? 443}/?${q.toString()}#${encodeURIComponent(label)}`);
      continue;
    }
    try {
      const url = await buildVlessForInbound(profile.uuid, entry);
      if (url) lines.push(url);
    } catch (err) {
      console.error(`[sub] vless build failed key=${entry.key}`, err instanceof Error ? err.message : err);
    }
  }
  if (lines.length === 0) return [profile.vlessUrl];
  return lines;
}

const HAPP_THEME = '{"backgroundGradientRotationAngle":45,"backgroundColors":["#07100BFF","#08140EFF","#0B1F16FF"],"elipseColors":["#10B981FF","#047857E0","#064E3BFF"],"backgroundGradientColorIntensity":1,"backgroundImageType":"system","buttonImageType":"light","buttonColor":"#10B981FF","buttonTextColor":"#FFFFFFFF","buttonTimerColor":"#FFFFFFFF","subHeaderButtonColor":"#FFFFFFFF","additionalOptionsButtonColor":"#FFFFFFFF","topBarButtonsColor":"#FFFFFFFF","supportIconColor":"#34D399FF","serverRowBackgroundColor":"#0F1A14CC","selectedServerRowColor":"#065F46FF","serverRowTitleTextColor":"#FFFFFFFF","serverRowSubTitleTextColor":"#6EE7B7FF","serverRowChevronColor":"#FFFFFFFF","subsHeaderColor":"#07100BFF","disclosureHeaderTextColor":"#FFFFFFFF","disclosureSubHeaderTextColor":"#6EE7B7FF","subscriptionTrafficBackgroundColor":"#047857FF","subscriptionInfoBackgroundColor":"#07100BFF","subscriptionInfoTextColor":"#FFFFFFFF","powerIconColor":"#06231AFF","profileWebPageIconColor":"#10B981FF"}';

const HAPP_UI: Record<string, string> = {
  "profile-title": "base64:8J+boe+4jyBLb3ZyYSDwn4yN",
  "profile-update-interval": "1",
  "ping-result": "icon",
  "support-url": "https://t.me/KovraVPN_bot",
  "subscription-ping-onopen-enabled": "1",
  "profile-web-page-url": "https://kovravpn.com",
  "subscription-pin": "1",
  "color-profile": HAPP_THEME,
  "routing-enable": "false",
  
};


const EMPTY_BALANCE_TITLE = "base64:" + Buffer.from("⚠️ No active plan", "utf-8").toString("base64");

function balanceInfoHeaders(empty: boolean): Record<string, string> {
  if (!empty) {
    // Reset sticky sub-info. Empty header value is invalid (crashes the
    // response), so send "0" which Happ treats as "block disabled".
    return { "sub-info-text": "0" };
  }
  const text = "No active plan. Buy a plan to keep using Kovra.";
  return {
    "sub-info-color": "red",
    "sub-info-text": "base64:" + Buffer.from(text, "utf-8").toString("base64"),
    "sub-info-button-text": "Get plan",
    "sub-info-button-link": "https://kovravpn.com",
  };
}

const EMPTY_BALANCE_ANNOUNCE =
  "base64:" +
  Buffer.from(
    "No active plan. Buy a plan at kovravpn.com to keep using Kovra.",
    "utf-8",
  ).toString("base64");
const EMPTY_BALANCE_BODY = Buffer.from(
  "vless://00000000-0000-0000-0000-000000000000@127.0.0.1:1?encryption=none&type=tcp&security=none#No%20active%20plan%20-%20kovravpn.com",
).toString("base64");

function emptyHeaders(): HeadersInit {
  // No subscription-userinfo here: an expire value would trigger Happ's
  // expire message, which suppresses the sub-info block we want to show.
  return {
    ...HAPP_UI,
    ...balanceInfoHeaders(true),
    announce: EMPTY_BALANCE_ANNOUNCE,
    "profile-web-page-url": "https://kovravpn.com",
    "support-url": "https://t.me/KovraVPN_bot",
    "profile-title": EMPTY_BALANCE_TITLE,
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-store",
  };
}

function plainHeaders(expireSec: number): HeadersInit {
  return {
    ...HAPP_UI,
    ...balanceInfoHeaders(false),
    "Content-Type": "text/plain; charset=utf-8",
    "subscription-userinfo": `upload=0; download=0; total=0; expire=${expireSec}`,
    "Cache-Control": "no-cache, no-store",
  };
}

function jsonHeaders(expireSec: number): HeadersInit {
  return {
    ...HAPP_UI,
    ...balanceInfoHeaders(false),
    "Content-Type": "application/json; charset=utf-8",
    "subscription-userinfo": `upload=0; download=0; total=0; expire=${expireSec}`,
    "Cache-Control": "no-cache, no-store",
  };
}

async function respondXray(
  uuid: string,
  expireSec: number,
  multi: MultiFormat,
  userId?: string
): Promise<NextResponse | null> {
  const profiles = await buildAllProfilesForUuid(uuid, userId);
  if (profiles.length === 0) return null;

  if (profiles.length === 1) {
    return new NextResponse(JSON.stringify(profiles[0]), {
      status: 200,
      headers: jsonHeaders(expireSec),
    });
  }

  if (multi === "array") {
    return new NextResponse(JSON.stringify(profiles), {
      status: 200,
      headers: jsonHeaders(expireSec),
    });
  }

  const ndjson = profiles
    .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
    .join("\n");

  if (multi === "b64") {
    return new NextResponse(Buffer.from(ndjson).toString("base64"), {
      status: 200,
      headers: plainHeaders(expireSec),
    });
  }

  return new NextResponse(ndjson, {
    status: 200,
    headers: plainHeaders(expireSec),
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token || token.length < 8) {
      return new NextResponse("Invalid token", { status: 403 });
    }

    const format = resolveFormat(req);
    const multi = resolveMultiFormat(req);

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

      const _subs = await getSubscriptions(userId);
      if (activeSlots(_subs) <= 0) {
        return new NextResponse(EMPTY_BALANCE_BODY, { status: 200, headers: emptyHeaders() });
      }

      const expire =
        account.paidUntil > 0 ? Math.floor(account.paidUntil / 1000) : 0;

      // Hysteria2 servers can't live in xray JSON array (sing-box engine).
      // If user's registry has any hy2 server, force vless/base64 list format
      // where vless:// and hy2:// links coexist as plain lines Happ parses.
      const userInbounds = await getEnabledInboundsForUser(userId);
      const hasHy2 = userInbounds.some((e) => e.protocol === "hysteria2");

      if (format === "xray" && !hasHy2) {
        const resp = await respondXray(uuid, expire, multi, userId);
        if (resp) return resp;
        console.warn("[sub] xray build empty, falling back to vless");
      }

      const lines = await buildLinesForProfile(profile, userInbounds);
      const base64 = Buffer.from(lines.join("\n")).toString("base64");
      return new NextResponse(base64, {
        status: 200,
        headers: plainHeaders(expire),
      });
    }

    const userId = await redis.get(`sub_token:${token}`);
    if (!userId || typeof userId !== "string") {
      return new NextResponse("Token not found", { status: 404 });
    }

    const account = await getAccount(userId);
    if (!account) return new NextResponse("Account not found", { status: 404 });

    const profiles = await getProfiles(userId);
    if (profiles.length === 0)
      return new NextResponse("No profiles", { status: 404 });

    const _subs2 = await getSubscriptions(userId);
    if (activeSlots(_subs2) <= 0) {
      return new NextResponse(EMPTY_BALANCE_BODY, { status: 200, headers: emptyHeaders() });
    }

    const expire =
      account.paidUntil > 0 ? Math.floor(account.paidUntil / 1000) : 0;

    if (format === "xray") {
      const resp = await respondXray(profiles[0].uuid, expire, multi, userId);
      if (resp) return resp;
      console.warn(
        "[sub] xray build empty for legacy token, falling back to vless"
      );
    }

    const inbounds = await getEnabledInbounds();
    const groups = await Promise.all(
      profiles.map((p) => buildLinesForProfile(p, inbounds))
    );
    const flat = groups.flat();
    const base64 = Buffer.from(flat.join("\n")).toString("base64");
    return new NextResponse(base64, {
      status: 200,
      headers: plainHeaders(expire),
    });
  } catch (err) {
    console.error("[sub]", err);
    return new NextResponse("Server error", { status: 500 });
  }
}

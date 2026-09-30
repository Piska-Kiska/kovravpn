// src/app/api/sub/[token]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resolveSubAccess, isSubGrant } from "@/lib/sub-access";
import { HAPP_UI, balanceInfoHeaders, subRefusalResponse } from "@/lib/sub-notices";
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
    // Deleted link, HWID binding, plan and slot: lib/sub-access.ts, shared
    // with /api/sub/<token>/vless so both feeds give the same answer.
    const access = await resolveSubAccess(token, req.headers.get("x-hwid"));
    if (!isSubGrant(access)) return subRefusalResponse(access);

    const format = resolveFormat(req);
    const multi = resolveMultiFormat(req);

    if (access.kind === "device") {
      const { userId, profile, expireSec: expire } = access;

      // Hysteria2 servers can't live in xray JSON array (sing-box engine).
      // If user's registry has any hy2 server, force vless/base64 list format
      // where vless:// and hy2:// links coexist as plain lines Happ parses.
      const userInbounds = await getEnabledInboundsForUser(userId);
      const hasHy2 = userInbounds.some((e) => e.protocol === "hysteria2");

      if (format === "xray" && !hasHy2) {
        const resp = await respondXray(profile.uuid, expire, multi, userId);
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

    const { userId, profiles: served, expireSec: expire } = access;

    if (format === "xray") {
      const resp = await respondXray(served[0].uuid, expire, multi, userId);
      if (resp) return resp;
      console.warn(
        "[sub] xray build empty for legacy token, falling back to vless"
      );
    }

    const inbounds = await getEnabledInbounds();
    const groups = await Promise.all(
      served.map((p) => buildLinesForProfile(p, inbounds))
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

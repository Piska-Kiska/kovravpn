// src/app/api/indexnow/ping/route.ts
//
// Manual/automatic trigger for IndexNow pings. Call this after a deploy, or
// whenever content on a public page changes (e.g. new blog post, updated
// terms). Protected by INTERNAL_API_KEY so strangers can't spam the
// endpoint with arbitrary URLs (which would rate-limit our site with Bing).
//
// Usage:
//   # Ping a custom list:
//   curl -X POST https://proxysvpn.com/api/indexnow/ping \
//     -H "x-internal-key: $INTERNAL_API_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{"urls":["https://proxysvpn.com/","https://proxysvpn.com/guide"]}'
//
//   # Ping the default public page set (no body):
//   curl -X POST https://proxysvpn.com/api/indexnow/ping \
//     -H "x-internal-key: $INTERNAL_API_KEY"

import { NextRequest, NextResponse } from "next/server";
import { pingIndexNow } from "@/lib/indexnow";

const INTERNAL_KEY = process.env.INTERNAL_API_KEY || process.env.TELEGRAM_BOT_TOKEN || "";

// Public pages worth notifying search engines about. Keep in sync with
// src/app/sitemap.ts — all indexable URLs live here.
const DEFAULT_URLS = [
  "https://proxysvpn.com/",
  "https://proxysvpn.com/guide",
  "https://proxysvpn.com/terms",
  "https://proxysvpn.com/privacy",
];

type Body = { urls?: unknown };

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-internal-key");
  if (!INTERNAL_KEY || key !== INTERNAL_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let urls: string[] = DEFAULT_URLS;
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    if (Array.isArray(body.urls) && body.urls.length > 0) {
      urls = body.urls.filter((u): u is string => typeof u === "string");
    }
  } catch {
    // Empty body is fine → use DEFAULT_URLS.
  }

  const result = await pingIndexNow(urls);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

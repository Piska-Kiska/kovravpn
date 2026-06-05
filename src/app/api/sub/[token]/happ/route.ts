// src/app/api/sub/[token]/happ/route.ts
import { NextRequest, NextResponse } from "next/server";
import { encryptHappLink } from "@/lib/happ-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://proxysvpn.com";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  if (!token || !/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
    return NextResponse.json({ error: "bad token" }, { status: 400 });
  }

  const plainUrl = `${ORIGIN}/api/sub/${token}/vless`;
  const url = new URL(req.url);
  const asJson = url.searchParams.get("format") === "json";

  try {
    const { link, cached } = await encryptHappLink(plainUrl, token);
    if (asJson) {
      return NextResponse.json(
        { link, cached, plain: plainUrl },
        { headers: { "Cache-Control": "private, max-age=300" } }
      );
    }
    return new NextResponse(link, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("[sub/happ] encryption failed:", err);
    return NextResponse.json(
      {
        error: "encryption_unavailable",
        message: "Happ encryption API is temporarily unavailable.",
        plain: plainUrl,
      },
      { status: 502 }
    );
  }
}

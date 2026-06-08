import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { buildVlessForClient, listInbounds } from "@/lib/xpanel";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = "em_alesatvitter@gmail.com";
  const out: Record<string, unknown> = { uid };
  out.profile = await redis.get(`profiles:${uid}`);
  try {
    const ib = await listInbounds();
    out.listInbounds_ok = true;
    out.inbound_count = Array.isArray(ib?.obj) ? ib.obj.length : null;
  } catch (e) {
    out.listInbounds_ok = false;
    out.listInbounds_err = e instanceof Error ? e.message : String(e);
  }
  try {
    out.freshUrl = await buildVlessForClient("f062e715-3b32-457f-b4af-e6a7ed442ea5");
  } catch (e) {
    out.buildVless_err = e instanceof Error ? e.message : String(e);
  }
  out.env = {
    XPANEL_URL: !!process.env.XPANEL_URL,
    XPANEL_TOKEN: !!process.env.XPANEL_TOKEN,
    TLS_REJECT: process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? null,
  };
  return NextResponse.json(out);
}

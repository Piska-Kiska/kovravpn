import { NextResponse } from "next/server";
import { getProfiles } from "@/lib/accounts";
import { getEnabledInboundsForUser } from "@/lib/inbounds";
import { resolveInbound } from "@/lib/inbound-resolver";
import { listInbounds } from "@/lib/xpanel";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = "em_alesatvitter@gmail.com";
  const out: Record<string, unknown> = {
    XPANEL_URL: process.env.XPANEL_URL ?? null,
    VPN_HOST: process.env.VPN_HOST ?? null,
    VPN_SERVER_HOST: process.env.VPN_SERVER_HOST ?? null,
  };
  try {
    const ib = await listInbounds();
    out.listInbounds_ok = true;
    out.inbound_count = Array.isArray(ib?.obj) ? ib.obj.length : null;
  } catch (e) {
    out.listInbounds_err = e instanceof Error ? e.message : String(e);
  }
  try {
    const profile = (await getProfiles(uid))[0];
    const entry = (await getEnabledInboundsForUser(uid))[0];
    out.resolved = await resolveInbound(profile.uuid, entry);
  } catch (e) {
    out.resolve_err = e instanceof Error ? (e.stack || e.message) : String(e);
  }
  return NextResponse.json(out);
}

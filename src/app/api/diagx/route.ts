import { NextResponse } from "next/server";
import { getProfiles } from "@/lib/accounts";
import { getEnabledInboundsForUser } from "@/lib/inbounds";
import { buildVlessForInbound } from "@/lib/xpanel-multi";
import { resolveInbound } from "@/lib/inbound-resolver";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = "em_alesatvitter@gmail.com";
  const out: Record<string, unknown> = {};
  const profile = (await getProfiles(uid))[0];
  const entry = (await getEnabledInboundsForUser(uid))[0];
  out.resolved = await resolveInbound(profile.uuid, entry);
  out.built = await buildVlessForInbound(profile.uuid, entry);
  return NextResponse.json(out);
}

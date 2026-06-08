import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getProfiles } from "@/lib/accounts";
import { getEnabledInboundsForUser } from "@/lib/inbounds";
import { buildVlessForClient } from "@/lib/xpanel";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = "em_alesatvitter@gmail.com";
  const out: Record<string, unknown> = { uid };
  const profiles = await getProfiles(uid);
  out.profiles_count = profiles.length;
  const profile = profiles[0];
  out.profile_uuid = profile?.uuid;
  const inbounds = await getEnabledInboundsForUser(uid);
  out.userInbounds_count = inbounds.length;
  out.userInbounds = inbounds;
  // reproduce buildLinesForProfile inbounds.length===0 branch exactly
  if (inbounds.length === 0) {
    try {
      out.built = await buildVlessForClient(profile.uuid);
    } catch (err) {
      out.build_threw = err instanceof Error ? (err.stack || err.message) : String(err);
    }
  }
  return NextResponse.json(out);
}

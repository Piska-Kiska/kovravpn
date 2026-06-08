import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = "em_alesatvitter@gmail.com";
  const [userReg, globalReg, profile] = await Promise.all([
    redis.get(`inbounds:registry:user:${uid}`),
    redis.get("inbounds:registry"),
    redis.get(`profiles:${uid}`),
  ]);
  // profile.vlessUrl is non-secret (it is what the sub already serves publicly)
  return NextResponse.json({ uid, userReg, globalReg, profile });
}

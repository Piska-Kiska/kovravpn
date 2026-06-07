import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("k");
  if (!key || key !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const uid = "em_alesatvitter@gmail.com";
  const [userReg, globalReg, profile] = await Promise.all([
    redis.get(`inbounds:registry:user:${uid}`),
    redis.get("inbounds:registry"),
    redis.get(`profiles:${uid}`),
  ]);
  return NextResponse.json({ uid, userReg, globalReg, profile });
}

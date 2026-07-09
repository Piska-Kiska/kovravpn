// src/app/api/vpn/reset-hwid/route.ts
//
// Reset the HWID device binding for the user's subscription link(s), so the
// next device that refreshes the subscription becomes the bound device.
// Mirrors the bot's "Reset device binding" action. 1 link = 1 device.
//
// Body: { userId?, uuid? }  — uuid resets a single link, omitted resets all.
// Auth: session (web) or userId+token pair via authenticateRequest.

import { NextRequest, NextResponse } from "next/server";
import { getProfiles, ensureProfileSubToken } from "@/lib/accounts";
import { authenticateRequest } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      userId?: string;
      uuid?: string;
    };
    const auth = await authenticateRequest(req, body);
    if (!auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = auth.userId;

    const rl = await checkRateLimit(`reset-hwid:${userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Wait ~${rl.resetIn}s.` },
        { status: 429 },
      );
    }

    const profiles = await getProfiles(userId);
    if (profiles.length === 0) {
      return NextResponse.json({ error: "No profiles" }, { status: 404 });
    }

    const onlyUuid = typeof body.uuid === "string" && body.uuid ? body.uuid : null;
    const targets = onlyUuid ? profiles.filter((p) => p.uuid === onlyUuid) : profiles;
    if (onlyUuid && targets.length === 0) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    let cleared = 0;
    for (const p of targets) {
      try {
        const token = await ensureProfileSubToken(userId, p.uuid);
        const r = await redis.del(`sub:${token}:hwid`);
        if (r) cleared++;
      } catch (e) {
        console.error("[vpn/reset-hwid] failed for", p.uuid, e);
      }
    }
    return NextResponse.json({ success: true, cleared });
  } catch (error) {
    console.error("[vpn/reset-hwid]", error);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}

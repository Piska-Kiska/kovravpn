// src/app/api/vpn/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getProfiles, removeProfile } from "@/lib/accounts";
import { removeClientFromStaticPanels } from "@/lib/kovra-servers-sync";
import { syncAllExpiry } from "@/lib/balance";
import { authenticateRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { userId?: string; uuid?: string };
    const auth = await authenticateRequest(req, body);
    if (!auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const uuid = typeof body.uuid === "string" ? body.uuid : "";
    if (!uuid) return NextResponse.json({ error: "uuid required" }, { status: 400 });

    const userId = auth.userId;
    const profiles = await getProfiles(userId);
    const profile = profiles.find((p) => p.uuid === uuid);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    try {
      await removeClientFromStaticPanels(uuid, profile.clientEmail);
    } catch (e) {
      console.error("[vpn/delete] panel delete failed", e);
    }

    await removeProfile(userId, uuid);

    if (profiles.length > 1) {
      await syncAllExpiry(userId);
    }

    return NextResponse.json({ success: true, remaining: profiles.length - 1 });
  } catch (error) {
    console.error("[vpn/delete]", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

// src/app/api/vpn/delete/route.ts
//
// Delete one of the caller's devices. Ownership, the panels and the expiry
// sync live in lib/profile-delete.ts (shared with the bot). A panel that does
// not confirm the removal keeps the device: 502, and the person tries again.
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { deleteOwnProfile } from "@/lib/profile-delete";
import { getProfiles } from "@/lib/accounts";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { userId?: string; uuid?: string };
    const auth = await authenticateRequest(req, body);
    if (!auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const uuid = typeof body.uuid === "string" ? body.uuid : "";
    if (!uuid || uuid.length > 64) return NextResponse.json({ error: "uuid required" }, { status: 400 });

    const userId = auth.userId;
    const r = await deleteOwnProfile(userId, uuid);
    if (r === "not_found") return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    if (r === "panel_failed") return NextResponse.json({ error: "Panel delete failed" }, { status: 502 });

    const remaining = (await getProfiles(userId)).length;
    return NextResponse.json({ success: true, remaining });
  } catch (error) {
    console.error("[vpn/delete]", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { hasTopup } from "@/lib/accounts";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ hasTopup: false });
  return NextResponse.json({ hasTopup: await hasTopup(session.userId) });
}

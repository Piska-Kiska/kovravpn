// src/app/api/promo/list/route.ts
// src/app/api/promo/list/route.ts
//
// List (GET) and delete (DELETE) promo codes (admin). Auth: X-Admin-Key =
// ADMIN_API_KEY, constant time, 503 while it is unset (lib/admin-key.ts; it
// used to be the bot token, KM-14).
import { NextRequest, NextResponse } from "next/server";
import { listPromos, deletePromo } from "@/lib/promo";
import { checkAdminRequest } from "@/lib/admin-key";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Null when the request may go on, else the answer to give. */
function denied(req: NextRequest): NextResponse | null {
  const auth = checkAdminRequest(req);
  if (auth === "ok") return null;
  if (auth === "disabled") {
    return NextResponse.json({ error: "Admin API is disabled" }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
}

export async function GET(req: NextRequest) {
  const no = denied(req);
  if (no) return no;

  const promos = await listPromos();
  return NextResponse.json({ promos });
}

export async function DELETE(req: NextRequest) {
  const no = denied(req);
  if (no) return no;

  const body: unknown = await req.json().catch(() => null);
  const code = typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined;
  if (typeof code !== "string" || code.length === 0 || code.length > 64) {
    return NextResponse.json({ error: "Code required" }, { status: 400 });
  }

  await deletePromo(code);
  return NextResponse.json({ success: true });
}

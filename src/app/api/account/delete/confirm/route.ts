// src/app/api/account/delete/confirm/route.ts
//
// POST {lang}: send the deletion code to the account's own channel
// (lib/account-delete.ts).
import type { NextRequest } from "next/server";
import { defaultAccountDeleteDeps, handleDeleteCode } from "@/lib/account-delete";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return handleDeleteCode(req, defaultAccountDeleteDeps());
}

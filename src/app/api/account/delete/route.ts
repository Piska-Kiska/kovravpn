// src/app/api/account/delete/route.ts
//
// GET: what deleting this account would remove; POST {code}: delete it.
// Everything lives in lib/account-delete.ts; this file only wires it.
import type { NextRequest } from "next/server";
import { defaultAccountDeleteDeps, handleDelete, handleDeleteStatus } from "@/lib/account-delete";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Every device leaves every panel one by one, each with its retries.
export const maxDuration = 60;

export function GET(req: NextRequest) {
  return handleDeleteStatus(req);
}

export function POST(req: NextRequest) {
  return handleDelete(req, defaultAccountDeleteDeps());
}

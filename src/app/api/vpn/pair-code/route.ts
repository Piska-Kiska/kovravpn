// src/app/api/vpn/pair-code/route.ts
//
// "Code for the app" for one device, from the cabinet (contract pair-code v1,
// lib/pair-code-server.ts).
//
//   body  {"uuid": "<device>"}
//   200   {"code":"K7QM2XPA","display":"K7QM-2XPA","expiresIn":600}
//   401   no session
//   400   no device id, or not one
//   404   not this account's device ("Profile not found", the string the
//         cabinet already maps, lib/dashboard/errors.ts)
//   429   20 codes an hour per account; retryAfter and Retry-After
//
// The link stored under the code is derived here from the account's own
// device; the request carries no link and could not choose one. Same-origin
// only, like every other /api/vpn route: no CORS headers.

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { redactForLog } from "@/lib/pair-code";
import { issuePairCodeForDevice } from "@/lib/pair-code-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function answer(status: number, body: Record<string, string | number>, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

export async function POST(req: NextRequest) {
  try {
    const raw: unknown = await req.json().catch(() => null);
    const body: Readonly<Record<string, unknown>> = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

    const auth = await authenticateRequest(req, { userId: typeof body.userId === "string" ? body.userId : undefined });
    if (!auth.userId) return answer(401, { error: "Unauthorized" });

    const uuid = typeof body.uuid === "string" ? body.uuid : "";
    const result = await issuePairCodeForDevice({ userId: auth.userId, deviceId: uuid });
    if (result.ok) return answer(200, { code: result.code, display: result.display, expiresIn: result.expiresIn });
    switch (result.reason) {
      case "not_found":
        return answer(404, { error: "Profile not found" });
      case "bad_input":
        return answer(400, { error: "Bad request" });
      case "rate_limited":
        return answer(429, { error: "Too many requests", retryAfter: result.retryAfter }, { "Retry-After": String(result.retryAfter) });
    }
  } catch (err) {
    console.error(`[pair-code] issue failed: ${redactForLog(err)}`);
    return answer(500, { error: "Internal error" });
  }
}

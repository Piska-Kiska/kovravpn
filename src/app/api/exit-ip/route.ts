// src/app/api/exit-ip/route.ts
//
// The app's tunnel check: `{"ip":"..."}`, never cached (lib/exit-ip.ts).
// HEAD answers the same headers without a body, for the app's first probe.

import { NextResponse, type NextRequest } from "next/server";
import { EXIT_IP_HEADERS, exitIpBody } from "@/lib/exit-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest): NextResponse {
  return new NextResponse(exitIpBody(req.headers), { status: 200, headers: EXIT_IP_HEADERS });
}

export function HEAD(): NextResponse {
  return new NextResponse(null, { status: 200, headers: EXIT_IP_HEADERS });
}

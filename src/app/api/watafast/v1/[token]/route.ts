// src/app/api/watafast/v1/[token]/route.ts
//
// GET /api/watafast/v1/<token>[?lang=ru|en]: the app's signed list
// (MANIFEST-v1.md). Everything is in lib/watafast-endpoint.ts handleManifest;
// without WATAFAST_MANIFEST_KEY and WATAFAST_MANIFEST_KID it answers 503 and
// the app keeps to the subscription.

import { NextRequest } from "next/server";
import { defaultWatafastEndpointDeps, handleManifest } from "@/lib/watafast-endpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handleManifest(req, token, defaultWatafastEndpointDeps());
}

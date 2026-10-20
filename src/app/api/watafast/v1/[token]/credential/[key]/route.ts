// src/app/api/watafast/v1/[token]/credential/[key]/route.ts
//
// GET /api/watafast/v1/<token>/credential/<key>: a credential for the reserve
// path of our app, for the device's own public key. Everything is in
// lib/watafast-endpoint.ts handleCredential; a deployment without reserve
// nodes or without its issuer key answers 403 not_offered.

import { NextRequest } from "next/server";
import { defaultWatafastEndpointDeps, handleCredential } from "@/lib/watafast-endpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; key: string }> }) {
  const { token, key } = await params;
  return handleCredential(req, token, key, defaultWatafastEndpointDeps());
}

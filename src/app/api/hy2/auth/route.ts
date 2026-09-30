// src/app/api/hy2/auth/route.ts
//
// Hysteria2 HTTP authentication (the server's `auth: { type: http }` mode).
// The Hysteria2 server calls this on EVERY client connect:
//
//   POST {"addr": "<client ip:port>", "auth": "<password>", "tx": <bps>}
//   200  {"ok": true, "id": "<uuid>"}   let the client in, `id` names it in
//                                        the server's logs and traffic stats
//   200  {"ok": false}                   refuse
//
// The server treats anything but a 200 with ok:true as a refusal, so every
// answer here is a 200. The password is the device UUID from the hy2:// link
// the subscription hands out.
//
// Who is let in: lib/hy2-access.ts, the same device access the subscription
// and the panel-less nodes use (active plan, device within its slots, not
// deleted). Unknown UUIDs, malformed passwords and an unreadable store are
// refused. Logs never carry the password or the client address.

import { NextRequest, NextResponse } from "next/server";
import { hy2Access } from "@/lib/hy2-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A password is a UUID (36 chars); a body much longer than that is not worth parsing. */
const MAX_BODY_CHARS = 4096;

const REFUSE = { ok: false } as const;

function answer(body: { ok: true; id: string } | typeof REFUSE): NextResponse {
  return NextResponse.json(body, { status: 200, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  let auth: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) return answer(REFUSE);
    const body = JSON.parse(text) as unknown;
    auth = body && typeof body === "object" ? (body as { auth?: unknown }).auth : undefined;
  } catch {
    return answer(REFUSE);
  }

  const verdict = await hy2Access(auth);
  return verdict.ok ? answer({ ok: true, id: verdict.id }) : answer(REFUSE);
}

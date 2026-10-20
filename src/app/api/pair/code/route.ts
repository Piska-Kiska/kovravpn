// src/app/api/pair/code/route.ts
//
// Redeeming a "code for the app" (contract pair-code v1.1, lib/pair-code.ts):
// the Kovra app's "Enter the code from the site" posts {"code": "K7QM-2XPA",
// "requestId": "<43 characters of base64url>"} here and gets the device's
// subscription link back once. `requestId` is optional and a malformed one is
// ignored, never refused.
//
//   200 {"status":"ready","subUrl":"https://…"}   the code is spent with it;
//                                  if this answer is lost, a retry with the
//                                  same requestId within 300 s gets it again.
//                                  The link is the app's to take from the
//                                  device that held it (lib/pair-code-server.ts
//                                  handLinkToOwnApp), for ten minutes
//   400 {"error":"bad_code"}       not 8 characters of the alphabet
//   404 {"error":"not_found"}      wrong, expired, already used, or a retry
//                                  without the requestId it was spent with:
//                                  one answer
//   429 {"error":"rate_limited"}   10 a minute, 60 a day per address, replays
//                                  included; Retry-After
//   503 {"error":"unavailable"}    Redis did not answer. The code may be
//                                  spent all the same: a retry with the same
//                                  requestId then gets the 200 as a replay
//
// and, to requests the app never sends, uncounted and unlogged:
//
//   403 {"error":"forbidden"}               a page of another site (Origin)
//   415 {"error":"unsupported_media_type"}  not application/json
//
// Public and unauthenticated: the app has no account yet. Nothing cached.
// Every attempt the app could have sent counts against the address's limits,
// a malformed code included; what a web page can make a visitor's browser
// send does not, or any site could lock the visitor's own app out for a day
// (lib/pair-code.ts redeemRequestRefusal).

import { NextResponse } from "next/server";
import { redactForLog, redeemPairCode, redeemRequestRefusal, redeemRetryAfter } from "@/lib/pair-code";
import { handLinkToOwnApp, sitePairCodeStore } from "@/lib/pair-code-server";
import { getClientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const HEADERS = { ...CORS, "Cache-Control": "no-store" };

/** A code and a request id are under 130 characters of JSON; anything near a kilobyte is not a redeem. */
const BODY_MAX = 1_024;

function answer(status: number, body: Record<string, string>, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...HEADERS, ...extra } });
}

/** The fields of a redeem body, unchecked: lib/pair-code.ts validates both. */
interface RedeemBody {
  readonly code: unknown;
  readonly requestId: unknown;
}

const NO_BODY: RedeemBody = Object.freeze({ code: undefined, requestId: undefined });

/** The `code` and `requestId` fields of the body, both undefined when the body is not one. */
async function bodyOf(req: Request): Promise<RedeemBody> {
  try {
    const text = await req.text();
    if (text.length === 0 || text.length > BODY_MAX) return NO_BODY;
    const body: unknown = JSON.parse(text);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return NO_BODY;
    const fields = body as Readonly<Record<string, unknown>>;
    return { code: fields.code, requestId: fields.requestId };
  } catch {
    return NO_BODY;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  switch (redeemRequestRefusal(req.headers)) {
    case "foreign_origin":
      return answer(403, { error: "forbidden" });
    case "not_json":
      return answer(415, { error: "unsupported_media_type" });
    case null:
      break;
  }

  const retryAfter = await redeemRetryAfter(rateLimit, getClientIp(req));
  if (retryAfter !== null) return answer(429, { error: "rate_limited" }, { "Retry-After": String(retryAfter) });

  const { code, requestId } = await bodyOf(req);
  try {
    const result = await redeemPairCode({ store: sitePairCodeStore() }, code, requestId);
    switch (result.status) {
      case "ready":
        // The code is spent whatever happens next, so a lost note must not
        // cost the person the link: the app is then told the link is taken,
        // and the cabinet's reset still works.
        try {
          await handLinkToOwnApp(result.userId, result.deviceId);
        } catch (err) {
          console.error(`[pair-code] handover note failed: ${redactForLog(err)}`);
        }
        return answer(200, { status: "ready", subUrl: result.subUrl });
      // A replay is byte for byte the answer that was lost; its note was left
      // when the code was spent.
      case "replayed":
        return answer(200, { status: "ready", subUrl: result.subUrl });
      case "bad_code":
        return answer(400, { error: "bad_code" });
      case "not_found":
        return answer(404, { error: "not_found" });
    }
  } catch (err) {
    console.error(`[pair-code] redeem failed: ${redactForLog(err)}`);
    return answer(503, { error: "unavailable" });
  }
}

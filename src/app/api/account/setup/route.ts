// src/app/api/account/setup/route.ts
//
// Admin tool: write a legacy account record (plan, paid-until, extra device
// slots) for a user id. Nothing in the repo calls it.
//
// Auth: X-Admin-Key = ADMIN_API_KEY, constant time; 503 while it is unset
// (lib/admin-key.ts). It used to take the Telegram bot token in the body,
// compared with `!==`, which let anyone in when the token was unset
// (undefined === undefined) and anyone holding the bot token grant free
// plans (KS-7).

import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import type { UserAccount } from "@/lib/accounts";
import { checkAdminRequest } from "@/lib/admin-key";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const PLAN_LIMITS = { free: 1, base: 3, optimal: 3, max: 3 } as const;
const PLAN_DAYS = { free: 3, base: 30, optimal: 180, max: 365 } as const;
type SetupPlan = keyof typeof PLAN_LIMITS;

/** tg_<digits> or em_<address>: the two kinds of user id. */
const USER_ID_RE = /^(tg_\d{1,20}|em_[^\s@]{1,64}@[^\s@]{1,190})$/;

function isPlan(v: unknown): v is SetupPlan {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PLAN_LIMITS, v);
}

/** An integer in [min, max], `fallback` when absent; null when present and invalid. */
function intIn(v: unknown, min: number, max: number, fallback: number): number | null {
  if (v === undefined || v === null) return fallback;
  return typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : null;
}

export async function POST(req: NextRequest) {
  const auth = checkAdminRequest(req);
  if (auth === "disabled") {
    return NextResponse.json({ error: "Admin API is disabled" }, { status: 503, headers: NO_STORE });
  }
  if (auth !== "ok") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let body: Record<string, unknown>;
  try {
    const raw: unknown = await req.json();
    if (typeof raw !== "object" || raw === null) throw new Error("not an object");
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE });
  }

  const userId = body.userId;
  if (typeof userId !== "string" || !USER_ID_RE.test(userId)) {
    return NextResponse.json({ error: "userId: tg_<digits> or em_<address>" }, { status: 400, headers: NO_STORE });
  }
  const planRaw = body.plan === undefined ? "optimal" : body.plan;
  if (!isPlan(planRaw)) {
    return NextResponse.json(
      { error: `plan: one of ${Object.keys(PLAN_LIMITS).join(", ")}` },
      { status: 400, headers: NO_STORE },
    );
  }
  const plan: SetupPlan = planRaw;
  const days = intIn(body.days, 1, 3650, PLAN_DAYS[plan]);
  const extraProfiles = intIn(body.extraProfiles, 0, 100, 0);
  if (days === null || extraProfiles === null) {
    return NextResponse.json(
      { error: "days 1..3650 and extraProfiles 0..100, integers" },
      { status: 400, headers: NO_STORE },
    );
  }

  const now = Date.now();
  const account: UserAccount = {
    plan,
    maxProfiles: PLAN_LIMITS[plan],
    extraProfiles,
    paidUntil: now + days * 86_400_000,
    createdAt: now,
    balance: 0,
    balanceUpdatedAt: now,
  };

  try {
    await redis.set(`account:${userId}`, JSON.stringify(account));
  } catch (error) {
    console.error("[account/setup] write failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Storage error" }, { status: 500, headers: NO_STORE });
  }
  console.info(JSON.stringify({ evt: "admin.account_setup", userId, plan, days, extraProfiles }));
  return NextResponse.json({ success: true, account }, { headers: NO_STORE });
}

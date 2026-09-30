// src/app/api/payment/create/route.ts
//
// RETIRED (KM-15). This created YooKassa RUB payments for any signed-in user
// while /api/payment/webhook, which would fulfil them, already answered 410:
// a completed payment could never be granted. It also returned the raw
// upstream error text. Nothing in the site calls it; it now answers 410 like
// the other retired rails (payment/webhook, balance/topup*).
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Payment method not available" }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({ error: "Gone" }, { status: 410 });
}

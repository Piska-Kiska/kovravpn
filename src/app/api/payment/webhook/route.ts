// DISABLED in crypto-only model. Ruble/card rails removed.
import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "Payment method not available" }, { status: 410 });
}
export async function GET() {
  return NextResponse.json({ error: "Gone" }, { status: 410 });
}

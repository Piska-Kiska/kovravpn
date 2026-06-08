import { NextResponse } from "next/server";
import { listInbounds } from "@/lib/xpanel";

export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {};
  try {
    const res = await listInbounds();
    const arr = (res?.obj ?? []) as Array<{ id: unknown; port: unknown; protocol: unknown }>;
    out.count = arr.length;
    out.inbounds = arr.map((i) => ({ id: i.id, id_type: typeof i.id, port: i.port, protocol: i.protocol }));
  } catch (e) {
    out.err = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json(out);
}

// src/app/api/admin/broadcast/route.ts
//
// Admin-only broadcast endpoint.
//
// Auth: X-Admin-Key header must match env ADMIN_API_KEY.
// Limit: synchronous send. Vercel function timeout caps how many users we can
// reach in one call:
//   - Hobby tier:  ~10s  -> ~250 users per call (at 25 msg/sec)
//   - Pro tier:    ~60s  -> ~1500 users per call
// For larger lists, send in chunks via `chatIds`.
//
// Body (POST):
//   { message: string,
//     userIds?: string[],   // ["tg_123", "em_user@example.com"]
//     chatIds?: number[],   // raw Telegram chat IDs; takes priority over userIds
//     parseMode?: "HTML" | "Markdown",
//     disablePreview?: boolean }
// If neither userIds nor chatIds is provided, broadcast goes to ALL users with
// linked Telegram.
//
// GET returns { totalUsers } for a dry run / sanity check.

import { NextRequest, NextResponse } from "next/server";
import {
  BroadcastTarget,
  broadcastToUsers,
  getAllTelegramTargets,
  resolveUserIds,
} from "@/lib/broadcast";

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-admin-key");
  if (!ADMIN_API_KEY || key !== ADMIN_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targets = await getAllTelegramTargets();
  return NextResponse.json({
    totalUsers: targets.length,
    sample: targets.slice(0, 5).map((t) => ({ userId: t.userId })),
  });
}

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-admin-key");
  if (!ADMIN_API_KEY || key !== ADMIN_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    message?: string;
    userIds?: string[];
    chatIds?: (number | string)[];
    parseMode?: "HTML" | "Markdown";
    disablePreview?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = (body.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  if (message.length > 4096) {
    return NextResponse.json(
      { error: "message too long (max 4096 chars)" },
      { status: 400 },
    );
  }

  let targets: BroadcastTarget[];

  if (body.chatIds && Array.isArray(body.chatIds) && body.chatIds.length > 0) {
    const seen = new Set<number>();
    targets = [];
    for (const raw of body.chatIds) {
      const id = Number(raw);
      if (!isNaN(id) && id > 0 && !seen.has(id)) {
        seen.add(id);
        targets.push({ userId: `direct_${id}`, chatId: id });
      }
    }
  } else if (body.userIds && Array.isArray(body.userIds) && body.userIds.length > 0) {
    targets = await resolveUserIds(body.userIds);
  } else {
    targets = await getAllTelegramTargets();
  }

  if (targets.length === 0) {
    return NextResponse.json(
      { error: "no targets resolved" },
      { status: 400 },
    );
  }

  const start = Date.now();
  console.log(`[admin/broadcast] start: ${targets.length} targets`);

  const result = await broadcastToUsers(
    {
      text: message,
      parseMode: body.parseMode ?? "HTML",
      disablePreview: body.disablePreview ?? false,
    },
    targets,
  );

  const elapsedMs = Date.now() - start;
  console.log(`[admin/broadcast] done in ${elapsedMs}ms`, {
    sent: result.sent,
    failed: result.failed,
    blocked: result.blocked,
  });

  return NextResponse.json({
    ok: true,
    elapsedMs,
    ...result,
    errors: result.errors.slice(0, 50),
    truncatedErrors: result.errors.length > 50,
  });
}

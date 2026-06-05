// scripts/backfill-tg-identity.ts
//
// One-shot script to backfill Telegram identity for all existing accounts.
// For each account:tg_{id} key, calls Telegram getChat and writes identity
// into UserRecord + username:{lc} secondary index.
//
// Run from project root:
//   npx tsx scripts/backfill-tg-identity.ts
//
// Env required (auto-loaded from .env.local if present):
//   TELEGRAM_BOT_TOKEN
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

import fs from "fs";
import path from "path";

// ── Load .env.local without dotenv dependency ─────────────────────
const envLocal = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

for (const k of ["TELEGRAM_BOT_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  if (!process.env[k]) {
    console.error(`Missing env: ${k}`);
    process.exit(1);
  }
}

// Dynamic imports AFTER env is loaded (redis.ts reads env at module init)
const upstash = await import("@upstash/redis");
const { syncTelegramIdentity } = await import("../src/lib/accounts");

const redis = new upstash.Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

interface TgChat {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

async function getChat(tgId: string): Promise<TgChat | null> {
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChat?chat_id=${tgId}`,
    );
    const j = (await r.json()) as { ok: boolean; result?: TgChat };
    return j.ok && j.result ? j.result : null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log("Scanning account:tg_* keys in Redis...");
  let cursor: number = 0;
  let scanned = 0;
  let updated = 0;
  let withUsername = 0;
  let skipped = 0;

  while (true) {
    const scanRes: [string | number, string[]] = await redis.scan(cursor, {
      match: "account:tg_*",
      count: 100,
    });
    cursor = Number(scanRes[0]);
    const keys: string[] = scanRes[1];

    for (const key of keys) {
      scanned++;
      const userId = key.slice("account:".length); // tg_12345
      const tgId = userId.slice("tg_".length);

      const chat = await getChat(tgId);
      if (!chat) {
        skipped++;
        process.stdout.write(".");
        await sleep(30);
        continue;
      }

      await syncTelegramIdentity(userId, {
        username: chat.username,
        first_name: chat.first_name,
        last_name: chat.last_name,
      });
      updated++;
      if (chat.username) withUsername++;
      process.stdout.write(chat.username ? "u" : "+");
      await sleep(50); // ~20 rps
    }

    if (cursor === 0) break;
  }

  console.log("");
  console.log(`Done.`);
  console.log(`  scanned:                ${scanned}`);
  console.log(`  updated:                ${updated}`);
  console.log(`    with_username:        ${withUsername}`);
  console.log(`    without_username:     ${updated - withUsername}`);
  console.log(`  skipped_chat_not_found: ${skipped}`);
  console.log("");
  console.log("Legend: u=identity with @username, +=no username, .=bot never seen user");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

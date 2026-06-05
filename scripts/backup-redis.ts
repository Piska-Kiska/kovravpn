// scripts/backup-redis.ts
/**
 * Full Redis snapshot → JSON on Desktop.
 *
 * SCANs every key, preserves each key's native type and TTL so the dump
 * can be inspected, diffed, or restored selectively. Intended to run
 * before any operation that mutates many keys (mass migration, schema
 * change, bulk profile dedup, etc).
 *
 * Output: ~/Desktop/proxysvpn-backups/redis-<ISO>.json
 *
 * Usage:
 *   cd ~/vpn-project/frontend
 *   [ ! -f .env.local ] && vercel env pull .env.local
 *   npx --yes tsx scripts/backup-redis.ts
 */
import { Redis } from "@upstash/redis";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Minimal .env.local loader — no dotenv dependency. */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawVal.replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(".env.local");

const url =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  console.error(
    "Missing Redis credentials.\n" +
      "Run `vercel env pull .env.local`,\n" +
      "or export UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN."
  );
  process.exit(1);
}

const redis = new Redis({ url, token });

type KeyType = "string" | "list" | "hash" | "set" | "zset";

interface KeyDump {
  type: KeyType;
  ttl: number; // -1 no expire, -2 vanished
  value: unknown;
}

async function dumpKey(key: string): Promise<KeyDump | null> {
  const type = (await redis.type(key)) as KeyType | "none";
  if (type === "none") return null;

  const ttl = await redis.ttl(key);

  switch (type) {
    case "string":
      return { type, ttl, value: await redis.get(key) };
    case "list":
      return { type, ttl, value: await redis.lrange(key, 0, -1) };
    case "hash":
      return { type, ttl, value: await redis.hgetall(key) };
    case "set":
      return { type, ttl, value: await redis.smembers(key) };
    case "zset":
      return {
        type,
        ttl,
        value: await redis.zrange(key, 0, -1, { withScores: true }),
      };
    default:
      return { type, ttl, value: null };
  }
}

async function* scanAll(): AsyncGenerator<string> {
  let cursor: string | number = 0;
  do {
    const [next, keys] = (await redis.scan(cursor, { count: 500 })) as [
      string | number,
      string[],
    ];
    for (const k of keys) yield k;
    cursor = next;
  } while (String(cursor) !== "0");
}

interface Backup {
  exported_at: string;
  redis_host: string;
  key_count: number;
  failed_keys: string[];
  stats: Record<string, number>;
  data: Record<string, KeyDump>;
}

async function main(): Promise<void> {
  const start = Date.now();
  console.log(`→ ${url!.replace(/^(https?:\/\/[^.]+).*/, "$1***")}`);

  const data: Record<string, KeyDump> = {};
  const stats: Record<string, number> = {};
  const failed: string[] = [];
  let count = 0;

  for await (const key of scanAll()) {
    const prefix = key.includes(":") ? key.split(":")[0] : "(none)";
    stats[prefix] = (stats[prefix] ?? 0) + 1;

    try {
      const d = await dumpKey(key);
      if (d) data[key] = d;
    } catch (err) {
      failed.push(key);
      console.error(`  ! ${key}:`, err instanceof Error ? err.message : err);
    }

    count++;
    if (count % 50 === 0) process.stdout.write(`\r  ${count} keys...`);
  }
  process.stdout.write("\r" + " ".repeat(40) + "\r");

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`Scanned ${count} keys in ${elapsed}s`);
  console.log("By prefix:");
  for (const [k, v] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }
  if (failed.length) console.log(`Failed: ${failed.length}`);

  const backup: Backup = {
    exported_at: new Date().toISOString(),
    redis_host: url!.replace(/^(https?:\/\/[^.]+).*/, "$1"),
    key_count: count,
    failed_keys: failed,
    stats,
    data,
  };

  const dir = join(homedir(), "Desktop", "proxysvpn-backups");
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  const file = join(dir, `redis-${ts}.json`);
  const serialized = JSON.stringify(backup, null, 2);
  writeFileSync(file, serialized);

  console.log(`\nSaved: ${file}`);
  console.log(`Size:  ${(serialized.length / 1024).toFixed(1)} KB`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

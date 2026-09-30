// src/lib/bot-v2/gate.ts
//
// Who sees the new bot interface (bot v2: the calm menu, the "Open Kovra"
// Mini App button, localized notifications with buttons).
//
// Owner first: the owner's chat is always in. Everyone else only when
//   • the Redis set `kovra:botv2:users` contains "*" (everyone) or their
//     chat id, or
//   • the environment has KOVRA_BOT_V2_ALL=1.
// Everybody else keeps the old interface, unchanged.
//
// The set lives in Redis, not in an env var, so the owner can widen the
// rollout without a deploy:
//   SADD kovra:botv2:users <chat id>     one person
//   SADD kovra:botv2:users "*"           everyone
//   DEL  kovra:botv2:users               back to the owner only
//
// Never throws: a Redis failure means the old interface, not an error in the
// chat. Answers are cached per process for CACHE_MS, so a change to the set
// takes up to that long to reach a warm function.

import { redis } from "../redis";
import { isAdminChat } from "../bot-owner";

export const BOT_V2_SET = "kovra:botv2:users";
export const BOT_V2_EVERYONE = "*";

const CACHE_MS = 30_000;
const cache = new Map<string, { until: number; on: boolean }>();

/** The environment variables read here (process.env satisfies it). */
export type BotV2GateEnv = Readonly<Record<string, string | undefined>>;

/** KOVRA_BOT_V2_ALL=1 opens the new interface for every chat. */
export function botV2ForAll(env: BotV2GateEnv = process.env): boolean {
  return env.KOVRA_BOT_V2_ALL === "1";
}

function isChatId(v: unknown): v is number | string {
  if (typeof v === "number") return Number.isSafeInteger(v) && v !== 0;
  return typeof v === "string" && /^-?[1-9][0-9]{0,15}$/.test(v);
}

/** Does this Telegram chat get the new bot interface? */
export async function isBotV2(chatId: number | string, env: BotV2GateEnv = process.env): Promise<boolean> {
  if (!isChatId(chatId)) return false;
  if (isAdminChat(chatId)) return true;
  if (botV2ForAll(env)) return true;

  const id = String(chatId);
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && hit.until > now) return hit.on;
  try {
    const [everyone, member] = await redis.smismember(BOT_V2_SET, [BOT_V2_EVERYONE, id]);
    const on = everyone === 1 || member === 1;
    cache.set(id, { until: now + CACHE_MS, on });
    return on;
  } catch (err) {
    console.warn("[bot-v2/gate] set lookup failed, old UI:", err instanceof Error ? err.message : err);
    return hit?.on ?? false;
  }
}

/** Tests and scripts: forget cached answers so a set change applies at once. */
export function resetBotV2Cache(): void {
  cache.clear();
}

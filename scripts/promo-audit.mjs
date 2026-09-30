#!/usr/bin/env node
// scripts/promo-audit.mjs
//
// READ-ONLY. Lists every promo code in `promo:index` with its amount and
// flags the ones a redemption now refuses: amounts above PROMO_MAX_USD
// (lib/promo.ts), most likely codes created as roubles before promo amounts
// were dollars everywhere. Run it before rolling out the web promo form, and
// delete or recreate what it flags (admin bot: /promo_delete, /promo_create).
//
// It never writes: only SMEMBERS and GET.
//
// Usage (the owner, from the repo root):
//   [ ! -f .env.local ] && vercel env pull .env.local
//   node scripts/promo-audit.mjs
//
// Env: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//      (or KV_REST_API_URL + KV_REST_API_TOKEN), read from .env.local too.

import { existsSync, readFileSync } from "node:fs";

/** Keep in sync with PROMO_MAX_USD in src/lib/promo.ts. */
const PROMO_MAX_USD = 50;

function loadEnvFile(path) {
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

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_*).");
  process.exit(1);
}

/** One read-only Upstash REST command. */
async function command(args) {
  const allowed = new Set(["SMEMBERS", "GET"]);
  if (!allowed.has(args[0])) throw new Error(`refusing a non read-only command: ${args[0]}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Upstash ${args[0]} failed: HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`Upstash ${args[0]} failed: ${body.error}`);
  return body.result;
}

function parse(raw) {
  if (typeof raw !== "string") return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const codes = (await command(["SMEMBERS", "promo:index"])) ?? [];
if (codes.length === 0) {
  console.log("promo:index is empty. Nothing to check.");
  process.exit(0);
}

let flagged = 0;
const rows = [];
for (const code of [...codes].sort()) {
  const p = parse(await command(["GET", `promo:${code}`]));
  if (!p || typeof p !== "object") {
    rows.push({ code, amount: "?", uses: "?", expires: "?", verdict: "MISSING RECORD" });
    continue;
  }
  const amount = Number(p.amount);
  const expired = typeof p.expiresAt === "number" && p.expiresAt > 0 && Date.now() > p.expiresAt;
  const over = !Number.isFinite(amount) || amount <= 0 || amount > PROMO_MAX_USD;
  if (over && !expired) flagged += 1;
  rows.push({
    code,
    amount: Number.isFinite(amount) ? `$${amount}` : String(p.amount),
    uses: `${p.usedCount ?? 0}/${p.maxUses || "∞"}`,
    expires: p.expiresAt > 0 ? new Date(p.expiresAt).toISOString().slice(0, 10) : "never",
    verdict: over ? (expired ? "over cap (expired anyway)" : `REFUSED: over $${PROMO_MAX_USD}`) : expired ? "expired" : "ok",
  });
}

console.table(rows);
console.log(
  flagged === 0
    ? `All live codes are within $${PROMO_MAX_USD}.`
    : `${flagged} live code(s) above $${PROMO_MAX_USD}: redemption refuses them. Delete or recreate them in dollars.`,
);

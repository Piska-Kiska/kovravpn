// scripts/backfill-static-panels.ts
// Заливает все существующие UUID профилей на статик-панели (DE/UK).
// Запуск: npx tsx --env-file=.env.local scripts/backfill-static-panels.ts [--dry]
import { redis } from "../src/lib/redis";
import { addClientToStaticPanels } from "../src/lib/kovra-servers-sync";

const dry = process.argv.includes("--dry");

function parseArr(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  return [];
}

const keys = (await redis.keys("profiles:*")) as string[];
console.log(`profile keys: ${keys.length}, dry=${dry}`);
let total = 0, okCnt = 0, failCnt = 0;
for (const key of keys) {
  const userId = key.slice("profiles:".length);
  const profiles = parseArr(await redis.get(key));
  if (profiles.length === 0) continue;
  const accRaw = await redis.get(`account:${userId}`);
  const acc: any = typeof accRaw === "string" ? JSON.parse(accRaw) : (accRaw ?? {});
  const expiry = Number(acc?.paidUntil ?? 0) || 0;
  for (const p of profiles) {
    if (!p?.uuid || !p?.clientEmail) continue;
    total++;
    console.log(`${dry ? "[dry] " : ""}${userId} ${p.uuid} exp=${new Date(expiry).toISOString().slice(0,10)}`);
    if (dry) continue;
    const res = await addClientToStaticPanels({
      uuid: p.uuid, email: p.clientEmail, subId: p.clientEmail, expiryTimeMs: expiry,
    });
    const ok = res.length > 0 && res.every((r) => r.ok);
    ok ? okCnt++ : failCnt++;
    if (!ok) console.error("  FAIL", res);
  }
}
console.log(`done: total=${total} ok=${okCnt} fail=${failCnt}`);

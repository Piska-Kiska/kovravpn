// scripts/backfill-static-panels.ts
// Заливает все существующие UUID профилей на статик-панели (DE/UK).
// Запуск: npx tsx --env-file=.env.local scripts/backfill-static-panels.ts [--dry]
import { redis } from "../src/lib/redis";
import { addClientToStaticPanels } from "../src/lib/kovra-servers-sync";
import { panelSubIdOf } from "../src/lib/panel-sub-id";

async function main() {
const dry = process.argv.includes("--dry");

interface StoredProfile {
  uuid?: string;
  clientEmail?: string;
  panelSubId?: string;
}

function parseArr(raw: unknown): StoredProfile[] {
  if (Array.isArray(raw)) return raw as StoredProfile[];
  if (typeof raw === "string") {
    try { const v: unknown = JSON.parse(raw); return Array.isArray(v) ? (v as StoredProfile[]) : []; } catch { return []; }
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
  const acc = (typeof accRaw === "string" ? JSON.parse(accRaw) : (accRaw ?? {})) as { paidUntil?: unknown };
  const expiry = Number(acc?.paidUntil ?? 0) || 0;
  for (const p of profiles) {
    const uuid = p?.uuid;
    const clientEmail = p?.clientEmail;
    if (!uuid || !clientEmail) continue;
    total++;
    console.log(`${dry ? "[dry] " : ""}${userId} ${uuid} exp=${new Date(expiry).toISOString().slice(0,10)}`);
    if (dry) continue;
    const res = await addClientToStaticPanels({
      uuid, email: clientEmail, subId: panelSubIdOf({ panelSubId: p.panelSubId, clientEmail }), expiryTimeMs: expiry,
    });
    const ok = res.length > 0 && res.every((r) => r.ok);
    if (ok) okCnt++;
    else failCnt++;
    if (!ok) console.error("  FAIL", res);
  }
}
console.log(`done: total=${total} ok=${okCnt} fail=${failCnt}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

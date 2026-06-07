// scripts/grant-sub.ts
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv(file: string) {
  let text: string;
  try { text = readFileSync(resolve(process.cwd(), file), "utf8"); } catch { return; }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const k = m[1];
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

async function main() {
  loadEnv(".env.local");

  const EMAIL = "alesatvitter@gmail.com";

  const { normalizeEmail } = await import("../src/lib/email");
  const { redis } = await import("../src/lib/redis");
  const { resolvePlan, applyPlanPurchase, getSubscriptions, summarize } =
    await import("../src/lib/subscriptions");

  const userId = `em_${normalizeEmail(EMAIL)}`;

  const user = await redis.get(`user:${userId}`);
  if (!user) {
    console.error(`FAIL: account not found at user:${userId} - register ${EMAIL} first`);
    process.exit(1);
  }

  const plan = resolvePlan("plan3", 1);
  if (!plan) { console.error("FAIL: resolvePlan returned null"); process.exit(1); }

  const before = summarize(await getSubscriptions(userId));
  await applyPlanPurchase(userId, plan);
  const after = summarize(await getSubscriptions(userId));

  console.log("userId :", userId);
  console.log("plan   :", plan.kind, plan.term + "mo", plan.slots + " slots", "$" + plan.price);
  console.log("slots  :", before.activeSlots, "->", after.activeSlots);
  console.log("expiry :", new Date(after.maxExpiry).toISOString(), "(" + after.daysRemaining + "d)");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

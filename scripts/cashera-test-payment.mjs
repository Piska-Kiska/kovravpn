// scripts/cashera-test-payment.mjs
// Ops tool: Cashera card payment with custom RUB amount, wired to a REAL
// device add-on order so the production webhook verifies and grants it.
// Usage: node scripts/cashera-test-payment.mjs <prev_tx_uuid> [amount_rub]
import { readFileSync } from "node:fs";

const ENV_FILE = process.env.ENV_FILE || ".env.local";
const API_BASE = "https://api.cashera.cash/api/v1";
const SITE_URL = "https://kovravpn.com";

function loadEnv(path) {
  const out = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = loadEnv(ENV_FILE);
const need = (k) => {
  const v = process.env[k] || env[k];
  if (!v) {
    const parsed = Object.entries(env).map(([n, val]) => (val ? n : n + "(empty)")).sort().join(", ");
    console.error(`missing ${k} in ${ENV_FILE}. Parsed keys: ${parsed || "(none)"}`);
    process.exit(1);
  }
  return v;
};
const REDIS_URL = need("UPSTASH_REDIS_REST_URL").replace(/\/$/, "");
const REDIS_TOKEN = need("UPSTASH_REDIS_REST_TOKEN");
const API_KEY = need("CASHERA_API_KEY");
const METHOD = need("CASHERA_PAYMENT_METHOD");

async function redis(cmd) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(`redis ${cmd[0]}: ${j.error || res.status}`);
  return j.result;
}

const prevUuid = process.argv[2];
const amountRub = Number(process.argv[3] || 220);
if (!prevUuid || !/^[a-zA-Z0-9-]{10,64}$/.test(prevUuid) || !Number.isInteger(amountRub) || amountRub < 100 || amountRub > 1000) {
  console.error("usage: node scripts/cashera-test-payment.mjs <prev_tx_uuid> [amount_rub 100..1000]");
  process.exit(1);
}

const extPrev = await redis(["GET", `cashera_tx:${prevUuid}`]);
if (!extPrev) { console.error("cashera_tx pointer not found (TTL 72h or wrong uuid)"); process.exit(1); }
const orderPrevRaw = await redis(["GET", `cashera_order:${extPrev}`]);
if (!orderPrevRaw) { console.error("previous cashera_order not found"); process.exit(1); }
const { userId } = JSON.parse(orderPrevRaw);

const ratesRes = await fetch(
  `${API_BASE}/integration/rates?payment_method=${METHOD}&currency_from=RUB&currency_to=USDT`,
  { headers: { "X-Api-Key": API_KEY } },
);
const rates = await ratesRes.json();
if (!ratesRes.ok) { console.error("rates:", ratesRes.status, rates); process.exit(1); }
const rubPerUsd = 1 / Number(rates.merchant_rate ?? rates.provider_rate);

const externalId = `dev_${userId}_${Date.now()}`;
const amountMinor = amountRub * 100;
const order = {
  userId,
  kind: "device",
  amountUsd: Math.round((amountRub / rubPerUsd) * 100) / 100,
  amountMinor,
  currency: "RUB",
  rubPerUsd,
  createdAt: Date.now(),
};
await redis(["SET", `cashera_order:${externalId}`, JSON.stringify(order), "EX", "604800"]);

const txRes = await fetch(`${API_BASE}/integration/transactions`, {
  method: "POST",
  headers: { "X-Api-Key": API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    amount: amountMinor,
    currency: "RUB",
    payment_method: METHOD,
    external_id: externalId,
    description: "Kovra +1 device · 30 days",
    callback_url: `${SITE_URL}/api/cashera/webhook`,
    success_url: `${SITE_URL}/dashboard?paid=1`,
    fail_url: `${SITE_URL}/dashboard`,
  }),
});
const tx = await txRes.json();
if (!txRes.ok) { console.error("create:", txRes.status, JSON.stringify(tx)); process.exit(1); }
await redis(["SET", `cashera_tx:${tx.uuid}`, externalId, "EX", "259200"]);
const url = /^https?:/i.test(tx.payment_url) ? tx.payment_url : `https://${tx.payment_url}`;
console.log(JSON.stringify(
  { userId, externalId, uuid: tx.uuid, amountRub, grossEstimateRub: Math.round(amountRub * 1.075), paymentUrl: url },
  null, 2,
));

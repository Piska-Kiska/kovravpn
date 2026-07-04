// src/app/api/freekassa/notify/route.ts
//
// Freekassa notification receiver (subscription model, USD card i=32).
// Выдача идентична крипто-вебхуку: parseSubOrderId -> applyPlanPurchase/
// applyDeviceAddon -> syncAllExpiry -> markTopup -> referral.
// Гейт: SIGN (secret2) + IP FK + atomic dedup. Сумма зафиксирована при
// createOrder и на стороне FK неизменяема, поэтому отдельная сверка суммы не нужна.

import { getUserRecord, markTopup } from '@/lib/accounts';
import {
  parseSubOrderId, resolvePlan, applyPlanPurchase, applyDeviceAddon,
  applyReferralReward, summarize, getSubscriptions,
} from '@/lib/subscriptions';
import { syncAllExpiry } from '@/lib/balance';
import { grantReferralReward } from '@/lib/referrals';
import { reserveDedupKey, releaseDedupKey } from '@/lib/dedup';
import { fetchWithTimeout } from '@/lib/fetch-timeout';
import { getClientIp, isFreekassaIp, verifyNotifySign } from '@/lib/freekassa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHOP_ID = process.env.FREEKASSA_SHOP_ID!;
const SKIP_IP = process.env.FREEKASSA_DISABLE_IP_CHECK === '1';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const DEDUP_TTL_SEC = 90 * 86400;

const ok = (b: string, s = 200) =>
  new Response(b, { status: s, headers: { 'content-type': 'text/plain' } });

function fmtDate(ms: number): string {
  try { return new Date(ms).toISOString().slice(0, 10); } catch { return ''; }
}
async function notifyTelegram(userId: string, message: string): Promise<void> {
  try {
    let chatId: string | null = null;
    if (userId.startsWith('tg_')) chatId = userId.slice(3);
    else { const u = await getUserRecord(userId); if (u?.telegramId) chatId = String(u.telegramId); }
    if (!chatId || !BOT_TOKEN) return;
    await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
      timeoutMs: 5000,
    });
  } catch (err) { console.error('[fk] notifyTelegram error:', err); }
}

export async function GET() { return ok('OK'); }

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  console.log('[fk] POST', { ip, ct: req.headers.get('content-type') });

  let form: FormData;
  try { form = await req.formData(); }
  catch { return ok('OK'); }

  const merchantId = String(form.get('MERCHANT_ID') ?? '');
  const amount = String(form.get('AMOUNT') ?? '');
  const orderId = String(form.get('MERCHANT_ORDER_ID') ?? ''); // = наш paymentId (sub_/dev_)
  const intid = String(form.get('intid') ?? '');
  const curId = String(form.get('CUR_ID') ?? '');
  const sign = String(form.get('SIGN') ?? '');

  if (!merchantId || !sign) return ok('OK');

  if (!SKIP_IP && !isFreekassaIp(ip)) { console.warn('[fk] reject ip', ip); return ok('hacking attempt', 403); }
  if (merchantId !== SHOP_ID) return ok('wrong merchant', 400);
  if (!verifyNotifySign(merchantId, amount, orderId, sign)) {
    console.warn('[fk] bad sign', { orderId, intid }); return ok('wrong sign', 400);
  }

  const parsed = parseSubOrderId(orderId);
  if (!parsed) { console.warn('[fk] non-subscription order_id:', orderId); return ok('YES'); }
  const userId = parsed.userId;
  console.log('[fk] paid', { orderId, intid, amount, curId }); // наблюдаемость: валюта/сумма

  if (!(await reserveDedupKey(`fk_payment_done:${intid}`, DEDUP_TTL_SEC))) return ok('YES');

  try {
    let summaryLine = '';
    if (parsed.type === 'plan') {
      const plan = resolvePlan(parsed.kind, parsed.term);
      if (!plan) return ok('YES');
      await applyPlanPurchase(userId, plan);
      summaryLine = `${parsed.kind === 'plan3' ? '3 devices' : '1 device'} · ${parsed.term} mo`;
    } else {
      await applyDeviceAddon(userId);
      summaryLine = '+1 device · 30 days';
    }

    await syncAllExpiry(userId);
    await markTopup(userId);

    const s = summarize(await getSubscriptions(userId));
    const lines = [
      `✅ <b>Payment received</b>`, ``,
      `🎟 ${summaryLine}`,
      `📱 Active devices: <b>${s.activeSlots}</b>`,
    ];
    if (s.maxExpiry > 0) lines.push(`📅 Active until: <b>${fmtDate(s.maxExpiry)}</b>`);
    await notifyTelegram(userId, lines.join('\n'));

    try {
      const ref = await grantReferralReward(userId);
      if (ref.rewarded && ref.referrerId) {
        await applyReferralReward(ref.referrerId);
        await syncAllExpiry(ref.referrerId);
        await notifyTelegram(ref.referrerId, [
          `🎁 <b>Referral reward!</b>`, ``,
          `Your friend bought a subscription.`,
          `You got <b>+14 days</b> for 1 device.`,
        ].join('\n'));
      }
    } catch (err) { console.error('[fk] referral error:', err); }
  } catch (e) {
    await releaseDedupKey(`fk_payment_done:${intid}`).catch(() => {}); // отпускаем для ретрая FK
    console.error('[fk] activate failed', { orderId, intid }, e);
    return ok('error', 500);
  }

  return ok('YES'); // [факт] FK ждёт ровно YES
}

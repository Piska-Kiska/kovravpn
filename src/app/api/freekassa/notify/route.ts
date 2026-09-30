// src/app/api/freekassa/notify/route.ts
//
// Freekassa notification receiver (subscription model, USD card i=32).
// Выдача идентична крипто-вебхуку: parseSubOrderId -> applyPlanPurchase/
// applyDeviceAddon -> syncAllExpiry -> markTopup -> referral.
// Гейт: SIGN (secret2) + IP FK + atomic dedup по подписанному order id.
// Выдача (stage 1) — единственное, что может вернуть 500 и ретрай; всё после
// неё best-effort, иначе ретрай FK выдаёт второй раз. Сумма зафиксирована при
// createOrder и на стороне FK неизменяема, поэтому отдельная сверка суммы не нужна.

import { markTopup } from '@/lib/accounts';
import {
  parseSubOrderId, resolvePlan, applyPlanPurchase, applyDeviceAddon,
  applyReferralReward, summarize, getSubscriptions,
} from '@/lib/subscriptions';
import { syncAllExpiry } from '@/lib/balance';
import { grantReferralReward } from '@/lib/referrals';
import { reserveDedupKey, releaseDedupKey } from '@/lib/dedup';
import { noticeProductOf, notifyUser } from '@/lib/bot-v2/notify';
import { getClientIp, isFreekassaIp, verifyNotifySign } from '@/lib/freekassa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHOP_ID = process.env.FREEKASSA_SHOP_ID!;
const SKIP_IP = process.env.FREEKASSA_DISABLE_IP_CHECK === '1';
const DEDUP_TTL_SEC = 90 * 86400;

const ok = (b: string, s = 200) =>
  new Response(b, { status: s, headers: { 'content-type': 'text/plain' } });

function fmtDate(ms: number): string {
  try { return new Date(ms).toISOString().slice(0, 10); } catch { return ''; }
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

  // Dedup on the order id: SIGN covers MERCHANT_ORDER_ID, not intid, so a
  // replay of the same signed payment with a new intid used to grant again.
  // Our order ids are unique per payment (sub_/dev_ + timestamp).
  const dedupKey = `fk_payment_done:${orderId}`;
  let reserved: boolean;
  try {
    reserved = await reserveDedupKey(dedupKey, DEDUP_TTL_SEC);
  } catch (e) {
    // Nothing is reserved and nothing granted: FK retries on a non-YES answer.
    console.error('[fk] dedup reserve failed, requesting retry', { orderId, intid }, e);
    return ok('error', 500);
  }
  if (!reserved) return ok('YES');

  // ─── Stage 1: grant (the only retry-safe boundary) ───
  // If this throws, nothing was granted: release the key and answer 500 so
  // FK retries. After it, a retry would grant a second time, so nothing below
  // may release the key or fail the response.
  let summaryLine = '';
  try {
    if (parsed.type === 'plan') {
      const plan = resolvePlan(parsed.kind, parsed.term);
      if (!plan) return ok('YES');
      await applyPlanPurchase(userId, plan);
      summaryLine = `${parsed.kind === 'plan3' ? '3 devices' : '1 device'} · ${parsed.term} mo`;
    } else {
      await applyDeviceAddon(userId);
      summaryLine = '+1 device · 30 days';
    }
  } catch (e) {
    await releaseDedupKey(dedupKey).catch(() => {}); // отпускаем для ретрая FK
    console.error('[fk] grant failed, requesting retry', { orderId, intid }, e);
    return ok('error', 500);
  }

  // ─── Stage 2: sync, notify, referral (best-effort, never retried) ───
  try {
    await syncAllExpiry(userId);
    await markTopup(userId);
  } catch (err) {
    console.error('[fk] granted, but post-grant sync failed', { orderId, intid }, err);
  }

  try {
    const s = summarize(await getSubscriptions(userId));
    const lines = [
      `✅ <b>Payment received</b>`, ``,
      `🎟 ${summaryLine}`,
      `📱 Active devices: <b>${s.activeSlots}</b>`,
    ];
    if (s.maxExpiry > 0) lines.push(`📅 Active until: <b>${fmtDate(s.maxExpiry)}</b>`);
    await notifyUser(
      userId,
      { kind: 'purchase', product: noticeProductOf(parsed), activeSlots: s.activeSlots, untilMs: s.maxExpiry },
      lines.join('\n'),
    );
  } catch (err) { console.error('[fk] notify error:', err); }

  try {
    const ref = await grantReferralReward(userId);
    if (ref.rewarded && ref.referrerId) {
      await applyReferralReward(ref.referrerId);
      await syncAllExpiry(ref.referrerId);
      await notifyUser(ref.referrerId, { kind: 'referral_reward' }, [
        `🎁 <b>Referral reward!</b>`, ``,
        `Your friend bought a subscription.`,
        `You got <b>+14 days</b> for 1 device.`,
      ].join('\n'));
    }
  } catch (err) { console.error('[fk] referral error:', err); }

  return ok('YES'); // [факт] FK ждёт ровно YES
}

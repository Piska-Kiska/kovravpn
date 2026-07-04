// src/lib/freekassa.ts
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { redis } from '@/lib/redis';
import {
  buildPlanOrderId, buildDeviceOrderId, resolvePlan,
  DEVICE_ADDON_PRICE, type PlanKind, type Term,
} from '@/lib/subscriptions';

const SHOP_ID = process.env.FREEKASSA_SHOP_ID!;
const SECRET2 = process.env.FREEKASSA_SECRET2!;
const API_KEY = process.env.FREEKASSA_API_KEY!;
const FALLBACK_IP = process.env.FREEKASSA_FALLBACK_IP || '';

const API_BASE = 'https://api.fk.life/v1';
const CARD_USD = 32; // [факт: скрин «Валюты к приёму»] VISA/MasterCard USD, ID 32

// [факт: docs.freekassa.net] IP отправителя уведомлений
export const FK_IPS = new Set([
  '168.119.157.136', '168.119.60.227', '178.154.197.79', '51.250.54.238',
]);

const md5 = (s: string) => createHash('md5').update(s).digest('hex');
function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ───────── webhook helpers ─────────
export function getClientIp(h: Headers): string {
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    (h.get('x-forwarded-for') ?? '').split(',')[0] ||
    ''
  ).trim();
}
export const isFreekassaIp = (ip: string) => FK_IPS.has(ip);

// [факт: docs 1.7] md5(MERCHANT_ID:AMOUNT:secret2:MERCHANT_ORDER_ID)
export function verifyNotifySign(
  merchantId: string, amount: string, orderId: string, sign: string,
): boolean {
  const expected = md5(`${merchantId}:${amount}:${SECRET2}:${orderId}`);
  return safeEq(expected.toLowerCase(), (sign || '').toLowerCase());
}

// ───────── API ─────────
// [факт: docs 2.2] signature = hmac_sha256(values_sorted_by_key.join('|'), apiKey)
function signApi(params: Record<string, string | number>): string {
  const str = Object.keys(params).sort().map((k) => String(params[k])).join('|');
  return createHmac('sha256', API_KEY).update(str).digest('hex');
}

async function nextNonce(): Promise<number> {
  const n = await redis.incr('fk:nonce');
  if (n === 1) { await redis.set('fk:nonce', Date.now()); return redis.incr('fk:nonce'); }
  return n;
}

async function fkApi<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const body = JSON.stringify({ ...params, signature: signApi(params) });
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body, signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json()) as any;
  if (!res.ok || json?.type !== 'success') {
    throw new Error(`fk ${path} ${res.status}: ${JSON.stringify(json)}`);
  }
  return json as T;
}

// [факт: docs createOrder] POST /orders/create -> { location }
async function createOrder(p: {
  paymentId: string; email: string; ip: string; amount: string;
}): Promise<{ orderId: number; location: string }> {
  const params = {
    shopId: Number(SHOP_ID), nonce: await nextNonce(),
    paymentId: p.paymentId, i: CARD_USD, email: p.email, ip: p.ip,
    amount: p.amount, currency: 'USD',
  };
  const r = await fkApi<{ orderId: number; location: string }>('/orders/create', params);
  return { orderId: r.orderId, location: r.location };
}

// order_id совместим с parseSubOrderId — план зашит в id, отдельного стораджа не нужно.
// Сумма фиксируется здесь (USD), на хостед-странице FK её изменить нельзя.
async function start(p: {
  userId: string; paymentId: string; usd: number; email?: string; clientIp?: string;
}): Promise<{ location: string; orderId: number; paymentId: string; amountUsd: string }> {
  const ip = p.clientIp || FALLBACK_IP;
  if (!ip || ip === '127.0.0.1') {
    throw new Error('FK: нужен публичный IP (127.0.0.1 блокируется). Задай FREEKASSA_FALLBACK_IP');
  }
  const tgId = p.userId.startsWith('tg_') ? p.userId.slice(3) : p.userId;
  const email = p.email || `${tgId}@telegram.org`;
  const amount = p.usd.toFixed(2);
  const { orderId, location } = await createOrder({ paymentId: p.paymentId, email, ip, amount });
  return { location, orderId, paymentId: p.paymentId, amountUsd: amount };
}

export async function createPlanPayment(opts: {
  userId: string; kind: PlanKind; term: Term; email?: string; clientIp?: string;
}): Promise<{ location: string; orderId: number; paymentId: string; amountUsd: string }> {
  const plan = resolvePlan(opts.kind, opts.term);
  if (!plan) throw new Error(`FK: bad plan ${opts.kind}/${opts.term}`);
  return start({
    userId: opts.userId,
    paymentId: buildPlanOrderId(opts.userId, opts.kind, opts.term),
    usd: plan.price, email: opts.email, clientIp: opts.clientIp,
  });
}

export async function createDevicePayment(opts: {
  userId: string; email?: string; clientIp?: string;
}): Promise<{ location: string; orderId: number; paymentId: string; amountUsd: string }> {
  return start({
    userId: opts.userId,
    paymentId: buildDeviceOrderId(opts.userId),
    usd: DEVICE_ADDON_PRICE, email: opts.email, clientIp: opts.clientIp,
  });
}

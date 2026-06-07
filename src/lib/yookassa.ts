// src/lib/yookassa.ts
import { randomUUID } from "crypto";

const SHOP_ID = process.env.YOOKASSA_SHOP_ID || "";
const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://proxysvpn.com";

export interface PaymentPlan {
  id: string;
  name: string;
  price: number;       // total price in RUB
  months: number;
  monthlyPrice: number;
}

export const PLANS: Record<string, PaymentPlan> = {
  base: { id: "base", name: "Базовый", price: 250, months: 1, monthlyPrice: 250 },
  optimal: { id: "optimal", name: "Оптимальный", price: 1140, months: 6, monthlyPrice: 190 },
  max: { id: "max", name: "Максимальный", price: 1788, months: 12, monthlyPrice: 149 },
};

interface CreatePaymentParams {
  userId: string;
  planId: string;
  email?: string;
}

interface YooPayment {
  id: string;
  status: string;
  confirmation?: {
    type: string;
    confirmation_url: string;
  };
}

export async function createPayment(params: CreatePaymentParams): Promise<{ paymentUrl: string; paymentId: string }> {
  const plan = PLANS[params.planId];
  if (!plan) throw new Error(`Unknown plan: ${params.planId}`);

  const idempotenceKey = randomUUID();

  const body = {
    amount: {
      value: plan.price.toFixed(2),
      currency: "RUB",
    },
    confirmation: {
      type: "redirect",
      return_url: `${SITE_URL}/dashboard?paid=1`,
    },
    capture: true,
    description: `Kovra — тариф «${plan.name}» (${plan.months} мес.)`,
    metadata: {
      userId: params.userId,
      planId: params.planId,
      months: plan.months,
    },
    receipt: {
      customer: { email: params.email || "noreply@kovravpn.com" },
      items: [{
        description: `Подписка «${plan.name}» — ${plan.months} мес.`,
        amount: { value: plan.price.toFixed(2), currency: "RUB" },
        vat_code: 1,
        quantity: "1",
        payment_subject: "service",
        payment_mode: "full_payment",
      }],
    },
  };

  const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString("base64");

  const res = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`YooKassa error ${res.status}: ${errText}`);
  }

  const payment: YooPayment = await res.json();

  if (!payment.confirmation?.confirmation_url) {
    throw new Error("No confirmation URL in response");
  }

  return {
    paymentUrl: payment.confirmation.confirmation_url,
    paymentId: payment.id,
  };
}

/** Verify webhook signature (IP-based for YooKassa, or check payment status) */
export async function getPayment(paymentId: string): Promise<{ status: string; metadata: Record<string, string> }> {
  const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString("base64");

  const res = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    headers: { "Authorization": `Basic ${auth}` },
  });

  if (!res.ok) throw new Error(`YooKassa fetch error: ${res.status}`);

  const data = await res.json();
  return { status: data.status, metadata: data.metadata || {} };
}

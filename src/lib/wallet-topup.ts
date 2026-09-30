// src/lib/wallet-topup.ts
//
// Top up the prepaid USD wallet: create the same invoices the bot creates,
// for the bot, the web cabinet and the Mini App alike. Every invoice carries a
// `topup_<userId>_<ts>` order id (lib/bot-wallet.ts), and the payment
// webhooks credit `balance_usd:{userId}` from it — whoever created it.
//
// Only the RETURN address depends on where the person started:
//   bot     — back to the bot chat (the old bot behaviour);
//   web     — /dashboard?paid=1 on the site;
//   miniapp — https://t.me/<bot>?startapp=paid, which reopens the Mini App
//             with start_param "paid" (a site URL would open the external
//             browser, where the person is not signed in).

import { buildTopupOrderId, usdToCents } from "./bot-wallet";
import { createCryptoBotInvoice, cryptoBotConfigured } from "./cryptobot";
import { cardPaymentsEnabled, createCardPayment } from "./cashera-order";
import { createInvoice as createNowPaymentsInvoice, nowPaymentsConfigured } from "./nowpayments";
import { createInvoice as createLavaInvoice, lavaConfigured, rememberContract } from "./lava";
import { LAVA_MIN_AMOUNT, lavaMethodChoices, lavaMethod, type LavaCurrency, type LavaMethodId } from "./lava-methods";
import { chargeIn, formatCharge } from "./lava-price";
import { rememberCharge } from "./lava-purchase";
import { botChatUrl, miniAppUrl } from "./bot-link";

export type TopupMethod = "card" | "cryptobot" | "crypto" | "lava";
export type TopupReturn = "bot" | "web" | "miniapp";

export const TOPUP_METHODS: readonly TopupMethod[] = ["card", "cryptobot", "crypto", "lava"];

export const MIN_TOPUP_CRYPTOBOT_USD = 5;
export const MIN_TOPUP_NOWPAY_USD = 8;
export const MIN_TOPUP_CARD_USD = 5;
/** lava.top's own floor: it refuses smaller invoices (measured, see LAVA_MIN_AMOUNT). */
export const MIN_TOPUP_LAVA_USD = LAVA_MIN_AMOUNT.USD;
export const MAX_TOPUP_USD = 1000;
export const QUICK_TOPUP_USD: readonly number[] = [10, 20, 50, 100];

export function isTopupMethod(v: unknown): v is TopupMethod {
  return typeof v === "string" && (TOPUP_METHODS as readonly string[]).includes(v);
}

export function minTopupUsd(method: TopupMethod): number {
  if (method === "lava") return MIN_TOPUP_LAVA_USD;
  if (method === "card") return MIN_TOPUP_CARD_USD;
  return method === "cryptobot" ? MIN_TOPUP_CRYPTOBOT_USD : MIN_TOPUP_NOWPAY_USD;
}

/** Is the payment line configured on this deployment? */
export function topupMethodEnabled(method: TopupMethod): boolean {
  if (method === "card") return cardPaymentsEnabled();
  if (method === "cryptobot") return cryptoBotConfigured();
  if (method === "crypto") return nowPaymentsConfigured();
  return lavaConfigured;
}

export interface TopupMethodInfo {
  id: TopupMethod;
  minUsd: number;
  enabled: boolean;
}

export interface WalletTopupConfig {
  methods: TopupMethodInfo[];
  maxUsd: number;
  quickUsd: readonly number[];
}

/** What the cabinet needs to draw the top-up form. No secrets, only flags. */
export function walletTopupConfig(): WalletTopupConfig {
  return {
    methods: TOPUP_METHODS.map((id) => ({ id, minUsd: minTopupUsd(id), enabled: topupMethodEnabled(id) })),
    maxUsd: MAX_TOPUP_USD,
    quickUsd: QUICK_TOPUP_USD,
  };
}

/**
 * lava.top methods offered for a top-up of `amountUsd`: those that take the
 * amount and need nothing but an e-mail (Bancontact needs the full name).
 * `preferred` picks USD or EUR for methods that take both.
 */
export function lavaTopupChoices(
  amountUsd: number,
  preferred: LavaCurrency = "USD",
): readonly { readonly id: LavaMethodId; readonly currency: LavaCurrency }[] {
  return lavaMethodChoices(preferred, (c) => chargeIn(amountUsd, c)).filter(
    (c) => lavaMethod(c.id)?.needsFullName !== true,
  );
}

/** Where the provider sends the person back. `null` = the helper's bot default. */
export function topupReturnUrls(
  returnTo: TopupReturn,
  siteUrl: string,
): { success: string; fail: string } | null {
  if (returnTo === "web") return { success: `${siteUrl}/dashboard?paid=1`, fail: `${siteUrl}/dashboard` };
  if (returnTo === "miniapp") return { success: miniAppUrl("paid"), fail: miniAppUrl() };
  return null;
}

export interface WalletTopupInput {
  userId: string;
  method: TopupMethod;
  amountUsd: number;
  returnTo: TopupReturn;
  /** lava.top only: the payment method; defaults to the card. */
  lavaMethodId?: LavaMethodId;
  /** lava.top only: USD (default) or EUR for methods that take both. */
  lavaCurrency?: LavaCurrency;
  /** Bot/UI language, for the lava.top payment page. */
  locale?: string;
}

export type WalletTopupResult =
  | {
      ok: true;
      method: TopupMethod;
      /** The invoice amount in USD, rounded to cents. */
      amountUsd: number;
      amountCents: number;
      payUrl: string;
      /** What the provider will actually charge, e.g. "€9.20" (lava.top EUR). */
      chargeLabel: string;
    }
  | { ok: false; error: "invalid_method" | "invalid_amount"; minUsd?: number; maxUsd?: number }
  | { ok: false; error: "unavailable" | "provider_error" };

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://kovravpn.com").replace(/\/$/, "");
}

/**
 * Create a top-up invoice. Never throws: a provider failure is
 * `provider_error` (logged), a line without keys is `unavailable`.
 */
export async function createWalletTopupInvoice(input: WalletTopupInput): Promise<WalletTopupResult> {
  const { userId, method, returnTo } = input;
  if (!isTopupMethod(method)) return { ok: false, error: "invalid_method" };
  if (typeof userId !== "string" || userId.length === 0 || userId.length > 200) {
    return { ok: false, error: "invalid_method" };
  }

  const min = minTopupUsd(method);
  const cents = typeof input.amountUsd === "number" ? usdToCents(input.amountUsd) : null;
  const amountUsd = cents === null ? NaN : cents / 100;
  if (cents === null || amountUsd < min || amountUsd > MAX_TOPUP_USD) {
    return { ok: false, error: "invalid_amount", minUsd: min, maxUsd: MAX_TOPUP_USD };
  }
  if (!topupMethodEnabled(method)) return { ok: false, error: "unavailable" };

  const site = siteUrl();
  const back = topupReturnUrls(returnTo, site);
  const source: "bot" | "web" = returnTo === "bot" ? "bot" : "web";

  try {
    if (method === "cryptobot") {
      const inv = await createCryptoBotInvoice({
        userId,
        amountUsd,
        source,
        ...(back ? { paidBtnUrl: back.success } : {}),
      });
      return ok(method, amountUsd, cents, inv.payUrl, `$${amountUsd.toFixed(2)}`);
    }

    if (method === "card") {
      const res = await createCardPayment(userId, { type: "topup", amountUsd }, source, back ?? undefined);
      return ok(method, amountUsd, cents, res.paymentUrl, `$${amountUsd.toFixed(2)}`);
    }

    if (method === "crypto") {
      const orderId = buildTopupOrderId(userId);
      const inv = await createNowPaymentsInvoice({
        orderId,
        amountUsd,
        description: `Kovra top-up $${amountUsd.toFixed(2)}`,
        source,
        ...(back ? { successUrl: back.success, cancelUrl: back.fail } : {}),
      });
      return ok(method, amountUsd, cents, inv.invoiceUrl, `$${amountUsd.toFixed(2)}`);
    }

    // lava.top: one method per invoice, chosen before the redirect.
    const methodId: LavaMethodId = input.lavaMethodId ?? "card";
    const preferred: LavaCurrency = input.lavaCurrency === "EUR" ? "EUR" : "USD";
    const choice = lavaTopupChoices(amountUsd, preferred).find((c) => c.id === methodId);
    if (!choice) return { ok: false, error: "invalid_method" };
    const charge = chargeIn(amountUsd, choice.currency);
    const topupId = buildTopupOrderId(userId);
    const lavaBack = back ?? { success: botChatUrl("paid"), fail: botChatUrl() };
    const invoice = await createLavaInvoice({
      orderId: topupId,
      amount: charge,
      currency: choice.currency,
      methodId: choice.id,
      locale: input.locale ?? "en",
      successUrl: lavaBack.success,
      failUrl: lavaBack.fail,
    });
    // The pointer and the expected charge are stored BEFORE the link goes
    // out: lava's event does not carry our order id, and without these the
    // webhook would have nothing to credit.
    await rememberContract(invoice.contractId, topupId);
    await rememberCharge(invoice.contractId, {
      orderId: topupId,
      userId,
      currency: choice.currency,
      amount: charge,
      priceUsd: amountUsd,
      label: `wallet top-up $${amountUsd.toFixed(2)}`,
      createdAt: Date.now(),
    });
    return ok(method, amountUsd, cents, invoice.paymentUrl, formatCharge(amountUsd, choice.currency));
  } catch (err) {
    console.error(`[wallet-topup] ${method} invoice failed:`, err instanceof Error ? err.message : err);
    return { ok: false, error: "provider_error" };
  }
}

function ok(
  method: TopupMethod,
  amountUsd: number,
  amountCents: number,
  payUrl: string,
  chargeLabel: string,
): WalletTopupResult {
  if (!/^https:\/\//.test(payUrl)) throw new Error("provider returned a non-https payment URL");
  return { ok: true, method, amountUsd, amountCents, payUrl, chargeLabel };
}

// src/lib/dashboard/pay-methods.ts
// Catalog of payment methods for the plan checkout, the extra-slot dialog
// (spec §9.5) and the balance top-up. The UI shows one radio list; the single
// CTA dispatches the selected route to the handler in
// src/components/dashboard/DashboardView.tsx.
//
// "Balance" (the unified wallet shared with the Telegram bot) is the first
// row whenever the balance is above zero; it is chosen by default when it
// covers the price ("pay from balance" in one tap), and shown disabled with
// the missing amount when it does not.
import { Coins, CreditCard, Landmark, QrCode, Send, Smartphone, Wallet, WalletMinimal, type LucideIcon } from "lucide-react";
import type { Lang } from "@/i18n/dict";
import { fmt } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { lavaMethodChoices, type LavaCurrency, type LavaMethodId } from "@/lib/lava-methods";
import { chargeIn } from "@/lib/lava-price";
import { fmtMoney } from "@/lib/dashboard/format";

export const PAY_METHOD_STORAGE_KEY = "kovra_pay_method";

export type PayRoute =
  | { kind: "wallet" }
  | { kind: "platega" }
  | { kind: "cashera" }
  | { kind: "nowpayments" }
  | { kind: "lava"; id: LavaMethodId; currency: LavaCurrency };

/** Top-up lines of POST /api/wallet/topup (lib/wallet-topup.ts). */
export type TopupRoute =
  | { kind: "card" }
  | { kind: "cryptobot" }
  | { kind: "crypto" }
  | { kind: "lava"; id: LavaMethodId; currency: LavaCurrency };

export interface PayOption<R extends { kind: string } = PayRoute> {
  /** Stable id, also what is remembered in localStorage: "platega", "lava:paypal"… */
  key: string;
  route: R;
  icon: LucideIcon;
  label: string;
  sub: string;
  /** Exact charge in the invoice currency (lava rows only). */
  amount?: string;
  /** Accessible wording of the amount ("Charged €10.12"). */
  amountLabel?: string;
  /** Fine print under the CTA while this method is selected. */
  note: string;
  group: "primary" | "more";
  /** Shown but not selectable (the balance that does not cover the price). */
  disabled?: boolean;
}

/** The wallet as the checkout sees it, in integer cents. */
export interface WalletView {
  balanceCents: number;
  /** Price of what is being bought; null while unknown. */
  priceCents: number | null;
}

/**
 * Способы lava.top на кнопках: ключ подписи в словаре.
 *
 * Bancontact сюда НЕ входит намеренно: он один требует имя покупателя в
 * запросе, а спрашивать имя ради одного бельгийского способа значит удлинить
 * форму всем остальным.
 */
const LAVA_LABEL: Partial<Record<LavaMethodId, keyof DashDict>> = {
  card: "m_lava_card",
  paypal: "m_paypal",
  applepay: "m_applepay",
  pix: "m_pix",
  sepa: "m_sepa",
  ideal: "m_ideal",
  mbway: "m_mbway",
};

const LAVA_ICON: Partial<Record<LavaMethodId, LucideIcon>> = {
  card: CreditCard,
  paypal: Wallet,
  applepay: Wallet,
  pix: QrCode,
  sepa: Landmark,
  ideal: Landmark,
  mbway: Smartphone,
};

/** Order of the lava rows inside "More ways to pay" (PayPal is primary). */
const LAVA_MORE_ORDER: readonly LavaMethodId[] = ["applepay", "card", "sepa", "ideal", "mbway", "pix"];

/**
 * Какие способы показать для этой суммы.
 *
 * Фильтр по нижнему порогу делает сам каталог: лава счета ниже $5 и €5.5 не
 * выставляет, и показанная кнопка довела бы человека до отказа уже после
 * нажатия. Поэтому на месячном тарифе за $5 евровые способы честно исчезают.
 */
export function lavaChips(priceUsd: number | undefined, enabled: boolean | undefined) {
  // Линия без ключей не показывается вовсе: иначе каждое нажатие возвращало бы
  // отказ, и покупатель решил бы, что сломан платёж, а не выключена настройка.
  if (enabled !== true) return [];
  if (typeof priceUsd !== "number" || !Number.isFinite(priceUsd)) return [];
  return lavaMethodChoices("USD", (c) => chargeIn(priceUsd, c)).filter(
    (c) => LAVA_LABEL[c.id] !== undefined,
  );
}

function str(t: DashDict, key: keyof DashDict): string {
  const v = t[key];
  return typeof v === "string" ? v : v.other;
}

export function buildPayOptions(a: {
  lang: Lang;
  t: DashDict;
  priceUsd: number | undefined;
  lavaEnabled: boolean | undefined;
  /** The unified balance; null or 0 cents hides the row. */
  wallet?: WalletView | null;
}): PayOption[] {
  const { lang, t, priceUsd, lavaEnabled, wallet } = a;
  const chips = lavaChips(priceUsd, lavaEnabled);

  const lava = (id: LavaMethodId, group: PayOption["group"]): PayOption | null => {
    const c = chips.find((x) => x.id === id);
    const labelKey = LAVA_LABEL[id];
    if (!c || !labelKey || typeof priceUsd !== "number") return null;
    const amount = fmtMoney(chargeIn(priceUsd, c.currency), c.currency, lang);
    return {
      key: `lava:${id}`,
      route: { kind: "lava", id, currency: c.currency },
      icon: LAVA_ICON[id] ?? CreditCard,
      label: str(t, labelKey),
      sub: id === "card" ? fmt(t.m_lava_card_sub, { currency: c.currency }) : "",
      amount,
      amountLabel: fmt(t.m_lava_sub, { amount }),
      note: fmt(t.m_lava_note, { amount }),
      group,
    };
  };

  const platega: PayOption = { key: "platega", route: { kind: "platega" }, icon: CreditCard, label: t.m_card, sub: t.m_card_sub, note: t.m_card_note, group: "primary" };
  const crypto: PayOption = { key: "nowpayments", route: { kind: "nowpayments" }, icon: Coins, label: t.m_crypto, sub: t.m_crypto_sub, note: t.m_crypto_note, group: "primary" };
  const ruCard = lang === "ru";
  const cashera: PayOption = {
    key: "cashera",
    route: { kind: "cashera" },
    icon: CreditCard,
    label: t.m_card_rub,
    sub: t.m_card_rub_sub,
    note: t.m_card_rub_note,
    group: ruCard ? "primary" : "more",
  };

  const out: PayOption[] = [];
  if (wallet && wallet.balanceCents > 0) {
    const balance = fmtMoney(wallet.balanceCents / 100, "USD", lang);
    const covers = wallet.priceCents !== null && wallet.priceCents > 0 && wallet.balanceCents >= wallet.priceCents;
    const need = wallet.priceCents !== null ? Math.max(0, wallet.priceCents - wallet.balanceCents) : 0;
    out.push({
      key: WALLET_KEY,
      route: { kind: "wallet" },
      icon: WalletMinimal,
      label: t.m_wallet,
      sub: covers ? fmt(t.m_wallet_sub, { balance }) : fmt(t.m_wallet_short, { balance, need: fmtMoney(need / 100, "USD", lang) }),
      note: t.m_wallet_note,
      group: "primary",
      disabled: !covers,
    });
  }
  out.push(platega);
  if (ruCard) out.push(cashera);
  const paypal = lava("paypal", "primary");
  if (paypal) out.push(paypal);
  out.push(crypto);
  for (const id of LAVA_MORE_ORDER) {
    const o = lava(id, "more");
    if (o) out.push(o);
  }
  if (!ruCard) out.push(cashera);
  return out;
}

/** Remembered method key, or null (storage empty or blocked). */
export function readPayMethod(): string | null {
  try {
    return window.localStorage.getItem(PAY_METHOD_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Key of the "Balance" row. Never remembered: it is the default whenever it covers the price. */
export const WALLET_KEY = "wallet";

function selectable(options: readonly PayOption<{ kind: string }>[], key: string | null): key is string {
  return key !== null && options.some((o) => o.key === key && !o.disabled);
}

/**
 * The method the checkout starts on:
 *   1. the one picked on this page view, while it is offered and selectable;
 *   2. the balance, when it covers the price (one tap);
 *   3. the one remembered from earlier visits;
 *   4. the first selectable option.
 */
export function choosePayKey(options: readonly PayOption<{ kind: string }>[], picked: string | null, remembered: string | null): string {
  if (selectable(options, picked)) return picked;
  if (selectable(options, WALLET_KEY)) return WALLET_KEY;
  if (selectable(options, remembered)) return remembered;
  return options.find((o) => !o.disabled)?.key ?? options[0]?.key ?? "platega";
}

export function writePayMethod(key: string): void {
  if (key === WALLET_KEY) return;
  try {
    window.localStorage.setItem(PAY_METHOD_STORAGE_KEY, key);
  } catch {
    // Storage blocked: the choice still applies for this visit.
  }
}

/** The top-up lines as /api/wallet (topup.methods) reports them. */
export interface TopupMethodInfo {
  id: "card" | "cryptobot" | "crypto" | "lava";
  minUsd: number;
  enabled: boolean;
}

/**
 * Methods of the top-up sheet for `amountUsd`: the lines that are configured
 * here, lava.top rows that take the amount, in the order a person of this
 * language expects (ru: rubles first; everyone else: card and PayPal).
 */
export function buildTopupOptions(a: {
  lang: Lang;
  t: DashDict;
  amountUsd: number | undefined;
  methods: readonly TopupMethodInfo[];
}): PayOption<TopupRoute>[] {
  const { lang, t, amountUsd, methods } = a;
  const on = (id: TopupMethodInfo["id"]) => methods.some((m) => m.id === id && m.enabled);
  const ru = lang === "ru";

  const chips = on("lava") ? lavaChips(amountUsd, true) : [];
  const lava = (id: LavaMethodId, group: PayOption["group"]): PayOption<TopupRoute> | null => {
    const c = chips.find((x) => x.id === id);
    const labelKey = LAVA_LABEL[id];
    if (!c || !labelKey || typeof amountUsd !== "number") return null;
    const amount = fmtMoney(chargeIn(amountUsd, c.currency), c.currency, lang);
    return {
      key: `lava:${id}`,
      route: { kind: "lava", id, currency: c.currency },
      icon: LAVA_ICON[id] ?? CreditCard,
      label: str(t, labelKey),
      sub: id === "card" ? fmt(t.m_lava_card_sub, { currency: c.currency }) : "",
      amount,
      amountLabel: fmt(t.m_lava_sub, { amount }),
      note: fmt(t.m_lava_note, { amount }),
      group,
    };
  };

  const rub: PayOption<TopupRoute> | null = on("card")
    ? { key: "card", route: { kind: "card" }, icon: CreditCard, label: t.m_card_rub, sub: t.m_card_rub_sub, note: t.m_card_rub_note, group: ru ? "primary" : "more" }
    : null;
  const cryptobot: PayOption<TopupRoute> | null = on("cryptobot")
    ? { key: "cryptobot", route: { kind: "cryptobot" }, icon: Send, label: t.m_cryptobot, sub: t.m_cryptobot_sub, note: t.m_cryptobot_note, group: "primary" }
    : null;
  const crypto: PayOption<TopupRoute> | null = on("crypto")
    ? { key: "crypto", route: { kind: "crypto" }, icon: Coins, label: t.m_crypto, sub: t.m_crypto_sub, note: t.m_crypto_topup_note, group: "primary" }
    : null;

  const out: Array<PayOption<TopupRoute> | null> = ru
    ? [rub, cryptobot, crypto, lava("card", "more"), lava("paypal", "more"), ...LAVA_MORE_ORDER.filter((id) => id !== "card").map((id) => lava(id, "more"))]
    : [lava("card", "primary"), lava("paypal", "primary"), cryptobot, crypto, ...LAVA_MORE_ORDER.filter((id) => id !== "card").map((id) => lava(id, "more")), rub];
  return out.filter((o): o is PayOption<TopupRoute> => o !== null);
}

/** Minimum of the line behind a top-up option, in USD. */
export function topupMinUsd(route: TopupRoute, methods: readonly TopupMethodInfo[]): number {
  const id: TopupMethodInfo["id"] = route.kind;
  return methods.find((m) => m.id === id)?.minUsd ?? 5;
}

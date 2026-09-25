// src/lib/dashboard/pay-methods.ts
// Catalog of payment methods for the plan checkout and the extra-slot dialog
// (spec §9.5). The UI shows one radio list; the single CTA dispatches the
// selected route to the existing handler in src/app/dashboard/page.tsx.
import { Coins, CreditCard, Landmark, QrCode, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import type { Lang } from "@/i18n/dict";
import { fmt } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { lavaMethodChoices, type LavaCurrency, type LavaMethodId } from "@/lib/lava-methods";
import { chargeIn } from "@/lib/lava-price";
import { fmtMoney } from "@/lib/dashboard/format";

export const PAY_METHOD_STORAGE_KEY = "kovra_pay_method";

export type PayRoute =
  | { kind: "platega" }
  | { kind: "cashera" }
  | { kind: "nowpayments" }
  | { kind: "lava"; id: LavaMethodId; currency: LavaCurrency };

export interface PayOption {
  /** Stable id, also what is remembered in localStorage: "platega", "lava:paypal"… */
  key: string;
  route: PayRoute;
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

export function buildPayOptions(a: { lang: Lang; t: DashDict; priceUsd: number | undefined; lavaEnabled: boolean | undefined }): PayOption[] {
  const { lang, t, priceUsd, lavaEnabled } = a;
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

  const out: PayOption[] = [platega];
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

/** The preferred key if `options` offers it, otherwise "platega" (always offered). */
export function effectivePayMethod(options: readonly PayOption[], preferred: string | null): string {
  return preferred && options.some((o) => o.key === preferred) ? preferred : "platega";
}

export function writePayMethod(key: string): void {
  try {
    window.localStorage.setItem(PAY_METHOD_STORAGE_KEY, key);
  } catch {
    // Storage blocked: the choice still applies for this visit.
  }
}

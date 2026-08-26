// src/lib/lava-purchase.ts
//
// Что покупается через lava.top и сколько это стоит В ВАЛЮТЕ СЧЁТА.
//
// Отдельным файлом, потому что знание нужно ОБОИМ концам денежного пути: ручке,
// которая выставляет счёт, и вебхуку, который проверяет пришедшую сумму.
// Посчитай их порознь — и однажды они разойдутся; разойдутся, разумеется, на
// платеже, который придётся возвращать.

import { redis } from "./redis";
import { lavaTakesAmount, type LavaCurrency } from "./lava-methods";
import { chargeIn } from "./lava-price";
import {
  DEVICE_ADDON_DAYS,
  DEVICE_ADDON_PRICE,
  buildDeviceOrderId,
  buildPlanOrderId,
  resolvePlan,
  type PlanKind,
  type Term,
} from "./subscriptions";

// Расчёт суммы живёт в отдельном файле без единого импорта наружу: тот же
// расчёт нужен кнопке на панели, а этот модуль тянет redis.
export { EUR_PER_USD, chargeIn } from "./lava-price";

export type LavaPurchase =
  | { readonly what: "plan"; readonly kind: PlanKind; readonly term: Term }
  | { readonly what: "device" };

export interface ResolvedPurchase {
  /** Наш идентификатор покупки: `sub_…` или `dev_…`, тот же, что у крипты. */
  readonly orderId: string;
  readonly priceUsd: number;
  readonly label: string;
  readonly slots: number;
  readonly days: number;
}

/** Разобрать запрос покупки. `null` — запрошено то, чего в прайсе нет. */
export function resolvePurchase(
  userId: string,
  body: { what?: unknown; kind?: unknown; term?: unknown },
): ResolvedPurchase | null {
  if (body.what === "device") {
    return {
      orderId: buildDeviceOrderId(userId),
      priceUsd: DEVICE_ADDON_PRICE,
      label: `+1 device · ${DEVICE_ADDON_DAYS} days`,
      slots: 1,
      days: DEVICE_ADDON_DAYS,
    };
  }
  const plan = resolvePlan(String(body.kind), Number(body.term));
  if (plan === null) return null;
  return {
    orderId: buildPlanOrderId(userId, plan.kind, plan.term),
    priceUsd: plan.price,
    label: `${plan.kind === "plan3" ? "3 devices" : "1 device"} · ${plan.term} mo`,
    slots: plan.slots,
    days: plan.days,
  };
}

/**
 * Цена покупки в долларах ПО ЕЁ ИДЕНТИФИКАТОРУ — для вебхука, которому нечего
 * разбирать, кроме `sub_…`/`dev_…` из метки контракта.
 */
export function priceUsdForOrderId(parsed:
  | { type: "plan"; kind: PlanKind; term: Term }
  | { type: "device" },
): number | null {
  if (parsed.type === "device") return DEVICE_ADDON_PRICE;
  const plan = resolvePlan(parsed.kind, parsed.term);
  return plan === null ? null : plan.price;
}

/** Примет ли линия такую покупку в такой валюте. */
export function purchasePayable(priceUsd: number, currency: LavaCurrency): boolean {
  try {
    return lavaTakesAmount(currency, chargeIn(priceUsd, currency));
  } catch {
    return false;
  }
}

// ── Ожидаемая сумма контракта ───────────────────────────────────────────────
//
// Записывается при выставлении счёта и сверяется вебхуком. Без записи сумму
// можно пересчитать заново из прайса — и вебхук так и делает, если записи не
// нашлось, — но запись надёжнее: она переживает правку курса EUR_PER_USD,
// после которой честно оплаченный евровый счёт перестал бы сходиться.

const CHARGE_TTL_SECONDS = 180 * 24 * 60 * 60;
const chargeKey = (contractId: string): string => `lava_charge:${contractId}`;

export interface ExpectedCharge {
  readonly orderId: string;
  readonly userId: string;
  readonly currency: LavaCurrency;
  readonly amount: number;
  readonly priceUsd: number;
  readonly label: string;
  readonly createdAt: number;
}

export async function rememberCharge(
  contractId: string,
  charge: ExpectedCharge,
): Promise<void> {
  await redis.set(chargeKey(contractId), JSON.stringify(charge), {
    ex: CHARGE_TTL_SECONDS,
  });
}

export async function getCharge(contractId: string): Promise<ExpectedCharge | null> {
  const raw = await redis.get(chargeKey(contractId));
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed as ExpectedCharge;
  } catch {
    return null;
  }
}

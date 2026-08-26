// src/app/api/subscribe/lava/route.ts
//
// Счёт на подписку через lava.top — единственный на Kovra способ заплатить
// из-за рубежа чем-то, кроме криптовалюты: карта, PayPal, Apple Pay, Pix, а в
// евро ещё SEPA, iDEAL и MB WAY.
//
// Тело: { what: "plan" | "device", kind?, term?, method, currency? }
// Ответ: { paymentUrl }
//
// ЧЕМ ЛАВА ОТЛИЧАЕТСЯ ОТ ОСТАЛЬНЫХ ЛИНИЙ И ЧТО ИЗ ЭТОГО СЛЕДУЕТ:
//
//   • Она показывает покупателю РОВНО ОДИН способ на счёт — тот, что назван
//     при создании. Поэтому способ выбирается у нас, до перехода, и приходит
//     сюда полем `method`. Валюта — полем `currency`, и её тоже выбирает
//     покупатель: у карты и PayPal их две, и подпись на кнопке обязана
//     совпасть со списанием.
//   • Своего идентификатора покупки положить некуда: в теле создания счёта нет
//     ни external_id, ни metadata. Связь держим сами — указателем в базе плюс
//     тем же `sub_…`/`dev_…` в utm_content, который возвращается в ответе их
//     API. Обе дороги проверяются встречно в вебхуке.
//   • Счета ниже порога она не выставляет: $5 и €5.5, измерено живыми счетами.
//     Отбиваем это здесь, а не отдаём покупателю её отказ без объяснения.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getAccount, getUserRecord } from "@/lib/accounts";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  createInvoice,
  lavaConfigured,
  lavaMethod,
  rememberContract,
  isLavaCurrency,
  type LavaCurrency,
} from "@/lib/lava";
import {
  chargeIn,
  purchasePayable,
  rememberCharge,
  resolvePurchase,
} from "@/lib/lava-purchase";

export const runtime = "nodejs";

const SITE_URL = "https://kovravpn.com";

export async function POST(req: NextRequest) {
  try {
    if (!lavaConfigured) {
      return NextResponse.json({ error: "Payment method not available" }, { status: 503 });
    }

    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.userId;

    const rl = await checkRateLimit(`subscribe-lava:${userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Wait ~${rl.resetIn}s.` },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      what?: unknown;
      kind?: unknown;
      term?: unknown;
      method?: unknown;
      currency?: unknown;
      fullName?: unknown;
    };

    const purchase = resolvePurchase(userId, body);
    if (purchase === null) {
      return NextResponse.json({ error: "Invalid plan or term" }, { status: 400 });
    }

    const spec = lavaMethod(typeof body.method === "string" ? body.method : "card");
    if (spec === null) {
      return NextResponse.json({ error: "Unknown payment method" }, { status: 400 });
    }

    // Валюта: выбор покупателя, если способ её принимает. Иначе первая, которую
    // способ знает. Чужую для способа не подменяем молча — списать не то, что
    // человек прочитал на кнопке, хуже, чем отказать.
    let currency: LavaCurrency = spec.currencies[0] as LavaCurrency;
    if (body.currency !== undefined) {
      if (!isLavaCurrency(body.currency) || !spec.currencies.includes(body.currency)) {
        return NextResponse.json({ error: "Unknown payment method" }, { status: 400 });
      }
      currency = body.currency;
    }

    // Bancontact не выставит счёт без имени покупателя — проверяем до запроса.
    let fullName: string | undefined;
    if (spec.needsFullName === true) {
      const name = typeof body.fullName === "string" ? body.fullName.trim() : "";
      // Угловые скобки не пропускаем: имя уезжает в уведомление с разметкой.
      if (name.length < 2 || name.length > 128 || /[<>]/.test(name)) {
        return NextResponse.json({ error: "Enter the name on the card" }, { status: 400 });
      }
      fullName = name;
    }

    if (!purchasePayable(purchase.priceUsd, currency)) {
      return NextResponse.json(
        { error: "This method does not take an amount this small" },
        { status: 400 },
      );
    }

    const account = await getAccount(userId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Почта нужна лаве только для чека, и наша выдача от неё не зависит: если
    // покупатель заходил через телеграм, почты у него нет вовсе — уйдёт
    // запасной адрес из LAVA_BUYER_EMAIL.
    const user = await getUserRecord(userId).catch(() => null);
    const email = typeof user?.email === "string" ? user.email : undefined;

    const amount = chargeIn(purchase.priceUsd, currency);
    const invoice = await createInvoice({
      orderId: purchase.orderId,
      amount,
      currency,
      methodId: spec.id,
      locale: "en",
      email,
      fullName,
      successUrl: `${SITE_URL}/dashboard?paid=lava`,
      failUrl: `${SITE_URL}/dashboard`,
    });

    // Указатель и ожидаемая сумма — ДО того, как ссылка уйдёт покупателю: в
    // событии лавы нашего идентификатора нет, и без записи пришедший вебхук
    // некуда приложить.
    await rememberContract(invoice.contractId, purchase.orderId);
    await rememberCharge(invoice.contractId, {
      orderId: purchase.orderId,
      userId,
      currency,
      amount,
      priceUsd: purchase.priceUsd,
      label: purchase.label,
      createdAt: Date.now(),
    });

    return NextResponse.json({ paymentUrl: invoice.paymentUrl });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[subscribe/lava]", detail);
    return NextResponse.json(
      { error: "Could not create payment. Try again later." },
      { status: 500 },
    );
  }
}

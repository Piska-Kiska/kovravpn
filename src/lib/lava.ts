// Приём иностранных платежей через lava.top.
//
// Перенесено из proxysvpn-store, где линия проверена боевым платежом
// 26.08.2026. Отличия Kovra ровно два: цены здесь изначально в долларах, так
// что пересчёт нужен только для евровых способов, и покупается подписка, а не
// заказ, поэтому «номер заказа» — это `sub_…`/`dev_…` из subscriptions.ts.
//
// Зачем линия нужна: у Kovra иностранцу нечем платить, кроме криптовалюты.
// Карта, PayPal и Apple Pay закрывают именно этот разрыв.
//
// УСТРОЙСТВО ЛАВЫ ОТЛИЧАЕТСЯ ОТ ОБЫЧНОГО ЭКВАЙРИНГА, и на этом легко
// ошибиться четырьмя способами:
//
//   1. Произвольную сумму принимает не любой товар. `amount` в запросе
//      действует ТОЛЬКО для товара с динамической ценой («цена по запросу
//      через API»). У обычного товара поле молча игнорируется, и покупатель
//      уходит платить цену из карточки, а не цену заказа. Поэтому ответ на
//      создание счёта сверяется с запрошенной суммой, и расхождение — отказ,
//      а не предупреждение: увести человека на чужую сумму хуже, чем не
//      выставить счёт вовсе. Настройку товара проверяет `scripts/lava-check.mjs`.
//
//   2. Своего номера заказа положить некуда. В теле создания счёта нет ни
//      `external_id`, ни `metadata` — только UTM-метки. Связь «контракт →
//      заказ» держим сами: указатель в базе плюс номер заказа в `utm_content`
//      как запасной путь. Оба конца проверяются встречно, см. `orderIdFor`.
//
//   3. Создание счёта НЕ идемпотентно — ключа идемпотентности у метода нет.
//      Поэтому повторов на POST здесь нет вовсе: второй запрос завёл бы
//      второй контракт. Повторяем только чтение.
//
//   4. Вебхук не подписан. Подлинность — заголовок `X-Api-Key` или Basic-auth,
//      что из этого включено, видно в кабинете. Правило то же, что у ЮKassa:
//      из тела берётся только идентификатор контракта, а статус и сумма
//      спрашиваются у их API. См. `getInvoice`.
//
// Документация: https://gate.lava.top/docs (схема — /docs/documentation.yaml,
// открыта без авторизации, вопреки виду страницы).

import crypto from "node:crypto";
export {
  LAVA_METHODS,
  LAVA_MIN_AMOUNT,
  lavaTakesAmount,
  lavaMethod,
  lavaMethodsFor,
  lavaMethodChoices,
  isLavaCurrency,
  type LavaCurrency,
  type LavaMethodId,
  type LavaMethodSpec,
} from "./lava-methods";
import {
  LAVA_MIN_AMOUNT,
  lavaMethod,
  lavaTakesAmount,
  type LavaCurrency,
  type LavaMethodId,
} from "./lava-methods";
import { redis } from "./redis";

/**
 * Значение переменной окружения, где ПУСТАЯ строка считается незаданной.
 *
 * Не придирка: Vercel заводит переменные из примера с пустыми значениями, и
 * `??` пустую строку пропускает дальше — она не null и не undefined.
 */
function envValue(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Чей это контракт. Уезжает в `utm_source` и возвращается в ответе их API.
 *
 * Нужна не для аналитики. Три наших бренда могут жить в ОДНОМ кабинете
 * lava.top, а адрес вебхука в их API не настраивается вовсе — он один на
 * кабинет. Значит на один адрес прилетают события всех трёх, и отличить своё
 * от чужого можно только меткой. Раньше во всех трёх копиях стояло
 * «proxysvpn-store», унаследованное при переносе: события были неразличимы.
 */
export const LAVA_UTM_SOURCE = "kovravpn";

const API_BASE = "https://gate.lava.top";
const TIMEOUT_MS = 20_000;

/** Указатель «контракт → заказ» живёт столько же, сколько сам заказ. */
const CONTRACT_TTL_SECONDS = 180 * 24 * 60 * 60;

const API_KEY = envValue("LAVA_API_KEY");
const OFFER_ID = envValue("LAVA_OFFER_ID");
/**
 * Куда отправить чек, когда покупатель оставил телеграм, а не почту. Почта в
 * запросе на счёт обязательна: без неё лава не знает, кому открыть доступ к
 * товару-заглушке. Заказов из бота у нас большинство, поэтому запасной адрес
 * входит в признак настроенности линии — иначе половина покупателей упиралась
 * бы в «счёт не выставлен» без объяснения.
 */
const BUYER_EMAIL = envValue("LAVA_BUYER_EMAIL");
/**
 * УСТАРЕВШИЕ. Задавали провайдера и метод на всю линию, пока способ был один.
 * Теперь способ выбирает покупатель, и эти переменные ИГНОРИРУЮТСЯ — читаем их
 * только чтобы предупредить в журнале и не гадать потом, почему настройка «не
 * применяется». Значения можно удалить из окружения.
 */
const PROVIDER = envValue("LAVA_PAYMENT_PROVIDER");
const METHOD = envValue("LAVA_PAYMENT_METHOD");

const WEBHOOK_API_KEY = envValue("LAVA_WEBHOOK_API_KEY");
const WEBHOOK_BASIC_USER = envValue("LAVA_WEBHOOK_BASIC_USER");
const WEBHOOK_BASIC_PASSWORD = envValue("LAVA_WEBHOOK_BASIC_PASSWORD");



const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
/**
 * Значение, пригодное для заголовка HTTP: видимый ASCII без пробелов.
 *
 * Проверка не придирка. Ключ, в котором оказался хоть один символ вне этого
 * набора, роняет `fetch` ещё до запроса — «Cannot convert argument to a
 * ByteString» — и падение случается в момент оформления заказа, у покупателя.
 * Так и вышло на боевой настройке: в переменную попала маскировка ключа с
 * многоточием, `/api/health` показывал линию настроенной, а касса отвечала
 * 502. Пусть лучше линия честно погаснет.
 */
const HEADER_SAFE_RE = /^[\x21-\x7E]+$/;

/**
 * Неверное значение переменной не игнорируем, а гасим линию целиком.
 *
 * Молча пропустить опечатку в имени провайдера значит выставить счёт через
 * шлюз, которого никто не выбирал, и узнать об этом от покупателя. Погашенная
 * линия видна в `/api/health` сразу и до первого платежа.
 */
function configProblem(): string | null {
  if (API_KEY === undefined) return "LAVA_API_KEY is not set";
  if (!HEADER_SAFE_RE.test(API_KEY)) {
    return "LAVA_API_KEY has characters that cannot go into an HTTP header — a masked or mistyped value?";
  }
  if (WEBHOOK_API_KEY !== undefined && !HEADER_SAFE_RE.test(WEBHOOK_API_KEY)) {
    return "LAVA_WEBHOOK_API_KEY has characters a header never carries — it could never match";
  }
  if (OFFER_ID === undefined) return "LAVA_OFFER_ID is not set";
  if (!UUID_RE.test(OFFER_ID)) return "LAVA_OFFER_ID is not a UUID";
  if (BUYER_EMAIL === undefined) return "LAVA_BUYER_EMAIL is not set";
  if (!EMAIL_RE.test(BUYER_EMAIL)) return "LAVA_BUYER_EMAIL is not an email";
  return null;
}

const CONFIG_PROBLEM = configProblem();
if (PROVIDER !== undefined || METHOD !== undefined) {
  console.warn(
    "[lava] LAVA_PAYMENT_PROVIDER/LAVA_PAYMENT_METHOD игнорируются: " +
      "способ приходит из выбора покупателя. Переменные можно удалить.",
  );
}
if (CONFIG_PROBLEM !== null && API_KEY !== undefined) {
  // Ключ задан, а линия не собралась — это опечатка в настройке, о которой
  // надо знать. Отсутствие ключа целиком означает «линию не подключали», и
  // шуметь об этом незачем.
  console.error("[lava] line disabled:", CONFIG_PROBLEM);
}

/** Готова ли линия. Проверять ДО показа кнопки покупателю. */
export const lavaConfigured = CONFIG_PROBLEM === null;

/** Статус контракта по данным их API. */
export type LavaInvoiceStatus = "NEW" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface LavaInvoice {
  readonly id: string;
  readonly status: LavaInvoiceStatus;
  readonly receipt?: {
    readonly amount?: number;
    readonly currency?: string;
    /** Комиссия лавы по этому платежу. Только для учёта. */
    readonly fee?: number;
  };
  readonly buyer?: { readonly email?: string };
  readonly clientUtm?: {
    readonly utm_content?: string | null;
    readonly utm_source?: string | null;
  };
}

export class LavaError extends Error {
  /** Тело ответа. Не перечислимое: иначе уезжает в журнал дважды. */
  public readonly body: unknown;

  constructor(
    public readonly status: number,
    body: unknown,
  ) {
    // Текст ответа в message: линия настраивается один раз, и «lava 400» без
    // объяснения превращает настройку в гадание. Секретов в их ответе нет.
    super(`lava.top ${status}: ${JSON.stringify(body).slice(0, 300)}`);
    this.name = "LavaError";
    Object.defineProperty(this, "body", { value: body, enumerable: false });
  }
}

async function call(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<unknown> {
  if (API_KEY === undefined) throw new Error("LAVA_API_KEY is not set");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "X-Api-Key": API_KEY,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new LavaError(res.status, json);
  return json;
}

/**
 * Чтение с одной повторной попыткой на сеть и 5xx. Для POST такого нет и быть
 * не может: у создания счёта нет ключа идемпотентности, и повтор завёл бы
 * второй контракт.
 */
async function read(path: string): Promise<unknown> {
  try {
    return await call("GET", path);
  } catch (e) {
    const retryable = !(e instanceof LavaError) || e.status >= 500;
    if (!retryable) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return call("GET", path);
  }
}

/** Язык окна оплаты. У лавы их три; всё, что не русский и не испанский, — английский. */
function buyerLanguage(locale: string): "RU" | "EN" | "ES" {
  if (locale === "ru") return "RU";
  if (locale === "es") return "ES";
  return "EN";
}

export interface CreateLavaInvoiceInput {
  readonly orderId: string;
  /**
   * Сумма и валюта СЧЁТА, а не заказа. Считает вызывающий, потому что он же
   * записывает их в заказ — вебхуку потом не с чем будет сверять сумму, если
   * посчитать её здесь и забыть.
   */
  readonly amount: number;
  readonly currency: LavaCurrency;
  /** Чем платит покупатель. Определяет провайдера и метод в запросе. */
  readonly methodId: LavaMethodId;
  readonly locale: string;
  /** Почта покупателя. Пусто — уйдёт запасная из окружения. */
  readonly email?: string;
  /** Имя покупателя. Обязательно для способов с `needsFullName`. */
  readonly fullName?: string;
  readonly successUrl: string;
  readonly failUrl: string;
}

export interface CreatedLavaInvoice {
  readonly contractId: string;
  readonly paymentUrl: string;
}

export async function createInvoice(
  input: CreateLavaInvoiceInput,
): Promise<CreatedLavaInvoice> {
  if (!lavaConfigured) throw new Error(`lava is not configured: ${CONFIG_PROBLEM}`);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error(`invalid amount: ${input.amount}`);
  }
  const spec = lavaMethod(input.methodId);
  if (spec === null) throw new Error(`unknown lava method: ${input.methodId}`);
  if (!spec.currencies.includes(input.currency)) {
    throw new Error(`method ${spec.id} does not take ${input.currency}`);
  }
  // Имя нужно не всем, но там, где нужно, его отсутствие даёт 400 уже после
  // того, как покупатель нажал «оплатить». Проверяем до запроса.
  if (spec.needsFullName === true && (input.fullName ?? "").trim().length === 0) {
    throw new Error(`method ${spec.id} requires fullName`);
  }
  // Нижний порог их стороны. Был написан только для рублей — и пропустил
  // валютный: счёт на $3.1 уходил в лаву и возвращался отказом уже у
  // покупателя. Теперь порог свой у каждой валюты, см. LAVA_MIN_AMOUNT.
  if (!lavaTakesAmount(input.currency, input.amount)) {
    throw new Error(
      `lava refuses invoices under ${LAVA_MIN_AMOUNT[input.currency]} ${input.currency}, ` +
        `got ${input.amount}`,
    );
  }

  const email =
    input.email !== undefined && EMAIL_RE.test(input.email) ? input.email : BUYER_EMAIL;

  const body = (mail: string | undefined): Record<string, unknown> => ({
    email: mail,
    offerId: OFFER_ID,
    currency: input.currency,
    // Суммы у лавы в основных единицах, а не в копейках — в отличие от Cashera.
    amount: input.amount,
    ...(spec.needsFullName === true ? { fullName: input.fullName } : {}),
    buyerLanguage: buyerLanguage(input.locale),
    // Единственное место в запросе, куда влезает наш номер заказа. Основной
    // путь — указатель в базе; это запасной, на случай если запись указателя
    // не пережила выката.
    clientUtm: {
      utm_source: LAVA_UTM_SOURCE,
      utm_medium: "checkout",
      utm_content: input.orderId,
    },
    // Провайдер и метод — ТОЛЬКО из выбранного покупателем способа.
    //
    // Здесь стояло перекрытие переменными окружения «на случай, если лава
    // перевесит способ». Оно и сломало всю валютную линию: при заданных
    // LAVA_PAYMENT_PROVIDER=PAY2ME и LAVA_PAYMENT_METHOD=SBP человек выбирал
    // карту в долларах, а уходило PAY2ME + SBP + USD, на что лава отвечает
    // «Restricted payment method type». Явный выбор покупателя не может
    // перебиваться настройкой: она про запасной путь, а он про то, чем он
    // собирается заплатить.
    paymentProvider: spec.provider,
    ...(spec.method === undefined ? {} : { paymentMethod: spec.method }),
    successful_return_url: input.successUrl,
    failure_return_url: input.failUrl,
    cancel_return_url: input.failUrl,
  });

  /**
   * Почта покупателя нужна лаве для чека, и только. Наша выдача от неё не
   * зависит вовсе: доступ появляется на странице заказа, дублируется нашим же
   * письмом и сообщением в боте.
   *
   * Поэтому почта, которая шлюзу не понравилась, не повод терять продажу.
   * Ловилось на первом же боевом заказе: лава ответила 400 «Incorrect email to
   * purchase» на адрес, с которого заведён сам аккаунт продавца — свой товар с
   * него купить нельзя. Наверняка есть и другие адреса, которые она не примет.
   *
   * Повтор здесь безопасен, несмотря на отсутствие идемпотентности: 400
   * означает, что контракт не создан, и второй запрос не заведёт второй.
   */
  let raw: unknown;
  try {
    raw = await call("POST", "/api/v3/invoice", body(email));
  } catch (err) {
    const emailRejected =
      err instanceof LavaError && err.status === 400 && /email/i.test(err.message);
    if (!emailRejected || email === BUYER_EMAIL) throw err;
    console.warn("[lava] buyer email refused by the gateway, retrying with the fallback address");
    raw = await call("POST", "/api/v3/invoice", body(BUYER_EMAIL));
  }

  const created = raw as {
    id?: unknown;
    paymentUrl?: unknown;
    amountTotal?: { amount?: unknown; currency?: unknown };
  };

  const contractId = typeof created.id === "string" ? created.id : "";
  if (!UUID_RE.test(contractId)) {
    throw new Error(`lava: ответ без идентификатора контракта: ${JSON.stringify(created).slice(0, 200)}`);
  }

  const paymentUrl = typeof created.paymentUrl === "string" ? created.paymentUrl : "";
  if (!/^https:\/\//i.test(paymentUrl)) {
    throw new Error(`lava: контракт ${contractId} без ссылки на оплату`);
  }

  // ГЛАВНАЯ ПРОВЕРКА ЭТОЙ ЛИНИИ. Если товар заведён без динамической цены,
  // `amount` из запроса игнорируется и счёт выставляется на цену из карточки.
  // Отправить покупателя платить чужую сумму нельзя ни при каких условиях:
  // меньшую он оплатит, и мы выдадим товар за полцены, большую — потребует
  // возврат. Оба случая дороже несостоявшейся продажи.
  const total = Number(created.amountTotal?.amount);
  const totalCurrency = created.amountTotal?.currency;
  if (Number.isFinite(total) && Math.abs(total - input.amount) > 0.01) {
    throw new Error(
      `lava: счёт выставлен на ${total} вместо ${input.amount} — ` +
        `у товара LAVA_OFFER_ID нет динамической цены`,
    );
  }
  if (totalCurrency !== undefined && totalCurrency !== input.currency) {
    throw new Error(`lava: счёт в ${String(totalCurrency)} вместо ${input.currency}`);
  }

  return { contractId, paymentUrl };
}

/**
 * Состояние контракта по данным лавы.
 *
 * Это и есть проверка подлинности вебхука: тело события не подписано, и всё,
 * кроме идентификатора контракта, годится только для журнала.
 */
export async function getInvoice(contractId: string): Promise<LavaInvoice> {
  if (!lavaConfigured) throw new Error(`lava is not configured: ${CONFIG_PROBLEM}`);
  if (!UUID_RE.test(contractId)) throw new Error(`invalid contract id: ${contractId}`);
  return (await read(`/api/v2/invoices/${encodeURIComponent(contractId)}`)) as LavaInvoice;
}

export function isContractId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// ── Связь «контракт → заказ» ────────────────────────────────────────────────

const contractKey = (contractId: string): string => `store:lava:contract:${contractId}`;

/**
 * Запомнить, какому заказу принадлежит контракт. Пишется ДО того, как ссылка
 * на оплату уходит покупателю: без этой записи пришедший вебхук некуда
 * приложить, а своего номера заказа лава не хранит.
 */
export async function rememberContract(contractId: string, orderId: string): Promise<void> {
  await redis.set(contractKey(contractId), orderId, { ex: CONTRACT_TTL_SECONDS });
}

/**
 * Чей это контракт. Сначала указатель в базе, потом — метка `utm_content` из
 * ОТВЕТА ИХ API (не из тела вебхука: тело подделывается, ответ API — нет).
 *
 * Оба пути возвращают только кандидата. Проверку «этот ли заказ» делает
 * вызывающий, сверяя `order.invoiceId` с идентификатором контракта.
 */
export async function orderIdFor(
  contractId: string,
  invoice: LavaInvoice,
): Promise<string | null> {
  const raw = await redis.get(contractKey(contractId));
  const stored = typeof raw === "string" ? raw : null;
  if (stored !== null && stored !== "") return stored;
  const fromUtm = invoice.clientUtm?.utm_content;
  return typeof fromUtm === "string" && fromUtm !== "" ? fromUtm : null;
}

// ── Подлинность вебхука ─────────────────────────────────────────────────────

function safeEqual(a: string | null | undefined, b: string): boolean {
  const ba = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export type LavaWebhookAuth = "ok" | "bad" | "unconfigured";

/**
 * Подлинность вебхука настраивается в кабинете и бывает двух видов: заголовок
 * `X-Api-Key` или Basic-auth. Поддерживаем оба, потому что снаружи не видно,
 * какой из них включён у конкретного аккаунта.
 *
 * Оба сравнения выполняются всегда: ранний выход по первому несовпадению
 * рассказал бы, какой из двух способов уже угадан.
 *
 * `unconfigured` — не ошибка. Настоящий рубеж здесь не заголовок, а запрос к
 * их API за состоянием контракта: без него подделанное событие всё равно ни
 * к чему не приводит. Заголовок экономит этот запрос, а не заменяет его.
 */
export function verifyWebhookAuth(h: { get(name: string): string | null }): LavaWebhookAuth {
  const basicConfigured =
    WEBHOOK_BASIC_USER !== undefined && WEBHOOK_BASIC_PASSWORD !== undefined;
  if (WEBHOOK_API_KEY === undefined && !basicConfigured) return "unconfigured";

  const byKey =
    WEBHOOK_API_KEY !== undefined && safeEqual(h.get("x-api-key"), WEBHOOK_API_KEY);

  let byBasic = false;
  if (basicConfigured) {
    const expected = `Basic ${Buffer.from(
      `${WEBHOOK_BASIC_USER}:${WEBHOOK_BASIC_PASSWORD}`,
    ).toString("base64")}`;
    byBasic = safeEqual(h.get("authorization"), expected);
  }

  return byKey || byBasic ? "ok" : "bad";
}

// Проверка настройки lava.top ДО первого платежа.
//
// Линия зависит от вещей, которых не видно из кода: заведён ли товар, у
// какого его оффера включена динамическая цена, работает ли ключ. Ошибка в
// любой из них проявляется только на живом покупателе — и самым дорогим
// способом: у товара с обычной ценой поле `amount` в запросе игнорируется, и
// человек уходит платить цену из карточки вместо цены заказа.
//
//   LAVA_API_KEY=… node scripts/lava-check.mjs
//   LAVA_API_KEY=… node scripts/lava-check.mjs --raw
//   LAVA_API_KEY=… node scripts/lava-check.mjs --probe=<сумма> --offer=<uuid>
//   LAVA_API_KEY=… node scripts/lava-check.mjs --invoice=<uuid контракта>
//   LAVA_API_KEY=… node scripts/lava-check.mjs --min --currency=USD \
//     --provider=UNLIMINT --method=CARD --offer=<uuid>
//   LAVA_API_KEY=… node scripts/lava-check.mjs --recent [--days=7]
//
// Второй вид — разбор конкретного платежа: статус, сумма и КОМИССИЯ по данным
// самой лавы. Комиссия в их документации не указана нигде, единственный
// способ узнать её — посмотреть в исполненном контракте.
//
// Счетов скрипт не создаёт и ничего не меняет: только чтение.
//
// ДВЕ ВЕЩИ, КОТОРЫМ ЗДЕСЬ НЕЛЬЗЯ ДОВЕРЯТЬ, обе проверены на живом аккаунте:
//   • форма ответа ленты. По спецификации элемент выглядит как `{type, data}`,
//     живой ответ кладёт продукт плоско. Разбираем оба вида;
//   • устойчивость их API. Тот же запрос, отработавший минуту назад, отвечает
//     500 «Something went wrong». Поэтому повтор на 5xx и перебор вариантов
//     запроса, а не отказ на первом отлупе;
//   • признак «цена по запросу» в ленте. Такой оффер приходит НЕ с пустыми
//     ценами, а с нулями во всех трёх валютах — ровно так же выглядел бы
//     бесплатный продукт. Отличить их по ленте нельзя, поэтому окончательный
//     ответ даёт только `--probe`: он выставляет счёт на заданную сумму и
//     смотрит, та ли сумма вернулась.

const API_BASE = "https://gate.lava.top";
const KEY = process.env.LAVA_API_KEY;

if (!KEY) {
  console.error("Нет LAVA_API_KEY. Ключ выпускается в кабинете lava.top: Интеграции → Public API.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Один запрос. Не завершает работу: решение принимает вызывающий. */
async function attempt(path) {
  // `nextPage` приходит абсолютной ссылкой, остальные вызовы — путём.
  const url = /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: { "X-Api-Key": KEY, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* оставим null: покажем сырой текст */
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (err) {
    return { ok: false, status: 0, json: null, text: String(err) };
  }
}

/** Запрос с одной повторной попыткой на сеть и 5xx. */
async function get(path) {
  const first = await attempt(path);
  if (first.ok || (first.status >= 400 && first.status < 500)) return first;
  await sleep(1500);
  return attempt(path);
}

const arg = (name) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found === undefined ? null : found.slice(name.length + 3);
};

const flag = (name) => process.argv.includes(`--${name}`);

/**
 * Тело создания счёта — ровно то, что шлёт прод.
 *
 * Одним местом на все проверки намеренно. Первая версия пробы слала
 * укороченное тело, проба проходила, а касса потом отвечала отказом: разница
 * была в полях, которых проба не отправляла. Преflight, не совпадающий с
 * боевым запросом, бесполезен.
 */
function invoiceBody({ email, offerId, currency, amount, provider, method, order = "PROBEPROBE1" }) {
  return {
    email,
    offerId,
    currency,
    amount,
    ...(provider === null || provider === undefined ? {} : { paymentProvider: provider }),
    ...(method === null || method === undefined ? {} : { paymentMethod: method }),
    buyerLanguage: "RU",
    clientUtm: { utm_source: "proxysvpn-store", utm_medium: "checkout", utm_content: order },
    successful_return_url: `https://proxysvpn.store/ru/pay/${order}`,
    failure_return_url: "https://proxysvpn.store/ru/topup",
    cancel_return_url: "https://proxysvpn.store/ru/topup",
  };
}

/** Создание счёта. Без повторов: у метода нет ключа идемпотентности. */
async function postInvoice(payload) {
  const res = await fetch(`${API_BASE}/api/v3/invoice`, {
    method: "POST",
    headers: { "X-Api-Key": KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

// ── Нижний порог суммы ──────────────────────────────────────────────────────
//
// В рублях он известен и стоит проверкой в проде: 50 ₽, узнан отказом «The
// amount is too small to create an invoice». В долларах и евро он СВОЙ, нигде
// не описан и зависит от провайдера — и обнаружился ровно так, как такие вещи
// обнаруживаются: счёт на $3.1 по тарифу проверки не выставился вовсе, тогда
// как $15.3 тем же способом проходит.
//
// Ищем двоичным поиском по десятым долям. Отказ контракта не создаёт, успех
// создаёт — неоплаченный, он истечёт сам. Верхняя граница обязана проходить:
// если не проходит и она, дело не в сумме, и перебор бессмыслен.
//
//   LAVA_API_KEY=… node scripts/lava-check.mjs --min --currency=USD \
//     --provider=UNLIMINT --method=CARD --offer=<uuid оффера>
//
if (flag("min")) {
  const currency = (arg("currency") ?? "USD").toUpperCase();
  if (!["RUB", "USD", "EUR"].includes(currency)) {
    console.error("--currency= RUB | USD | EUR");
    process.exit(1);
  }
  const offerId = arg("offer") ?? process.env.LAVA_OFFER_ID ?? null;
  const email = arg("email") ?? process.env.LAVA_BUYER_EMAIL ?? null;
  if (offerId === null) {
    console.error("Нужен --offer=<uuid оффера> или переменная LAVA_OFFER_ID.");
    process.exit(1);
  }
  if (email === null) {
    console.error("Нужен --email=<почта> или переменная LAVA_BUYER_EMAIL.");
    process.exit(1);
  }
  const provider = arg("provider");
  const payMethod = arg("method");
  const ceiling = Number(arg("max") ?? (currency === "RUB" ? 500 : 25));
  if (!Number.isFinite(ceiling) || ceiling <= 0) {
    console.error("--max=<сумма> — положительное число.");
    process.exit(1);
  }

  // Считаем в десятых долях: сравнивать целые надёжнее, чем 0.1 + 0.2.
  const TENTHS = 10;
  const BUDGET = 12;
  let spent = 0;

  const tryAmount = async (tenths) => {
    const amount = tenths / TENTHS;
    spent += 1;
    const res = await postInvoice(
      invoiceBody({ email, offerId, currency, amount, provider, method: payMethod }),
    );
    if (res.ok) {
      console.log(`  ${amount} ${currency}: HTTP ${res.status} ✅ принято`);
      return true;
    }
    console.log(`  ${amount} ${currency}: HTTP ${res.status} — ${res.text.slice(0, 200)}`);
    return false;
  };

  console.log(
    `Ищу наименьшую сумму, которую лава примет в ${currency}` +
      (provider === null ? " (провайдер по умолчанию)" : ` через ${provider}`) +
      (payMethod === null ? "" : `, метод ${payMethod}`) +
      `.\nВерхняя граница ${ceiling} ${currency}. Каждая принятая сумма оставляет неоплаченный контракт.\n`,
  );

  let hi = Math.round(ceiling * TENTHS);
  if (!(await tryAmount(hi))) {
    console.error(
      `\n❌ Не прошла даже верхняя граница ${ceiling} ${currency}.\n` +
        "   Значит дело не в сумме: смотрите ответ выше — оффер, способ или ключ.\n" +
        "   Поднять границу можно так: --max=50",
    );
    process.exit(1);
  }

  // Нижняя граница ЗАВЕДОМО отвергается: 0.1 не принимает никакой эквайринг.
  let lo = 1;
  if (await tryAmount(lo)) {
    console.log(`\n✅ Порога нет: принята даже ${lo / TENTHS} ${currency}.`);
    process.exit(0);
  }

  while (hi - lo > 1 && spent < BUDGET) {
    const mid = Math.floor((lo + hi) / 2);
    if (await tryAmount(mid)) hi = mid;
    else lo = mid;
  }

  const minimum = hi / TENTHS;
  const exact = hi - lo === 1;
  console.log(
    `\n${exact ? "✅" : "⚠️ "} Нижний порог${exact ? "" : " (перебор упёрся в бюджет запросов)"}: ` +
      `${minimum} ${currency}. Меньше — отказ, ровно столько — счёт выставляется.`,
  );
  console.log(
    "\nЧто с этим делать: цена тарифа в рублях, поделённая на курс из " +
      "src/lib/currency.ts,\nне должна опускаться ниже этого числа ни в одной валюте линии — " +
      "иначе\nпокупатель упрётся в «счёт не выставлен» вместо оплаты.",
  );
  console.log("\nНеоплаченные контракты остались в кабинете — это нормально, платить их не нужно.");
  process.exit(0);
}

// ── Последние контракты ─────────────────────────────────────────────────────
//
// Отвечает на вопрос, который иначе задать негде: дошли ли деньги ДО ЛАВЫ.
//
// Он появляется в самом неприятном случае — покупатель говорит, что заплатил,
// а у нас ни оплаченного заказа, ни тревоги. Тогда надо развести две разные
// беды: платежа не было вовсе (это к покупателю) или платёж есть, а вебхук до
// нас не доехал (это к нам, и выдавать придётся руками).
//
// Номер нашего заказа лава хранит единственным способом — меткой utm_content,
// её и печатаем: по ней контракт связывается с заказом.
//
//   LAVA_API_KEY=… node scripts/lava-check.mjs --recent
//   LAVA_API_KEY=… node scripts/lava-check.mjs --recent --days=7
//
if (flag("recent")) {
  const days = Number(arg("days") ?? 1);
  if (!Number.isFinite(days) || days <= 0) {
    console.error("--days=<число дней> — положительное число.");
    process.exit(1);
  }
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  const path =
    `/api/v2/invoices?beginDate=${encodeURIComponent(iso(now - days * 864e5))}` +
    `&endDate=${encodeURIComponent(iso(now))}&size=100`;

  const res = await get(path);
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${res.text.slice(0, 300)}`);
    process.exit(1);
  }
  // Форма ответа у ленты продуктов уже расходилась со спецификацией, поэтому
  // и здесь разбираем оба вида: страницу с `items` и голый массив.
  const page = res.json;
  const items = Array.isArray(page) ? page : Array.isArray(page?.items) ? page.items : [];
  if (items.length === 0) {
    console.log(`За последние ${days} сут. контрактов нет.`);
    process.exit(0);
  }

  console.log(`Контрактов за последние ${days} сут.: ${items.length}\n`);
  for (const it of items) {
    const status = it?.status ?? "?";
    const amount = it?.receipt?.amount;
    const currency = it?.receipt?.currency ?? "";
    const fee = it?.receipt?.fee;
    const order = it?.clientUtm?.utm_content ?? "—";
    const mark = status === "COMPLETED" ? "💰" : status === "FAILED" ? "✖️ " : "· ";
    console.log(
      `${mark} ${it?.datetime ?? "?"}  ${String(status).padEnd(11)} ` +
        `${amount === undefined ? "?" : amount} ${currency}` +
        (fee === undefined ? "" : ` (комиссия ${fee})`),
    );
    console.log(`   контракт ${it?.id ?? "?"} · заказ ${order} · ${it?.buyer?.email ?? "—"}`);
  }

  const paid = items.filter((it) => it?.status === "COMPLETED");
  console.log(
    `\nИсполнено: ${paid.length}. У каждого исполненного контракта обязан быть ` +
      `оплаченный заказ с тем же номером;\nесли заказа нет — вебхук не доехал, ` +
      `и выдачу придётся сделать руками.`,
  );
  process.exit(0);
}

const probeArg = arg("probe");
if (probeArg !== null) {
  const amount = Number(probeArg);
  const offerId = arg("offer");
  const email = arg("email") ?? process.env.LAVA_BUYER_EMAIL;
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("--probe=<сумма> — положительное число рублей.");
    process.exit(1);
  }
  // Нижний порог их стороны, узнан отказом: «The amount is too small to create
  // an invoice», min 50 RUB. Самый дешёвый заказ в магазине — докупка 1 ГБ
  // датацентровых за 145 ₽, так что продажам это не мешает; но пробу на
  // копеечную сумму отбиваем сразу, не тратя запрос.
  if (amount < 50 && (arg("currency") ?? "RUB").toUpperCase() === "RUB") {
    console.error(`Лава не выставляет счета меньше 50 ₽ (просили ${amount}). Взять сумму от 50.`);
    process.exit(1);
  }
  if (offerId === null) {
    console.error("Нужен --offer=<uuid оффера>: тот, что скрипт печатает как LAVA_OFFER_ID.");
    process.exit(1);
  }
  if (!email) {
    console.error("Нужен --email=<почта> или переменная LAVA_BUYER_EMAIL.");
    process.exit(1);
  }

  // ЭТО ЕДИНСТВЕННОЕ ДЕЙСТВИЕ СКРИПТА, КОТОРОЕ ЧТО-ТО СОЗДАЁТ. На стороне
  // лавы останется неоплаченный контракт — он никого ни к чему не обязывает и
  // истечёт сам, но появится в списке продаж, и об этом честно сказать.
  //
  // Тело ПОЛНОЕ, ровно как у `createInvoice` в проде. Первая версия пробы
  // слала укороченное — только почта, оффер, валюта и сумма, — проба прошла,
  // а касса потом отвечала отказом: разница была в полях, которых проба не
  // отправляла. Преflight, не совпадающий с боевым запросом, бесполезен.
  // Провайдер и метод можно назвать явно: так проверяется, что включено на
  // аккаунте. Без них лава берёт своё умолчание — для рублей это SMART_GLOCAL
  // и карта, а он показывает покупателю только МИР.
  const provider = arg("provider");
  const payMethod = arg("method");
  // Валюта решает, какие способы лава вообще покажет: в рублях это МИР или
  // СБП, а Visa, PayPal, Apple Pay и европейские методы живут только в USD и
  // EUR. Порог в 50 действует для рублей; для валюты он свой, и проба на
  // маленькой сумме его нащупает.
  const currency = (arg("currency") ?? "RUB").toUpperCase();
  if (!["RUB", "USD", "EUR"].includes(currency)) {
    console.error("--currency= RUB | USD | EUR");
    process.exit(1);
  }

  const full = invoiceBody({ email, offerId, currency, amount, provider, method: payMethod });

  // Если полное тело не проходит, поле-виновника ищем вычитанием: варианты
  // идут от полного к самому бедному, и первый прошедший называет причину.
  const drop = (obj, ...keys) => {
    const copy = { ...obj };
    for (const k of keys) delete copy[k];
    return copy;
  };
  const VARIANTS = [
    ["полное тело, как в проде", full],
    ["без clientUtm", drop(full, "clientUtm")],
    ["без адресов возврата", drop(full, "successful_return_url", "failure_return_url", "cancel_return_url")],
    ["без buyerLanguage", drop(full, "buyerLanguage")],
    ["минимальное тело", { email, offerId, currency, amount }],
  ];

  const send = postInvoice;

  console.log(
    `Выставляю пробный счёт на ${amount} ${currency} по офферу ${offerId}` +
      (provider === null ? " (провайдер по умолчанию)" : ` через ${provider}`) +
      (payMethod === null ? "" : `, метод ${payMethod}`) +
      "…",
  );
  let passed = null;
  let previous = null;
  for (const [label, payload] of VARIANTS) {
    const res = await send(payload);
    if (res.ok) {
      console.log(`  ${label}: HTTP ${res.status} ✅`);
      passed = { label, text: res.text };
      break;
    }
    console.log(`  ${label}: HTTP ${res.status} — ${res.text.slice(0, 300)}`);
    // Тот же самый отказ на теле, из которого убрали поля, означает, что дело
    // не в полях вовсе — дальше перебирать нечего. Без этой остановки проба на
    // сумму ниже минимальной создавала пять одинаковых запросов подряд.
    const signature = `${res.status} ${res.text.replace(/"timestamp":"[^"]*"/, "")}`;
    if (previous === signature) {
      console.log("  (ответ не меняется — причина не в составе тела, перебор прекращён)");
      break;
    }
    previous = signature;
  }

  if (passed === null) {
    console.error("\nНи один вариант не прошёл. Ответ лавы выше — в нём и причина.");
    process.exit(1);
  }
  if (passed.label !== VARIANTS[0][0]) {
    console.log(`\n⚠️  Прод шлёт ПОЛНОЕ тело, а прошло только «${passed.label}».`);
    console.log("   Значит виновато поле, убранное в этом варианте, — чинить в src/lib/lava.ts.");
  }
  const invoice = JSON.parse(passed.text);
  const total = Number(invoice?.amountTotal?.amount);
  const currencyBack = invoice?.amountTotal?.currency;
  console.log(JSON.stringify(invoice, null, 2));

  // Кем в итоге поедет платёж, видно только внутри ссылки: лава кладёт туда
  // base64 с настройками виджета. Достаём — иначе «почему только МИР» опять
  // придётся выяснять по скриншоту с телефона.
  const params = /paymentParams=([^&]+)/.exec(String(invoice?.paymentUrl ?? ""));
  if (params !== null) {
    try {
      const decoded = Buffer.from(decodeURIComponent(params[1]), "base64").toString("utf8");
      const chosen = /"provider":\s*\{"name":"([^"]+)","method":"([^"]+)"/.exec(decoded);
      if (chosen !== null) console.log(`\nПлатёж поедет через: ${chosen[1]}, метод ${chosen[2]}`);
    } catch {
      /* не разобралось — не беда, это справочная строка */
    }
  }

  if (Number.isFinite(total) && Math.abs(total - amount) <= 0.01 && currencyBack === currency) {
    console.log(`\n✅ Сумма принята: счёт выставлен ровно на ${total} ${currencyBack}.`);
    console.log(`   Оффер годится. LAVA_OFFER_ID=${offerId}`);
  } else {
    console.log(`\n❌ Счёт выставлен на ${total} ${currencyBack ?? "?"} вместо ${amount} ${currency}.`);
    console.log("   У товара НЕ включена «Цена по запросу через API» — покупатель заплатил бы");
    console.log("   не ту сумму. Продавать через этот оффер нельзя.");
  }
  console.log(`\nОткрыть страницу оплаты и посмотреть, что там предлагают:\n  ${invoice?.paymentUrl}`);
  console.log("\nНеоплаченный контракт остался в кабинете — это нормально, платить его не нужно.");
  process.exit(0);
}

// ── Матрица способов ────────────────────────────────────────────────────────
//
// Лава показывает покупателю РОВНО ОДИН способ на счёт — тот, что назван при
// создании. Списка на её странице нет; проверено на UNLIMINT/CHECKOUT_PAGE,
// который молча подменяется картой. Значит выбирать должен покупатель у нас, а
// для этого надо знать, какие сочетания аккаунт вообще принимает.
//
// Перечень взят из примеров их спецификации, а не из перечисления
// PaymentMethodType: в перечислении только четыре значения, а примеры знают
// APPLE_PAY, SEPATRANSFER, IDEAL, MBWAY и BANCONTACT. Верить примерам.
if (process.argv.includes("--matrix")) {
  const offerId = arg("offer");
  const email = arg("email") ?? process.env.LAVA_BUYER_EMAIL;
  if (offerId === null || !email) {
    console.error("Нужны --offer=<uuid> и --email=<почта>.");
    process.exit(1);
  }
  const COMBOS = [
    ["RUB", 100, "SMART_GLOCAL", "CARD", {}],
    ["RUB", 100, "PAY2ME", "CARD", {}],
    ["RUB", 100, "PAY2ME", "SBP", {}],
    ["USD", 5, "UNLIMINT", "CARD", {}],
    ["USD", 5, "UNLIMINT", "APPLE_PAY", {}],
    ["USD", 5, "UNLIMINT", "PIX", {}],
    ["USD", 5, "PAYPAL", null, {}],
    ["EUR", 5, "UNLIMINT", "CARD", {}],
    ["EUR", 5, "UNLIMINT", "APPLE_PAY", {}],
    ["EUR", 5, "UNLIMINT", "SEPATRANSFER", {}],
    ["EUR", 5, "UNLIMINT", "IDEAL", {}],
    ["EUR", 5, "UNLIMINT", "MBWAY", {}],
    ["EUR", 5, "UNLIMINT", "BANCONTACT", { fullName: "Test Buyer" }],
    ["EUR", 5, "PAYPAL", null, {}],
  ];

  console.log(`Проверяю ${COMBOS.length} сочетаний. Каждое удавшееся оставит в кабинете`);
  console.log("неоплаченный контракт — платить их не нужно, они истекут сами.\n");

  const rows = [];
  for (const [currency, amount, provider, method, extra] of COMBOS) {
    const label = `${currency} · ${provider}${method ? " · " + method : ""}`;
    const res = await fetch(`${API_BASE}/api/v3/invoice`, {
      method: "POST",
      headers: { "X-Api-Key": KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email,
        offerId,
        currency,
        amount,
        ...(method === null ? {} : { paymentMethod: method }),
        paymentProvider: provider,
        ...extra,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) {
      let why = text.slice(0, 120);
      try {
        why = JSON.parse(text).error ?? why;
      } catch {
        /* оставим как есть */
      }
      console.log(`  ❌ ${label.padEnd(34)} HTTP ${res.status} — ${why}`);
      rows.push({ label, ok: false });
      continue;
    }
    // Кем платёж поедет НА САМОМ ДЕЛЕ — только внутри ссылки, base64.
    let real = "?";
    try {
      const inv = JSON.parse(text);
      const m = /paymentParams=([^&]+)/.exec(String(inv.paymentUrl ?? ""));
      if (m) {
        const d = Buffer.from(decodeURIComponent(m[1]), "base64").toString("utf8");
        const c = /"provider":\s*\{"name":"([^"]+)","method":"([^"]+)"/.exec(d);
        if (c) real = `${c[1]}/${c[2]}`;
      }
    } catch {
      /* справочная строка, не критично */
    }
    // Сравнивать надо по буквам и цифрам: мы просим APPLE_PAY, лава отвечает
    // applepay, и наивное сравнение объявляло подменой рабочий способ. PIX она
    // при этом честно уводит другому провайдеру (knx/pix) — провайдер тут не
    // важен, важен метод.
    const norm = (v) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
    const substituted = method !== null && !norm(real).endsWith(norm(method));
    console.log(
      `  ✅ ${label.padEnd(34)} поедет через ${real}` +
        (substituted ? "  ⚠️ ПОДМЕНЁН" : ""),
    );
    rows.push({ label, ok: true, real, substituted });
  }

  const good = rows.filter((r) => r.ok && !r.substituted);
  console.log(`\nГодных без подмены: ${good.length} из ${COMBOS.length}`);
  console.log("Подменённые в кнопки не ставить: покупатель выберет одно, заплатит другим.");
  process.exit(0);
}

const invoiceArg = process.argv.find((a) => a.startsWith("--invoice="));

if (invoiceArg) {
  const id = invoiceArg.slice("--invoice=".length);
  const res = await get(`/api/v2/invoices/${encodeURIComponent(id)}`);
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, res.text.slice(0, 400));
    process.exit(1);
  }
  console.log(JSON.stringify(res.json, null, 2));
  const { amount, fee } = res.json?.receipt ?? {};
  if (typeof amount === "number" && typeof fee === "number" && amount > 0) {
    console.log(`\nКомиссия: ${fee} из ${amount} (${((fee / amount) * 100).toFixed(2)}%)`);
  }
  process.exit(0);
}

// feedVisibility=ALL обязателен: товар с ценой по запросу лава публикует
// СКРЫТЫМ, и в выдаче по умолчанию его нет. Но именно этот запрос у них
// иногда отвечает 500, поэтому за ним идут запасные — вплоть до устаревшей
// ленты v1. Годится первый, который ответил.
const VARIANTS = [
  "/api/v2/products?feedVisibility=ALL",
  "/api/v2/products?feedVisibility=ONLY_HIDDEN",
  "/api/v2/products",
  "/api/v1/feed?contentCategories=PRODUCT",
];

let start = null;
for (const variant of VARIANTS) {
  const res = await get(variant);
  if (res.ok) {
    start = { path: variant, page: res.json };
    if (variant !== VARIANTS[0]) console.log(`(основной запрос не прошёл, читаем через ${variant})`);
    break;
  }
  console.error(`HTTP ${res.status} на ${variant}: ${res.text.slice(0, 200)}`);
}

if (start === null) {
  console.error("\nНи один вариант запроса не прошёл. Это их сторона: ключ тут ни при чём,");
  console.error("на неверный ключ они отвечают 401. Подождать пару минут и повторить.");
  process.exit(1);
}

const items = [];
let page = start.page;
// Страниц бывает больше одной; без обхода «продуктов нет» означало бы всего
// лишь «на первой странице их не оказалось».
for (let guard = 0; guard < 20; guard += 1) {
  if (Array.isArray(page?.items)) items.push(...page.items);
  const next = typeof page?.nextPage === "string" ? page.nextPage : null;
  if (next === null) break;
  const res = await get(next);
  if (!res.ok) {
    console.error(`Страница ${next} не прочиталась (HTTP ${res.status}) — показываю, что успел.`);
    break;
  }
  page = res.json;
}

if (process.argv.includes("--raw")) {
  console.log(JSON.stringify(items, null, 2));
  process.exit(0);
}

// Форму записи НЕ угадываем: берём обёртку `data`, если она пришла, иначе сам
// элемент. Первая версия скрипта знала только про обёртку и отрапортовала
// «продуктов нет» при одном продукте в ленте.
const unwrap = (item) => (item?.data && typeof item.data === "object" ? item.data : item);

const kinds = {};
for (const item of items) {
  const kind = unwrap(item)?.type ?? item?.type ?? "?";
  kinds[kind] = (kinds[kind] ?? 0) + 1;
}
console.log(
  `Ключ работает. Записей в ленте: ${items.length}` +
    (items.length > 0
      ? ` (${Object.entries(kinds).map(([k, n]) => `${k}: ${n}`).join(", ")})`
      : ""),
);

// Продукты берём ВСЕ, даже без офферов: продукт без единой цены — это не
// «продуктов нет», а «продукт есть, но продавать нечего», и путать эти два
// состояния при настройке дороже всего.
const products = items
  .map(unwrap)
  .filter((d) => d && typeof d.id === "string" && d.type !== "POST" && d.type !== "LESSON");

if (products.length === 0) {
  console.log("\nПродуктов в аккаунте нет.");
  console.log(
    "Что сделать: в кабинете lava.top опубликовать Цифровой продукт (годятся ещё\n" +
      "Консультация и Курс) и включить у него опцию «Цена по запросу API» — блок\n" +
      "стоимости после этого скрывается, продукт становится доступен только по\n" +
      "ссылке и только через API. Затем запустить проверку снова.",
  );
  if (items.length > 0) {
    console.log("\nНо записи в ленте есть — посмотреть сырой ответ: node scripts/lava-check.mjs --raw");
  }
  process.exit(0);
}

let dynamic = 0;
for (const product of products) {
  console.log(`\n${product.title ?? "(без названия)"}  [${product.type ?? "?"}]`);
  console.log(`  productId: ${product.id}`);
  // Продукты в лаве проходят модерацию. В схеме ответа v2 этого поля нет, но
  // если оно придёт — показать: заблокированный продукт выглядит в ленте
  // обычным, а счёт по нему не выставится.
  if (product.moderationStatus !== undefined || product.status !== undefined) {
    console.log(`  статус: ${product.status ?? "?"}, модерация: ${product.moderationStatus ?? "?"}`);
  }
  const offers = product.offers ?? [];
  if (offers.length === 0) {
    console.log("  ⚠️  у продукта нет ни одного оффера — выставить счёт не на что");
    continue;
  }
  for (const offer of offers) {
    const prices = offer.prices ?? [];
    // Оффер с ценой по запросу приходит либо вовсе без цен, либо с НУЛЯМИ во
    // всех валютах. Ровно так же выглядел бы бесплатный продукт, поэтому это
    // кандидат, а не приговор: подтверждает только `--probe`.
    const isCandidate =
      prices.length === 0 || prices.every((p) => p?.amount == null || Number(p.amount) === 0);
    if (isCandidate) dynamic += 1;
    const shown =
      prices.length === 0
        ? "цен нет"
        : prices.map((p) => `${p.amount ?? "—"} ${p.currency ?? "?"}`).join(", ");
    console.log(`  ${isCandidate ? "✅ похоже на цену по запросу" : "⚠️  фиксированная цена"} — ${shown}`);
    console.log(`     LAVA_OFFER_ID=${offer.id}`);
  }
}

if (dynamic > 0) {
  console.log(`\nКандидатов: ${dynamic}. Нули в ценах — это ЕЩЁ НЕ доказательство: так же`);
  console.log("выглядит бесплатный продукт. Подтвердить пробным счётом (создаст на их");
  console.log("стороне один неоплаченный контракт, платить его не нужно):");
  console.log("\n  LAVA_API_KEY=… node scripts/lava-check.mjs --probe=100 \\");
  console.log("      --offer=<uuid из строки выше> --email=support@proxysvpn.com");
} else {
  console.log(
    "\nНи одного оффера с ценой по запросу. Счёт на сумму заказа выставить нельзя: " +
      "включить у товара опцию «Цена по запросу API» и запустить проверку снова.",
  );
}

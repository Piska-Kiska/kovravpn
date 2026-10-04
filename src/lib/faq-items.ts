// src/lib/faq-items.ts
//
// Single source of truth for FAQ content. Both the visible FAQ accordion
// and the FAQPage JSON-LD schema import from here — Google's FAQPage policy
// requires the schema Q&A to match the on-page content word-for-word, so
// keeping both rendered from one constant prevents accidental drift.
//
// FAQ_GUIDE (technical/troubleshooting) is shown on "/guide". The landing
// and the new landing pages keep their FAQ next to their own copy. The old
// FAQ_HOME (ProxysVPN's rouble prices, Netflix in 4K, a refund promise) was
// deleted on 02.10.2026: nothing rendered it.
//
// Editing rules (to stay rich-result-eligible):
// - Questions and answers must be stable content, not promotions or ads
// - Answers must be complete text (no "see below", no "click here")
// - Don't include HTML — the schema strips it anyway and displayed HTML
//   would diverge from schema plain text
//
// Ref: https://developers.google.com/search/docs/appearance/structured-data/faqpage

export interface FaqItem {
  q: string;
  a: string;
}

/** Guide FAQ — covers setup and troubleshooting questions. */
export const FAQ_GUIDE: readonly FaqItem[] = [
  {
    q: "Какое приложение нужно установить?",
    a: "Happ (рекомендуем) или INCY — оба бесплатные и принимают ссылку подписки Kovra. Если Happ нет в App Store вашей страны, ставьте INCY. Ссылки на установку для каждой платформы есть в инструкции выше.",
  },
  {
    q: "Чем Happ отличается от INCY?",
    a: "Оба работают на движке Xray и принимают одну и ту же ссылку подписки. Happ мы советуем по умолчанию. INCY — запасной вариант: он есть в App Store там, где Happ убрали, в том числе в России.",
  },
  {
    q: "Как получить ссылку подписки для моего устройства?",
    a: "В личном кабинете нажмите «Добавить устройство» и выберите тип — система сгенерирует уникальную ссылку. Её нужно скопировать и вставить в приложение Happ или INCY.",
  },
  {
    q: "Можно ли использовать одну ссылку на нескольких устройствах?",
    a: "Нет. Каждая ссылка работает только на одном устройстве — это защита от утечки и злоупотреблений. Для второго устройства создайте новый профиль в личном кабинете.",
  },
  {
    q: "Что делать если VPN не подключается?",
    a: "Проверьте что ссылка импортирована полностью и подписка оплачена. Если не помогло — удалите профиль в приложении и создайте заново. Если всё равно не работает, напишите в поддержку.",
  },
  {
    q: "Нужно ли держать VPN включённым постоянно?",
    a: "Нет. Включайте только когда нужно — например для стриминга или игр. Когда VPN выключен, трафик идёт напрямую через вашего провайдера без задержек.",
  },
] as const;

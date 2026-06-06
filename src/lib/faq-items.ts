// src/lib/faq-items.ts
//
// Single source of truth for FAQ content. Both the visible FAQ accordion
// and the FAQPage JSON-LD schema import from here — Google's FAQPage policy
// requires the schema Q&A to match the on-page content word-for-word, so
// keeping both rendered from one constant prevents accidental drift.
//
// Two sets: FAQ_HOME (selling/pricing — shown on "/") and FAQ_GUIDE
// (technical/troubleshooting — shown on "/guide"). Different pages answer
// different search intents, so each gets its own schema.
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

/** Homepage FAQ — covers purchase decision questions. */
export const FAQ_HOME: readonly FaqItem[] = [
  {
    q: "Какие устройства поддерживает Kovra?",
    a: "Android, iPhone, iPad, Mac, Windows. До 100 устройств на аккаунте — каждому создаётся отдельная ссылка подписки.",
  },
  {
    q: "Сколько стоит VPN?",
    a: "100 ₽ в месяц за одно устройство. Баланс можно пополнить от 10 ₽, чтобы попробовать сервис на 3 дня перед полной оплатой.",
  },
  {
    q: "Нужна ли регистрация?",
    a: "Да, займёт около 30 секунд. Можно зарегистрироваться по email или через Telegram. После регистрации сразу доступен личный кабинет с балансом и устройствами.",
  },
  {
    q: "Будут ли списываться деньги автоматически?",
    a: "Нет. Это не подписка — платите сколько и когда хотите. Когда баланс закончится, VPN просто перестанет работать до следующего пополнения.",
  },
  {
    q: "Работает ли со стримингом и играми?",
    a: "Да. YouTube, Twitch и Netflix без ограничений, в том числе в 4K. Серверы в Европе обеспечивают низкий пинг для игр на европейских серверах.",
  },
  {
    q: "Что если VPN не заработает на моём устройстве?",
    a: "Напишите в наш бот поддержки @KovraVPN_bot или на support@kovravpn.com — поможем настроить. Если подключить не получится — вернём деньги.",
  },
] as const;

/** Guide FAQ — covers setup and troubleshooting questions. */
export const FAQ_GUIDE: readonly FaqItem[] = [
  {
    q: "Какое приложение нужно установить?",
    a: "Happ или V2RayTun — оба бесплатные. Happ проще для начинающих, V2RayTun даёт больше тонких настроек. Ссылки на установку для каждой платформы есть в инструкции выше.",
  },
  {
    q: "Чем Happ отличается от V2RayTun?",
    a: "Функционально почти одинаковые. Happ активнее обновляется и удобнее на мобильных. V2RayTun лучше работает на старых версиях Windows и Android.",
  },
  {
    q: "Как получить ссылку подписки для моего устройства?",
    a: "В личном кабинете нажмите «Добавить устройство» и выберите тип — система сгенерирует уникальную ссылку. Её нужно скопировать и вставить в приложение Happ или V2RayTun.",
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

/**
 * Back-compat alias. Some older code referenced FAQ_ITEMS as the single list;
 * it now points to FAQ_HOME so homepage rendering keeps working without
 * touching importers. New code should import the specific set (FAQ_HOME or
 * FAQ_GUIDE) directly.
 */
export const FAQ_ITEMS = FAQ_HOME;

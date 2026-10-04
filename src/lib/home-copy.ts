// src/lib/home-copy.ts
//
// The landing page's copy in the five site languages. Plain data, so the
// client view and the server page (the FAQPage markup) read the same
// strings. Typed with exact keys: a language that misses or invents one does
// not compile.
//
// Kovra's prices are never typed here: a string that quotes one carries a
// {placeholder} that the view fills from src/lib/plan-prices.ts, the numbers
// the server charges (see homeVars below). {n} and {ref} are filled per term
// in the view.

import type { Lang } from "@/i18n/dict";
import { DEVICE_ADDON_PRICE, PLAN_PRICES, usd } from "./plan-prices";

const en = {
  nav_features: "Features", nav_pricing: "Pricing", nav_faq: "FAQ", nav_guides: "Guides",
  nav_signin: "Sign in", nav_get: "Get Started",
  badge: "VLESS + REALITY · No auto-renewal",
  hero_t1: "Privacy.", hero_t2: "Perfected.",
  hero_sub: "To the network, your connection looks like a visit to an ordinary website. Sign up with Telegram, no email needed.",
  hero_cta1: "Connect - from {p3_12_mo}/mo", hero_cta2: "Learn more",
  b1_k: "Protocol", b1_t: "Looks like a website.",
  b1_b: "VLESS + REALITY, with locations in Europe, the US and Asia. Your app always shows the current list.",
  b2_k: "Privacy", b2_t: "Only what billing needs.",
  b2_b: "We keep traffic totals and last-connection time. Everything we store is listed in our Privacy Policy.",
  b3_k: "Devices", b3_t: "Your devices.",
  b3_b: "Up to 3 devices: iPhone, Android, Mac, Windows or TV. Extra devices {addon} per 30 days.",
  b4_k: "Payments", b4_t: "Crypto & cards.",
  b4_b: "Pay in crypto or by card. Prices are in USD; a card may be charged in another currency, and crypto network fees are added at checkout.",
  how_kicker: "How it works", how_h2: "Sign up, pay, import one link.",
  how_lead: "Create an account, choose a plan and import your link into Happ or INCY.",
  step1_t: "Create your account", step1_b: "With Telegram (no email needed) or with email.",
  step2_t: "Choose a plan", step2_b: "1, 6 or 12 months, paid once, by crypto or card.",
  step3_t: "Connect", step3_b: "Import your link into Happ or INCY and tap connect.",
  price_kicker: "Pricing", price_h2: "One plan. Pick your term.",
  price_honest: "Honest pricing",
  plan_permo: "/mo", plan_devices: "up to 3 devices", plan_devices1: "1 device",
  term1: "1 month", term6: "6 months", term12: "1 year", badge_best: "Best value",
  plan_once1: "paid once for 1 month", plan_oncen: "paid once for {n} months",
  plan_savings: "The discount compares the term price with paying monthly for the same period.",
  plan_no_renew: "Nothing renews automatically.", plan_vs: "vs {ref} for {n} monthly payments",
  price_meta: "Pay once for 1, 6 or 12 months. Access ends when the term ends; nothing renews automatically.",
  plan1: "Every location in the app", plan2: "No data caps (fair use applies)", plan3: "Telegram signup, no email needed",
  plan4: "Up to 3 devices", plan4_one: "1 device", plan5: "Pay with crypto or card", price_btn: "Get started",
  faq_kicker: "FAQ", faq_h2: "Questions, answered.",
  faq_q1: "Do you keep logs?", faq_a1: "We keep what billing needs: per-account traffic totals and last-connection time, plus the data listed in our Privacy Policy.",
  faq_q2: "How do I pay?", faq_a2: "By card or in cryptocurrency. Three devices cost {p3_12} once for 12 months ({p3_12_mo}/mo); one device costs {p1_12} for 12 months.",
  faq_q3: "How many devices can I use?", faq_a3: "A plan covers 1 or 3 devices. Each extra device costs {addon} per 30 days.",
  faq_q4: "Does Kovra renew automatically?", faq_a4: "No. You pay once for 1, 6 or 12 months, and access ends when the term ends.",
  band_h2: "Take back your privacy.", band_p: "Up to 3 devices for {p3_12} a year, paid once. Nothing renews automatically.", band_btn: "Get Kovra",
  foot_terms: "Terms", foot_privacy: "Privacy", copyright: "© 2026 Kovra",
};

export type HomeDict = typeof en;
export type HomeKey = keyof HomeDict;

const ru: HomeDict = {
  nav_features: "Возможности", nav_pricing: "Цена", nav_faq: "Вопросы", nav_guides: "Гайды",
  nav_signin: "Войти", nav_get: "Подключить",
  badge: "VLESS + REALITY · Без автопродления",
  hero_t1: "Приватность.", hero_t2: "И точка.",
  hero_sub: "Для сети ваше соединение выглядит как заход на обычный сайт. Регистрация через Telegram, без почты.",
  hero_cta1: "Подключить - от {p3_12_mo}/мес", hero_cta2: "Подробнее",
  b1_k: "Протокол", b1_t: "Выглядит как сайт.",
  b1_b: "VLESS + REALITY, локации в Европе, США и Азии. Актуальный список всегда в приложении.",
  b2_k: "Приватность", b2_t: "Только то, что нужно для оплаты.",
  b2_b: "Мы храним объём трафика и время последнего подключения. Всё, что мы храним, перечислено в Политике конфиденциальности.",
  b3_k: "Устройства", b3_t: "Ваши устройства.",
  b3_b: "До 3 устройств: iPhone, Android, Mac, Windows или ТВ. Дополнительное устройство: {addon} за 30 дней.",
  b4_k: "Оплата", b4_t: "Крипта и карты.",
  b4_b: "Оплата криптой или картой. Цены в долларах; с карты могут списать в другой валюте, а сетевая комиссия за крипту добавляется при оплате.",
  how_kicker: "Как это работает", how_h2: "Регистрация, оплата, одна ссылка.",
  how_lead: "Создайте аккаунт, выберите тариф и добавьте ссылку в Happ или INCY.",
  step1_t: "Создай аккаунт", step1_b: "Через Telegram (без почты) или по email.",
  step2_t: "Выберите тариф", step2_b: "1, 6 или 12 месяцев, разовая оплата криптой или картой.",
  step3_t: "Подключись", step3_b: "Добавьте ссылку в Happ или INCY и нажмите «подключить».",
  price_kicker: "Цена", price_h2: "Один тариф. Выбери срок.",
  price_honest: "Честно о цене",
  plan_permo: "/мес", plan_devices: "до 3 устройств", plan_devices1: "1 устройство",
  term1: "1 месяц", term6: "6 месяцев", term12: "1 год", badge_best: "Лучшая цена",
  plan_once1: "разово за 1 месяц", plan_oncen: "разово за {n} мес.",
  plan_savings: "Скидка: сравнение цены срока с помесячной оплатой за тот же период.",
  plan_no_renew: "Автопродления нет.", plan_vs: "против {ref} при помесячной оплате {n} мес.",
  price_meta: "Оплата разово за 1, 6 или 12 месяцев. Доступ заканчивается вместе со сроком, автопродления нет.",
  plan1: "Все локации в приложении", plan2: "Без лимита трафика (в рамках честного использования)", plan3: "Регистрация через Telegram, без почты",
  plan4: "До 3 устройств", plan4_one: "1 устройство", plan5: "Оплата криптой или картой", price_btn: "Начать",
  faq_kicker: "Вопросы", faq_h2: "Отвечаем на вопросы.",
  faq_q1: "Вы храните логи?", faq_a1: "Мы храним то, что нужно для оплаты: объём трафика на аккаунт и время последнего подключения, а также данные, перечисленные в Политике конфиденциальности.",
  faq_q2: "Как происходит оплата?", faq_a2: "Картой или криптовалютой. Три устройства: {p3_12} разово за 12 месяцев ({p3_12_mo}/мес); одно устройство: {p1_12} за 12 месяцев.",
  faq_q3: "Сколько устройств можно использовать?", faq_a3: "Тариф рассчитан на 1 или 3 устройства. Каждое дополнительное: {addon} за 30 дней.",
  faq_q4: "Продлевается ли Kovra автоматически?", faq_a4: "Нет. Вы платите разово за 1, 6 или 12 месяцев, и доступ заканчивается вместе со сроком.",
  band_h2: "Верни себе приватность.", band_p: "До 3 устройств за {p3_12} в год, разовой оплатой. Автопродления нет.", band_btn: "Подключить",
  foot_terms: "Условия", foot_privacy: "Конфиденциальность", copyright: "© 2026 Kovra",
};

const es: HomeDict = {
  nav_features: "Funciones", nav_pricing: "Precio", nav_faq: "Preguntas", nav_guides: "Guías",
  nav_signin: "Entrar", nav_get: "Empezar",
  badge: "VLESS + REALITY · Sin renovación automática",
  hero_t1: "Privacidad.", hero_t2: "Perfecta.",
  hero_sub: "Para la red, tu conexión parece una visita a un sitio web corriente. Regístrate con Telegram, sin email.",
  hero_cta1: "Conéctate - desde {p3_12_mo}/mes", hero_cta2: "Saber más",
  b1_k: "Protocolo", b1_t: "Parece un sitio web.",
  b1_b: "VLESS + REALITY, con ubicaciones en Europa, EE. UU. y Asia. Tu app siempre muestra la lista actual.",
  b2_k: "Privacidad", b2_t: "Solo lo que exige el cobro.",
  b2_b: "Guardamos el volumen de tráfico y la hora de la última conexión. Todo lo que guardamos figura en nuestra Política de privacidad.",
  b3_k: "Dispositivos", b3_t: "Tus dispositivos.",
  b3_b: "Hasta 3 dispositivos: iPhone, Android, Mac, Windows o TV. Cada dispositivo extra, {addon} por 30 días.",
  b4_k: "Pagos", b4_t: "Cripto y tarjetas.",
  b4_b: "Paga con cripto o con tarjeta. Precios en USD; la tarjeta puede cobrarse en otra divisa y la comisión de red de la cripto se añade al pagar.",
  how_kicker: "Cómo funciona", how_h2: "Regístrate, paga, importa un enlace.",
  how_lead: "Crea una cuenta, elige un plan e importa tu enlace en Happ o INCY.",
  step1_t: "Crea tu cuenta", step1_b: "Con Telegram (sin email) o con email.",
  step2_t: "Elige un plan", step2_b: "1, 6 o 12 meses, en un solo pago con cripto o tarjeta.",
  step3_t: "Conéctate", step3_b: "Importa tu enlace en Happ o INCY y toca conectar.",
  price_kicker: "Precio", price_h2: "Un plan. Elige el plazo.",
  price_honest: "Precio honesto",
  plan_permo: "/mes", plan_devices: "hasta 3 dispositivos", plan_devices1: "1 dispositivo",
  term1: "1 mes", term6: "6 meses", term12: "1 año", badge_best: "Mejor precio",
  plan_once1: "pago único por 1 mes", plan_oncen: "pago único por {n} meses",
  plan_savings: "El descuento compara el precio del plazo con pagar mes a mes el mismo periodo.",
  plan_no_renew: "Nada se renueva automáticamente.", plan_vs: "frente a {ref} en {n} pagos mensuales",
  price_meta: "Pagas una vez por 1, 6 o 12 meses. El acceso termina con el plazo; nada se renueva automáticamente.",
  plan1: "Todas las ubicaciones de la app", plan2: "Sin límite de datos (uso razonable)", plan3: "Registro con Telegram, sin email",
  plan4: "Hasta 3 dispositivos", plan4_one: "1 dispositivo", plan5: "Paga con cripto o tarjeta", price_btn: "Empezar",
  faq_kicker: "Preguntas", faq_h2: "Preguntas, resueltas.",
  faq_q1: "¿Guardan registros?", faq_a1: "Guardamos lo que exige el cobro: el volumen de tráfico por cuenta y la hora de la última conexión, además de los datos indicados en nuestra Política de privacidad.",
  faq_q2: "¿Cómo pago?", faq_a2: "Con tarjeta o criptomoneda. Tres dispositivos cuestan {p3_12} en un solo pago por 12 meses ({p3_12_mo}/mes); un dispositivo, {p1_12} por 12 meses.",
  faq_q3: "¿Cuántos dispositivos puedo usar?", faq_a3: "Un plan cubre 1 o 3 dispositivos. Cada dispositivo extra cuesta {addon} por 30 días.",
  faq_q4: "¿Kovra se renueva automáticamente?", faq_a4: "No. Pagas una vez por 1, 6 o 12 meses y el acceso termina cuando acaba el plazo.",
  band_h2: "Recupera tu privacidad.", band_p: "Hasta 3 dispositivos por {p3_12} al año, en un solo pago. Nada se renueva automáticamente.", band_btn: "Obtén Kovra",
  foot_terms: "Términos", foot_privacy: "Privacidad", copyright: "© 2026 Kovra",
};

const de: HomeDict = {
  nav_features: "Funktionen", nav_pricing: "Preis", nav_faq: "FAQ", nav_guides: "Guides",
  nav_signin: "Anmelden", nav_get: "Loslegen",
  badge: "VLESS + REALITY · Keine automatische Verlängerung",
  hero_t1: "Privatsphäre.", hero_t2: "Perfektioniert.",
  hero_sub: "Für das Netz sieht deine Verbindung wie der Besuch einer gewöhnlichen Website aus. Anmeldung per Telegram, ohne E-Mail.",
  hero_cta1: "Verbinden - ab {p3_12_mo}/Mon.", hero_cta2: "Mehr erfahren",
  b1_k: "Protokoll", b1_t: "Sieht aus wie eine Website.",
  b1_b: "VLESS + REALITY, mit Standorten in Europa, den USA und Asien. Deine App zeigt immer die aktuelle Liste.",
  b2_k: "Privatsphäre", b2_t: "Nur, was die Abrechnung braucht.",
  b2_b: "Wir speichern Datenvolumen und Zeitpunkt der letzten Verbindung. Alles, was wir speichern, steht in unserer Datenschutzerklärung.",
  b3_k: "Geräte", b3_t: "Deine Geräte.",
  b3_b: "Bis zu 3 Geräte: iPhone, Android, Mac, Windows oder TV. Jedes weitere Gerät {addon} pro 30 Tage.",
  b4_k: "Zahlung", b4_t: "Krypto & Karten.",
  b4_b: "Zahle mit Krypto oder Karte. Preise in USD; eine Karte kann in einer anderen Währung belastet werden, und Netzwerkgebühren für Krypto kommen beim Bezahlen hinzu.",
  how_kicker: "So funktioniert's", how_h2: "Anmelden, bezahlen, einen Link importieren.",
  how_lead: "Konto erstellen, Tarif wählen und deinen Link in Happ oder INCY importieren.",
  step1_t: "Konto erstellen", step1_b: "Per Telegram (ohne E-Mail) oder per E-Mail.",
  step2_t: "Tarif wählen", step2_b: "1, 6 oder 12 Monate, einmalig bezahlt mit Krypto oder Karte.",
  step3_t: "Verbinden", step3_b: "Link in Happ oder INCY importieren und auf Verbinden tippen.",
  price_kicker: "Preis", price_h2: "Ein Tarif. Wähle die Laufzeit.",
  price_honest: "Ehrlicher Preis",
  plan_permo: "/Mon.", plan_devices: "bis zu 3 Geräte", plan_devices1: "1 Gerät",
  term1: "1 Monat", term6: "6 Monate", term12: "1 Jahr", badge_best: "Bester Preis",
  plan_once1: "einmalig für 1 Monat", plan_oncen: "einmalig für {n} Monate",
  plan_savings: "Der Rabatt vergleicht den Laufzeitpreis mit monatlicher Zahlung für denselben Zeitraum.",
  plan_no_renew: "Nichts verlängert sich automatisch.", plan_vs: "statt {ref} bei {n} Monatszahlungen",
  price_meta: "Einmal zahlen für 1, 6 oder 12 Monate. Der Zugang endet mit der Laufzeit; nichts verlängert sich automatisch.",
  plan1: "Alle Standorte in der App", plan2: "Kein Datenlimit (faire Nutzung)", plan3: "Anmeldung per Telegram, ohne E-Mail",
  plan4: "Bis zu 3 Geräte", plan4_one: "1 Gerät", plan5: "Zahle mit Krypto oder Karte", price_btn: "Loslegen",
  faq_kicker: "FAQ", faq_h2: "Fragen, beantwortet.",
  faq_q1: "Speichert ihr Logs?", faq_a1: "Wir speichern, was die Abrechnung braucht: das Datenvolumen pro Konto und den Zeitpunkt der letzten Verbindung, dazu die in unserer Datenschutzerklärung genannten Daten.",
  faq_q2: "Wie bezahle ich?", faq_a2: "Per Karte oder Kryptowährung. Drei Geräte kosten {p3_12} einmalig für 12 Monate ({p3_12_mo}/Mon.); ein Gerät {p1_12} für 12 Monate.",
  faq_q3: "Wie viele Geräte kann ich nutzen?", faq_a3: "Ein Tarif deckt 1 oder 3 Geräte. Jedes weitere Gerät kostet {addon} pro 30 Tage.",
  faq_q4: "Verlängert sich Kovra automatisch?", faq_a4: "Nein. Du zahlst einmal für 1, 6 oder 12 Monate, und der Zugang endet mit der Laufzeit.",
  band_h2: "Hol dir deine Privatsphäre zurück.", band_p: "Bis zu 3 Geräte für {p3_12} im Jahr, einmalig bezahlt. Nichts verlängert sich automatisch.", band_btn: "Kovra holen",
  foot_terms: "AGB", foot_privacy: "Datenschutz", copyright: "© 2026 Kovra",
};

const fr: HomeDict = {
  nav_features: "Fonctions", nav_pricing: "Tarif", nav_faq: "FAQ", nav_guides: "Guides",
  nav_signin: "Connexion", nav_get: "Commencer",
  badge: "VLESS + REALITY · Sans renouvellement automatique",
  hero_t1: "Confidentialité.", hero_t2: "Perfectionnée.",
  hero_sub: "Pour le réseau, votre connexion ressemble à la visite d'un site ordinaire. Inscription via Telegram, sans e-mail.",
  hero_cta1: "Se connecter - dès {p3_12_mo}/mois", hero_cta2: "En savoir plus",
  b1_k: "Protocole", b1_t: "Comme un site web.",
  b1_b: "VLESS + REALITY, avec des emplacements en Europe, aux États-Unis et en Asie. Votre application affiche toujours la liste à jour.",
  b2_k: "Confidentialité", b2_t: "Seulement ce que la facturation exige.",
  b2_b: "Nous conservons le volume de trafic et l'heure de la dernière connexion. Tout ce que nous conservons figure dans notre Politique de confidentialité.",
  b3_k: "Appareils", b3_t: "Vos appareils.",
  b3_b: "Jusqu'à 3 appareils : iPhone, Android, Mac, Windows ou TV. Chaque appareil supplémentaire, {addon} pour 30 jours.",
  b4_k: "Paiements", b4_t: "Crypto et cartes.",
  b4_b: "Payez en crypto ou par carte. Prix en USD ; la carte peut être débitée dans une autre devise, et les frais de réseau crypto s'ajoutent au paiement.",
  how_kicker: "Comment ça marche", how_h2: "Inscription, paiement, un lien à importer.",
  how_lead: "Créez un compte, choisissez une offre et importez votre lien dans Happ ou INCY.",
  step1_t: "Créez votre compte", step1_b: "Via Telegram (sans e-mail) ou par e-mail.",
  step2_t: "Choisissez une offre", step2_b: "1, 6 ou 12 mois, payés en une fois, en crypto ou par carte.",
  step3_t: "Connectez-vous", step3_b: "Importez votre lien dans Happ ou INCY et touchez connecter.",
  price_kicker: "Tarif", price_h2: "Une offre. Choisissez la durée.",
  price_honest: "Prix honnête",
  plan_permo: "/mois", plan_devices: "jusqu'à 3 appareils", plan_devices1: "1 appareil",
  term1: "1 mois", term6: "6 mois", term12: "1 an", badge_best: "Meilleur prix",
  plan_once1: "payé en une fois pour 1 mois", plan_oncen: "payé en une fois pour {n} mois",
  plan_savings: "La remise compare le prix de la durée à un paiement mensuel sur la même période.",
  plan_no_renew: "Rien ne se renouvelle automatiquement.", plan_vs: "au lieu de {ref} en {n} paiements mensuels",
  price_meta: "Payez une fois pour 1, 6 ou 12 mois. L'accès prend fin avec la durée ; rien ne se renouvelle automatiquement.",
  plan1: "Tous les emplacements de l'application", plan2: "Sans plafond de données (usage raisonnable)", plan3: "Inscription via Telegram, sans e-mail",
  plan4: "Jusqu'à 3 appareils", plan4_one: "1 appareil", plan5: "Payez en crypto ou par carte", price_btn: "Commencer",
  faq_kicker: "FAQ", faq_h2: "Vos questions, nos réponses.",
  faq_q1: "Conservez-vous des journaux ?", faq_a1: "Nous conservons ce que la facturation exige : le volume de trafic par compte et l'heure de la dernière connexion, ainsi que les données listées dans notre Politique de confidentialité.",
  faq_q2: "Comment payer ?", faq_a2: "Par carte ou en cryptomonnaie. Trois appareils coûtent {p3_12} en une fois pour 12 mois ({p3_12_mo}/mois) ; un appareil, {p1_12} pour 12 mois.",
  faq_q3: "Combien d'appareils puis-je utiliser ?", faq_a3: "Une offre couvre 1 ou 3 appareils. Chaque appareil supplémentaire coûte {addon} pour 30 jours.",
  faq_q4: "Kovra se renouvelle-t-il automatiquement ?", faq_a4: "Non. Vous payez une fois pour 1, 6 ou 12 mois, et l'accès prend fin avec la durée.",
  band_h2: "Reprenez votre confidentialité.", band_p: "Jusqu'à 3 appareils pour {p3_12} par an, payés en une fois. Rien ne se renouvelle automatiquement.", band_btn: "Obtenir Kovra",
  foot_terms: "Conditions", foot_privacy: "Confidentialité", copyright: "© 2026 Kovra",
};

export const HOME_COPY: Record<Lang, HomeDict> = { en, ru, es, de, fr };

/** The placeholders a string may carry besides {n} and {ref}. */
export type HomeVar = "p3_12" | "p3_12_mo" | "p1_12" | "addon";

/**
 * "$79.08"; French writes the symbol after the number, with a no-break space
 * so a price never wraps in two. Whole dollars drop their cents ("$33").
 */
export function formatMoney(amount: number, lang: Lang): string {
  const s = usd(amount);
  return lang === "fr" ? `${s.slice(1)}\u00a0$` : s;
}

/** The prices the copy quotes, from the module the server charges from. */
export function homeVars(lang: Lang): Record<HomeVar, string> {
  const money = (amount: number) => formatMoney(amount, lang);
  return {
    p3_12: money(PLAN_PRICES.plan3[12].total),
    p3_12_mo: money(PLAN_PRICES.plan3[12].perMonth),
    p1_12: money(PLAN_PRICES.plan1[12].total),
    addon: money(DEVICE_ADDON_PRICE),
  };
}

/** Fills {name} placeholders from `vars`; a name it does not know is left as it is. */
export function fillCopy(text: string, vars: Readonly<Record<string, string>>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : whole,
  );
}

/** A language's copy with the prices filled in ({n} and {ref} stay for the view). */
export function homeCopyFor(lang: Lang): HomeDict {
  const vars = homeVars(lang);
  const out = { ...HOME_COPY[lang] };
  for (const key of Object.keys(out) as HomeKey[]) out[key] = fillCopy(out[key], vars);
  return out;
}

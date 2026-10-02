"use client";
// src/app/page.tsx — Kovra landing v3 "Privacy. Perfected."
// Apple-keynote minimal: total black, giant metallic display type,
// bento feature grid, a single warm gold glow (the orb).
// i18n (EN/RU/ES/DE/FR) via the page dictionary below; language and theme
// (system / light / dark) through the shared header capsule
// (src/components/chrome). Backend untouched.

import { useEffect, useState } from "react";
import Reveal from "@/components/fx/Reveal";
import DigitRoll from "@/components/fx/DigitRoll";
import "./home.css";
import KovraWordmark from "@/components/KovraWordmark";
import { PrefsCapsule, ThemeSync } from "@/components/chrome";
import type { Lang } from "@/i18n/dict";
import { isLang } from "@/i18n/resolve";
import { setLang as persistLang } from "@/i18n/runtime";

type TermId = "m1" | "m6" | "m12";
type Term = { id: TermId; mo: string; total: string; ref: string | null; n: number; disc: number };

// Level 0 — up to 3 devices
const TERMS_3: Term[] = [
  { id: "m1", mo: "$11.99", total: "$11.99", ref: null, n: 1, disc: 0 },
  { id: "m6", mo: "$8.99", total: "$53.94", ref: "$71.94", n: 6, disc: 25 },
  { id: "m12", mo: "$6.59", total: "$79.08", ref: "$143.88", n: 12, disc: 45 },
];

// Level 1 — 1 device ($5/mo base, same 25% / 45% term discounts)
const TERMS_1: Term[] = [
  { id: "m1", mo: "$5.00", total: "$5.00", ref: null, n: 1, disc: 0 },
  { id: "m6", mo: "$3.75", total: "$22.50", ref: "$30.00", n: 6, disc: 25 },
  { id: "m12", mo: "$2.75", total: "$33.00", ref: "$60.00", n: 12, disc: 45 },
];

const LEVELS: { terms: Term[]; devKey: "plan_devices" | "plan_devices1"; featKey: "plan4" | "plan4_one" }[] = [
  { terms: TERMS_3, devKey: "plan_devices", featKey: "plan4" },
  { terms: TERMS_1, devKey: "plan_devices1", featKey: "plan4_one" },
];

const PLATFORMS = "iOS · Android · Windows · macOS · TV";

const dict: Record<Lang, Record<string, string>> = {
  en: {
    nav_features: "Features", nav_pricing: "Pricing", nav_faq: "FAQ", nav_guides: "Guides",
    nav_signin: "Sign in", nav_get: "Get Started",
    badge: "VLESS + REALITY · No auto-renewal",
    hero_t1: "Privacy.", hero_t2: "Perfected.",
    hero_sub: "To the network, your connection looks like a visit to an ordinary website. Sign up with Telegram, no email needed.",
    hero_cta1: "Connect - from $6.59/mo", hero_cta2: "Learn more",
    b1_k: "Protocol", b1_t: "Looks like a website.",
    b1_b: "VLESS + REALITY, with locations in Europe, the US and Asia. Your app always shows the current list.",
    b2_k: "Privacy", b2_t: "Only what billing needs.",
    b2_b: "We keep traffic totals and last-connection time. Everything we store is listed in our Privacy Policy.",
    b3_k: "Devices", b3_t: "Your devices.",
    b3_b: "Up to 3 devices: iPhone, Android, Mac, Windows or TV. Extra devices $5 per 30 days.",
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
    faq_q2: "How do I pay?", faq_a2: "By card or in cryptocurrency. Three devices cost $79.08 once for 12 months ($6.59/mo); one device costs $33 for 12 months.",
    faq_q3: "How many devices can I use?", faq_a3: "A plan covers 1 or 3 devices. Each extra device costs $5 per 30 days.",
    faq_q4: "Does Kovra renew automatically?", faq_a4: "No. You pay once for 1, 6 or 12 months, and access ends when the term ends.",
    band_h2: "Take back your privacy.", band_p: "Up to 3 devices for $79.08 a year, paid once. Nothing renews automatically.", band_btn: "Get Kovra",
    foot_terms: "Terms", foot_privacy: "Privacy", copyright: "© 2026 Kovra",
  },
  ru: {
    nav_features: "Возможности", nav_pricing: "Цена", nav_faq: "Вопросы", nav_guides: "Гайды",
    nav_signin: "Войти", nav_get: "Подключить",
    badge: "VLESS + REALITY · Без автопродления",
    hero_t1: "Приватность.", hero_t2: "И точка.",
    hero_sub: "Для сети ваше соединение выглядит как заход на обычный сайт. Регистрация через Telegram, без почты.",
    hero_cta1: "Подключить - от $6.59/мес", hero_cta2: "Подробнее",
    b1_k: "Протокол", b1_t: "Выглядит как сайт.",
    b1_b: "VLESS + REALITY, локации в Европе, США и Азии. Актуальный список всегда в приложении.",
    b2_k: "Приватность", b2_t: "Только то, что нужно для оплаты.",
    b2_b: "Мы храним объём трафика и время последнего подключения. Всё, что мы храним, перечислено в Политике конфиденциальности.",
    b3_k: "Устройства", b3_t: "Ваши устройства.",
    b3_b: "До 3 устройств: iPhone, Android, Mac, Windows или ТВ. Дополнительное устройство: $5 за 30 дней.",
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
    faq_q2: "Как происходит оплата?", faq_a2: "Картой или криптовалютой. Три устройства: $79.08 разово за 12 месяцев ($6.59/мес); одно устройство: $33 за 12 месяцев.",
    faq_q3: "Сколько устройств можно использовать?", faq_a3: "Тариф рассчитан на 1 или 3 устройства. Каждое дополнительное: $5 за 30 дней.",
    faq_q4: "Продлевается ли Kovra автоматически?", faq_a4: "Нет. Вы платите разово за 1, 6 или 12 месяцев, и доступ заканчивается вместе со сроком.",
    band_h2: "Верни себе приватность.", band_p: "До 3 устройств за $79.08 в год, разовой оплатой. Автопродления нет.", band_btn: "Подключить",
    foot_terms: "Условия", foot_privacy: "Конфиденциальность", copyright: "© 2026 Kovra",
  },
  es: {
    nav_features: "Funciones", nav_pricing: "Precio", nav_faq: "Preguntas", nav_guides: "Guías",
    nav_signin: "Entrar", nav_get: "Empezar",
    badge: "VLESS + REALITY · Sin renovación automática",
    hero_t1: "Privacidad.", hero_t2: "Perfecta.",
    hero_sub: "Para la red, tu conexión parece una visita a un sitio web corriente. Regístrate con Telegram, sin email.",
    hero_cta1: "Conéctate - desde $6.59/mes", hero_cta2: "Saber más",
    b1_k: "Protocolo", b1_t: "Parece un sitio web.",
    b1_b: "VLESS + REALITY, con ubicaciones en Europa, EE. UU. y Asia. Tu app siempre muestra la lista actual.",
    b2_k: "Privacidad", b2_t: "Solo lo que exige el cobro.",
    b2_b: "Guardamos el volumen de tráfico y la hora de la última conexión. Todo lo que guardamos figura en nuestra Política de privacidad.",
    b3_k: "Dispositivos", b3_t: "Tus dispositivos.",
    b3_b: "Hasta 3 dispositivos: iPhone, Android, Mac, Windows o TV. Cada dispositivo extra, $5 por 30 días.",
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
    faq_q2: "¿Cómo pago?", faq_a2: "Con tarjeta o criptomoneda. Tres dispositivos cuestan $79.08 en un solo pago por 12 meses ($6.59/mes); un dispositivo, $33 por 12 meses.",
    faq_q3: "¿Cuántos dispositivos puedo usar?", faq_a3: "Un plan cubre 1 o 3 dispositivos. Cada dispositivo extra cuesta $5 por 30 días.",
    faq_q4: "¿Kovra se renueva automáticamente?", faq_a4: "No. Pagas una vez por 1, 6 o 12 meses y el acceso termina cuando acaba el plazo.",
    band_h2: "Recupera tu privacidad.", band_p: "Hasta 3 dispositivos por $79.08 al año, en un solo pago. Nada se renueva automáticamente.", band_btn: "Obtén Kovra",
    foot_terms: "Términos", foot_privacy: "Privacidad", copyright: "© 2026 Kovra",
  },
  de: {
    nav_features: "Funktionen", nav_pricing: "Preis", nav_faq: "FAQ", nav_guides: "Guides",
    nav_signin: "Anmelden", nav_get: "Loslegen",
    badge: "VLESS + REALITY · Keine automatische Verlängerung",
    hero_t1: "Privatsphäre.", hero_t2: "Perfektioniert.",
    hero_sub: "Für das Netz sieht deine Verbindung wie der Besuch einer gewöhnlichen Website aus. Anmeldung per Telegram, ohne E-Mail.",
    hero_cta1: "Verbinden - ab $6.59/Mon.", hero_cta2: "Mehr erfahren",
    b1_k: "Protokoll", b1_t: "Sieht aus wie eine Website.",
    b1_b: "VLESS + REALITY, mit Standorten in Europa, den USA und Asien. Deine App zeigt immer die aktuelle Liste.",
    b2_k: "Privatsphäre", b2_t: "Nur, was die Abrechnung braucht.",
    b2_b: "Wir speichern Datenvolumen und Zeitpunkt der letzten Verbindung. Alles, was wir speichern, steht in unserer Datenschutzerklärung.",
    b3_k: "Geräte", b3_t: "Deine Geräte.",
    b3_b: "Bis zu 3 Geräte: iPhone, Android, Mac, Windows oder TV. Jedes weitere Gerät $5 pro 30 Tage.",
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
    faq_q2: "Wie bezahle ich?", faq_a2: "Per Karte oder Kryptowährung. Drei Geräte kosten $79.08 einmalig für 12 Monate ($6.59/Mon.); ein Gerät $33 für 12 Monate.",
    faq_q3: "Wie viele Geräte kann ich nutzen?", faq_a3: "Ein Tarif deckt 1 oder 3 Geräte. Jedes weitere Gerät kostet $5 pro 30 Tage.",
    faq_q4: "Verlängert sich Kovra automatisch?", faq_a4: "Nein. Du zahlst einmal für 1, 6 oder 12 Monate, und der Zugang endet mit der Laufzeit.",
    band_h2: "Hol dir deine Privatsphäre zurück.", band_p: "Bis zu 3 Geräte für $79.08 im Jahr, einmalig bezahlt. Nichts verlängert sich automatisch.", band_btn: "Kovra holen",
    foot_terms: "AGB", foot_privacy: "Datenschutz", copyright: "© 2026 Kovra",
  },
  fr: {
    nav_features: "Fonctions", nav_pricing: "Tarif", nav_faq: "FAQ", nav_guides: "Guides",
    nav_signin: "Connexion", nav_get: "Commencer",
    badge: "VLESS + REALITY · Sans renouvellement automatique",
    hero_t1: "Confidentialité.", hero_t2: "Perfectionnée.",
    hero_sub: "Pour le réseau, votre connexion ressemble à la visite d'un site ordinaire. Inscription via Telegram, sans e-mail.",
    hero_cta1: "Se connecter - dès 6.59 $/mois", hero_cta2: "En savoir plus",
    b1_k: "Protocole", b1_t: "Comme un site web.",
    b1_b: "VLESS + REALITY, avec des emplacements en Europe, aux États-Unis et en Asie. Votre application affiche toujours la liste à jour.",
    b2_k: "Confidentialité", b2_t: "Seulement ce que la facturation exige.",
    b2_b: "Nous conservons le volume de trafic et l'heure de la dernière connexion. Tout ce que nous conservons figure dans notre Politique de confidentialité.",
    b3_k: "Appareils", b3_t: "Vos appareils.",
    b3_b: "Jusqu'à 3 appareils : iPhone, Android, Mac, Windows ou TV. Chaque appareil supplémentaire, 5 $ pour 30 jours.",
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
    faq_q2: "Comment payer ?", faq_a2: "Par carte ou en cryptomonnaie. Trois appareils coûtent 79.08 $ en une fois pour 12 mois (6.59 $/mois) ; un appareil, 33 $ pour 12 mois.",
    faq_q3: "Combien d'appareils puis-je utiliser ?", faq_a3: "Une offre couvre 1 ou 3 appareils. Chaque appareil supplémentaire coûte 5 $ pour 30 jours.",
    faq_q4: "Kovra se renouvelle-t-il automatiquement ?", faq_a4: "Non. Vous payez une fois pour 1, 6 ou 12 mois, et l'accès prend fin avec la durée.",
    band_h2: "Reprenez votre confidentialité.", band_p: "Jusqu'à 3 appareils pour 79.08 $ par an, payés en une fois. Rien ne se renouvelle automatiquement.", band_btn: "Obtenir Kovra",
    foot_terms: "Conditions", foot_privacy: "Confidentialité", copyright: "© 2026 Kovra",
  },
};

/* ── stroke icons (1.5px, monochrome) ─────────────────── */
const ICheck = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
);
const IArrow = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

/* hero line mask-reveal, 90ms stagger */
function Lines({ lines, base = 120, step = 90 }: { lines: string[]; base?: number; step?: number }) {
  return (
    <>
      {lines.map((l, i) => (
        <span className="k-word" key={`${l}-${i}`}>
          <span className="k-metal" style={{ transitionDelay: `${base + i * step}ms` }}>{l}</span>
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function FaqItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`k-acc-item${open ? " open" : ""}`}>
      <button className="k-acc-q" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {q}
        <span className="k-acc-plus" aria-hidden="true" />
      </button>
      <div className="k-acc-a">
        <div className="k-acc-a-in">
          <p>{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [lang, setLang] = useState<Lang>("en");
  const [level, setLevel] = useState<0 | 1>(0);
  const [term3, setTerm3] = useState<TermId>("m12");
  const [term1, setTerm1] = useState<TermId>("m12");
  const [scrolled, setScrolled] = useState(false);
  const [heroIn, setHeroIn] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const sl = localStorage.getItem("kovra_lang");
        if (isLang(sl)) setLang(sl);
      } catch { /* ignore */ }
      setHeroIn(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // The boot script (src/app/layout.tsx) hides the page for a saved non-English
  // language; setLang and setHeroIn land in the same frame, so once heroIn is
  // true the page is already rendered in that language.
  useEffect(() => {
    if (heroIn) document.documentElement.classList.remove("kc-lang-pending");
  }, [heroIn]);

  // Persist the landing language. Until the boot above has read the saved one
  // (heroIn flips in the same frame) only seed the default on a first visit,
  // so the Localizer and the other pages read "en"; overwriting a saved
  // choice with the default would lose it.
  useEffect(() => {
    try {
      if (heroIn || !isLang(localStorage.getItem("kovra_lang"))) localStorage.setItem("kovra_lang", lang);
    } catch { /* ignore */ }
  }, [lang, heroIn]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const t = dict[lang];
  const steps = [
    { n: "01", t: t.step1_t, b: t.step1_b },
    { n: "02", t: t.step2_t, b: t.step2_b },
    { n: "03", t: t.step3_t, b: t.step3_b },
  ];
  const faqs = [
    { q: t.faq_q1, a: t.faq_a1 }, { q: t.faq_q2, a: t.faq_a2 },
    { q: t.faq_q3, a: t.faq_a3 }, { q: t.faq_q4, a: t.faq_a4 },
  ];

  const lv = LEVELS[level];
  const TERMS = lv.terms;
  const term = level === 0 ? term3 : term1;
  const setTerm = level === 0 ? setTerm3 : setTerm1;
  const sel = TERMS.find((x) => x.id === term)!;
  const devicesLabel = t[lv.devKey];
  const termLabel = (id: TermId) => (id === "m1" ? t.term1 : id === "m6" ? t.term6 : t.term12);
  // One payment for the whole term, no renewal (src/lib/subscriptions.ts):
  // `ref` is the same term bought month by month, never a "renewal price".
  const onceLabel = sel.n === 1 ? t.plan_once1 : t.plan_oncen.replace("{n}", String(sel.n));
  const vsMonthly = sel.ref ? t.plan_vs.replace("{ref}", sel.ref).replace("{n}", String(sel.n)) : "";
  const planFeatures = [t.plan1, t.plan2, t.plan3, t[lv.featKey], t.plan5];

  return (
    <div className="k-page kv" id="top">
      <noscript>
        <style>{`.k-rv,.k-stagger>*,.k-word>span{opacity:1 !important;transform:none !important}`}</style>
      </noscript>
      <div className="k-grain" aria-hidden="true" />
      <ThemeSync />

      {/* ── Header ── */}
      <header className={`kv-hd${scrolled ? " on" : ""}`}>
        <div className="kv-wrap kv-hd-in">
          <a className="kv-brand" href="#top">
            <KovraWordmark height={24} />
          </a>
          <nav className="kv-nav" aria-label="Sections">
            <a href="#features">{t.nav_features}</a>
            <a href="#pricing">{t.nav_pricing}</a>
            <a href="#faq">{t.nav_faq}</a>
            <a href="/guides">{t.nav_guides}</a>
          </nav>
          <div className="kv-hd-right kh-bar">
            <PrefsCapsule
              lang={lang}
              onLang={(l) => {
                setLang(l);
                // an explicit choice: the cabinet honours it (English too) and <html lang> follows
                persistLang(l);
              }}
            />
            <a className="kv-signin" href="/login">{t.nav_signin}</a>
            <a className="k-btn k-btn-gold" href="/register">{t.nav_get}</a>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="kv-hero">
          <div className={`kv-wrap kv-hero-in${heroIn ? " is-in" : ""}`}>
            <p className="kv-badge k-mono k-rv" style={{ transitionDelay: "0ms" }}>
              {t.badge}
            </p>
            <h1 className="kv-h1">
              <Lines lines={[t.hero_t1, t.hero_t2]} />
            </h1>
            <p className="kv-hero-sub k-rv" style={{ transitionDelay: "440ms" }}>{t.hero_sub}</p>
            <div className="kv-hero-cta k-rv" style={{ transitionDelay: "560ms" }}>
              <a className="k-btn k-btn-gold" href="/register">{t.hero_cta1}</a>
              <a className="k-btn k-btn-ghost" href="#features">{t.hero_cta2}</a>
            </div>
          </div>
        </section>

        {/* ── Bento features ── */}
        <section className="kv-sec kv-first" id="features">
          <div className="kv-wrap">
            <Reveal className="kv-bento" stagger>
              <div className="kv-card w7">
                <p className="k-mono">{t.b1_k}</p>
                <h3>{t.b1_t}</h3>
                <p>{t.b1_b}</p>
                <div className="kv-ghost" aria-hidden="true">REALITY</div>
              </div>
              <div className="kv-card w5">
                <p className="k-mono">{t.b2_k}</p>
                <h3>{t.b2_t}</h3>
                <p>{t.b2_b}</p>
                <div className="kv-orb" aria-hidden="true" />
              </div>
              <div className="kv-card w5">
                <p className="k-mono">{t.b3_k}</p>
                <h3>{t.b3_t}</h3>
                <p>{t.b3_b}</p>
                <div className="kv-platforms k-mono" aria-hidden="true">{PLATFORMS}</div>
              </div>
              <div className="kv-card w7">
                <p className="k-mono">{t.b4_k}</p>
                <h3>{t.b4_t}</h3>
                <p>{t.b4_b}</p>
                <div className="kv-cardprice" aria-hidden="true">$6.59<em>{t.plan_permo}</em></div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="kv-how" id="how">
          <div className="kv-wrap">
            <Reveal className="kv-how-head">
              <p className="kv-kicker k-mono">{t.how_kicker}</p>
              <h2 className="kv-h2">{t.how_h2}</h2>
              <p className="kv-lead">{t.how_lead}</p>
            </Reveal>
            <Reveal className="kv-steps" stagger>
              {steps.map((s) => (
                <div className="kv-step" key={s.n}>
                  <span className="k-mono">{s.n}</span>
                  <h4>{s.t}</h4>
                  <p>{s.b}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className="kv-price" id="pricing">
          <div className="kv-wrap">
            <Reveal className="kv-price-head">
              <p className="kv-kicker k-mono">{t.price_kicker}</p>
              <h2 className="kv-h2">{t.price_h2}</h2>
              <p className="kv-lead">{t.price_meta}</p>
            </Reveal>

            <div className="kv-price-grid">
              <Reveal className="kv-panel" delay={100}>
                <div className="kv-seg" role="group" aria-label={t.price_kicker}>
                  {LEVELS.map((l, i) => (
                    <button
                      key={l.devKey}
                      className={level === i ? "on" : ""}
                      aria-pressed={level === i}
                      onClick={() => setLevel(i as 0 | 1)}
                    >
                      {t[l.devKey]}
                    </button>
                  ))}
                </div>

                <div className="kv-terms" role="radiogroup" aria-label={t.price_h2}>
                  {TERMS.map((o) => (
                    <button
                      key={o.id}
                      role="radio"
                      aria-checked={o.id === term}
                      className={`kv-term${o.id === term ? " on" : ""}`}
                      onClick={() => setTerm(o.id)}
                    >
                      <span className="kv-term-dot" aria-hidden="true" />
                      <span>{termLabel(o.id)}</span>
                      {o.disc > 0 && <span className="kv-term-badge">-{o.disc}%</span>}
                      {o.id === "m12" && <span className="kv-term-badge">{t.badge_best}</span>}
                      <span className="kv-term-price">{o.mo}{t.plan_permo}</span>
                    </button>
                  ))}
                </div>

                <div className="kv-price-tag">
                  <DigitRoll value={sel.mo} />
                  <span>{t.plan_permo} · {devicesLabel}</span>
                </div>
                <p className="kv-fine">
                  <b>{sel.total}</b> {onceLabel}. {t.plan_no_renew}
                </p>

                <ul className="kv-list">
                  {planFeatures.map((p) => (
                    <li key={p}><ICheck />{p}</li>
                  ))}
                </ul>
                <a className="k-btn k-btn-gold" href="/register">{t.price_btn}<IArrow /></a>
              </Reveal>

              <Reveal className="kv-honest" delay={200}>
                <p className="k-mono">{t.price_honest}</p>
                <div className="kv-honest-num">
                  <DigitRoll value={sel.total} />
                  <small>{onceLabel}</small>
                </div>
                <div className="kv-honest-rows">
                  <span>
                    <b style={{ color: "var(--k-text)" }}>{t.plan_no_renew}</b>
                  </span>
                  {sel.disc > 0 && <span>{vsMonthly} · −{sel.disc}%</span>}
                </div>
                <p className="kv-honest-note">{t.plan_savings}</p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="kv-faq" id="faq">
          <div className="kv-wrap kv-faq-grid">
            <Reveal>
              <p className="kv-kicker k-mono">{t.faq_kicker}</p>
              <h2 className="kv-h2">{t.faq_h2}</h2>
            </Reveal>
            <Reveal className="k-acc" delay={100}>
              {faqs.map((f, i) => (
                <FaqItem key={f.q} q={f.q} a={f.a} defaultOpen={i === 0} />
              ))}
            </Reveal>
          </div>
        </section>

        {/* ── Final band: the glow returns ── */}
        <section className="kv-band">
          <div className="kv-wrap">
            <Reveal className="kv-band-card">
              <h2 className="k-metal">{t.band_h2}</h2>
              <p>{t.band_p}</p>
              <a className="k-btn k-btn-gold" href="/register">{t.band_btn}<IArrow /></a>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="kv-foot">
        <div className="kv-wrap kv-foot-in">
          <a className="kv-brand" href="#top" style={{ fontSize: 17 }}>
            <KovraWordmark height={20} />
          </a>
          <nav className="kv-foot-links" aria-label="Footer">
            <a href="#features">{t.nav_features}</a>
            <a href="#pricing">{t.nav_pricing}</a>
            <a href="#faq">{t.nav_faq}</a>
            <a href="/guides">{t.nav_guides}</a>
            <a href="/terms">{t.foot_terms}</a>
            <a href="/privacy">{t.foot_privacy}</a>
            <a href="mailto:support@kovravpn.com">support@kovravpn.com</a>
          </nav>
          <span className="kv-copy">{t.copyright}</span>
        </div>
      </footer>
    </div>
  );
}

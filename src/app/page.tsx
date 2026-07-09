"use client";
// src/app/page.tsx — Kovra landing v3 "Privacy. Perfected."
// Apple-keynote minimal: total black, giant metallic display type,
// bento feature grid, a single warm gold glow (the orb).
// i18n (EN/RU/ES/DE/FR) via the page dictionary below; dark/light theme
// via <html data-theme> (shared with the rest of the site). Backend untouched.

import { useEffect, useRef, useState } from "react";
import Reveal from "@/components/fx/Reveal";
import DigitRoll from "@/components/fx/DigitRoll";
import "./home.css";

type Lang = "en" | "ru" | "es" | "de" | "fr";
type Theme = "dark" | "light";
type TermId = "m1" | "m6" | "m12";
type Term = { id: TermId; mo: string; total: string; ref: string | null; n: number; disc: number; per: "mo" | "p6" | "yr" };

// Level 0 — up to 3 devices
const TERMS_3: Term[] = [
  { id: "m1", mo: "$11.99", total: "$11.99", ref: null, n: 1, disc: 0, per: "mo" },
  { id: "m6", mo: "$8.99", total: "$53.94", ref: "$71.94", n: 6, disc: 25, per: "p6" },
  { id: "m12", mo: "$6.59", total: "$79.08", ref: "$143.88", n: 12, disc: 45, per: "yr" },
];

// Level 1 — 1 device ($5/mo base, same 25% / 45% term discounts)
const TERMS_1: Term[] = [
  { id: "m1", mo: "$5.00", total: "$5.00", ref: null, n: 1, disc: 0, per: "mo" },
  { id: "m6", mo: "$3.75", total: "$22.50", ref: "$30.00", n: 6, disc: 25, per: "p6" },
  { id: "m12", mo: "$2.75", total: "$33.00", ref: "$60.00", n: 12, disc: 45, per: "yr" },
];

const LEVELS: { terms: Term[]; devKey: "plan_devices" | "plan_devices1"; featKey: "plan4" | "plan4_one" }[] = [
  { terms: TERMS_3, devKey: "plan_devices", featKey: "plan4" },
  { terms: TERMS_1, devKey: "plan_devices1", featKey: "plan4_one" },
];

const PLATFORMS = "iOS · Android · Windows · macOS · TV";

const LANGS: Record<Lang, { code: string; native: string }> = {
  en: { code: "EN", native: "English" },
  ru: { code: "RU", native: "Русский" },
  es: { code: "ES", native: "Español" },
  de: { code: "DE", native: "Deutsch" },
  fr: { code: "FR", native: "Français" },
};

const dict: Record<Lang, Record<string, string>> = {
  en: {
    nav_features: "Features", nav_pricing: "Pricing", nav_faq: "FAQ", nav_guides: "Guides",
    nav_signin: "Sign in", nav_get: "Get Started",
    badge: "No logs · No contracts",
    hero_t1: "Privacy.", hero_t2: "Perfected.",
    hero_sub: "Next-generation encryption with zero logs. Fixed pricing, absolute anonymity.",
    hero_cta1: "Connect - from $6.59/mo", hero_cta2: "Learn more",
    b1_k: "Network", b1_t: "Built for speed.",
    b1_b: "25 Gbps infrastructure across 30+ regions. Under 20 ms latency globally.",
    b2_k: "Security", b2_t: "Zero logs.",
    b2_b: "Nothing recorded - nothing to hand over.",
    b3_k: "Devices", b3_t: "Connect everything.",
    b3_b: "One plan covers up to 3 devices on any platform.",
    b4_k: "Payments", b4_t: "Crypto & cards.",
    b4_b: "Pay with crypto for maximum privacy - or just use a card. No hidden fees.",
    how_kicker: "How it works", how_h2: "Connected in under a minute.",
    how_lead: "No setup headaches. Create an account, top up, and connect - your encrypted tunnel is live.",
    step1_t: "Create your account", step1_b: "Email or Telegram - takes seconds.",
    step2_t: "Top up your balance", step2_b: "Pay with crypto or card. One plan covers up to 3 devices.",
    step3_t: "Connect", step3_b: "Import your profile and tap connect on any device.",
    price_kicker: "Pricing", price_h2: "One plan. Pick your term.",
    price_honest: "Honest pricing",
    plan_permo: "/mo", plan_devices: "up to 3 devices", plan_devices1: "1 device",
    term1: "1 month", term6: "6 months", term12: "1 year", badge_best: "Best value",
    plan_first: "for the first {n} mo.", plan_vat: "VAT may apply.",
    plan_savings: "Savings compare the intro price with the renewal price.",
    plan_renews: "Renews at", per_mo: "/month", per_p6: "/6 mo", per_yr: "/year",
    price_meta: "Top up your balance anytime. Cancel by simply not renewing.",
    plan1: "Access to every server region", plan2: "Full speed, unlimited bandwidth", plan3: "Strict no-logs privacy",
    plan4: "Up to 3 devices, any platform", plan4_one: "1 device, any platform", plan5: "Pay with crypto or card", price_btn: "Get started",
    faq_kicker: "FAQ", faq_h2: "Questions, answered.",
    faq_q1: "Do you keep logs?", faq_a1: "No. Kovra is built around a strict no-logs approach - we don't record your browsing, traffic or connection history.",
    faq_q2: "How do I pay?", faq_a2: "Pay with cryptocurrency or a bank card. One plan covers up to 3 devices, from $6.59/mo on the annual term.",
    faq_q3: "How many devices can I use?", faq_a3: "One plan covers up to 3 devices at once. Longer terms lower the monthly price - down to $6.59/mo on the annual plan.",
    faq_q4: "Can I cancel anytime?", faq_a4: "Yes. There's no lock-in - your access simply stops when your balance runs out and you choose not to top up.",
    band_h2: "Take back your privacy.", band_p: "From $6.59 a month for up to 3 devices. No logs, no throttling, no contracts.", band_btn: "Get Kovra",
    foot_terms: "Terms", foot_privacy: "Privacy", copyright: "© 2026 Kovra",
    a11y_theme: "Toggle theme", a11y_lang: "Choose language",
  },
  ru: {
    nav_features: "Возможности", nav_pricing: "Цена", nav_faq: "Вопросы", nav_guides: "Гайды",
    nav_signin: "Войти", nav_get: "Подключить",
    badge: "Без логов · Без договоров",
    hero_t1: "Приватность.", hero_t2: "И точка.",
    hero_sub: "Шифрование нового поколения. Ноль логов, фиксированная цена, полная анонимность.",
    hero_cta1: "Подключить - от $6.59/мес", hero_cta2: "Подробнее",
    b1_k: "Сеть", b1_t: "Создан для скорости.",
    b1_b: "Инфраструктура 25 Гбит/с в 30+ регионах. Задержка ниже 20 мс по всему миру.",
    b2_k: "Безопасность", b2_t: "Ноль логов.",
    b2_b: "Ничего не записываем - нечего выдавать.",
    b3_k: "Устройства", b3_t: "Подключи всё.",
    b3_b: "Один тариф - до 3 устройств на любой платформе.",
    b4_k: "Оплата", b4_t: "Крипта и карты.",
    b4_b: "Плати криптой для максимальной приватности - или просто картой. Без скрытых комиссий.",
    how_kicker: "Как это работает", how_h2: "Подключение меньше чем за минуту.",
    how_lead: "Никаких сложных настроек. Создай аккаунт, пополни баланс и подключись - зашифрованный туннель уже работает.",
    step1_t: "Создай аккаунт", step1_b: "Email или Telegram - пара секунд.",
    step2_t: "Пополни баланс", step2_b: "Оплата криптой или картой. Один тариф - до 3 устройств.",
    step3_t: "Подключись", step3_b: "Импортируй профиль и нажми «подключить» на любом устройстве.",
    price_kicker: "Цена", price_h2: "Один тариф. Выбери срок.",
    price_honest: "Честно о цене",
    plan_permo: "/мес", plan_devices: "до 3 устройств", plan_devices1: "1 устройство",
    term1: "1 месяц", term6: "6 месяцев", term12: "1 год", badge_best: "Лучшая цена",
    plan_first: "за первые {n} мес.", plan_vat: "Может взиматься НДС.",
    plan_savings: "Экономия - сравнение начальной цены со стоимостью продления.",
    plan_renews: "Продлевается за", per_mo: "/мес", per_p6: "/6 мес", per_yr: "/год",
    price_meta: "Пополняй баланс когда угодно. Чтобы отменить - просто не продлевай.",
    plan1: "Доступ ко всем регионам серверов", plan2: "Полная скорость, безлимитный трафик", plan3: "Строгая приватность без логов",
    plan4: "До 3 устройств, любая платформа", plan4_one: "1 устройство, любая платформа", plan5: "Оплата криптой или картой", price_btn: "Начать",
    faq_kicker: "Вопросы", faq_h2: "Отвечаем на вопросы.",
    faq_q1: "Вы храните логи?", faq_a1: "Нет. Kovra построена на строгом принципе отсутствия логов - мы не записываем историю посещений, трафик или подключения.",
    faq_q2: "Как происходит оплата?", faq_a2: "Оплата криптовалютой или банковской картой. Один тариф покрывает до 3 устройств, от $6.59/мес на годовом сроке.",
    faq_q3: "Сколько устройств можно использовать?", faq_a3: "Один тариф - до 3 устройств одновременно. Чем дольше срок, тем дешевле месяц: до $6.59/мес на годовом плане.",
    faq_q4: "Можно отменить в любой момент?", faq_a4: "Да. Никаких привязок - доступ просто прекращается, когда баланс заканчивается и ты решаешь не пополнять.",
    band_h2: "Верни себе приватность.", band_p: "От $6.59 в месяц за 3 устройства. Без логов, без замедления, без договоров.", band_btn: "Подключить",
    foot_terms: "Условия", foot_privacy: "Конфиденциальность", copyright: "© 2026 Kovra",
    a11y_theme: "Переключить тему", a11y_lang: "Выбрать язык",
  },
  es: {
    nav_features: "Funciones", nav_pricing: "Precio", nav_faq: "Preguntas", nav_guides: "Guías",
    nav_signin: "Entrar", nav_get: "Empezar",
    badge: "Sin registros · Sin contratos",
    hero_t1: "Privacidad.", hero_t2: "Perfecta.",
    hero_sub: "Cifrado de nueva generación sin registros. Precio fijo, anonimato absoluto.",
    hero_cta1: "Conéctate - desde $6.59/mes", hero_cta2: "Saber más",
    b1_k: "Red", b1_t: "Hecho para la velocidad.",
    b1_b: "Infraestructura de 25 Gbps en más de 30 regiones. Latencia global por debajo de 20 ms.",
    b2_k: "Seguridad", b2_t: "Cero registros.",
    b2_b: "No grabamos nada - no hay nada que entregar.",
    b3_k: "Dispositivos", b3_t: "Conéctalo todo.",
    b3_b: "Un plan cubre hasta 3 dispositivos en cualquier plataforma.",
    b4_k: "Pagos", b4_t: "Cripto y tarjetas.",
    b4_b: "Paga con cripto para máxima privacidad - o simplemente con tarjeta. Sin comisiones ocultas.",
    how_kicker: "Cómo funciona", how_h2: "Conectado en menos de un minuto.",
    how_lead: "Sin configuraciones complicadas. Crea una cuenta, recarga y conéctate - tu túnel cifrado ya está activo.",
    step1_t: "Crea tu cuenta", step1_b: "Email o Telegram - cuestión de segundos.",
    step2_t: "Recarga tu saldo", step2_b: "Paga con cripto o tarjeta. Un plan cubre hasta 3 dispositivos.",
    step3_t: "Conéctate", step3_b: "Importa tu perfil y toca conectar en cualquier dispositivo.",
    price_kicker: "Precio", price_h2: "Un plan. Elige el plazo.",
    price_honest: "Precio honesto",
    plan_permo: "/mes", plan_devices: "hasta 3 dispositivos", plan_devices1: "1 dispositivo",
    term1: "1 mes", term6: "6 meses", term12: "1 año", badge_best: "Mejor precio",
    plan_first: "los primeros {n} meses", plan_vat: "Puede aplicarse IVA.",
    plan_savings: "El ahorro compara el precio inicial con el de renovación.",
    plan_renews: "Se renueva por", per_mo: "/mes", per_p6: "/6 meses", per_yr: "/año",
    price_meta: "Recarga tu saldo cuando quieras. Cancela simplemente no renovando.",
    plan1: "Acceso a todas las regiones de servidores", plan2: "Velocidad completa, ancho de banda ilimitado", plan3: "Privacidad estricta sin registros",
    plan4: "Hasta 3 dispositivos, cualquier plataforma", plan4_one: "1 dispositivo, cualquier plataforma", plan5: "Paga con cripto o tarjeta", price_btn: "Empezar",
    faq_kicker: "Preguntas", faq_h2: "Preguntas, resueltas.",
    faq_q1: "¿Guardan registros?", faq_a1: "No. Kovra se basa en una política estricta de cero registros - no guardamos tu navegación, tráfico ni historial de conexión.",
    faq_q2: "¿Cómo pago?", faq_a2: "Paga con criptomoneda o tarjeta bancaria. Un plan cubre hasta 3 dispositivos, desde $6.59/mes en el plan anual.",
    faq_q3: "¿Cuántos dispositivos puedo usar?", faq_a3: "Un plan cubre hasta 3 dispositivos a la vez. Cuanto más largo el plazo, más barato el mes: hasta $6.59/mes en el plan anual.",
    faq_q4: "¿Puedo cancelar cuando quiera?", faq_a4: "Sí. Sin permanencia - tu acceso simplemente se detiene cuando se agota el saldo y decides no recargar.",
    band_h2: "Recupera tu privacidad.", band_p: "Desde $6.59 al mes para 3 dispositivos. Sin registros, sin limitaciones, sin contratos.", band_btn: "Obtén Kovra",
    foot_terms: "Términos", foot_privacy: "Privacidad", copyright: "© 2026 Kovra",
    a11y_theme: "Cambiar tema", a11y_lang: "Elegir idioma",
  },
  de: {
    nav_features: "Funktionen", nav_pricing: "Preis", nav_faq: "FAQ", nav_guides: "Guides",
    nav_signin: "Anmelden", nav_get: "Loslegen",
    badge: "Keine Logs · Keine Verträge",
    hero_t1: "Privatsphäre.", hero_t2: "Perfektioniert.",
    hero_sub: "Verschlüsselung der nächsten Generation ohne Logs. Fester Preis, absolute Anonymität.",
    hero_cta1: "Verbinden - ab $6.59/Mon.", hero_cta2: "Mehr erfahren",
    b1_k: "Netzwerk", b1_t: "Für Tempo gebaut.",
    b1_b: "25-Gbit/s-Infrastruktur in über 30 Regionen. Weltweit unter 20 ms Latenz.",
    b2_k: "Sicherheit", b2_t: "Null Logs.",
    b2_b: "Nichts wird aufgezeichnet - nichts kann herausgegeben werden.",
    b3_k: "Geräte", b3_t: "Verbinde alles.",
    b3_b: "Ein Tarif deckt bis zu 3 Geräte auf jeder Plattform.",
    b4_k: "Zahlung", b4_t: "Krypto & Karten.",
    b4_b: "Zahle mit Krypto für maximale Privatsphäre - oder einfach mit Karte. Keine versteckten Gebühren.",
    how_kicker: "So funktioniert's", how_h2: "In unter einer Minute verbunden.",
    how_lead: "Kein Einrichtungsstress. Konto erstellen, aufladen und verbinden - dein verschlüsselter Tunnel läuft.",
    step1_t: "Konto erstellen", step1_b: "E-Mail oder Telegram - in Sekunden erledigt.",
    step2_t: "Guthaben aufladen", step2_b: "Zahle mit Krypto oder Karte. Ein Tarif deckt bis zu 3 Geräte.",
    step3_t: "Verbinden", step3_b: "Profil importieren und auf jedem Gerät auf Verbinden tippen.",
    price_kicker: "Preis", price_h2: "Ein Tarif. Wähle die Laufzeit.",
    price_honest: "Ehrlicher Preis",
    plan_permo: "/Mon.", plan_devices: "bis zu 3 Geräte", plan_devices1: "1 Gerät",
    term1: "1 Monat", term6: "6 Monate", term12: "1 Jahr", badge_best: "Bester Preis",
    plan_first: "für die ersten {n} Mon.", plan_vat: "Zzgl. ggf. MwSt.",
    plan_savings: "Die Ersparnis vergleicht den Einführungspreis mit dem Verlängerungspreis.",
    plan_renews: "Verlängerung für", per_mo: "/Monat", per_p6: "/6 Mon.", per_yr: "/Jahr",
    price_meta: "Lade dein Guthaben jederzeit auf. Zum Kündigen einfach nicht verlängern.",
    plan1: "Zugang zu allen Serverregionen", plan2: "Volles Tempo, unbegrenztes Datenvolumen", plan3: "Strikte Privatsphäre ohne Logs",
    plan4: "Bis zu 3 Geräte, jede Plattform", plan4_one: "1 Gerät, jede Plattform", plan5: "Zahle mit Krypto oder Karte", price_btn: "Loslegen",
    faq_kicker: "FAQ", faq_h2: "Fragen, beantwortet.",
    faq_q1: "Speichert ihr Logs?", faq_a1: "Nein. Kovra basiert auf einem strikten No-Logs-Prinzip - wir zeichnen weder dein Surfen noch Traffic oder Verbindungsverlauf auf.",
    faq_q2: "Wie bezahle ich?", faq_a2: "Zahle mit Kryptowährung oder Bankkarte. Ein Tarif deckt bis zu 3 Geräte, ab $6.59/Mon. im Jahrestarif.",
    faq_q3: "Wie viele Geräte kann ich nutzen?", faq_a3: "Ein Tarif deckt bis zu 3 Geräte gleichzeitig. Je länger die Laufzeit, desto günstiger der Monat - bis zu $6.59/Mon. im Jahrestarif.",
    faq_q4: "Kann ich jederzeit kündigen?", faq_a4: "Ja. Keine Bindung - dein Zugang endet einfach, wenn das Guthaben aufgebraucht ist und du nicht auflädst.",
    band_h2: "Hol dir deine Privatsphäre zurück.", band_p: "Ab $6.59 im Monat für 3 Geräte. Keine Logs, keine Drosselung, keine Verträge.", band_btn: "Kovra holen",
    foot_terms: "AGB", foot_privacy: "Datenschutz", copyright: "© 2026 Kovra",
    a11y_theme: "Farbschema wechseln", a11y_lang: "Sprache wählen",
  },
  fr: {
    nav_features: "Fonctions", nav_pricing: "Tarif", nav_faq: "FAQ", nav_guides: "Guides",
    nav_signin: "Connexion", nav_get: "Commencer",
    badge: "Sans journaux · Sans engagement",
    hero_t1: "Confidentialité.", hero_t2: "Perfectionnée.",
    hero_sub: "Chiffrement nouvelle génération, zéro journal. Prix fixe, anonymat absolu.",
    hero_cta1: "Se connecter - dès 6.59 $/mois", hero_cta2: "En savoir plus",
    b1_k: "Réseau", b1_t: "Conçu pour la vitesse.",
    b1_b: "Infrastructure 25 Gbit/s dans plus de 30 régions. Latence sous 20 ms partout.",
    b2_k: "Sécurité", b2_t: "Zéro journal.",
    b2_b: "Rien n'est enregistré - rien à transmettre.",
    b3_k: "Appareils", b3_t: "Connectez tout.",
    b3_b: "Une offre couvre jusqu'à 3 appareils, toutes plateformes.",
    b4_k: "Paiements", b4_t: "Crypto et cartes.",
    b4_b: "Payez en crypto pour une confidentialité maximale - ou simplement par carte. Sans frais cachés.",
    how_kicker: "Comment ça marche", how_h2: "Connecté en moins d'une minute.",
    how_lead: "Aucune configuration compliquée. Créez un compte, rechargez et connectez-vous - votre tunnel chiffré est actif.",
    step1_t: "Créez votre compte", step1_b: "E-mail ou Telegram - quelques secondes.",
    step2_t: "Rechargez votre solde", step2_b: "Payez en crypto ou par carte. Une offre couvre jusqu'à 3 appareils.",
    step3_t: "Connectez-vous", step3_b: "Importez votre profil et touchez connecter sur n'importe quel appareil.",
    price_kicker: "Tarif", price_h2: "Une offre. Choisissez la durée.",
    price_honest: "Prix honnête",
    plan_permo: "/mois", plan_devices: "jusqu'à 3 appareils", plan_devices1: "1 appareil",
    term1: "1 mois", term6: "6 mois", term12: "1 an", badge_best: "Meilleur prix",
    plan_first: "les {n} premiers mois", plan_vat: "TVA éventuellement applicable.",
    plan_savings: "L'économie compare le prix initial au prix de renouvellement.",
    plan_renews: "Renouvellement à", per_mo: "/mois", per_p6: "/6 mois", per_yr: "/an",
    price_meta: "Rechargez votre solde quand vous voulez. Pour annuler, ne renouvelez pas, c'est tout.",
    plan1: "Accès à toutes les régions de serveurs", plan2: "Pleine vitesse, bande passante illimitée", plan3: "Confidentialité stricte sans journaux",
    plan4: "Jusqu'à 3 appareils, toutes plateformes", plan4_one: "1 appareil, toutes plateformes", plan5: "Payez en crypto ou par carte", price_btn: "Commencer",
    faq_kicker: "FAQ", faq_h2: "Vos questions, nos réponses.",
    faq_q1: "Conservez-vous des journaux ?", faq_a1: "Non. Kovra repose sur une politique stricte sans journaux - nous n'enregistrons ni votre navigation, ni votre trafic, ni votre historique de connexion.",
    faq_q2: "Comment payer ?", faq_a2: "Payez en cryptomonnaie ou par carte bancaire. Une offre couvre jusqu'à 3 appareils, dès 6.59 $/mois sur l'offre annuelle.",
    faq_q3: "Combien d'appareils puis-je utiliser ?", faq_a3: "Une offre couvre jusqu'à 3 appareils à la fois. Plus la durée est longue, moins le mois coûte cher - jusqu'à 6.59 $/mois sur l'offre annuelle.",
    faq_q4: "Puis-je annuler à tout moment ?", faq_a4: "Oui. Aucun engagement - votre accès s'arrête simplement quand le solde est épuisé et que vous choisissez de ne pas recharger.",
    band_h2: "Reprenez votre confidentialité.", band_p: "Dès 6.59 $/mois pour 3 appareils. Sans journaux, sans bridage, sans contrat.", band_btn: "Obtenir Kovra",
    foot_terms: "Conditions", foot_privacy: "Confidentialité", copyright: "© 2026 Kovra",
    a11y_theme: "Changer de thème", a11y_lang: "Choisir la langue",
  },
};

/* ── stroke icons (1.5px, monochrome) ─────────────────── */
const IGlobe = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.6 2.8 2.6 15.2 0 18c-2.6-2.8-2.6-15.2 0-18z" /></svg>
);
const ISun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" /></svg>
);
const IMoon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.6 6.6 0 0 0 10 10z" /></svg>
);
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
  const [theme, setTheme] = useState<Theme>("dark");
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<0 | 1>(0);
  const [term3, setTerm3] = useState<TermId>("m12");
  const [term1, setTerm1] = useState<TermId>("m12");
  const [scrolled, setScrolled] = useState(false);
  const [heroIn, setHeroIn] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const sl = localStorage.getItem("kovra_lang") as Lang | null;
        if (sl && LANGS[sl]) setLang(sl);
      } catch { /* ignore */ }
      const cur = document.documentElement.getAttribute("data-theme");
      if (cur === "light" || cur === "dark") setTheme(cur);
      setHeroIn(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => { try { localStorage.setItem("kovra_lang", lang); } catch { /* ignore */ } }, [lang]);

  const toggleTheme = () => {
    setTheme((p) => {
      const next: Theme = p === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!langOpen) return;
    const onDown = (e: MouseEvent) => { if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [langOpen]);

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
  const perWord = sel.per === "yr" ? t.per_yr : sel.per === "p6" ? t.per_p6 : t.per_mo;
  const termLabel = (id: TermId) => (id === "m1" ? t.term1 : id === "m6" ? t.term6 : t.term12);
  const firstLabel = t.plan_first.replace("{n}", String(sel.n));
  const planFeatures = [t.plan1, t.plan2, t.plan3, t[lv.featKey], t.plan5];

  return (
    <div className="k-page kv" id="top">
      <noscript>
        <style>{`.k-rv,.k-stagger>*,.k-word>span{opacity:1 !important;transform:none !important}`}</style>
      </noscript>
      <div className="k-grain" aria-hidden="true" />

      {/* ── Header ── */}
      <header className={`kv-hd${scrolled ? " on" : ""}`}>
        <div className="kv-wrap kv-hd-in">
          <a className="kv-brand" href="#top">
            <img src="/icon-192.png" alt="" width={26} height={26} />
            Kovra<span className="kv-dot">.</span>
          </a>
          <nav className="kv-nav" aria-label="Sections">
            <a href="#features">{t.nav_features}</a>
            <a href="#pricing">{t.nav_pricing}</a>
            <a href="#faq">{t.nav_faq}</a>
            <a href="/guides">{t.nav_guides}</a>
          </nav>
          <div className="kv-hd-right">
            <div className="kv-menu-hold" ref={langRef}>
              <button
                className="kv-ctrl"
                onClick={() => setLangOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={langOpen}
                aria-label={t.a11y_lang}
              >
                <IGlobe />
                {LANGS[lang].code}
              </button>
              {langOpen && (
                <div className="kv-menu" role="listbox" aria-label={t.a11y_lang}>
                  {(Object.keys(LANGS) as Lang[]).map((code) => (
                    <button
                      key={code}
                      role="option"
                      aria-selected={code === lang}
                      className={code === lang ? "on" : ""}
                      onClick={() => { setLang(code); setLangOpen(false); }}
                    >
                      {LANGS[code].native}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="kv-ctrl icon" onClick={toggleTheme} aria-label={t.a11y_theme}>
              {theme === "dark" ? <ISun /> : <IMoon />}
            </button>
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
                <div className="kv-ghost" aria-hidden="true">25<em> Gbps</em></div>
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
                {sel.disc > 0 ? (
                  <p className="kv-fine">
                    <s>{sel.ref}</s> <b>{sel.total}</b> · {firstLabel} {t.plan_renews} {sel.ref}{perWord}. {t.plan_vat}
                  </p>
                ) : (
                  <p className="kv-fine">
                    <b>{sel.total}</b>{t.plan_permo}. {t.plan_renews} {sel.total}{perWord}. {t.plan_vat}
                  </p>
                )}

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
                  <small>{sel.disc > 0 ? firstLabel : t.plan_permo}</small>
                </div>
                <div className="kv-honest-rows">
                  <span>
                    {t.plan_renews} <b style={{ color: "var(--k-text)" }}>{sel.ref ?? sel.total}{perWord}</b>. {t.plan_vat}
                  </span>
                  {sel.disc > 0 && <span><s>{sel.ref}</s> → {sel.total} · −{sel.disc}%</span>}
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
            <img src="/icon-192.png" alt="" width={24} height={24} />
            Kovra<span className="kv-dot">.</span>
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

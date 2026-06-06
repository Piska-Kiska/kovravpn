"use client";
// src/app/page.tsx — Kovra landing. Restrained liquid glass + i18n (EN/RU/ES/DE/FR) + dark/light theme.
// Self-contained, drop-in. No globals.css / Tailwind dependency. Backend untouched.
// Hero stat numbers marked /* EDIT */ are placeholders — replace with real values.

import { useEffect, useRef, useState } from "react";

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

const LANGS: Record<Lang, { code: string; native: string }> = {
  en: { code: "EN", native: "English" },
  ru: { code: "RU", native: "Русский" },
  es: { code: "ES", native: "Español" },
  de: { code: "DE", native: "Deutsch" },
  fr: { code: "FR", native: "Français" },
};

const dict: Record<Lang, Record<string, string>> = {
  en: {
    nav_features: "Features", nav_pricing: "Pricing", nav_faq: "FAQ", nav_get: "Get Kovra",
    hero_eyebrow: "Private · Fast · from $6.59/mo",
    hero_h1a: "Fast, private,", hero_h1b: "and yours.",
    hero_sub: "Kovra encrypts everything you do online and routes it through high-speed servers worldwide. No logs, no throttling - one flat price.",
    hero_cta1: "Get Kovra - from $6.59/mo", hero_cta2: "How it works",
    trust1: "Modern encryption", trust2: "No activity logs", trust3: "Unlimited bandwidth",
    stat1: "Server regions", stat2: "Backbone speed", stat3: "Median latency", stat4: "Logs kept",
    feat_kicker: "Why Kovra", feat_h2: "Everything you need. Nothing you don't.",
    feat1_t: "Built for speed", feat1_b: "Next-generation tunneling on tuned servers keeps latency low and throughput high - smooth for streaming, calls and gaming.",
    feat2_t: "Private by default", feat2_b: "Strong encryption and a strict no-logs approach. We can't hand over or sell activity data we never store.",
    feat3_t: "Effortless", feat3_b: "One tap to connect on every device. One plan, one price - no tiers, no add-ons, no surprises.",
    how_kicker: "How it works", how_h2: "Connected in under a minute.",
    how_lead: "No setup headaches. Create an account, top up, and connect - your encrypted tunnel is live.",
    step1_t: "Create your account", step1_b: "Email or Telegram - takes seconds.",
    step2_t: "Top up your balance", step2_b: "Pay with crypto. One plan covers up to 3 devices.",
    step3_t: "Connect", step3_b: "Import your profile and tap connect on any device.",
    price_kicker: "Choose your plan", plan_permo: "/mo", plan_devices: "up to 3 devices", plan_devices1: "1 device",
    term1: "1 month", term6: "6 months", term12: "1 year", badge_best: "Best value",
    plan_first: "for the first {n} mo.", plan_vat: "VAT may apply.",
    plan_savings: "Savings compare the intro price with the renewal price.",
    plan_renews: "Renews at", per_mo: "/month", per_p6: "/6 mo", per_yr: "/year",
    price_meta: "Top up your balance anytime. Cancel by simply not renewing.",
    plan1: "Access to every server region", plan2: "Full speed, unlimited bandwidth", plan3: "Strict no-logs privacy",
    plan4: "Up to 3 devices, any platform", plan4_one: "1 device, any platform", plan5: "Pay with crypto", price_btn: "Get started",
    faq_kicker: "FAQ", faq_h2: "Questions, answered.",
    faq_q1: "Do you keep logs?", faq_a1: "No. Kovra is built around a strict no-logs approach - we don't record your browsing, traffic or connection history.",
    faq_q2: "How do I pay?", faq_a2: "Payments are made in cryptocurrency today. One plan covers up to 3 devices, from $6.59/mo on the annual term.",
    faq_q3: "How many devices can I use?", faq_a3: "One plan covers up to 3 devices at once. Longer terms lower the monthly price - down to $6.59/mo on the annual plan.",
    faq_q4: "Can I cancel anytime?", faq_a4: "Yes. There's no lock-in - your access simply stops when your balance runs out and you choose not to top up.",
    band_h2: "Take back your speed and privacy.", band_p: "From $6.59 a month for up to 3 devices. No logs, no throttling, no contracts.", band_btn: "Get Kovra",
    foot_terms: "Terms", foot_privacy: "Privacy", copyright: "© 2026 Kovra",
  },
  ru: {
    nav_features: "Возможности", nav_pricing: "Цена", nav_faq: "Вопросы", nav_get: "Подключить",
    hero_eyebrow: "Приватно · Быстро · от $6.59/мес",
    hero_h1a: "Быстро, приватно,", hero_h1b: "и только твоё.",
    hero_sub: "Kovra шифрует весь твой трафик и направляет его через быстрые серверы по всему миру. Без логов, без замедления - одна фиксированная цена.",
    hero_cta1: "Подключить - от $6.59/мес", hero_cta2: "Как это работает",
    trust1: "Современное шифрование", trust2: "Без логов активности", trust3: "Безлимитный трафик",
    stat1: "Регионов серверов", stat2: "Скорость канала", stat3: "Средняя задержка", stat4: "Логов хранится",
    feat_kicker: "Почему Kovra", feat_h2: "Всё, что нужно. Ничего лишнего.",
    feat1_t: "Создано для скорости", feat1_b: "Туннелирование нового поколения на оптимизированных серверах держит задержку низкой, а скорость высокой - комфортно для стриминга, звонков и игр.",
    feat2_t: "Приватность по умолчанию", feat2_b: "Сильное шифрование и строгий принцип отсутствия логов. Мы не можем передать или продать то, что никогда не храним.",
    feat3_t: "Без усилий", feat3_b: "Одно касание для подключения на любом устройстве. Один тариф, одна цена - без уровней, доплат и сюрпризов.",
    how_kicker: "Как это работает", how_h2: "Подключение меньше чем за минуту.",
    how_lead: "Никаких сложных настроек. Создай аккаунт, пополни баланс и подключись - зашифрованный туннель уже работает.",
    step1_t: "Создай аккаунт", step1_b: "Email или Telegram - пара секунд.",
    step2_t: "Пополни баланс", step2_b: "Оплата криптовалютой. Один тариф - до 3 устройств.",
    step3_t: "Подключись", step3_b: "Импортируй профиль и нажми «подключить» на любом устройстве.",
    price_kicker: "Выбери срок", plan_permo: "/мес", plan_devices: "до 3 устройств", plan_devices1: "1 устройство",
    term1: "1 месяц", term6: "6 месяцев", term12: "1 год", badge_best: "Лучшая цена",
    plan_first: "за первые {n} мес.", plan_vat: "Может взиматься НДС.",
    plan_savings: "Экономия - сравнение начальной цены со стоимостью продления.",
    plan_renews: "Продлевается за", per_mo: "/мес", per_p6: "/6 мес", per_yr: "/год",
    price_meta: "Пополняй баланс когда угодно. Чтобы отменить - просто не продлевай.",
    plan1: "Доступ ко всем регионам серверов", plan2: "Полная скорость, безлимитный трафик", plan3: "Строгая приватность без логов",
    plan4: "До 3 устройств, любая платформа", plan4_one: "1 устройство, любая платформа", plan5: "Оплата криптовалютой", price_btn: "Начать",
    faq_kicker: "Вопросы", faq_h2: "Отвечаем на вопросы.",
    faq_q1: "Вы храните логи?", faq_a1: "Нет. Kovra построена на строгом принципе отсутствия логов - мы не записываем историю посещений, трафик или подключения.",
    faq_q2: "Как происходит оплата?", faq_a2: "Сейчас оплата принимается в криптовалюте. Один тариф покрывает до 3 устройств, от $6.59/мес на годовом сроке.",
    faq_q3: "Сколько устройств можно использовать?", faq_a3: "Один тариф - до 3 устройств одновременно. Чем дольше срок, тем дешевле месяц: до $6.59/мес на годовом плане.",
    faq_q4: "Можно отменить в любой момент?", faq_a4: "Да. Никаких привязок - доступ просто прекращается, когда баланс заканчивается и ты решаешь не пополнять.",
    band_h2: "Верни себе скорость и приватность.", band_p: "От $6.59 в месяц за 3 устройства. Без логов, без замедления, без договоров.", band_btn: "Подключить",
    foot_terms: "Условия", foot_privacy: "Конфиденциальность", copyright: "© 2026 Kovra",
  },
  es: {
    nav_features: "Funciones", nav_pricing: "Precio", nav_faq: "Preguntas", nav_get: "Obtén Kovra",
    hero_eyebrow: "Privado · Rápido · desde $6.59/mes",
    hero_h1a: "Rápido, privado,", hero_h1b: "y tuyo.",
    hero_sub: "Kovra cifra todo lo que haces en línea y lo enruta a través de servidores de alta velocidad en todo el mundo. Sin registros, sin limitaciones - un precio único.",
    hero_cta1: "Obtén Kovra - desde $6.59/mes", hero_cta2: "Cómo funciona",
    trust1: "Cifrado moderno", trust2: "Sin registros de actividad", trust3: "Ancho de banda ilimitado",
    stat1: "Regiones de servidores", stat2: "Velocidad de red", stat3: "Latencia media", stat4: "Registros guardados",
    feat_kicker: "Por qué Kovra", feat_h2: "Todo lo que necesitas. Nada que no.",
    feat1_t: "Hecho para la velocidad", feat1_b: "La tunelización de nueva generación en servidores optimizados mantiene la latencia baja y el rendimiento alto - fluido para streaming, llamadas y juegos.",
    feat2_t: "Privado por defecto", feat2_b: "Cifrado fuerte y una política estricta de cero registros. No podemos entregar ni vender datos de actividad que nunca almacenamos.",
    feat3_t: "Sin complicaciones", feat3_b: "Un toque para conectarte en cualquier dispositivo. Un plan, un precio - sin niveles, sin extras, sin sorpresas.",
    how_kicker: "Cómo funciona", how_h2: "Conectado en menos de un minuto.",
    how_lead: "Sin configuraciones complicadas. Crea una cuenta, recarga y conéctate - tu túnel cifrado ya está activo.",
    step1_t: "Crea tu cuenta", step1_b: "Email o Telegram - cuestión de segundos.",
    step2_t: "Recarga tu saldo", step2_b: "Paga con cripto. Un plan cubre hasta 3 dispositivos.",
    step3_t: "Conéctate", step3_b: "Importa tu perfil y toca conectar en cualquier dispositivo.",
    price_kicker: "Elige tu plan", plan_permo: "/mes", plan_devices: "hasta 3 dispositivos", plan_devices1: "1 dispositivo",
    term1: "1 mes", term6: "6 meses", term12: "1 año", badge_best: "Mejor precio",
    plan_first: "los primeros {n} meses", plan_vat: "Puede aplicarse IVA.",
    plan_savings: "El ahorro compara el precio inicial con el de renovación.",
    plan_renews: "Se renueva por", per_mo: "/mes", per_p6: "/6 meses", per_yr: "/año",
    price_meta: "Recarga tu saldo cuando quieras. Cancela simplemente no renovando.",
    plan1: "Acceso a todas las regiones de servidores", plan2: "Velocidad completa, ancho de banda ilimitado", plan3: "Privacidad estricta sin registros",
    plan4: "Hasta 3 dispositivos, cualquier plataforma", plan4_one: "1 dispositivo, cualquier plataforma", plan5: "Paga con cripto", price_btn: "Empezar",
    faq_kicker: "Preguntas", faq_h2: "Preguntas, resueltas.",
    faq_q1: "¿Guardan registros?", faq_a1: "No. Kovra se basa en una política estricta de cero registros - no guardamos tu navegación, tráfico ni historial de conexión.",
    faq_q2: "¿Cómo pago?", faq_a2: "Los pagos se hacen en criptomoneda por ahora. Un plan cubre hasta 3 dispositivos, desde $6.59/mes en el plan anual.",
    faq_q3: "¿Cuántos dispositivos puedo usar?", faq_a3: "Un plan cubre hasta 3 dispositivos a la vez. Cuanto más largo el plazo, más barato el mes: hasta $6.59/mes en el plan anual.",
    faq_q4: "¿Puedo cancelar cuando quiera?", faq_a4: "Sí. Sin permanencia - tu acceso simplemente se detiene cuando se agota el saldo y decides no recargar.",
    band_h2: "Recupera tu velocidad y privacidad.", band_p: "Desde $6.59 al mes para 3 dispositivos. Sin registros, sin limitaciones, sin contratos.", band_btn: "Obtén Kovra",
    foot_terms: "Términos", foot_privacy: "Privacidad", copyright: "© 2026 Kovra",
  },
  de: {
    nav_features: "Funktionen", nav_pricing: "Preis", nav_faq: "FAQ", nav_get: "Kovra holen",
    hero_eyebrow: "Privat · Schnell · ab $6.59/Mon.",
    hero_h1a: "Schnell, privat,", hero_h1b: "und deins.",
    hero_sub: "Kovra verschlüsselt alles, was du online tust, und leitet es über schnelle Server weltweit. Keine Logs, keine Drosselung - ein fester Preis.",
    hero_cta1: "Kovra holen - ab $6.59/Mon.", hero_cta2: "So funktioniert's",
    trust1: "Moderne Verschlüsselung", trust2: "Keine Aktivitätslogs", trust3: "Unbegrenztes Datenvolumen",
    stat1: "Serverregionen", stat2: "Backbone-Tempo", stat3: "Mittlere Latenz", stat4: "Gespeicherte Logs",
    feat_kicker: "Warum Kovra", feat_h2: "Alles, was du brauchst. Nichts, was du nicht brauchst.",
    feat1_t: "Für Tempo gebaut", feat1_b: "Tunneling der nächsten Generation auf optimierten Servern hält die Latenz niedrig und den Durchsatz hoch - flüssig für Streaming, Anrufe und Gaming.",
    feat2_t: "Privat von Haus aus", feat2_b: "Starke Verschlüsselung und ein striktes No-Logs-Prinzip. Wir können keine Aktivitätsdaten herausgeben oder verkaufen, die wir nie speichern.",
    feat3_t: "Mühelos", feat3_b: "Ein Tippen, um auf jedem Gerät zu verbinden. Ein Tarif, ein Preis - keine Stufen, keine Extras, keine Überraschungen.",
    how_kicker: "So funktioniert's", how_h2: "In unter einer Minute verbunden.",
    how_lead: "Kein Einrichtungsstress. Konto erstellen, aufladen und verbinden - dein verschlüsselter Tunnel läuft.",
    step1_t: "Konto erstellen", step1_b: "E-Mail oder Telegram - in Sekunden erledigt.",
    step2_t: "Guthaben aufladen", step2_b: "Zahle mit Krypto. Ein Tarif deckt bis zu 3 Geräte.",
    step3_t: "Verbinden", step3_b: "Profil importieren und auf jedem Gerät auf Verbinden tippen.",
    price_kicker: "Wähle deinen Plan", plan_permo: "/Mon.", plan_devices: "bis zu 3 Geräte", plan_devices1: "1 Gerät",
    term1: "1 Monat", term6: "6 Monate", term12: "1 Jahr", badge_best: "Bester Preis",
    plan_first: "für die ersten {n} Mon.", plan_vat: "Zzgl. ggf. MwSt.",
    plan_savings: "Die Ersparnis vergleicht den Einführungspreis mit dem Verlängerungspreis.",
    plan_renews: "Verlängerung für", per_mo: "/Monat", per_p6: "/6 Mon.", per_yr: "/Jahr",
    price_meta: "Lade dein Guthaben jederzeit auf. Zum Kündigen einfach nicht verlängern.",
    plan1: "Zugang zu allen Serverregionen", plan2: "Volles Tempo, unbegrenztes Datenvolumen", plan3: "Strikte Privatsphäre ohne Logs",
    plan4: "Bis zu 3 Geräte, jede Plattform", plan4_one: "1 Gerät, jede Plattform", plan5: "Zahle mit Krypto", price_btn: "Loslegen",
    faq_kicker: "FAQ", faq_h2: "Fragen, beantwortet.",
    faq_q1: "Speichert ihr Logs?", faq_a1: "Nein. Kovra basiert auf einem strikten No-Logs-Prinzip - wir zeichnen weder dein Surfen noch Traffic oder Verbindungsverlauf auf.",
    faq_q2: "Wie bezahle ich?", faq_a2: "Zahlungen erfolgen derzeit in Kryptowährung. Ein Tarif deckt bis zu 3 Geräte, ab $6.59/Mon. im Jahrestarif.",
    faq_q3: "Wie viele Geräte kann ich nutzen?", faq_a3: "Ein Tarif deckt bis zu 3 Geräte gleichzeitig. Je länger die Laufzeit, desto günstiger der Monat - bis zu $6.59/Mon. im Jahrestarif.",
    faq_q4: "Kann ich jederzeit kündigen?", faq_a4: "Ja. Keine Bindung - dein Zugang endet einfach, wenn das Guthaben aufgebraucht ist und du nicht auflädst.",
    band_h2: "Hol dir Tempo und Privatsphäre zurück.", band_p: "Ab $6.59 im Monat für 3 Geräte. Keine Logs, keine Drosselung, keine Verträge.", band_btn: "Kovra holen",
    foot_terms: "AGB", foot_privacy: "Datenschutz", copyright: "© 2026 Kovra",
  },
  fr: {
    nav_features: "Fonctions", nav_pricing: "Tarif", nav_faq: "FAQ", nav_get: "Obtenir Kovra",
    hero_eyebrow: "Privé · Rapide · dès 6.59 $/mois",
    hero_h1a: "Rapide, privé,", hero_h1b: "et à vous.",
    hero_sub: "Kovra chiffre tout ce que vous faites en ligne et le fait passer par des serveurs haut débit dans le monde entier. Sans journaux, sans bridage - un prix unique.",
    hero_cta1: "Obtenir Kovra - dès 6.59 $/mois", hero_cta2: "Comment ça marche",
    trust1: "Chiffrement moderne", trust2: "Aucun journal d'activité", trust3: "Bande passante illimitée",
    stat1: "Régions de serveurs", stat2: "Débit du réseau", stat3: "Latence médiane", stat4: "Journaux conservés",
    feat_kicker: "Pourquoi Kovra", feat_h2: "Tout ce qu'il faut. Rien de superflu.",
    feat1_t: "Conçu pour la vitesse", feat1_b: "Un tunneling nouvelle génération sur des serveurs optimisés garde une latence basse et un débit élevé - fluide pour le streaming, les appels et le jeu.",
    feat2_t: "Privé par défaut", feat2_b: "Un chiffrement fort et une politique stricte sans journaux. Nous ne pouvons ni transmettre ni vendre des données d'activité que nous ne stockons jamais.",
    feat3_t: "Sans effort", feat3_b: "Une touche pour se connecter sur chaque appareil. Une offre, un prix - sans paliers, sans options, sans surprises.",
    how_kicker: "Comment ça marche", how_h2: "Connecté en moins d'une minute.",
    how_lead: "Aucune configuration compliquée. Créez un compte, rechargez et connectez-vous - votre tunnel chiffré est actif.",
    step1_t: "Créez votre compte", step1_b: "E-mail ou Telegram - quelques secondes.",
    step2_t: "Rechargez votre solde", step2_b: "Payez en crypto. Une offre couvre jusqu'à 3 appareils.",
    step3_t: "Connectez-vous", step3_b: "Importez votre profil et touchez connecter sur n'importe quel appareil.",
    price_kicker: "Choisis ton offre", plan_permo: "/mois", plan_devices: "jusqu'à 3 appareils", plan_devices1: "1 appareil",
    term1: "1 mois", term6: "6 mois", term12: "1 an", badge_best: "Meilleur prix",
    plan_first: "les {n} premiers mois", plan_vat: "TVA éventuellement applicable.",
    plan_savings: "L'économie compare le prix initial au prix de renouvellement.",
    plan_renews: "Renouvellement à", per_mo: "/mois", per_p6: "/6 mois", per_yr: "/an",
    price_meta: "Rechargez votre solde quand vous voulez. Pour annuler, ne renouvelez pas, c'est tout.",
    plan1: "Accès à toutes les régions de serveurs", plan2: "Pleine vitesse, bande passante illimitée", plan3: "Confidentialité stricte sans journaux",
    plan4: "Jusqu'à 3 appareils, toutes plateformes", plan4_one: "1 appareil, toutes plateformes", plan5: "Payez en crypto", price_btn: "Commencer",
    faq_kicker: "FAQ", faq_h2: "Vos questions, nos réponses.",
    faq_q1: "Conservez-vous des journaux ?", faq_a1: "Non. Kovra repose sur une politique stricte sans journaux - nous n'enregistrons ni votre navigation, ni votre trafic, ni votre historique de connexion.",
    faq_q2: "Comment payer ?", faq_a2: "Les paiements se font en cryptomonnaie pour l'instant. Une offre couvre jusqu'à 3 appareils, dès 6.59 $/mois sur l'offre annuelle.",
    faq_q3: "Combien d'appareils puis-je utiliser ?", faq_a3: "Une offre couvre jusqu'à 3 appareils à la fois. Plus la durée est longue, moins le mois coûte cher - jusqu'à 6.59 $/mois sur l'offre annuelle.",
    faq_q4: "Puis-je annuler à tout moment ?", faq_a4: "Oui. Aucun engagement - votre accès s'arrête simplement quand le solde est épuisé et que vous choisissez de ne pas recharger.",
    band_h2: "Reprenez votre vitesse et votre confidentialité.", band_p: "Dès 6.59 $/mois pour 3 appareils. Sans journaux, sans bridage, sans contrat.", band_btn: "Obtenir Kovra",
    foot_terms: "Conditions", foot_privacy: "Confidentialité", copyright: "© 2026 Kovra",
  },
};

const css = `
@import url('https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=Figtree:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');

.kv-root{
  --accent:#d9a55e;--accent-soft:rgba(217,165,94,.14);--accent-line:rgba(217,165,94,.2);
  --base:#0a0a0c;--text:#f1f2f4;--muted:rgba(241,242,244,.6);--faint:rgba(241,242,244,.4);
  --glass:rgba(255,255,255,.045);--glass-strong:rgba(255,255,255,.08);--gborder:rgba(255,255,255,.1);
  --menu-bg:#15161b;--ctrl-bg:rgba(255,255,255,.09);--ctrl-border:rgba(255,255,255,.17);
  --ghi:inset 0 1px 0 rgba(255,255,255,.13);--gshadow:0 18px 44px -26px rgba(0,0,0,.75);
  --btn-bg:#f0f1f3;--btn-fg:#0a0a0c;--btn-bg-hover:#ffffff;
  --glow1:rgba(255,255,255,.07);--glow2:rgba(217,165,94,.05);--grain-op:.04;--vig:rgba(0,0,0,.45);--sel-fg:#15100a;
  --blur:blur(20px) saturate(120%);--maxw:1140px;
  --fd:'Schibsted Grotesk',ui-sans-serif,system-ui,sans-serif;--fb:'Figtree',ui-sans-serif,system-ui,sans-serif;--fm:'DM Mono',ui-monospace,Menlo,monospace;
  position:relative;min-height:100dvh;background:var(--base);color:var(--text);
  font-family:var(--fb);font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden;transition:background .3s,color .3s;
}
.kv-root[data-theme="light"]{
  --accent:#a9701f;--accent-soft:rgba(169,112,31,.13);--accent-line:rgba(169,112,31,.28);
  --base:#ecedf0;--text:#16181c;--muted:rgba(22,24,28,.62);--faint:rgba(22,24,28,.42);
  --glass:rgba(255,255,255,.55);--glass-strong:rgba(255,255,255,.74);--gborder:rgba(20,22,40,.09);
  --menu-bg:#ffffff;--ctrl-bg:rgba(255,255,255,.82);--ctrl-border:rgba(20,22,40,.16);
  --ghi:inset 0 1px 0 rgba(255,255,255,.75);--gshadow:0 18px 44px -26px rgba(20,22,40,.2);
  --btn-bg:#16181c;--btn-fg:#f4f5f7;--btn-bg-hover:#000000;
  --glow1:rgba(255,255,255,.7);--glow2:rgba(169,112,31,.06);--grain-op:.025;--vig:rgba(20,22,40,.05);--sel-fg:#fff;
}
.kv-root *{box-sizing:border-box;margin:0;padding:0}
.kv-root ::selection{background:var(--accent);color:var(--sel-fg)}
.kv-root a{color:inherit;text-decoration:none}
.kv-root button{font-family:inherit;color:inherit}

.kv-bg{position:fixed;inset:0;z-index:0;pointer-events:none;transition:background .3s;
  background:radial-gradient(ellipse 72% 48% at 50% -8%,var(--glow1),transparent 68%),radial-gradient(ellipse 50% 40% at 82% 8%,var(--glow2),transparent 70%)}
.kv-grain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:var(--grain-op);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.kv-vig{position:fixed;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse 100% 80% at 50% 30%,transparent 55%,var(--vig))}

.kv-wrap{position:relative;z-index:2;width:100%;max-width:var(--maxw);margin:0 auto;padding:0 26px}

.kv-nav{position:sticky;top:16px;z-index:60;margin:16px auto 0;max-width:var(--maxw);padding:0 26px}
.kv-nav-in{display:flex;align-items:center;justify-content:space-between;height:58px;padding:0 12px 0 20px;border-radius:16px;background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--gborder);box-shadow:var(--ghi),var(--gshadow)}
.kv-brand{font-family:var(--fd);font-weight:700;font-size:20px;letter-spacing:-.02em;display:flex;align-items:center;gap:9px}
.kv-dot{width:22px;height:22px;border-radius:6px;object-fit:contain;display:inline-block}
.kv-nav-links{display:flex;gap:28px;font-size:14px;color:var(--muted)}
.kv-nav-links a{transition:color .18s}.kv-nav-links a:hover{color:var(--text)}
@media(max-width:820px){.kv-nav-links{display:none}}
.kv-nav-right{display:flex;align-items:center;gap:9px}

.kv-ctrl{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;cursor:pointer;color:var(--accent);background:var(--ctrl-bg);border:1px solid var(--ctrl-border);box-shadow:var(--ghi);transition:background .2s,border-color .2s,transform .16s}
.kv-ctrl:hover{border-color:var(--accent);transform:translateY(-1px)}
.kv-lang{position:relative}
.kv-lang-btn{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 13px;border-radius:12px;cursor:pointer;font-family:var(--fm);font-weight:500;font-size:12px;letter-spacing:.05em;color:var(--text);background:var(--ctrl-bg);border:1px solid var(--ctrl-border);box-shadow:var(--ghi);transition:background .2s,border-color .2s,transform .16s}
.kv-lang-btn:hover{border-color:var(--accent);transform:translateY(-1px)}
.kv-lang-btn .kv-glb{color:var(--accent)}
.kv-lang-btn .kv-car{opacity:.7;transition:transform .2s}
.kv-lang-btn.is-open .kv-car{transform:rotate(180deg)}
.kv-lang-menu{position:absolute;top:48px;right:0;min-width:172px;padding:7px;border-radius:14px;background:var(--menu-bg);border:1px solid var(--ctrl-border);box-shadow:0 22px 54px -16px rgba(0,0,0,.55),var(--ghi);z-index:90;display:flex;flex-direction:column;gap:3px}
.kv-lang-item{text-align:left;padding:10px 13px;border-radius:9px;cursor:pointer;font-size:14px;font-weight:500;color:var(--muted);background:transparent;border:none;transition:background .15s,color .15s}
.kv-lang-item:hover{background:var(--accent-soft);color:var(--text)}
.kv-lang-item.is-active{background:var(--accent-soft);color:var(--accent)}

.kv-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:var(--fb);font-weight:600;font-size:14px;border-radius:12px;padding:11px 22px;cursor:pointer;border:1px solid transparent;transition:transform .16s,background .2s,border-color .2s,box-shadow .2s;white-space:nowrap}
.kv-root .kv-btn-primary{background:var(--btn-bg);color:var(--btn-fg);box-shadow:var(--ghi)}
.kv-root .kv-btn-primary:hover{background:var(--btn-bg-hover);transform:translateY(-1px);box-shadow:0 10px 28px -16px rgba(0,0,0,.6)}
.kv-root .kv-btn-glass{background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border-color:var(--gborder);color:var(--text);box-shadow:var(--ghi)}
.kv-root .kv-btn-glass:hover{background:var(--glass-strong);transform:translateY(-1px)}
.kv-btn-lg{padding:14px 28px;font-size:14.5px}

.kv-hero{position:relative;padding:92px 0 64px;text-align:center}
.kv-eyebrow{display:inline-flex;align-items:center;gap:9px;font-family:var(--fm);font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);padding:8px 15px;border-radius:999px;background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--gborder);box-shadow:var(--ghi)}
.kv-h1{font-family:var(--fd);font-weight:700;letter-spacing:-.035em;line-height:1.03;font-size:clamp(44px,7vw,84px);margin:26px auto 0;max-width:14ch}
.kv-h1 em{font-style:normal;color:var(--accent)}
.kv-sub{margin:24px auto 0;max-width:56ch;font-size:clamp(16px,2vw,19px);color:var(--muted);line-height:1.55}
.kv-cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:34px}
.kv-trust{margin-top:26px;font-family:var(--fm);font-size:24px;color:var(--faint);display:flex;gap:18px;justify-content:center;flex-wrap:wrap}
.kv-trust span{display:inline-flex;align-items:center;gap:8px}.kv-trust i{width:4px;height:4px;border-radius:50%;background:var(--accent);font-style:normal}

.kv-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:60px}
.kv-stat{padding:24px 16px;text-align:center;border-radius:16px;background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--gborder);box-shadow:var(--ghi)}
.kv-stat b{display:block;font-family:var(--fd);font-weight:700;font-size:clamp(25px,4vw,36px);letter-spacing:-.03em;color:var(--text)}
.kv-stat span{display:block;margin-top:6px;font-size:14.5px;color:var(--muted)}
@media(max-width:720px){.kv-stats{grid-template-columns:repeat(2,1fr)}}

.kv-section{position:relative;z-index:2;padding:90px 0}
.kv-kicker{font-family:var(--fm);font-size:24px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}
.kv-h2{font-family:var(--fd);font-weight:700;letter-spacing:-.03em;line-height:1.06;font-size:clamp(29px,4.2vw,46px);margin-top:13px;max-width:18ch}
.kv-lead{color:var(--muted);margin-top:15px;max-width:54ch;font-size:21px}

.kv-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:44px}
.kv-card{padding:28px;border-radius:18px;background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--gborder);box-shadow:var(--ghi);transition:transform .25s,background .25s,border-color .25s}
.kv-card:hover{transform:translateY(-4px);background:var(--glass-strong);border-color:var(--accent-line)}
.kv-ic{width:42px;height:42px;border-radius:11px;display:grid;place-items:center;font-size:18px;margin-bottom:18px;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-line)}
.kv-card h3{font-family:var(--fd);font-weight:600;font-size:19px;letter-spacing:-.01em}
.kv-card p{color:var(--muted);margin-top:9px;font-size:17.5px;line-height:1.6}
@media(max-width:860px){.kv-cards{grid-template-columns:1fr}}

.kv-split{display:grid;grid-template-columns:1.05fr .95fr;gap:26px;align-items:stretch}
@media(max-width:920px){.kv-split{grid-template-columns:1fr}}
.kv-split>div:first-child{display:flex;flex-direction:column}
.kv-steps{display:flex;flex-direction:column;gap:14px;margin-top:30px;flex:1;justify-content:center}
.kv-step{display:flex;gap:18px;align-items:flex-start;padding:20px 22px;border-radius:14px;background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--gborder);box-shadow:var(--ghi)}
.kv-step b{font-family:var(--fm);color:var(--accent);font-size:14px;min-width:26px}
.kv-step h4{font-family:var(--fd);font-weight:600;font-size:17.5px}
.kv-step p{color:var(--muted);font-size:16px;margin-top:3px}

.kv-price{padding:26px 28px;border-radius:20px;background:var(--glass-strong);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--gborder);box-shadow:var(--ghi),var(--gshadow);display:flex;flex-direction:column}
.kv-price-tag{display:flex;align-items:baseline;gap:8px;margin-top:16px}
.kv-price-tag b{font-family:var(--fd);font-weight:700;font-size:50px;letter-spacing:-.04em;line-height:1}
.kv-price-tag span{color:var(--muted);font-size:16px}
.kv-price-meta{color:var(--muted);margin-top:8px;font-size:17px}
.kv-list{list-style:none;margin:18px 0;display:flex;flex-direction:column;gap:9px}
.kv-list li{display:flex;gap:11px;align-items:center;font-size:15.5px}
.kv-check{width:20px;height:20px;border-radius:6px;display:grid;place-items:center;flex:0 0 auto;font-size:11px;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-line)}
.kv-price .kv-btn{width:100%;margin-top:auto}
.kv-lvl{display:flex;align-items:center;gap:12px;margin-top:14px}
.kv-lvl-arrow{flex:0 0 auto;width:38px;height:38px;border-radius:11px;display:grid;place-items:center;cursor:pointer;background:var(--ctrl-bg);border:1px solid var(--ctrl-border);box-shadow:var(--ghi);color:var(--text);font-size:22px;line-height:1;font-family:var(--fb);transition:border-color .2s,background .2s}
.kv-lvl-arrow:hover{border-color:var(--accent);background:var(--glass-strong)}
.kv-lvl-mid{flex:1;display:flex;flex-direction:column;align-items:center;gap:7px}
.kv-lvl-title{font-family:var(--fd);font-weight:700;font-size:17px;letter-spacing:-.01em;text-transform:capitalize}
.kv-lvl-dots{display:flex;gap:7px}
.kv-lvl-dot{width:8px;height:8px;border-radius:50%;padding:0;border:none;cursor:pointer;background:var(--ctrl-border);transition:background .2s,transform .2s}
.kv-lvl-dot.on{background:var(--accent);transform:scale(1.15)}
.kv-plan{position:relative;margin-top:16px}
.kv-plan-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-radius:13px;cursor:pointer;background:var(--ctrl-bg);border:1px solid var(--ctrl-border);box-shadow:var(--ghi);color:var(--text);font-family:var(--fb);font-size:16px;font-weight:600;transition:border-color .2s,background .2s}
.kv-plan-btn:hover{border-color:var(--accent)}
.kv-plan-cur{display:inline-flex;align-items:center;gap:10px}
.kv-plan-btn .kv-car{opacity:.7;font-size:13px;transition:transform .2s}
.kv-plan-btn.is-open .kv-car{transform:rotate(180deg)}
.kv-badge{font-family:var(--fm);font-size:12px;font-weight:500;letter-spacing:.02em;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:999px;padding:3px 9px}
.kv-plan-menu{position:absolute;top:58px;left:0;right:0;padding:7px;border-radius:14px;background:var(--menu-bg);border:1px solid var(--ctrl-border);box-shadow:0 22px 54px -16px rgba(0,0,0,.55),var(--ghi);z-index:90;display:flex;flex-direction:column;gap:3px}
.kv-plan-item{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;padding:12px 14px;border-radius:10px;cursor:pointer;background:transparent;border:none;color:var(--text);font-family:var(--fb);font-size:16px;font-weight:600;transition:background .15s}
.kv-plan-item:hover{background:var(--accent-soft)}
.kv-plan-item.is-active{background:var(--accent-soft)}
.kv-plan-itemr{font-family:var(--fm);font-size:12.5px;font-weight:500;color:var(--muted);white-space:nowrap}
.kv-price-fine{margin-top:16px;display:flex;flex-direction:column;gap:6px;color:var(--faint);font-size:13px;line-height:1.5}
.kv-price-fine p{margin:0}
.kv-price-fine b{color:var(--text);font-weight:600}
.kv-price-fine s{opacity:.75}

.kv-faq{margin-top:36px;border-radius:18px;overflow:hidden;background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--gborder);box-shadow:var(--ghi)}
.kv-faq details{border-bottom:1px solid var(--gborder)}.kv-faq details:last-child{border-bottom:none}
.kv-faq summary{list-style:none;cursor:pointer;padding:21px 22px;display:flex;justify-content:space-between;align-items:center;gap:20px;font-family:var(--fd);font-weight:500;font-size:18.5px;transition:color .18s}
.kv-faq summary::-webkit-details-marker{display:none}.kv-faq summary:hover{color:var(--accent)}
.kv-faq summary .kv-pm{color:var(--accent);font-family:var(--fm);font-size:20px;transition:transform .2s;flex:0 0 auto}
.kv-faq details[open] summary .kv-pm{transform:rotate(45deg)}
.kv-faq p{color:var(--muted);padding:0 22px 21px;max-width:72ch;font-size:17px}

.kv-band{padding:54px 40px;text-align:center;border-radius:22px;background:var(--glass-strong);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--gborder);box-shadow:var(--ghi),var(--gshadow)}
.kv-band h2{font-family:var(--fd);font-weight:700;letter-spacing:-.03em;font-size:clamp(28px,4vw,42px)}
.kv-band p{color:var(--muted);margin:13px auto 26px;max-width:48ch;font-size:18.5px}

.kv-foot{position:relative;z-index:2;padding:40px 0 56px;margin-top:18px;color:var(--faint);font-size:15px}
.kv-foot-in{display:flex;justify-content:space-between;align-items:center;gap:22px;flex-wrap:wrap;padding-top:28px;border-top:1px solid var(--gborder)}
.kv-foot a{color:var(--muted);transition:color .18s}.kv-foot a:hover{color:var(--text)}
.kv-foot-links{display:flex;gap:22px;flex-wrap:wrap}

@media(max-width:1024px){.kv-wrap{padding:0 22px}.kv-section{padding:78px 0}}
@media(max-width:720px){
  .kv-wrap{padding:0 16px}
  .kv-nav{top:10px;margin-top:10px;padding:0 16px}
  .kv-nav-in{height:54px;padding:0 8px 0 16px}
  .kv-nav-right{gap:7px}
  .kv-lang-btn{height:38px;padding:0 11px;font-size:11px}
  .kv-ctrl{width:38px;height:38px}
  .kv-btn-lg{padding:13px 20px;font-size:14px}
  .kv-hero{padding:60px 0 46px}
  .kv-section{padding:58px 0}
  .kv-stats{margin-top:42px}
  .kv-cards{margin-top:30px}
  .kv-price{padding:26px}
  .kv-band{padding:40px 22px}
  .kv-foot-in{flex-direction:column;align-items:flex-start;gap:16px}
}
@media(max-width:430px){
  .kv-nav-right .kv-btn-primary{display:none}
  .kv-brand{font-size:18px}
  .kv-lang-menu{min-width:160px}
}

@keyframes kvUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.kv-rise{animation:kvUp .7s cubic-bezier(.2,.7,.2,1) both}
.kv-d1{animation-delay:.05s}.kv-d2{animation-delay:.13s}.kv-d3{animation-delay:.21s}.kv-d4{animation-delay:.29s}.kv-d5{animation-delay:.37s}
@media(prefers-reduced-motion:reduce){.kv-rise{animation:none}}
`;

const IGlobe = () => (<svg className="kv-glb" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.6 2.8 2.6 15.2 0 18c-2.6-2.8-2.6-15.2 0-18z" /></svg>);
const ICaret = () => (<svg className="kv-car" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>);
const ISun = () => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" /></svg>);
const IMoon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.6 6.6 0 0 0 10 10z" /></svg>);

export default function Page() {
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<Theme>("dark");
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<0 | 1>(0);
  const [term3, setTerm3] = useState<TermId>("m12");
  const [term1, setTerm1] = useState<TermId>("m12");
  const [planOpen, setPlanOpen] = useState(false);
  const planRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const sl = localStorage.getItem("kovra_lang") as Lang | null;
      const st = localStorage.getItem("theme") as Theme | null;
      if (sl && LANGS[sl]) setLang(sl);
      if (st === "light" || st === "dark") setTheme(st);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { try { localStorage.setItem("kovra_lang", lang); } catch { /* ignore */ } }, [lang]);
  useEffect(() => { try { localStorage.setItem("theme", theme); } catch { /* ignore */ } }, [theme]);

  useEffect(() => {
    if (!langOpen) return;
    const onDown = (e: MouseEvent) => { if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [langOpen]);

  useEffect(() => {
    if (!planOpen) return;
    const onDown = (e: MouseEvent) => { if (planRef.current && !planRef.current.contains(e.target as Node)) setPlanOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [planOpen]);

  const t = dict[lang];
  const features = [
    { ic: "→", t: t.feat1_t, b: t.feat1_b },
    { ic: "⊘", t: t.feat2_t, b: t.feat2_b },
    { ic: "◇", t: t.feat3_t, b: t.feat3_b },
  ];
  const steps = [
    { n: "01", t: t.step1_t, b: t.step1_b },
    { n: "02", t: t.step2_t, b: t.step2_b },
    { n: "03", t: t.step3_t, b: t.step3_b },
  ];
  const stats = [
    { num: "30+", l: t.stat1 },   /* EDIT */
    { num: "10 Gbps", l: t.stat2 }, /* EDIT */
    { num: "<20 ms", l: t.stat3 },  /* EDIT */
    { num: "0", l: t.stat4 },
  ];
  const faqs = [
    { q: t.faq_q1, a: t.faq_a1 }, { q: t.faq_q2, a: t.faq_a2 },
    { q: t.faq_q3, a: t.faq_a3 }, { q: t.faq_q4, a: t.faq_a4 },
  ];
  const lv = LEVELS[level];
  const TERMS = lv.terms;
  const term = level === 0 ? term3 : term1;
  const setTerm = level === 0 ? setTerm3 : setTerm1;
  const sel = TERMS.find(x => x.id === term)!;
  const devicesLabel = t[lv.devKey];
  const perWord = sel.per === "yr" ? t.per_yr : sel.per === "p6" ? t.per_p6 : t.per_mo;
  const termLabel = (id: TermId) => (id === "m1" ? t.term1 : id === "m6" ? t.term6 : t.term12);
  const firstLabel = t.plan_first.replace("{n}", String(sel.n));
  // feature list: last item depends on level (3 devices / 1 device)
  const planFeatures = [t.plan1, t.plan2, t.plan3, t[lv.featKey], t.plan5];
  const goLevel = (d: -1 | 1) => { setLevel(p => ((p + d + 2) % 2) as 0 | 1); setPlanOpen(false); };

  return (
    <div className="kv-root" data-theme={theme}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="kv-bg" aria-hidden />
      <div className="kv-grain" aria-hidden />
      <div className="kv-vig" aria-hidden />

      <nav className="kv-nav">
        <div className="kv-nav-in">
          <a className="kv-brand" href="#top"><img className="kv-dot" src="/icon-192.png" alt="" />Kovra</a>
          <div className="kv-nav-links">
            <a href="#features">{t.nav_features}</a><a href="#pricing">{t.nav_pricing}</a><a href="#faq">{t.nav_faq}</a>
          </div>
          <div className="kv-nav-right">
            <div className="kv-lang" ref={langRef}>
              <button className={"kv-lang-btn" + (langOpen ? " is-open" : "")} onClick={() => setLangOpen(o => !o)} aria-haspopup="listbox" aria-expanded={langOpen}>
                <IGlobe />{LANGS[lang].code}<ICaret />
              </button>
              {langOpen && (
                <div className="kv-lang-menu" role="listbox">
                  {(Object.keys(LANGS) as Lang[]).map(code => (
                    <button key={code} role="option" aria-selected={code === lang}
                      className={"kv-lang-item" + (code === lang ? " is-active" : "")}
                      onClick={() => { setLang(code); setLangOpen(false); }}>
                      {LANGS[code].native}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="kv-ctrl" onClick={() => setTheme(p => (p === "dark" ? "light" : "dark"))} aria-label="Toggle theme">
              {theme === "dark" ? <ISun /> : <IMoon />}
            </button>
            <a className="kv-btn kv-btn-primary" href="/register">{t.nav_get}</a>
          </div>
        </div>
      </nav>

      <header className="kv-hero" id="top">
        <div className="kv-wrap">
          <span className="kv-eyebrow kv-rise kv-d1">{t.hero_eyebrow}</span>
          <h1 className="kv-h1 kv-rise kv-d2">{t.hero_h1a}{" "}<em>{t.hero_h1b}</em></h1>
          <p className="kv-sub kv-rise kv-d3">{t.hero_sub}</p>
          <div className="kv-cta kv-rise kv-d4">
            <a className="kv-btn kv-btn-primary kv-btn-lg" href="/register">{t.hero_cta1}</a>
            <a className="kv-btn kv-btn-glass kv-btn-lg" href="#how">{t.hero_cta2}</a>
          </div>
          <div className="kv-trust kv-rise kv-d5">
            <span><i />{t.trust1}</span><span><i />{t.trust2}</span><span><i />{t.trust3}</span>
          </div>
          <div className="kv-stats kv-rise kv-d5">
            {stats.map((s, i) => (<div className="kv-stat" key={i}><b>{s.num}</b><span>{s.l}</span></div>))}
          </div>
        </div>
      </header>

      <section className="kv-section" id="features">
        <div className="kv-wrap">
          <span className="kv-kicker">{t.feat_kicker}</span>
          <h2 className="kv-h2">{t.feat_h2}</h2>
          <div className="kv-cards">
            {features.map((f, i) => (
              <div className="kv-card" key={i}><div className="kv-ic">{f.ic}</div><h3>{f.t}</h3><p>{f.b}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="kv-section" id="how">
        <div className="kv-wrap kv-split">
          <div>
            <span className="kv-kicker">{t.how_kicker}</span>
            <h2 className="kv-h2">{t.how_h2}</h2>
            <p className="kv-lead">{t.how_lead}</p>
            <div className="kv-steps">
              {steps.map((s, i) => (
                <div className="kv-step" key={i}><b>{s.n}</b><div><h4>{s.t}</h4><p>{s.b}</p></div></div>
              ))}
            </div>
          </div>
          <div className="kv-price" id="pricing">
            <span className="kv-kicker">{t.price_kicker}</span>
            <div className="kv-lvl">
              <button className="kv-lvl-arrow" onClick={() => goLevel(-1)} aria-label="Previous plan">‹</button>
              <div className="kv-lvl-mid">
                <span className="kv-lvl-title">{devicesLabel}</span>
                <div className="kv-lvl-dots">
                  {LEVELS.map((_, i) => (
                    <button key={i} className={"kv-lvl-dot" + (i === level ? " on" : "")}
                      onClick={() => { setLevel(i as 0 | 1); setPlanOpen(false); }} aria-label={`Plan ${i + 1}`} />
                  ))}
                </div>
              </div>
              <button className="kv-lvl-arrow" onClick={() => goLevel(1)} aria-label="Next plan">›</button>
            </div>
            <div className="kv-plan" ref={planRef}>
              <button className={"kv-plan-btn" + (planOpen ? " is-open" : "")} onClick={() => setPlanOpen(o => !o)} aria-haspopup="listbox" aria-expanded={planOpen}>
                <span className="kv-plan-cur">{termLabel(term)}{sel.disc > 0 && <span className="kv-badge">-{sel.disc}%</span>}</span>
                <span className="kv-car">▾</span>
              </button>
              {planOpen && (
                <div className="kv-plan-menu" role="listbox">
                  {TERMS.map(o => (
                    <button key={o.id} role="option" aria-selected={o.id === term}
                      className={"kv-plan-item" + (o.id === term ? " is-active" : "")}
                      onClick={() => { setTerm(o.id); setPlanOpen(false); }}>
                      <span>{termLabel(o.id)}</span>
                      <span className="kv-plan-itemr">{o.mo}{t.plan_permo}{o.disc > 0 ? " · -" + o.disc + "%" : ""}{o.id === "m12" ? " · " + t.badge_best : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="kv-price-tag"><b>{sel.mo}</b><span>{t.plan_permo} · {devicesLabel}</span></div>
            <div className="kv-price-fine">
              {sel.disc > 0 ? (
                <>
                  <p><s>{sel.ref}</s> <b>{sel.total}</b> · {firstLabel}</p>
                  <p>{t.plan_renews} {sel.ref}{perWord}. {t.plan_vat}</p>
                  <p>{t.plan_savings}</p>
                </>
              ) : (
                <>
                  <p><b>{sel.total}</b>{t.plan_permo}</p>
                  <p>{t.plan_renews} {sel.total}{perWord}. {t.plan_vat}</p>
                </>
              )}
            </div>
            <ul className="kv-list">
              {planFeatures.map((p, i) => (<li key={i}><span className="kv-check">✓</span>{p}</li>))}
            </ul>
            <a className="kv-btn kv-btn-primary kv-btn-lg" href="/register">{t.price_btn}</a>
          </div>
        </div>
      </section>

      <section className="kv-section" id="faq">
        <div className="kv-wrap">
          <span className="kv-kicker">{t.faq_kicker}</span>
          <h2 className="kv-h2">{t.faq_h2}</h2>
          <div className="kv-faq">
            {faqs.map((f, i) => (
              <details key={i} open={i === 0}>
                <summary>{f.q}<span className="kv-pm">+</span></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="kv-section" style={{ paddingTop: 0 }}>
        <div className="kv-wrap">
          <div className="kv-band">
            <h2>{t.band_h2}</h2>
            <p>{t.band_p}</p>
            <a className="kv-btn kv-btn-primary kv-btn-lg" href="/register">{t.band_btn}</a>
          </div>
        </div>
      </section>

      <footer className="kv-foot">
        <div className="kv-wrap kv-foot-in">
          <a className="kv-brand" href="#top" style={{ fontSize: 18 }}><img className="kv-dot" src="/icon-192.png" alt="" />Kovra</a>
          <div className="kv-foot-links">
            <a href="#features">{t.nav_features}</a><a href="#pricing">{t.nav_pricing}</a><a href="#faq">{t.nav_faq}</a>
            <a href="/terms">{t.foot_terms}</a><a href="/privacy">{t.foot_privacy}</a><a href="mailto:support@kovravpn.com">support@kovravpn.com</a>
          </div>
          <span>{t.copyright}</span>
        </div>
      </footer>
    </div>
  );
}

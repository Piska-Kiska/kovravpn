// src/lib/bot-i18n.ts
// Telegram bot i18n. Separate from src/i18n/dict.ts (public site) because the
// bot defaults to EN and resolves language per-user (account.lang ->
// Telegram language_code -> en), whereas the site SSR-renders RU.
//
// Keys: <screen>.<role>[.<index>]. Interpolation: {name} placeholders.
// Missing key/lang falls back to EN, then to the raw key (never throws).

import { getUserLang } from "./accounts";

export type BotLang = "en" | "ru" | "es" | "de" | "fr";
export const BOT_LANGS: readonly BotLang[] = ["en", "ru", "es", "de", "fr"] as const;
export const DEFAULT_BOT_LANG: BotLang = "en";

export const LANG_NAMES: Record<BotLang, string> = {
  en: "English",
  ru: "Русский",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
};

type Dict = Readonly<Record<string, string>>;

const en: Dict = {
  "menu.title": "🛡 <b>Kovra</b>\n\nSecure network access. Fast, reliable, invisible.\n\nChoose an action:",
  "menu.connect": "➕ Connect",
  "menu.pricing": "💳 Pricing",
  "menu.account": "📊 My account",
  "menu.devices": "📡 My devices",
  "menu.topup": "💰 Top up",
  "menu.referral": "👥 Referral",
  "menu.guide": "📖 Guide",
  "menu.help": "❓ Help",
  "menu.site": "🌐 Open website",
  "menu.language": "🌐 Language",
  "common.back": "⬅️ Back",
  "common.error": "❌ Error: {msg}",
  "lang.title": "🌐 <b>Language</b>\n\nSelect your language:",
  "lang.saved": "✅ Language set to English.",
};

const ru: Dict = {
  "menu.title": "🛡 <b>Kovra</b>\n\nЗащищённый доступ к сети. Быстро, надёжно, незаметно.\n\nВыберите действие:",
  "menu.connect": "➕ Подключить",
  "menu.pricing": "💳 Цены",
  "menu.account": "📊 Мой аккаунт",
  "menu.devices": "📡 Мои устройства",
  "menu.topup": "💰 Пополнить",
  "menu.referral": "👥 Рефералы",
  "menu.guide": "📖 Инструкция",
  "menu.help": "❓ Помощь",
  "menu.site": "🌐 Открыть сайт",
  "menu.language": "🌐 Язык",
  "common.back": "⬅️ Назад",
  "common.error": "❌ Ошибка: {msg}",
  "lang.title": "🌐 <b>Язык</b>\n\nВыберите язык:",
  "lang.saved": "✅ Язык переключён на русский.",
};

const es: Dict = {
  "menu.title": "🛡 <b>Kovra</b>\n\nAcceso seguro a la red. Rápido, fiable, invisible.\n\nElige una acción:",
  "menu.connect": "➕ Conectar",
  "menu.pricing": "💳 Precios",
  "menu.account": "📊 Mi cuenta",
  "menu.devices": "📡 Mis dispositivos",
  "menu.topup": "💰 Recargar",
  "menu.referral": "👥 Referidos",
  "menu.guide": "📖 Guía",
  "menu.help": "❓ Ayuda",
  "menu.site": "🌐 Abrir sitio web",
  "menu.language": "🌐 Idioma",
  "common.back": "⬅️ Atrás",
  "common.error": "❌ Error: {msg}",
  "lang.title": "🌐 <b>Idioma</b>\n\nSelecciona tu idioma:",
  "lang.saved": "✅ Idioma cambiado a español.",
};

const de: Dict = {
  "menu.title": "🛡 <b>Kovra</b>\n\nSicherer Netzwerkzugang. Schnell, zuverlässig, unsichtbar.\n\nWähle eine Aktion:",
  "menu.connect": "➕ Verbinden",
  "menu.pricing": "💳 Preise",
  "menu.account": "📊 Mein Konto",
  "menu.devices": "📡 Meine Geräte",
  "menu.topup": "💰 Aufladen",
  "menu.referral": "👥 Empfehlungen",
  "menu.guide": "📖 Anleitung",
  "menu.help": "❓ Hilfe",
  "menu.site": "🌐 Website öffnen",
  "menu.language": "🌐 Sprache",
  "common.back": "⬅️ Zurück",
  "common.error": "❌ Fehler: {msg}",
  "lang.title": "🌐 <b>Sprache</b>\n\nWähle deine Sprache:",
  "lang.saved": "✅ Sprache auf Deutsch umgestellt.",
};

const fr: Dict = {
  "menu.title": "🛡 <b>Kovra</b>\n\nAccès réseau sécurisé. Rapide, fiable, invisible.\n\nChoisissez une action :",
  "menu.connect": "➕ Connecter",
  "menu.pricing": "💳 Tarifs",
  "menu.account": "📊 Mon compte",
  "menu.devices": "📡 Mes appareils",
  "menu.topup": "💰 Recharger",
  "menu.referral": "👥 Parrainage",
  "menu.guide": "📖 Guide",
  "menu.help": "❓ Aide",
  "menu.site": "🌐 Ouvrir le site",
  "menu.language": "🌐 Langue",
  "common.back": "⬅️ Retour",
  "common.error": "❌ Erreur : {msg}",
  "lang.title": "🌐 <b>Langue</b>\n\nChoisissez votre langue :",
  "lang.saved": "✅ Langue définie sur le français.",
};

const DICTS: Record<BotLang, Dict> = { en, ru, es, de, fr };

/** Normalize a Telegram language_code (e.g. "ru-RU", "es") to a BotLang. */
export function normalizeLang(code?: string | null): BotLang | null {
  if (!code) return null;
  const base = code.toLowerCase().split("-")[0];
  return (BOT_LANGS as readonly string[]).includes(base) ? (base as BotLang) : null;
}

/** Translate. Falls back EN -> raw key. Interpolates {var} from vars. */
export function t(
  key: string,
  lang: BotLang = DEFAULT_BOT_LANG,
  vars?: Record<string, string | number>
): string {
  const dict = DICTS[lang] ?? en;
  let val = dict[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      val = val.replaceAll(`{${k}}`, String(v));
    }
  }
  return val;
}

/**
 * Resolve UI language for a user: stored account.lang ->
 * Telegram language_code -> EN. `tgCode` is from message.from.language_code.
 */
export async function resolveLang(
  userId: string,
  tgCode?: string | null
): Promise<BotLang> {
  const stored = normalizeLang(await getUserLang(userId));
  if (stored) return stored;
  const fromTg = normalizeLang(tgCode);
  if (fromTg) return fromTg;
  return DEFAULT_BOT_LANG;
}

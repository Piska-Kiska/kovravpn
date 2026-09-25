// src/lib/i18n-shell.ts
//
// Shared cabinet strings (header controls, copy, dialogs, errors) in the five
// cabinet languages, plus localizeError() for server error strings.
//
// Rules (tests/i18n-cabinet-dicts.test.mjs enforces the first two):
// - no Cyrillic in the en / es / de / fr blocks;
// - no emoji and no arrow or check glyphs in any value;
// - placeholders are {name} tokens filled by fmt();
// - tone: es "tú", de "du", fr "vous", ru «вы» in lower case.
"use client";

import type { Lang } from "@/i18n/dict";
import { fmt, useCabinetLang } from "@/lib/cabinet-lang";
import { classifyServerError } from "@/lib/server-errors";

export interface ShellDict {
  skip: string;
  home: string;
  lang_button: string;
  language: string;
  theme_button: string;
  theme: string;
  theme_system: string;
  theme_light: string;
  theme_dark: string;
  /** Accessible name of the header capsule (language | theme). */
  prefs: string;
  copy: string;
  copied: string;
  copy_failed: string;
  close: string;
  cancel: string;
  retry: string;
  dismiss: string;
  loading: string;
  err_generic: string;
  err_network: string;
  err_rate_limit: string;
  err_rate_limit_generic: string;
  err_bad_credentials: string;
  err_fill_all: string;
  err_email_invalid: string;
  err_password_len: string;
  err_code_invalid: string;
  err_code_expired: string;
  err_code_attempts: string;
  err_user_exists: string;
  err_user_not_found: string;
  err_send_failed: string;
  err_email_taken: string;
  err_tg_taken: string;
  err_unlink_primary: string;
  err_not_linked: string;
  err_code_other_account: string;
  err_promo_empty: string;
  err_promo_not_found: string;
  err_promo_expired: string;
  err_promo_used_up: string;
  err_promo_already: string;
  err_pay: string;
  err_pay_unavailable: string;
  err_pay_min: string;
  err_servers_busy: string;
  err_in_progress: string;
  err_create_failed: string;
  err_session: string;
}

const en: ShellDict = {
  skip: "Skip to content",
  home: "Kovra home",
  lang_button: "Language: {name}",
  language: "Language",
  theme_button: "Theme: {name}",
  theme: "Theme",
  theme_system: "System",
  theme_light: "Light",
  theme_dark: "Dark",
  prefs: "Preferences",
  copy: "Copy",
  copied: "Copied",
  copy_failed: "Couldn’t copy. Select the text and copy it manually.",
  close: "Close",
  cancel: "Cancel",
  retry: "Try again",
  dismiss: "Dismiss",
  loading: "Loading…",
  err_generic: "Something went wrong. Please try again.",
  err_network: "Connection problem. Check your internet and try again.",
  err_rate_limit: "Too many attempts. Try again in {s} seconds.",
  err_rate_limit_generic: "Too many attempts. Please wait a minute.",
  err_bad_credentials: "Wrong email or password.",
  err_fill_all: "Please fill in all fields.",
  err_email_invalid: "Enter a valid email address.",
  err_password_len: "Password must be 8 to 128 characters.",
  err_code_invalid: "That code isn’t right. Check it and try again.",
  err_code_expired: "This code has expired. Request a new one.",
  err_code_attempts: "Too many wrong codes. Request a new one.",
  err_user_exists: "An account with this email already exists. Sign in instead.",
  err_user_not_found: "We couldn’t find that account.",
  err_send_failed: "We couldn’t send the code. Try again in a minute.",
  err_email_taken: "This email is already linked to another account.",
  err_tg_taken: "Another Telegram account is already linked. Unlink it first.",
  err_unlink_primary: "You can’t unlink the method you signed up with.",
  err_not_linked: "This sign-in method isn’t linked.",
  err_code_other_account: "This code belongs to a different account.",
  err_promo_empty: "Enter a promo code.",
  err_promo_not_found: "Promo code not found.",
  err_promo_expired: "This promo code has expired.",
  err_promo_used_up: "This promo code has run out.",
  err_promo_already: "You’ve already used this promo code.",
  err_pay: "Couldn’t start the payment. Try again or pick another method.",
  err_pay_unavailable: "This payment method is unavailable right now. Pick another one.",
  err_pay_min: "This method isn’t available for this amount. Pick another one.",
  err_servers_busy: "Our servers are busy. Try again in a minute.",
  err_in_progress: "Still working on your last request. Please wait.",
  err_create_failed: "Couldn’t set up the device. Try again.",
  err_session: "Your session has expired. Please sign in again.",
};

const ru: ShellDict = {
  skip: "Перейти к содержимому",
  home: "Главная Kovra",
  lang_button: "Язык: {name}",
  language: "Язык",
  theme_button: "Тема: {name}",
  theme: "Тема",
  theme_system: "Система",
  theme_light: "Светлая",
  theme_dark: "Тёмная",
  prefs: "Настройки",
  copy: "Копировать",
  copied: "Скопировано",
  copy_failed: "Не удалось скопировать. Выделите текст и скопируйте вручную.",
  close: "Закрыть",
  cancel: "Отмена",
  retry: "Попробовать снова",
  dismiss: "Скрыть",
  loading: "Загрузка…",
  err_generic: "Что-то пошло не так. Попробуйте ещё раз.",
  err_network: "Проблема с соединением. Проверьте интернет и попробуйте снова.",
  err_rate_limit: "Слишком много попыток. Повторите через {s} с.",
  err_rate_limit_generic: "Слишком много попыток. Подождите минуту.",
  err_bad_credentials: "Неверный email или пароль.",
  err_fill_all: "Заполните все поля.",
  err_email_invalid: "Введите корректный email.",
  err_password_len: "Пароль должен содержать от 8 до 128 символов.",
  err_code_invalid: "Неверный код. Проверьте его и попробуйте снова.",
  err_code_expired: "Срок действия кода истёк. Запросите новый.",
  err_code_attempts: "Слишком много неверных кодов. Запросите новый.",
  err_user_exists: "Аккаунт с этим email уже существует. Войдите в него.",
  err_user_not_found: "Такой аккаунт не найден.",
  err_send_failed: "Не удалось отправить код. Попробуйте через минуту.",
  err_email_taken: "Этот email уже привязан к другому аккаунту.",
  err_tg_taken: "Уже привязан другой аккаунт Telegram. Сначала отвяжите его.",
  err_unlink_primary: "Нельзя отвязать способ входа, с которым вы регистрировались.",
  err_not_linked: "Этот способ входа не привязан.",
  err_code_other_account: "Этот код относится к другому аккаунту.",
  err_promo_empty: "Введите промокод.",
  err_promo_not_found: "Промокод не найден.",
  err_promo_expired: "Срок действия промокода истёк.",
  err_promo_used_up: "Лимит этого промокода исчерпан.",
  err_promo_already: "Вы уже использовали этот промокод.",
  err_pay: "Не удалось начать оплату. Попробуйте снова или выберите другой способ.",
  err_pay_unavailable: "Этот способ оплаты сейчас недоступен. Выберите другой.",
  err_pay_min: "Этот способ недоступен для такой суммы. Выберите другой.",
  err_servers_busy: "Серверы сейчас перегружены. Попробуйте через минуту.",
  err_in_progress: "Предыдущий запрос ещё выполняется. Подождите немного.",
  err_create_failed: "Не удалось настроить устройство. Попробуйте снова.",
  err_session: "Сессия истекла. Войдите снова.",
};

const es: ShellDict = {
  skip: "Saltar al contenido",
  home: "Inicio de Kovra",
  lang_button: "Idioma: {name}",
  language: "Idioma",
  theme_button: "Tema: {name}",
  theme: "Tema",
  theme_system: "Sistema",
  theme_light: "Claro",
  theme_dark: "Oscuro",
  prefs: "Preferencias",
  copy: "Copiar",
  copied: "Copiado",
  copy_failed: "No se pudo copiar. Selecciona el texto y cópialo a mano.",
  close: "Cerrar",
  cancel: "Cancelar",
  retry: "Reintentar",
  dismiss: "Descartar",
  loading: "Cargando…",
  err_generic: "Algo salió mal. Inténtalo de nuevo.",
  err_network: "Problema de conexión. Revisa tu internet e inténtalo de nuevo.",
  err_rate_limit: "Demasiados intentos. Inténtalo de nuevo en {s} s.",
  err_rate_limit_generic: "Demasiados intentos. Espera un minuto.",
  err_bad_credentials: "Correo o contraseña incorrectos.",
  err_fill_all: "Completa todos los campos.",
  err_email_invalid: "Introduce un correo electrónico válido.",
  err_password_len: "La contraseña debe tener entre 8 y 128 caracteres.",
  err_code_invalid: "Ese código no es correcto. Revísalo e inténtalo de nuevo.",
  err_code_expired: "Este código ha caducado. Solicita uno nuevo.",
  err_code_attempts: "Demasiados códigos incorrectos. Solicita uno nuevo.",
  err_user_exists: "Ya existe una cuenta con este correo. Inicia sesión.",
  err_user_not_found: "No encontramos esa cuenta.",
  err_send_failed: "No pudimos enviar el código. Inténtalo de nuevo en un minuto.",
  err_email_taken: "Este correo ya está vinculado a otra cuenta.",
  err_tg_taken: "Ya hay otra cuenta de Telegram vinculada. Desvincúlala primero.",
  err_unlink_primary: "No puedes desvincular el método con el que te registraste.",
  err_not_linked: "Este método de inicio de sesión no está vinculado.",
  err_code_other_account: "Este código pertenece a otra cuenta.",
  err_promo_empty: "Introduce un código promocional.",
  err_promo_not_found: "Código promocional no encontrado.",
  err_promo_expired: "Este código promocional ha caducado.",
  err_promo_used_up: "Este código promocional se ha agotado.",
  err_promo_already: "Ya usaste este código promocional.",
  err_pay: "No se pudo iniciar el pago. Inténtalo de nuevo o elige otro método.",
  err_pay_unavailable: "Este método de pago no está disponible ahora. Elige otro.",
  err_pay_min: "Este método no está disponible para este importe. Elige otro.",
  err_servers_busy: "Nuestros servidores están ocupados. Inténtalo de nuevo en un minuto.",
  err_in_progress: "Todavía estamos procesando tu última solicitud. Espera un momento.",
  err_create_failed: "No se pudo configurar el dispositivo. Inténtalo de nuevo.",
  err_session: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
};

const de: ShellDict = {
  skip: "Zum Inhalt springen",
  home: "Kovra-Startseite",
  lang_button: "Sprache: {name}",
  language: "Sprache",
  theme_button: "Darstellung: {name}",
  theme: "Darstellung",
  theme_system: "System",
  theme_light: "Hell",
  theme_dark: "Dunkel",
  prefs: "Einstellungen",
  copy: "Kopieren",
  copied: "Kopiert",
  copy_failed: "Kopieren fehlgeschlagen. Markiere den Text und kopiere ihn manuell.",
  close: "Schließen",
  cancel: "Abbrechen",
  retry: "Erneut versuchen",
  dismiss: "Ausblenden",
  loading: "Wird geladen…",
  err_generic: "Etwas ist schiefgelaufen. Bitte versuch es noch einmal.",
  err_network: "Verbindungsproblem. Prüfe deine Internetverbindung und versuch es noch einmal.",
  err_rate_limit: "Zu viele Versuche. Versuch es in {s} Sekunden erneut.",
  err_rate_limit_generic: "Zu viele Versuche. Bitte warte eine Minute.",
  err_bad_credentials: "E-Mail oder Passwort ist falsch.",
  err_fill_all: "Bitte fülle alle Felder aus.",
  err_email_invalid: "Gib eine gültige E-Mail-Adresse ein.",
  err_password_len: "Das Passwort muss 8 bis 128 Zeichen lang sein.",
  err_code_invalid: "Der Code stimmt nicht. Prüfe ihn und versuch es noch einmal.",
  err_code_expired: "Dieser Code ist abgelaufen. Fordere einen neuen an.",
  err_code_attempts: "Zu viele falsche Codes. Fordere einen neuen an.",
  err_user_exists: "Mit dieser E-Mail gibt es schon ein Konto. Melde dich stattdessen an.",
  err_user_not_found: "Wir konnten dieses Konto nicht finden.",
  err_send_failed: "Wir konnten den Code nicht senden. Versuch es in einer Minute erneut.",
  err_email_taken: "Diese E-Mail ist bereits mit einem anderen Konto verknüpft.",
  err_tg_taken: "Es ist bereits ein anderes Telegram-Konto verknüpft. Trenne es zuerst.",
  err_unlink_primary: "Die Anmeldemethode, mit der du dich registriert hast, kannst du nicht trennen.",
  err_not_linked: "Diese Anmeldemethode ist nicht verknüpft.",
  err_code_other_account: "Dieser Code gehört zu einem anderen Konto.",
  err_promo_empty: "Gib einen Promo-Code ein.",
  err_promo_not_found: "Promo-Code nicht gefunden.",
  err_promo_expired: "Dieser Promo-Code ist abgelaufen.",
  err_promo_used_up: "Dieser Promo-Code ist aufgebraucht.",
  err_promo_already: "Du hast diesen Promo-Code bereits verwendet.",
  err_pay: "Die Zahlung konnte nicht gestartet werden. Versuch es noch einmal oder wähle eine andere Methode.",
  err_pay_unavailable: "Diese Zahlungsmethode ist gerade nicht verfügbar. Wähle eine andere.",
  err_pay_min: "Diese Methode ist für diesen Betrag nicht verfügbar. Wähle eine andere.",
  err_servers_busy: "Unsere Server sind gerade ausgelastet. Versuch es in einer Minute erneut.",
  err_in_progress: "Deine letzte Anfrage wird noch bearbeitet. Bitte warte kurz.",
  err_create_failed: "Das Gerät konnte nicht eingerichtet werden. Versuch es noch einmal.",
  err_session: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
};

const fr: ShellDict = {
  skip: "Aller au contenu",
  home: "Accueil Kovra",
  lang_button: "Langue : {name}",
  language: "Langue",
  theme_button: "Thème : {name}",
  theme: "Thème",
  theme_system: "Système",
  theme_light: "Clair",
  theme_dark: "Sombre",
  prefs: "Préférences",
  copy: "Copier",
  copied: "Copié",
  copy_failed: "Impossible de copier. Sélectionnez le texte et copiez-le manuellement.",
  close: "Fermer",
  cancel: "Annuler",
  retry: "Réessayer",
  dismiss: "Masquer",
  loading: "Chargement…",
  err_generic: "Une erreur s’est produite. Veuillez réessayer.",
  err_network: "Problème de connexion. Vérifiez votre connexion Internet et réessayez.",
  err_rate_limit: "Trop de tentatives. Réessayez dans {s} secondes.",
  err_rate_limit_generic: "Trop de tentatives. Veuillez patienter une minute.",
  err_bad_credentials: "E-mail ou mot de passe incorrect.",
  err_fill_all: "Veuillez remplir tous les champs.",
  err_email_invalid: "Saisissez une adresse e-mail valide.",
  err_password_len: "Le mot de passe doit contenir entre 8 et 128 caractères.",
  err_code_invalid: "Ce code est incorrect. Vérifiez-le et réessayez.",
  err_code_expired: "Ce code a expiré. Demandez-en un nouveau.",
  err_code_attempts: "Trop de codes incorrects. Demandez-en un nouveau.",
  err_user_exists: "Un compte existe déjà avec cet e-mail. Connectez-vous plutôt.",
  err_user_not_found: "Nous n’avons pas trouvé ce compte.",
  err_send_failed: "Impossible d’envoyer le code. Réessayez dans une minute.",
  err_email_taken: "Cet e-mail est déjà associé à un autre compte.",
  err_tg_taken: "Un autre compte Telegram est déjà associé. Dissociez-le d’abord.",
  err_unlink_primary: "Vous ne pouvez pas dissocier la méthode utilisée lors de votre inscription.",
  err_not_linked: "Cette méthode de connexion n’est pas associée.",
  err_code_other_account: "Ce code appartient à un autre compte.",
  err_promo_empty: "Saisissez un code promo.",
  err_promo_not_found: "Code promo introuvable.",
  err_promo_expired: "Ce code promo a expiré.",
  err_promo_used_up: "Ce code promo est épuisé.",
  err_promo_already: "Vous avez déjà utilisé ce code promo.",
  err_pay: "Impossible de lancer le paiement. Réessayez ou choisissez un autre moyen de paiement.",
  err_pay_unavailable: "Ce moyen de paiement est indisponible pour le moment. Choisissez-en un autre.",
  err_pay_min: "Ce moyen de paiement n’est pas disponible pour ce montant. Choisissez-en un autre.",
  err_servers_busy: "Nos serveurs sont saturés. Réessayez dans une minute.",
  err_in_progress: "Votre dernière demande est encore en cours. Veuillez patienter.",
  err_create_failed: "Impossible de configurer l’appareil. Réessayez.",
  err_session: "Votre session a expiré. Veuillez vous reconnecter.",
};

export const SHELL: Readonly<Record<Lang, ShellDict>> = { en, ru, es, de, fr };

/** Shell dictionary for the current cabinet language. */
export function useShellT(): ShellDict {
  return SHELL[useCabinetLang()];
}

/**
 * Server error -> UI text in `lang`.
 * Known strings map to dictionary keys (rate limits keep their seconds).
 * Unknown text is shown only when its script matches the UI language
 * (Cyrillic for ru, Latin for en); otherwise the generic message.
 */
export function localizeError(raw: unknown, status: number | undefined, lang: Lang): string {
  const d = SHELL[lang];
  const c = classifyServerError(raw, status);
  if (!c) return d.err_generic;
  if ("key" in c) {
    if (c.key === "err_rate_limit") {
      return typeof c.seconds === "number" ? fmt(d.err_rate_limit, { s: c.seconds }) : d.err_rate_limit_generic;
    }
    return d[c.key];
  }
  if (c.script === "cyrillic") return lang === "ru" ? c.raw : d.err_generic;
  return lang === "en" ? c.raw : d.err_generic;
}

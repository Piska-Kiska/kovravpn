// src/lib/server-errors.ts
//
// Classifies the error strings our API routes return (mostly Russian, some
// English) into dictionary keys, so the cabinet never shows Russian server
// text in another language. Pure, no imports: loaded by node tests directly.
// localizeError() in src/lib/i18n-shell.ts turns the result into UI text.

export type ServerErrorKey =
  | "err_bad_credentials"
  | "err_rate_limit"
  | "err_rate_limit_generic"
  | "err_fill_all"
  | "err_email_invalid"
  | "err_password_len"
  | "err_code_invalid"
  | "err_code_expired"
  | "err_code_attempts"
  | "err_user_exists"
  | "err_user_not_found"
  | "err_send_failed"
  | "err_email_taken"
  | "err_tg_taken"
  | "err_unlink_primary"
  | "err_not_linked"
  | "err_code_other_account"
  | "err_promo_empty"
  | "err_promo_not_found"
  | "err_promo_expired"
  | "err_promo_used_up"
  | "err_promo_already"
  | "err_pay"
  | "err_pay_unavailable"
  | "err_pay_min"
  | "err_servers_busy"
  | "err_in_progress"
  | "err_create_failed"
  | "err_session"
  | "err_generic";

export type Classified =
  | { key: ServerErrorKey; seconds?: number }
  | { raw: string; script: "cyrillic" | "latin" }
  | null;

/** Exact server strings (compared after trim). */
export const SERVER_ERROR_TABLE: Readonly<Record<string, ServerErrorKey>> = {
  "Неверный email или пароль": "err_bad_credentials",

  "Email и пароль обязательны": "err_fill_all",
  "Email и код обязательны": "err_fill_all",
  "Все поля обязательны": "err_fill_all",

  "Некорректный email": "err_email_invalid",

  "Пароль не менее 8 символов": "err_password_len",
  "Пароль от 8 до 128 символов": "err_password_len",

  "Неверный код": "err_code_invalid",
  "Неверный код подтверждения": "err_code_invalid",

  "Код истёк — запросите новый": "err_code_expired",
  "Код истёк или не найден — запросите новый": "err_code_expired",

  "Слишком много неверных попыток — запросите новый код": "err_code_attempts",

  "Пользователь уже существует — используйте вход": "err_user_exists",

  "Пользователь не найден": "err_user_not_found",
  "Аккаунт не найден": "err_user_not_found",
  "Account not found": "err_user_not_found",

  "Не удалось отправить код": "err_send_failed",
  "Ошибка отправки": "err_send_failed",

  "Email уже привязан": "err_email_taken",
  "Этот email уже привязан к другому аккаунту": "err_email_taken",

  "Telegram уже привязан": "err_tg_taken",
  "У вашего аккаунта уже привязан другой Telegram. Сначала отвяжите старый.": "err_tg_taken",

  "Нельзя отвязать основной способ входа": "err_unlink_primary",

  "Email не привязан": "err_not_linked",
  "Telegram не привязан": "err_not_linked",

  "Код принадлежит другому аккаунту": "err_code_other_account",

  "Введите промокод": "err_promo_empty",
  "Промокод не найден": "err_promo_not_found",
  "Промокод истёк": "err_promo_expired",
  "Промокод исчерпан": "err_promo_used_up",
  "Вы уже использовали этот промокод": "err_promo_already",

  "Не удалось создать платёж. Попробуйте позже.": "err_pay",
  "Could not create payment. Try again later.": "err_pay",

  "Card payments are not configured": "err_pay_unavailable",
  "Platega payments are not configured": "err_pay_unavailable",
  "Payment method not available": "err_pay_unavailable",
  "Invalid method": "err_pay_unavailable",

  "This method does not take an amount this small": "err_pay_min",

  "VPN servers are temporarily unavailable, try again in a minute": "err_servers_busy",

  "Operation in progress, please wait": "err_in_progress",

  "Profile creation failed": "err_create_failed",
  "Delete failed": "err_create_failed",

  Unauthorized: "err_session",
  unauthorized: "err_session",

  "Too many requests": "err_rate_limit_generic",

  "Ошибка регистрации": "err_generic",
  "Ошибка сброса пароля": "err_generic",
  "Ошибка": "err_generic",
  "Ошибка отвязки": "err_generic",
  Error: "err_generic",
  internal: "err_generic",
};

/**
 * «Слишком много попыток. Подождите N сек», «Подождите N сек»,
 * «… Подождите ~N сек.», "Too many attempts. Wait ~Ns.", "Please wait Ns".
 */
export const RATE_LIMIT_RE = /(?:Подождите|Wait|Please wait)\s*~?(\d+)\s*(?:сек|s)/i;

const CYRILLIC_RE = /[А-Яа-яЁё]/;

export function classifyServerError(raw: unknown, status?: number): Classified {
  const text = typeof raw === "string" ? raw.trim() : "";

  if (text) {
    // Own-property check: "constructor", "toString" etc. must not match.
    if (Object.prototype.hasOwnProperty.call(SERVER_ERROR_TABLE, text)) {
      return { key: SERVER_ERROR_TABLE[text] };
    }

    const m = RATE_LIMIT_RE.exec(text);
    if (m) {
      const seconds = Number.parseInt(m[1], 10);
      return Number.isFinite(seconds) && seconds > 0
        ? { key: "err_rate_limit", seconds }
        : { key: "err_rate_limit_generic" };
    }
  }

  if (status === 429) return { key: "err_rate_limit_generic" };
  if (typeof status === "number" && status >= 500) return { key: "err_generic" };

  if (!text) return null;
  return { raw: text, script: CYRILLIC_RE.test(text) ? "cyrillic" : "latin" };
}

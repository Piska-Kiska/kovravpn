// tests/server-errors.test.mjs — run: node --test tests/
//
// classifyServerError (src/lib/server-errors.ts): every server string the
// cabinet can receive maps to a dictionary key, rate limits keep their
// seconds, unknown text is passed through with its script.

import { test } from "node:test";
import assert from "node:assert/strict";
import { RATE_LIMIT_RE, SERVER_ERROR_TABLE, classifyServerError } from "../src/lib/server-errors.ts";

const TABLE = [
  ["Неверный email или пароль", "err_bad_credentials"],
  ["Email и пароль обязательны", "err_fill_all"],
  ["Email и код обязательны", "err_fill_all"],
  ["Все поля обязательны", "err_fill_all"],
  ["Некорректный email", "err_email_invalid"],
  ["Пароль не менее 8 символов", "err_password_len"],
  ["Пароль от 8 до 128 символов", "err_password_len"],
  ["Неверный код", "err_code_invalid"],
  ["Неверный код подтверждения", "err_code_invalid"],
  ["Код истёк — запросите новый", "err_code_expired"],
  ["Код истёк или не найден — запросите новый", "err_code_expired"],
  ["Слишком много неверных попыток — запросите новый код", "err_code_attempts"],
  ["Пользователь уже существует — используйте вход", "err_user_exists"],
  ["Пользователь не найден", "err_user_not_found"],
  ["Аккаунт не найден", "err_user_not_found"],
  ["Account not found", "err_user_not_found"],
  ["Не удалось отправить код", "err_send_failed"],
  ["Ошибка отправки", "err_send_failed"],
  ["Email уже привязан", "err_email_taken"],
  ["Этот email уже привязан к другому аккаунту", "err_email_taken"],
  ["Telegram уже привязан", "err_tg_taken"],
  ["У вашего аккаунта уже привязан другой Telegram. Сначала отвяжите старый.", "err_tg_taken"],
  ["Нельзя отвязать основной способ входа", "err_unlink_primary"],
  ["Email не привязан", "err_not_linked"],
  ["Telegram не привязан", "err_not_linked"],
  ["Код принадлежит другому аккаунту", "err_code_other_account"],
  ["Введите промокод", "err_promo_empty"],
  ["Промокод не найден", "err_promo_not_found"],
  ["Промокод истёк", "err_promo_expired"],
  ["Промокод исчерпан", "err_promo_used_up"],
  ["Вы уже использовали этот промокод", "err_promo_already"],
  ["Не удалось создать платёж. Попробуйте позже.", "err_pay"],
  ["Could not create payment. Try again later.", "err_pay"],
  ["Card payments are not configured", "err_pay_unavailable"],
  ["Platega payments are not configured", "err_pay_unavailable"],
  ["Payment method not available", "err_pay_unavailable"],
  ["Invalid method", "err_pay_unavailable"],
  ["This method does not take an amount this small", "err_pay_min"],
  ["VPN servers are temporarily unavailable, try again in a minute", "err_servers_busy"],
  ["Operation in progress, please wait", "err_in_progress"],
  ["Profile creation failed", "err_create_failed"],
  ["Delete failed", "err_create_failed"],
  ["Unauthorized", "err_session"],
  ["unauthorized", "err_session"],
  ["Too many requests", "err_rate_limit_generic"],
  ["Ошибка регистрации", "err_generic"],
  ["Ошибка сброса пароля", "err_generic"],
  ["Ошибка", "err_generic"],
  ["Ошибка отвязки", "err_generic"],
  ["Error", "err_generic"],
  ["internal", "err_generic"],
];

test("every exact server string maps to its key", () => {
  for (const [raw, key] of TABLE) assert.deepEqual(classifyServerError(raw), { key }, raw);
});

test("the table in the source has no rows the test does not know", () => {
  assert.equal(Object.keys(SERVER_ERROR_TABLE).length, TABLE.length);
});

test("exact matches ignore surrounding whitespace and any status", () => {
  assert.deepEqual(classifyServerError("  Неверный email или пароль \n", 401), { key: "err_bad_credentials" });
  assert.deepEqual(classifyServerError("Промокод исчерпан", 500), { key: "err_promo_used_up" });
});

test("rate-limit strings keep their seconds", () => {
  const cases = [
    ["Слишком много попыток. Подождите 42 сек", 42],
    ["Подождите 60 сек", 60],
    ["Слишком много попыток. Подождите ~15 сек.", 15],
    ["Too many attempts. Wait ~30s.", 30],
    ["Please wait 7s", 7],
    ["please WAIT 120 s", 120],
  ];
  for (const [raw, seconds] of cases) {
    assert.deepEqual(classifyServerError(raw, 429), { key: "err_rate_limit", seconds }, raw);
    assert.ok(RATE_LIMIT_RE.test(raw), raw);
  }
});

test("status fallbacks: 429 -> rate_limit_generic, 5xx -> generic", () => {
  assert.deepEqual(classifyServerError(undefined, 429), { key: "err_rate_limit_generic" });
  assert.deepEqual(classifyServerError("something odd", 429), { key: "err_rate_limit_generic" });
  assert.deepEqual(classifyServerError(undefined, 500), { key: "err_generic" });
  assert.deepEqual(classifyServerError("Что-то сломалось", 502), { key: "err_generic" });
});

test("unknown text is returned with its script", () => {
  assert.deepEqual(classifyServerError("Сумма от 1 до 10000 ₽", 400), { raw: "Сумма от 1 до 10000 ₽", script: "cyrillic" });
  assert.deepEqual(classifyServerError("Expired or invalid", 400), { raw: "Expired or invalid", script: "latin" });
});

test("empty or non-string input without a telling status is null", () => {
  assert.equal(classifyServerError(undefined), null);
  assert.equal(classifyServerError(null, 400), null);
  assert.equal(classifyServerError("   "), null);
  assert.equal(classifyServerError({ error: "x" }), null);
  assert.equal(classifyServerError(42, 200), null);
});

test("prototype property names are not treated as table entries", () => {
  for (const raw of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.deepEqual(classifyServerError(raw), { raw, script: "latin" }, raw);
  }
});

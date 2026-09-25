// src/lib/i18n-auth.ts
//
// Strings for /login and /register in the five cabinet languages.
// Same rules as src/lib/i18n-shell.ts: no Cyrillic outside ru, no emoji or
// arrow glyphs, {name} placeholders, es "tú", de "du", fr "vous", ru «вы».
// Product names (Kovra, Telegram) are never translated.
"use client";

import type { Lang } from "@/i18n/dict";
import { useCabinetLang } from "@/lib/cabinet-lang";

export interface AuthDict {
  // page titles and brand panel
  page_login: string;
  page_register: string;
  brand_kicker: string;
  brand_title: string;
  proof1_t: string;
  proof1_b: string;
  proof2_t: string;
  proof2_b: string;
  proof3_t: string;
  proof3_b: string;
  proof_strip: string;
  // headings
  kicker_login: string;
  title_login: string;
  sub_login: string;
  kicker_register: string;
  title_register: string;
  sub_register: string;
  ref_badge: string;
  kicker_recovery: string;
  title_forgot: string;
  sub_forgot: string;
  title_reset: string;
  title_verify: string;
  sub_code_sent: string;
  // form controls
  method_label: string;
  method_email: string;
  method_telegram: string;
  email_label: string;
  email_ph: string;
  password_label: string;
  password_new_label: string;
  password_hint: string;
  show_password: string;
  hide_password: string;
  forgot_link: string;
  remember: string;
  submit_login: string;
  submit_register: string;
  send_code: string;
  change_password: string;
  confirm: string;
  back_to_signin: string;
  use_other_email: string;
  change_email: string;
  resend: string;
  resend_in: string;
  spam_hint: string;
  code_label: string;
  code_digit: string;
  password_updated: string;
  // Telegram
  tg_intro: string;
  tg_continue: string;
  tg_open: string;
  tg_helper: string;
  tg_waiting: string;
  tg_fallback: string;
  tg_code_label: string;
  tg_new_code: string;
  err_tg_start: string;
  // footer and legal
  no_account: string;
  create_account: string;
  have_account: string;
  sign_in_link: string;
  legal: string;
  terms: string;
  privacy: string;
  back_to_site: string;
  // client validation
  err_email_required: string;
  err_password_required: string;
  err_password_short: string;
  err_code_incomplete: string;
}

const en: AuthDict = {
  page_login: "Sign in",
  page_register: "Create account",
  brand_kicker: "Private VPN",
  brand_title: "Privacy, perfected.",
  proof1_t: "No logs",
  proof1_b: "Nothing recorded, so nothing to hand over.",
  proof2_t: "Up to 3 devices",
  proof2_b: "iPhone, Android, Mac, Windows and TV.",
  proof3_t: "No auto-renewal",
  proof3_b: "One-time payments by card or crypto.",
  proof_strip: "No logs · Up to 3 devices · No auto-renewal",

  kicker_login: "Welcome back",
  title_login: "Sign in",
  sub_login: "Your devices and plan are one step away.",
  kicker_register: "New account",
  title_register: "Create your account",
  sub_register: "Card or crypto. Up to 3 devices. Ready in a minute.",
  ref_badge: "Invited by a friend · {code}",
  kicker_recovery: "Account recovery",
  title_forgot: "Reset your password",
  sub_forgot: "Enter your account email and we’ll send you a 6-digit code.",
  title_reset: "Set a new password",
  title_verify: "Check your email",
  sub_code_sent: "We sent a 6-digit code to {email}.",

  method_label: "Sign-in method",
  method_email: "Email",
  method_telegram: "Telegram",
  email_label: "Email",
  email_ph: "you@example.com",
  password_label: "Password",
  password_new_label: "New password",
  password_hint: "At least 8 characters",
  show_password: "Show password",
  hide_password: "Hide password",
  forgot_link: "Forgot password?",
  remember: "Keep me signed in for 7 days",
  submit_login: "Sign in",
  submit_register: "Continue",
  send_code: "Send code",
  change_password: "Change password",
  confirm: "Confirm",
  back_to_signin: "Back to sign in",
  use_other_email: "Use a different email",
  change_email: "Change email",
  resend: "Resend code",
  resend_in: "Resend in {s}s",
  spam_hint: "Can’t find it? Check your spam folder.",
  code_label: "Verification code",
  code_digit: "Digit {n} of 6",
  password_updated: "Password updated. Sign in with your new password.",

  tg_intro: "We’ll create a one-time code. Open our Telegram bot, tap Start, and you’re in.",
  tg_continue: "Continue with Telegram",
  tg_open: "Open Telegram",
  tg_helper: "Tap Start in the bot. This page signs you in automatically.",
  tg_waiting: "Waiting for Telegram…",
  tg_fallback: "Or send this code to @KovraVPN_bot:",
  tg_code_label: "Your code",
  tg_new_code: "Get a new code",
  err_tg_start: "Couldn’t create a Telegram code. Try again.",

  no_account: "New to Kovra?",
  create_account: "Create an account",
  have_account: "Already have an account?",
  sign_in_link: "Sign in",
  legal: "By continuing, you agree to the {terms} and {privacy}.",
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  back_to_site: "Back to kovravpn.com",

  err_email_required: "Enter your email.",
  err_password_required: "Enter your password.",
  err_password_short: "Use at least 8 characters.",
  err_code_incomplete: "Enter all 6 digits.",
};

const ru: AuthDict = {
  page_login: "Вход",
  page_register: "Регистрация",
  brand_kicker: "Приватный VPN",
  brand_title: "Безупречная приватность.",
  proof1_t: "Без логов",
  proof1_b: "Мы ничего не записываем, поэтому передавать нечего.",
  proof2_t: "До 3 устройств",
  proof2_b: "iPhone, Android, Mac, Windows и телевизор.",
  proof3_t: "Без автопродления",
  proof3_b: "Разовые платежи картой или криптовалютой.",
  proof_strip: "Без логов · До 3 устройств · Без автопродления",

  kicker_login: "С возвращением",
  title_login: "Вход",
  sub_login: "Ваши устройства и тариф совсем рядом.",
  kicker_register: "Новый аккаунт",
  title_register: "Создайте аккаунт",
  sub_register: "Карта или криптовалюта. До 3 устройств. Готово за минуту.",
  ref_badge: "Приглашение от друга · {code}",
  kicker_recovery: "Восстановление доступа",
  title_forgot: "Сброс пароля",
  sub_forgot: "Введите email аккаунта, и мы пришлём 6-значный код.",
  title_reset: "Новый пароль",
  title_verify: "Проверьте почту",
  sub_code_sent: "Мы отправили 6-значный код на {email}.",

  method_label: "Способ входа",
  method_email: "Email",
  method_telegram: "Telegram",
  email_label: "Email",
  email_ph: "you@example.com",
  password_label: "Пароль",
  password_new_label: "Новый пароль",
  password_hint: "Минимум 8 символов",
  show_password: "Показать пароль",
  hide_password: "Скрыть пароль",
  forgot_link: "Забыли пароль?",
  remember: "Не выходить 7 дней",
  submit_login: "Войти",
  submit_register: "Продолжить",
  send_code: "Отправить код",
  change_password: "Сменить пароль",
  confirm: "Подтвердить",
  back_to_signin: "Назад ко входу",
  use_other_email: "Указать другой email",
  change_email: "Изменить email",
  resend: "Отправить снова",
  resend_in: "Повторно через {s} с",
  spam_hint: "Не нашли письмо? Проверьте папку «Спам».",
  code_label: "Код подтверждения",
  code_digit: "Цифра {n} из 6",
  password_updated: "Пароль обновлён. Войдите с новым паролем.",

  tg_intro: "Мы создадим одноразовый код. Откройте нашего бота в Telegram и запустите его, вход выполнится автоматически.",
  tg_continue: "Продолжить через Telegram",
  tg_open: "Открыть Telegram",
  tg_helper: "Запустите бота. Эта страница выполнит вход сама.",
  tg_waiting: "Ждём подтверждения в Telegram…",
  tg_fallback: "Или отправьте этот код боту @KovraVPN_bot:",
  tg_code_label: "Ваш код",
  tg_new_code: "Получить новый код",
  err_tg_start: "Не удалось создать код для Telegram. Попробуйте снова.",

  no_account: "Впервые в Kovra?",
  create_account: "Создать аккаунт",
  have_account: "Уже есть аккаунт?",
  sign_in_link: "Войти",
  legal: "Продолжая, вы принимаете {terms} и {privacy}.",
  terms: "Условия использования",
  privacy: "Политику конфиденциальности",
  back_to_site: "Вернуться на kovravpn.com",

  err_email_required: "Введите email.",
  err_password_required: "Введите пароль.",
  err_password_short: "Минимум 8 символов.",
  err_code_incomplete: "Введите все 6 цифр.",
};

const es: AuthDict = {
  page_login: "Iniciar sesión",
  page_register: "Crear cuenta",
  brand_kicker: "VPN privada",
  brand_title: "Privacidad, perfeccionada.",
  proof1_t: "Sin registros",
  proof1_b: "No registramos nada, así que no hay nada que entregar.",
  proof2_t: "Hasta 3 dispositivos",
  proof2_b: "iPhone, Android, Mac, Windows y TV.",
  proof3_t: "Sin renovación automática",
  proof3_b: "Pagos únicos con tarjeta o cripto.",
  proof_strip: "Sin registros · Hasta 3 dispositivos · Sin renovación automática",

  kicker_login: "Hola de nuevo",
  title_login: "Inicia sesión",
  sub_login: "Tus dispositivos y tu plan, a un paso.",
  kicker_register: "Cuenta nueva",
  title_register: "Crea tu cuenta",
  sub_register: "Tarjeta o cripto. Hasta 3 dispositivos. Listo en un minuto.",
  ref_badge: "Invitación de un amigo · {code}",
  kicker_recovery: "Recuperar cuenta",
  title_forgot: "Restablece tu contraseña",
  sub_forgot: "Introduce el correo de tu cuenta y te enviaremos un código de 6 dígitos.",
  title_reset: "Crea una contraseña nueva",
  title_verify: "Revisa tu correo",
  sub_code_sent: "Enviamos un código de 6 dígitos a {email}.",

  method_label: "Método de acceso",
  method_email: "Correo",
  method_telegram: "Telegram",
  email_label: "Correo electrónico",
  email_ph: "tu@ejemplo.com",
  password_label: "Contraseña",
  password_new_label: "Contraseña nueva",
  password_hint: "Mínimo 8 caracteres",
  show_password: "Mostrar contraseña",
  hide_password: "Ocultar contraseña",
  forgot_link: "¿Olvidaste tu contraseña?",
  remember: "Mantener la sesión 7 días",
  submit_login: "Iniciar sesión",
  submit_register: "Continuar",
  send_code: "Enviar código",
  change_password: "Cambiar contraseña",
  confirm: "Confirmar",
  back_to_signin: "Volver a iniciar sesión",
  use_other_email: "Usar otro correo",
  change_email: "Cambiar correo",
  resend: "Reenviar código",
  resend_in: "Reenviar en {s} s",
  spam_hint: "¿No lo encuentras? Revisa la carpeta de spam.",
  code_label: "Código de verificación",
  code_digit: "Dígito {n} de 6",
  password_updated: "Contraseña actualizada. Inicia sesión con la nueva.",

  tg_intro: "Crearemos un código de un solo uso. Abre nuestro bot de Telegram, pulsa Iniciar y listo.",
  tg_continue: "Continuar con Telegram",
  tg_open: "Abrir Telegram",
  tg_helper: "Pulsa Iniciar en el bot. Esta página iniciará tu sesión automáticamente.",
  tg_waiting: "Esperando a Telegram…",
  tg_fallback: "O envía este código a @KovraVPN_bot:",
  tg_code_label: "Tu código",
  tg_new_code: "Obtener un código nuevo",
  err_tg_start: "No se pudo crear el código de Telegram. Inténtalo de nuevo.",

  no_account: "¿Nuevo en Kovra?",
  create_account: "Crea una cuenta",
  have_account: "¿Ya tienes cuenta?",
  sign_in_link: "Inicia sesión",
  legal: "Al continuar, aceptas los {terms} y la {privacy}.",
  terms: "Términos del servicio",
  privacy: "Política de privacidad",
  back_to_site: "Volver a kovravpn.com",

  err_email_required: "Introduce tu correo.",
  err_password_required: "Introduce tu contraseña.",
  err_password_short: "Usa al menos 8 caracteres.",
  err_code_incomplete: "Introduce los 6 dígitos.",
};

const de: AuthDict = {
  page_login: "Anmelden",
  page_register: "Konto erstellen",
  brand_kicker: "Privates VPN",
  brand_title: "Privatsphäre, perfektioniert.",
  proof1_t: "Keine Logs",
  proof1_b: "Nichts wird gespeichert, also gibt es nichts herauszugeben.",
  proof2_t: "Bis zu 3 Geräte",
  proof2_b: "iPhone, Android, Mac, Windows und TV.",
  proof3_t: "Keine automatische Verlängerung",
  proof3_b: "Einmalzahlungen per Karte oder Krypto.",
  proof_strip: "Keine Logs · Bis zu 3 Geräte · Keine Auto-Verlängerung",

  kicker_login: "Willkommen zurück",
  title_login: "Anmelden",
  sub_login: "Deine Geräte und dein Tarif sind nur einen Schritt entfernt.",
  kicker_register: "Neues Konto",
  title_register: "Erstelle dein Konto",
  sub_register: "Karte oder Krypto. Bis zu 3 Geräte. In einer Minute startklar.",
  ref_badge: "Einladung von einem Freund · {code}",
  kicker_recovery: "Kontowiederherstellung",
  title_forgot: "Passwort zurücksetzen",
  sub_forgot: "Gib die E-Mail-Adresse deines Kontos ein und wir senden dir einen 6-stelligen Code.",
  title_reset: "Neues Passwort festlegen",
  title_verify: "Prüfe dein Postfach",
  sub_code_sent: "Wir haben einen 6-stelligen Code an {email} gesendet.",

  method_label: "Anmeldemethode",
  method_email: "E-Mail",
  method_telegram: "Telegram",
  email_label: "E-Mail",
  email_ph: "du@beispiel.de",
  password_label: "Passwort",
  password_new_label: "Neues Passwort",
  password_hint: "Mindestens 8 Zeichen",
  show_password: "Passwort anzeigen",
  hide_password: "Passwort verbergen",
  forgot_link: "Passwort vergessen?",
  remember: "7 Tage angemeldet bleiben",
  submit_login: "Anmelden",
  submit_register: "Weiter",
  send_code: "Code senden",
  change_password: "Passwort ändern",
  confirm: "Bestätigen",
  back_to_signin: "Zurück zur Anmeldung",
  use_other_email: "Andere E-Mail verwenden",
  change_email: "E-Mail ändern",
  resend: "Code erneut senden",
  resend_in: "Erneut senden in {s} s",
  spam_hint: "Nicht gefunden? Schau in deinen Spam-Ordner.",
  code_label: "Bestätigungscode",
  code_digit: "Ziffer {n} von 6",
  password_updated: "Passwort aktualisiert. Melde dich mit dem neuen Passwort an.",

  tg_intro: "Wir erstellen einen Einmalcode. Öffne unseren Telegram-Bot, tippe auf Starten und schon bist du drin.",
  tg_continue: "Weiter mit Telegram",
  tg_open: "Telegram öffnen",
  tg_helper: "Tippe im Bot auf Starten. Diese Seite meldet dich automatisch an.",
  tg_waiting: "Warte auf Telegram…",
  tg_fallback: "Oder sende diesen Code an @KovraVPN_bot:",
  tg_code_label: "Dein Code",
  tg_new_code: "Neuen Code anfordern",
  err_tg_start: "Der Telegram-Code konnte nicht erstellt werden. Versuch es noch einmal.",

  no_account: "Neu bei Kovra?",
  create_account: "Konto erstellen",
  have_account: "Schon ein Konto?",
  sign_in_link: "Anmelden",
  legal: "Wenn du fortfährst, stimmst du den {terms} und der {privacy} zu.",
  terms: "Nutzungsbedingungen",
  privacy: "Datenschutzerklärung",
  back_to_site: "Zurück zu kovravpn.com",

  err_email_required: "Gib deine E-Mail-Adresse ein.",
  err_password_required: "Gib dein Passwort ein.",
  err_password_short: "Verwende mindestens 8 Zeichen.",
  err_code_incomplete: "Gib alle 6 Ziffern ein.",
};

const fr: AuthDict = {
  page_login: "Connexion",
  page_register: "Créer un compte",
  brand_kicker: "VPN privé",
  brand_title: "Confidentialité, perfectionnée.",
  proof1_t: "Aucun journal",
  proof1_b: "Rien n’est enregistré, donc rien à transmettre.",
  proof2_t: "Jusqu’à 3 appareils",
  proof2_b: "iPhone, Android, Mac, Windows et TV.",
  proof3_t: "Sans renouvellement automatique",
  proof3_b: "Paiements uniques par carte ou en crypto.",
  proof_strip: "Aucun journal · Jusqu’à 3 appareils · Sans renouvellement auto",

  kicker_login: "Content de vous revoir",
  title_login: "Connexion",
  sub_login: "Vos appareils et votre abonnement sont à portée de main.",
  kicker_register: "Nouveau compte",
  title_register: "Créez votre compte",
  sub_register: "Carte ou crypto. Jusqu’à 3 appareils. Prêt en une minute.",
  ref_badge: "Invitation d’un ami · {code}",
  kicker_recovery: "Récupération du compte",
  title_forgot: "Réinitialisez votre mot de passe",
  sub_forgot: "Saisissez l’e-mail de votre compte et nous vous enverrons un code à 6 chiffres.",
  title_reset: "Nouveau mot de passe",
  title_verify: "Vérifiez vos e-mails",
  sub_code_sent: "Nous avons envoyé un code à 6 chiffres à {email}.",

  method_label: "Méthode de connexion",
  method_email: "E-mail",
  method_telegram: "Telegram",
  email_label: "E-mail",
  email_ph: "vous@exemple.fr",
  password_label: "Mot de passe",
  password_new_label: "Nouveau mot de passe",
  password_hint: "Au moins 8 caractères",
  show_password: "Afficher le mot de passe",
  hide_password: "Masquer le mot de passe",
  forgot_link: "Mot de passe oublié ?",
  remember: "Rester connecté 7 jours",
  submit_login: "Se connecter",
  submit_register: "Continuer",
  send_code: "Envoyer le code",
  change_password: "Changer le mot de passe",
  confirm: "Confirmer",
  back_to_signin: "Retour à la connexion",
  use_other_email: "Utiliser une autre adresse",
  change_email: "Modifier l’e-mail",
  resend: "Renvoyer le code",
  resend_in: "Renvoyer dans {s} s",
  spam_hint: "Vous ne le trouvez pas ? Vérifiez vos spams.",
  code_label: "Code de vérification",
  code_digit: "Chiffre {n} sur 6",
  password_updated: "Mot de passe mis à jour. Connectez-vous avec le nouveau.",

  tg_intro: "Nous créons un code à usage unique. Ouvrez notre bot Telegram, appuyez sur Démarrer, et c’est fait.",
  tg_continue: "Continuer avec Telegram",
  tg_open: "Ouvrir Telegram",
  tg_helper: "Appuyez sur Démarrer dans le bot. Cette page vous connectera automatiquement.",
  tg_waiting: "En attente de Telegram…",
  tg_fallback: "Ou envoyez ce code à @KovraVPN_bot :",
  tg_code_label: "Votre code",
  tg_new_code: "Obtenir un nouveau code",
  err_tg_start: "Impossible de créer le code Telegram. Réessayez.",

  no_account: "Nouveau sur Kovra ?",
  create_account: "Créer un compte",
  have_account: "Vous avez déjà un compte ?",
  sign_in_link: "Se connecter",
  legal: "En continuant, vous acceptez les {terms} et la {privacy}.",
  terms: "Conditions d’utilisation",
  privacy: "Politique de confidentialité",
  back_to_site: "Retour sur kovravpn.com",

  err_email_required: "Saisissez votre e-mail.",
  err_password_required: "Saisissez votre mot de passe.",
  err_password_short: "Utilisez au moins 8 caractères.",
  err_code_incomplete: "Saisissez les 6 chiffres.",
};

export const AUTH: Readonly<Record<Lang, AuthDict>> = { en, ru, es, de, fr };

/** Auth dictionary for the current cabinet language. */
export function useAuthT(): AuthDict {
  return AUTH[useCabinetLang()];
}

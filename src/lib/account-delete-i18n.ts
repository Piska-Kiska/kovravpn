// src/lib/account-delete-i18n.ts
//
// Strings for /dashboard/account/delete in the five cabinet languages.
// Same rules as lib/i18n-auth.ts: no Cyrillic outside ru, no emoji or arrow
// glyphs, {name} placeholders, es "tú", de "du", fr "vous" with a no-break
// space before high punctuation, ru «вы»; the cabinet's own words for plan,
// balance and device (lib/dash-i18n.ts).
//
// The page is opened from the Kovra app too, so nothing here asks to buy or
// points to a page that sells: money is named only as what deletion takes.
//
// Pure: type imports only, so node tests load it as it is.

import type { Lang } from "@/i18n/resolve";
import type { Plural } from "@/lib/cabinet-lang";
import type { ERROR_KEYS, FormError } from "@/app/dashboard/account/delete/delete-flow";

type ErrorKey = (typeof ERROR_KEYS)[FormError];

export type AccountDeleteDict = Readonly<
  {
    page_title: string;
    kicker: string;
    title: string;
    lead: string;
    loading: string;
    load_failed: string;
    retry: string;
    dryrun_note: string;
    money_title: string;
    /** {amount} */
    money_wallet: string;
    /** {n}, {date} */
    money_plans: Plural;
    money_hint: string;
    what_title: string;
    signin_email: string;
    signin_telegram: string;
    signin_both: string;
    /** {n} */
    what_devices: Plural;
    what_referral: string;
    what_kept: string;
    /** {privacy} is the link below. */
    details: string;
    privacy: string;
    ack: string;
    send_email: string;
    send_telegram: string;
    send: string;
    sent_email: string;
    sent_telegram: string;
    code_label: string;
    /** {n} */
    digit_label: string;
    submit: string;
    resend: string;
    confirm_title: string;
    confirm_body: string;
    confirm_yes: string;
    closed: string;
    linked: string;
    support: string;
    done_title: string;
    done_text: string;
    dryrun_title: string;
    /** {keys}, {devices} */
    dryrun_result: string;
  } & Record<ErrorKey, string>
>;

const en: AccountDeleteDict = {
  page_title: "Delete account | Kovra",
  kicker: "Account",
  title: "Delete account",
  lead: "This deletes your Kovra account and everything in it. It can’t be undone.",
  loading: "Loading…",
  load_failed: "The page didn’t load. Check your connection and try again.",
  retry: "Try again",
  dryrun_note: "This is the owner’s account: every step runs, but nothing is deleted.",
  money_title: "Money that goes with the account",
  money_wallet: "Balance: {amount}",
  money_plans: { one: "{n} plan running until {date}", other: "{n} plans running until {date}" },
  money_hint: "It is deleted with the account and can’t be restored afterwards.",
  what_title: "What is deleted",
  signin_email: "Signing in with your e-mail and password",
  signin_telegram: "Signing in with Telegram",
  signin_both: "Signing in with your e-mail and with Telegram",
  what_devices: { one: "{n} device: its link stops working", other: "{n} devices: their links stop working" },
  what_referral: "Your referral link",
  what_kept: "Payment records the law requires us to keep stay for the period it sets.",
  details: "Details are in the {privacy}.",
  privacy: "Privacy Policy",
  ack: "I understand that the account, its money and its devices are deleted for good.",
  send_email: "We’ll send a code to your e-mail.",
  send_telegram: "We’ll send a code to your Telegram.",
  send: "Send the code",
  sent_email: "The code is in your e-mail. It works for 10 minutes.",
  sent_telegram: "The code is in Telegram. It works for 10 minutes.",
  code_label: "Code",
  digit_label: "Digit {n}",
  submit: "Delete account",
  resend: "Send a new code",
  confirm_title: "Delete the account for good?",
  confirm_body: "The account, its money and its devices go now. This can’t be undone.",
  confirm_yes: "Delete",
  closed: "Deleting the account on this page isn’t open for your account yet. Write to us and we’ll delete it.",
  linked: "You signed in with a login that is linked to another account. Sign in with that account’s main login, or write to us.",
  support: "Write to support",
  done_title: "Account deleted",
  done_text: "Your account, its money and its devices are deleted. You can close this page.",
  dryrun_title: "Dry run complete",
  dryrun_result: "Nothing was deleted. A real deletion would remove {keys} records and {devices} devices.",
  err_code_invalid: "Wrong code. Check it and try again.",
  err_code_expired: "The code has expired or was used up. Ask for a new one.",
  err_rate_limited: "Too many attempts. Try again in {min} min.",
  err_busy: "The account is busy with another operation. Try again in a minute.",
  err_send_failed: "The code couldn’t be sent. Try again later or write to us.",
  err_no_channel: "This account has no e-mail or Telegram to send a code to. Write to us and we’ll delete it.",
  err_panel_failed: "Some devices couldn’t be removed yet, and nothing else was deleted. Try again in a minute: the code still works.",
  err_generic: "Something went wrong. Try again.",
};

const ru: AccountDeleteDict = {
  page_title: "Удаление аккаунта | Kovra",
  kicker: "Аккаунт",
  title: "Удаление аккаунта",
  lead: "Аккаунт Kovra удаляется вместе со всем, что в нём есть. Отменить это нельзя.",
  loading: "Загрузка…",
  load_failed: "Страница не загрузилась. Проверьте интернет и попробуйте снова.",
  retry: "Попробовать снова",
  dryrun_note: "Это аккаунт владельца: все шаги проходят, но ничего не удаляется.",
  money_title: "Деньги, которые уйдут вместе с аккаунтом",
  money_wallet: "Баланс: {amount}",
  money_plans: {
    one: "{n} тариф действует до {date}",
    few: "{n} тарифа действуют до {date}",
    many: "{n} тарифов действуют до {date}",
    other: "{n} тарифа действуют до {date}",
  },
  money_hint: "Они удаляются вместе с аккаунтом, вернуть их потом нельзя.",
  what_title: "Что удаляется",
  signin_email: "Вход по почте и паролю",
  signin_telegram: "Вход через Telegram",
  signin_both: "Вход по почте и через Telegram",
  what_devices: {
    one: "{n} устройство: его ссылка перестанет работать",
    few: "{n} устройства: их ссылки перестанут работать",
    many: "{n} устройств: их ссылки перестанут работать",
    other: "{n} устройства: их ссылки перестанут работать",
  },
  what_referral: "Ваша реферальная ссылка",
  what_kept: "Записи о платежах, которые закон обязывает хранить, остаются на срок, который он задаёт.",
  details: "Подробности в {privacy}.",
  privacy: "Политике конфиденциальности",
  ack: "Я понимаю, что аккаунт, его деньги и устройства удаляются навсегда.",
  send_email: "Мы пришлём код на вашу почту.",
  send_telegram: "Мы пришлём код в ваш Telegram.",
  send: "Прислать код",
  sent_email: "Код пришёл на почту. Он действует 10 минут.",
  sent_telegram: "Код пришёл в Telegram. Он действует 10 минут.",
  code_label: "Код",
  digit_label: "Цифра {n}",
  submit: "Удалить аккаунт",
  resend: "Прислать новый код",
  confirm_title: "Удалить аккаунт навсегда?",
  confirm_body: "Аккаунт, его деньги и устройства удалятся сейчас. Отменить это нельзя.",
  confirm_yes: "Удалить",
  closed: "Удаление на этой странице для вашего аккаунта пока не открыто. Напишите нам, и мы удалим его.",
  linked: "Вы вошли под входом, который привязан к другому аккаунту. Войдите основным входом этого аккаунта или напишите нам.",
  support: "Написать в поддержку",
  done_title: "Аккаунт удалён",
  done_text: "Аккаунт, его деньги и устройства удалены. Эту страницу можно закрыть.",
  dryrun_title: "Пробный прогон завершён",
  dryrun_result: "Ничего не удалено. Настоящее удаление убрало бы записей: {keys}, устройств: {devices}.",
  err_code_invalid: "Неверный код. Проверьте его и попробуйте снова.",
  err_code_expired: "Код истёк или использован. Запросите новый.",
  err_rate_limited: "Слишком много попыток. Попробуйте через {min} мин.",
  err_busy: "Аккаунт занят другой операцией. Попробуйте через минуту.",
  err_send_failed: "Код не отправился. Попробуйте позже или напишите нам.",
  err_no_channel: "У аккаунта нет почты или Telegram, куда прислать код. Напишите нам, и мы удалим его.",
  err_panel_failed: "Часть устройств пока не удалилась, больше ничего не удалено. Попробуйте через минуту: код ещё действует.",
  err_generic: "Что-то пошло не так. Попробуйте снова.",
};

const es: AccountDeleteDict = {
  page_title: "Eliminar la cuenta | Kovra",
  kicker: "Cuenta",
  title: "Eliminar la cuenta",
  lead: "Esto elimina tu cuenta de Kovra y todo lo que contiene. No se puede deshacer.",
  loading: "Cargando…",
  load_failed: "La página no se ha cargado. Revisa tu conexión e inténtalo de nuevo.",
  retry: "Reintentar",
  dryrun_note: "Es la cuenta del propietario: se hacen todos los pasos, pero no se elimina nada.",
  money_title: "Dinero que se va con la cuenta",
  money_wallet: "Saldo: {amount}",
  money_plans: { one: "{n} plan activo hasta el {date}", other: "{n} planes activos hasta el {date}" },
  money_hint: "Se elimina con la cuenta y no se puede recuperar después.",
  what_title: "Qué se elimina",
  signin_email: "El acceso con tu correo y contraseña",
  signin_telegram: "El acceso con Telegram",
  signin_both: "El acceso con tu correo y con Telegram",
  what_devices: {
    one: "{n} dispositivo: su enlace deja de funcionar",
    other: "{n} dispositivos: sus enlaces dejan de funcionar",
  },
  what_referral: "Tu enlace de referido",
  what_kept: "Los registros de pagos que la ley nos obliga a guardar se conservan durante el plazo que fija.",
  details: "Los detalles están en la {privacy}.",
  privacy: "Política de privacidad",
  ack: "Entiendo que la cuenta, su dinero y sus dispositivos se eliminan para siempre.",
  send_email: "Te enviaremos un código a tu correo.",
  send_telegram: "Te enviaremos un código a tu Telegram.",
  send: "Enviar el código",
  sent_email: "El código está en tu correo. Funciona durante 10 minutos.",
  sent_telegram: "El código está en Telegram. Funciona durante 10 minutos.",
  code_label: "Código",
  digit_label: "Dígito {n}",
  submit: "Eliminar la cuenta",
  resend: "Enviar un código nuevo",
  confirm_title: "¿Eliminar la cuenta para siempre?",
  confirm_body: "La cuenta, su dinero y sus dispositivos se eliminan ahora. No se puede deshacer.",
  confirm_yes: "Eliminar",
  closed: "La eliminación en esta página aún no está abierta para tu cuenta. Escríbenos y la eliminaremos.",
  linked: "Has entrado con un acceso vinculado a otra cuenta. Entra con el acceso principal de esa cuenta o escríbenos.",
  support: "Escribir a soporte",
  done_title: "Cuenta eliminada",
  done_text: "Tu cuenta, su dinero y sus dispositivos se han eliminado. Puedes cerrar esta página.",
  dryrun_title: "Prueba terminada",
  dryrun_result: "No se ha eliminado nada. Una eliminación real quitaría {keys} registros y {devices} dispositivos.",
  err_code_invalid: "Código incorrecto. Revísalo e inténtalo de nuevo.",
  err_code_expired: "El código ha caducado o ya se usó. Pide uno nuevo.",
  err_rate_limited: "Demasiados intentos. Inténtalo dentro de {min} min.",
  err_busy: "La cuenta está ocupada con otra operación. Inténtalo dentro de un minuto.",
  err_send_failed: "No se ha podido enviar el código. Inténtalo más tarde o escríbenos.",
  err_no_channel: "Esta cuenta no tiene correo ni Telegram para enviar un código. Escríbenos y la eliminaremos.",
  err_panel_failed: "Algunos dispositivos aún no se han podido quitar y no se ha eliminado nada más. Inténtalo dentro de un minuto: el código sigue funcionando.",
  err_generic: "Algo ha salido mal. Inténtalo de nuevo.",
};

const de: AccountDeleteDict = {
  page_title: "Konto löschen | Kovra",
  kicker: "Konto",
  title: "Konto löschen",
  lead: "Damit wird dein Kovra-Konto mit allem, was darin ist, gelöscht. Das lässt sich nicht rückgängig machen.",
  loading: "Wird geladen…",
  load_failed: "Die Seite wurde nicht geladen. Prüfe deine Verbindung und versuch es noch einmal.",
  retry: "Noch einmal versuchen",
  dryrun_note: "Das ist das Konto des Inhabers: Alle Schritte laufen, aber nichts wird gelöscht.",
  money_title: "Geld, das mit dem Konto geht",
  money_wallet: "Guthaben: {amount}",
  money_plans: { one: "{n} Tarif läuft bis {date}", other: "{n} Tarife laufen bis {date}" },
  money_hint: "Es wird mit dem Konto gelöscht und lässt sich danach nicht wiederherstellen.",
  what_title: "Was gelöscht wird",
  signin_email: "Die Anmeldung mit deiner E-Mail und deinem Passwort",
  signin_telegram: "Die Anmeldung mit Telegram",
  signin_both: "Die Anmeldung mit deiner E-Mail und mit Telegram",
  what_devices: {
    one: "{n} Gerät: Sein Link funktioniert nicht mehr",
    other: "{n} Geräte: Ihre Links funktionieren nicht mehr",
  },
  what_referral: "Dein Empfehlungslink",
  what_kept: "Zahlungsbelege, die wir laut Gesetz aufbewahren müssen, bleiben für die Frist, die es vorschreibt.",
  details: "Details stehen in der {privacy}.",
  privacy: "Datenschutzerklärung",
  ack: "Mir ist klar, dass das Konto, sein Geld und seine Geräte endgültig gelöscht werden.",
  send_email: "Wir schicken dir einen Code per E-Mail.",
  send_telegram: "Wir schicken dir einen Code in Telegram.",
  send: "Code senden",
  sent_email: "Der Code ist in deiner E-Mail. Er gilt 10 Minuten.",
  sent_telegram: "Der Code ist in Telegram. Er gilt 10 Minuten.",
  code_label: "Code",
  digit_label: "Ziffer {n}",
  submit: "Konto löschen",
  resend: "Neuen Code senden",
  confirm_title: "Konto endgültig löschen?",
  confirm_body: "Das Konto, sein Geld und seine Geräte werden jetzt gelöscht. Das lässt sich nicht rückgängig machen.",
  confirm_yes: "Löschen",
  closed: "Das Löschen auf dieser Seite ist für dein Konto noch nicht freigeschaltet. Schreib uns, und wir löschen es.",
  linked: "Du hast dich mit einer Anmeldung angemeldet, die mit einem anderen Konto verknüpft ist. Melde dich mit der Hauptanmeldung dieses Kontos an oder schreib uns.",
  support: "Support schreiben",
  done_title: "Konto gelöscht",
  done_text: "Dein Konto, sein Geld und seine Geräte sind gelöscht. Du kannst diese Seite schließen.",
  dryrun_title: "Probelauf abgeschlossen",
  dryrun_result: "Nichts wurde gelöscht. Eine echte Löschung würde {keys} Einträge und {devices} Geräte entfernen.",
  err_code_invalid: "Falscher Code. Prüfe ihn und versuch es noch einmal.",
  err_code_expired: "Der Code ist abgelaufen oder verbraucht. Fordere einen neuen an.",
  err_rate_limited: "Zu viele Versuche. Versuch es in {min} Min. noch einmal.",
  err_busy: "Das Konto ist gerade mit etwas anderem beschäftigt. Versuch es in einer Minute noch einmal.",
  err_send_failed: "Der Code konnte nicht gesendet werden. Versuch es später noch einmal oder schreib uns.",
  err_no_channel: "Dieses Konto hat keine E-Mail und kein Telegram für einen Code. Schreib uns, und wir löschen es.",
  err_panel_failed: "Einige Geräte konnten noch nicht entfernt werden, sonst wurde nichts gelöscht. Versuch es in einer Minute noch einmal: Der Code gilt weiter.",
  err_generic: "Etwas ist schiefgelaufen. Versuch es noch einmal.",
};

const fr: AccountDeleteDict = {
  page_title: "Supprimer le compte | Kovra",
  kicker: "Compte",
  title: "Supprimer le compte",
  lead: "Cela supprime votre compte Kovra et tout ce qu’il contient. Cette action est irréversible.",
  loading: "Chargement…",
  load_failed: "La page ne s’est pas chargée. Vérifiez votre connexion et réessayez.",
  retry: "Réessayer",
  dryrun_note: "C’est le compte du propriétaire : toutes les étapes s’exécutent, mais rien n’est supprimé.",
  money_title: "L’argent qui part avec le compte",
  money_wallet: "Solde : {amount}",
  money_plans: { one: "{n} forfait actif jusqu’au {date}", other: "{n} forfaits actifs jusqu’au {date}" },
  money_hint: "Il est supprimé avec le compte et ne peut pas être récupéré ensuite.",
  what_title: "Ce qui est supprimé",
  signin_email: "La connexion avec votre e-mail et votre mot de passe",
  signin_telegram: "La connexion avec Telegram",
  signin_both: "La connexion avec votre e-mail et avec Telegram",
  what_devices: {
    one: "{n} appareil : son lien cesse de fonctionner",
    other: "{n} appareils : leurs liens cessent de fonctionner",
  },
  what_referral: "Votre lien de parrainage",
  what_kept: "Les traces de paiement que la loi nous oblige à garder restent pendant la durée qu’elle fixe.",
  details: "Les détails sont dans la {privacy}.",
  privacy: "Politique de confidentialité",
  ack: "Je comprends que le compte, son argent et ses appareils sont supprimés définitivement.",
  send_email: "Nous vous enverrons un code par e-mail.",
  send_telegram: "Nous vous enverrons un code dans Telegram.",
  send: "Envoyer le code",
  sent_email: "Le code est dans votre e-mail. Il est valable 10 minutes.",
  sent_telegram: "Le code est dans Telegram. Il est valable 10 minutes.",
  code_label: "Code",
  digit_label: "Chiffre {n}",
  submit: "Supprimer le compte",
  resend: "Envoyer un nouveau code",
  confirm_title: "Supprimer le compte définitivement ?",
  confirm_body: "Le compte, son argent et ses appareils sont supprimés maintenant. Cette action est irréversible.",
  confirm_yes: "Supprimer",
  closed: "La suppression sur cette page n’est pas encore ouverte pour votre compte. Écrivez-nous et nous le supprimerons.",
  linked: "Vous êtes connecté avec un identifiant lié à un autre compte. Connectez-vous avec l’identifiant principal de ce compte, ou écrivez-nous.",
  support: "Écrire au support",
  done_title: "Compte supprimé",
  done_text: "Votre compte, son argent et ses appareils sont supprimés. Vous pouvez fermer cette page.",
  dryrun_title: "Essai terminé",
  dryrun_result: "Rien n’a été supprimé. Une vraie suppression retirerait {keys} enregistrements et {devices} appareils.",
  err_code_invalid: "Code incorrect. Vérifiez-le et réessayez.",
  err_code_expired: "Le code a expiré ou a déjà servi. Demandez-en un nouveau.",
  err_rate_limited: "Trop de tentatives. Réessayez dans {min} min.",
  err_busy: "Le compte est occupé par une autre opération. Réessayez dans une minute.",
  err_send_failed: "Le code n’a pas pu être envoyé. Réessayez plus tard ou écrivez-nous.",
  err_no_channel: "Ce compte n’a ni e-mail ni Telegram où envoyer un code. Écrivez-nous et nous le supprimerons.",
  err_panel_failed: "Certains appareils n’ont pas encore pu être retirés, et rien d’autre n’a été supprimé. Réessayez dans une minute : le code reste valable.",
  err_generic: "Une erreur s’est produite. Réessayez.",
};

export const ACCOUNT_DELETE_DICT: Readonly<Record<Lang, AccountDeleteDict>> = { en, ru, es, de, fr };

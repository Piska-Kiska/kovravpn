// src/i18n/support.ts
//
// The support page (/support), in all five site languages. The app opens it
// in its app view (`/support?src=app`, lib/legal-routes.ts) as the build's
// support address, so the page says how to reach a person without the bot:
// paragraphs marked `webOnly` point to the bot or to other apps and are left
// out of the app view.
//
// The app's buttons are quoted as the app spells them: it speaks Russian and
// English only, so the other languages quote its English button. The
// cabinet's button is quoted in each language as src/lib/dash-i18n.ts has it.
//
// No imports but a type: tests load this file under plain Node type stripping.

import type { Lang } from "./dict";

/** Where a link in the text leads (components/SupportView.tsx). */
export type SupportLink = "email" | "bot" | "delete" | "privacy" | "terms";

export type SupportSegment = string | { readonly link: SupportLink; readonly text: string };

export interface SupportPara {
  readonly parts: readonly SupportSegment[];
  /** Shown on the web page only: it points to the bot or to other apps. */
  readonly webOnly?: boolean;
}

export interface SupportFaq {
  readonly q: string;
  readonly a: readonly SupportPara[];
}

export interface SupportDoc {
  readonly title: string;
  readonly intro: string;
  readonly contactH: string;
  readonly contact: readonly SupportPara[];
  readonly faqH: string;
  readonly faq: readonly SupportFaq[];
  readonly docsH: string;
  readonly docs: readonly SupportPara[];
}

const EMAIL = "support@kovravpn.com";
const BOT = "@KovraVPN_bot";

const para = (...parts: SupportSegment[]): SupportPara => ({ parts });
const webOnly = (...parts: SupportSegment[]): SupportPara => ({ parts, webOnly: true });

export const SUPPORT: Readonly<Record<Lang, SupportDoc>> = {
  en: {
    title: "Support",
    intro: "Questions about connecting, your account or your data: write to us and a person will answer.",
    contactH: "How to reach us",
    contact: [
      para("Email: ", { link: "email", text: EMAIL }, "."),
      webOnly("Telegram: ", { link: "bot", text: BOT }, ", our bot."),
      para(
        "To help us answer faster, tell us the email or Telegram account you signed up with, your device and what exactly happens. Never send passwords, codes or card details.",
      ),
    ],
    faqH: "Frequently asked questions",
    faq: [
      {
        q: "How do I sign in to the Kovra app?",
        a: [
          para(
            "Open your Kovra account on the website, open the menu of the device you want to use and tap “Code for the app”. In the app, tap “Sign in with a code from your account” and type the code. It works once and for ten minutes.",
          ),
          webOnly("Other apps that import a subscription link use the device’s link from the same menu."),
        ],
      },
      {
        q: "The connection does not work. What should I do?",
        a: [
          para(
            "Check that your internet works with the connection turned off, then try another location. If it still does not work, write to us and tell us the location and what you see.",
          ),
        ],
      },
      {
        q: "How do I delete my account?",
        a: [
          para(
            "Open the ",
            { link: "delete", text: "account deletion page" },
            ". What is deleted and when is described in the ",
            { link: "privacy", text: "Privacy Policy" },
            ".",
          ),
        ],
      },
      {
        q: "Is the Kovra app free?",
        a: [para("Yes. The app is free; it connects with the access in your Kovra account.")],
      },
      {
        q: "What data is kept?",
        a: [para("What we keep, why and for how long is in the ", { link: "privacy", text: "Privacy Policy" }, ".")],
      },
    ],
    docsH: "Documents",
    docs: [
      para({ link: "privacy", text: "Privacy Policy" }, ": what data we keep and why."),
      para({ link: "terms", text: "Terms of Service" }, ": the rules for using the service."),
    ],
  },
  ru: {
    title: "Поддержка",
    intro: "Вопросы о подключении, аккаунте или данных: напишите нам, и вам ответит человек.",
    contactH: "Как с нами связаться",
    contact: [
      para("Почта: ", { link: "email", text: EMAIL }, "."),
      webOnly("Telegram: ", { link: "bot", text: BOT }, ", наш бот."),
      para(
        "Чтобы мы ответили быстрее, укажите почту или аккаунт Telegram, с которыми вы зарегистрировались, устройство и что именно происходит. Никогда не присылайте пароли, коды и данные карт.",
      ),
    ],
    faqH: "Частые вопросы",
    faq: [
      {
        q: "Как войти в приложение Kovra?",
        a: [
          para(
            "Откройте свой аккаунт Kovra на сайте, откройте меню нужного устройства и нажмите «Код для приложения». В приложении нажмите «Войти по коду из аккаунта» и введите код. Он действует один раз и десять минут.",
          ),
          webOnly("Другие приложения, которые принимают ссылку подписки, берут ссылку устройства из того же меню."),
        ],
      },
      {
        q: "Подключение не работает. Что делать?",
        a: [
          para(
            "Проверьте, что интернет работает с выключенным подключением, и попробуйте другую локацию. Если не помогло, напишите нам: какая локация и что вы видите.",
          ),
        ],
      },
      {
        q: "Как удалить аккаунт?",
        a: [
          para(
            "Откройте ",
            { link: "delete", text: "страницу удаления аккаунта" },
            ". Что удаляется и когда, описано в ",
            { link: "privacy", text: "Политике конфиденциальности" },
            ".",
          ),
        ],
      },
      {
        q: "Приложение Kovra бесплатное?",
        a: [para("Да. Приложение бесплатное, оно подключается с доступом из вашего аккаунта Kovra.")],
      },
      {
        q: "Какие данные хранятся?",
        a: [para("Что мы храним, зачем и сколько, описано в ", { link: "privacy", text: "Политике конфиденциальности" }, ".")],
      },
    ],
    docsH: "Документы",
    docs: [
      para({ link: "privacy", text: "Политика конфиденциальности" }, ": какие данные мы храним и зачем."),
      para({ link: "terms", text: "Пользовательское соглашение" }, ": правила пользования сервисом."),
    ],
  },
  es: {
    title: "Soporte",
    intro: "Preguntas sobre la conexión, tu cuenta o tus datos: escríbenos y te responderá una persona.",
    contactH: "Cómo contactarnos",
    contact: [
      para("Correo: ", { link: "email", text: EMAIL }, "."),
      webOnly("Telegram: ", { link: "bot", text: BOT }, ", nuestro bot."),
      para(
        "Para responderte antes, indícanos el correo o la cuenta de Telegram con los que te registraste, tu dispositivo y qué ocurre exactamente. Nunca envíes contraseñas, códigos ni datos de tarjetas.",
      ),
    ],
    faqH: "Preguntas frecuentes",
    faq: [
      {
        q: "¿Cómo inicio sesión en la app Kovra?",
        a: [
          para(
            "Abre tu cuenta de Kovra en el sitio web, abre el menú del dispositivo que quieres usar y toca «Código para la app». En la app, toca «Sign in with a code from your account» e introduce el código. Sirve una vez y durante diez minutos.",
          ),
          webOnly("Otras apps que importan un enlace de suscripción usan el enlace del dispositivo del mismo menú."),
        ],
      },
      {
        q: "La conexión no funciona. ¿Qué hago?",
        a: [
          para(
            "Comprueba que tu internet funciona con la conexión desactivada y prueba otra ubicación. Si sigue sin funcionar, escríbenos e indica la ubicación y lo que ves.",
          ),
        ],
      },
      {
        q: "¿Cómo elimino mi cuenta?",
        a: [
          para(
            "Abre la ",
            { link: "delete", text: "página de eliminación de la cuenta" },
            ". Qué se elimina y cuándo se describe en la ",
            { link: "privacy", text: "Política de privacidad" },
            ".",
          ),
        ],
      },
      {
        q: "¿La app Kovra es gratuita?",
        a: [para("Sí. La app es gratuita; se conecta con el acceso de tu cuenta de Kovra.")],
      },
      {
        q: "¿Qué datos se guardan?",
        a: [para("Qué guardamos, por qué y durante cuánto tiempo está en la ", { link: "privacy", text: "Política de privacidad" }, ".")],
      },
    ],
    docsH: "Documentos",
    docs: [
      para({ link: "privacy", text: "Política de privacidad" }, ": qué datos guardamos y por qué."),
      para({ link: "terms", text: "Términos del servicio" }, ": las reglas de uso del servicio."),
    ],
  },
  de: {
    title: "Support",
    intro: "Fragen zur Verbindung, zu deinem Konto oder zu deinen Daten: Schreib uns, ein Mensch antwortet dir.",
    contactH: "So erreichst du uns",
    contact: [
      para("E-Mail: ", { link: "email", text: EMAIL }, "."),
      webOnly("Telegram: ", { link: "bot", text: BOT }, ", unser Bot."),
      para(
        "Damit wir schneller antworten können, nenne uns die E-Mail-Adresse oder das Telegram-Konto, mit dem du dich registriert hast, dein Gerät und was genau passiert. Schick niemals Passwörter, Codes oder Kartendaten.",
      ),
    ],
    faqH: "Häufige Fragen",
    faq: [
      {
        q: "Wie melde ich mich in der Kovra-App an?",
        a: [
          para(
            "Öffne dein Kovra-Konto auf der Website, öffne das Menü des Geräts, das du nutzen willst, und tippe auf „Code für die App“. Tippe in der App auf „Sign in with a code from your account“ und gib den Code ein. Er gilt einmal und zehn Minuten lang.",
          ),
          webOnly("Andere Apps, die einen Abo-Link importieren, nutzen den Link des Geräts aus demselben Menü."),
        ],
      },
      {
        q: "Die Verbindung funktioniert nicht. Was tun?",
        a: [
          para(
            "Prüfe, ob dein Internet bei ausgeschalteter Verbindung funktioniert, und versuche einen anderen Standort. Hilft das nicht, schreib uns den Standort und was du siehst.",
          ),
        ],
      },
      {
        q: "Wie lösche ich mein Konto?",
        a: [
          para(
            "Öffne die ",
            { link: "delete", text: "Seite zum Löschen des Kontos" },
            ". Was wann gelöscht wird, steht in der ",
            { link: "privacy", text: "Datenschutzerklärung" },
            ".",
          ),
        ],
      },
      {
        q: "Ist die Kovra-App kostenlos?",
        a: [para("Ja. Die App ist kostenlos; sie verbindet sich mit dem Zugang aus deinem Kovra-Konto.")],
      },
      {
        q: "Welche Daten werden gespeichert?",
        a: [para("Was wir speichern, warum und wie lange, steht in der ", { link: "privacy", text: "Datenschutzerklärung" }, ".")],
      },
    ],
    docsH: "Dokumente",
    docs: [
      para({ link: "privacy", text: "Datenschutzerklärung" }, ": welche Daten wir speichern und warum."),
      para({ link: "terms", text: "Nutzungsbedingungen" }, ": die Regeln für die Nutzung des Dienstes."),
    ],
  },
  fr: {
    title: "Assistance",
    intro: "Des questions sur la connexion, votre compte ou vos données ? Écrivez-nous, une personne vous répondra.",
    contactH: "Nous contacter",
    contact: [
      para("E-mail : ", { link: "email", text: EMAIL }, "."),
      webOnly("Telegram : ", { link: "bot", text: BOT }, ", notre bot."),
      para(
        "Pour que nous répondions plus vite, indiquez l’e-mail ou le compte Telegram avec lequel vous vous êtes inscrit, votre appareil et ce qui se passe exactement. N’envoyez jamais de mots de passe, de codes ni de données de carte.",
      ),
    ],
    faqH: "Questions fréquentes",
    faq: [
      {
        q: "Comment me connecter à l’app Kovra ?",
        a: [
          para(
            "Ouvrez votre compte Kovra sur le site, ouvrez le menu de l’appareil à utiliser et touchez « Code pour l’app ». Dans l’app, touchez « Sign in with a code from your account » et saisissez le code. Il sert une fois et pendant dix minutes.",
          ),
          webOnly("Les autres apps qui importent un lien d’abonnement utilisent le lien de l’appareil du même menu."),
        ],
      },
      {
        q: "La connexion ne fonctionne pas. Que faire ?",
        a: [
          para(
            "Vérifiez qu’internet fonctionne connexion désactivée, puis essayez un autre emplacement. Si cela ne marche toujours pas, écrivez-nous en indiquant l’emplacement et ce que vous voyez.",
          ),
        ],
      },
      {
        q: "Comment supprimer mon compte ?",
        a: [
          para(
            "Ouvrez la ",
            { link: "delete", text: "page de suppression du compte" },
            ". Ce qui est supprimé et quand est décrit dans la ",
            { link: "privacy", text: "Politique de confidentialité" },
            ".",
          ),
        ],
      },
      {
        q: "L’app Kovra est-elle gratuite ?",
        a: [para("Oui. L’app est gratuite ; elle se connecte avec l’accès de votre compte Kovra.")],
      },
      {
        q: "Quelles données sont conservées ?",
        a: [para("Ce que nous conservons, pourquoi et combien de temps figure dans la ", { link: "privacy", text: "Politique de confidentialité" }, ".")],
      },
    ],
    docsH: "Documents",
    docs: [
      para({ link: "privacy", text: "Politique de confidentialité" }, " : les données que nous conservons et pourquoi."),
      para({ link: "terms", text: "Conditions d’utilisation" }, " : les règles d’utilisation du service."),
    ],
  },
};

// src/lib/account-delete-copy.ts
//
// The account deletion code as a letter and as a Telegram message, in the
// language of the page that asked for it (lib/account-delete.ts).
//
// A letter of its own, not the password reset letter: "your code" is exactly
// what a scammer asks a person to read out. This one says what the code does
// (it deletes the account, its money and every device), so the person knows
// not to hand it over.
//
// Pure: no Resend, no Telegram, no Redis. The one import has no imports.

import { isLang, type Lang } from "@/i18n/resolve";

const FROM = "Kovra <noreply@kovravpn.com>";

interface DeleteCodeCopy {
  /** Subject after "<code> — ". */
  readonly subject: string;
  /** The line above the code. */
  readonly lead: string;
  /** Small print under the code. */
  readonly footer: string;
  /** Telegram message; `{code}` is replaced. HTML parse mode. */
  readonly telegram: string;
}

// es "tú", de "du", fr "vous", ru «вы», as in the cabinet (lib/i18n-auth.ts).
// French puts a no-break space (U+00A0) before ":".
const COPY: Readonly<Record<Lang, DeleteCodeCopy>> = {
  en: {
    subject: "code to delete your Kovra account",
    lead: "Your code to delete your Kovra account:",
    footer:
      "The code is valid for 10 minutes. Do not share it with anyone: it permanently deletes the account, its balance, its plans and every device. If you did not ask to delete your account, do nothing and it stays as it is.",
    telegram:
      "Code to delete your Kovra account: <b>{code}</b>\n\nValid for 10 minutes. Do not share it with anyone: it permanently deletes the account, its balance, its plans and every device. If you did not ask for this, do nothing.",
  },
  ru: {
    subject: "код для удаления аккаунта Kovra",
    lead: "Код для удаления аккаунта Kovra:",
    footer:
      "Код действует 10 минут. Никому его не сообщайте: с ним аккаунт, баланс, тарифы и все устройства удаляются безвозвратно. Если вы не запрашивали удаление, ничего не делайте, и аккаунт останется как есть.",
    telegram:
      "Код для удаления аккаунта Kovra: <b>{code}</b>\n\nДействует 10 минут. Никому его не сообщайте: с ним аккаунт, баланс, тарифы и все устройства удаляются безвозвратно. Если вы не запрашивали удаление, ничего не делайте.",
  },
  es: {
    subject: "código para eliminar tu cuenta de Kovra",
    lead: "Tu código para eliminar tu cuenta de Kovra:",
    footer:
      "El código es válido durante 10 minutos. No lo compartas con nadie: elimina para siempre la cuenta, su saldo, sus planes y todos los dispositivos. Si no has pedido eliminar tu cuenta, no hagas nada y seguirá igual.",
    telegram:
      "Código para eliminar tu cuenta de Kovra: <b>{code}</b>\n\nVálido durante 10 minutos. No lo compartas con nadie: elimina para siempre la cuenta, su saldo, sus planes y todos los dispositivos. Si no lo has pedido, no hagas nada.",
  },
  de: {
    subject: "Code zum Löschen deines Kovra-Kontos",
    lead: "Dein Code zum Löschen deines Kovra-Kontos:",
    footer:
      "Der Code ist 10 Minuten gültig. Gib ihn niemandem weiter: Er löscht das Konto, sein Guthaben, seine Tarife und alle Geräte endgültig. Wenn du die Löschung nicht angefordert hast, tu nichts, und dein Konto bleibt, wie es ist.",
    telegram:
      "Code zum Löschen deines Kovra-Kontos: <b>{code}</b>\n\n10 Minuten gültig. Gib ihn niemandem weiter: Er löscht das Konto, sein Guthaben, seine Tarife und alle Geräte endgültig. Wenn du das nicht angefordert hast, tu nichts.",
  },
  fr: {
    subject: "code de suppression de votre compte Kovra",
    lead: "Votre code pour supprimer votre compte Kovra :",
    footer:
      "Le code est valable 10 minutes. Ne le communiquez à personne : il supprime définitivement le compte, son solde, ses forfaits et tous les appareils. Si vous n'avez pas demandé la suppression, ne faites rien et votre compte reste tel quel.",
    telegram:
      "Code de suppression de votre compte Kovra : <b>{code}</b>\n\nValable 10 minutes. Ne le communiquez à personne : il supprime définitivement le compte, son solde, ses forfaits et tous les appareils. Si vous ne l'avez pas demandé, ne faites rien.",
  },
};

const CODE_RE = /^\d{6}$/;

/** `lang` is untrusted (a request body): anything but a site language reads English. */
function copyFor(lang: unknown): { lang: Lang; c: DeleteCodeCopy } {
  const l: Lang = isLang(lang) ? lang : "en";
  return { lang: l, c: COPY[l] };
}

export interface DeleteCodeEmail {
  readonly from: string;
  readonly subject: string;
  readonly html: string;
}

/**
 * The letter. Throws RangeError on a code that is not six digits: the route
 * makes it, and a wrong one must fail loudly rather than be mailed.
 */
export function deleteCodeEmail(lang: unknown, code: string): DeleteCodeEmail {
  if (!CODE_RE.test(code)) throw new RangeError("deleteCodeEmail: the code must be six digits");
  const { lang: l, c } = copyFor(lang);
  // The copy is ours and the code is six digits: nothing to escape.
  return {
    from: FROM,
    subject: `${code} — ${c.subject}`,
    html: `
        <div lang="${l}" style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px">
          <h2 style="margin:0 0 8px">Kovra</h2>
          <p style="color:#666;margin:0 0 24px">${c.lead}</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px;background:#f5f5f5;border-radius:12px">${code}</div>
          <p style="color:#999;font-size:12px;margin:24px 0 0">${c.footer}</p>
        </div>
      `,
  };
}

/** The Telegram message (HTML parse mode). Same contract as deleteCodeEmail. */
export function deleteCodeTelegram(lang: unknown, code: string): string {
  if (!CODE_RE.test(code)) throw new RangeError("deleteCodeTelegram: the code must be six digits");
  return copyFor(lang).c.telegram.replace("{code}", code);
}

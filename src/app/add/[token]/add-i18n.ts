// src/app/add/[token]/add-i18n.ts
//
// Texts of the /add/<token> bridge in the bot's five languages. The page is
// opened from the bot with ?lang=<bot language>, and renders on the server in
// that language (no client-side switch, so no flash of another language).

export type AddLang = "en" | "ru" | "es" | "de" | "fr";

export interface AddDict {
  title: string;
  kicker: string;
  lead: string;
  open: string;
  noApp: string;
  copyLabel: string;
  copy: string;
  copied: string;
  copyFailed: string;
  limited: string;
}

export const ADD_DICTS: Readonly<Record<AddLang, AddDict>> = {
  en: {
    title: "Add Kovra to Happ",
    kicker: "One-tap setup",
    lead: "Happ opens by itself in a moment. If it does not, tap the button.",
    open: "Open in Happ",
    noApp: "No Happ yet? Install it, then come back and tap Open in Happ.",
    copyLabel: "Or copy the key and paste it in the app",
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Could not copy. Select the key and copy it by hand.",
    limited: "Too many requests. Try again in a minute.",
  },
  ru: {
    title: "Добавить Kovra в Happ",
    kicker: "Настройка в одно нажатие",
    lead: "Happ откроется сам через секунду. Если нет, нажмите кнопку.",
    open: "Открыть в Happ",
    noApp: "Happ ещё не установлен? Установите его, вернитесь сюда и нажмите «Открыть в Happ».",
    copyLabel: "Или скопируйте ключ и вставьте его в приложение",
    copy: "Копировать",
    copied: "Скопировано",
    copyFailed: "Не удалось скопировать. Выделите ключ и скопируйте вручную.",
    limited: "Слишком много запросов. Повторите через минуту.",
  },
  es: {
    title: "Añadir Kovra a Happ",
    kicker: "Configuración en un toque",
    lead: "Happ se abrirá solo en un momento. Si no, toca el botón.",
    open: "Abrir en Happ",
    noApp: "¿Aún no tienes Happ? Instálalo, vuelve aquí y toca Abrir en Happ.",
    copyLabel: "O copia la clave y pégala en la app",
    copy: "Copiar",
    copied: "Copiado",
    copyFailed: "No se pudo copiar. Selecciona la clave y cópiala a mano.",
    limited: "Demasiadas solicitudes. Inténtalo en un minuto.",
  },
  de: {
    title: "Kovra zu Happ hinzufügen",
    kicker: "Einrichtung mit einem Tippen",
    lead: "Happ öffnet sich gleich von selbst. Falls nicht, tippe auf die Taste.",
    open: "In Happ öffnen",
    noApp: "Noch kein Happ? Installiere es, komm zurück und tippe auf In Happ öffnen.",
    copyLabel: "Oder kopiere den Schlüssel und füge ihn in der App ein",
    copy: "Kopieren",
    copied: "Kopiert",
    copyFailed: "Kopieren fehlgeschlagen. Markiere den Schlüssel und kopiere ihn von Hand.",
    limited: "Zu viele Anfragen. Versuch es in einer Minute erneut.",
  },
  fr: {
    title: "Ajouter Kovra à Happ",
    kicker: "Configuration en un geste",
    lead: "Happ s'ouvre tout seul dans un instant. Sinon, touchez le bouton.",
    open: "Ouvrir dans Happ",
    noApp: "Pas encore Happ ? Installez-le, revenez ici et touchez Ouvrir dans Happ.",
    copyLabel: "Ou copiez la clé et collez-la dans l'app",
    copy: "Copier",
    copied: "Copié",
    copyFailed: "Impossible de copier. Sélectionnez la clé et copiez-la à la main.",
    limited: "Trop de requêtes. Réessayez dans une minute.",
  },
};

export function addLangOf(value: unknown): AddLang {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "ru" || v === "es" || v === "de" || v === "fr" ? v : "en";
}

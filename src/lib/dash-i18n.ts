// src/lib/dash-i18n.ts
//
// Client-side i18n for the dashboard (and other "use client" app pages).
// Independent from src/i18n/* (which is the DOM-walker used by static pages).
// Reads the SAME localStorage key the landing uses ("kovra_lang"), so the
// language chosen on the landing carries into the dashboard.
//
// Usage:
//   const { t, lang, setLang } = useDashLang();
//   <h1>{t.dash_title}</h1>
//   t.plan_first({ n: 6 })  // for parameterized strings

"use client";

import { useState, useEffect, useCallback } from "react";

export type DashLang = "en" | "ru" | "es" | "de" | "fr";
export const DASH_LANGS: { code: DashLang; native: string }[] = [
  { code: "en", native: "English" },
  { code: "ru", native: "Русский" },
  { code: "es", native: "Español" },
  { code: "de", native: "Deutsch" },
  { code: "fr", native: "Français" },
];

const STORAGE_KEY = "kovra_lang"; // shared with landing

type Str = string;
interface Dict {
  // nav / chrome
  dash_title: Str;
  help_title: Str;
  logout: Str;
  // overview cards
  devices: Str;
  active_devices: Str;
  status: Str;
  status_active: Str;
  status_none: Str;
  expires: Str;
  days_left: Str; // "{n} days left" via fn below is separate
  no_plan: Str;
  // plans / purchase
  choose_plan: Str;
  plan_1dev: Str;
  plan_3dev: Str;
  per_mo: Str;
  term_1: Str;
  term_6: Str;
  term_12: Str;
  best_value: Str;
  pay_crypto: Str;
  total_now: Str;
  renews_note: Str;
  // active subs list
  your_subs: Str;
  sub_plan1: Str;
  sub_plan3: Str;
  sub_device: Str;
  sub_referral: Str;
  active_until: Str;
  // add device
  add_device: Str;
  add_device_note: Str;
  buy_device: Str;
  // devices / profiles
  your_devices: Str;
  device_link_note: Str;
  add_to_app: Str;
  delete: Str;
  connect: Str;
  add_one: Str;
  pick_device: Str;
  cancel: Str;
  hide: Str;
  download_app_for: Str;
  copy_vless_note: Str;
  need_slot: Str;
  need_slot_note: Str;
  max_devices: Str;
  creating: Str;
  // promo
  promo_title: Str;
  promo_ph: Str;
  promo_ok: Str;
  promo_applied: Str; // fn
  // downloads
  downloads_all: Str;
  downloads_site: Str;
  windows: Str;
  android: Str;
  android_tv: Str;
  ios_mac: Str;
  // referral
  ref_title: Str;
  ref_note: Str;
  ref_click_copy: Str;
  ref_copied: Str;
  ref_invited: Str;
  ref_paid: Str;
  ref_days_earned: Str;
  // help
  guide: Str;
  guide_note: Str;
  open: Str;
  support: Str;
  support_note: Str;
  write: Str;
  // errors / misc
  err_conn: Str;
  err_pay: Str;
  confirm_delete: Str;
  pending_crypto: Str;
  // link accounts
  link_title: Str;
  link_tg_id: Str;
  link_tg_btn: Str;
  link_tg_linked: Str;
  link_tg_open: Str;
  link_email_btn: Str;
  link_email_linked: Str;
  link_unlink_confirm_email: Str;
  link_unlink_confirm_tg: Str;
  link_copy_hint: Str;
  link_copied: Str;
  link_waiting: Str;
  link_pwd_ph: Str;
  link_confirm: Str;
  link_resend: Str;
  link_resend_in: Str;
  link_back: Str;
  link_code_sent: Str;
  err_generic: Str;
}

const en: Dict = {
  dash_title: "Dashboard",
  help_title: "Help",
  logout: "Log out",
  devices: "Devices",
  active_devices: "Active devices",
  status: "Status",
  status_active: "Active",
  status_none: "None",
  expires: "Expires",
  days_left: "days left",
  no_plan: "No active plan",
  choose_plan: "Choose your plan",
  plan_1dev: "1 device",
  plan_3dev: "3 devices",
  per_mo: "/mo",
  term_1: "1 month",
  term_6: "6 months",
  term_12: "12 months",
  best_value: "Best value",
  pay_crypto: "Pay with crypto",
  total_now: "Total now",
  renews_note: "One-time payment. No auto-renewal.",
  your_subs: "Active subscriptions",
  sub_plan1: "Plan · 1 device",
  sub_plan3: "Plan · 3 devices",
  sub_device: "Extra device",
  sub_referral: "Referral reward",
  active_until: "until",
  add_device: "Add a device",
  add_device_note: "+1 device for 30 days. Independent of your plan.",
  buy_device: "Add device · $5",
  your_devices: "Your devices",
  device_link_note: "Subscription link for this device. Add it to Happ or V2RayTun.",
  add_to_app: "Add to app",
  delete: "Delete",
  connect: "Connect",
  add_one: "Add device",
  pick_device: "Pick a device",
  cancel: "Cancel",
  hide: "Hide",
  download_app_for: "Download the app for",
  copy_vless_note: "Copy the VLESS link and paste it into the app",
  need_slot: "No free device slot",
  need_slot_note: "Buy a plan or add a device to connect.",
  max_devices: "Maximum 100 devices",
  creating: "Creating...",
  promo_title: "Promo code",
  promo_ph: "Enter promo code",
  promo_ok: "OK",
  promo_applied: "Applied",
  downloads_all: "All",
  downloads_site: "Site",
  windows: "Windows",
  android: "Android",
  android_tv: "Android / TV",
  ios_mac: "iOS / macOS",
  ref_title: "Invite a friend",
  ref_note: "+14 days for 1 device for every friend who buys a plan.",
  ref_click_copy: "Click to copy",
  ref_copied: "✓ Copied!",
  ref_invited: "Invited",
  ref_paid: "Paid",
  ref_days_earned: "days earned",
  guide: "Guide",
  guide_note: "Step-by-step setup",
  open: "Open",
  support: "Support",
  support_note: "Telegram",
  write: "Message",
  err_conn: "Connection error",
  err_pay: "Payment error",
  confirm_delete: "Delete this device? The link will stop working.",
  pending_crypto: "Payment created. Your plan activates automatically after network confirmation (5-30 min).",
  link_title: "Linked accounts",
  link_tg_id: "Telegram ID",
  link_tg_btn: "Link Telegram",
  link_tg_linked: "Telegram linked!",
  link_tg_open: "Open the bot",
  link_email_btn: "Link Email",
  link_email_linked: "Email linked!",
  link_unlink_confirm_email: "Unlink Email?",
  link_unlink_confirm_tg: "Unlink Telegram?",
  link_copy_hint: "Tap to copy",
  link_copied: "✓ Copied!",
  link_waiting: "Waiting...",
  link_pwd_ph: "Password (min. 8)",
  link_confirm: "Confirm",
  link_resend: "Resend",
  link_resend_in: "Resend in",
  link_back: "← Back",
  link_code_sent: "Code sent to",
  err_generic: "Error",
};

const ru: Dict = {
  dash_title: "Панель",
  help_title: "Помощь",
  logout: "Выйти",
  devices: "Устройства",
  active_devices: "Активные устройства",
  status: "Статус",
  status_active: "Активна",
  status_none: "Нет",
  expires: "Истекает",
  days_left: "дн. осталось",
  no_plan: "Нет активной подписки",
  choose_plan: "Выберите тариф",
  plan_1dev: "1 устройство",
  plan_3dev: "3 устройства",
  per_mo: "/мес",
  term_1: "1 месяц",
  term_6: "6 месяцев",
  term_12: "12 месяцев",
  best_value: "Выгодно",
  pay_crypto: "Оплатить криптой",
  total_now: "К оплате",
  renews_note: "Разовый платёж. Без автопродления.",
  your_subs: "Активные подписки",
  sub_plan1: "Тариф · 1 устройство",
  sub_plan3: "Тариф · 3 устройства",
  sub_device: "Доп. устройство",
  sub_referral: "Реферальный бонус",
  active_until: "до",
  add_device: "Добавить устройство",
  add_device_note: "+1 устройство на 30 дней. Независимо от тарифа.",
  buy_device: "Добавить устройство · $5",
  your_devices: "Ваши устройства",
  device_link_note: "Ссылка подписки для этого устройства. Добавьте её в Happ или V2RayTun.",
  add_to_app: "Добавить в приложение",
  delete: "Удалить",
  connect: "Подключить",
  add_one: "Добавить устройство",
  pick_device: "Выберите устройство",
  cancel: "Отмена",
  hide: "Скрыть",
  download_app_for: "Скачайте приложение для",
  copy_vless_note: "Скопируйте VLESS-ссылку и вставьте в приложение",
  need_slot: "Нет свободного слота",
  need_slot_note: "Купите тариф или добавьте устройство, чтобы подключиться.",
  max_devices: "Максимум 100 устройств",
  creating: "Создаём...",
  promo_title: "Промокод",
  promo_ph: "Введите промокод",
  promo_ok: "OK",
  promo_applied: "Применён",
  downloads_all: "Все",
  downloads_site: "Сайт",
  windows: "Windows",
  android: "Android",
  android_tv: "Android / TV",
  ios_mac: "iOS / macOS",
  ref_title: "Пригласить друга",
  ref_note: "+14 дней на 1 устройство за каждого друга, купившего тариф.",
  ref_click_copy: "Нажмите чтобы скопировать",
  ref_copied: "✓ Скопировано!",
  ref_invited: "Приглашено",
  ref_paid: "Оплатили",
  ref_days_earned: "дней получено",
  guide: "Инструкция",
  guide_note: "Пошаговая настройка",
  open: "Открыть",
  support: "Поддержка",
  support_note: "Telegram",
  write: "Написать",
  err_conn: "Ошибка соединения",
  err_pay: "Ошибка оплаты",
  confirm_delete: "Удалить устройство? Ссылка перестанет работать.",
  pending_crypto: "Платёж создан. Тариф активируется автоматически после подтверждения сети (5-30 мин).",
  link_title: "Привязки",
  link_tg_id: "Telegram ID",
  link_tg_btn: "Привязать Telegram",
  link_tg_linked: "Telegram привязан!",
  link_tg_open: "Открыть бота",
  link_email_btn: "Привязать Email",
  link_email_linked: "Email привязан!",
  link_unlink_confirm_email: "Отвязать Email?",
  link_unlink_confirm_tg: "Отвязать Telegram?",
  link_copy_hint: "Нажмите чтобы скопировать",
  link_copied: "✓ Скопировано!",
  link_waiting: "Ожидаем...",
  link_pwd_ph: "Пароль (мин. 8)",
  link_confirm: "Подтвердить",
  link_resend: "Отправить снова",
  link_resend_in: "Повторно через",
  link_back: "← Назад",
  link_code_sent: "Код отправлен на",
  err_generic: "Ошибка",
};

const es: Dict = {
  dash_title: "Panel",
  help_title: "Ayuda",
  logout: "Salir",
  devices: "Dispositivos",
  active_devices: "Dispositivos activos",
  status: "Estado",
  status_active: "Activo",
  status_none: "Ninguno",
  expires: "Vence",
  days_left: "días restantes",
  no_plan: "Sin plan activo",
  choose_plan: "Elige tu plan",
  plan_1dev: "1 dispositivo",
  plan_3dev: "3 dispositivos",
  per_mo: "/mes",
  term_1: "1 mes",
  term_6: "6 meses",
  term_12: "12 meses",
  best_value: "Mejor precio",
  pay_crypto: "Pagar con cripto",
  total_now: "Total ahora",
  renews_note: "Pago único. Sin renovación automática.",
  your_subs: "Suscripciones activas",
  sub_plan1: "Plan · 1 dispositivo",
  sub_plan3: "Plan · 3 dispositivos",
  sub_device: "Dispositivo extra",
  sub_referral: "Recompensa de referido",
  active_until: "hasta",
  add_device: "Añadir dispositivo",
  add_device_note: "+1 dispositivo por 30 días. Independiente de tu plan.",
  buy_device: "Añadir dispositivo · $5",
  your_devices: "Tus dispositivos",
  device_link_note: "Enlace de suscripción para este dispositivo. Añádelo a Happ o V2RayTun.",
  add_to_app: "Añadir a la app",
  delete: "Eliminar",
  connect: "Conectar",
  add_one: "Añadir dispositivo",
  pick_device: "Elige un dispositivo",
  cancel: "Cancelar",
  hide: "Ocultar",
  download_app_for: "Descarga la app para",
  copy_vless_note: "Copia el enlace VLESS y pégalo en la app",
  need_slot: "Sin espacio de dispositivo",
  need_slot_note: "Compra un plan o añade un dispositivo para conectar.",
  max_devices: "Máximo 100 dispositivos",
  creating: "Creando...",
  promo_title: "Código promocional",
  promo_ph: "Introduce el código",
  promo_ok: "OK",
  promo_applied: "Aplicado",
  downloads_all: "Todos",
  downloads_site: "Sitio",
  windows: "Windows",
  android: "Android",
  android_tv: "Android / TV",
  ios_mac: "iOS / macOS",
  ref_title: "Invita a un amigo",
  ref_note: "+14 días para 1 dispositivo por cada amigo que compre un plan.",
  ref_click_copy: "Haz clic para copiar",
  ref_copied: "✓ ¡Copiado!",
  ref_invited: "Invitados",
  ref_paid: "Pagaron",
  ref_days_earned: "días ganados",
  guide: "Guía",
  guide_note: "Configuración paso a paso",
  open: "Abrir",
  support: "Soporte",
  support_note: "Telegram",
  write: "Escribir",
  err_conn: "Error de conexión",
  err_pay: "Error de pago",
  confirm_delete: "¿Eliminar este dispositivo? El enlace dejará de funcionar.",
  pending_crypto: "Pago creado. Tu plan se activa automáticamente tras la confirmación de la red (5-30 min).",
  link_title: "Cuentas vinculadas",
  link_tg_id: "ID de Telegram",
  link_tg_btn: "Vincular Telegram",
  link_tg_linked: "¡Telegram vinculado!",
  link_tg_open: "Abrir el bot",
  link_email_btn: "Vincular correo",
  link_email_linked: "¡Correo vinculado!",
  link_unlink_confirm_email: "¿Desvincular correo?",
  link_unlink_confirm_tg: "¿Desvincular Telegram?",
  link_copy_hint: "Toca para copiar",
  link_copied: "✓ ¡Copiado!",
  link_waiting: "Esperando...",
  link_pwd_ph: "Contraseña (mín. 8)",
  link_confirm: "Confirmar",
  link_resend: "Reenviar",
  link_resend_in: "Reenviar en",
  link_back: "← Atrás",
  link_code_sent: "Código enviado a",
  err_generic: "Error",
};

const de: Dict = {
  dash_title: "Übersicht",
  help_title: "Hilfe",
  logout: "Abmelden",
  devices: "Geräte",
  active_devices: "Aktive Geräte",
  status: "Status",
  status_active: "Aktiv",
  status_none: "Keiner",
  expires: "Läuft ab",
  days_left: "Tage übrig",
  no_plan: "Kein aktiver Tarif",
  choose_plan: "Tarif wählen",
  plan_1dev: "1 Gerät",
  plan_3dev: "3 Geräte",
  per_mo: "/Mon.",
  term_1: "1 Monat",
  term_6: "6 Monate",
  term_12: "12 Monate",
  best_value: "Bester Preis",
  pay_crypto: "Mit Krypto zahlen",
  total_now: "Jetzt fällig",
  renews_note: "Einmalige Zahlung. Keine automatische Verlängerung.",
  your_subs: "Aktive Abos",
  sub_plan1: "Tarif · 1 Gerät",
  sub_plan3: "Tarif · 3 Geräte",
  sub_device: "Zusatzgerät",
  sub_referral: "Empfehlungsbonus",
  active_until: "bis",
  add_device: "Gerät hinzufügen",
  add_device_note: "+1 Gerät für 30 Tage. Unabhängig vom Tarif.",
  buy_device: "Gerät hinzufügen · $5",
  your_devices: "Deine Geräte",
  device_link_note: "Abo-Link für dieses Gerät. Füge ihn zu Happ oder V2RayTun hinzu.",
  add_to_app: "Zur App hinzufügen",
  delete: "Löschen",
  connect: "Verbinden",
  add_one: "Gerät hinzufügen",
  pick_device: "Gerät auswählen",
  cancel: "Abbrechen",
  hide: "Ausblenden",
  download_app_for: "Lade die App für",
  copy_vless_note: "Kopiere den VLESS-Link und füge ihn in die App ein",
  need_slot: "Kein freier Geräteplatz",
  need_slot_note: "Kaufe einen Tarif oder füge ein Gerät hinzu.",
  max_devices: "Maximal 100 Geräte",
  creating: "Wird erstellt...",
  promo_title: "Promo-Code",
  promo_ph: "Code eingeben",
  promo_ok: "OK",
  promo_applied: "Angewendet",
  downloads_all: "Alle",
  downloads_site: "Webseite",
  windows: "Windows",
  android: "Android",
  android_tv: "Android / TV",
  ios_mac: "iOS / macOS",
  ref_title: "Freund einladen",
  ref_note: "+14 Tage für 1 Gerät für jeden Freund, der einen Tarif kauft.",
  ref_click_copy: "Zum Kopieren klicken",
  ref_copied: "✓ Kopiert!",
  ref_invited: "Eingeladen",
  ref_paid: "Bezahlt",
  ref_days_earned: "Tage erhalten",
  guide: "Anleitung",
  guide_note: "Schritt-für-Schritt-Einrichtung",
  open: "Öffnen",
  support: "Support",
  support_note: "Telegram",
  write: "Schreiben",
  err_conn: "Verbindungsfehler",
  err_pay: "Zahlungsfehler",
  confirm_delete: "Dieses Gerät löschen? Der Link funktioniert nicht mehr.",
  pending_crypto: "Zahlung erstellt. Dein Tarif wird nach Netzwerkbestätigung automatisch aktiviert (5-30 Min).",
  link_title: "Verknüpfte Konten",
  link_tg_id: "Telegram-ID",
  link_tg_btn: "Telegram verknüpfen",
  link_tg_linked: "Telegram verknüpft!",
  link_tg_open: "Bot öffnen",
  link_email_btn: "E-Mail verknüpfen",
  link_email_linked: "E-Mail verknüpft!",
  link_unlink_confirm_email: "E-Mail trennen?",
  link_unlink_confirm_tg: "Telegram trennen?",
  link_copy_hint: "Zum Kopieren tippen",
  link_copied: "✓ Kopiert!",
  link_waiting: "Warte...",
  link_pwd_ph: "Passwort (min. 8)",
  link_confirm: "Bestätigen",
  link_resend: "Erneut senden",
  link_resend_in: "Erneut senden in",
  link_back: "← Zurück",
  link_code_sent: "Code gesendet an",
  err_generic: "Fehler",
};

const fr: Dict = {
  dash_title: "Tableau de bord",
  help_title: "Aide",
  logout: "Déconnexion",
  devices: "Appareils",
  active_devices: "Appareils actifs",
  status: "Statut",
  status_active: "Actif",
  status_none: "Aucun",
  expires: "Expire",
  days_left: "jours restants",
  no_plan: "Aucun forfait actif",
  choose_plan: "Choisissez votre forfait",
  plan_1dev: "1 appareil",
  plan_3dev: "3 appareils",
  per_mo: "/mois",
  term_1: "1 mois",
  term_6: "6 mois",
  term_12: "12 mois",
  best_value: "Meilleur prix",
  pay_crypto: "Payer en crypto",
  total_now: "Total maintenant",
  renews_note: "Paiement unique. Pas de renouvellement automatique.",
  your_subs: "Abonnements actifs",
  sub_plan1: "Forfait · 1 appareil",
  sub_plan3: "Forfait · 3 appareils",
  sub_device: "Appareil supplémentaire",
  sub_referral: "Récompense de parrainage",
  active_until: "jusqu'au",
  add_device: "Ajouter un appareil",
  add_device_note: "+1 appareil pour 30 jours. Indépendant de votre forfait.",
  buy_device: "Ajouter un appareil · $5",
  your_devices: "Vos appareils",
  device_link_note: "Lien d'abonnement pour cet appareil. Ajoutez-le à Happ ou V2RayTun.",
  add_to_app: "Ajouter à l'app",
  delete: "Supprimer",
  connect: "Connecter",
  add_one: "Ajouter un appareil",
  pick_device: "Choisissez un appareil",
  cancel: "Annuler",
  hide: "Masquer",
  download_app_for: "Téléchargez l'app pour",
  copy_vless_note: "Copiez le lien VLESS et collez-le dans l'app",
  need_slot: "Aucun emplacement libre",
  need_slot_note: "Achetez un forfait ou ajoutez un appareil pour vous connecter.",
  max_devices: "Maximum 100 appareils",
  creating: "Création...",
  promo_title: "Code promo",
  promo_ph: "Entrez le code promo",
  promo_ok: "OK",
  promo_applied: "Appliqué",
  downloads_all: "Tout",
  downloads_site: "Site",
  windows: "Windows",
  android: "Android",
  android_tv: "Android / TV",
  ios_mac: "iOS / macOS",
  ref_title: "Inviter un ami",
  ref_note: "+14 jours pour 1 appareil pour chaque ami qui achète un forfait.",
  ref_click_copy: "Cliquez pour copier",
  ref_copied: "✓ Copié !",
  ref_invited: "Invités",
  ref_paid: "Ont payé",
  ref_days_earned: "jours gagnés",
  guide: "Guide",
  guide_note: "Configuration étape par étape",
  open: "Ouvrir",
  support: "Support",
  support_note: "Telegram",
  write: "Écrire",
  err_conn: "Erreur de connexion",
  err_pay: "Erreur de paiement",
  confirm_delete: "Supprimer cet appareil ? Le lien cessera de fonctionner.",
  pending_crypto: "Paiement créé. Votre forfait s'active automatiquement après confirmation du réseau (5-30 min).",
  link_title: "Comptes liés",
  link_tg_id: "ID Telegram",
  link_tg_btn: "Lier Telegram",
  link_tg_linked: "Telegram lié !",
  link_tg_open: "Ouvrir le bot",
  link_email_btn: "Lier l'e-mail",
  link_email_linked: "E-mail lié !",
  link_unlink_confirm_email: "Dissocier l'e-mail ?",
  link_unlink_confirm_tg: "Dissocier Telegram ?",
  link_copy_hint: "Touchez pour copier",
  link_copied: "✓ Copié !",
  link_waiting: "En attente...",
  link_pwd_ph: "Mot de passe (min. 8)",
  link_confirm: "Confirmer",
  link_resend: "Renvoyer",
  link_resend_in: "Renvoyer dans",
  link_back: "← Retour",
  link_code_sent: "Code envoyé à",
  err_generic: "Erreur",
};

export const DASH_DICT: Record<DashLang, Dict> = { en, ru, es, de, fr };

function detect(): DashLang {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && ["en", "ru", "es", "de", "fr"].includes(saved)) {
      return saved as DashLang;
    }
  } catch {
    /* ignore */
  }
  return "en";
}

export function useDashLang() {
  // SSR-safe: default "en" to match server; sync from storage on mount.
  const [lang, setLangState] = useState<DashLang>("en");

  useEffect(() => {
    setLangState(detect());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const v = e.newValue as DashLang;
        if (["en", "ru", "es", "de", "fr"].includes(v)) setLangState(v);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setLang = useCallback((l: DashLang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  return { lang, setLang, t: DASH_DICT[lang] };
}

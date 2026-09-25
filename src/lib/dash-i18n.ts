// src/lib/dash-i18n.ts
//
// Dashboard strings in the five cabinet languages, typed so a missing key is
// a compile error. Language state comes from the cabinet runtime
// (useCabinetLang / setCabinetLang), so the dashboard, the auth pages and the
// header switchers always agree.
//
// Rules (tests/i18n-dash-dict.test.mjs enforces the first three):
// - no Cyrillic in the en / es / de / fr blocks;
// - no emoji and no check / arrow glyphs in any value (icons live in JSX);
// - no "V2RayTun" anywhere;
// - placeholders are {name} tokens filled by fmt(); plurals use Plural;
// - tone: es "tú", de "du", fr "vous", ru «вы» in lower case;
// - product names are never translated (Kovra, Happ, INCY, Telegram, PayPal…).
//
// Usage:
//   const { t, lang, setLang } = useDashLang();
//   fmt(t.pay_cta, { amount: "$79.08" });  plural(lang, 3, t.slots_free);

"use client";

import { useCallback } from "react";
import type { Lang } from "@/i18n/dict";
import { setCabinetLang, useCabinetLang, type Plural } from "@/lib/cabinet-lang";

export type DashLang = Lang;

type Str = string;

export interface DashDict {
  // ── chrome and navigation ──
  dash_title: Str;
  page_title: Str;
  help_title: Str;
  logout: Str;
  nav_label: Str;
  nav_devices: Str;
  nav_plan: Str;
  nav_rewards: Str;
  nav_account: Str;
  account_menu: Str;
  account_settings: Str;
  help_support: Str;
  sign_out: Str;
  // ── overview (legacy labels) ──
  devices: Str;
  active_devices: Str;
  status: Str;
  status_active: Str;
  status_none: Str;
  expires: Str;
  no_plan: Str;
  // ── hero ──
  hero_title_active: Str;
  hero_title_expiring: Plural;
  hero_title_expired: Str;
  hero_title_none: Str;
  hero_none_body: Str;
  active_until_date: Str;
  expired_on: Str;
  days_left_unit: Plural;
  slots_label: Str;
  slots_plan: Plural;
  slots_used_sr: Str;
  renew: Str;
  choose_plan_cta: Str;
  // ── plans and checkout ──
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
  billing_kicker: Str;
  plan_title: Str;
  plan_title_new: Str;
  plan_title_renew: Str;
  current_plan: Str;
  current_until: Str;
  renew_note: Str;
  plan_kind_label: Str;
  term_label: Str;
  per_month: Str;
  billed_once: Str;
  discount: Str;
  summary_kicker: Str;
  summary_line: Str;
  was_price: Str;
  pay_with: Str;
  more_ways: Str;
  fewer_ways: Str;
  pay_cta: Str;
  renew_cta: Str;
  redirecting: Str;
  // ── payment methods ──
  m_card: Str;
  m_card_sub: Str;
  m_card_note: Str;
  m_card_rub: Str;
  m_card_rub_sub: Str;
  m_card_rub_note: Str;
  m_crypto: Str;
  m_crypto_sub: Str;
  m_crypto_note: Str;
  m_lava_card: Str;
  m_lava_card_sub: Str;
  m_paypal: Str;
  m_applepay: Str;
  m_sepa: Str;
  m_ideal: Str;
  m_mbway: Str;
  m_pix: Str;
  m_lava_sub: Str;
  m_lava_note: Str;
  m_lava_ru_hint: Str;
  // ── subscriptions ──
  your_subs: Str;
  subs_title: Str;
  sub_plan1: Str;
  sub_plan3: Str;
  sub_device: Str;
  sub_referral: Str;
  active_until: Str;
  until: Str;
  // ── extra device slot ──
  add_device: Str;
  add_device_note: Str;
  buy_device: Str;
  slot_title: Str;
  slot_body: Str;
  slot_price: Str;
  slot_days: Str;
  slot_buy: Str;
  slot_dialog_title: Str;
  slot_cta: Str;
  // ── devices ──
  your_devices: Str;
  devices_title: Str;
  device_link_note: Str;
  reset_hwid: Str;
  reset_hwid_note: Str;
  reset_hwid_done: Str;
  reset_hwid_confirm: Str;
  reset_title: Str;
  reset_confirm: Str;
  add_to_app: Str;
  delete: Str;
  delete_device: Str;
  delete_title: Str;
  delete_body: Str;
  confirm_delete: Str;
  connect: Str;
  add_one: Str;
  pick_device: Str;
  picker_title: Str;
  this_device: Str;
  cancel: Str;
  hide: Str;
  download_app_for: Str;
  need_slot: Str;
  need_slot_note: Str;
  no_slot_title: Str;
  no_slot_body: Str;
  buy_slot: Str;
  no_plan_devices: Str;
  max_devices: Str;
  creating: Str;
  setup_device: Str;
  setup_first: Str;
  slots_free: Plural;
  added_on: Str;
  sub_link: Str;
  open_in_happ: Str;
  more_actions: Str;
  dev_android: Str;
  dev_iphone: Str;
  dev_mac: Str;
  dev_windows: Str;
  dev_tv: Str;
  dev_fallback: Str;
  // ── QR and TV scanner ──
  show_qr: Str;
  hide_qr: Str;
  scan_tv: Str;
  close_scanner: Str;
  qr_caption: Str;
  qr_label: Str;
  scan_hint: Str;
  scan_result: Str;
  scan_again: Str;
  scan_error: Str;
  // ── setup steps ──
  setup_title: Str;
  step1_t: Str;
  step1_b: Str;
  step_incy: Str;
  get_happ: Str;
  step2_t: Str;
  step2_b: Str;
  step3_t: Str;
  step3_b: Str;
  done: Str;
  // ── apps ──
  apps_title: Str;
  apps_recommended: Str;
  apps_also: Str;
  happ_desc: Str;
  incy_desc: Str;
  dl_apple: Str;
  dl_android_tv: Str;
  dl_windows: Str;
  dl_incy_other: Str;
  dl_all: Str;
  downloads_all: Str;
  downloads_site: Str;
  windows: Str;
  android: Str;
  android_tv: Str;
  ios_mac: Str;
  // ── payment return ──
  paid_pending: Str;
  paid_done: Str;
  // ── promo ──
  promo_title: Str;
  promo_label: Str;
  promo_ph: Str;
  promo_apply: Str;
  promo_applied: Str;
  // ── rewards ──
  rewards_kicker: Str;
  rewards_title: Str;
  ref_title: Str;
  ref_note: Str;
  ref_body: Str;
  ref_link_label: Str;
  ref_click_copy: Str;
  ref_copied: Str;
  ref_invited: Str;
  ref_paid: Str;
  ref_days_earned: Str;
  share: Str;
  share_text: Str;
  // ── account ──
  settings_kicker: Str;
  account_title: Str;
  signed_in_as: Str;
  tg_id: Str;
  prefs_title: Str;
  linked: Str;
  loading_account: Str;
  load_failed: Str;
  // ── help ──
  guide: Str;
  guide_note: Str;
  open: Str;
  support: Str;
  support_note: Str;
  write: Str;
  // ── errors ──
  err_conn: Str;
  err_pay: Str;
  err_generic: Str;
  err_no_slot: Str;
  err_device_gone: Str;
  err_reset_failed: Str;
  // ── linked accounts ──
  link_title: Str;
  link_tg_id: Str;
  link_tg_btn: Str;
  link_tg_linked: Str;
  link_tg_open: Str;
  link_tg_intro: Str;
  link_email_btn: Str;
  link_email_linked: Str;
  link_email_intro: Str;
  link_unlink: Str;
  link_unlink_body: Str;
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
}

/** @deprecated alias kept for older imports; use DashDict. */
export type Dict = DashDict;

const en: DashDict = {
  dash_title: "Dashboard",
  page_title: "Dashboard",
  help_title: "Help",
  logout: "Log out",
  nav_label: "Dashboard sections",
  nav_devices: "Devices",
  nav_plan: "Plan",
  nav_rewards: "Rewards",
  nav_account: "Account",
  account_menu: "Account menu",
  account_settings: "Account settings",
  help_support: "Help & support",
  sign_out: "Sign out",

  devices: "Devices",
  active_devices: "Active devices",
  status: "Status",
  status_active: "Active",
  status_none: "None",
  expires: "Expires",
  no_plan: "No active plan",

  hero_title_active: "Your plan is active",
  hero_title_expiring: { one: "Your plan ends in {n} day", other: "Your plan ends in {n} days" },
  hero_title_expired: "Your plan has expired",
  hero_title_none: "Choose a plan to get started",
  hero_none_body: "Pick a plan, then set up your devices in a couple of minutes.",
  active_until_date: "Active until {date}",
  expired_on: "Expired on {date}",
  days_left_unit: { one: "day left", other: "days left" },
  slots_label: "Devices",
  slots_plan: { one: "{n} device", other: "{n} devices" },
  slots_used_sr: "{used} of {total} devices in use",
  renew: "Renew plan",
  choose_plan_cta: "Choose a plan",

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
  billing_kicker: "Billing",
  plan_title: "Plan & billing",
  plan_title_new: "Choose your plan",
  plan_title_renew: "Renew your plan",
  current_plan: "Current plan",
  current_until: "Active until {date}",
  renew_note: "Renewing adds time to your current plan. Need another device? Buy an extra slot below.",
  plan_kind_label: "Devices",
  term_label: "Billing period",
  per_month: "{price}/mo",
  billed_once: "{total} billed once",
  discount: "−{n}%",
  summary_kicker: "Total",
  summary_line: "{per}/mo · {term}",
  was_price: "Regular price {price}",
  pay_with: "Pay with",
  more_ways: "More ways to pay ({n})",
  fewer_ways: "Fewer options",
  pay_cta: "Pay {amount}",
  renew_cta: "Renew for {amount}",
  redirecting: "Redirecting to payment…",

  m_card: "Card",
  m_card_sub: "Visa or Mastercard · charged in EUR",
  m_card_note: "Charged in EUR at today’s rate. Your statement shows “skillstep”.",
  m_card_rub: "Card in rubles",
  m_card_rub_sub: "Mastercard · charged in RUB at the processor’s rate",
  m_card_rub_note: "Charged in RUB at the processor’s rate. Your bank may add a conversion fee.",
  m_crypto: "Crypto",
  m_crypto_sub: "USDT, BTC, ETH and more",
  m_crypto_note: "You’ll pick the coin on the next page. Your plan activates after network confirmation, usually 5–30 minutes.",
  m_lava_card: "Card · international",
  m_lava_card_sub: "Visa or Mastercard · charged in {currency}",
  m_paypal: "PayPal",
  m_applepay: "Apple Pay",
  m_sepa: "SEPA",
  m_ideal: "iDEAL",
  m_mbway: "MB WAY",
  m_pix: "Pix",
  m_lava_sub: "Charged {amount}",
  m_lava_note: "You’ll be charged exactly {amount}.",
  m_lava_ru_hint: "International methods: a Russian card won’t work here.",

  your_subs: "Active subscriptions",
  subs_title: "Your subscriptions",
  sub_plan1: "Plan · 1 device",
  sub_plan3: "Plan · 3 devices",
  sub_device: "Extra device",
  sub_referral: "Referral reward",
  active_until: "until",
  until: "until {date}",

  add_device: "Add a device",
  add_device_note: "+1 device for {days} days, on top of your plan.",
  buy_device: "Add device · {price}",
  slot_title: "Extra device slot",
  slot_body: "+1 device for {days} days, on top of your plan.",
  slot_price: "{price} · {days} days",
  slot_days: "for {days} days",
  slot_buy: "Buy a slot",
  slot_dialog_title: "Buy an extra device slot",
  slot_cta: "Pay {amount}",

  your_devices: "Your devices",
  devices_title: "Your devices",
  device_link_note: "Add this link to Happ (or INCY).",
  reset_hwid: "Reset device binding",
  reset_hwid_note: "One link works on one device. Reset it if you switched devices or see \"one device per link\".",
  reset_hwid_done: "Binding reset. Refresh the subscription on the device you want to use.",
  reset_hwid_confirm: "Reset device binding for this link?",
  reset_title: "Reset device binding?",
  reset_confirm: "Reset binding",
  add_to_app: "Add to app",
  delete: "Delete",
  delete_device: "Delete device",
  delete_title: "Delete {name}?",
  delete_body: "Its link stops working right away. This can’t be undone.",
  confirm_delete: "Delete this device? The link will stop working.",
  connect: "Connect",
  add_one: "Add device",
  pick_device: "Pick a device",
  picker_title: "Which device are you setting up?",
  this_device: "This device",
  cancel: "Cancel",
  hide: "Hide",
  download_app_for: "Download the app for",
  need_slot: "No free device slot",
  need_slot_note: "Buy a plan or add a device to connect.",
  no_slot_title: "All device slots are in use",
  no_slot_body: "Buy an extra slot or delete a device you no longer use.",
  buy_slot: "Buy an extra slot",
  no_plan_devices: "Devices appear here once you have a plan.",
  max_devices: "Maximum 100 devices",
  creating: "Setting up…",
  setup_device: "Set up a device",
  setup_first: "Set up your first device",
  slots_free: { one: "{n} slot free", other: "{n} slots free" },
  added_on: "Added {date}",
  sub_link: "Subscription link",
  open_in_happ: "Open in Happ",
  more_actions: "More actions for {name}",
  dev_android: "Android",
  dev_iphone: "iPhone",
  dev_mac: "Mac",
  dev_windows: "Windows",
  dev_tv: "TV",
  dev_fallback: "Device",

  show_qr: "QR code",
  hide_qr: "Hide QR code",
  scan_tv: "Scan TV code",
  close_scanner: "Close scanner",
  qr_caption: "Scan with Happ on your phone or TV.",
  qr_label: "QR code of the subscription link",
  scan_hint: "Point your camera at the QR code on your TV.",
  scan_result: "Scanned link",
  scan_again: "Scan again",
  scan_error: "Camera unavailable. Allow camera access and try again.",

  setup_title: "Set up {device}",
  step1_t: "Install Happ",
  step1_b: "Get the free Happ app for {device}.",
  step_incy: "Also works: INCY",
  get_happ: "Get Happ",
  step2_t: "Add your link",
  step2_b: "Tap Open in Happ, or copy your link and add it in the app.",
  step3_t: "Connect",
  step3_b: "Tap the connect button in Happ. That’s it.",
  done: "Done",

  apps_title: "Get the app",
  apps_recommended: "Recommended",
  apps_also: "Also works",
  happ_desc: "Our recommended app. Adds your link in one tap.",
  incy_desc: "An alternative app that works with the same link.",
  dl_apple: "iPhone & Mac",
  dl_android_tv: "Android & TV",
  dl_windows: "Windows",
  dl_incy_other: "Android, Windows, macOS & Linux",
  dl_all: "All downloads",
  downloads_all: "All",
  downloads_site: "Site",
  windows: "Windows",
  android: "Android",
  android_tv: "Android / TV",
  ios_mac: "iOS / macOS",

  paid_pending: "Thanks! We’re confirming your payment. Your plan updates automatically: usually within a minute for cards, up to 30 minutes for crypto.",
  paid_done: "Payment received. Your plan is updated.",

  promo_title: "Promo code",
  promo_label: "Promo code",
  promo_ph: "Enter promo code",
  promo_apply: "Apply",
  promo_applied: "Promo code applied.",

  rewards_kicker: "Rewards",
  rewards_title: "Invite friends",
  ref_title: "Referral program",
  ref_note: "+{days} days for 1 device for every friend who buys a plan.",
  ref_body: "Get +{days} days for 1 device for every friend who buys a plan.",
  ref_link_label: "Your invite link",
  ref_click_copy: "Click to copy",
  ref_copied: "Copied",
  ref_invited: "Invited",
  ref_paid: "Paid",
  ref_days_earned: "Days earned",
  share: "Share",
  share_text: "Private, fast VPN. Join me on Kovra:",

  settings_kicker: "Settings",
  account_title: "Account",
  signed_in_as: "Signed in as",
  tg_id: "Telegram ID {id}",
  prefs_title: "Preferences",
  linked: "Linked",
  loading_account: "Loading your account…",
  load_failed: "We couldn’t load your account.",

  guide: "Setup guides",
  guide_note: "Step-by-step setup for every platform.",
  open: "Open",
  support: "Support",
  support_note: "Chat with us on Telegram.",
  write: "Message",

  err_conn: "Connection problem. Check your internet and try again.",
  err_pay: "Couldn’t start the payment. Try again or pick another method.",
  err_generic: "Something went wrong. Please try again.",
  err_no_slot: "No free device slot. Buy a plan or an extra slot first.",
  err_device_gone: "This device no longer exists. Refresh the page.",
  err_reset_failed: "Couldn’t reset the binding. Try again.",

  link_title: "Linked accounts",
  link_tg_id: "Telegram ID",
  link_tg_btn: "Link Telegram",
  link_tg_linked: "Telegram linked.",
  link_tg_open: "Open the bot",
  link_tg_intro: "Link Telegram to sign in with one tap.",
  link_email_btn: "Link email",
  link_email_linked: "Email linked.",
  link_email_intro: "Add an email and password as a second way to sign in.",
  link_unlink: "Unlink",
  link_unlink_body: "You can link it again at any time.",
  link_unlink_confirm_email: "Unlink email?",
  link_unlink_confirm_tg: "Unlink Telegram?",
  link_copy_hint: "Tap to copy",
  link_copied: "Copied",
  link_waiting: "Waiting…",
  link_pwd_ph: "Password (min. 8)",
  link_confirm: "Confirm",
  link_resend: "Resend",
  link_resend_in: "Resend in",
  link_back: "Back",
  link_code_sent: "Code sent to",
};

const ru: DashDict = {
  dash_title: "Кабинет",
  page_title: "Кабинет",
  help_title: "Помощь",
  logout: "Выйти",
  nav_label: "Разделы кабинета",
  nav_devices: "Устройства",
  nav_plan: "Тариф",
  nav_rewards: "Бонусы",
  nav_account: "Аккаунт",
  account_menu: "Меню аккаунта",
  account_settings: "Настройки аккаунта",
  help_support: "Помощь и поддержка",
  sign_out: "Выйти",

  devices: "Устройства",
  active_devices: "Активные устройства",
  status: "Статус",
  status_active: "Активна",
  status_none: "Нет",
  expires: "Истекает",
  no_plan: "Нет активного тарифа",

  hero_title_active: "Тариф активен",
  hero_title_expiring: {
    one: "Тариф закончится через {n} день",
    few: "Тариф закончится через {n} дня",
    many: "Тариф закончится через {n} дней",
    other: "Тариф закончится через {n} дня",
  },
  hero_title_expired: "Срок тарифа истёк",
  hero_title_none: "Выберите тариф, чтобы начать",
  hero_none_body: "Выберите тариф, а потом за пару минут настройте устройства.",
  active_until_date: "Активен до {date}",
  expired_on: "Истёк {date}",
  days_left_unit: { one: "день остался", few: "дня осталось", many: "дней осталось", other: "дня осталось" },
  slots_label: "Устройства",
  slots_plan: { one: "{n} устройство", few: "{n} устройства", many: "{n} устройств", other: "{n} устройства" },
  slots_used_sr: "Занято {used} из {total} устройств",
  renew: "Продлить тариф",
  choose_plan_cta: "Выбрать тариф",

  choose_plan: "Выберите тариф",
  plan_1dev: "1 устройство",
  plan_3dev: "3 устройства",
  per_mo: "/мес",
  term_1: "1 месяц",
  term_6: "6 месяцев",
  term_12: "12 месяцев",
  best_value: "Выгоднее всего",
  pay_crypto: "Оплатить криптовалютой",
  total_now: "К оплате",
  renews_note: "Разовый платёж. Без автопродления.",
  billing_kicker: "Оплата",
  plan_title: "Тариф и оплата",
  plan_title_new: "Выберите тариф",
  plan_title_renew: "Продление тарифа",
  current_plan: "Текущий тариф",
  current_until: "Активен до {date}",
  renew_note: "Продление добавляет время к текущему тарифу. Нужно ещё одно устройство? Купите дополнительный слот ниже.",
  plan_kind_label: "Устройства",
  term_label: "Срок",
  per_month: "{price}/мес",
  billed_once: "{total} одним платежом",
  discount: "−{n}%",
  summary_kicker: "Итого",
  summary_line: "{per}/мес · {term}",
  was_price: "Обычная цена {price}",
  pay_with: "Способ оплаты",
  more_ways: "Другие способы ({n})",
  fewer_ways: "Скрыть",
  pay_cta: "Оплатить {amount}",
  renew_cta: "Продлить за {amount}",
  redirecting: "Переходим к оплате…",

  m_card: "Карта",
  m_card_sub: "Visa или Mastercard · списание в EUR",
  m_card_note: "Списание в EUR по курсу дня. В выписке будет «skillstep».",
  m_card_rub: "Карта в рублях",
  m_card_rub_sub: "Mastercard · списание в RUB по курсу процессинга",
  m_card_rub_note: "Списание в RUB по курсу процессинга. Банк может взять комиссию за конвертацию.",
  m_crypto: "Криптовалюта",
  m_crypto_sub: "USDT, BTC, ETH и другие",
  m_crypto_note: "Монету выберете на следующей странице. Тариф включится после подтверждения в сети, обычно за 5–30 минут.",
  m_lava_card: "Карта · зарубежная",
  m_lava_card_sub: "Visa или Mastercard · списание в {currency}",
  m_paypal: "PayPal",
  m_applepay: "Apple Pay",
  m_sepa: "SEPA",
  m_ideal: "iDEAL",
  m_mbway: "MB WAY",
  m_pix: "Pix",
  m_lava_sub: "Спишется {amount}",
  m_lava_note: "Спишется ровно {amount}.",
  m_lava_ru_hint: "Зарубежные способы: российская карта здесь не подойдёт.",

  your_subs: "Активные подписки",
  subs_title: "Ваши подписки",
  sub_plan1: "Тариф · 1 устройство",
  sub_plan3: "Тариф · 3 устройства",
  sub_device: "Доп. устройство",
  sub_referral: "Бонус за друга",
  active_until: "до",
  until: "до {date}",

  add_device: "Добавить устройство",
  add_device_note: "+1 устройство на {days} дней сверх тарифа.",
  buy_device: "Добавить устройство · {price}",
  slot_title: "Дополнительный слот",
  slot_body: "+1 устройство на {days} дней сверх тарифа.",
  slot_price: "{price} · {days} дней",
  slot_days: "на {days} дней",
  slot_buy: "Купить слот",
  slot_dialog_title: "Дополнительный слот для устройства",
  slot_cta: "Оплатить {amount}",

  your_devices: "Ваши устройства",
  devices_title: "Ваши устройства",
  device_link_note: "Добавьте эту ссылку в Happ (или INCY).",
  reset_hwid: "Сбросить привязку устройства",
  reset_hwid_note: "Одна ссылка работает на одном устройстве. Сбросьте привязку, если сменили устройство или видите «одно устройство на ссылку».",
  reset_hwid_done: "Привязка сброшена. Обновите подписку на нужном устройстве.",
  reset_hwid_confirm: "Сбросить привязку устройства для этой ссылки?",
  reset_title: "Сбросить привязку устройства?",
  reset_confirm: "Сбросить привязку",
  add_to_app: "Добавить в приложение",
  delete: "Удалить",
  delete_device: "Удалить устройство",
  delete_title: "Удалить {name}?",
  delete_body: "Ссылка сразу перестанет работать. Отменить это нельзя.",
  confirm_delete: "Удалить устройство? Ссылка перестанет работать.",
  connect: "Подключить",
  add_one: "Добавить устройство",
  pick_device: "Выберите устройство",
  picker_title: "Какое устройство настраиваете?",
  this_device: "Это устройство",
  cancel: "Отмена",
  hide: "Скрыть",
  download_app_for: "Скачайте приложение для",
  need_slot: "Нет свободного слота",
  need_slot_note: "Купите тариф или добавьте устройство, чтобы подключиться.",
  no_slot_title: "Все слоты заняты",
  no_slot_body: "Купите дополнительный слот или удалите устройство, которым больше не пользуетесь.",
  buy_slot: "Купить дополнительный слот",
  no_plan_devices: "Устройства появятся здесь, когда у вас будет тариф.",
  max_devices: "Максимум 100 устройств",
  creating: "Настраиваем…",
  setup_device: "Настроить устройство",
  setup_first: "Настроить первое устройство",
  slots_free: { one: "свободен {n} слот", few: "свободно {n} слота", many: "свободно {n} слотов", other: "свободно {n} слота" },
  added_on: "Добавлено {date}",
  sub_link: "Ссылка подписки",
  open_in_happ: "Открыть в Happ",
  more_actions: "Действия с устройством {name}",
  dev_android: "Android",
  dev_iphone: "iPhone",
  dev_mac: "Mac",
  dev_windows: "Windows",
  dev_tv: "ТВ",
  dev_fallback: "Устройство",

  show_qr: "QR-код",
  hide_qr: "Скрыть QR-код",
  scan_tv: "Сканер для ТВ",
  close_scanner: "Закрыть сканер",
  qr_caption: "Отсканируйте в Happ на телефоне или ТВ.",
  qr_label: "QR-код ссылки подписки",
  scan_hint: "Наведите камеру на QR-код на экране ТВ.",
  scan_result: "Отсканированная ссылка",
  scan_again: "Сканировать ещё",
  scan_error: "Камера недоступна. Разрешите доступ к камере и попробуйте снова.",

  setup_title: "Настройка: {device}",
  step1_t: "Установите Happ",
  step1_b: "Скачайте бесплатное приложение Happ для {device}.",
  step_incy: "Подойдёт и INCY",
  get_happ: "Скачать Happ",
  step2_t: "Добавьте ссылку",
  step2_b: "Нажмите «Открыть в Happ» или скопируйте ссылку и добавьте её в приложении.",
  step3_t: "Подключитесь",
  step3_b: "Нажмите кнопку подключения в Happ. Готово.",
  done: "Готово",

  apps_title: "Приложения",
  apps_recommended: "Рекомендуем",
  apps_also: "Тоже подойдёт",
  happ_desc: "Рекомендуемое приложение. Добавляет ссылку в одно касание.",
  incy_desc: "Альтернативное приложение, работает с той же ссылкой.",
  dl_apple: "iPhone и Mac",
  dl_android_tv: "Android и ТВ",
  dl_windows: "Windows",
  dl_incy_other: "Android, Windows, macOS и Linux",
  dl_all: "Все загрузки",
  downloads_all: "Все",
  downloads_site: "Сайт",
  windows: "Windows",
  android: "Android",
  android_tv: "Android / ТВ",
  ios_mac: "iOS / macOS",

  paid_pending: "Спасибо! Подтверждаем платёж. Тариф обновится сам: по карте обычно за минуту, по криптовалюте до 30 минут.",
  paid_done: "Платёж получен. Тариф обновлён.",

  promo_title: "Промокод",
  promo_label: "Промокод",
  promo_ph: "Введите промокод",
  promo_apply: "Применить",
  promo_applied: "Промокод применён.",

  rewards_kicker: "Бонусы",
  rewards_title: "Пригласите друзей",
  ref_title: "Реферальная программа",
  ref_note: "+{days} дней на 1 устройство за каждого друга, купившего тариф.",
  ref_body: "Получайте +{days} дней на 1 устройство за каждого друга, который купит тариф.",
  ref_link_label: "Ваша ссылка-приглашение",
  ref_click_copy: "Нажмите, чтобы скопировать",
  ref_copied: "Скопировано",
  ref_invited: "Приглашено",
  ref_paid: "Оплатили",
  ref_days_earned: "Дней получено",
  share: "Поделиться",
  share_text: "Быстрый приватный VPN. Присоединяйтесь к Kovra:",

  settings_kicker: "Настройки",
  account_title: "Аккаунт",
  signed_in_as: "Вы вошли как",
  tg_id: "Telegram ID {id}",
  prefs_title: "Предпочтения",
  linked: "Привязан",
  loading_account: "Загружаем аккаунт…",
  load_failed: "Не удалось загрузить аккаунт.",

  guide: "Инструкции",
  guide_note: "Пошаговая настройка для каждой платформы.",
  open: "Открыть",
  support: "Поддержка",
  support_note: "Напишите нам в Telegram.",
  write: "Написать",

  err_conn: "Проблема со связью. Проверьте интернет и попробуйте снова.",
  err_pay: "Не удалось начать оплату. Попробуйте снова или выберите другой способ.",
  err_generic: "Что-то пошло не так. Попробуйте ещё раз.",
  err_no_slot: "Нет свободного слота. Сначала купите тариф или дополнительный слот.",
  err_device_gone: "Этого устройства больше нет. Обновите страницу.",
  err_reset_failed: "Не удалось сбросить привязку. Попробуйте снова.",

  link_title: "Привязанные аккаунты",
  link_tg_id: "Telegram ID",
  link_tg_btn: "Привязать Telegram",
  link_tg_linked: "Telegram привязан.",
  link_tg_open: "Открыть бота",
  link_tg_intro: "Привяжите Telegram, чтобы входить в одно касание.",
  link_email_btn: "Привязать почту",
  link_email_linked: "Почта привязана.",
  link_email_intro: "Добавьте почту и пароль как второй способ входа.",
  link_unlink: "Отвязать",
  link_unlink_body: "Привязать снова можно в любой момент.",
  link_unlink_confirm_email: "Отвязать почту?",
  link_unlink_confirm_tg: "Отвязать Telegram?",
  link_copy_hint: "Нажмите, чтобы скопировать",
  link_copied: "Скопировано",
  link_waiting: "Ожидаем…",
  link_pwd_ph: "Пароль (мин. 8)",
  link_confirm: "Подтвердить",
  link_resend: "Отправить снова",
  link_resend_in: "Повторно через",
  link_back: "Назад",
  link_code_sent: "Код отправлен на",
};

const es: DashDict = {
  dash_title: "Panel",
  page_title: "Panel",
  help_title: "Ayuda",
  logout: "Salir",
  nav_label: "Secciones del panel",
  nav_devices: "Dispositivos",
  nav_plan: "Plan",
  nav_rewards: "Recompensas",
  nav_account: "Cuenta",
  account_menu: "Menú de la cuenta",
  account_settings: "Ajustes de la cuenta",
  help_support: "Ayuda y soporte",
  sign_out: "Cerrar sesión",

  devices: "Dispositivos",
  active_devices: "Dispositivos activos",
  status: "Estado",
  status_active: "Activo",
  status_none: "Ninguno",
  expires: "Vence",
  no_plan: "Sin plan activo",

  hero_title_active: "Tu plan está activo",
  hero_title_expiring: { one: "Tu plan termina en {n} día", other: "Tu plan termina en {n} días" },
  hero_title_expired: "Tu plan ha caducado",
  hero_title_none: "Elige un plan para empezar",
  hero_none_body: "Elige un plan y configura tus dispositivos en un par de minutos.",
  active_until_date: "Activo hasta el {date}",
  expired_on: "Caducó el {date}",
  days_left_unit: { one: "día restante", other: "días restantes" },
  slots_label: "Dispositivos",
  slots_plan: { one: "{n} dispositivo", other: "{n} dispositivos" },
  slots_used_sr: "{used} de {total} dispositivos en uso",
  renew: "Renovar plan",
  choose_plan_cta: "Elegir un plan",

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
  billing_kicker: "Facturación",
  plan_title: "Plan y pagos",
  plan_title_new: "Elige tu plan",
  plan_title_renew: "Renueva tu plan",
  current_plan: "Plan actual",
  current_until: "Activo hasta el {date}",
  renew_note: "Renovar añade tiempo a tu plan actual. ¿Necesitas otro dispositivo? Compra un espacio extra más abajo.",
  plan_kind_label: "Dispositivos",
  term_label: "Periodo de facturación",
  per_month: "{price}/mes",
  billed_once: "{total} en un solo pago",
  discount: "−{n}%",
  summary_kicker: "Total",
  summary_line: "{per}/mes · {term}",
  was_price: "Precio habitual {price}",
  pay_with: "Pagar con",
  more_ways: "Más formas de pago ({n})",
  fewer_ways: "Menos opciones",
  pay_cta: "Pagar {amount}",
  renew_cta: "Renovar por {amount}",
  redirecting: "Redirigiendo al pago…",

  m_card: "Tarjeta",
  m_card_sub: "Visa o Mastercard · cargo en EUR",
  m_card_note: "Cargo en EUR al cambio del día. En tu extracto aparecerá «skillstep».",
  m_card_rub: "Tarjeta en rublos",
  m_card_rub_sub: "Mastercard · cargo en RUB al cambio del procesador",
  m_card_rub_note: "Cargo en RUB al cambio del procesador. Tu banco puede añadir una comisión por conversión.",
  m_crypto: "Cripto",
  m_crypto_sub: "USDT, BTC, ETH y más",
  m_crypto_note: "Elegirás la moneda en la página siguiente. Tu plan se activa tras la confirmación de la red, normalmente en 5–30 minutos.",
  m_lava_card: "Tarjeta · internacional",
  m_lava_card_sub: "Visa o Mastercard · cargo en {currency}",
  m_paypal: "PayPal",
  m_applepay: "Apple Pay",
  m_sepa: "SEPA",
  m_ideal: "iDEAL",
  m_mbway: "MB WAY",
  m_pix: "Pix",
  m_lava_sub: "Se cobrará {amount}",
  m_lava_note: "Se te cobrará exactamente {amount}.",
  m_lava_ru_hint: "Métodos internacionales: una tarjeta rusa no funcionará aquí.",

  your_subs: "Suscripciones activas",
  subs_title: "Tus suscripciones",
  sub_plan1: "Plan · 1 dispositivo",
  sub_plan3: "Plan · 3 dispositivos",
  sub_device: "Dispositivo extra",
  sub_referral: "Recompensa por referido",
  active_until: "hasta",
  until: "hasta el {date}",

  add_device: "Añadir dispositivo",
  add_device_note: "+1 dispositivo durante {days} días, además de tu plan.",
  buy_device: "Añadir dispositivo · {price}",
  slot_title: "Espacio extra para un dispositivo",
  slot_body: "+1 dispositivo durante {days} días, además de tu plan.",
  slot_price: "{price} · {days} días",
  slot_days: "durante {days} días",
  slot_buy: "Comprar espacio",
  slot_dialog_title: "Comprar un espacio extra",
  slot_cta: "Pagar {amount}",

  your_devices: "Tus dispositivos",
  devices_title: "Tus dispositivos",
  device_link_note: "Añade este enlace a Happ (o INCY).",
  reset_hwid: "Restablecer vínculo del dispositivo",
  reset_hwid_note: "Un enlace funciona en un dispositivo. Restablécelo si cambiaste de dispositivo o ves «un dispositivo por enlace».",
  reset_hwid_done: "Vínculo restablecido. Actualiza la suscripción en el dispositivo que quieras usar.",
  reset_hwid_confirm: "¿Restablecer el vínculo del dispositivo para este enlace?",
  reset_title: "¿Restablecer el vínculo del dispositivo?",
  reset_confirm: "Restablecer vínculo",
  add_to_app: "Añadir a la app",
  delete: "Eliminar",
  delete_device: "Eliminar dispositivo",
  delete_title: "¿Eliminar {name}?",
  delete_body: "Su enlace deja de funcionar al instante. No se puede deshacer.",
  confirm_delete: "¿Eliminar este dispositivo? El enlace dejará de funcionar.",
  connect: "Conectar",
  add_one: "Añadir dispositivo",
  pick_device: "Elige un dispositivo",
  picker_title: "¿Qué dispositivo vas a configurar?",
  this_device: "Este dispositivo",
  cancel: "Cancelar",
  hide: "Ocultar",
  download_app_for: "Descarga la app para",
  need_slot: "Sin espacio libre",
  need_slot_note: "Compra un plan o añade un dispositivo para conectarte.",
  no_slot_title: "Todos los espacios están en uso",
  no_slot_body: "Compra un espacio extra o elimina un dispositivo que ya no uses.",
  buy_slot: "Comprar un espacio extra",
  no_plan_devices: "Tus dispositivos aparecerán aquí cuando tengas un plan.",
  max_devices: "Máximo 100 dispositivos",
  creating: "Configurando…",
  setup_device: "Configurar un dispositivo",
  setup_first: "Configura tu primer dispositivo",
  slots_free: { one: "{n} espacio libre", other: "{n} espacios libres" },
  added_on: "Añadido el {date}",
  sub_link: "Enlace de suscripción",
  open_in_happ: "Abrir en Happ",
  more_actions: "Más acciones para {name}",
  dev_android: "Android",
  dev_iphone: "iPhone",
  dev_mac: "Mac",
  dev_windows: "Windows",
  dev_tv: "TV",
  dev_fallback: "Dispositivo",

  show_qr: "Código QR",
  hide_qr: "Ocultar código QR",
  scan_tv: "Escanear código de TV",
  close_scanner: "Cerrar escáner",
  qr_caption: "Escanéalo con Happ en tu móvil o TV.",
  qr_label: "Código QR del enlace de suscripción",
  scan_hint: "Apunta la cámara al código QR de tu TV.",
  scan_result: "Enlace escaneado",
  scan_again: "Escanear de nuevo",
  scan_error: "Cámara no disponible. Permite el acceso a la cámara e inténtalo de nuevo.",

  setup_title: "Configurar {device}",
  step1_t: "Instala Happ",
  step1_b: "Descarga la app gratuita Happ para {device}.",
  step_incy: "También funciona: INCY",
  get_happ: "Descargar Happ",
  step2_t: "Añade tu enlace",
  step2_b: "Toca Abrir en Happ o copia tu enlace y añádelo en la app.",
  step3_t: "Conéctate",
  step3_b: "Toca el botón de conexión en Happ. Listo.",
  done: "Listo",

  apps_title: "Descarga la app",
  apps_recommended: "Recomendada",
  apps_also: "También funciona",
  happ_desc: "Nuestra app recomendada. Añade tu enlace con un toque.",
  incy_desc: "Una app alternativa que funciona con el mismo enlace.",
  dl_apple: "iPhone y Mac",
  dl_android_tv: "Android y TV",
  dl_windows: "Windows",
  dl_incy_other: "Android, Windows, macOS y Linux",
  dl_all: "Todas las descargas",
  downloads_all: "Todos",
  downloads_site: "Sitio",
  windows: "Windows",
  android: "Android",
  android_tv: "Android / TV",
  ios_mac: "iOS / macOS",

  paid_pending: "¡Gracias! Estamos confirmando tu pago. Tu plan se actualiza solo: normalmente en un minuto con tarjeta y hasta 30 minutos con cripto.",
  paid_done: "Pago recibido. Tu plan está actualizado.",

  promo_title: "Código promocional",
  promo_label: "Código promocional",
  promo_ph: "Introduce el código",
  promo_apply: "Aplicar",
  promo_applied: "Código promocional aplicado.",

  rewards_kicker: "Recompensas",
  rewards_title: "Invita a tus amigos",
  ref_title: "Programa de referidos",
  ref_note: "+{days} días para 1 dispositivo por cada amigo que compre un plan.",
  ref_body: "Consigue +{days} días para 1 dispositivo por cada amigo que compre un plan.",
  ref_link_label: "Tu enlace de invitación",
  ref_click_copy: "Haz clic para copiar",
  ref_copied: "Copiado",
  ref_invited: "Invitados",
  ref_paid: "Pagaron",
  ref_days_earned: "Días ganados",
  share: "Compartir",
  share_text: "VPN privada y rápida. Únete a Kovra:",

  settings_kicker: "Ajustes",
  account_title: "Cuenta",
  signed_in_as: "Sesión iniciada como",
  tg_id: "ID de Telegram {id}",
  prefs_title: "Preferencias",
  linked: "Vinculado",
  loading_account: "Cargando tu cuenta…",
  load_failed: "No hemos podido cargar tu cuenta.",

  guide: "Guías de configuración",
  guide_note: "Configuración paso a paso para cada plataforma.",
  open: "Abrir",
  support: "Soporte",
  support_note: "Escríbenos por Telegram.",
  write: "Escribir",

  err_conn: "Problema de conexión. Revisa tu internet e inténtalo de nuevo.",
  err_pay: "No se pudo iniciar el pago. Inténtalo de nuevo o elige otro método.",
  err_generic: "Algo salió mal. Inténtalo de nuevo.",
  err_no_slot: "No hay espacio libre. Compra primero un plan o un espacio extra.",
  err_device_gone: "Este dispositivo ya no existe. Actualiza la página.",
  err_reset_failed: "No se pudo restablecer el vínculo. Inténtalo de nuevo.",

  link_title: "Cuentas vinculadas",
  link_tg_id: "ID de Telegram",
  link_tg_btn: "Vincular Telegram",
  link_tg_linked: "Telegram vinculado.",
  link_tg_open: "Abrir el bot",
  link_tg_intro: "Vincula Telegram para iniciar sesión con un toque.",
  link_email_btn: "Vincular correo",
  link_email_linked: "Correo vinculado.",
  link_email_intro: "Añade un correo y una contraseña como segunda forma de iniciar sesión.",
  link_unlink: "Desvincular",
  link_unlink_body: "Puedes volver a vincularlo cuando quieras.",
  link_unlink_confirm_email: "¿Desvincular el correo?",
  link_unlink_confirm_tg: "¿Desvincular Telegram?",
  link_copy_hint: "Toca para copiar",
  link_copied: "Copiado",
  link_waiting: "Esperando…",
  link_pwd_ph: "Contraseña (mín. 8)",
  link_confirm: "Confirmar",
  link_resend: "Reenviar",
  link_resend_in: "Reenviar en",
  link_back: "Atrás",
  link_code_sent: "Código enviado a",
};

const de: DashDict = {
  dash_title: "Übersicht",
  page_title: "Übersicht",
  help_title: "Hilfe",
  logout: "Abmelden",
  nav_label: "Bereiche der Übersicht",
  nav_devices: "Geräte",
  nav_plan: "Tarif",
  nav_rewards: "Prämien",
  nav_account: "Konto",
  account_menu: "Kontomenü",
  account_settings: "Kontoeinstellungen",
  help_support: "Hilfe und Support",
  sign_out: "Abmelden",

  devices: "Geräte",
  active_devices: "Aktive Geräte",
  status: "Status",
  status_active: "Aktiv",
  status_none: "Keiner",
  expires: "Läuft ab",
  no_plan: "Kein aktiver Tarif",

  hero_title_active: "Dein Tarif ist aktiv",
  hero_title_expiring: { one: "Dein Tarif endet in {n} Tag", other: "Dein Tarif endet in {n} Tagen" },
  hero_title_expired: "Dein Tarif ist abgelaufen",
  hero_title_none: "Wähle einen Tarif, um loszulegen",
  hero_none_body: "Wähle einen Tarif und richte deine Geräte in wenigen Minuten ein.",
  active_until_date: "Aktiv bis {date}",
  expired_on: "Abgelaufen am {date}",
  days_left_unit: { one: "Tag übrig", other: "Tage übrig" },
  slots_label: "Geräte",
  slots_plan: { one: "{n} Gerät", other: "{n} Geräte" },
  slots_used_sr: "{used} von {total} Geräten belegt",
  renew: "Tarif verlängern",
  choose_plan_cta: "Tarif wählen",

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
  billing_kicker: "Abrechnung",
  plan_title: "Tarif und Zahlung",
  plan_title_new: "Wähle deinen Tarif",
  plan_title_renew: "Tarif verlängern",
  current_plan: "Aktueller Tarif",
  current_until: "Aktiv bis {date}",
  renew_note: "Eine Verlängerung gibt deinem Tarif mehr Zeit. Brauchst du ein weiteres Gerät? Kauf unten einen Zusatzplatz.",
  plan_kind_label: "Geräte",
  term_label: "Laufzeit",
  per_month: "{price}/Mon.",
  billed_once: "{total} einmalig",
  discount: "−{n} %",
  summary_kicker: "Gesamt",
  summary_line: "{per}/Mon. · {term}",
  was_price: "Regulärer Preis {price}",
  pay_with: "Bezahlen mit",
  more_ways: "Weitere Zahlungsarten ({n})",
  fewer_ways: "Weniger anzeigen",
  pay_cta: "{amount} bezahlen",
  renew_cta: "Für {amount} verlängern",
  redirecting: "Weiterleitung zur Zahlung…",

  m_card: "Karte",
  m_card_sub: "Visa oder Mastercard · Abrechnung in EUR",
  m_card_note: "Abrechnung in EUR zum Tageskurs. Auf deinem Kontoauszug steht „skillstep“.",
  m_card_rub: "Karte in Rubel",
  m_card_rub_sub: "Mastercard · Abrechnung in RUB zum Kurs des Zahlungsdienstleisters",
  m_card_rub_note: "Abrechnung in RUB zum Kurs des Zahlungsdienstleisters. Deine Bank kann eine Umrechnungsgebühr erheben.",
  m_crypto: "Krypto",
  m_crypto_sub: "USDT, BTC, ETH und mehr",
  m_crypto_note: "Die Coin wählst du auf der nächsten Seite. Dein Tarif startet nach der Netzwerkbestätigung, meist in 5–30 Minuten.",
  m_lava_card: "Karte · international",
  m_lava_card_sub: "Visa oder Mastercard · Abrechnung in {currency}",
  m_paypal: "PayPal",
  m_applepay: "Apple Pay",
  m_sepa: "SEPA",
  m_ideal: "iDEAL",
  m_mbway: "MB WAY",
  m_pix: "Pix",
  m_lava_sub: "Abbuchung {amount}",
  m_lava_note: "Abgebucht werden genau {amount}.",
  m_lava_ru_hint: "Internationale Zahlungsarten: Eine russische Karte funktioniert hier nicht.",

  your_subs: "Aktive Abos",
  subs_title: "Deine Abos",
  sub_plan1: "Tarif · 1 Gerät",
  sub_plan3: "Tarif · 3 Geräte",
  sub_device: "Zusatzgerät",
  sub_referral: "Empfehlungsprämie",
  active_until: "bis",
  until: "bis {date}",

  add_device: "Gerät hinzufügen",
  add_device_note: "+1 Gerät für {days} Tage, zusätzlich zu deinem Tarif.",
  buy_device: "Gerät hinzufügen · {price}",
  slot_title: "Zusätzlicher Geräteplatz",
  slot_body: "+1 Gerät für {days} Tage, zusätzlich zu deinem Tarif.",
  slot_price: "{price} · {days} Tage",
  slot_days: "für {days} Tage",
  slot_buy: "Platz kaufen",
  slot_dialog_title: "Zusätzlichen Geräteplatz kaufen",
  slot_cta: "{amount} bezahlen",

  your_devices: "Deine Geräte",
  devices_title: "Deine Geräte",
  device_link_note: "Füge diesen Link in Happ (oder INCY) hinzu.",
  reset_hwid: "Gerätebindung zurücksetzen",
  reset_hwid_note: "Ein Link funktioniert auf einem Gerät. Setze ihn zurück, wenn du das Gerät gewechselt hast oder „ein Gerät pro Link“ siehst.",
  reset_hwid_done: "Bindung zurückgesetzt. Aktualisiere das Abo auf dem Gerät, das du nutzen willst.",
  reset_hwid_confirm: "Gerätebindung für diesen Link zurücksetzen?",
  reset_title: "Gerätebindung zurücksetzen?",
  reset_confirm: "Bindung zurücksetzen",
  add_to_app: "Zur App hinzufügen",
  delete: "Löschen",
  delete_device: "Gerät löschen",
  delete_title: "{name} löschen?",
  delete_body: "Der Link funktioniert sofort nicht mehr. Das lässt sich nicht rückgängig machen.",
  confirm_delete: "Dieses Gerät löschen? Der Link funktioniert dann nicht mehr.",
  connect: "Verbinden",
  add_one: "Gerät hinzufügen",
  pick_device: "Gerät auswählen",
  picker_title: "Welches Gerät richtest du ein?",
  this_device: "Dieses Gerät",
  cancel: "Abbrechen",
  hide: "Ausblenden",
  download_app_for: "Lade die App für",
  need_slot: "Kein freier Geräteplatz",
  need_slot_note: "Kauf einen Tarif oder füge ein Gerät hinzu, um dich zu verbinden.",
  no_slot_title: "Alle Geräteplätze sind belegt",
  no_slot_body: "Kauf einen Zusatzplatz oder lösche ein Gerät, das du nicht mehr nutzt.",
  buy_slot: "Zusatzplatz kaufen",
  no_plan_devices: "Deine Geräte erscheinen hier, sobald du einen Tarif hast.",
  max_devices: "Maximal 100 Geräte",
  creating: "Wird eingerichtet…",
  setup_device: "Gerät einrichten",
  setup_first: "Erstes Gerät einrichten",
  slots_free: { one: "{n} Platz frei", other: "{n} Plätze frei" },
  added_on: "Hinzugefügt am {date}",
  sub_link: "Abo-Link",
  open_in_happ: "In Happ öffnen",
  more_actions: "Weitere Aktionen für {name}",
  dev_android: "Android",
  dev_iphone: "iPhone",
  dev_mac: "Mac",
  dev_windows: "Windows",
  dev_tv: "TV",
  dev_fallback: "Gerät",

  show_qr: "QR-Code",
  hide_qr: "QR-Code ausblenden",
  scan_tv: "TV-Code scannen",
  close_scanner: "Scanner schließen",
  qr_caption: "Scanne ihn mit Happ auf deinem Handy oder TV.",
  qr_label: "QR-Code des Abo-Links",
  scan_hint: "Richte die Kamera auf den QR-Code auf deinem TV.",
  scan_result: "Gescannter Link",
  scan_again: "Erneut scannen",
  scan_error: "Kamera nicht verfügbar. Erlaube den Kamerazugriff und versuch es noch einmal.",

  setup_title: "{device} einrichten",
  step1_t: "Happ installieren",
  step1_b: "Lade die kostenlose App Happ für {device}.",
  step_incy: "Funktioniert auch: INCY",
  get_happ: "Happ laden",
  step2_t: "Link hinzufügen",
  step2_b: "Tippe auf „In Happ öffnen“ oder kopiere deinen Link und füge ihn in der App hinzu.",
  step3_t: "Verbinden",
  step3_b: "Tippe in Happ auf die Verbinden-Taste. Fertig.",
  done: "Fertig",

  apps_title: "App herunterladen",
  apps_recommended: "Empfohlen",
  apps_also: "Funktioniert auch",
  happ_desc: "Unsere empfohlene App. Fügt deinen Link mit einem Tippen hinzu.",
  incy_desc: "Eine alternative App, die mit demselben Link funktioniert.",
  dl_apple: "iPhone und Mac",
  dl_android_tv: "Android und TV",
  dl_windows: "Windows",
  dl_incy_other: "Android, Windows, macOS und Linux",
  dl_all: "Alle Downloads",
  downloads_all: "Alle",
  downloads_site: "Webseite",
  windows: "Windows",
  android: "Android",
  android_tv: "Android / TV",
  ios_mac: "iOS / macOS",

  paid_pending: "Danke! Wir bestätigen deine Zahlung. Dein Tarif aktualisiert sich automatisch: mit Karte meist innerhalb einer Minute, mit Krypto bis zu 30 Minuten.",
  paid_done: "Zahlung erhalten. Dein Tarif ist aktualisiert.",

  promo_title: "Promo-Code",
  promo_label: "Promo-Code",
  promo_ph: "Code eingeben",
  promo_apply: "Einlösen",
  promo_applied: "Promo-Code eingelöst.",

  rewards_kicker: "Prämien",
  rewards_title: "Freunde einladen",
  ref_title: "Empfehlungsprogramm",
  ref_note: "+{days} Tage für 1 Gerät für jeden Freund, der einen Tarif kauft.",
  ref_body: "Erhalte +{days} Tage für 1 Gerät für jeden Freund, der einen Tarif kauft.",
  ref_link_label: "Dein Einladungslink",
  ref_click_copy: "Zum Kopieren klicken",
  ref_copied: "Kopiert",
  ref_invited: "Eingeladen",
  ref_paid: "Bezahlt",
  ref_days_earned: "Tage erhalten",
  share: "Teilen",
  share_text: "Privates, schnelles VPN. Komm zu Kovra:",

  settings_kicker: "Einstellungen",
  account_title: "Konto",
  signed_in_as: "Angemeldet als",
  tg_id: "Telegram-ID {id}",
  prefs_title: "Einstellungen",
  linked: "Verknüpft",
  loading_account: "Dein Konto wird geladen…",
  load_failed: "Wir konnten dein Konto nicht laden.",

  guide: "Anleitungen",
  guide_note: "Schritt-für-Schritt-Einrichtung für jede Plattform.",
  open: "Öffnen",
  support: "Support",
  support_note: "Schreib uns auf Telegram.",
  write: "Schreiben",

  err_conn: "Verbindungsproblem. Prüfe dein Internet und versuch es noch einmal.",
  err_pay: "Die Zahlung konnte nicht gestartet werden. Versuch es noch einmal oder wähle eine andere Zahlungsart.",
  err_generic: "Etwas ist schiefgelaufen. Bitte versuch es noch einmal.",
  err_no_slot: "Kein freier Geräteplatz. Kauf zuerst einen Tarif oder einen Zusatzplatz.",
  err_device_gone: "Dieses Gerät gibt es nicht mehr. Lade die Seite neu.",
  err_reset_failed: "Die Bindung konnte nicht zurückgesetzt werden. Versuch es noch einmal.",

  link_title: "Verknüpfte Konten",
  link_tg_id: "Telegram-ID",
  link_tg_btn: "Telegram verknüpfen",
  link_tg_linked: "Telegram verknüpft.",
  link_tg_open: "Bot öffnen",
  link_tg_intro: "Verknüpfe Telegram, um dich mit einem Tippen anzumelden.",
  link_email_btn: "E-Mail verknüpfen",
  link_email_linked: "E-Mail verknüpft.",
  link_email_intro: "Füge E-Mail und Passwort als zweite Anmeldemöglichkeit hinzu.",
  link_unlink: "Trennen",
  link_unlink_body: "Du kannst es jederzeit wieder verknüpfen.",
  link_unlink_confirm_email: "E-Mail trennen?",
  link_unlink_confirm_tg: "Telegram trennen?",
  link_copy_hint: "Zum Kopieren tippen",
  link_copied: "Kopiert",
  link_waiting: "Warte…",
  link_pwd_ph: "Passwort (min. 8)",
  link_confirm: "Bestätigen",
  link_resend: "Erneut senden",
  link_resend_in: "Erneut senden in",
  link_back: "Zurück",
  link_code_sent: "Code gesendet an",
};

const fr: DashDict = {
  dash_title: "Tableau de bord",
  page_title: "Tableau de bord",
  help_title: "Aide",
  logout: "Déconnexion",
  nav_label: "Sections du tableau de bord",
  nav_devices: "Appareils",
  nav_plan: "Forfait",
  nav_rewards: "Récompenses",
  nav_account: "Compte",
  account_menu: "Menu du compte",
  account_settings: "Paramètres du compte",
  help_support: "Aide et assistance",
  sign_out: "Se déconnecter",

  devices: "Appareils",
  active_devices: "Appareils actifs",
  status: "Statut",
  status_active: "Actif",
  status_none: "Aucun",
  expires: "Expire",
  no_plan: "Aucun forfait actif",

  hero_title_active: "Votre forfait est actif",
  hero_title_expiring: { one: "Votre forfait se termine dans {n} jour", other: "Votre forfait se termine dans {n} jours" },
  hero_title_expired: "Votre forfait a expiré",
  hero_title_none: "Choisissez un forfait pour commencer",
  hero_none_body: "Choisissez un forfait, puis configurez vos appareils en quelques minutes.",
  active_until_date: "Actif jusqu’au {date}",
  expired_on: "Expiré le {date}",
  days_left_unit: { one: "jour restant", other: "jours restants" },
  slots_label: "Appareils",
  slots_plan: { one: "{n} appareil", other: "{n} appareils" },
  slots_used_sr: "{used} appareils utilisés sur {total}",
  renew: "Renouveler le forfait",
  choose_plan_cta: "Choisir un forfait",

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
  billing_kicker: "Facturation",
  plan_title: "Forfait et paiement",
  plan_title_new: "Choisissez votre forfait",
  plan_title_renew: "Renouveler votre forfait",
  current_plan: "Forfait actuel",
  current_until: "Actif jusqu’au {date}",
  renew_note: "Le renouvellement ajoute du temps à votre forfait actuel. Besoin d’un autre appareil ? Achetez un emplacement supplémentaire ci-dessous.",
  plan_kind_label: "Appareils",
  term_label: "Période de facturation",
  per_month: "{price}/mois",
  billed_once: "{total} en une fois",
  discount: "−{n} %",
  summary_kicker: "Total",
  summary_line: "{per}/mois · {term}",
  was_price: "Prix habituel {price}",
  pay_with: "Payer avec",
  more_ways: "Autres moyens de paiement ({n})",
  fewer_ways: "Moins d’options",
  pay_cta: "Payer {amount}",
  renew_cta: "Renouveler pour {amount}",
  redirecting: "Redirection vers le paiement…",

  m_card: "Carte",
  m_card_sub: "Visa ou Mastercard · débité en EUR",
  m_card_note: "Débité en EUR au taux du jour. Votre relevé indique « skillstep ».",
  m_card_rub: "Carte en roubles",
  m_card_rub_sub: "Mastercard · débité en RUB au taux du prestataire",
  m_card_rub_note: "Débité en RUB au taux du prestataire. Votre banque peut ajouter des frais de conversion.",
  m_crypto: "Crypto",
  m_crypto_sub: "USDT, BTC, ETH et plus",
  m_crypto_note: "Vous choisirez la cryptomonnaie à l’étape suivante. Votre forfait s’active après confirmation du réseau, en général sous 5 à 30 minutes.",
  m_lava_card: "Carte · internationale",
  m_lava_card_sub: "Visa ou Mastercard · débité en {currency}",
  m_paypal: "PayPal",
  m_applepay: "Apple Pay",
  m_sepa: "SEPA",
  m_ideal: "iDEAL",
  m_mbway: "MB WAY",
  m_pix: "Pix",
  m_lava_sub: "Débité {amount}",
  m_lava_note: "Vous serez débité exactement de {amount}.",
  m_lava_ru_hint: "Moyens internationaux : une carte russe ne fonctionnera pas ici.",

  your_subs: "Abonnements actifs",
  subs_title: "Vos abonnements",
  sub_plan1: "Forfait · 1 appareil",
  sub_plan3: "Forfait · 3 appareils",
  sub_device: "Appareil supplémentaire",
  sub_referral: "Récompense de parrainage",
  active_until: "jusqu’au",
  until: "jusqu’au {date}",

  add_device: "Ajouter un appareil",
  add_device_note: "+1 appareil pendant {days} jours, en plus de votre forfait.",
  buy_device: "Ajouter un appareil · {price}",
  slot_title: "Emplacement supplémentaire",
  slot_body: "+1 appareil pendant {days} jours, en plus de votre forfait.",
  slot_price: "{price} · {days} jours",
  slot_days: "pendant {days} jours",
  slot_buy: "Acheter un emplacement",
  slot_dialog_title: "Acheter un emplacement supplémentaire",
  slot_cta: "Payer {amount}",

  your_devices: "Vos appareils",
  devices_title: "Vos appareils",
  device_link_note: "Ajoutez ce lien dans Happ (ou INCY).",
  reset_hwid: "Réinitialiser la liaison de l’appareil",
  reset_hwid_note: "Un lien fonctionne sur un seul appareil. Réinitialisez-le si vous avez changé d’appareil ou voyez « un appareil par lien ».",
  reset_hwid_done: "Liaison réinitialisée. Actualisez l’abonnement sur l’appareil souhaité.",
  reset_hwid_confirm: "Réinitialiser la liaison de l’appareil pour ce lien ?",
  reset_title: "Réinitialiser la liaison de l’appareil ?",
  reset_confirm: "Réinitialiser",
  add_to_app: "Ajouter à l’app",
  delete: "Supprimer",
  delete_device: "Supprimer l’appareil",
  delete_title: "Supprimer {name} ?",
  delete_body: "Son lien cesse de fonctionner immédiatement. Cette action est irréversible.",
  confirm_delete: "Supprimer cet appareil ? Le lien cessera de fonctionner.",
  connect: "Connecter",
  add_one: "Ajouter un appareil",
  pick_device: "Choisissez un appareil",
  picker_title: "Quel appareil configurez-vous ?",
  this_device: "Cet appareil",
  cancel: "Annuler",
  hide: "Masquer",
  download_app_for: "Téléchargez l’app pour",
  need_slot: "Aucun emplacement libre",
  need_slot_note: "Achetez un forfait ou ajoutez un appareil pour vous connecter.",
  no_slot_title: "Tous les emplacements sont utilisés",
  no_slot_body: "Achetez un emplacement supplémentaire ou supprimez un appareil que vous n’utilisez plus.",
  buy_slot: "Acheter un emplacement",
  no_plan_devices: "Vos appareils apparaîtront ici dès que vous aurez un forfait.",
  max_devices: "100 appareils maximum",
  creating: "Configuration…",
  setup_device: "Configurer un appareil",
  setup_first: "Configurer votre premier appareil",
  slots_free: { one: "{n} emplacement libre", other: "{n} emplacements libres" },
  added_on: "Ajouté le {date}",
  sub_link: "Lien d’abonnement",
  open_in_happ: "Ouvrir dans Happ",
  more_actions: "Autres actions pour {name}",
  dev_android: "Android",
  dev_iphone: "iPhone",
  dev_mac: "Mac",
  dev_windows: "Windows",
  dev_tv: "TV",
  dev_fallback: "Appareil",

  show_qr: "Code QR",
  hide_qr: "Masquer le code QR",
  scan_tv: "Scanner le code TV",
  close_scanner: "Fermer le scanner",
  qr_caption: "Scannez-le avec Happ sur votre téléphone ou votre TV.",
  qr_label: "Code QR du lien d’abonnement",
  scan_hint: "Pointez la caméra vers le code QR affiché sur votre TV.",
  scan_result: "Lien scanné",
  scan_again: "Scanner à nouveau",
  scan_error: "Caméra indisponible. Autorisez l’accès à la caméra et réessayez.",

  setup_title: "Configurer {device}",
  step1_t: "Installez Happ",
  step1_b: "Téléchargez l’app gratuite Happ pour {device}.",
  step_incy: "Fonctionne aussi : INCY",
  get_happ: "Obtenir Happ",
  step2_t: "Ajoutez votre lien",
  step2_b: "Touchez « Ouvrir dans Happ », ou copiez votre lien et ajoutez-le dans l’app.",
  step3_t: "Connectez-vous",
  step3_b: "Touchez le bouton de connexion dans Happ. C’est tout.",
  done: "Terminé",

  apps_title: "Télécharger l’app",
  apps_recommended: "Recommandée",
  apps_also: "Fonctionne aussi",
  happ_desc: "Notre app recommandée. Ajoute votre lien en un geste.",
  incy_desc: "Une app alternative qui fonctionne avec le même lien.",
  dl_apple: "iPhone et Mac",
  dl_android_tv: "Android et TV",
  dl_windows: "Windows",
  dl_incy_other: "Android, Windows, macOS et Linux",
  dl_all: "Tous les téléchargements",
  downloads_all: "Tout",
  downloads_site: "Site",
  windows: "Windows",
  android: "Android",
  android_tv: "Android / TV",
  ios_mac: "iOS / macOS",

  paid_pending: "Merci ! Nous confirmons votre paiement. Votre forfait se met à jour automatiquement : en général en une minute par carte, jusqu’à 30 minutes en crypto.",
  paid_done: "Paiement reçu. Votre forfait est à jour.",

  promo_title: "Code promo",
  promo_label: "Code promo",
  promo_ph: "Code promo",
  promo_apply: "Appliquer",
  promo_applied: "Code promo appliqué.",

  rewards_kicker: "Récompenses",
  rewards_title: "Invitez vos amis",
  ref_title: "Programme de parrainage",
  ref_note: "+{days} jours pour 1 appareil pour chaque ami qui achète un forfait.",
  ref_body: "Obtenez +{days} jours pour 1 appareil pour chaque ami qui achète un forfait.",
  ref_link_label: "Votre lien d’invitation",
  ref_click_copy: "Cliquez pour copier",
  ref_copied: "Copié",
  ref_invited: "Invités",
  ref_paid: "Ont payé",
  ref_days_earned: "Jours gagnés",
  share: "Partager",
  share_text: "Un VPN privé et rapide. Rejoignez-moi sur Kovra :",

  settings_kicker: "Paramètres",
  account_title: "Compte",
  signed_in_as: "Connecté en tant que",
  tg_id: "ID Telegram {id}",
  prefs_title: "Préférences",
  linked: "Lié",
  loading_account: "Chargement de votre compte…",
  load_failed: "Impossible de charger votre compte.",

  guide: "Guides de configuration",
  guide_note: "Configuration pas à pas pour chaque plateforme.",
  open: "Ouvrir",
  support: "Assistance",
  support_note: "Écrivez-nous sur Telegram.",
  write: "Écrire",

  err_conn: "Problème de connexion. Vérifiez votre accès à Internet et réessayez.",
  err_pay: "Impossible de lancer le paiement. Réessayez ou choisissez un autre moyen.",
  err_generic: "Une erreur s’est produite. Veuillez réessayer.",
  err_no_slot: "Aucun emplacement libre. Achetez d’abord un forfait ou un emplacement supplémentaire.",
  err_device_gone: "Cet appareil n’existe plus. Actualisez la page.",
  err_reset_failed: "Impossible de réinitialiser la liaison. Réessayez.",

  link_title: "Comptes liés",
  link_tg_id: "ID Telegram",
  link_tg_btn: "Lier Telegram",
  link_tg_linked: "Telegram lié.",
  link_tg_open: "Ouvrir le bot",
  link_tg_intro: "Liez Telegram pour vous connecter en un geste.",
  link_email_btn: "Lier un e-mail",
  link_email_linked: "E-mail lié.",
  link_email_intro: "Ajoutez un e-mail et un mot de passe comme second moyen de connexion.",
  link_unlink: "Dissocier",
  link_unlink_body: "Vous pourrez le lier à nouveau à tout moment.",
  link_unlink_confirm_email: "Dissocier l’e-mail ?",
  link_unlink_confirm_tg: "Dissocier Telegram ?",
  link_copy_hint: "Touchez pour copier",
  link_copied: "Copié",
  link_waiting: "En attente…",
  link_pwd_ph: "Mot de passe (min. 8)",
  link_confirm: "Confirmer",
  link_resend: "Renvoyer",
  link_resend_in: "Renvoyer dans",
  link_back: "Retour",
  link_code_sent: "Code envoyé à",
};

export const DASH_DICT: Readonly<Record<DashLang, DashDict>> = { en, ru, es, de, fr };

/**
 * Dashboard language and strings. `lang` is the cabinet language ("en" on the
 * server and during hydration); `setLang` persists the choice with the
 * explicit flag, exactly like the header switchers.
 */
export function useDashLang(): { lang: DashLang; setLang: (l: DashLang) => void; t: DashDict } {
  const lang = useCabinetLang();
  const setLang = useCallback((l: DashLang) => setCabinetLang(l), []);
  return { lang, setLang, t: DASH_DICT[lang] };
}

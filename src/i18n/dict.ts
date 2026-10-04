// src/i18n/dict.ts
//
// Translations the client Localizer applies through data-i18n markup: the
// /guide page, its FAQ and a few shared strings. The landing (/) has its own
// dictionary in src/app/page.tsx, and Terms and Privacy live in legal.ts.
// The old home/pricing/terms/privacy keys were removed on 02.10.2026: no
// page rendered them, and they still carried claims the service does not
// keep (speeds, a 10 ₽ trial, refunds under Russian law, Netflix in 4K).
//
// Server still renders RU markup; the client `Localizer` swaps text for
// the active locale. All values are pre-sanitised authored content (no
// XSS vector) so `data-i18n-html` may inject them safely.
//
// Conventions for keys:
//   <page>.<section>.<role>[.<index>]    e.g. home.hero.title
//   nav.*                                 shared across pages
//   common.*                              tiny strings reused everywhere
//
// IMPORTANT: when you change RU copy on a page, also update the matching
// `ru` value here so the round-trip switch (RU → EN → RU) restores text
// exactly. The server-rendered RU is the one Yandex/Google index, but the
// `ru` dict acts as the canonical "snap-back" value when the user
// switches languages without a page reload.

export type Lang = "ru" | "en" | "es" | "de" | "fr";
export const SUPPORTED_LANGS: readonly Lang[] = ["ru", "en", "es", "de", "fr"] as const;
export const DEFAULT_LANG: Lang = "ru";

type Dict = Readonly<Record<string, string>>;

/* ── Russian ───────────────────────────────────────── */

const ru: Dict = {
  /* common */
  "common.brand": "Kovra",
  "common.brand.latin": "Kovra",
  "common.back": "Назад",
  "common.back.home": "← На главную",
  "common.back.home.short": "На главную",
  "common.copyright": "©",

  /* ── guide page ───────────────────────────────── */
  "guide.brand": "Kovra",
  "guide.title": "Инструкция по подключению",
  "guide.subtitle": "Три шага на каждой платформе. Выберите вашу.",

  "guide.common.title": "Для всех платформ: скопируйте ссылку подписки",
  "guide.common.desc.html":
    "Откройте <a href=\"/dashboard\" class=\"text-nm-accent hover:underline\">Панель управления</a>, добавьте устройство нужного типа — и у него появится персональная ссылка подписки. Скопируйте её кнопкой справа от ссылки. На следующих шагах мы вставим её в приложение. Для каждого устройства — отдельная ссылка, не передавайте её третьим лицам.",

  "guide.step.install": "Установите приложение",
  "guide.step.import": "Импортируйте подписку",
  "guide.step.connect": "Подключитесь",

  /* android */
  "guide.android.s1.html":
    "Скачайте <strong class=\"text-nm-text\">HAPP</strong> из <a href=\"https://play.google.com/store/apps/details?id=com.happproxy\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">Google Play</a> или <a href=\"https://www.happ.su/main\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">сайта HAPP</a>.",
  "guide.android.s1b.html":
    "Альтернатива: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://github.com/INCY-DEV/incy-platforms/releases/latest\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">GitHub</a>",
  "guide.android.s2a.html":
    "Откройте HAPP → нажмите <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Импорт из буфера обмена»</strong>.",
  "guide.android.s2b":
    "Приложение автоматически распознает скопированную ссылку подписки и добавит сервер. Подписка будет обновляться сама — при изменении срока действия ничего перенастраивать не нужно.",
  "guide.android.s3a.html":
    "Выберите добавленный сервер и нажмите кнопку подключения. Android запросит разрешение на VPN — нажмите <strong class=\"text-nm-text\">«OK»</strong>.",
  "guide.android.s3b": "Если в статус-баре появился значок ключа — вы подключены.",

  /* ios */
  "guide.ios.s1.html": "Скачайте <strong class=\"text-nm-text\">HAPP</strong>:",
  "guide.ios.s1b.html":
    "Альтернатива: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://apps.apple.com/app/id6756943388\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
  "guide.ios.s2a.html":
    "Откройте HAPP → <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Импорт из буфера обмена»</strong>.",
  "guide.ios.s2b":
    "Или откройте скопированную ссылку подписки в Safari — HAPP предложит импортировать её автоматически. После добавления подписка будет обновляться сама.",
  "guide.ios.s3a.html":
    "Выберите сервер, нажмите <strong class=\"text-nm-text\">«Подключить»</strong>. iOS попросит разрешить VPN-конфигурацию — подтвердите через Face ID / Touch ID.",
  "guide.ios.s3b": "Значок «VPN» в статус-баре = подключение активно.",

  /* windows */
  "guide.win.s1.html":
    "Скачайте <strong class=\"text-nm-text\">HAPP</strong>: <a href=\"https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe\" class=\"text-nm-accent hover:underline\">setup-Happ.x64.exe</a>",
  "guide.win.s1b.html":
    "Альтернатива: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://github.com/INCY-DEV/incy-platforms/releases/latest\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">GitHub</a>",
  "guide.win.s1c": "Запустите → установите как обычное приложение.",
  "guide.win.s2a.html":
    "Откройте HAPP → нажмите <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Импорт из буфера»</strong>.",
  "guide.win.s2b.html":
    "Или вставьте ссылку вручную: <strong class=\"text-nm-text\">«+» → «Ввести URL»</strong> → вставьте ссылку подписки. Подписка будет обновляться сама.",
  "guide.win.s3a.html":
    "Выберите сервер из списка и нажмите <strong class=\"text-nm-text\">кнопку подключения</strong>. Windows может запросить разрешение на добавление VPN-адаптера — нажмите <strong class=\"text-nm-text\">«Да»</strong>.",
  "guide.win.s3b": "Иконка HAPP в трее изменит цвет — подключение установлено.",

  /* macos */
  "guide.mac.s1.html": "Скачайте <strong class=\"text-nm-text\">HAPP</strong>:",
  "guide.mac.s1b.html":
    "Альтернатива: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://apps.apple.com/app/id6756943388\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
  "guide.mac.s2.html":
    "Откройте HAPP → <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Импорт из буфера»</strong>. Приложение распознает ссылку подписки и добавит сервер. Подписка будет обновляться сама.",
  "guide.mac.s3a.html":
    "Выберите сервер, нажмите <strong class=\"text-nm-text\">«Подключить»</strong>. macOS попросит разрешить VPN — введите пароль системы.",
  "guide.mac.s3b": "Значок VPN в верхней панели = подключение активно.",

  "guide.faq.title": "Частые вопросы",
  "guide.help.title": "Не получается подключиться?",
  "guide.help.subtitle": "Напишите нам — поможем настроить.",
  "guide.help.btn": "Написать в Telegram",

  "faq.guide.0.q": "Какое приложение нужно установить?",
  "faq.guide.0.a":
    "Happ (рекомендуем) или INCY — оба бесплатные и принимают ссылку подписки Kovra. Если Happ нет в App Store вашей страны, ставьте INCY. Ссылки на установку для каждой платформы есть в инструкции выше.",
  "faq.guide.1.q": "Чем Happ отличается от INCY?",
  "faq.guide.1.a":
    "Оба работают на движке Xray и принимают одну и ту же ссылку подписки. Happ мы советуем по умолчанию. INCY — запасной вариант: он есть в App Store там, где Happ убрали, в том числе в России.",
  "faq.guide.2.q": "Как получить ссылку подписки для моего устройства?",
  "faq.guide.2.a":
    "В личном кабинете нажмите «Добавить устройство» и выберите тип — система сгенерирует уникальную ссылку. Её нужно скопировать и вставить в приложение Happ или INCY.",
  "faq.guide.3.q": "Можно ли использовать одну ссылку на нескольких устройствах?",
  "faq.guide.3.a":
    "Нет. Каждая ссылка работает только на одном устройстве — это защита от утечки и злоупотреблений. Для второго устройства создайте новый профиль в личном кабинете.",
  "faq.guide.4.q": "Что делать если VPN не подключается?",
  "faq.guide.4.a":
    "Проверьте что ссылка импортирована полностью и подписка оплачена. Если не помогло — удалите профиль в приложении и создайте заново. Если всё равно не работает, напишите в поддержку.",
  "faq.guide.5.q": "Нужно ли держать VPN включённым постоянно?",
  "faq.guide.5.a":
    "Нет. Включайте только когда нужно — например для стриминга или игр. Когда VPN выключен, трафик идёт напрямую через вашего провайдера без задержек.",

  /* ── login page ───────────────────────────────── */
  "auth.method.email": "Почта",
  "auth.method.telegram": "Telegram",
  "auth.email.label": "Email",
  "auth.email.placeholder": "you@example.com",
  "auth.password.label": "Пароль",
  "auth.legal.html":
    "Продолжая, вы соглашаетесь с <a href=\"/terms\" class=\"text-nm-accent hover:underline\" target=\"_blank\" rel=\"noopener\">Условиями использования</a> и <a href=\"/privacy\" class=\"text-nm-accent hover:underline\" target=\"_blank\" rel=\"noopener\">Политикой конфиденциальности</a>.",
  "auth.tg.code.copyHint": "Нажмите чтобы скопировать",
  "auth.tg.code.copied": "✓ Скопировано!",
  "auth.tg.open": "Открыть бота",
  "auth.tg.waiting": "Ожидаем подтверждение...",

  "login.title": "Вход",
  "login.subtitle": "Управляйте подпиской и настройками",
  "login.forgot": "Забыли?",
  "login.remember": "Запомнить на 7 дней",
  "login.submit": "Войти",
  "login.forgotSuccess": "Пароль обновлён — войдите с новым паролем",
  "login.forgot.intro": "Введите email — отправим код для сброса пароля",
  "login.forgot.send": "Отправить код",
  "login.forgot.back": "← Назад к входу",
  "login.reset.codePlaceholder": "6-значный код",
  "login.reset.newPwPlaceholder": "Новый пароль (мин. 8)",
  "login.reset.submit": "Сменить пароль",
  "login.reset.back": "← Назад",
  "login.tg.hint": "Получите код и отправьте его боту в Telegram",
  "login.tg.getCode": "Получить код",
  "login.noAccount": "Нет аккаунта?",
  "login.noAccount.cta": "Создать",

  "register.title": "Создать аккаунт",
  "register.subtitle": "Крипта или карта. Без автопродления.",
  "register.password.placeholder": "Минимум 8 символов",
  "register.submit": "Продолжить",
  "register.verify.title": "Проверьте почту",
  "register.verify.codeSent.prefix": "Код отправлен на",
  "register.verify.submit": "Подтвердить",
  "register.verify.changeEmail": "← Изменить email",
  "register.verify.resend": "Отправить снова",
  "register.verify.resendIn.prefix": "Повторно через ",
  "register.verify.resendIn.suffix": "с",
  "register.tg.hint.line1": "Нажмите кнопку — мы сгенерируем код.",
  "register.tg.hint.line2": "Отправьте его нашему боту в Telegram.",
  "register.tg.getCode": "Получить код",
  "register.tg.sendHint": "Отправьте код боту:",
  "register.haveAccount": "Уже есть аккаунт?",
  "register.haveAccount.cta": "Войти",
} as const;

const en: Dict = {
  /* common */
  "common.brand": "Kovra",
  "common.brand.latin": "Kovra",
  "common.back": "Back",
  "common.back.home": "← Home",
  "common.back.home.short": "Home",
  "common.copyright": "©",

  /* guide */
  "guide.brand": "Kovra",
  "guide.title": "Setup guide",
  "guide.subtitle": "Three steps on every platform. Pick yours.",

  "guide.common.title": "For every platform: copy your subscription link",
  "guide.common.desc.html":
    "Open the <a href=\"/dashboard\" class=\"text-nm-accent hover:underline\">Dashboard</a>, add a device of the right type — and it will get its own subscription link. Copy it with the button to the right of the link. We will paste it into the app in the next steps. Each device gets its own link — do not share it with anyone else.",

  "guide.step.install": "Install the app",
  "guide.step.import": "Import the subscription",
  "guide.step.connect": "Connect",

  "guide.android.s1.html":
    "Install <strong class=\"text-nm-text\">HAPP</strong> from <a href=\"https://play.google.com/store/apps/details?id=com.happproxy\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">Google Play</a> or the <a href=\"https://www.happ.su/main\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">HAPP website</a>.",
  "guide.android.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://github.com/INCY-DEV/incy-platforms/releases/latest\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">GitHub</a>",
  "guide.android.s2a.html":
    "Open HAPP → tap <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.android.s2b":
    "The app will recognise the copied subscription link and add the server. The subscription updates itself — when the term changes there is nothing to reconfigure.",
  "guide.android.s3a.html":
    "Pick the added server and tap the connect button. Android will ask for VPN permission — tap <strong class=\"text-nm-text\">«OK»</strong>.",
  "guide.android.s3b": "If the key icon appears in the status bar — you are connected.",

  "guide.ios.s1.html": "Install <strong class=\"text-nm-text\">HAPP</strong>:",
  "guide.ios.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://apps.apple.com/app/id6756943388\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
  "guide.ios.s2a.html":
    "Open HAPP → <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.ios.s2b":
    "Or open the copied subscription link in Safari — HAPP will offer to import it automatically. Once added, the subscription updates itself.",
  "guide.ios.s3a.html":
    "Pick the server and tap <strong class=\"text-nm-text\">«Connect»</strong>. iOS will ask to allow the VPN configuration — confirm with Face ID / Touch ID.",
  "guide.ios.s3b": "The «VPN» badge in the status bar means the connection is active.",

  "guide.win.s1.html":
    "Download <strong class=\"text-nm-text\">HAPP</strong>: <a href=\"https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe\" class=\"text-nm-accent hover:underline\">setup-Happ.x64.exe</a>",
  "guide.win.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://github.com/INCY-DEV/incy-platforms/releases/latest\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">GitHub</a>",
  "guide.win.s1c": "Run the installer → install as a regular application.",
  "guide.win.s2a.html":
    "Open HAPP → tap <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.win.s2b.html":
    "Or paste manually: <strong class=\"text-nm-text\">«+» → «Enter URL»</strong> → paste the subscription link. The subscription updates itself.",
  "guide.win.s3a.html":
    "Pick a server from the list and click the <strong class=\"text-nm-text\">connect button</strong>. Windows may ask for permission to add a VPN adapter — click <strong class=\"text-nm-text\">«Yes»</strong>.",
  "guide.win.s3b": "The HAPP tray icon will change colour — the connection is established.",

  "guide.mac.s1.html": "Install <strong class=\"text-nm-text\">HAPP</strong>:",
  "guide.mac.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://apps.apple.com/app/id6756943388\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
  "guide.mac.s2.html":
    "Open HAPP → <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>. The app will recognise the subscription link and add the server. The subscription updates itself.",
  "guide.mac.s3a.html":
    "Pick a server and tap <strong class=\"text-nm-text\">«Connect»</strong>. macOS will ask to allow the VPN — enter your system password.",
  "guide.mac.s3b": "The VPN icon in the menu bar means the connection is active.",

  "guide.faq.title": "Frequently asked questions",
  "guide.help.title": "Cannot connect?",
  "guide.help.subtitle": "Reach out — we will help you set it up.",
  "guide.help.btn": "Message on Telegram",

  "faq.guide.0.q": "Which app do I need to install?",
  "faq.guide.0.a":
    "Happ (recommended) or INCY — both are free and accept a Kovra subscription link. If Happ is not in your country's App Store, install INCY. Install links for each platform are in the guide above.",
  "faq.guide.1.q": "How is Happ different from INCY?",
  "faq.guide.1.a":
    "Both run on the Xray engine and take the same subscription link. We recommend Happ by default. INCY is the fallback: it is in the App Store where Happ was removed, including Russia.",
  "faq.guide.2.q": "How do I get a subscription link for my device?",
  "faq.guide.2.a":
    "In the dashboard tap «Add device» and pick the type — the system will generate a unique link. Copy it and paste it into Happ or INCY.",
  "faq.guide.3.q": "Can I use one link on multiple devices?",
  "faq.guide.3.a":
    "No. Each link works on a single device — this protects against leaks and abuse. For a second device create a new profile in the dashboard.",
  "faq.guide.4.q": "What do I do if the VPN does not connect?",
  "faq.guide.4.a":
    "Check that the link was imported in full and that the subscription is paid. If it still does not work — delete the profile in the app and add it again. If that still does not help, write to support.",
  "faq.guide.5.q": "Do I need to keep the VPN on all the time?",
  "faq.guide.5.a":
    "No. Switch it on only when needed — for streaming or games, for example. When the VPN is off, traffic goes directly through your provider with no overhead.",

  /* login / register */
  "auth.method.email": "Email",
  "auth.method.telegram": "Telegram",
  "auth.email.label": "Email",
  "auth.email.placeholder": "you@example.com",
  "auth.password.label": "Password",
  "auth.legal.html":
    "By continuing, you agree to the <a href=\"/terms\" class=\"text-nm-accent hover:underline\" target=\"_blank\" rel=\"noopener\">Terms of Service</a> and <a href=\"/privacy\" class=\"text-nm-accent hover:underline\" target=\"_blank\" rel=\"noopener\">Privacy Policy</a>.",
  "auth.tg.code.copyHint": "Tap to copy",
  "auth.tg.code.copied": "✓ Copied!",
  "auth.tg.open": "Open the bot",
  "auth.tg.waiting": "Waiting for confirmation...",

  "login.title": "Sign in",
  "login.subtitle": "Manage your subscription and settings",
  "login.forgot": "Forgot?",
  "login.remember": "Remember for 7 days",
  "login.submit": "Sign in",
  "login.forgotSuccess": "Password updated — sign in with the new one",
  "login.forgot.intro": "Enter your email — we will send a reset code",
  "login.forgot.send": "Send code",
  "login.forgot.back": "← Back to sign in",
  "login.reset.codePlaceholder": "6-digit code",
  "login.reset.newPwPlaceholder": "New password (min. 8)",
  "login.reset.submit": "Change password",
  "login.reset.back": "← Back",
  "login.tg.hint": "Get a code and send it to the bot on Telegram",
  "login.tg.getCode": "Get code",
  "login.noAccount": "No account?",
  "login.noAccount.cta": "Create",

  "register.title": "Create an account",
  "register.subtitle": "Crypto or card. Nothing renews automatically.",
  "register.password.placeholder": "Minimum 8 characters",
  "register.submit": "Continue",
  "register.verify.title": "Check your email",
  "register.verify.codeSent.prefix": "Code sent to",
  "register.verify.submit": "Confirm",
  "register.verify.changeEmail": "← Change email",
  "register.verify.resend": "Resend",
  "register.verify.resendIn.prefix": "Resend in ",
  "register.verify.resendIn.suffix": "s",
  "register.tg.hint.line1": "Tap the button — we will generate a code.",
  "register.tg.hint.line2": "Send it to our bot on Telegram.",
  "register.tg.getCode": "Get code",
  "register.tg.sendHint": "Send the code to the bot:",
  "register.haveAccount": "Already have an account?",
  "register.haveAccount.cta": "Sign in",
} as const;

const es: Dict = {
  /* common */
  "common.brand": "Kovra",
  "common.brand.latin": "Kovra",
  "common.back": "Atrás",
  "common.back.home": "← Inicio",
  "common.back.home.short": "Inicio",
  "common.copyright": "©",

  /* guide */
  "guide.brand": "Kovra",
  "guide.title": "Setup guide",
  "guide.subtitle": "Three steps on every platform. Pick yours.",

  "guide.common.title": "For every platform: copy your subscription link",
  "guide.common.desc.html":
    "Open the <a href=\"/dashboard\" class=\"text-nm-accent hover:underline\">Dashboard</a>, add a device of the right type — and it will get its own subscription link. Copy it with the button to the right of the link. We will paste it into the app in the next steps. Each device gets its own link — do not share it with anyone else.",

  "guide.step.install": "Install the app",
  "guide.step.import": "Import the subscription",
  "guide.step.connect": "Connect",

  "guide.android.s1.html":
    "Install <strong class=\"text-nm-text\">HAPP</strong> from <a href=\"https://play.google.com/store/apps/details?id=com.happproxy\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">Google Play</a> or the <a href=\"https://www.happ.su/main\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">HAPP website</a>.",
  "guide.android.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://github.com/INCY-DEV/incy-platforms/releases/latest\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">GitHub</a>",
  "guide.android.s2a.html":
    "Open HAPP → tap <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.android.s2b":
    "The app will recognise the copied subscription link and add the server. The subscription updates itself — when the term changes there is nothing to reconfigure.",
  "guide.android.s3a.html":
    "Pick the added server and tap the connect button. Android will ask for VPN permission — tap <strong class=\"text-nm-text\">«OK»</strong>.",
  "guide.android.s3b": "If the key icon appears in the status bar — you are connected.",

  "guide.ios.s1.html": "Install <strong class=\"text-nm-text\">HAPP</strong>:",
  "guide.ios.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://apps.apple.com/app/id6756943388\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
  "guide.ios.s2a.html":
    "Open HAPP → <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.ios.s2b":
    "Or open the copied subscription link in Safari — HAPP will offer to import it automatically. Once added, the subscription updates itself.",
  "guide.ios.s3a.html":
    "Pick the server and tap <strong class=\"text-nm-text\">«Connect»</strong>. iOS will ask to allow the VPN configuration — confirm with Face ID / Touch ID.",
  "guide.ios.s3b": "The «VPN» badge in the status bar means the connection is active.",

  "guide.win.s1.html":
    "Download <strong class=\"text-nm-text\">HAPP</strong>: <a href=\"https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe\" class=\"text-nm-accent hover:underline\">setup-Happ.x64.exe</a>",
  "guide.win.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://github.com/INCY-DEV/incy-platforms/releases/latest\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">GitHub</a>",
  "guide.win.s1c": "Run the installer → install as a regular application.",
  "guide.win.s2a.html":
    "Open HAPP → tap <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.win.s2b.html":
    "Or paste manually: <strong class=\"text-nm-text\">«+» → «Enter URL»</strong> → paste the subscription link. The subscription updates itself.",
  "guide.win.s3a.html":
    "Pick a server from the list and click the <strong class=\"text-nm-text\">connect button</strong>. Windows may ask for permission to add a VPN adapter — click <strong class=\"text-nm-text\">«Yes»</strong>.",
  "guide.win.s3b": "The HAPP tray icon will change colour — the connection is established.",

  "guide.mac.s1.html": "Install <strong class=\"text-nm-text\">HAPP</strong>:",
  "guide.mac.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://apps.apple.com/app/id6756943388\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
  "guide.mac.s2.html":
    "Open HAPP → <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>. The app will recognise the subscription link and add the server. The subscription updates itself.",
  "guide.mac.s3a.html":
    "Pick a server and tap <strong class=\"text-nm-text\">«Connect»</strong>. macOS will ask to allow the VPN — enter your system password.",
  "guide.mac.s3b": "The VPN icon in the menu bar means the connection is active.",

  "guide.faq.title": "Frequently asked questions",
  "guide.help.title": "Cannot connect?",
  "guide.help.subtitle": "Reach out — we will help you set it up.",
  "guide.help.btn": "Message on Telegram",

  "faq.guide.0.q": "Which app do I need to install?",
  "faq.guide.0.a":
    "Happ (recommended) or INCY — both are free and accept a Kovra subscription link. If Happ is not in your country's App Store, install INCY. Install links for each platform are in the guide above.",
  "faq.guide.1.q": "How is Happ different from INCY?",
  "faq.guide.1.a":
    "Both run on the Xray engine and take the same subscription link. We recommend Happ by default. INCY is the fallback: it is in the App Store where Happ was removed, including Russia.",
  "faq.guide.2.q": "How do I get a subscription link for my device?",
  "faq.guide.2.a":
    "In the dashboard tap «Add device» and pick the type — the system will generate a unique link. Copy it and paste it into Happ or INCY.",
  "faq.guide.3.q": "Can I use one link on multiple devices?",
  "faq.guide.3.a":
    "No. Each link works on a single device — this protects against leaks and abuse. For a second device create a new profile in the dashboard.",
  "faq.guide.4.q": "What do I do if the VPN does not connect?",
  "faq.guide.4.a":
    "Check that the link was imported in full and that the subscription is paid. If it still does not work — delete the profile in the app and add it again. If that still does not help, write to support.",
  "faq.guide.5.q": "Do I need to keep the VPN on all the time?",
  "faq.guide.5.a":
    "No. Switch it on only when needed — for streaming or games, for example. When the VPN is off, traffic goes directly through your provider with no overhead.",

  /* login / register */
  "auth.method.email": "Correo",
  "auth.method.telegram": "Telegram",
  "auth.email.label": "Correo electrónico",
  "auth.email.placeholder": "tu@ejemplo.com",
  "auth.password.label": "Contraseña",
  "auth.legal.html": "Al continuar, aceptas los <a href=\"/terms\" class=\"text-nm-accent hover:underline\" target=\"_blank\" rel=\"noopener\">Términos del servicio</a> y la <a href=\"/privacy\" class=\"text-nm-accent hover:underline\" target=\"_blank\" rel=\"noopener\">Política de privacidad</a>.",
  "auth.tg.code.copyHint": "Toca para copiar",
  "auth.tg.code.copied": "✓ ¡Copiado!",
  "auth.tg.open": "Abrir el bot",
  "auth.tg.waiting": "Esperando confirmación...",

  "login.title": "Iniciar sesión",
  "login.subtitle": "Gestiona tu suscripción y ajustes",
  "login.forgot": "¿Olvidaste?",
  "login.remember": "Recordar durante 7 días",
  "login.submit": "Entrar",
  "login.forgotSuccess": "Contraseña actualizada — inicia sesión con la nueva",
  "login.forgot.intro": "Introduce tu correo — te enviaremos un código de restablecimiento",
  "login.forgot.send": "Enviar código",
  "login.forgot.back": "← Volver al inicio de sesión",
  "login.reset.codePlaceholder": "Código de 6 dígitos",
  "login.reset.newPwPlaceholder": "Nueva contraseña (mín. 8)",
  "login.reset.submit": "Cambiar contraseña",
  "login.reset.back": "← Atrás",
  "login.tg.hint": "Obtén un código y envíalo al bot en Telegram",
  "login.tg.getCode": "Obtener código",
  "login.noAccount": "¿No tienes cuenta?",
  "login.noAccount.cta": "Crear",

  "register.title": "Crear una cuenta",
  "register.subtitle": "Cripto o tarjeta. Sin renovación automática.",
  "register.password.placeholder": "Mínimo 8 caracteres",
  "register.submit": "Continuar",
  "register.verify.title": "Revisa tu correo",
  "register.verify.codeSent.prefix": "Código enviado a",
  "register.verify.submit": "Confirmar",
  "register.verify.changeEmail": "← Cambiar correo",
  "register.verify.resend": "Reenviar",
  "register.verify.resendIn.prefix": "Reenviar en ",
  "register.verify.resendIn.suffix": "s",
  "register.tg.hint.line1": "Toca el botón — generaremos un código.",
  "register.tg.hint.line2": "Envíalo a nuestro bot en Telegram.",
  "register.tg.getCode": "Obtener código",
  "register.tg.sendHint": "Envía el código al bot:",
  "register.haveAccount": "¿Ya tienes una cuenta?",
  "register.haveAccount.cta": "Iniciar sesión",
};

const de: Dict = {
  /* common */
  "common.brand": "Kovra",
  "common.brand.latin": "Kovra",
  "common.back": "Zurück",
  "common.back.home": "← Startseite",
  "common.back.home.short": "Start",
  "common.copyright": "©",

  /* guide */
  "guide.brand": "Kovra",
  "guide.title": "Setup guide",
  "guide.subtitle": "Three steps on every platform. Pick yours.",

  "guide.common.title": "For every platform: copy your subscription link",
  "guide.common.desc.html":
    "Open the <a href=\"/dashboard\" class=\"text-nm-accent hover:underline\">Dashboard</a>, add a device of the right type — and it will get its own subscription link. Copy it with the button to the right of the link. We will paste it into the app in the next steps. Each device gets its own link — do not share it with anyone else.",

  "guide.step.install": "Install the app",
  "guide.step.import": "Import the subscription",
  "guide.step.connect": "Connect",

  "guide.android.s1.html":
    "Install <strong class=\"text-nm-text\">HAPP</strong> from <a href=\"https://play.google.com/store/apps/details?id=com.happproxy\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">Google Play</a> or the <a href=\"https://www.happ.su/main\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">HAPP website</a>.",
  "guide.android.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://github.com/INCY-DEV/incy-platforms/releases/latest\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">GitHub</a>",
  "guide.android.s2a.html":
    "Open HAPP → tap <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.android.s2b":
    "The app will recognise the copied subscription link and add the server. The subscription updates itself — when the term changes there is nothing to reconfigure.",
  "guide.android.s3a.html":
    "Pick the added server and tap the connect button. Android will ask for VPN permission — tap <strong class=\"text-nm-text\">«OK»</strong>.",
  "guide.android.s3b": "If the key icon appears in the status bar — you are connected.",

  "guide.ios.s1.html": "Install <strong class=\"text-nm-text\">HAPP</strong>:",
  "guide.ios.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://apps.apple.com/app/id6756943388\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
  "guide.ios.s2a.html":
    "Open HAPP → <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.ios.s2b":
    "Or open the copied subscription link in Safari — HAPP will offer to import it automatically. Once added, the subscription updates itself.",
  "guide.ios.s3a.html":
    "Pick the server and tap <strong class=\"text-nm-text\">«Connect»</strong>. iOS will ask to allow the VPN configuration — confirm with Face ID / Touch ID.",
  "guide.ios.s3b": "The «VPN» badge in the status bar means the connection is active.",

  "guide.win.s1.html":
    "Download <strong class=\"text-nm-text\">HAPP</strong>: <a href=\"https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe\" class=\"text-nm-accent hover:underline\">setup-Happ.x64.exe</a>",
  "guide.win.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://github.com/INCY-DEV/incy-platforms/releases/latest\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">GitHub</a>",
  "guide.win.s1c": "Run the installer → install as a regular application.",
  "guide.win.s2a.html":
    "Open HAPP → tap <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.win.s2b.html":
    "Or paste manually: <strong class=\"text-nm-text\">«+» → «Enter URL»</strong> → paste the subscription link. The subscription updates itself.",
  "guide.win.s3a.html":
    "Pick a server from the list and click the <strong class=\"text-nm-text\">connect button</strong>. Windows may ask for permission to add a VPN adapter — click <strong class=\"text-nm-text\">«Yes»</strong>.",
  "guide.win.s3b": "The HAPP tray icon will change colour — the connection is established.",

  "guide.mac.s1.html": "Install <strong class=\"text-nm-text\">HAPP</strong>:",
  "guide.mac.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://apps.apple.com/app/id6756943388\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
  "guide.mac.s2.html":
    "Open HAPP → <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>. The app will recognise the subscription link and add the server. The subscription updates itself.",
  "guide.mac.s3a.html":
    "Pick a server and tap <strong class=\"text-nm-text\">«Connect»</strong>. macOS will ask to allow the VPN — enter your system password.",
  "guide.mac.s3b": "The VPN icon in the menu bar means the connection is active.",

  "guide.faq.title": "Frequently asked questions",
  "guide.help.title": "Cannot connect?",
  "guide.help.subtitle": "Reach out — we will help you set it up.",
  "guide.help.btn": "Message on Telegram",

  "faq.guide.0.q": "Which app do I need to install?",
  "faq.guide.0.a":
    "Happ (recommended) or INCY — both are free and accept a Kovra subscription link. If Happ is not in your country's App Store, install INCY. Install links for each platform are in the guide above.",
  "faq.guide.1.q": "How is Happ different from INCY?",
  "faq.guide.1.a":
    "Both run on the Xray engine and take the same subscription link. We recommend Happ by default. INCY is the fallback: it is in the App Store where Happ was removed, including Russia.",
  "faq.guide.2.q": "How do I get a subscription link for my device?",
  "faq.guide.2.a":
    "In the dashboard tap «Add device» and pick the type — the system will generate a unique link. Copy it and paste it into Happ or INCY.",
  "faq.guide.3.q": "Can I use one link on multiple devices?",
  "faq.guide.3.a":
    "No. Each link works on a single device — this protects against leaks and abuse. For a second device create a new profile in the dashboard.",
  "faq.guide.4.q": "What do I do if the VPN does not connect?",
  "faq.guide.4.a":
    "Check that the link was imported in full and that the subscription is paid. If it still does not work — delete the profile in the app and add it again. If that still does not help, write to support.",
  "faq.guide.5.q": "Do I need to keep the VPN on all the time?",
  "faq.guide.5.a":
    "No. Switch it on only when needed — for streaming or games, for example. When the VPN is off, traffic goes directly through your provider with no overhead.",

  /* login / register */
  "auth.method.email": "E-Mail",
  "auth.method.telegram": "Telegram",
  "auth.email.label": "E-Mail",
  "auth.email.placeholder": "du@beispiel.com",
  "auth.password.label": "Passwort",
  "auth.legal.html": "Mit dem Fortfahren akzeptierst du die <a href=\"/terms\" class=\"text-nm-accent hover:underline\" target=\"_blank\" rel=\"noopener\">Nutzungsbedingungen</a> und die <a href=\"/privacy\" class=\"text-nm-accent hover:underline\" target=\"_blank\" rel=\"noopener\">Datenschutzerklärung</a>.",
  "auth.tg.code.copyHint": "Zum Kopieren tippen",
  "auth.tg.code.copied": "✓ Kopiert!",
  "auth.tg.open": "Bot öffnen",
  "auth.tg.waiting": "Warte auf Bestätigung...",

  "login.title": "Anmelden",
  "login.subtitle": "Verwalte dein Abo und deine Einstellungen",
  "login.forgot": "Vergessen?",
  "login.remember": "7 Tage merken",
  "login.submit": "Anmelden",
  "login.forgotSuccess": "Passwort aktualisiert — melde dich mit dem neuen an",
  "login.forgot.intro": "Gib deine E-Mail ein — wir senden einen Code zum Zurücksetzen",
  "login.forgot.send": "Code senden",
  "login.forgot.back": "← Zurück zur Anmeldung",
  "login.reset.codePlaceholder": "6-stelliger Code",
  "login.reset.newPwPlaceholder": "Neues Passwort (min. 8)",
  "login.reset.submit": "Passwort ändern",
  "login.reset.back": "← Zurück",
  "login.tg.hint": "Hol dir einen Code und sende ihn an den Bot auf Telegram",
  "login.tg.getCode": "Code holen",
  "login.noAccount": "Kein Konto?",
  "login.noAccount.cta": "Erstellen",

  "register.title": "Konto erstellen",
  "register.subtitle": "Krypto oder Karte. Keine automatische Verlängerung.",
  "register.password.placeholder": "Mindestens 8 Zeichen",
  "register.submit": "Weiter",
  "register.verify.title": "Prüfe deine E-Mail",
  "register.verify.codeSent.prefix": "Code gesendet an",
  "register.verify.submit": "Bestätigen",
  "register.verify.changeEmail": "← E-Mail ändern",
  "register.verify.resend": "Erneut senden",
  "register.verify.resendIn.prefix": "Erneut senden in ",
  "register.verify.resendIn.suffix": "s",
  "register.tg.hint.line1": "Tippe den Button — wir erzeugen einen Code.",
  "register.tg.hint.line2": "Sende ihn an unseren Bot auf Telegram.",
  "register.tg.getCode": "Code holen",
  "register.tg.sendHint": "Sende den Code an den Bot:",
  "register.haveAccount": "Schon ein Konto?",
  "register.haveAccount.cta": "Anmelden",
};

const fr: Dict = {
  /* common */
  "common.brand": "Kovra",
  "common.brand.latin": "Kovra",
  "common.back": "Retour",
  "common.back.home": "← Accueil",
  "common.back.home.short": "Accueil",
  "common.copyright": "©",

  /* guide */
  "guide.brand": "Kovra",
  "guide.title": "Setup guide",
  "guide.subtitle": "Three steps on every platform. Pick yours.",

  "guide.common.title": "For every platform: copy your subscription link",
  "guide.common.desc.html":
    "Open the <a href=\"/dashboard\" class=\"text-nm-accent hover:underline\">Dashboard</a>, add a device of the right type — and it will get its own subscription link. Copy it with the button to the right of the link. We will paste it into the app in the next steps. Each device gets its own link — do not share it with anyone else.",

  "guide.step.install": "Install the app",
  "guide.step.import": "Import the subscription",
  "guide.step.connect": "Connect",

  "guide.android.s1.html":
    "Install <strong class=\"text-nm-text\">HAPP</strong> from <a href=\"https://play.google.com/store/apps/details?id=com.happproxy\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">Google Play</a> or the <a href=\"https://www.happ.su/main\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">HAPP website</a>.",
  "guide.android.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://github.com/INCY-DEV/incy-platforms/releases/latest\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">GitHub</a>",
  "guide.android.s2a.html":
    "Open HAPP → tap <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.android.s2b":
    "The app will recognise the copied subscription link and add the server. The subscription updates itself — when the term changes there is nothing to reconfigure.",
  "guide.android.s3a.html":
    "Pick the added server and tap the connect button. Android will ask for VPN permission — tap <strong class=\"text-nm-text\">«OK»</strong>.",
  "guide.android.s3b": "If the key icon appears in the status bar — you are connected.",

  "guide.ios.s1.html": "Install <strong class=\"text-nm-text\">HAPP</strong>:",
  "guide.ios.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://apps.apple.com/app/id6756943388\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
  "guide.ios.s2a.html":
    "Open HAPP → <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.ios.s2b":
    "Or open the copied subscription link in Safari — HAPP will offer to import it automatically. Once added, the subscription updates itself.",
  "guide.ios.s3a.html":
    "Pick the server and tap <strong class=\"text-nm-text\">«Connect»</strong>. iOS will ask to allow the VPN configuration — confirm with Face ID / Touch ID.",
  "guide.ios.s3b": "The «VPN» badge in the status bar means the connection is active.",

  "guide.win.s1.html":
    "Download <strong class=\"text-nm-text\">HAPP</strong>: <a href=\"https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe\" class=\"text-nm-accent hover:underline\">setup-Happ.x64.exe</a>",
  "guide.win.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://github.com/INCY-DEV/incy-platforms/releases/latest\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">GitHub</a>",
  "guide.win.s1c": "Run the installer → install as a regular application.",
  "guide.win.s2a.html":
    "Open HAPP → tap <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.win.s2b.html":
    "Or paste manually: <strong class=\"text-nm-text\">«+» → «Enter URL»</strong> → paste the subscription link. The subscription updates itself.",
  "guide.win.s3a.html":
    "Pick a server from the list and click the <strong class=\"text-nm-text\">connect button</strong>. Windows may ask for permission to add a VPN adapter — click <strong class=\"text-nm-text\">«Yes»</strong>.",
  "guide.win.s3b": "The HAPP tray icon will change colour — the connection is established.",

  "guide.mac.s1.html": "Install <strong class=\"text-nm-text\">HAPP</strong>:",
  "guide.mac.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">INCY</strong> — <a href=\"https://apps.apple.com/app/id6756943388\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
  "guide.mac.s2.html":
    "Open HAPP → <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>. The app will recognise the subscription link and add the server. The subscription updates itself.",
  "guide.mac.s3a.html":
    "Pick a server and tap <strong class=\"text-nm-text\">«Connect»</strong>. macOS will ask to allow the VPN — enter your system password.",
  "guide.mac.s3b": "The VPN icon in the menu bar means the connection is active.",

  "guide.faq.title": "Frequently asked questions",
  "guide.help.title": "Cannot connect?",
  "guide.help.subtitle": "Reach out — we will help you set it up.",
  "guide.help.btn": "Message on Telegram",

  "faq.guide.0.q": "Which app do I need to install?",
  "faq.guide.0.a":
    "Happ (recommended) or INCY — both are free and accept a Kovra subscription link. If Happ is not in your country's App Store, install INCY. Install links for each platform are in the guide above.",
  "faq.guide.1.q": "How is Happ different from INCY?",
  "faq.guide.1.a":
    "Both run on the Xray engine and take the same subscription link. We recommend Happ by default. INCY is the fallback: it is in the App Store where Happ was removed, including Russia.",
  "faq.guide.2.q": "How do I get a subscription link for my device?",
  "faq.guide.2.a":
    "In the dashboard tap «Add device» and pick the type — the system will generate a unique link. Copy it and paste it into Happ or INCY.",
  "faq.guide.3.q": "Can I use one link on multiple devices?",
  "faq.guide.3.a":
    "No. Each link works on a single device — this protects against leaks and abuse. For a second device create a new profile in the dashboard.",
  "faq.guide.4.q": "What do I do if the VPN does not connect?",
  "faq.guide.4.a":
    "Check that the link was imported in full and that the subscription is paid. If it still does not work — delete the profile in the app and add it again. If that still does not help, write to support.",
  "faq.guide.5.q": "Do I need to keep the VPN on all the time?",
  "faq.guide.5.a":
    "No. Switch it on only when needed — for streaming or games, for example. When the VPN is off, traffic goes directly through your provider with no overhead.",

  /* login / register */
  "auth.method.email": "E-mail",
  "auth.method.telegram": "Telegram",
  "auth.email.label": "E-mail",
  "auth.email.placeholder": "vous@exemple.com",
  "auth.password.label": "Mot de passe",
  "auth.legal.html": "En continuant, vous acceptez les <a href=\"/terms\" class=\"text-nm-accent hover:underline\" target=\"_blank\" rel=\"noopener\">Conditions d'utilisation</a> et la <a href=\"/privacy\" class=\"text-nm-accent hover:underline\" target=\"_blank\" rel=\"noopener\">Politique de confidentialité</a>.",
  "auth.tg.code.copyHint": "Touchez pour copier",
  "auth.tg.code.copied": "✓ Copié !",
  "auth.tg.open": "Ouvrir le bot",
  "auth.tg.waiting": "En attente de confirmation...",

  "login.title": "Se connecter",
  "login.subtitle": "Gérez votre abonnement et vos réglages",
  "login.forgot": "Oublié ?",
  "login.remember": "Se souvenir pendant 7 jours",
  "login.submit": "Connexion",
  "login.forgotSuccess": "Mot de passe mis à jour — connectez-vous avec le nouveau",
  "login.forgot.intro": "Entrez votre e-mail — nous enverrons un code de réinitialisation",
  "login.forgot.send": "Envoyer le code",
  "login.forgot.back": "← Retour à la connexion",
  "login.reset.codePlaceholder": "Code à 6 chiffres",
  "login.reset.newPwPlaceholder": "Nouveau mot de passe (min. 8)",
  "login.reset.submit": "Changer le mot de passe",
  "login.reset.back": "← Retour",
  "login.tg.hint": "Obtenez un code et envoyez-le au bot sur Telegram",
  "login.tg.getCode": "Obtenir le code",
  "login.noAccount": "Pas de compte ?",
  "login.noAccount.cta": "Créer",

  "register.title": "Créer un compte",
  "register.subtitle": "Crypto ou carte. Sans renouvellement automatique.",
  "register.password.placeholder": "Minimum 8 caractères",
  "register.submit": "Continuer",
  "register.verify.title": "Vérifiez votre e-mail",
  "register.verify.codeSent.prefix": "Code envoyé à",
  "register.verify.submit": "Confirmer",
  "register.verify.changeEmail": "← Changer d'e-mail",
  "register.verify.resend": "Renvoyer",
  "register.verify.resendIn.prefix": "Renvoyer dans ",
  "register.verify.resendIn.suffix": "s",
  "register.tg.hint.line1": "Touchez le bouton — nous générons un code.",
  "register.tg.hint.line2": "Envoyez-le à notre bot sur Telegram.",
  "register.tg.getCode": "Obtenir le code",
  "register.tg.sendHint": "Envoyez le code au bot :",
  "register.haveAccount": "Vous avez déjà un compte ?",
  "register.haveAccount.cta": "Se connecter",
};

export const dict: Record<Lang, Dict> = { ru, en, es, de, fr };

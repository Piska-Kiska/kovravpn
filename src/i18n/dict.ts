// src/i18n/dict.ts
//
// Single source of truth for EN/RU translations on the public pages:
//   /, /guide, /terms, /privacy
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

export type Lang = "ru" | "en";
export const SUPPORTED_LANGS: readonly Lang[] = ["ru", "en"] as const;
export const DEFAULT_LANG: Lang = "ru";

type Dict = Readonly<Record<string, string>>;

/* ── Russian ───────────────────────────────────────── */
const ru: Dict = {
  /* common */
  "common.brand": "ПроксисВпнович",
  "common.brand.latin": "Proxysvpnovich",
  "common.back": "Назад",
  "common.back.home": "← На главную",
  "common.back.home.short": "На главную",
  "common.copyright": "©",

  /* nav (shared) */
  "nav.features": "Возможности",
  "nav.compat": "Совместимость с РФ",
  "nav.pricing": "Цены",
  "nav.faq": "FAQ",
  "nav.login": "Войти",
  "nav.signup": "Подключиться",
  "nav.terms": "Оферта",
  "nav.privacy": "Конфиденциальность",
  "nav.dashboard": "Кабинет",

  /* ── home page ────────────────────────────────── */
  "home.status.online": "Все серверы онлайн",
  "home.hero.title.line1": "Быстро. Надёжно.",
  "home.hero.title.line2": "Незаметно.",
  "home.hero.brandline.html":
    "ПроксисВпнович <span class=\"opacity-70\">(Proxysvpnovich)</span> — VPN на протоколе VLESS Reality",
  "home.hero.subtitle":
    "Защита данных в публичных сетях и низкий пинг для онлайн-игр Подключение за минуту",
  "home.hero.cta.pricing": "Смотреть цены",
  "home.hero.cta.try": "Попробовать за 10 ₽",
  "home.hero.platforms": "Все платформы",

  /* advantage strip */
  "home.adv.click": "В 1 клик",
  "home.adv.devices": "Все устройства",
  "home.adv.speed": "До 10 Гбит/с",
  "home.adv.security": "Безопасность",
  "home.adv.noads": "Без рекламы",
  "home.adv.youtube": "YouTube 4K",

  /* features section */
  "home.features.title": "Как это работает",
  "home.features.subtitle": "Три причины выбрать ПроксисВпнович",
  "home.feature.0.title": "Быстрое соединение",
  "home.feature.0.desc":
    "Выделенные серверы и оптимизированные маршруты. Минимальные задержки даже в часы пик.",
  "home.feature.1.title": "Невидимый трафик",
  "home.feature.1.desc":
    "Два протокола — VLESS Reality и Hysteria2. Маскируют трафик под обычный HTTPS, устойчивы к DPI-анализу. Если один протокол недоступен в сети — соединение продолжает работать через второй.",
  "home.feature.2.title": "Один клик",
  "home.feature.2.desc":
    "Подключение за минуту на любом устройстве. Умная маршрутизация — локальные сайты идут напрямую.",

  /* compat (RU services routing) */
  "home.compat.title": "Российские сайты работают как обычно",
  "home.compat.subtitle": "Не нужно выключать VPN перед оплатой на Озоне или входом в Сбер",
  "home.compat.feature.title": "Адаптивная маршрутизация",
  "home.compat.feature.p1":
    "Сетевые правила автоматически определяют российские ресурсы и направляют трафик к ним напрямую — через ваше обычное соединение. Зарубежные сервисы продолжают работать через защищённый канал.",
  "home.compat.feature.p2": "Без ручного переключения. В одном режиме работает всё.",
  "home.compat.li1": "Госуслуги, ФНС, Налог.ру, ЦУПИС",
  "home.compat.li2": "Сбер, Тинькофф, ВТБ, Альфа, Газпромбанк",
  "home.compat.li3": "Ozon, Wildberries, Яндекс.Маркет, Авито",
  "home.compat.li4": "Яндекс — Карты, Такси, Музыка, Кинопоиск",
  "home.compat.li5": "МТС, Билайн, Мегафон, Tele2 — личные кабинеты",
  "home.compat.li6": "Российские СМИ, видеосервисы и доставки",
  "home.compat.cat.gov.t": "Госуслуги",
  "home.compat.cat.gov.s": "ФНС, ЦУПИС",
  "home.compat.cat.banks.t": "Банки",
  "home.compat.cat.banks.s": "6+ крупных",
  "home.compat.cat.market.t": "Маркетплейсы",
  "home.compat.cat.market.s": "5+ платформ",
  "home.compat.cat.yandex.t": "Яндекс",
  "home.compat.cat.yandex.s": "Все сервисы",
  "home.compat.cat.telecom.t": "Операторы",
  "home.compat.cat.telecom.s": "Все 4 крупных",
  "home.compat.cat.media.t": "СМИ и видео",
  "home.compat.cat.media.s": "Кинопоиск, KION",
  "home.compat.footnote":
    "Правила маршрутизации основаны на открытых геоинформационных списках (sing-geosite, sing-geoip) и обновляются автоматически.",

  /* pricing */
  "home.pricing.title": "Цены",
  "home.pricing.subtitle": "Простая цена за каждое устройство",

  /* plan selector */
  "plan.badge": "Простая цена",
  "plan.unit": "/мес за устройство",
  "plan.feat.0": "До 100 устройств на аккаунт",
  "plan.feat.1": "Скорость до 10 Гбит/с",
  "plan.feat.2": "VLESS Reality шифрование",
  "plan.feat.3": "Все платформы: Windows, macOS, Android, iOS",
  "plan.cta": "Выбрать",
  "plan.note": "Пополните 10 ₽ — попробуйте VPN на 3 дня",

  /* faq */
  "home.faq.title": "Вопросы",
  "home.faq.subtitle": "Отвечаем на самые частые",
  "faq.home.0.q": "Какие устройства поддерживает ПроксисВпнович?",
  "faq.home.0.a":
    "Android, iPhone, iPad, Mac, Windows. До 100 устройств на аккаунте — каждому создаётся отдельная ссылка подписки.",
  "faq.home.1.q": "Сколько стоит VPN?",
  "faq.home.1.a":
    "100 ₽ в месяц за одно устройство. Баланс можно пополнить от 10 ₽, чтобы попробовать сервис на 3 дня перед полной оплатой.",
  "faq.home.2.q": "Нужна ли регистрация?",
  "faq.home.2.a":
    "Да, займёт около 30 секунд. Можно зарегистрироваться по email или через Telegram. После регистрации сразу доступен личный кабинет с балансом и устройствами.",
  "faq.home.3.q": "Будут ли списываться деньги автоматически?",
  "faq.home.3.a":
    "Нет. Это не подписка — платите сколько и когда хотите. Когда баланс закончится, VPN просто перестанет работать до следующего пополнения.",
  "faq.home.4.q": "Работает ли со стримингом и играми?",
  "faq.home.4.a":
    "Да. YouTube, Twitch и Netflix без ограничений, в том числе в 4K. Серверы в Европе обеспечивают низкий пинг для игр на европейских серверах.",
  "faq.home.5.q": "Что если VPN не заработает на моём устройстве?",
  "faq.home.5.a":
    "Напишите в наш бот поддержки @proxysvpn_support_bot или на support@proxysvpn.com — поможем настроить. Если подключить не получится — вернём деньги.",

  /* cta */
  "home.cta.title": "Готовы попробовать?",
  "home.cta.subtitle": "Попробовать за 10 ₽",
  "home.cta.btn": "Подключиться",

  /* ── guide page ───────────────────────────────── */
  "guide.brand": "ПроксисВпнович",
  "guide.title": "Инструкция по подключению",
  "guide.subtitle": "Подключение займёт 2–3 минуты. Выберите вашу платформу.",

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
    "Альтернатива: <strong class=\"text-nm-text\">V2RayTun</strong> — <a href=\"https://play.google.com/store/apps/details?id=com.v2raytun.android\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">Google Play</a>",
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
    "Альтернатива: <strong class=\"text-nm-text\">V2RayTun</strong> — <a href=\"https://apps.apple.com/us/app/v2raytun/id6476628951\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
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
    "Альтернатива: <strong class=\"text-nm-text\">V2RayTun</strong> — <a href=\"https://storage.v2raytun.com/v2RayTun_Setup.exe\" class=\"text-nm-accent hover:underline\">v2RayTun_Setup.exe</a>",
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
    "Альтернатива: <strong class=\"text-nm-text\">V2RayTun</strong> — <a href=\"https://apps.apple.com/us/app/v2raytun/id6476628951\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
  "guide.mac.s2.html":
    "Откройте HAPP → <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Импорт из буфера»</strong>. Приложение распознает ссылку подписки и добавит сервер. Подписка будет обновляться сама.",
  "guide.mac.s3a.html":
    "Выберите сервер, нажмите <strong class=\"text-nm-text\">«Подключить»</strong>. macOS попросит разрешить VPN — введите пароль системы.",
  "guide.mac.s3b": "Значок VPN в верхней панели = подключение активно.",

  "guide.faq.title": "Частые вопросы",
  "guide.help.title": "Не получается подключиться?",
  "guide.help.subtitle": "Напишите нам — поможем настроить за пару минут.",
  "guide.help.btn": "Написать в Telegram",

  /* faq guide */
  "faq.guide.0.q": "Какое приложение нужно установить?",
  "faq.guide.0.a":
    "Happ или V2RayTun — оба бесплатные. Happ проще для начинающих, V2RayTun даёт больше тонких настроек. Ссылки на установку для каждой платформы есть в инструкции выше.",
  "faq.guide.1.q": "Чем Happ отличается от V2RayTun?",
  "faq.guide.1.a":
    "Функционально почти одинаковые. Happ активнее обновляется и удобнее на мобильных. V2RayTun лучше работает на старых версиях Windows и Android.",
  "faq.guide.2.q": "Как получить ссылку подписки для моего устройства?",
  "faq.guide.2.a":
    "В личном кабинете нажмите «Добавить устройство» и выберите тип — система сгенерирует уникальную ссылку. Её нужно скопировать и вставить в приложение Happ или V2RayTun.",
  "faq.guide.3.q": "Можно ли использовать одну ссылку на нескольких устройствах?",
  "faq.guide.3.a":
    "Нет. Каждая ссылка работает только на одном устройстве — это защита от утечки и злоупотреблений. Для второго устройства создайте новый профиль в личном кабинете.",
  "faq.guide.4.q": "Что делать если VPN не подключается?",
  "faq.guide.4.a":
    "Проверьте что ссылка импортирована полностью и подписка оплачена. Если не помогло — удалите профиль в приложении и создайте заново. Если всё равно не работает, напишите в поддержку.",
  "faq.guide.5.q": "Нужно ли держать VPN включённым постоянно?",
  "faq.guide.5.a":
    "Нет. Включайте только когда нужно — например для стриминга или игр. Когда VPN выключен, трафик идёт напрямую через вашего провайдера без задержек.",

  /* ── terms page ───────────────────────────────── */
  "terms.h1": "Пользовательское соглашение",
  "terms.rev": "Редакция от 4 мая 2026 г.",

  "terms.s1.h": "1. Общие положения",
  "terms.s1.p1":
    "Настоящее соглашение (далее — «Соглашение») определяет условия использования сервиса «ПроксисВпнович» (далее — «Сервис»), доступного на сайте proxysvpn.com и через Telegram-бота @proxysvpn_bot.",
  "terms.s1.p2":
    "Используя Сервис — регистрируясь на сайте, запуская бота, оплачивая услуги или получая доступ к материалам — Пользователь подтверждает, что полностью ознакомился с условиями настоящего Соглашения и принимает их в полном объёме. В случае несогласия с условиями Пользователь обязан прекратить использование Сервиса.",

  "terms.s2.h": "2. Характер услуг",
  "terms.s2.p1":
    "Сервис предоставляет цифровые услуги нематериального характера: настройку и поддержку защищённого сетевого соединения, выпуск конфигураций для подключения устройств Пользователя, поддержку работоспособности инфраструктуры.",
  "terms.s2.p2":
    "Пользователь осознаёт и соглашается, что ценность услуг Сервиса заключается в стабильности работы инфраструктуры, оперативной поддержке и регулярных обновлениях, а не в эксклюзивности отдельных технических решений или конфигураций.",
  "terms.s2.p3":
    "Сервис применяет адаптивную маршрутизацию трафика на основе открытых геоинформационных списков сетевых ресурсов (sing-geosite, sing-geoip). Подключения к российским сетевым ресурсам устанавливаются напрямую через сеть Пользователя; иные подключения проходят через защищённый канал. Применение правил обеспечивает совместимость Сервиса с банковскими, государственными и торговыми сервисами Российской Федерации, требующими подключения с российских IP-адресов. Сервис не предоставляет доступ к ресурсам, доступ к которым ограничен законодательством Российской Федерации, и не направлен на обход технических средств противодействия угрозам.",

  "terms.s3.h": "3. Условия использования",
  "terms.s3.p1":
    "Услуги Сервиса предоставляются Пользователю для личного некоммерческого использования. Передача учётных данных третьим лицам, перепродажа подписки и использование Сервиса для построения собственного коммерческого VPN-сервиса запрещены.",
  "terms.s3.p2":
    "Пользователь обязуется использовать Сервис исключительно в рамках применимого законодательства и правил третьих сторон. Ответственность за законность использования Сервиса полностью возлагается на Пользователя.",

  "terms.s4.h": "4. Оплата и тарифы",
  "terms.s4.p1":
    "Услуги Сервиса оплачиваются авансом, путём пополнения внутреннего баланса аккаунта. Списание средств с баланса производится автоматически за каждый календарный день использования услуг по действующему тарифу, указанному на сайте на момент списания.",
  "terms.s4.p2":
    "При нулевом балансе доступ к услугам автоматически приостанавливается до следующего пополнения. Невостребованные средства на балансе хранятся без ограничения по сроку в пределах действия аккаунта.",

  "terms.s5.h": "5. Возврат средств",
  "terms.s5.p0":
    "Возврат денежных средств за цифровую услугу не производится, за исключением случаев, прямо предусмотренных действующим законодательством Российской Федерации и положениями настоящего раздела.",
  "terms.s5.p1":
    "В связи с цифровым нематериальным характером услуг возврат денежных средств после фактического оказания услуг не производится. Возврат возможен исключительно в случае, если услуга не была оказана по технической вине Сервиса и эта вина подтверждена обращением Пользователя в поддержку.",
  "terms.s5.p2":
    "Заявление на возврат принимается в течение 14 (четырнадцати) календарных дней с даты совершения платежа, по которому запрашивается возврат. Заявления, поступившие по истечении этого срока, не рассматриваются.",
  "terms.s5.p3":
    "Заявление направляется через Telegram-бота @proxysvpn_support_bot или на адрес support@proxysvpn.com. В обращении указываются: email или Telegram-аккаунт Пользователя, дата и сумма платежа, описание причины возврата.",
  "terms.s5.p4":
    "Сервис рассматривает заявление в течение 10 (десяти) рабочих дней с момента его поступления. О принятом решении Пользователь уведомляется тем же каналом, через который было подано обращение.",
  "terms.s5.p5":
    "При положительном решении возврат осуществляется в течение 10 (десяти) рабочих дней с даты его принятия. Фактическое поступление средств зависит от регламента банка-эмитента и платёжной системы и может занять дополнительное время.",
  "terms.s5.p6":
    "Возврат производится исключительно на те же реквизиты и тем же способом оплаты, которым был произведён исходный платёж. Возврат на иные карты, счета или кошельки не производится.",
  "terms.s5.p7":
    "Перед оплатой долгого периода Пользователю рекомендуется воспользоваться пробным периодом или минимальным платежом для проверки совместимости Сервиса с устройствами и сетью Пользователя.",
  "terms.s5.p8":
    "Пользователь подтверждает, что обязуется не инициировать процедуру возврата платежа (chargeback) через банк или платёжную систему, не обратившись предварительно в службу поддержки Сервиса. Инициирование chargeback в обход поддержки является основанием для блокировки аккаунта без возврата средств.",

  "terms.s6.h": "6. Качество услуг",
  "terms.s6.p1":
    "Сервис стремится обеспечить стабильную и быструю работу услуг, однако качество соединения зависит от множества факторов вне контроля Сервиса: характеристики и загруженность интернет-провайдера Пользователя, состояние оборудования Пользователя, работа промежуточных сетей и узлов.",
  "terms.s6.p2":
    "Услуги Сервиса предоставляются на условиях «как есть» (AS IS). Сервис не гарантирует:",
  "terms.s6.li1": "соответствие услуг ожиданиям Пользователя;",
  "terms.s6.li2": "достижение Пользователем каких-либо результатов от использования услуг;",
  "terms.s6.li3": "работу Сервиса без перерывов и ошибок;",
  "terms.s6.li4": "совместимость с конкретным оборудованием или программным обеспечением Пользователя.",
  "terms.s6.p3":
    "Решение об использовании услуг и применении полученных конфигураций Пользователь принимает самостоятельно и на свой риск.",
  "terms.s6.p4":
    "Сервис не несёт ответственности за перебои в работе услуг, вызванные действиями интернет-провайдера Пользователя, ограничениями операторов связи или региональными сетевыми сбоями, в том числе ограничениями, вводимыми уполномоченными органами на территории нахождения Пользователя.",

  "terms.s7.h": "7. Нарушения и блокировка",
  "terms.s7.p1":
    "Сервис вправе приостановить или прекратить предоставление услуг Пользователю в следующих случаях:",
  "terms.s7.li1": "нарушение условий настоящего Соглашения;",
  "terms.s7.li2": "выявление злоупотреблений со стороны Пользователя;",
  "terms.s7.li3": "требование уполномоченных органов или платёжных провайдеров;",
  "terms.s7.li4": "наличие признаков мошеннической активности с аккаунтом или платёжным средством.",
  "terms.s7.p2":
    "Сервис оставляет за собой право отказывать в обслуживании Пользователям, чьи действия создают повышенные риски для инфраструктуры Сервиса, других пользователей, платёжных провайдеров или третьих лиц. Прекращение услуг при нарушении условий не влечёт обязанности Сервиса возвращать оплаченные ранее средства.",

  "terms.s8.h": "8. Интеллектуальная собственность",
  "terms.s8.p1":
    "Все материалы, размещённые на сайте Сервиса и в Telegram-боте, охраняются законодательством об интеллектуальной собственности. Пользователю запрещается копировать, распространять, перепродавать или иным образом использовать материалы Сервиса без разрешения правообладателя.",

  "terms.s9.h": "9. Ограничение ответственности",
  "terms.s9.p1": "Сервис не несёт ответственности за:",
  "terms.s9.li1": "прямые или косвенные убытки Пользователя, включая упущенную выгоду и моральный вред;",
  "terms.s9.li2": "последствия применения Пользователем услуг и материалов Сервиса;",
  "terms.s9.li3": "действия или бездействие третьих лиц, в том числе интернет-провайдеров и платёжных систем;",
  "terms.s9.li4": "временные технические сбои, плановые работы и ограничения доступа со стороны третьих лиц.",
  "terms.s9.p2":
    "Совокупная ответственность Сервиса перед Пользователем в любом случае ограничена суммой текущего остатка баланса Пользователя.",

  "terms.s10.h": "10. Защита от злоупотреблений",
  "terms.s10.p1":
    "Сервис применяет автоматизированные средства обнаружения злоупотреблений: анализ объёма и характера трафика, частоты подключений, активности устройств. При выявлении признаков нетипичной нагрузки Сервис вправе временно ограничить скорость или приостановить подключение до выяснения обстоятельств.",
  "terms.s10.p2":
    "К нетипичной нагрузке относятся, в частности: длительное использование канала на максимальной скорости, торрент-трафик в больших объёмах, признаки использования для построения сторонних коммерческих сервисов, признаки автоматизированных или ботовых подключений.",

  "terms.s11.h": "11. Реферальная программа",
  "terms.s11.p1":
    "Пользователи могут приглашать друзей по реферальной ссылке. За каждого приглашённого, впервые пополнившего баланс, приглашающий получает единовременный бонус 50 ₽ на баланс. Количество вознаграждаемых приглашений ограничено 30 на один аккаунт. Условия реферальной программы могут быть изменены или приостановлены Сервисом в любое время.",
  "terms.s11.p2":
    "Злоупотребление реферальной программой (создание фиктивных аккаунтов, автоматизированные приглашения, саморегистрация) является основанием для аннулирования бонусов и блокировки аккаунта.",
  "terms.s11.p3":
    "Запрещается размещение реферальной ссылки и иное публичное продвижение Сервиса в российских медиа — социальных сетях, Telegram-каналах, блогах, видеоплатформах, форумах и СМИ, доступных пользователям из Российской Федерации, — а равно использование платных рекламных каналов на территории РФ. Распространение реферальной ссылки допускается только в личной переписке между знакомыми Пользователя. Сервис вправе аннулировать реферальные начисления, заблокировать аккаунт и расторгнуть договор без возврата средств в случае нарушения настоящего пункта. Ответственность, предусмотренную законодательством Российской Федерации о рекламе, несёт лицо, разместившее рекламу; Сервис не выступает заказчиком, рекламодателем и распространителем такой рекламы и не одобряет её размещение.",

  "terms.s12.h": "12. Изменение условий",
  "terms.s12.p1":
    "Сервис вправе вносить изменения в настоящее Соглашение. Обновлённая версия публикуется на сайте с указанием даты редакции. Продолжение использования Сервиса после публикации изменений означает согласие с новой редакцией.",

  "terms.s13.h": "13. Контакты",
  "terms.s13.p1.html":
    "По всем вопросам, связанным с работой Сервиса, Пользователь может обратиться через Telegram-бота <a href=\"https://t.me/proxysvpn_support_bot\" class=\"text-nm-accent hover:underline\">@proxysvpn_support_bot</a> или на адрес <a href=\"mailto:support@proxysvpn.com\" class=\"text-nm-accent hover:underline\">support@proxysvpn.com</a>.",

  "terms.related.h": "Связанные документы",
  "terms.related.p1.html":
    "<a href=\"/privacy\" class=\"text-nm-accent hover:underline\">Политика конфиденциальности</a> — как Сервис обрабатывает и защищает данные Пользователя.",

  /* ── privacy page ─────────────────────────────── */
  "privacy.h1": "Политика конфиденциальности",
  "privacy.rev": "Редакция от 4 мая 2026 г.",

  "privacy.s1.h": "1. Общие положения",
  "privacy.s1.p1":
    "Настоящая Политика конфиденциальности (далее — «Политика») регулирует порядок сбора, использования и защиты информации, которую Пользователь передаёт при использовании сервиса «ПроксисВпнович» (далее — «Сервис»), доступного на сайте proxysvpn.com и через Telegram-бота @proxysvpn_bot.",
  "privacy.s1.p2":
    "Используя Сервис, Пользователь подтверждает согласие с условиями настоящей Политики. При несогласии Пользователь обязан прекратить использование Сервиса.",

  "privacy.s2.h": "2. Какие данные мы собираем",
  "privacy.s2.p1": "Сервис собирает только минимально необходимые для работы данные:",
  "privacy.s2.li1":
    "идентификатор Telegram-аккаунта (user ID, username, имя), если регистрация выполнена через Telegram-бота;",
  "privacy.s2.li2": "адрес электронной почты, если регистрация выполнена через сайт;",
  "privacy.s2.li3":
    "технические данные подключения (IP-адрес устройства при оплате и подключении к узлу, сведения о клиенте VPN);",
  "privacy.s2.li4":
    "историю операций по балансу (пополнения, списания, реферальные начисления);",
  "privacy.s2.li5":
    "служебные журналы взаимодействия с Telegram-ботом и интерфейсом сайта.",
  "privacy.s2.p2.html":
    "Сервис <strong>не запрашивает и не хранит</strong> паспортные данные, сканы документов, фотографии, реквизиты банковских карт и иную избыточную личную информацию.",

  "privacy.s3.h": "3. Журналы трафика",
  "privacy.s3.p1":
    "Сервис не ведёт журналы посещаемых Пользователем сайтов, содержимого передаваемого трафика и историю DNS-запросов. Хранятся только агрегированные технические метрики (объём израсходованного трафика по аккаунту, время последнего подключения), необходимые для тарификации и обнаружения злоупотреблений.",

  "privacy.s4.h": "4. Как используются данные",
  "privacy.s4.p1": "Полученная информация используется исключительно для:",
  "privacy.s4.li1":
    "предоставления Пользователю заказанной услуги (выпуск конфигураций, тарификация, активация устройств);",
  "privacy.s4.li2": "идентификации Пользователя при обращении в поддержку;",
  "privacy.s4.li3": "обработки платежей через подключённых платёжных провайдеров;",
  "privacy.s4.li4":
    "защиты Сервиса от мошеннических действий и злоупотреблений (см. п. 13 Пользовательского соглашения);",
  "privacy.s4.li5": "уведомлений о состоянии аккаунта, балансе и работе Сервиса.",

  "privacy.s5.h": "5. Передача данных третьим лицам",
  "privacy.s5.p1": "Сервис не передаёт данные Пользователя третьим лицам, за исключением случаев:",
  "privacy.s5.li1":
    "передачи минимально необходимых данных платёжным провайдерам и агрегаторам для проведения оплаты;",
  "privacy.s5.li2":
    "исполнения обязательных требований законодательства, предъявленных уполномоченными органами в установленном порядке;",
  "privacy.s5.li3": "при наличии явного согласия Пользователя.",

  "privacy.s6.h": "6. Хранение и защита данных",
  "privacy.s6.p1":
    "Данные хранятся в течение срока, необходимого для достижения целей обработки, а также в течение разумного периода после прекращения использования Сервиса для целей разрешения возможных споров и исполнения требований законодательства.",
  "privacy.s6.p2":
    "Сервис применяет разумные технические и организационные меры защиты: шифрование каналов передачи данных, ограничение доступа к данным, регулярные обновления инфраструктуры. Сервис не гарантирует абсолютной безопасности информации при её передаче через сеть Интернет.",

  "privacy.s7.h": "7. Cookies и аналогичные технологии",
  "privacy.s7.p1":
    "Сайт Сервиса использует технические cookies, необходимые для работы интерфейса и поддержания сессии авторизации. Аналитические и рекламные cookies сторонних сервисов не используются.",

  "privacy.s8.h": "8. Права Пользователя",
  "privacy.s8.p1": "Пользователь вправе в любой момент:",
  "privacy.s8.li1": "запросить информацию о хранимых данных, связанных с его аккаунтом;",
  "privacy.s8.li2":
    "удалить свой аккаунт через интерфейс Сервиса или обращением в поддержку;",
  "privacy.s8.li3":
    "отозвать согласие на обработку данных, прекратив использование Сервиса.",
  "privacy.s8.p2":
    "После удаления аккаунта данные удаляются в течение 30 дней, кроме данных, хранение которых требуется законодательством или необходимо для разрешения незакрытых обязательств.",

  "privacy.s9.h": "9. Отказ от ответственности",
  "privacy.s9.p1":
    "Пользователь понимает и соглашается, что передача информации через сеть Интернет всегда сопряжена с рисками. Сервис не несёт ответственности за утрату, кражу или раскрытие данных, произошедшие по вине третьих лиц или в результате действий самого Пользователя (компрометация устройства, передача учётных данных третьим лицам и т. п.).",

  "privacy.s10.h": "10. Изменения в Политике",
  "privacy.s10.p1":
    "Сервис вправе вносить изменения в настоящую Политику. Актуальная редакция публикуется по адресу proxysvpn.com/privacy с указанием даты обновления. Продолжение использования Сервиса после публикации изменений означает согласие с новой редакцией.",

  "privacy.s11.h": "11. Контакты",
  "privacy.s11.p1.html":
    "По всем вопросам, связанным с обработкой персональных данных, Пользователь может обратиться через Telegram-бота <a href=\"https://t.me/proxysvpn_support_bot\" class=\"text-nm-accent hover:underline\">@proxysvpn_support_bot</a> или на адрес <a href=\"mailto:support@proxysvpn.com\" class=\"text-nm-accent hover:underline\">support@proxysvpn.com</a>.",

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
  "register.subtitle": "Пополните 10 ₽ — 3 дня VPN",
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

/* ── English ───────────────────────────────────────── */
const en: Dict = {
  /* common */
  "common.brand": "Proxysvpnovich",
  "common.brand.latin": "Proxysvpnovich",
  "common.back": "Back",
  "common.back.home": "← Home",
  "common.back.home.short": "Home",
  "common.copyright": "©",

  /* nav */
  "nav.features": "Features",
  "nav.compat": "RU compatibility",
  "nav.pricing": "Pricing",
  "nav.faq": "FAQ",
  "nav.login": "Sign in",
  "nav.signup": "Get started",
  "nav.terms": "Terms",
  "nav.privacy": "Privacy",
  "nav.dashboard": "Dashboard",

  /* home */
  "home.status.online": "All servers online",
  "home.hero.title.line1": "Fast. Reliable.",
  "home.hero.title.line2": "Invisible.",
  "home.hero.brandline.html":
    "Proxysvpnovich <span class=\"opacity-70\">(ПроксисВпнович)</span> — VPN built on the VLESS Reality protocol",
  "home.hero.subtitle":
    "Data protection on public networks and low ping for online games. Connect in under a minute.",
  "home.hero.cta.pricing": "See pricing",
  "home.hero.cta.try": "Try it for 10 ₽",
  "home.hero.platforms": "Every platform",

  "home.adv.click": "One-click",
  "home.adv.devices": "All devices",
  "home.adv.speed": "Up to 10 Gbit/s",
  "home.adv.security": "Strong security",
  "home.adv.noads": "No ads",
  "home.adv.youtube": "YouTube 4K",

  "home.features.title": "How it works",
  "home.features.subtitle": "Three reasons to choose Proxysvpnovich",
  "home.feature.0.title": "Fast connection",
  "home.feature.0.desc":
    "Dedicated servers and optimised routing. Minimal latency even at peak hours.",
  "home.feature.1.title": "Invisible traffic",
  "home.feature.1.desc":
    "Two protocols — VLESS Reality and Hysteria2. Both disguise traffic as ordinary HTTPS, resilient to DPI analysis. If one protocol is unavailable on the network, the connection stays up via the other.",
  "home.feature.2.title": "One click",
  "home.feature.2.desc":
    "Connect in under a minute on any device. Smart routing — local sites bypass the tunnel.",

  /* compat (RU services routing) */
  "home.compat.title": "Russian sites just work",
  "home.compat.subtitle": "No need to disable the VPN to pay on a marketplace or log into a bank",
  "home.compat.feature.title": "Adaptive routing",
  "home.compat.feature.p1":
    "Network rules detect Russian resources automatically and route traffic to them directly via your normal connection. Foreign services keep working through the secure tunnel.",
  "home.compat.feature.p2": "No manual switching. One mode covers everything.",
  "home.compat.li1": "Gosuslugi, FNS, Nalog.ru, TsUPIS",
  "home.compat.li2": "Sber, Tinkoff, VTB, Alfa, Gazprombank",
  "home.compat.li3": "Ozon, Wildberries, Yandex.Market, Avito",
  "home.compat.li4": "Yandex — Maps, Taxi, Music, Kinopoisk",
  "home.compat.li5": "MTS, Beeline, Megafon, Tele2 — personal accounts",
  "home.compat.li6": "Russian media, video services and delivery apps",
  "home.compat.cat.gov.t": "Gov services",
  "home.compat.cat.gov.s": "FNS, TsUPIS",
  "home.compat.cat.banks.t": "Banks",
  "home.compat.cat.banks.s": "6+ major",
  "home.compat.cat.market.t": "Marketplaces",
  "home.compat.cat.market.s": "5+ platforms",
  "home.compat.cat.yandex.t": "Yandex",
  "home.compat.cat.yandex.s": "All services",
  "home.compat.cat.telecom.t": "Telecom",
  "home.compat.cat.telecom.s": "All 4 major",
  "home.compat.cat.media.t": "Media & video",
  "home.compat.cat.media.s": "Kinopoisk, KION",
  "home.compat.footnote":
    "Routing rules are based on open geoinformation lists (sing-geosite, sing-geoip) and update automatically.",

  "home.pricing.title": "Pricing",
  "home.pricing.subtitle": "One simple price per device",

  "plan.badge": "Simple pricing",
  "plan.unit": "/mo per device",
  "plan.feat.0": "Up to 100 devices per account",
  "plan.feat.1": "Speeds up to 10 Gbit/s",
  "plan.feat.2": "VLESS Reality encryption",
  "plan.feat.3": "All platforms: Windows, macOS, Android, iOS",
  "plan.cta": "Choose plan",
  "plan.note": "Top up 10 ₽ — try the VPN for 3 days",

  "home.faq.title": "Questions",
  "home.faq.subtitle": "Answers to the most common ones",
  "faq.home.0.q": "Which devices does Proxysvpnovich support?",
  "faq.home.0.a":
    "Android, iPhone, iPad, Mac, Windows. Up to 100 devices per account — each gets its own subscription link.",
  "faq.home.1.q": "How much does the VPN cost?",
  "faq.home.1.a":
    "100 ₽ per month per device. You can top up from 10 ₽ to try the service for 3 days before paying for a full month.",
  "faq.home.2.q": "Do I need to register?",
  "faq.home.2.a":
    "Yes, it takes about 30 seconds. You can sign up by email or via Telegram. After registration the dashboard with your balance and devices is immediately available.",
  "faq.home.3.q": "Will I be charged automatically?",
  "faq.home.3.a":
    "No. This is not a subscription — pay as much and as often as you want. When the balance runs out, the VPN simply stops working until the next top-up.",
  "faq.home.4.q": "Does it work for streaming and gaming?",
  "faq.home.4.a":
    "Yes. YouTube, Twitch and Netflix without limits, including 4K. European servers provide low ping for games on European servers.",
  "faq.home.5.q": "What if the VPN does not work on my device?",
  "faq.home.5.a":
    "Reach out via our support bot @proxysvpn_support_bot or at support@proxysvpn.com — we will help you set it up. If we cannot get it working, we refund the money.",

  "home.cta.title": "Ready to try?",
  "home.cta.subtitle": "Try it for 10 ₽",
  "home.cta.btn": "Get started",

  /* guide */
  "guide.brand": "Proxysvpnovich",
  "guide.title": "Setup guide",
  "guide.subtitle": "Setup takes 2–3 minutes. Pick your platform.",

  "guide.common.title": "For every platform: copy your subscription link",
  "guide.common.desc.html":
    "Open the <a href=\"/dashboard\" class=\"text-nm-accent hover:underline\">Dashboard</a>, add a device of the right type — and it will get its own subscription link. Copy it with the button to the right of the link. We will paste it into the app in the next steps. Each device gets its own link — do not share it with anyone else.",

  "guide.step.install": "Install the app",
  "guide.step.import": "Import the subscription",
  "guide.step.connect": "Connect",

  "guide.android.s1.html":
    "Install <strong class=\"text-nm-text\">HAPP</strong> from <a href=\"https://play.google.com/store/apps/details?id=com.happproxy\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">Google Play</a> or the <a href=\"https://www.happ.su/main\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">HAPP website</a>.",
  "guide.android.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">V2RayTun</strong> — <a href=\"https://play.google.com/store/apps/details?id=com.v2raytun.android\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">Google Play</a>",
  "guide.android.s2a.html":
    "Open HAPP → tap <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>.",
  "guide.android.s2b":
    "The app will recognise the copied subscription link and add the server. The subscription updates itself — when the term changes there is nothing to reconfigure.",
  "guide.android.s3a.html":
    "Pick the added server and tap the connect button. Android will ask for VPN permission — tap <strong class=\"text-nm-text\">«OK»</strong>.",
  "guide.android.s3b": "If the key icon appears in the status bar — you are connected.",

  "guide.ios.s1.html": "Install <strong class=\"text-nm-text\">HAPP</strong>:",
  "guide.ios.s1b.html":
    "Alternative: <strong class=\"text-nm-text\">V2RayTun</strong> — <a href=\"https://apps.apple.com/us/app/v2raytun/id6476628951\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
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
    "Alternative: <strong class=\"text-nm-text\">V2RayTun</strong> — <a href=\"https://storage.v2raytun.com/v2RayTun_Setup.exe\" class=\"text-nm-accent hover:underline\">v2RayTun_Setup.exe</a>",
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
    "Alternative: <strong class=\"text-nm-text\">V2RayTun</strong> — <a href=\"https://apps.apple.com/us/app/v2raytun/id6476628951\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-nm-accent hover:underline\">App Store</a>",
  "guide.mac.s2.html":
    "Open HAPP → <strong class=\"text-nm-text\">«+»</strong> → <strong class=\"text-nm-text\">«Import from clipboard»</strong>. The app will recognise the subscription link and add the server. The subscription updates itself.",
  "guide.mac.s3a.html":
    "Pick a server and tap <strong class=\"text-nm-text\">«Connect»</strong>. macOS will ask to allow the VPN — enter your system password.",
  "guide.mac.s3b": "The VPN icon in the menu bar means the connection is active.",

  "guide.faq.title": "Frequently asked questions",
  "guide.help.title": "Cannot connect?",
  "guide.help.subtitle": "Reach out — we will help you set it up in a couple of minutes.",
  "guide.help.btn": "Message on Telegram",

  "faq.guide.0.q": "Which app do I need to install?",
  "faq.guide.0.a":
    "Happ or V2RayTun — both are free. Happ is easier for beginners, V2RayTun gives you more fine-grained settings. Install links for each platform are in the guide above.",
  "faq.guide.1.q": "How is Happ different from V2RayTun?",
  "faq.guide.1.a":
    "Functionally they are nearly identical. Happ updates more actively and is more convenient on mobile. V2RayTun works better on older Windows and Android versions.",
  "faq.guide.2.q": "How do I get a subscription link for my device?",
  "faq.guide.2.a":
    "In the dashboard tap «Add device» and pick the type — the system will generate a unique link. Copy it and paste it into Happ or V2RayTun.",
  "faq.guide.3.q": "Can I use one link on multiple devices?",
  "faq.guide.3.a":
    "No. Each link works on a single device — this protects against leaks and abuse. For a second device create a new profile in the dashboard.",
  "faq.guide.4.q": "What do I do if the VPN does not connect?",
  "faq.guide.4.a":
    "Check that the link was imported in full and that the subscription is paid. If it still does not work — delete the profile in the app and add it again. If that still does not help, write to support.",
  "faq.guide.5.q": "Do I need to keep the VPN on all the time?",
  "faq.guide.5.a":
    "No. Switch it on only when needed — for streaming or games, for example. When the VPN is off, traffic goes directly through your provider with no overhead.",

  /* terms */
  "terms.h1": "Terms of Service",
  "terms.rev": "Revision dated May 4, 2026",

  "terms.s1.h": "1. General provisions",
  "terms.s1.p1":
    "These Terms of Service (the «Agreement») define the conditions for using the «Proxysvpnovich» service (the «Service»), available at proxysvpn.com and via the Telegram bot @proxysvpn_bot.",
  "terms.s1.p2":
    "By using the Service — by registering on the website, starting the bot, paying for services or accessing materials — the User confirms that they have read these Terms in full and accept them in their entirety. If the User does not agree, they must stop using the Service.",

  "terms.s2.h": "2. Nature of the services",
  "terms.s2.p1":
    "The Service provides intangible digital services: setup and maintenance of a secure network connection, issuance of configurations for the User's devices, and ongoing infrastructure support.",
  "terms.s2.p2":
    "The User acknowledges that the value of the Service lies in stable infrastructure operation, prompt support and regular updates rather than in the exclusivity of any particular technical solution or configuration.",
  "terms.s2.p3":
    "The Service applies adaptive traffic routing based on open geoinformation lists of network resources (sing-geosite, sing-geoip). Connections to Russian network resources are established directly through the User's network; other connections pass through the secure tunnel. These rules ensure the Service's compatibility with banking, government and retail services of the Russian Federation that require a Russian IP address. The Service does not provide access to resources whose access is restricted by the laws of the Russian Federation and is not aimed at bypassing technical means of countering threats.",

  "terms.s3.h": "3. Conditions of use",
  "terms.s3.p1":
    "Services are provided to the User for personal, non-commercial use. Sharing credentials with third parties, reselling subscriptions and using the Service to build a competing commercial VPN service are prohibited.",
  "terms.s3.p2":
    "The User agrees to use the Service strictly within the bounds of applicable law and the rules of third parties. Responsibility for the lawful use of the Service rests entirely with the User.",

  "terms.s4.h": "4. Payment and pricing",
  "terms.s4.p1":
    "Services are paid for in advance by topping up the account's internal balance. The balance is debited automatically for each calendar day of use at the rate published on the website at the moment of debit.",
  "terms.s4.p2":
    "When the balance reaches zero, access is suspended automatically until the next top-up. Unused funds remain on the balance without an expiry period for as long as the account is active.",

  "terms.s5.h": "5. Refunds",
  "terms.s5.p0":
    "Refunds for digital services are not issued, except in cases expressly provided for by the applicable laws of the Russian Federation and by the provisions of this section.",
  "terms.s5.p1":
    "Given the intangible digital nature of the services, refunds are not issued after services have been actually delivered. A refund is only possible where the service was not delivered through a technical fault of the Service, confirmed by the User contacting support.",
  "terms.s5.p2":
    "A refund request must be submitted within 14 (fourteen) calendar days of the payment to which it relates. Requests received after that period will not be considered.",
  "terms.s5.p3":
    "Requests are submitted via the Telegram bot @proxysvpn_support_bot or to support@proxysvpn.com. The request must include the User's email or Telegram account, the date and amount of the payment, and the reason for the refund.",
  "terms.s5.p4":
    "The Service reviews each request within 10 (ten) business days of receipt. The User is notified of the decision through the same channel they used to file the request.",
  "terms.s5.p5":
    "If approved, the refund is issued within 10 (ten) business days of the decision. The actual receipt of funds depends on the issuing bank and payment system rules and may take additional time.",
  "terms.s5.p6":
    "Refunds are issued exclusively to the same details and via the same payment method as the original payment. Refunds to other cards, accounts or wallets are not made.",
  "terms.s5.p7":
    "Before paying for a longer period, Users are encouraged to use the trial period or a minimum payment to confirm the Service is compatible with their devices and network.",
  "terms.s5.p8":
    "The User agrees not to initiate a chargeback through their bank or payment system without first contacting Service support. A chargeback initiated outside the support channel is grounds for account suspension without refund.",

  "terms.s6.h": "6. Service quality",
  "terms.s6.p1":
    "The Service strives to provide stable and fast performance, but connection quality depends on many factors outside the Service's control: the User's ISP capacity and load, the User's hardware, and the operation of intermediate networks and nodes.",
  "terms.s6.p2": "Services are provided on an «AS IS» basis. The Service does not guarantee:",
  "terms.s6.li1": "that the services will meet the User's expectations;",
  "terms.s6.li2": "that the User will achieve any specific outcome from using the services;",
  "terms.s6.li3": "uninterrupted or error-free operation;",
  "terms.s6.li4": "compatibility with any particular hardware or software the User may have.",
  "terms.s6.p3":
    "The decision to use the services and apply the issued configurations is made by the User independently and at their own risk.",
  "terms.s6.p4":
    "The Service is not liable for service interruptions caused by the User's internet provider, by restrictions imposed by telecom operators, or by regional network disruptions, including restrictions imposed by competent authorities in the User's location.",

  "terms.s7.h": "7. Violations and suspension",
  "terms.s7.p1": "The Service may suspend or terminate services to the User in the following cases:",
  "terms.s7.li1": "violation of these Terms;",
  "terms.s7.li2": "detected abuse by the User;",
  "terms.s7.li3": "lawful demands from authorities or payment providers;",
  "terms.s7.li4": "signs of fraudulent activity on the account or payment instrument.",
  "terms.s7.p2":
    "The Service reserves the right to refuse service to Users whose actions create elevated risk for the Service's infrastructure, other users, payment providers or third parties. Termination for violations does not oblige the Service to refund previously paid amounts.",

  "terms.s8.h": "8. Intellectual property",
  "terms.s8.p1":
    "All materials published on the Service's website and Telegram bot are protected by intellectual-property law. The User may not copy, distribute, resell or otherwise use these materials without the rights-holder's permission.",

  "terms.s9.h": "9. Limitation of liability",
  "terms.s9.p1": "The Service is not liable for:",
  "terms.s9.li1":
    "direct or indirect losses of the User, including lost profit and moral damage;",
  "terms.s9.li2":
    "consequences of the User's use of the services and materials;",
  "terms.s9.li3":
    "the actions or inactions of third parties, including ISPs and payment systems;",
  "terms.s9.li4":
    "temporary technical outages, scheduled maintenance and access restrictions imposed by third parties.",
  "terms.s9.p2":
    "The Service's aggregate liability to the User is in any event limited to the User's current balance.",

  "terms.s10.h": "10. Anti-abuse",
  "terms.s10.p1":
    "The Service uses automated abuse-detection: analysis of traffic volume and pattern, connection frequency and device activity. Where atypical load is detected, the Service may temporarily throttle speed or pause the connection while the situation is reviewed.",
  "terms.s10.p2":
    "Atypical load includes, in particular: prolonged use of the channel at peak speed, large-scale torrent traffic, signs of use to build third-party commercial services, and signs of automated or bot-driven connections.",

  "terms.s11.h": "11. Referral programme",
  "terms.s11.p1":
    "Users may invite friends via a referral link. For each invitee whose first top-up succeeds, the referrer receives a one-off 50 ₽ bonus on their balance. Eligible invitations are capped at 30 per account. Referral programme terms may be changed or paused at any time.",
  "terms.s11.p2":
    "Abuse of the referral programme (creating fake accounts, automated invitations, self-registration) is grounds to cancel bonuses and suspend the account.",
  "terms.s11.p3":
    "Posting the referral link or otherwise publicly promoting the Service in Russian-language media — social networks, Telegram channels, blogs, video platforms, forums and outlets accessible from the Russian Federation — and using paid advertising channels in the territory of the Russian Federation, is prohibited. The referral link may only be shared in private correspondence between the User's personal contacts. Violations are grounds to cancel referral credits, suspend the account and terminate the agreement without refund. Liability under Russian advertising law lies with the person who placed the advertising; the Service is not the customer, advertiser or distributor of such advertising and does not endorse its placement.",

  "terms.s12.h": "12. Changes to the Terms",
  "terms.s12.p1":
    "The Service may amend these Terms. The updated version is published on the website with the revision date. Continued use of the Service after publication constitutes acceptance of the new revision.",

  "terms.s13.h": "13. Contacts",
  "terms.s13.p1.html":
    "For any question regarding the Service, the User may reach out via the Telegram bot <a href=\"https://t.me/proxysvpn_support_bot\" class=\"text-nm-accent hover:underline\">@proxysvpn_support_bot</a> or to <a href=\"mailto:support@proxysvpn.com\" class=\"text-nm-accent hover:underline\">support@proxysvpn.com</a>.",

  "terms.related.h": "Related documents",
  "terms.related.p1.html":
    "<a href=\"/privacy\" class=\"text-nm-accent hover:underline\">Privacy Policy</a> — how the Service handles and protects User data.",

  /* privacy */
  "privacy.h1": "Privacy Policy",
  "privacy.rev": "Revision dated May 4, 2026",

  "privacy.s1.h": "1. General provisions",
  "privacy.s1.p1":
    "This Privacy Policy (the «Policy») governs the collection, use and protection of information that the User provides while using the «Proxysvpnovich» service (the «Service»), available at proxysvpn.com and via the Telegram bot @proxysvpn_bot.",
  "privacy.s1.p2":
    "By using the Service, the User confirms acceptance of this Policy. If the User does not agree, they must stop using the Service.",

  "privacy.s2.h": "2. What data we collect",
  "privacy.s2.p1": "The Service collects only the minimum data needed to operate:",
  "privacy.s2.li1":
    "Telegram account identifiers (user ID, username, name) if the User signed up via the Telegram bot;",
  "privacy.s2.li2": "an email address if the User signed up on the website;",
  "privacy.s2.li3":
    "technical connection data (the device's IP address at payment and at node connection time, VPN client information);",
  "privacy.s2.li4":
    "the balance ledger (top-ups, debits, referral credits);",
  "privacy.s2.li5":
    "service logs of interaction with the Telegram bot and website interface.",
  "privacy.s2.p2.html":
    "The Service <strong>does not request and does not store</strong> passport details, document scans, photos, bank card details or other excessive personal information.",

  "privacy.s3.h": "3. Traffic logs",
  "privacy.s3.p1":
    "The Service does not log the websites the User visits, the contents of transmitted traffic or the history of DNS requests. Only aggregated technical metrics are stored (account-level traffic volume, last connection time) needed for billing and abuse detection.",

  "privacy.s4.h": "4. How the data is used",
  "privacy.s4.p1": "The collected information is used solely to:",
  "privacy.s4.li1":
    "deliver the requested service (issue configurations, billing, device activation);",
  "privacy.s4.li2": "identify the User when they contact support;",
  "privacy.s4.li3": "process payments through connected payment providers;",
  "privacy.s4.li4":
    "protect the Service from fraud and abuse (see clause 13 of the Terms of Service);",
  "privacy.s4.li5":
    "send notifications about account state, balance and Service operation.",

  "privacy.s5.h": "5. Sharing data with third parties",
  "privacy.s5.p1": "The Service does not share User data with third parties, except where:",
  "privacy.s5.li1":
    "the minimum data needed for payment processing is shared with payment providers and aggregators;",
  "privacy.s5.li2":
    "the Service must comply with mandatory legal demands from authorities made in due process;",
  "privacy.s5.li3": "the User has given explicit consent.",

  "privacy.s6.h": "6. Storage and protection of data",
  "privacy.s6.p1":
    "Data is retained for as long as needed to fulfil the purposes of processing, plus a reasonable period after the User stops using the Service in order to resolve potential disputes and comply with legal requirements.",
  "privacy.s6.p2":
    "The Service applies reasonable technical and organisational protections: encryption of data in transit, access restrictions, regular infrastructure updates. The Service does not warrant absolute security of information transmitted over the public Internet.",

  "privacy.s7.h": "7. Cookies and similar technologies",
  "privacy.s7.p1":
    "The Service's website uses technical cookies needed for the interface and to maintain authenticated sessions. Third-party analytics or advertising cookies are not used.",

  "privacy.s8.h": "8. User rights",
  "privacy.s8.p1": "At any time the User may:",
  "privacy.s8.li1": "request information about stored data linked to their account;",
  "privacy.s8.li2":
    "delete their account through the Service interface or by contacting support;",
  "privacy.s8.li3":
    "withdraw consent to processing by ceasing to use the Service.",
  "privacy.s8.p2":
    "After account deletion, data is removed within 30 days, except for data whose retention is required by law or needed to resolve outstanding obligations.",

  "privacy.s9.h": "9. Disclaimer",
  "privacy.s9.p1":
    "The User understands that transmitting information over the Internet always carries risk. The Service is not liable for the loss, theft or disclosure of data caused by third parties or by the User's own actions (a compromised device, sharing credentials, and similar).",

  "privacy.s10.h": "10. Changes to the Policy",
  "privacy.s10.p1":
    "The Service may amend this Policy. The current version is published at proxysvpn.com/privacy with the revision date. Continued use of the Service after publication constitutes acceptance of the new revision.",

  "privacy.s11.h": "11. Contacts",
  "privacy.s11.p1.html":
    "For any question regarding the processing of personal data, the User may reach out via the Telegram bot <a href=\"https://t.me/proxysvpn_support_bot\" class=\"text-nm-accent hover:underline\">@proxysvpn_support_bot</a> or to <a href=\"mailto:support@proxysvpn.com\" class=\"text-nm-accent hover:underline\">support@proxysvpn.com</a>.",

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
  "register.subtitle": "Top up 10 ₽ — 3 days of VPN",
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

export const dict: Record<Lang, Dict> = { ru, en };

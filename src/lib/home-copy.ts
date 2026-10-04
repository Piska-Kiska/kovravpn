// src/lib/home-copy.ts
//
// The landing page's copy in the five site languages. Plain data, so the
// client view and the server page (the FAQPage markup) read the same
// strings. Typed with exact keys: a language that misses or invents one does
// not compile.
//
// Kovra's prices are never typed here: a string that quotes one carries a
// {placeholder} that the view fills from src/lib/plan-prices.ts, the numbers
// the server charges (see homeVars below). {n} and {ref} are filled per term
// in the view.
//
// The hook of the first screen is a question people ask when their VPN stops
// connecting, answered with what Kovra does (VLESS + REALITY looks like a
// visit to an ordinary website) and nothing it cannot promise: no network is
// guaranteed, BitTorrent is blocked, China and Iran were never tested. The
// Russian copy keeps to the brand rule of avoiding the word "VPN".

import type { Lang } from "@/i18n/dict";
import type { FaqItem } from "./faq-items";
import { DEVICE_ADDON_PRICE, PLAN_PRICES, REFUND_WINDOW_DAYS, usd } from "./plan-prices";

const en = {
  nav_features: "Features", nav_pricing: "Pricing", nav_faq: "FAQ", nav_guides: "Guides",
  nav_signin: "Sign in", nav_get: "Get Started",
  badge: "VPN blocked on this network?",
  hero_t1: "To the network,", hero_t2: "it's just a website.",
  hero_sub: "Kovra runs on VLESS + REALITY. Sign up with Telegram, pay in USDT or by card, import one link into Happ or INCY.",
  hero_cta1: "Get Kovra - from {from_price}/mo", hero_cta2: "Learn more",
  b1_k: "Protocol", b1_t: "Blends in.",
  b1_b: "REALITY makes the connection look like a visit to an ordinary website. Networks that drop WireGuard or OpenVPN see ordinary HTTPS.",
  b2_k: "Privacy", b2_t: "Only what billing needs.",
  b2_b: "We keep traffic totals and last-connection time. Everything we store is listed in our Privacy Policy.",
  b3_k: "Devices", b3_t: "Your devices.",
  b3_b: "Up to 3 devices: iPhone, Android, Mac, Windows or TV. Extra devices {addon} per 30 days.",
  b4_k: "Payments", b4_t: "Crypto & cards.",
  b4_b: "Pay in crypto or by card. Prices are in USD; a card may be charged in another currency, and crypto network fees are added at checkout.",
  how_kicker: "How it works", how_h2: "Sign up, pay, import one link.",
  how_lead: "Create an account, choose a plan and import your link into Happ or INCY.",
  step1_t: "Create your account", step1_b: "With Telegram (no email needed) or with email.",
  step2_t: "Choose a plan", step2_b: "1, 6 or 12 months, paid once, by crypto or card.",
  step3_t: "Connect", step3_b: "Import your link into Happ or INCY and tap connect.",
  where_kicker: "Locations", where_h2: "Where you can connect.",
  where_lead: "One link per device. When we add a location, it appears in your app at the next refresh.",
  limits_h: "Honest about limits.",
  limits_b: "No protocol works on every network. BitTorrent is blocked on all servers. We haven't tested Kovra from inside China or Iran.",
  price_kicker: "Pricing", price_h2: "One plan. Pick your term.",
  price_honest: "Honest pricing",
  plan_permo: "/mo", plan_devices: "up to 3 devices", plan_devices1: "1 device",
  term1: "1 month", term6: "6 months", term12: "1 year", badge_best: "Best value",
  plan_once1: "paid once for 1 month", plan_oncen: "paid once for {n} months",
  plan_savings: "The discount compares the term price with paying monthly for the same period.",
  plan_no_renew: "Nothing renews automatically.", plan_vs: "vs {ref} for {n} monthly payments",
  price_meta: "Pay once for 1, 6 or 12 months. Access ends when the term ends; nothing renews automatically.",
  plan1: "Every location in the app", plan2: "No data caps (fair use applies)", plan3: "Telegram signup, no email needed",
  plan4: "Up to 3 devices", plan4_one: "1 device", plan5: "Pay with crypto or card", price_btn: "Get started",
  faq_kicker: "FAQ", faq_h2: "Questions, answered.",
  faq_blocked_q: "Why does my VPN get blocked on some networks?",
  faq_blocked_a: "Many networks recognise common VPN protocols and drop them. Kovra uses VLESS + REALITY, which looks like a visit to an ordinary website, so it gets through on many networks that block WireGuard or OpenVPN. No protocol is guaranteed on every network.",
  faq_email_q: "Do I need an email to sign up?",
  faq_email_a: "No, if you sign up with Telegram. The website signup uses email and a password.",
  faq_pay_q: "How do I pay?",
  faq_pay_a: "By card, or in crypto: USDT, BTC, ETH and more, with the coin chosen on the payment page. Crypto activates after network confirmation, usually 5-30 minutes, and network fees are added. Three devices cost {p3_12} once for 12 months ({p3_12_mo}/mo); one device costs {p1_12} for 12 months.",
  faq_apps_q: "Which apps work with Kovra?",
  faq_apps_a: "Happ (recommended) or INCY on iPhone, Android, Mac and Windows. You import one link per device.",
  faq_devices_q: "How many devices can I use?",
  faq_devices_a: "A plan covers 1 or 3 devices. Each extra device costs {addon} per 30 days.",
  faq_logs_q: "Do you keep logs?",
  faq_logs_a: "We keep what billing needs: per-account traffic totals and last-connection time, plus the data listed in our Privacy Policy.",
  faq_renew_q: "Does Kovra renew automatically?",
  faq_renew_a: "No. You pay once for 1, 6 or 12 months, and access ends when the term ends.",
  faq_refund_q: "Can I get a refund?",
  faq_refund_a: "Payments are generally non-refundable once a plan is active. A refund is considered only if the service was not delivered because of a fault on our side and you contact support within {refund_days} days of payment (Terms, section 5).",
  faq_torrents_q: "Can I use torrents?",
  faq_torrents_a: "No. BitTorrent is blocked on all Kovra servers.",
  band_h2: "Take back your privacy.", band_p: "Up to 3 devices for {p3_12} a year, paid once. Nothing renews automatically.", band_btn: "Get Kovra",
  foot_terms: "Terms", foot_privacy: "Privacy", foot_vless: "VLESS subscription", foot_crypto: "Pay with crypto", copyright: "© 2026 Kovra",
};

export type HomeDict = typeof en;
export type HomeKey = keyof HomeDict;

const ru: HomeDict = {
  nav_features: "Возможности", nav_pricing: "Цена", nav_faq: "Вопросы", nav_guides: "Гайды",
  nav_signin: "Войти", nav_get: "Подключить",
  badge: "Сеть режет соединение?",
  hero_t1: "Для сети", hero_t2: "это просто сайт.",
  hero_sub: "Kovra работает на VLESS + REALITY. Регистрация через Telegram, оплата в USDT или картой, одна ссылка в Happ или INCY.",
  hero_cta1: "Подключить - от {from_price}/мес", hero_cta2: "Подробнее",
  b1_k: "Протокол", b1_t: "Не выделяется.",
  b1_b: "REALITY делает соединение похожим на заход на обычный сайт. Сети, которые отбрасывают WireGuard или OpenVPN, видят обычный HTTPS.",
  b2_k: "Приватность", b2_t: "Только то, что нужно для оплаты.",
  b2_b: "Мы храним объём трафика и время последнего подключения. Всё, что мы храним, перечислено в Политике конфиденциальности.",
  b3_k: "Устройства", b3_t: "Ваши устройства.",
  b3_b: "До 3 устройств: iPhone, Android, Mac, Windows или ТВ. Дополнительное устройство: {addon} за 30 дней.",
  b4_k: "Оплата", b4_t: "Крипта и карты.",
  b4_b: "Оплата криптой или картой. Цены в долларах; с карты могут списать в другой валюте, а сетевая комиссия за крипту добавляется при оплате.",
  how_kicker: "Как это работает", how_h2: "Регистрация, оплата, одна ссылка.",
  how_lead: "Создайте аккаунт, выберите тариф и добавьте ссылку в Happ или INCY.",
  step1_t: "Создай аккаунт", step1_b: "Через Telegram (без почты) или по email.",
  step2_t: "Выберите тариф", step2_b: "1, 6 или 12 месяцев, разовая оплата криптой или картой.",
  step3_t: "Подключись", step3_b: "Добавьте ссылку в Happ или INCY и нажмите «подключить».",
  where_kicker: "Локации", where_h2: "Куда можно подключиться.",
  where_lead: "Одна ссылка на устройство. Когда мы добавляем локацию, она появляется в приложении при следующем обновлении.",
  limits_h: "Честно об ограничениях.",
  limits_b: "Ни один протокол не работает в каждой сети. Торренты (BitTorrent) на всех серверах отключены. Из Китая и Ирана мы Kovra не проверяли.",
  price_kicker: "Цена", price_h2: "Один тариф. Выбери срок.",
  price_honest: "Честно о цене",
  plan_permo: "/мес", plan_devices: "до 3 устройств", plan_devices1: "1 устройство",
  term1: "1 месяц", term6: "6 месяцев", term12: "1 год", badge_best: "Лучшая цена",
  plan_once1: "разово за 1 месяц", plan_oncen: "разово за {n} мес.",
  plan_savings: "Скидка: сравнение цены срока с помесячной оплатой за тот же период.",
  plan_no_renew: "Автопродления нет.", plan_vs: "против {ref} при помесячной оплате {n} мес.",
  price_meta: "Оплата разово за 1, 6 или 12 месяцев. Доступ заканчивается вместе со сроком, автопродления нет.",
  plan1: "Все локации в приложении", plan2: "Без лимита трафика (в рамках честного использования)", plan3: "Регистрация через Telegram, без почты",
  plan4: "До 3 устройств", plan4_one: "1 устройство", plan5: "Оплата криптой или картой", price_btn: "Начать",
  faq_kicker: "Вопросы", faq_h2: "Отвечаем на вопросы.",
  faq_blocked_q: "Почему соединение режут в некоторых сетях?",
  faq_blocked_a: "Многие сети узнают распространённые протоколы и отбрасывают их. Kovra работает на VLESS + REALITY: соединение выглядит как заход на обычный сайт, поэтому проходит во многих сетях, где режут WireGuard и OpenVPN. Ни один протокол не гарантирован в каждой сети.",
  faq_email_q: "Нужна ли почта для регистрации?",
  faq_email_a: "Нет, если вы регистрируетесь через Telegram. Регистрация на сайте требует почту и пароль.",
  faq_pay_q: "Как оплатить?",
  faq_pay_a: "Картой или криптой: USDT, BTC, ETH и другими монетами, монету выбираете на странице оплаты. Крипта активируется после подтверждения в сети, обычно за 5-30 минут, сетевая комиссия добавляется. Три устройства: {p3_12} разово за 12 месяцев ({p3_12_mo}/мес); одно устройство: {p1_12} за 12 месяцев.",
  faq_apps_q: "Какие приложения подходят?",
  faq_apps_a: "Happ (рекомендуем) или INCY на iPhone, Android, Mac и Windows. Ссылка импортируется по одной на устройство.",
  faq_devices_q: "Сколько устройств можно использовать?",
  faq_devices_a: "Тариф рассчитан на 1 или 3 устройства. Каждое дополнительное: {addon} за 30 дней.",
  faq_logs_q: "Вы храните логи?",
  faq_logs_a: "Мы храним то, что нужно для оплаты: объём трафика на аккаунт и время последнего подключения, а также данные, перечисленные в Политике конфиденциальности.",
  faq_renew_q: "Продлевается ли Kovra автоматически?",
  faq_renew_a: "Нет. Вы платите разово за 1, 6 или 12 месяцев, и доступ заканчивается вместе со сроком.",
  faq_refund_q: "Можно ли вернуть деньги?",
  faq_refund_a: "После активации тарифа платежи, как правило, не возвращаются. Возврат рассматривается, только если сервис не был предоставлен по нашей вине и вы написали в поддержку в течение {refund_days} дней после оплаты (Условия, раздел 5).",
  faq_torrents_q: "Можно ли качать торренты?",
  faq_torrents_a: "Нет. BitTorrent отключён на всех серверах Kovra.",
  band_h2: "Верни себе приватность.", band_p: "До 3 устройств за {p3_12} в год, разовой оплатой. Автопродления нет.", band_btn: "Подключить",
  foot_terms: "Условия", foot_privacy: "Конфиденциальность", foot_vless: "VLESS-подписка", foot_crypto: "Оплата криптой", copyright: "© 2026 Kovra",
};

const es: HomeDict = {
  nav_features: "Funciones", nav_pricing: "Precio", nav_faq: "Preguntas", nav_guides: "Guías",
  nav_signin: "Entrar", nav_get: "Empezar",
  badge: "¿Tu VPN no conecta en esta red?",
  hero_t1: "Para la red,", hero_t2: "es solo un sitio web.",
  hero_sub: "Kovra funciona con VLESS + REALITY. Regístrate con Telegram, paga en USDT o con tarjeta e importa un enlace en Happ o INCY.",
  hero_cta1: "Obtén Kovra - desde {from_price}/mes", hero_cta2: "Saber más",
  b1_k: "Protocolo", b1_t: "Pasa desapercibido.",
  b1_b: "REALITY hace que la conexión parezca una visita a un sitio web corriente. Las redes que bloquean WireGuard u OpenVPN ven HTTPS normal.",
  b2_k: "Privacidad", b2_t: "Solo lo que exige el cobro.",
  b2_b: "Guardamos el volumen de tráfico y la hora de la última conexión. Todo lo que guardamos figura en nuestra Política de privacidad.",
  b3_k: "Dispositivos", b3_t: "Tus dispositivos.",
  b3_b: "Hasta 3 dispositivos: iPhone, Android, Mac, Windows o TV. Cada dispositivo extra, {addon} por 30 días.",
  b4_k: "Pagos", b4_t: "Cripto y tarjetas.",
  b4_b: "Paga con cripto o con tarjeta. Precios en USD; la tarjeta puede cobrarse en otra divisa y la comisión de red de la cripto se añade al pagar.",
  how_kicker: "Cómo funciona", how_h2: "Regístrate, paga, importa un enlace.",
  how_lead: "Crea una cuenta, elige un plan e importa tu enlace en Happ o INCY.",
  step1_t: "Crea tu cuenta", step1_b: "Con Telegram (sin email) o con email.",
  step2_t: "Elige un plan", step2_b: "1, 6 o 12 meses, en un solo pago con cripto o tarjeta.",
  step3_t: "Conéctate", step3_b: "Importa tu enlace en Happ o INCY y toca conectar.",
  where_kicker: "Ubicaciones", where_h2: "Dónde puedes conectarte.",
  where_lead: "Un enlace por dispositivo. Cuando añadimos una ubicación, aparece en tu app en la siguiente actualización.",
  limits_h: "Claros sobre los límites.",
  limits_b: "Ningún protocolo funciona en todas las redes. BitTorrent está bloqueado en todos los servidores. No hemos probado Kovra desde China ni desde Irán.",
  price_kicker: "Precio", price_h2: "Un plan. Elige el plazo.",
  price_honest: "Precio honesto",
  plan_permo: "/mes", plan_devices: "hasta 3 dispositivos", plan_devices1: "1 dispositivo",
  term1: "1 mes", term6: "6 meses", term12: "1 año", badge_best: "Mejor precio",
  plan_once1: "pago único por 1 mes", plan_oncen: "pago único por {n} meses",
  plan_savings: "El descuento compara el precio del plazo con pagar mes a mes el mismo periodo.",
  plan_no_renew: "Nada se renueva automáticamente.", plan_vs: "frente a {ref} en {n} pagos mensuales",
  price_meta: "Pagas una vez por 1, 6 o 12 meses. El acceso termina con el plazo; nada se renueva automáticamente.",
  plan1: "Todas las ubicaciones de la app", plan2: "Sin límite de datos (uso razonable)", plan3: "Registro con Telegram, sin email",
  plan4: "Hasta 3 dispositivos", plan4_one: "1 dispositivo", plan5: "Paga con cripto o tarjeta", price_btn: "Empezar",
  faq_kicker: "Preguntas", faq_h2: "Preguntas, resueltas.",
  faq_blocked_q: "¿Por qué mi VPN se bloquea en algunas redes?",
  faq_blocked_a: "Muchas redes reconocen los protocolos de VPN habituales y los descartan. Kovra usa VLESS + REALITY, que parece una visita a un sitio web corriente, así que pasa en muchas redes que bloquean WireGuard u OpenVPN. Ningún protocolo está garantizado en todas las redes.",
  faq_email_q: "¿Necesito un email para registrarme?",
  faq_email_a: "No, si te registras con Telegram. El registro en la web usa email y contraseña.",
  faq_pay_q: "¿Cómo pago?",
  faq_pay_a: "Con tarjeta o con cripto: USDT, BTC, ETH y más, eligiendo la moneda en la página de pago. La cripto se activa tras la confirmación de la red, normalmente en 5-30 minutos, y se añaden las comisiones de red. Tres dispositivos cuestan {p3_12} en un solo pago por 12 meses ({p3_12_mo}/mes); un dispositivo, {p1_12} por 12 meses.",
  faq_apps_q: "¿Qué apps funcionan con Kovra?",
  faq_apps_a: "Happ (recomendada) o INCY en iPhone, Android, Mac y Windows. Importas un enlace por dispositivo.",
  faq_devices_q: "¿Cuántos dispositivos puedo usar?",
  faq_devices_a: "Un plan cubre 1 o 3 dispositivos. Cada dispositivo extra cuesta {addon} por 30 días.",
  faq_logs_q: "¿Guardan registros?",
  faq_logs_a: "Guardamos lo que exige el cobro: el volumen de tráfico por cuenta y la hora de la última conexión, además de los datos indicados en nuestra Política de privacidad.",
  faq_renew_q: "¿Kovra se renueva automáticamente?",
  faq_renew_a: "No. Pagas una vez por 1, 6 o 12 meses y el acceso termina cuando acaba el plazo.",
  faq_refund_q: "¿Puedo pedir un reembolso?",
  faq_refund_a: "Una vez activado el plan, los pagos por lo general no se reembolsan. Solo se estudia un reembolso si el servicio no se prestó por un fallo nuestro y contactas con soporte en los {refund_days} días siguientes al pago (Términos, sección 5).",
  faq_torrents_q: "¿Puedo usar torrents?",
  faq_torrents_a: "No. BitTorrent está bloqueado en todos los servidores de Kovra.",
  band_h2: "Recupera tu privacidad.", band_p: "Hasta 3 dispositivos por {p3_12} al año, en un solo pago. Nada se renueva automáticamente.", band_btn: "Obtén Kovra",
  foot_terms: "Términos", foot_privacy: "Privacidad", foot_vless: "Suscripción VLESS", foot_crypto: "Pagar con cripto", copyright: "© 2026 Kovra",
};

const de: HomeDict = {
  nav_features: "Funktionen", nav_pricing: "Preis", nav_faq: "FAQ", nav_guides: "Guides",
  nav_signin: "Anmelden", nav_get: "Loslegen",
  badge: "VPN in diesem Netz blockiert?",
  hero_t1: "Für das Netz", hero_t2: "ist es nur eine Website.",
  hero_sub: "Kovra läuft auf VLESS + REALITY. Melde dich per Telegram an, zahle in USDT oder per Karte und importiere einen Link in Happ oder INCY.",
  hero_cta1: "Kovra holen - ab {from_price}/Mon.", hero_cta2: "Mehr erfahren",
  b1_k: "Protokoll", b1_t: "Fällt nicht auf.",
  b1_b: "REALITY lässt die Verbindung wie den Besuch einer gewöhnlichen Website aussehen. Netze, die WireGuard oder OpenVPN verwerfen, sehen gewöhnliches HTTPS.",
  b2_k: "Privatsphäre", b2_t: "Nur, was die Abrechnung braucht.",
  b2_b: "Wir speichern Datenvolumen und Zeitpunkt der letzten Verbindung. Alles, was wir speichern, steht in unserer Datenschutzerklärung.",
  b3_k: "Geräte", b3_t: "Deine Geräte.",
  b3_b: "Bis zu 3 Geräte: iPhone, Android, Mac, Windows oder TV. Jedes weitere Gerät {addon} pro 30 Tage.",
  b4_k: "Zahlung", b4_t: "Krypto & Karten.",
  b4_b: "Zahle mit Krypto oder Karte. Preise in USD; eine Karte kann in einer anderen Währung belastet werden, und Netzwerkgebühren für Krypto kommen beim Bezahlen hinzu.",
  how_kicker: "So funktioniert's", how_h2: "Anmelden, bezahlen, einen Link importieren.",
  how_lead: "Konto erstellen, Tarif wählen und deinen Link in Happ oder INCY importieren.",
  step1_t: "Konto erstellen", step1_b: "Per Telegram (ohne E-Mail) oder per E-Mail.",
  step2_t: "Tarif wählen", step2_b: "1, 6 oder 12 Monate, einmalig bezahlt mit Krypto oder Karte.",
  step3_t: "Verbinden", step3_b: "Link in Happ oder INCY importieren und auf Verbinden tippen.",
  where_kicker: "Standorte", where_h2: "Wo du dich verbinden kannst.",
  where_lead: "Ein Link pro Gerät. Wenn wir einen Standort hinzufügen, erscheint er bei der nächsten Aktualisierung in deiner App.",
  limits_h: "Ehrlich über die Grenzen.",
  limits_b: "Kein Protokoll funktioniert in jedem Netz. BitTorrent ist auf allen Servern gesperrt. Wir haben Kovra nicht aus China oder dem Iran heraus getestet.",
  price_kicker: "Preis", price_h2: "Ein Tarif. Wähle die Laufzeit.",
  price_honest: "Ehrlicher Preis",
  plan_permo: "/Mon.", plan_devices: "bis zu 3 Geräte", plan_devices1: "1 Gerät",
  term1: "1 Monat", term6: "6 Monate", term12: "1 Jahr", badge_best: "Bester Preis",
  plan_once1: "einmalig für 1 Monat", plan_oncen: "einmalig für {n} Monate",
  plan_savings: "Der Rabatt vergleicht den Laufzeitpreis mit monatlicher Zahlung für denselben Zeitraum.",
  plan_no_renew: "Nichts verlängert sich automatisch.", plan_vs: "statt {ref} bei {n} Monatszahlungen",
  price_meta: "Einmal zahlen für 1, 6 oder 12 Monate. Der Zugang endet mit der Laufzeit; nichts verlängert sich automatisch.",
  plan1: "Alle Standorte in der App", plan2: "Kein Datenlimit (faire Nutzung)", plan3: "Anmeldung per Telegram, ohne E-Mail",
  plan4: "Bis zu 3 Geräte", plan4_one: "1 Gerät", plan5: "Zahle mit Krypto oder Karte", price_btn: "Loslegen",
  faq_kicker: "FAQ", faq_h2: "Fragen, beantwortet.",
  faq_blocked_q: "Warum wird mein VPN in manchen Netzen blockiert?",
  faq_blocked_a: "Viele Netze erkennen gängige VPN-Protokolle und verwerfen sie. Kovra nutzt VLESS + REALITY, das wie der Besuch einer gewöhnlichen Website aussieht und deshalb in vielen Netzen durchkommt, die WireGuard oder OpenVPN sperren. Kein Protokoll ist in jedem Netz garantiert.",
  faq_email_q: "Brauche ich eine E-Mail zur Anmeldung?",
  faq_email_a: "Nein, wenn du dich per Telegram anmeldest. Die Anmeldung auf der Website nutzt E-Mail und Passwort.",
  faq_pay_q: "Wie bezahle ich?",
  faq_pay_a: "Per Karte oder mit Krypto: USDT, BTC, ETH und mehr, die Coin wählst du auf der Zahlungsseite. Krypto wird nach der Netzwerkbestätigung freigeschaltet, meist in 5-30 Minuten, Netzwerkgebühren kommen hinzu. Drei Geräte kosten {p3_12} einmalig für 12 Monate ({p3_12_mo}/Mon.); ein Gerät {p1_12} für 12 Monate.",
  faq_apps_q: "Welche Apps funktionieren mit Kovra?",
  faq_apps_a: "Happ (empfohlen) oder INCY auf iPhone, Android, Mac und Windows. Du importierst einen Link pro Gerät.",
  faq_devices_q: "Wie viele Geräte kann ich nutzen?",
  faq_devices_a: "Ein Tarif deckt 1 oder 3 Geräte. Jedes weitere Gerät kostet {addon} pro 30 Tage.",
  faq_logs_q: "Speichert ihr Logs?",
  faq_logs_a: "Wir speichern, was die Abrechnung braucht: das Datenvolumen pro Konto und den Zeitpunkt der letzten Verbindung, dazu die in unserer Datenschutzerklärung genannten Daten.",
  faq_renew_q: "Verlängert sich Kovra automatisch?",
  faq_renew_a: "Nein. Du zahlst einmal für 1, 6 oder 12 Monate, und der Zugang endet mit der Laufzeit.",
  faq_refund_q: "Kann ich mein Geld zurückbekommen?",
  faq_refund_a: "Nach der Aktivierung eines Tarifs sind Zahlungen in der Regel nicht erstattungsfähig. Eine Erstattung wird nur geprüft, wenn der Dienst durch einen Fehler auf unserer Seite nicht erbracht wurde und du dich innerhalb von {refund_days} Tagen nach der Zahlung an den Support wendest (AGB, Abschnitt 5).",
  faq_torrents_q: "Kann ich Torrents nutzen?",
  faq_torrents_a: "Nein. BitTorrent ist auf allen Kovra-Servern gesperrt.",
  band_h2: "Hol dir deine Privatsphäre zurück.", band_p: "Bis zu 3 Geräte für {p3_12} im Jahr, einmalig bezahlt. Nichts verlängert sich automatisch.", band_btn: "Kovra holen",
  foot_terms: "AGB", foot_privacy: "Datenschutz", foot_vless: "VLESS-Abo", foot_crypto: "Mit Krypto zahlen", copyright: "© 2026 Kovra",
};

const fr: HomeDict = {
  nav_features: "Fonctions", nav_pricing: "Tarif", nav_faq: "FAQ", nav_guides: "Guides",
  nav_signin: "Connexion", nav_get: "Commencer",
  badge: "VPN bloqué sur ce réseau ?",
  hero_t1: "Pour le réseau,", hero_t2: "ce n'est qu'un site web.",
  hero_sub: "Kovra fonctionne avec VLESS + REALITY. Inscrivez-vous via Telegram, payez en USDT ou par carte, importez un lien dans Happ ou INCY.",
  hero_cta1: "Obtenir Kovra - dès {from_price}/mois", hero_cta2: "En savoir plus",
  b1_k: "Protocole", b1_t: "Passe inaperçu.",
  b1_b: "REALITY fait ressembler la connexion à la visite d'un site ordinaire. Les réseaux qui bloquent WireGuard ou OpenVPN voient du HTTPS ordinaire.",
  b2_k: "Confidentialité", b2_t: "Seulement ce que la facturation exige.",
  b2_b: "Nous conservons le volume de trafic et l'heure de la dernière connexion. Tout ce que nous conservons figure dans notre Politique de confidentialité.",
  b3_k: "Appareils", b3_t: "Vos appareils.",
  b3_b: "Jusqu'à 3 appareils : iPhone, Android, Mac, Windows ou TV. Chaque appareil supplémentaire, {addon} pour 30 jours.",
  b4_k: "Paiements", b4_t: "Crypto et cartes.",
  b4_b: "Payez en crypto ou par carte. Prix en USD ; la carte peut être débitée dans une autre devise, et les frais de réseau crypto s'ajoutent au paiement.",
  how_kicker: "Comment ça marche", how_h2: "Inscription, paiement, un lien à importer.",
  how_lead: "Créez un compte, choisissez une offre et importez votre lien dans Happ ou INCY.",
  step1_t: "Créez votre compte", step1_b: "Via Telegram (sans e-mail) ou par e-mail.",
  step2_t: "Choisissez une offre", step2_b: "1, 6 ou 12 mois, payés en une fois, en crypto ou par carte.",
  step3_t: "Connectez-vous", step3_b: "Importez votre lien dans Happ ou INCY et touchez connecter.",
  where_kicker: "Emplacements", where_h2: "Où vous pouvez vous connecter.",
  where_lead: "Un lien par appareil. Quand nous ajoutons un emplacement, il apparaît dans votre application à la prochaine actualisation.",
  limits_h: "Honnêtes sur les limites.",
  limits_b: "Aucun protocole ne fonctionne sur tous les réseaux. BitTorrent est bloqué sur tous les serveurs. Nous n'avons pas testé Kovra depuis la Chine ni depuis l'Iran.",
  price_kicker: "Tarif", price_h2: "Une offre. Choisissez la durée.",
  price_honest: "Prix honnête",
  plan_permo: "/mois", plan_devices: "jusqu'à 3 appareils", plan_devices1: "1 appareil",
  term1: "1 mois", term6: "6 mois", term12: "1 an", badge_best: "Meilleur prix",
  plan_once1: "payé en une fois pour 1 mois", plan_oncen: "payé en une fois pour {n} mois",
  plan_savings: "La remise compare le prix de la durée à un paiement mensuel sur la même période.",
  plan_no_renew: "Rien ne se renouvelle automatiquement.", plan_vs: "au lieu de {ref} en {n} paiements mensuels",
  price_meta: "Payez une fois pour 1, 6 ou 12 mois. L'accès prend fin avec la durée ; rien ne se renouvelle automatiquement.",
  plan1: "Tous les emplacements de l'application", plan2: "Sans plafond de données (usage raisonnable)", plan3: "Inscription via Telegram, sans e-mail",
  plan4: "Jusqu'à 3 appareils", plan4_one: "1 appareil", plan5: "Payez en crypto ou par carte", price_btn: "Commencer",
  faq_kicker: "FAQ", faq_h2: "Vos questions, nos réponses.",
  faq_blocked_q: "Pourquoi mon VPN est-il bloqué sur certains réseaux ?",
  faq_blocked_a: "De nombreux réseaux reconnaissent les protocoles VPN courants et les rejettent. Kovra utilise VLESS + REALITY, qui ressemble à la visite d'un site ordinaire et passe donc sur beaucoup de réseaux qui bloquent WireGuard ou OpenVPN. Aucun protocole n'est garanti sur tous les réseaux.",
  faq_email_q: "Faut-il un e-mail pour s'inscrire ?",
  faq_email_a: "Non, si vous vous inscrivez via Telegram. L'inscription sur le site utilise un e-mail et un mot de passe.",
  faq_pay_q: "Comment payer ?",
  faq_pay_a: "Par carte ou en crypto : USDT, BTC, ETH et plus, la monnaie se choisit sur la page de paiement. La crypto est activée après confirmation du réseau, généralement en 5-30 minutes, et les frais de réseau s'ajoutent. Trois appareils coûtent {p3_12} en une fois pour 12 mois ({p3_12_mo}/mois) ; un appareil, {p1_12} pour 12 mois.",
  faq_apps_q: "Quelles applications fonctionnent avec Kovra ?",
  faq_apps_a: "Happ (recommandée) ou INCY sur iPhone, Android, Mac et Windows. Vous importez un lien par appareil.",
  faq_devices_q: "Combien d'appareils puis-je utiliser ?",
  faq_devices_a: "Une offre couvre 1 ou 3 appareils. Chaque appareil supplémentaire coûte {addon} pour 30 jours.",
  faq_logs_q: "Conservez-vous des journaux ?",
  faq_logs_a: "Nous conservons ce que la facturation exige : le volume de trafic par compte et l'heure de la dernière connexion, ainsi que les données listées dans notre Politique de confidentialité.",
  faq_renew_q: "Kovra se renouvelle-t-il automatiquement ?",
  faq_renew_a: "Non. Vous payez une fois pour 1, 6 ou 12 mois, et l'accès prend fin avec la durée.",
  faq_refund_q: "Puis-je être remboursé ?",
  faq_refund_a: "Une fois l'offre activée, les paiements ne sont en général pas remboursables. Un remboursement n'est étudié que si le service n'a pas été fourni par notre faute et que vous contactez le support dans les {refund_days} jours suivant le paiement (Conditions, section 5).",
  faq_torrents_q: "Puis-je utiliser des torrents ?",
  faq_torrents_a: "Non. BitTorrent est bloqué sur tous les serveurs de Kovra.",
  band_h2: "Reprenez votre confidentialité.", band_p: "Jusqu'à 3 appareils pour {p3_12} par an, payés en une fois. Rien ne se renouvelle automatiquement.", band_btn: "Obtenir Kovra",
  foot_terms: "Conditions", foot_privacy: "Confidentialité", foot_vless: "Abonnement VLESS", foot_crypto: "Payer en crypto", copyright: "© 2026 Kovra",
};

export const HOME_COPY: Record<Lang, HomeDict> = { en, ru, es, de, fr };

/** The placeholders a string may carry besides {n} and {ref}. */
export type HomeVar = "from_price" | "p3_12" | "p3_12_mo" | "p1_12" | "addon" | "refund_days";

/**
 * "$79.08"; French writes the symbol after the number, with a no-break space
 * so a price never wraps in two. Whole dollars drop their cents ("$33").
 */
export function formatMoney(amount: number, lang: Lang): string {
  const s = usd(amount);
  return lang === "fr" ? `${s.slice(1)} $` : s;
}

/** The prices and terms the copy quotes, from the module the server charges from. */
export function homeVars(lang: Lang): Record<HomeVar, string> {
  const money = (amount: number) => formatMoney(amount, lang);
  return {
    from_price: money(PLAN_PRICES.plan1[1].perMonth),
    p3_12: money(PLAN_PRICES.plan3[12].total),
    p3_12_mo: money(PLAN_PRICES.plan3[12].perMonth),
    p1_12: money(PLAN_PRICES.plan1[12].total),
    addon: money(DEVICE_ADDON_PRICE),
    refund_days: String(REFUND_WINDOW_DAYS),
  };
}

/** Fills {name} placeholders from `vars`; a name it does not know is left as it is. */
export function fillCopy(text: string, vars: Readonly<Record<string, string>>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : whole,
  );
}

/** A language's copy with the prices filled in ({n} and {ref} stay for the view). */
export function homeCopyFor(lang: Lang): HomeDict {
  const vars = homeVars(lang);
  const out = { ...HOME_COPY[lang] };
  for (const key of Object.keys(out) as HomeKey[]) out[key] = fillCopy(out[key], vars);
  return out;
}

/**
 * The FAQ in the order the page shows it. The view renders it and the server
 * page puts the English one into the FAQPage markup, word for word.
 */
export const HOME_FAQ_KEYS = ["blocked", "email", "pay", "apps", "devices", "logs", "renew", "refund", "torrents"] as const;

export function homeFaq(lang: Lang): FaqItem[] {
  const copy = homeCopyFor(lang);
  return HOME_FAQ_KEYS.map((key) => ({ q: copy[`faq_${key}_q`], a: copy[`faq_${key}_a`] }));
}

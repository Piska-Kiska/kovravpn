// src/app/guide/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Copy, Download, Smartphone, Monitor, Apple, CheckCircle2 } from "lucide-react";
import Logo from "@/components/Logo";
import NavToggles from "@/components/NavToggles";
import { buildHowToSchema, buildFaqPageSchema, buildBreadcrumbSchema, jsonLd } from "@/lib/structured-data";
import { FAQ_GUIDE } from "@/lib/faq-items";
import FAQ from "@/components/FAQ";
import { ogImageUrl } from "@/lib/og-url";

const TITLE = "Как подключить VPN: пошаговая инструкция";
const DESC =
  "Подключение Kovra за 5 минут на Android, iPhone, iPad, Windows и macOS. Установка приложений Happ и V2RayTun, импорт подписки, первый запуск.";

const OG_IMAGE = {
  url: ogImageUrl("Как подключить VPN", "Пошаговая инструкция для всех устройств"),
  width: 1200,
  height: 630,
  alt: TITLE,
};

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/guide" },
  openGraph: {
    title: `${TITLE} | Kovra`,
    description: DESC,
    url: "/guide",
    images: [OG_IMAGE],
  },
  twitter: {
    title: `${TITLE} | Kovra`,
    description: DESC,
    images: [OG_IMAGE.url],
  },
};

/* ── Step component ────────────────────────────────── */
function Step({
  num,
  titleI18nKey,
  titleFallback,
  children,
}: {
  num: number;
  titleI18nKey: string;
  titleFallback: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-5">
      <div className="nm-circle w-10 h-10 flex items-center justify-center shrink-0 text-sm font-bold text-nm-accent">
        {num}
      </div>
      <div className="flex-1 pb-8">
        <h3 className="font-bold text-nm-text mb-2" data-i18n={titleI18nKey}>
          {titleFallback}
        </h3>
        <div className="text-sm text-nm-text-secondary leading-relaxed space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Platform section ──────────────────────────────── */
function Platform({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="nm-raised p-8 md:p-10 scroll-mt-24">
      <div className="flex items-center gap-4 mb-8">
        <div className="nm-circle-pressed w-14 h-14 flex items-center justify-center">
          {icon}
        </div>
        {/* Platform names (Android / iOS / Windows / macOS) are kept in
            the Latin alphabet across both locales — no i18n needed. */}
        <h2 className="text-2xl font-bold text-nm-text">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/* ══════════════════════════════════════════════════════ */

const GUIDE_URL = "https://kovravpn.com/guide";

const STEPS_ANDROID = [
  { name: "Установите Happ или V2RayTun", text: "Откройте Google Play, найдите Happ или V2RayTun и установите приложение." },
  { name: "Импортируйте подписку", text: "Скопируйте ссылку-подписку из личного кабинета, откройте приложение, нажмите «+» и вставьте ссылку через «Импорт из буфера»." },
  { name: "Подключитесь", text: "Выберите сервер из списка и нажмите кнопку подключения. VPN заработает через несколько секунд." },
];

const STEPS_IOS = [
  { name: "Установите приложение", text: "Откройте App Store, найдите Happ (или Happ Proxy Utility Plus для RU-сторов) и установите его." },
  { name: "Импортируйте подписку", text: "Скопируйте ссылку-подписку из личного кабинета, откройте Happ, нажмите «+» → «Импорт из буфера»." },
  { name: "Подключитесь", text: "Выберите сервер и нажмите кнопку подключения. При первом запуске разрешите добавление VPN-конфигурации в Настройках." },
];

const STEPS_WINDOWS = [
  { name: "Установите приложение", text: "Скачайте инсталлятор Happ для Windows с GitHub или V2RayTun с официального сайта и запустите установку." },
  { name: "Импортируйте подписку", text: "Скопируйте ссылку-подписку из личного кабинета. В Happ нажмите «+» → «Импорт из буфера»." },
  { name: "Подключитесь", text: "Выберите сервер и нажмите кнопку подключения. При необходимости разрешите работу приложения в брандмауэре Windows." },
];

const STEPS_MACOS = [
  { name: "Установите приложение", text: "Откройте Mac App Store, найдите Happ Proxy Utility и установите. Приложение использует Network Extension, отдельных драйверов не требуется." },
  { name: "Импортируйте подписку", text: "Скопируйте ссылку-подписку из личного кабинета, откройте Happ на Mac и вставьте ссылку через «Импорт из буфера»." },
  { name: "Подключитесь", text: "Выберите сервер и нажмите кнопку подключения. При первом запуске macOS попросит разрешение на установку VPN-конфигурации." },
];

const HOW_TO_ANDROID = buildHowToSchema({
  name: "Как подключить VPN на Android",
  description: "Установка Kovra на Android через Happ или V2RayTun.",
  url: `${GUIDE_URL}#android`,
  totalTime: "PT5M",
  steps: STEPS_ANDROID,
});
const HOW_TO_IOS = buildHowToSchema({
  name: "Как подключить VPN на iPhone и iPad",
  description: "Установка Kovra на iOS через Happ.",
  url: `${GUIDE_URL}#ios`,
  totalTime: "PT5M",
  steps: STEPS_IOS,
});
const HOW_TO_WINDOWS = buildHowToSchema({
  name: "Как подключить VPN на Windows",
  description: "Установка Kovra на Windows через Happ или V2RayTun.",
  url: `${GUIDE_URL}#windows`,
  totalTime: "PT5M",
  steps: STEPS_WINDOWS,
});
const HOW_TO_MACOS = buildHowToSchema({
  name: "Как подключить VPN на macOS",
  description: "Установка Kovra на Mac через Happ Proxy Utility.",
  url: `${GUIDE_URL}#macos`,
  totalTime: "PT5M",
  steps: STEPS_MACOS,
});

export default function GuidePage() {
  return (
    <div className="min-h-screen">
      {/* HowTo / FAQ / Breadcrumb structured data — kept in RU. Server-
          rendered Russian markup is what Yandex/Google index, so the
          schemas mirror it. The visible page text swaps to EN client-
          side via Localizer for users who pick EN. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(HOW_TO_ANDROID) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(HOW_TO_IOS) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(HOW_TO_WINDOWS) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(HOW_TO_MACOS) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(buildFaqPageSchema(FAQ_GUIDE)) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            buildBreadcrumbSchema([
              { name: "Главная", url: "https://kovravpn.com/" },
              { name: "Инструкция", url: "https://kovravpn.com/guide" },
            ]),
          ),
        }}
      />

      {/* ── Nav with inline toggles ──────────────────── */}
      <nav className="container mx-auto px-4 md:px-6 pt-6 mb-4">
        <div className="nm-raised-sm px-3 md:px-5 py-3 flex items-center justify-between gap-2 min-w-0">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="nm-circle w-9 h-9 flex items-center justify-center">
              <Logo size={18} className="text-nm-accent" />
            </div>
            <span
              className="hidden sm:inline font-semibold text-nm-text tracking-tight"
              data-i18n="common.brand"
            >
              Kovra
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <NavToggles />
            <Link
              href="/dashboard"
              className="nm-btn inline-flex items-center gap-1.5 px-3 md:px-4 py-2 text-xs md:text-sm text-nm-text-secondary"
            >
              <ArrowLeft className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span data-i18n="common.back">Назад</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────── */}
      <section className="container mx-auto px-6 pt-8 pb-12 text-center">
        <h1
          className="text-3xl md:text-4xl font-bold text-nm-text mb-3"
          data-i18n="guide.title"
        >
          Инструкция по подключению
        </h1>
        <p
          className="text-nm-text-secondary max-w-lg mx-auto"
          data-i18n="guide.subtitle"
        >
          Подключение займёт 2–3 минуты. Выберите вашу платформу.
        </p>
      </section>

      {/* ── Platform nav ──────────────────────────── */}
      <section className="container mx-auto px-6 pb-12">
        <div className="flex flex-wrap justify-center gap-3">
          {[
            { id: "android", label: "Android" },
            { id: "ios", label: "iOS" },
            { id: "windows", label: "Windows" },
            { id: "macos", label: "macOS" },
          ].map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              className="nm-btn px-6 py-3 text-sm font-medium text-nm-text hover:text-nm-accent transition-colors"
            >
              {p.label}
            </a>
          ))}
        </div>
      </section>

      {/* ── Guides ────────────────────────────────── */}
      <div className="container mx-auto px-6 pb-20 space-y-8 max-w-3xl">

        {/* ── Common first step ───────────────────── */}
        <div className="nm-pressed p-6 md:p-8 rounded-2xl text-center">
          <div className="nm-circle w-12 h-12 flex items-center justify-center mx-auto mb-4">
            <Copy className="w-5 h-5 text-nm-accent" />
          </div>
          <h3
            className="font-bold text-nm-text mb-2"
            data-i18n="guide.common.title"
          >
            Для всех платформ: скопируйте ссылку подписки
          </h3>
          <p
            className="text-sm text-nm-text-secondary max-w-md mx-auto"
            data-i18n-html="guide.common.desc.html"
          >
            Откройте <Link href="/dashboard" className="text-nm-accent hover:underline">Панель управления</Link>,
            добавьте устройство нужного типа — и у него появится персональная
            ссылка подписки. Скопируйте её кнопкой справа от ссылки. На следующих
            шагах мы вставим её в приложение. Для каждого устройства — отдельная
            ссылка, не передавайте её третьим лицам.
          </p>
        </div>

        {/* ══ Android ═════════════════════════════════ */}
        <Platform id="android" icon={<Smartphone className="w-7 h-7 text-nm-accent" />} title="Android">
          <Step num={1} titleI18nKey="guide.step.install" titleFallback="Установите приложение">
            <p data-i18n-html="guide.android.s1.html">
              Скачайте <strong className="text-nm-text">HAPP</strong> из{" "}
              <a href="https://play.google.com/store/apps/details?id=com.happproxy" target="_blank" rel="noopener noreferrer" className="text-nm-accent hover:underline">
                Google Play
              </a>{" "}или{" "}
              <a href="https://www.happ.su/main" target="_blank" rel="noopener noreferrer" className="text-nm-accent hover:underline">
                сайта HAPP
              </a>.
            </p>
            <p className="mt-1" data-i18n-html="guide.android.s1b.html">
              Альтернатива: <strong className="text-nm-text">V2RayTun</strong> —{" "}
              <a href="https://play.google.com/store/apps/details?id=com.v2raytun.android" target="_blank" rel="noopener noreferrer" className="text-nm-accent hover:underline">
                Google Play
              </a>
            </p>
          </Step>
          <Step num={2} titleI18nKey="guide.step.import" titleFallback="Импортируйте подписку">
            <p data-i18n-html="guide.android.s2a.html">Откройте HAPP → нажмите <strong className="text-nm-text">«+»</strong> → <strong className="text-nm-text">«Импорт из буфера обмена»</strong>.</p>
            <p data-i18n="guide.android.s2b">Приложение автоматически распознает скопированную ссылку подписки и добавит сервер. Подписка будет обновляться сама — при изменении срока действия ничего перенастраивать не нужно.</p>
          </Step>
          <Step num={3} titleI18nKey="guide.step.connect" titleFallback="Подключитесь">
            <p data-i18n-html="guide.android.s3a.html">Выберите добавленный сервер и нажмите кнопку подключения. Android запросит разрешение на VPN — нажмите <strong className="text-nm-text">«OK»</strong>.</p>
            <div className="nm-pressed-sm p-3 rounded-xl mt-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <span className="text-nm-text text-xs" data-i18n="guide.android.s3b">Если в статус-баре появился значок ключа — вы подключены.</span>
            </div>
          </Step>
        </Platform>

        {/* ══ iOS ═════════════════════════════════════ */}
        <Platform id="ios" icon={<Apple className="w-7 h-7 text-nm-accent" />} title="iOS / iPad">
          <Step num={1} titleI18nKey="guide.step.install" titleFallback="Установите приложение">
            <p data-i18n-html="guide.ios.s1.html">Скачайте <strong className="text-nm-text">HAPP</strong>:</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <a href="https://apps.apple.com/us/app/happ-proxy-utility/id6504287215" target="_blank" rel="noopener noreferrer"
                className="nm-btn px-4 py-2 text-xs font-medium text-nm-text inline-flex items-center gap-1.5">
                <Download className="w-3 h-3" /> App Store
              </a>
              <a href="https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973" target="_blank" rel="noopener noreferrer"
                className="nm-btn px-4 py-2 text-xs font-medium text-nm-accent inline-flex items-center gap-1.5">
                <Download className="w-3 h-3" /> RU App Store
              </a>
            </div>
            <p className="mt-2" data-i18n-html="guide.ios.s1b.html">Альтернатива: <strong className="text-nm-text">V2RayTun</strong> —{" "}
              <a href="https://apps.apple.com/us/app/v2raytun/id6476628951" target="_blank" rel="noopener noreferrer" className="text-nm-accent hover:underline">App Store</a>
            </p>
          </Step>
          <Step num={2} titleI18nKey="guide.step.import" titleFallback="Импортируйте подписку">
            <p data-i18n-html="guide.ios.s2a.html">Откройте HAPP → <strong className="text-nm-text">«+»</strong> → <strong className="text-nm-text">«Импорт из буфера обмена»</strong>.</p>
            <p data-i18n="guide.ios.s2b">Или откройте скопированную ссылку подписки в Safari — HAPP предложит импортировать её автоматически. После добавления подписка будет обновляться сама.</p>
          </Step>
          <Step num={3} titleI18nKey="guide.step.connect" titleFallback="Подключитесь">
            <p data-i18n-html="guide.ios.s3a.html">Выберите сервер, нажмите <strong className="text-nm-text">«Подключить»</strong>. iOS попросит разрешить VPN-конфигурацию — подтвердите через Face ID / Touch ID.</p>
            <div className="nm-pressed-sm p-3 rounded-xl mt-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <span className="text-nm-text text-xs" data-i18n="guide.ios.s3b">Значок «VPN» в статус-баре = подключение активно.</span>
            </div>
          </Step>
        </Platform>

        {/* ══ Windows ═════════════════════════════════ */}
        <Platform id="windows" icon={<Monitor className="w-7 h-7 text-nm-accent" />} title="Windows">
          <Step num={1} titleI18nKey="guide.step.install" titleFallback="Установите приложение">
            <p data-i18n-html="guide.win.s1.html">
              Скачайте <strong className="text-nm-text">HAPP</strong>:{" "}
              <a href="https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe" className="text-nm-accent hover:underline">
                setup-Happ.x64.exe
              </a>
            </p>
            <p className="mt-1" data-i18n-html="guide.win.s1b.html">
              Альтернатива: <strong className="text-nm-text">V2RayTun</strong> —{" "}
              <a href="https://storage.v2raytun.com/v2RayTun_Setup.exe" className="text-nm-accent hover:underline">v2RayTun_Setup.exe</a>
            </p>
            <p data-i18n="guide.win.s1c">Запустите → установите как обычное приложение.</p>
          </Step>
          <Step num={2} titleI18nKey="guide.step.import" titleFallback="Импортируйте подписку">
            <p data-i18n-html="guide.win.s2a.html">Откройте HAPP → нажмите <strong className="text-nm-text">«+»</strong> → <strong className="text-nm-text">«Импорт из буфера»</strong>.</p>
            <p data-i18n-html="guide.win.s2b.html">Или вставьте ссылку вручную: <strong className="text-nm-text">«+» → «Ввести URL»</strong> → вставьте ссылку подписки. Подписка будет обновляться сама.</p>
          </Step>
          <Step num={3} titleI18nKey="guide.step.connect" titleFallback="Подключитесь">
            <p data-i18n-html="guide.win.s3a.html">Выберите сервер из списка и нажмите <strong className="text-nm-text">кнопку подключения</strong>. Windows может запросить разрешение на добавление VPN-адаптера — нажмите <strong className="text-nm-text">«Да»</strong>.</p>
            <div className="nm-pressed-sm p-3 rounded-xl mt-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <span className="text-nm-text text-xs" data-i18n="guide.win.s3b">Иконка HAPP в трее изменит цвет — подключение установлено.</span>
            </div>
          </Step>
        </Platform>

        {/* ══ macOS ═══════════════════════════════════ */}
        <Platform id="macos" icon={<Apple className="w-7 h-7 text-nm-accent" />} title="macOS">
          <Step num={1} titleI18nKey="guide.step.install" titleFallback="Установите приложение">
            <p data-i18n-html="guide.mac.s1.html">Скачайте <strong className="text-nm-text">HAPP</strong>:</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <a href="https://apps.apple.com/us/app/happ-proxy-utility/id6504287215" target="_blank" rel="noopener noreferrer"
                className="nm-btn px-4 py-2 text-xs font-medium text-nm-text inline-flex items-center gap-1.5">
                <Download className="w-3 h-3" /> App Store
              </a>
              <a href="https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973" target="_blank" rel="noopener noreferrer"
                className="nm-btn px-4 py-2 text-xs font-medium text-nm-accent inline-flex items-center gap-1.5">
                <Download className="w-3 h-3" /> RU App Store
              </a>
            </div>
            <p className="mt-2" data-i18n-html="guide.mac.s1b.html">Альтернатива: <strong className="text-nm-text">V2RayTun</strong> —{" "}
              <a href="https://apps.apple.com/us/app/v2raytun/id6476628951" target="_blank" rel="noopener noreferrer" className="text-nm-accent hover:underline">App Store</a>
            </p>
          </Step>
          <Step num={2} titleI18nKey="guide.step.import" titleFallback="Импортируйте подписку">
            <p data-i18n-html="guide.mac.s2.html">Откройте HAPP → <strong className="text-nm-text">«+»</strong> → <strong className="text-nm-text">«Импорт из буфера»</strong>. Приложение распознает ссылку подписки и добавит сервер. Подписка будет обновляться сама.</p>
          </Step>
          <Step num={3} titleI18nKey="guide.step.connect" titleFallback="Подключитесь">
            <p data-i18n-html="guide.mac.s3a.html">Выберите сервер, нажмите <strong className="text-nm-text">«Подключить»</strong>. macOS попросит разрешить VPN — введите пароль системы.</p>
            <div className="nm-pressed-sm p-3 rounded-xl mt-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <span className="text-nm-text text-xs" data-i18n="guide.mac.s3b">Значок VPN в верхней панели = подключение активно.</span>
            </div>
          </Step>
        </Platform>

        {/* ── FAQ ─────────────────────────────────── */}
        <section className="pt-6">
          <h2
            className="text-2xl font-bold text-nm-text text-center mb-8"
            data-i18n="guide.faq.title"
          >
            Частые вопросы
          </h2>
          <FAQ items={FAQ_GUIDE} keyPrefix="faq.guide" />
        </section>

        {/* ── Troubleshoot ────────────────────────── */}
        <div className="nm-flat p-8 text-center">
          <h3 className="font-bold text-nm-text mb-2" data-i18n="guide.help.title">
            Не получается подключиться?
          </h3>
          <p
            className="text-sm text-nm-text-secondary mb-5"
            data-i18n="guide.help.subtitle"
          >
            Напишите нам — поможем настроить за пару минут.
          </p>
          <a
            href="https://t.me/KovraVPN_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="nm-btn-accent inline-block px-8 py-3 font-semibold text-sm"
            data-i18n="guide.help.btn"
          >
            Написать в Telegram
          </a>
        </div>
      </div>
    </div>
  );
}

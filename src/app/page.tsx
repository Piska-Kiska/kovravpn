// src/app/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import {
  Shield,
  Zap,
  Globe,
  Lock,
  Monitor,
  Smartphone,
  Gamepad2,
  Wifi,
  ChevronRight,
  Activity,
  EyeOff,
  Landmark,
  CreditCard,
  ShoppingBag,
  MapPin,
  Tv,
  CheckCircle2,
} from "lucide-react";
import FAQ from "@/components/FAQ";
import PlanSelector from "@/components/PlanSelector";
import NavToggles from "@/components/NavToggles";
import Logo from "@/components/Logo";
import {
  buildOrganizationSchema,
  buildWebSiteSchema,
  buildProductSchema,
  buildFaqPageSchema,
  buildBreadcrumbSchema,
  jsonLd,
} from "@/lib/structured-data";
import { ogImageUrl } from "@/lib/og-url";

/* ── Data ──────────────────────────────────────────── */
const FEATURES = [
  {
    icon: Zap,
    title: "Быстрое соединение",
    desc: "Выделенные серверы и оптимизированные маршруты. Минимальные задержки даже в часы пик.",
  },
  {
    icon: Lock,
    title: "Невидимый трафик",
    desc: "Два протокола — VLESS Reality и Hysteria2. Маскируют трафик под обычный HTTPS, устойчивы к DPI-анализу. Если один протокол недоступен в сети — соединение продолжает работать через второй.",
  },
  {
    icon: Globe,
    title: "Один клик",
    desc: "Подключение за минуту на любом устройстве. Умная маршрутизация — локальные сайты идут напрямую.",
  },
] as const;

/* ══════════════════════════════════════════════════════ */

/**
 * Homepage metadata — kept in Russian.
 *
 * The i18n on this page is purely a client-side enhancement (DOM text
 * swap when ?lang=en is set). The server-rendered <head> stays in
 * Russian so Yandex/Google index the established RU title and
 * description without disruption (re-indexing takes 2-7 days, and we
 * deliberately avoid disturbing the current top-page meta).
 */
export const metadata: Metadata = {
  title: {
    absolute:
      "ПроксисВпнович (Proxysvpnovich): приватный VPN от 100 ₽/мес",
  },
  description:
    "Proxysvpnovich — VPN на VLESS Reality. Российские сайты работают напрямую: Сбер, Госуслуги, Ozon. Низкий пинг, серверы в Европе. От 10 ₽.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "ПроксисВпнович (Proxysvpnovich) — приватный VPN от 100 ₽/мес",
    description:
      "Proxysvpnovich — VLESS Reality, российские сайты работают напрямую, низкий пинг. От 10 ₽.",
    url: "/",
    images: [
      {
        url: ogImageUrl(
          "Приватный VPN",
          "Низкий пинг, VLESS Reality, 100 ₽/мес",
        ),
        width: 1200,
        height: 630,
        alt: "ПроксисВпнович (Proxysvpnovich) — приватный VPN с низким пингом",
      },
    ],
  },
};

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(buildOrganizationSchema()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(buildWebSiteSchema()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(buildProductSchema()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(buildFaqPageSchema()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            buildBreadcrumbSchema([
              { name: "Главная", url: "https://proxysvpn.com/" },
            ]),
          ),
        }}
      />

      {/* ── Nav with inline toggles ──────────────────── */}
      <nav className="container mx-auto px-4 md:px-6 pt-6">
        <div className="nm-raised-sm px-3 md:px-5 py-3 flex items-center justify-between gap-2 min-w-0">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="nm-circle w-9 h-9 flex items-center justify-center">
              <Logo size={18} className="text-nm-accent" />
            </div>
            <span
              className="hidden sm:inline font-semibold text-nm-text tracking-tight"
              data-i18n="common.brand"
            >
              ПроксисВпнович
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {[
              { i18nKey: "nav.features", label: "Возможности", href: "#features" },
              { i18nKey: "nav.pricing", label: "Цены", href: "#pricing" },
              { i18nKey: "nav.faq", label: "FAQ", href: "#faq" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-sm text-nm-text-secondary hover:text-nm-text transition-colors rounded-xl"
                data-i18n={link.i18nKey}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <NavToggles />
            <Link
              href="/login"
              className="nm-btn-accent px-3 md:px-5 py-2 text-xs md:text-sm font-medium"
              data-i18n="nav.login"
            >
              Войти
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="container mx-auto px-4 md:px-6 pt-20 pb-20 md:pt-32 md:pb-40">
        <div className="max-w-3xl mx-auto text-center">
          <div className="nm-pressed-sm inline-flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-nm-accent mb-6 md:mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span data-i18n="home.status.online">Все серверы онлайн</span>
          </div>

          <h1 className="text-[clamp(2rem,9vw,2.75rem)] sm:text-5xl md:text-6xl lg:text-7xl font-bold text-nm-text leading-[1.05] mb-5 md:mb-6 tracking-tight break-words">
            <span data-i18n="home.hero.title.line1">Быстро. Надёжно.</span>
            <br />
            <span className="text-nm-accent" data-i18n="home.hero.title.line2">
              Незаметно.
            </span>
          </h1>

          <p
            className="text-nm-accent text-sm md:text-base font-medium mb-3 tracking-wide max-w-xl mx-auto px-2 break-words"
            data-i18n-html="home.hero.brandline.html"
          >
            ПроксисВпнович <span className="opacity-70">(Proxysvpnovich)</span> — VPN на протоколе VLESS Reality
          </p>

          <p
            className="text-nm-text-secondary text-base md:text-xl leading-relaxed mb-8 md:mb-10 max-w-xl mx-auto px-2"
            data-i18n="home.hero.subtitle"
          >
            Защита данных в публичных сетях и низкий пинг для онлайн-игр
            Подключение за минуту
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <a
              href="#pricing"
              className="nm-btn-accent px-8 py-4 font-semibold text-base inline-flex items-center justify-center gap-2"
            >
              <span data-i18n="home.hero.cta.pricing">Смотреть цены</span>
              <ChevronRight className="w-4 h-4" />
            </a>
            <Link
              href="/register"
              className="nm-btn px-8 py-4 font-medium text-base text-nm-text inline-flex items-center justify-center"
              data-i18n="home.hero.cta.try"
            >
              Попробовать за 10 ₽
            </Link>
          </div>

          {/* Device row */}
          <div className="flex items-center justify-center gap-3">
            {[Monitor, Smartphone, Gamepad2, Wifi].map((Icon, i) => (
              <div key={i} className="nm-raised-sm w-11 h-11 flex items-center justify-center">
                <Icon className="w-5 h-5 text-nm-text-secondary" />
              </div>
            ))}
            <span
              className="text-xs text-nm-text-secondary ml-2"
              data-i18n="home.hero.platforms"
            >
              Все платформы
            </span>
          </div>
        </div>
      </section>

      {/* ── Advantages strip ─────────────────────────── */}
      <section className="container mx-auto px-4 md:px-6 pb-20">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
          {[
            { icon: Globe, key: "home.adv.click", label: "В 1 клик" },
            { icon: Monitor, key: "home.adv.devices", label: "Все устройства" },
            { icon: Activity, key: "home.adv.speed", label: "До 10 Гбит/с" },
            { icon: Shield, key: "home.adv.security", label: "Безопасность" },
            { icon: EyeOff, key: "home.adv.noads", label: "Без рекламы" },
            { icon: Zap, key: "home.adv.youtube", label: "YouTube 4K" },
          ].map((item) => (
            <div key={item.key} className="nm-flat p-4 flex items-center gap-3">
              <div className="nm-circle-pressed w-10 h-10 flex items-center justify-center shrink-0">
                <item.icon className="w-4 h-4 text-nm-accent" />
              </div>
              <span
                className="text-sm font-medium text-nm-text"
                data-i18n={item.key}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────── */}
      <section id="features" className="container mx-auto px-4 md:px-6 py-20 md:py-28">
        <div className="text-center mb-16">
          <h2
            className="font-heading text-3xl md:text-4xl font-bold text-nm-text mb-3 tracking-tight"
            data-i18n="home.features.title"
          >
            Как это работает
          </h2>
          <p
            className="text-nm-text-secondary max-w-sm mx-auto"
            data-i18n="home.features.subtitle"
          >
            Три причины выбрать ПроксисВпнович
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="nm-raised p-8">
              <div className="nm-circle-pressed w-14 h-14 flex items-center justify-center mb-6">
                <f.icon className="w-6 h-6 text-nm-accent" />
              </div>
              <h3
                className="font-heading font-semibold text-lg text-nm-text mb-2"
                data-i18n={`home.feature.${i}.title`}
              >
                {f.title}
              </h3>
              <p
                className="text-nm-text-secondary text-sm leading-relaxed"
                data-i18n={`home.feature.${i}.desc`}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Compat (Russian services routing) ────────── */}
      <section id="compat" className="container mx-auto px-4 md:px-6 py-20 md:py-28">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <h2
            className="font-heading text-3xl md:text-4xl font-bold text-nm-text mb-3 tracking-tight"
            data-i18n="home.compat.title"
          >
            Российские сайты работают как обычно
          </h2>
          <p
            className="text-nm-text-secondary"
            data-i18n="home.compat.subtitle"
          >
            Не нужно выключать VPN перед оплатой на Озоне или входом в Сбер
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Left: description + bullets */}
          <div className="nm-raised p-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="nm-circle-pressed w-12 h-12 flex items-center justify-center">
                <Activity className="w-5 h-5 text-nm-accent" />
              </div>
              <h3
                className="font-heading font-semibold text-xl text-nm-text"
                data-i18n="home.compat.feature.title"
              >
                Адаптивная маршрутизация
              </h3>
            </div>
            <p
              className="text-nm-text-secondary text-sm leading-relaxed mb-4"
              data-i18n="home.compat.feature.p1"
            >
              Сетевые правила автоматически определяют российские ресурсы и направляют
              трафик к ним напрямую — через ваше обычное соединение. Зарубежные сервисы
              продолжают работать через защищённый канал.
            </p>
            <p
              className="text-nm-text text-sm font-medium mb-5"
              data-i18n="home.compat.feature.p2"
            >
              Без ручного переключения. В одном режиме работает всё.
            </p>
            <ul className="space-y-2.5">
              {[
                { key: "home.compat.li1", text: "Госуслуги, ФНС, Налог.ру, ЦУПИС" },
                { key: "home.compat.li2", text: "Сбер, Тинькофф, ВТБ, Альфа, Газпромбанк" },
                { key: "home.compat.li3", text: "Ozon, Wildberries, Яндекс.Маркет, Авито" },
                { key: "home.compat.li4", text: "Яндекс — Карты, Такси, Музыка, Кинопоиск" },
                { key: "home.compat.li5", text: "МТС, Билайн, Мегафон, Tele2 — личные кабинеты" },
                { key: "home.compat.li6", text: "Российские СМИ, видеосервисы и доставки" },
              ].map((li) => (
                <li key={li.key} className="flex items-start gap-2.5 text-sm text-nm-text-secondary">
                  <CheckCircle2 className="w-4 h-4 text-nm-accent shrink-0 mt-0.5" />
                  <span data-i18n={li.key}>{li.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: category grid */}
          <div className="grid grid-cols-2 gap-4 content-start">
            {[
              { icon: Landmark, key: "home.compat.cat.gov", title: "Госуслуги", sub: "ФНС, ЦУПИС" },
              { icon: CreditCard, key: "home.compat.cat.banks", title: "Банки", sub: "6+ крупных" },
              { icon: ShoppingBag, key: "home.compat.cat.market", title: "Маркетплейсы", sub: "5+ платформ" },
              { icon: MapPin, key: "home.compat.cat.yandex", title: "Яндекс", sub: "Все сервисы" },
              { icon: Smartphone, key: "home.compat.cat.telecom", title: "Операторы", sub: "Все 4 крупных" },
              { icon: Tv, key: "home.compat.cat.media", title: "СМИ и видео", sub: "Кинопоиск, KION" },
            ].map((cat) => (
              <div key={cat.key} className="nm-flat p-5">
                <div className="nm-circle-pressed w-11 h-11 flex items-center justify-center mb-3">
                  <cat.icon className="w-4 h-4 text-nm-accent" />
                </div>
                <div className="font-heading font-semibold text-sm text-nm-text mb-0.5" data-i18n={`${cat.key}.t`}>
                  {cat.title}
                </div>
                <div className="text-xs text-nm-text-secondary" data-i18n={`${cat.key}.s`}>
                  {cat.sub}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p
          className="text-center text-xs text-nm-text-secondary mt-10 max-w-2xl mx-auto opacity-70"
          data-i18n="home.compat.footnote"
        >
          Правила маршрутизации основаны на открытых геоинформационных списках (sing-geosite, sing-geoip) и обновляются автоматически.
        </p>
      </section>

      {/* ── Pricing ──────────────────────────────────── */}
      <section id="pricing" className="container mx-auto px-4 md:px-6 py-20 md:py-28">
        <div className="text-center mb-16">
          <h2
            className="font-heading text-3xl md:text-4xl font-bold text-nm-text mb-3 tracking-tight"
            data-i18n="home.pricing.title"
          >
            Цены
          </h2>
          <p
            className="text-nm-text-secondary max-w-sm mx-auto"
            data-i18n="home.pricing.subtitle"
          >
            Простая цена за каждое устройство
          </p>
        </div>

        <PlanSelector />
      </section>

      {/* ── FAQ ──────────────────────────────────────── */}
      <section id="faq" className="container mx-auto px-4 md:px-6 py-20 md:py-28">
        <div className="text-center mb-16">
          <h2
            className="font-heading text-3xl md:text-4xl font-bold text-nm-text mb-3 tracking-tight"
            data-i18n="home.faq.title"
          >
            Вопросы
          </h2>
          <p
            className="text-nm-text-secondary max-w-sm mx-auto"
            data-i18n="home.faq.subtitle"
          >
            Отвечаем на самые частые
          </p>
        </div>
        <FAQ keyPrefix="faq.home" />
      </section>

      {/* ── CTA ──────────────────────────────────────── */}
      <section className="container mx-auto px-4 md:px-6 py-16">
        <div className="nm-pressed p-12 md:p-16 text-center rounded-[28px]">
          <h2
            className="font-heading text-2xl md:text-3xl font-bold text-nm-text mb-3 tracking-tight"
            data-i18n="home.cta.title"
          >
            Готовы попробовать?
          </h2>
          <p
            className="text-nm-text-secondary mb-8 max-w-sm mx-auto text-sm"
            data-i18n="home.cta.subtitle"
          >
            Попробовать за 10 ₽
          </p>
          <Link
            href="/register"
            className="nm-btn-accent inline-block px-10 py-4 font-semibold"
            data-i18n="home.cta.btn"
          >
            Подключиться
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────── */}
      <footer className="container mx-auto px-4 md:px-6 py-8">
        <div className="nm-flat px-4 md:px-6 py-5 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-nm-text-secondary">
          <div className="flex items-center gap-2 font-medium">
            <Logo size={16} className="text-nm-accent" />
            <span>
              <span data-i18n="common.brand">ПроксисВпнович</span>{" "}
              <span className="opacity-60">(Proxysvpnovich)</span>
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <a href="#features" className="hover:text-nm-text transition" data-i18n="nav.features">Возможности</a>
            <a href="#pricing" className="hover:text-nm-text transition" data-i18n="nav.pricing">Цены</a>
            <a href="#faq" className="hover:text-nm-text transition" data-i18n="nav.faq">FAQ</a>
            <Link href="/terms" className="hover:text-nm-text transition" data-i18n="nav.terms">Оферта</Link>
            <Link href="/privacy" className="hover:text-nm-text transition" data-i18n="nav.privacy">Конфиденциальность</Link>
            <Link href="/login" className="hover:text-nm-text transition" data-i18n="nav.dashboard">Кабинет</Link>
          </div>
          <div>© {new Date().getFullYear()}</div>
        </div>
      </footer>
    </div>
  );
}

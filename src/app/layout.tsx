// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Rubik, Figtree, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import AttributionCapture from "@/components/AttributionCapture";
import Localizer from "@/i18n/Localizer";

const rubik = Rubik({
  subsets: ["cyrillic", "latin"],
  variable: "--font-rubik",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
  display: "swap",
});

const SITE_URL = "https://kovravpn.com";
const SITE_NAME = "Kovra";
const SITE_NAME_LATIN = "Kovra";
const DEFAULT_TITLE =
  "Kovra (Kovra) — приватный VPN с низким пингом · 100 ₽/мес";
const DEFAULT_DESC =
  "Kovra (Kovra) — VPN на VLESS Reality. Низкий пинг, надёжное шифрование, серверы в Европе. Подключение за 2 минуты, оплата от 10 ₽.";

/**
 * Brand-recognition keywords. Google ignores `keywords` for ranking but
 * Yandex still uses it lightly, and more importantly: every spelling
 * variant Google sees on-page (title + description + keywords + JSON-LD
 * alternateName + visible body text) increases the chance the algorithm
 * stops auto-correcting "kovra" -> "proxy vpn" in SERPs. The current
 * auto-correct is the single biggest reason brand searches fail.
 */
const BRAND_KEYWORDS = [
  // Latin spellings (the critical signal — without these Google
  // collapses the brand into the generic "proxy vpn" mass-market term)
  "Kovra",
  "kovra",
  "kovra",
  "Proxys VPN",
  "Kovra",
  // Cyrillic
  "Kovra",
  "Kovra",
  "Прокси ВПН",
  // Technical / topical
  "VPN VLESS Reality",
  "ML-KEM VPN",
  "VPN с пост-квантовым шифрованием",
  // Product USP
  "приватный VPN",
  "быстрый VPN на VLESS",
  "VPN для игр с низким пингом",
  "VPN с низким пингом",
];

/**
 * Root metadata.
 *
 * - `title.template` lets every page override only its own segment ("Войти")
 *   while we always append " | Kovra" for brand recall in SERPs.
 * - `title.default` is what the homepage uses (it has no template arg).
 * - `metadataBase` makes relative OG/canonical URLs resolve against the
 *   production origin, fixes Yandex/Google complaining about bare paths.
 * - Concrete per-page `title` + `description` + `alternates.canonical` go
 *   in each page.tsx (server pages) or in a route-scoped layout.tsx
 *   (client pages like /login and /register).
 *
 * Brand-recognition tweaks (April 2026, Tier-0 SEO patch):
 * - DEFAULT_TITLE / DEFAULT_DESC now carry the Latin spelling
 *   "Kovra" alongside Cyrillic so Google can connect the two
 *   forms and stop auto-correcting "kovra" -> "proxy vpn".
 * - `keywords` exposes every spelling variant we want indexed.
 * - `verification.google` is a placeholder — fill in the
 *   `google-site-verification` content string from GSC -> Settings ->
 *   Ownership verification -> HTML tag method. Even if the property is
 *   already verified via DNS TXT through Cloudflare, adding the meta tag
 *   is a free brand-signal and makes it trivial to verify additional
 *   GSC properties (e.g. subdomains) later.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    template: `%s | ${SITE_NAME} (${SITE_NAME_LATIN})`,
    default: DEFAULT_TITLE,
  },
  description: DEFAULT_DESC,
  applicationName: `${SITE_NAME} (${SITE_NAME_LATIN})`,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "technology",
  keywords: BRAND_KEYWORDS,
  formatDetection: { email: false, address: false, telephone: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: `${SITE_NAME} (${SITE_NAME_LATIN})`,
    locale: "ru_RU",
    url: SITE_URL,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
    // hreflang signals to Google that this is the canonical Russian-language
    // version of the site. Helps with regional ranking in RU-targeted SERPs.
    languages: {
      "ru-RU": SITE_URL,
      "x-default": SITE_URL,
    },
  },
  // Search-engine ownership verification.
  // - Yandex: file token (file at /public/yandex_*.html stays valid as
  //   fallback verification method).
  // - Bing (msvalidate.01): unchanged.
  // - Google: optional meta tag. Property is already verified via DNS TXT
  //   through Cloudflare; this is an additional fallback. Fill the empty
  //   string with the `content="..."` value from
  //   GSC -> Add property -> URL prefix -> HTML tag method.
  //   Leave empty to skip emitting the meta tag.
  verification: {
    yandex: "9e5cb19e70155ec9",
    // google: "PASTE_GOOGLE_SITE_VERIFICATION_CONTENT_HERE",
    other: {
      "msvalidate.01": "4050D59C4A347F875971D050C105F703",
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f3f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1d23" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={`${rubik.variable} ${figtree.variable} ${schibsted.variable} antialiased scroll-smooth`}
      suppressHydrationWarning
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.setAttribute('data-theme','dark')}else{document.documentElement.setAttribute('data-theme','light')}}catch(e){}})()`,
          }}
        />
        {/* Boot the language attribute synchronously so the SSR-rendered
            RU markup gets a correct <html lang> early. The actual text
            swap happens in the Localizer client component below. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var u=new URL(location.href);var fromUrl=u.searchParams.get('lang');var saved=localStorage.getItem('lang');var l=(fromUrl==='en'||fromUrl==='ru')?fromUrl:((saved==='en'||saved==='ru')?saved:'ru');document.documentElement.setAttribute('lang',l);document.documentElement.setAttribute('data-lang',l)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans">
        {children}
        <AttributionCapture />
        <Localizer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

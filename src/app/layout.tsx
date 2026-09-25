// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import {
  Rubik,
  Figtree,
  Schibsted_Grotesk,
  Inter_Tight,
  Instrument_Serif,
  Playfair_Display,
  JetBrains_Mono,
} from "next/font/google";
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

/* ── Kovra v2 brand faces ─────────────────────────────
   Inter Tight  – base + headings (500–600, tight tracking)
   Instrument Serif Italic – single emotional display phrase (latin only)
   Playfair Display Italic – cyrillic fallback for the serif accent
   JetBrains Mono – labels, prices, digits, badges */
const interTight = Inter_Tight({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter-tight",
  display: "swap",
});

const instrument = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const playfair = Playfair_Display({
  weight: ["400", "500"],
  style: ["normal", "italic"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-playfair",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-jbmono",
  display: "swap",
});

const SITE_URL = "https://kovravpn.com";
const SITE_NAME = "Kovra";
const SITE_NAME_LATIN = "Kovra";
const DEFAULT_TITLE =
  "Kovra VPN: Anonymous, No Logs, No Email · Crypto & Cards";
const DEFAULT_DESC =
  "Anonymous VPN with no email signup and a strict no-logs policy. Pay with USDT, BTC or card. VLESS Reality traffic camouflage, EU servers, online in 2 minutes.";

/**
 * Brand-recognition keywords. Google ignores `keywords` for ranking but
 * Yandex still uses it lightly, and more importantly: every spelling
 * variant Google sees on-page (title + description + keywords + JSON-LD
 * alternateName + visible body text) increases the chance the algorithm
 * stops auto-correcting "kovra" -> "proxy vpn" in SERPs. The current
 * auto-correct is the single biggest reason brand searches fail.
 *
 * Two groups below. Brand terms exist for that disambiguation problem;
 * category terms describe what the product is, so the page has a
 * vocabulary overlap with the queries it should appear for. Category
 * terms are only listed here when the concept is genuinely covered by
 * the site — the matching depth lives in /guides, and a keyword with no
 * corresponding content is the kind of mismatch that costs trust rather
 * than earning rankings.
 */
const BRAND_KEYWORDS = [
  // Brand and technology
  "Kovra",
  "Kovra VPN",
  "VPN VLESS Reality",
  "ML-KEM VPN",
  "post-quantum VPN",
  "VLESS Reality",
  "Xray VPN",
  // Category
  "private VPN",
  "fast VPN",
  "low ping VPN",
  "no-logs VPN",
  "anonymous VPN",
  "VPN without email",
  "VPN without phone number",
  // Payments
  "crypto VPN",
  "USDT VPN",
  "VPN with crypto payment",
  "pay for VPN with bitcoin",
  "VPN no credit card",
  "cheap private VPN",
  // Proxy and censorship intent
  "VPN vs proxy",
  "proxy alternative",
  "SOCKS5 proxy alternative",
  "DPI bypass VPN",
  "VPN that works in China",
  "unblock websites VPN",
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
    yandex: "e87b60b208738ec4",
    // google: "PASTE_GOOGLE_SITE_VERIFICATION_CONTENT_HERE",
    other: {
      "msvalidate.01": "4050D59C4A347F875971D050C105F703",
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#050506" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={`${rubik.variable} ${figtree.variable} ${schibsted.variable} ${interTight.variable} ${instrument.variable} ${playfair.variable} ${jetbrainsMono.variable} antialiased scroll-smooth`}
      suppressHydrationWarning
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        {/* Theme boot (src/lib/theme.ts): preference = stored "light" | "dark",
            otherwise "system". Sets the resolved theme before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement,t=null;try{t=localStorage.getItem('theme')}catch(e){}var p=(t==='light'||t==='dark')?t:'system';var r=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;d.setAttribute('data-theme',r);d.setAttribute('data-theme-pref',p);d.style.colorScheme=r;}catch(e){}})()`,
          }}
        />
        {/* Language boot. Cabinet pages (/login, /register, /dashboard)
            resolve ?lang, a real saved choice, then navigator.languages
            (keep in sync with src/i18n/resolve.ts) and hide the English SSR
            markup until React re-renders in that language. Every other page
            keeps the original RU/EN logic; the Localizer swaps its text. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement,S=['en','ru','es','de','fr'],l=null;if(/^\\/(login|register|dashboard)(\\/|$)/.test(location.pathname)){var q=new URL(location.href).searchParams.get('lang'),s=null,x=null;try{s=localStorage.getItem('kovra_lang');x=localStorage.getItem('kovra_lang_explicit')}catch(e){}if(S.indexOf(q)>=0)l=q;else if(S.indexOf(s)>=0&&(s!=='en'||x==='1'))l=s;else{var n=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language||''];for(var i=0;i<n.length&&!l;i++){var c=String(n[i]).trim().toLowerCase().split(/[-_]/)[0];if(S.indexOf(c)>=0)l=c;}}if(!l)l='en';if(l!=='en'){d.classList.add('kc-lang-pending');setTimeout(function(){d.classList.remove('kc-lang-pending')},1200);}}else{var u=new URL(location.href),fromUrl=u.searchParams.get('lang'),saved=localStorage.getItem('lang');l=(fromUrl==='en'||fromUrl==='ru')?fromUrl:((saved==='en'||saved==='ru')?saved:'ru');}d.setAttribute('lang',l);d.setAttribute('data-lang',l);}catch(e){}})()`,
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

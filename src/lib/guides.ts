// src/lib/guides.ts
//
// Registry of English SEO guides under /guides. Single source of truth for
// the listing page, per-article pages, sitemap entries and Article JSON-LD.
// Content itself lives in src/app/guides/<slug>/page.tsx (server-rendered
// English, unlike the RU-first pages: these target EN search intent).

export interface GuideMeta {
  slug: string;
  /** H1 / SERP title (without the " | Kovra" template suffix). */
  title: string;
  /** Meta description, ~150 chars. */
  description: string;
  /** Short card teaser for the listing page. */
  teaser: string;
  tag: "Payments" | "Privacy" | "Protocols";
  /** ISO dates for schema + sitemap. */
  published: string;
  updated: string;
  minutes: number;
  keywords: string[];
}

export const SITE_URL = "https://kovravpn.com";

export const GUIDES: readonly GuideMeta[] = [
  {
    slug: "pay-for-vpn-with-crypto",
    title: "How to Pay for a VPN with Crypto (USDT, BTC): No Card, No KYC",
    description:
      "Step-by-step guide to paying for a VPN with cryptocurrency: USDT on TRC-20, BEP-20 and ERC-20, Bitcoin, network fees compared, common mistakes, privacy tips.",
    teaser:
      "USDT, BTC and 300+ coins, which network to pick, what fees to expect and the mistakes that cost people money.",
    tag: "Payments",
    published: "2026-07-07",
    updated: "2026-07-07",
    minutes: 8,
    keywords: [
      "pay for vpn with crypto",
      "vpn crypto payment",
      "buy vpn with bitcoin",
      "buy vpn with usdt",
      "anonymous vpn payment",
    ],
  },
  {
    slug: "vpn-without-email",
    title: "VPN Without Email or Phone Number: How Anonymous Signup Works",
    description:
      "How to get a VPN account without giving an email address or phone number: Telegram-only signup, crypto payment, what you trade away and when it matters.",
    teaser:
      "What a no-email signup really removes from the data trail, what you give up in return, and how to do it in practice.",
    tag: "Privacy",
    published: "2026-07-07",
    updated: "2026-07-07",
    minutes: 7,
    keywords: [
      "vpn without email",
      "vpn without phone number",
      "anonymous vpn account",
      "no email vpn signup",
      "vpn no personal data",
    ],
  },
  {
    slug: "vless-reality-protocol",
    title: "VLESS + Reality Explained: Why It Beats OpenVPN and WireGuard",
    description:
      "What the VLESS protocol and Reality transport actually do, how TLS camouflage defeats DPI, performance versus OpenVPN and WireGuard, and post-quantum ML-KEM.",
    teaser:
      "TLS camouflage, no giveaway handshake, real browser fingerprints. How the protocol behind Kovra works and where classic VPNs fail.",
    tag: "Protocols",
    published: "2026-07-07",
    updated: "2026-07-07",
    minutes: 9,
    keywords: [
      "vless reality protocol",
      "vless vs wireguard",
      "reality protocol vpn",
      "xray vless explained",
      "dpi resistant vpn protocol",
    ],
  },
  {
    slug: "how-to-verify-no-logs-vpn",
    title: "No-Logs VPN Claims: How to Actually Verify Them (2026 Checklist)",
    description:
      "A practical checklist for testing no-logs VPN claims: jurisdiction, audits, court evidence, RAM-only servers, payment trails, plus the leak tests you can run yourself.",
    teaser:
      "Every VPN says it keeps no logs. A checklist of what you can verify from the outside, and the red flags that end the conversation.",
    tag: "Privacy",
    published: "2026-07-07",
    updated: "2026-07-07",
    minutes: 8,
    keywords: [
      "no log vpn verify",
      "no logs vpn check",
      "vpn logging policy",
      "how to test vpn privacy",
      "vpn audit meaning",
    ],
  },
  {
    slug: "vpn-that-accepts-usdt",
    title: "VPN That Accepts USDT (TRC-20): Full Setup in 5 Minutes",
    description:
      "Find and set up a VPN that accepts USDT: TRC-20 vs BEP-20 fees, exact payment walkthrough, connecting your first device, renewals and troubleshooting.",
    teaser:
      "From an empty wallet field to an active connection in five minutes, with the network fee table you should read first.",
    tag: "Payments",
    published: "2026-07-07",
    updated: "2026-07-07",
    minutes: 7,
    keywords: [
      "vpn accepts usdt",
      "usdt vpn",
      "vpn pay with tether",
      "trc20 vpn payment",
      "vpn subscription usdt",
    ],
  },
] as const;

export function getGuide(slug: string): GuideMeta {
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) throw new Error(`unknown guide slug: ${slug}`);
  return g;
}

/** Related guides for the footer block: everything except self, first 3. */
export function relatedGuides(slug: string): GuideMeta[] {
  return GUIDES.filter((g) => g.slug !== slug).slice(0, 3);
}

/** schema.org Article for a guide. Rendered via jsonLd() like other schemas. */
export function buildGuideArticleSchema(g: GuideMeta, ogImage: string) {
  const url = `${SITE_URL}/guides/${g.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    datePublished: g.published,
    dateModified: g.updated,
    inLanguage: "en",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: [ogImage],
    author: { "@type": "Organization", name: "Kovra", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "Kovra",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-192.png` },
    },
  };
}

export function fmtGuideDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Next Metadata object for a guide page (title, canonical, OG article). */
export function buildGuideMetadata(
  slug: string,
  ogImage: string,
): {
  title: string;
  description: string;
  keywords: string[];
  alternates: { canonical: string };
  openGraph: {
    type: "article";
    title: string;
    description: string;
    url: string;
    publishedTime: string;
    modifiedTime: string;
    images: { url: string; width: number; height: number; alt: string }[];
  };
  twitter: { title: string; description: string; images: string[] };
} {
  const g = getGuide(slug);
  return {
    title: g.title,
    description: g.description,
    keywords: g.keywords,
    alternates: { canonical: `/guides/${g.slug}` },
    openGraph: {
      type: "article",
      title: `${g.title} | Kovra`,
      description: g.description,
      url: `/guides/${g.slug}`,
      publishedTime: g.published,
      modifiedTime: g.updated,
      images: [{ url: ogImage, width: 1200, height: 630, alt: g.title }],
    },
    twitter: {
      title: `${g.title} | Kovra`,
      description: g.description,
      images: [ogImage],
    },
  };
}

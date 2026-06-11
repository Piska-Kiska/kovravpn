// src/lib/structured-data.ts
//
// Schema.org structured data builders for Google/Yandex rich results.
//
// Output is meant to be serialized with JSON.stringify and injected as a
// <script type="application/ld+json"> block. Using JSON.stringify (vs writing
// JSON literals by hand) avoids escape-bug risk when descriptions contain
// quotes, Unicode, or line breaks.
//
// We don't use @context/@type typings from schema-dts because only a few
// specific shapes are used here and pulling in the dependency isn't worth
// the ~250KB type overhead.
//
// Reference:
// - Organization: https://schema.org/Organization
// - FAQPage: https://schema.org/FAQPage
// - HowTo: https://schema.org/HowTo
// - BreadcrumbList: https://schema.org/BreadcrumbList
// - Product: https://schema.org/Product

import { FAQ_HOME, type FaqItem } from "./faq-items";

const SITE_URL = "https://kovravpn.com";
const ORG_NAME = "Kovra";
const ORG_NAME_LATIN = "Kovra";
const ORG_LEGAL_NAME = "Kovra";

/**
 * Organization schema — appears in Google knowledge panel when someone
 * searches for the brand name. Include in root layout so it ships on every
 * page; Google dedupes repeated Organization declarations across the site.
 *
 * Tier-0 brand-recognition tweaks (April 2026):
 * - `alternateName` carries every spelling variant (Latin transliteration
 *   "Kovra", short forms, Cyrillic alternatives). This is the
 *   strongest single signal we can give Google to stop treating
 *   "kovra" as a typo of "proxy vpn".
 * - `knowsAbout` declares topical authority for VPN / VLESS / ML-KEM
 *   queries. Helps Google match the org to topical SERPs.
 * - `foundingDate` and `slogan` add knowledge-panel completeness signals.
 *
 * Note on `alternateName`: per schema.org spec the property accepts a
 * Text value, but in practice Google validates and ingests an array of
 * strings ("multiple values" pattern). Validators may emit a non-blocking
 * warning; the data is still indexed.
 */
export function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: ORG_NAME,
    legalName: ORG_LEGAL_NAME,
    alternateName: [ORG_NAME_LATIN, "Kovra VPN"],
    url: SITE_URL,
    logo: `${SITE_URL}/icon-192.png`,
    image: `${SITE_URL}/og-image.png`,
    slogan: "Fast, private VPN on VLESS Reality",
    foundingDate: "2026-04",
    description:
      "Kovra is a fast, private VPN on VLESS Reality. Low ping, unblocking, servers across Europe.",
    knowsAbout: [
      "VPN",
      "VLESS Reality",
      "ML-KEM",
      "post-quantum cryptography",
      "DPI bypass",
      "обход блокировок Roskomnadzor",
      "VPN для игр",
    ],
    sameAs: [
      "https://t.me/KovraVPN_bot",
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "noreply@kovravpn.com",
        availableLanguage: ["Russian", "ru"],
      },
    ],
  };
}

/**
 * WebSite schema — separate from Organization, signals that the brand
 * has a canonical website with its own identity. Combined with the
 * Organization schema above, this gives Google two reinforcing
 * brand-recognition entities.
 */
export function buildWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: ORG_NAME,
    alternateName: ORG_NAME_LATIN,
    description:
      "Kovra — a fast, private VPN on VLESS Reality.",
    inLanguage: "ru-RU",
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

/**
 * Product / Offer schema — gives Google explicit price + availability
 * signals so the homepage may render a product rich result with the
 * a product rich result. Keep all human-readable strings consistent with
 * what's visible in <PlanSelector />; mismatches trigger a deranking
 * penalty.
 */
export function buildProductSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `${ORG_NAME} (${ORG_NAME_LATIN})`,
    description:
      "Kovra VPN. VLESS Reality, post-quantum ML-KEM encryption, servers across Europe, low ping. Supports Windows, macOS, iOS, Android.",
    applicationCategory: "SecurityApplication",
    applicationSubCategory: "VPN",
    operatingSystem: "Windows, macOS, iOS, Android, Linux",
    url: SITE_URL,
    image: `${SITE_URL}/og-image.png`,
    softwareVersion: "1.0",
    inLanguage: ["en"],
    author: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/register`,
      priceCurrency: "USD",
      price: "5.00",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "5.00",
        priceCurrency: "USD",
        unitText: "MONTH",
        referenceQuantity: {
          "@type": "QuantitativeValue",
          value: "1",
          unitCode: "MON",
        },
      },
      availability: "https://schema.org/InStock",
      seller: { "@id": `${SITE_URL}/#organization` },
    },
  };
}

/**
 * FAQPage schema — attach to any page that renders a visible FAQ accordion.
 * Google will render the questions as an expandable block in search results,
 * increasing CTR for relevant queries.
 *
 * All FAQ items must be visible on the same URL as the schema — Google
 * deranks pages where schema content isn't visible to users. The items
 * parameter must reference the same list that powers the visible accordion.
 *
 * @param items FAQ list — pass FAQ_HOME for "/", FAQ_GUIDE for "/guide".
 *              Defaults to FAQ_HOME so legacy callers without arguments
 *              keep producing the homepage schema.
 */
export function buildFaqPageSchema(items: readonly FaqItem[] = FAQ_HOME) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a,
      },
    })),
  };
}

export interface HowToStep {
  name: string;
  text: string;
}

/**
 * HowTo schema — for /guide. Describes a task ("Connect to Kovra") with
 * ordered steps. Google may render a step-by-step rich result with numbers.
 *
 * Guide has per-platform sections (Android, iOS, Windows, macOS). We export
 * one HowTo per platform so each section can be surfaced independently.
 */
export function buildHowToSchema(opts: {
  name: string;
  description: string;
  url: string;
  steps: HowToStep[];
  totalTime?: string; // ISO 8601 duration, e.g. "PT5M"
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: opts.name,
    description: opts.description,
    url: opts.url,
    ...(opts.totalTime ? { totalTime: opts.totalTime } : {}),
    step: opts.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

export interface BreadcrumbItem {
  /** User-facing name shown in the SERP crumb trail (localized). */
  name: string;
  /** Absolute URL for this step. Use the canonical URL — relative paths
   *  work but some validators warn. */
  url: string;
}

/**
 * BreadcrumbList schema — helps search engines replace the raw URL path
 * in result snippets with a localized, human-readable crumb trail
 * ("Главная › Инструкция" instead of "kovravpn.com › guide").
 *
 * Even on flat sites like ours, Yandex and Bing pick this up reliably;
 * Google sometimes substitutes its own URL-derived crumbs.
 *
 * Always include the homepage as the first element — Google's policy
 * expects a full path from the site root.
 */
export function buildBreadcrumbSchema(items: readonly BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}


/**
 * Helper: render any schema object as a <script> string. Use inside a React
 * component like:
 *
 *   <script
 *     type="application/ld+json"
 *     dangerouslySetInnerHTML={{ __html: jsonLd(buildFaqPageSchema()) }}
 *   />
 *
 * The returned string is already JSON-safe; further escaping would break
 * parsing.
 */
export function jsonLd(schema: unknown): string {
  // Escape </ to avoid breaking out of the <script> tag if any content
  // contains the literal sequence. JSON.stringify does not handle this.
  return JSON.stringify(schema).replace(/</g, "\\u003c");
}

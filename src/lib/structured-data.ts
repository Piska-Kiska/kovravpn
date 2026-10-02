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
// - FAQPage: https://schema.org/FAQPage
// - HowTo: https://schema.org/HowTo
// - BreadcrumbList: https://schema.org/BreadcrumbList
//
// The Organization, WebSite and Product builders were deleted on 02.10.2026:
// nothing called them, and they carried "Roskomnadzor" in knowsAbout,
// inLanguage ru-RU, ML-KEM and "servers across Europe". Rebuild them from
// what the site says today if they are ever needed.

import type { FaqItem } from "./faq-items";

/**
 * FAQPage schema — attach to any page that renders a visible FAQ.
 * Google stopped showing FAQ rich results on 7 May 2026; Yandex and AI
 * answer engines still read the markup, so it stays, word for word the same
 * as the visible questions and answers.
 *
 * All FAQ items must be visible on the same URL as the schema — Google
 * deranks pages where schema content isn't visible to users. The items
 * parameter must reference the same list that powers the visible accordion.
 *
 * @param items The same list that renders the visible FAQ.
 */
export function buildFaqPageSchema(items: readonly FaqItem[]) {
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

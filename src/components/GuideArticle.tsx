// src/components/GuideArticle.tsx
//
// Shared shell for /guides/<slug> pages: breadcrumbs, header, prose body,
// statically rendered FAQ (fully indexable, no accordion), CTA band and
// related links. Injects Article + BreadcrumbList + FAQPage JSON-LD.
import Link from "next/link";
import {
  buildFaqPageSchema,
  buildBreadcrumbSchema,
  jsonLd,
} from "@/lib/structured-data";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import GuideKeywords from "@/components/GuideKeywords";
import {
  SITE_URL,
  getGuide,
  relatedGuides,
  buildGuideArticleSchema,
  fmtGuideDate,
} from "@/lib/guides";

export default function GuideArticle({
  slug,
  faq,
  children,
}: {
  slug: string;
  faq: readonly FaqItem[];
  children: React.ReactNode;
}) {
  const g = getGuide(slug);
  const url = `${SITE_URL}/guides/${g.slug}`;
  const og = ogImageUrl(g.title, "Kovra Guides");
  const related = relatedGuides(slug);

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(buildGuideArticleSchema(g, og)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            buildBreadcrumbSchema([
              { name: "Home", url: `${SITE_URL}/` },
              { name: "Guides", url: `${SITE_URL}/guides` },
              { name: g.title, url },
            ]),
          ),
        }}
      />
      {faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(buildFaqPageSchema(faq)) }}
        />
      )}

      <div className="gd-wrap gd-narrow">
        <nav className="gd-crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className="gd-sep">/</span>
          <Link href="/guides">Guides</Link>
          <span className="gd-sep">/</span>
          <span>{g.tag}</span>
        </nav>

        <header className="gd-article-head">
          <h1>{g.title}</h1>
          <div className="gd-meta">
            <span className="gd-tag">{g.tag}</span>
            <span>Updated {fmtGuideDate(g.updated)}</span>
            <span>{g.minutes} min read</span>
          </div>
        </header>

        {/* Direct answer, rendered before the body. Mirrors `abstract` in
            the Article schema word-for-word: answer engines that quote it
            must find the same sentence on the page. */}
        {g.tldr && (
          <aside className="gd-answer" aria-label="Short answer">
            <span className="gd-answer-k">Short answer</span>
            <p>{g.tldr}</p>
          </aside>
        )}

        <article className="gd-prose">{children}</article>

        {faq.length > 0 && (
          <section className="gd-faq" id="faq">
            <h2>Frequently asked questions</h2>
            {faq.map((item, i) => (
              <div className="gd-faq-item" key={i}>
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </section>
        )}

        <section className="gd-cta">
          <h2>Private by design, ready in 2 minutes</h2>
          <p>
            Kovra runs on VLESS + Reality, takes USDT, BTC and cards, and never
            asks for a phone number. Plans from $2.75 per month.
          </p>
          <div className="gd-cta-row">
            <a href="/register" className="k-btn k-btn-gold">
              Get Kovra
            </a>
            <a href="/#pricing" className="k-btn k-btn-ghost">
              See pricing
            </a>
          </div>
        </section>

        <section className="gd-related">
          <h2>Keep reading</h2>
          <div className="gd-grid">
            {related.map((r) => (
              <Link
                href={`/guides/${r.slug}`}
                className="gd-card"
                key={r.slug}
              >
                <span className="gd-tag">{r.tag}</span>
                <h2 style={{ fontSize: 17 }}>{r.title}</h2>
                <span className="gd-more">Read guide →</span>
              </Link>
            ))}
          </div>
        </section>

        <GuideKeywords slug={slug} />
      </div>
    </main>
  );
}

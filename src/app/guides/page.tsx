// src/app/guides/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import {
  buildBreadcrumbSchema,
  jsonLd,
} from "@/lib/structured-data";
import { ogImageUrl } from "@/lib/og-url";
import { GUIDES, SITE_URL, fmtGuideDate } from "@/lib/guides";

const TITLE = "VPN Guides: Crypto Payments, Protocols, Privacy";
const DESC =
  "Practical, no-fluff guides from the Kovra team: paying for a VPN with crypto, signing up without an email, how VLESS + Reality works, and how to verify no-logs claims.";

const OG = {
  url: ogImageUrl("Kovra Guides", "Crypto payments · Protocols · Privacy"),
  width: 1200,
  height: 630,
  alt: TITLE,
};

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/guides" },
  openGraph: {
    title: `${TITLE} | Kovra`,
    description: DESC,
    url: "/guides",
    images: [OG],
  },
  twitter: {
    title: `${TITLE} | Kovra`,
    description: DESC,
    images: [OG.url],
  },
};

export default function GuidesPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            buildBreadcrumbSchema([
              { name: "Home", url: `${SITE_URL}/` },
              { name: "Guides", url: `${SITE_URL}/guides` },
            ]),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "ItemList",
            itemListElement: GUIDES.map((g, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${SITE_URL}/guides/${g.slug}`,
              name: g.title,
            })),
          }),
        }}
      />

      <div className="gd-wrap">
        <section className="gd-hero">
          <h1 className="k-metal">Guides</h1>
          <p>
            Practical answers on crypto payments, censorship-resistant
            protocols and privacy that survives contact with reality. Written
            by the team that runs the servers.
          </p>
        </section>

        <section className="gd-grid" aria-label="All guides">
          {GUIDES.map((g) => (
            <Link href={`/guides/${g.slug}`} className="gd-card" key={g.slug}>
              <span className="gd-tag">{g.tag}</span>
              <h2>{g.title}</h2>
              <p>{g.teaser}</p>
              <div className="gd-meta">
                <span>{fmtGuideDate(g.updated)}</span>
                <span>{g.minutes} min read</span>
              </div>
              <span className="gd-more">Read guide →</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}

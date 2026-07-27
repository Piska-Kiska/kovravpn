// src/app/guides/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import {
  buildBreadcrumbSchema,
  jsonLd,
} from "@/lib/structured-data";
import { ogImageUrl } from "@/lib/og-url";
import GuideKeywords from "@/components/GuideKeywords";
import { allGuideKeywords, assertKeywordLinks } from "@/lib/seo-keywords";
import { GUIDES, SITE_URL, fmtGuideDate, guidesByTag } from "@/lib/guides";

const TITLE = "VPN and Proxy Guides: Crypto Payments, Protocols, Censorship";
const DESC =
  "No-fluff guides from the Kovra team: VPN vs proxy, paying with USDT or Bitcoin, no-email signup, VLESS Reality, leak tests, and what still works on censored networks.";

const OG = {
  url: ogImageUrl("Kovra Guides", "VPN · Proxies · Crypto · Censorship"),
  width: 1200,
  height: 630,
  alt: TITLE,
};

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: allGuideKeywords(),
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

/** Short lead per topic bucket — a keyword-bearing sentence above each grid,
 *  which is also what makes the section headings useful rather than decorative. */
const GROUP_LEAD: Record<string, string> = {
  Payments: "Buying a VPN with crypto, cards, or nothing that identifies you.",
  Privacy: "No-logs claims, leak tests, and what anonymity actually covers.",
  Proxies: "Where a proxy is enough, where it quietly is not.",
  Protocols: "VLESS Reality, WireGuard, OpenVPN, Shadowsocks — compared on facts.",
  Censorship: "What still connects on filtered, throttled and probed networks.",
  Comparisons: "Honest looks at the providers people search for by name.",
  Setup: "Getting connected, per platform, without the guesswork.",
};

export default function GuidesPage() {
  assertKeywordLinks();
  const groups = guidesByTag();

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
            "@type": "CollectionPage",
            "@id": `${SITE_URL}/guides`,
            name: TITLE,
            description: DESC,
            inLanguage: "en",
            isPartOf: { "@id": `${SITE_URL}/#website` },
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: GUIDES.length,
              itemListElement: GUIDES.map((g, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: `${SITE_URL}/guides/${g.slug}`,
                name: g.title,
              })),
            },
          }),
        }}
      />

      <div className="gd-wrap">
        <section className="gd-hero">
          <h1 className="k-metal">VPN &amp; Proxy Guides</h1>
          <p>
            Practical answers on crypto payments, proxies versus VPNs,
            censorship-resistant protocols and privacy that survives contact
            with reality. {GUIDES.length} guides, written by the team that
            runs the servers.
          </p>
        </section>

        {groups.map((group) => (
          <section
            className="gd-group"
            key={group.tag}
            aria-label={`${group.tag} guides`}
          >
            <div className="gd-group-h">
              <h2>{group.tag}</h2>
              <span>{GROUP_LEAD[group.tag]}</span>
            </div>
            <div className="gd-grid">
              {group.items.map((g) => (
                <Link
                  href={`/guides/${g.slug}`}
                  className="gd-card"
                  key={g.slug}
                >
                  <span className="gd-tag">{g.tag}</span>
                  <h3>{g.title}</h3>
                  <p>{g.teaser}</p>
                  <div className="gd-meta">
                    <span>{fmtGuideDate(g.updated)}</span>
                    <span>{g.minutes} min read</span>
                  </div>
                  <span className="gd-more">Read guide →</span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <GuideKeywords heading="What people search for" />
      </div>
    </main>
  );
}

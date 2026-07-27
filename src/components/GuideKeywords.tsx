// src/components/GuideKeywords.tsx
//
// "Popular searches" block: a visible grid of real query phrases, each one
// linking to the guide that answers it. Rendered at the foot of every
// article and on the /guides hub.
//
// It is a navigation aid first (people do scan these and click), and an
// internal-linking mechanism second — see src/lib/seo-keywords.ts for why
// the anchor text is the query itself. Deliberately visible, styled like
// the rest of the page, and never hidden, cloaked or duplicated off-screen.
import Link from "next/link";
import { keywordLinksFor, KEYWORD_LINKS, type KeywordLink } from "@/lib/seo-keywords";

export default function GuideKeywords({
  slug,
  limit,
  heading = "Popular searches",
}: {
  /** Current guide slug; self-links are filtered out. Omit on the hub page. */
  slug?: string;
  limit?: number;
  heading?: string;
}) {
  const items: KeywordLink[] = slug
    ? keywordLinksFor(slug, limit ?? 16)
    : [...KEYWORD_LINKS].slice(0, limit ?? KEYWORD_LINKS.length);

  if (items.length === 0) return null;

  return (
    <section className="gd-kw" aria-labelledby="gd-kw-h">
      <h2 id="gd-kw-h">{heading}</h2>
      <ul className="gd-kw-list">
        {items.map((k) => (
          <li key={`${k.term}-${k.slug}`}>
            <Link href={`/guides/${k.slug}`}>{k.term}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

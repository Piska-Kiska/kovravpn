// src/lib/seo-keywords.ts
//
// Query-to-guide map powering the visible "Popular searches" block on
// /guides and at the foot of every article.
//
// Why this exists (the SEO reasoning, so nobody "simplifies" it away):
//
// 1. Anchor text. Internal links are the only anchor text we fully control.
//    A link labelled "vpn that works in china" pointing at that guide is a
//    far stronger relevance signal than one labelled "read more".
// 2. Crawl depth. Without it, a new guide is three clicks from the homepage
//    and reachable only through the paginated hub. With it, every article
//    links laterally into ~14 others, so a crawler that lands on any single
//    page discovers the whole cluster in one hop.
// 3. Long-tail coverage. Each term below is a real query shape people type.
//    Rendering them as visible, clickable links (never hidden text, never
//    stuffed into a footer nobody sees) keeps this on the legitimate side of
//    the line: it is a navigation aid that also happens to be keyword-dense.
//
// Rules for editing:
// - `term` is lowercase because it is a query, not a title. It renders as
//   written, and sentence-cased links would read as a menu instead of a
//   search suggestion.
// - Every `slug` must exist in GUIDES, or the build-time check in
//   assertKeywordLinks() throws during rendering of /guides.
// - Keep 2-4 terms per guide. More than that and the block turns into the
//   keyword-stuffed footer this file is explicitly trying not to be.

import { GUIDES } from "./guides";

export interface KeywordLink {
  /** The search phrase, used verbatim as the link's anchor text. */
  term: string;
  /** Target guide slug (must exist in GUIDES). */
  slug: string;
}

export const KEYWORD_LINKS: readonly KeywordLink[] = [
  // Payments
  { term: "pay for a vpn with crypto", slug: "pay-for-vpn-with-crypto" },
  { term: "vpn that accepts usdt", slug: "vpn-that-accepts-usdt" },
  { term: "buy a vpn with bitcoin", slug: "pay-vpn-with-bitcoin" },
  { term: "vpn with no credit card", slug: "pay-for-vpn-with-crypto" },
  { term: "best crypto vpn 2026", slug: "best-crypto-vpn-2026" },
  { term: "cheapest private vpn", slug: "cheapest-private-vpn" },
  { term: "vpn under $3 a month", slug: "cheapest-private-vpn" },

  // Privacy
  { term: "vpn without email", slug: "vpn-without-email" },
  { term: "truly anonymous vpn", slug: "truly-anonymous-vpn" },
  { term: "how to verify a no-logs vpn", slug: "how-to-verify-no-logs-vpn" },
  { term: "no-logs vpn for torrenting", slug: "no-logs-vpn-for-torrenting" },
  { term: "are free vpns safe", slug: "are-free-vpns-safe" },
  { term: "free vpn risks", slug: "are-free-vpns-safe" },
  { term: "dns leak test", slug: "vpn-leak-test" },
  { term: "webrtc leak test", slug: "vpn-leak-test" },
  { term: "is my vpn working", slug: "vpn-leak-test" },
  { term: "vpn for public wifi", slug: "vpn-for-public-wifi" },
  { term: "is hotel wifi safe", slug: "vpn-for-public-wifi" },

  // Proxies
  { term: "vpn vs proxy", slug: "vpn-vs-proxy" },
  { term: "difference between vpn and proxy", slug: "vpn-vs-proxy" },
  { term: "socks5 proxy vs vpn", slug: "socks5-proxy-vs-vpn" },
  { term: "what is a socks5 proxy", slug: "socks5-proxy-vs-vpn" },
  { term: "free proxy list", slug: "free-proxy-list-risks" },
  { term: "are free proxies safe", slug: "free-proxy-list-risks" },
  { term: "telegram proxy", slug: "telegram-proxy-vs-vpn" },
  { term: "mtproto proxy vs vpn", slug: "telegram-proxy-vs-vpn" },

  // Protocols
  { term: "vless reality explained", slug: "vless-reality-protocol" },
  { term: "wireguard vs openvpn", slug: "wireguard-vs-openvpn-vs-vless" },
  { term: "best vpn protocol", slug: "wireguard-vs-openvpn-vs-vless" },
  { term: "shadowsocks vs vless", slug: "shadowsocks-vs-vless-reality" },
  { term: "dpi bypass protocol", slug: "shadowsocks-vs-vless-reality" },

  // Censorship
  { term: "vpn that works in china", slug: "vpn-that-works-in-china" },
  { term: "great firewall bypass", slug: "vpn-that-works-in-china" },
  { term: "unblock websites at school", slug: "unblock-websites-at-school-or-work" },
  { term: "bypass work wifi restrictions", slug: "unblock-websites-at-school-or-work" },

  // Comparisons and setup
  { term: "mullvad alternative", slug: "mullvad-alternatives" },
  { term: "nordvpn alternative", slug: "nordvpn-alternative-crypto" },
  { term: "expressvpn alternative", slug: "expressvpn-alternative" },
  { term: "how to set up a vpn on iphone", slug: "how-to-set-up-vpn-on-iphone" },
  { term: "ios vpn setup", slug: "how-to-set-up-vpn-on-iphone" },
] as const;

/**
 * Fails loudly at render time if a term points at a slug that no longer
 * exists. Cheap (a few dozen lookups) and runs on a server component, so
 * a typo surfaces during `next build` instead of shipping a dead link.
 */
export function assertKeywordLinks(): void {
  const known = new Set(GUIDES.map((g) => g.slug));
  const broken = KEYWORD_LINKS.filter((k) => !known.has(k.slug));
  if (broken.length > 0) {
    throw new Error(
      `seo-keywords: unknown slug(s): ${broken.map((b) => b.slug).join(", ")}`,
    );
  }
}

/** Stable non-cryptographic hash so each slug gets a fixed starting offset. */
function offsetFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % KEYWORD_LINKS.length;
}

/**
 * Terms to show on a given article, excluding links back to itself.
 *
 * The starting offset is derived from the slug rather than fixed, so the
 * first entries in KEYWORD_LINKS do not collect every internal link on the
 * site while the last entries collect none. Deterministic per slug: the
 * markup is identical on every render, which matters for static generation
 * and for not confusing crawlers with shuffling content.
 */
export function keywordLinksFor(slug: string, limit = 16): KeywordLink[] {
  const pool = KEYWORD_LINKS.filter((k) => k.slug !== slug);
  const start = offsetFor(slug) % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  return rotated.slice(0, Math.min(limit, rotated.length));
}

/**
 * Every keyword in the registry, deduped — used as the `keywords` metadata
 * for the /guides hub so the section page itself carries the full topical
 * vocabulary of the cluster underneath it.
 */
export function allGuideKeywords(): string[] {
  const set = new Set<string>();
  for (const g of GUIDES) for (const k of g.keywords) set.add(k);
  for (const k of KEYWORD_LINKS) set.add(k.term);
  return [...set];
}

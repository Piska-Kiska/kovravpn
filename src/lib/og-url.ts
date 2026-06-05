// src/lib/og-url.ts
//
// Small helper to build OG image URLs without hand-encoding Cyrillic
// strings in each page's metadata. Emits a relative path — Next.js resolves
// it against `metadataBase` (https://proxysvpn.com) before serializing
// into the <meta property="og:image"> tag.

export function ogImageUrl(title: string, subtitle?: string): string {
  const params = new URLSearchParams({ title });
  if (subtitle) params.set("subtitle", subtitle);
  return `/api/og?${params.toString()}`;
}

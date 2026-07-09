import { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";

/**
 * Sitemap lists only publicly indexable pages. Auth routes (/login,
 * /register), the dashboard, and promo are intentionally excluded because
 * they carry `noindex` in their metadata — listing them here would signal
 * "index me" while their meta says the opposite, which search engines log
 * as a soft error in Search Console.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://kovravpn.com";
  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/guide`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/guides`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    ...GUIDES.map((g) => ({
      url: `${base}/guides/${g.slug}`,
      lastModified: new Date(g.updated),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
  ];
}

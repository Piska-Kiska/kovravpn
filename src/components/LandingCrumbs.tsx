// src/components/LandingCrumbs.tsx
//
// The breadcrumb of a landing page (Home / <page>): the visible trail and the
// BreadcrumbList markup that says the same, rendered together so they cannot
// disagree. Server component; styles are the .gd-crumbs rules of guides.css.
import Link from "next/link";
import { SITE_URL } from "@/lib/guides";
import { buildBreadcrumbSchema, jsonLd } from "@/lib/structured-data";

export default function LandingCrumbs({ name, path }: { name: string; path: string }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            buildBreadcrumbSchema([
              { name: "Home", url: `${SITE_URL}/` },
              { name, url: `${SITE_URL}${path}` },
            ]),
          ),
        }}
      />
      <nav className="gd-crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span className="gd-sep">/</span>
        <span>{name}</span>
      </nav>
    </>
  );
}

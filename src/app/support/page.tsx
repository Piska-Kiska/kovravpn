// src/app/support/page.tsx
//
// How to reach a person. Our app opens it as its support address in the app
// view (`?src=app`, lib/legal-routes.ts): no way home and no bot. English on
// the server; the page switches to the visitor's language on the client like
// /privacy and /terms (src/i18n/resolve.ts). Text: src/i18n/support.ts.
import Link from "next/link";
import { BackGlyph } from "@/components/chrome/glyphs";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import NavToggles from "@/components/NavToggles";
import SupportView from "@/components/SupportView";
import { isAppView, type PageSearchParams } from "@/lib/legal-routes";

export const metadata = {
  title: "Support — Kovra",
  description: "How to reach Kovra support, sign in to the app, fix a connection that does not work and delete your account.",
  alternates: {
    canonical: "https://kovravpn.com/support",
    languages: { en: "https://kovravpn.com/support", "x-default": "https://kovravpn.com/support" },
  },
  robots: { index: true, follow: true },
};

export default async function SupportPage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const appView = isAppView(await searchParams);
  return (
    <div className="min-h-screen">
      <SiteHeader home={!appView}>
        <NavToggles />
        {appView ? null : (
          <Link href="/" className="kh-link">
            <BackGlyph className="kh-link-glyph" />
            <span className="kh-link-text" data-i18n="common.back.home.short">Home</span>
          </Link>
        )}
      </SiteHeader>

      <main className="container mx-auto px-4 md:px-6 max-w-3xl pt-12 pb-20">
        <SupportView appView={appView} />
      </main>
    </div>
  );
}

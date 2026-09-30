// src/app/privacy/page.tsx
import Link from "next/link";
import { BackGlyph } from "@/components/chrome/glyphs";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import NavToggles from "@/components/NavToggles";
import LegalView from "@/components/LegalView";

// English on the server; the page switches to the visitor's language on
// the client (src/i18n/resolve.ts isVisitorLangPath, KP-08). The legal text
// itself is src/i18n/legal.ts, in all five site languages.
export const metadata = {
  title: "Privacy Policy — Kovra",
  description:
    "What data Kovra collects, how it is used and how it is protected. Also available in Russian, Spanish, German and French.",
  alternates: {
    canonical: "https://kovravpn.com/privacy",
    languages: { en: "https://kovravpn.com/privacy", "x-default": "https://kovravpn.com/privacy" },
  },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader>
        <NavToggles />
        <Link href="/" className="kh-link">
          <BackGlyph className="kh-link-glyph" />
          <span className="kh-link-text" data-i18n="common.back.home.short">Home</span>
        </Link>
      </SiteHeader>

      <main className="container mx-auto px-4 md:px-6 max-w-3xl pt-12 pb-20">
        <LegalView doc="privacy" />
      </main>
    </div>
  );
}

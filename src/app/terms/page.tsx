// src/app/terms/page.tsx
import Link from "next/link";
import { BackGlyph } from "@/components/chrome/glyphs";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import NavToggles from "@/components/NavToggles";
import LegalView from "@/components/LegalView";

// English on the server; the page switches to the visitor's language on
// the client (src/i18n/resolve.ts isVisitorLangPath, KP-08). The legal text
// itself is src/i18n/legal.ts, in all five site languages.
export const metadata = {
  title: "Terms of Service — Kovra",
  description:
    "Kovra terms of service: payment, refunds, liability and the referral program. Also available in Russian, Spanish, German and French.",
  alternates: {
    canonical: "https://kovravpn.com/terms",
    languages: { en: "https://kovravpn.com/terms", "x-default": "https://kovravpn.com/terms" },
  },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
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
        <LegalView doc="terms" />
      </main>
    </div>
  );
}

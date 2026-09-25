// src/app/terms/page.tsx
import Link from "next/link";
import { BackGlyph } from "@/components/chrome/glyphs";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import NavToggles from "@/components/NavToggles";
import LegalView from "@/components/LegalView";

export const metadata = {
  title: "Пользовательское соглашение — Kovra",
  description:
    "Условия использования сервиса Kovra: оплата, возвраты, ответственность, реферальная программа.",
  alternates: { canonical: "https://kovravpn.com/terms" },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader>
        <NavToggles />
        <Link href="/" className="kh-link">
          <BackGlyph className="kh-link-glyph" />
          <span className="kh-link-text" data-i18n="common.back.home.short">На главную</span>
        </Link>
      </SiteHeader>

      <main className="container mx-auto px-4 md:px-6 max-w-3xl pt-12 pb-20">
        <LegalView doc="terms" />
      </main>
    </div>
  );
}

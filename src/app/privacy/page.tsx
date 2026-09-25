// src/app/privacy/page.tsx
import Link from "next/link";
import { BackGlyph } from "@/components/chrome/glyphs";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import NavToggles from "@/components/NavToggles";
import LegalView from "@/components/LegalView";

export const metadata = {
  title: "Политика конфиденциальности — Kovra",
  description:
    "Какие данные собирает сервис Kovra, как они используются и защищаются.",
  alternates: { canonical: "https://kovravpn.com/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
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
        <LegalView doc="privacy" />
      </main>
    </div>
  );
}

// src/app/privacy/page.tsx
import Link from "next/link";
import Logo from "@/components/Logo";
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
      <nav className="container mx-auto px-4 md:px-6 pt-6 mb-12">
        <div className="nm-raised-sm px-3 md:px-5 py-3 flex items-center justify-between gap-2 min-w-0">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="nm-circle w-9 h-9 flex items-center justify-center">
              <Logo size={18} className="text-nm-accent" />
            </div>
            <span
              className="hidden sm:inline font-semibold text-nm-text tracking-tight"
              data-i18n="common.brand"
            >
              Kovra
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <NavToggles />
            <Link
              href="/"
              className="nm-btn px-3 md:px-4 py-2 text-xs md:text-sm text-nm-text-secondary"
              data-i18n="common.back.home"
            >
              ← На главную
            </Link>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 md:px-6 max-w-3xl pb-20">
        <LegalView doc="privacy" />
      </main>
    </div>
  );
}

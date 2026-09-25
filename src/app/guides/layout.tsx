// src/app/guides/layout.tsx
//
// Chrome for the English /guides section. Server-rendered EN (unlike the
// RU-first pages): these pages target English search intent, so the markup
// crawlers index is already English and no Localizer pass is needed.
import type { Metadata } from "next";
import Link from "next/link";
import "./guides.css";
import KovraWordmark from "@/components/KovraWordmark";
import { RuntimePrefs } from "@/components/chrome/RuntimePrefs";

export const metadata: Metadata = {
  openGraph: { locale: "en_US" },
};

export default function GuidesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="gd-page">
      <header className="gd-head">
        <div className="gd-wrap gd-head-in">
          <Link href="/" className="gd-brand">
            <KovraWordmark height={24} />
          </Link>
          <nav className="gd-head-nav kh-bar" aria-label="Guides">
            <Link href="/guides">Guides</Link>
            <Link href="/#pricing">Pricing</Link>
            <Link href="/guide">Setup</Link>
            {/* The guides are English-only: another language is saved and
                opens the home page in it; the menu says so. */}
            <RuntimePrefs fixedLang="en" leaveTo="/" langNote="Guides are in English. Other languages open the home page." />
            <a href="/register" className="k-btn k-btn-gold">
              Get Kovra
            </a>
          </nav>
        </div>
      </header>

      {children}

      <footer className="gd-foot">
        <div className="gd-wrap gd-foot-in">
          <Link href="/" className="gd-brand" style={{ fontSize: 15 }}>
            <KovraWordmark height={19} />
          </Link>
          <nav className="gd-foot-links" aria-label="Footer">
            <Link href="/guides">Guides</Link>
            <Link href="/#pricing">Pricing</Link>
            <Link href="/#faq">FAQ</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <a href="mailto:support@kovravpn.com">support@kovravpn.com</a>
          </nav>
          <span className="gd-copy">© {new Date().getFullYear()} Kovra</span>
        </div>
      </footer>
    </div>
  );
}

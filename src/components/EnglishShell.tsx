// src/components/EnglishShell.tsx
//
// Header and footer of the English-only pages: the /guides section and the
// two landing pages (/vless, /crypto). Server-rendered English (unlike the
// RU-first pages): these pages target English search intent, so the markup
// crawlers index is already English and no Localizer pass is needed.
//
// Styles are the .gd-* rules of src/app/guides/guides.css; the layout that
// renders this shell imports that file.
import Link from "next/link";
import type { ReactNode } from "react";
import KovraWordmark from "@/components/KovraWordmark";
import { RuntimePrefs } from "@/components/chrome/RuntimePrefs";

export interface EnglishShellProps {
  /** Under the language menu's heading: says what picking another language does here. */
  langNote: string;
  children: ReactNode;
}

export default function EnglishShell({ langNote, children }: EnglishShellProps) {
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
            {/* These pages are English-only: another language is saved and
                opens the home page in it; the menu says so. */}
            <RuntimePrefs fixedLang="en" leaveTo="/" langNote={langNote} />
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
            <Link href="/vless">VLESS subscription</Link>
            <Link href="/crypto">Pay with crypto</Link>
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

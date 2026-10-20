// src/components/chrome/SiteHeader.tsx
//
// The plain page header of the runtime-translated pages (/guide, /privacy,
// /terms): wordmark on the left, the header chrome (preferences capsule plus a
// quiet link) on the right. Same geometry as the /guides header (.gd-head:
// 64px tall, 1040px column, hairline under it) so the capsule does not jump
// between pages; a solid page-colour bar, no blur (the brand has no glass).
// Styles: .kh-head* in src/app/chrome.css.
import Link from "next/link";
import type { ReactNode } from "react";
import KovraWordmark from "@/components/KovraWordmark";

export interface SiteHeaderProps {
  /** The right-hand group: <NavToggles/> and a .kh-link. */
  children: ReactNode;
  /**
   * Whether the wordmark leads home. False in the app view of a page our app
   * opens (lib/legal-routes.ts): the home page sells, and the app may not
   * lead there.
   */
  home?: boolean;
}

export function SiteHeader({ children, home = true }: SiteHeaderProps) {
  return (
    <header className="kh-head">
      <div className="kh-head-in">
        {home ? (
          <Link href="/" aria-label="Kovra" className="kh-head-brand">
            <KovraWordmark height={24} />
          </Link>
        ) : (
          <span aria-label="Kovra" role="img" className="kh-head-brand">
            <KovraWordmark height={24} />
          </span>
        )}
        <div className="kh-bar">{children}</div>
      </div>
    </header>
  );
}

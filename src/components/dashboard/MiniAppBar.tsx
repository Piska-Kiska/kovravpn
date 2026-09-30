// src/components/dashboard/MiniAppBar.tsx
// Top bar of the cabinet inside the Telegram Mini App, in place of the site
// header: the wordmark (not a link: the site's home page has no place inside
// Telegram) and the balance chip. Telegram's own header above it carries the
// close button and the back arrow; the sections are in the bottom tab bar.
"use client";

import { useEffect, useState, type ReactNode } from "react";
import KovraWordmark from "@/components/KovraWordmark";
import { cx } from "@/components/cabinet";

export function MiniAppBar({ end }: { end?: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cx("kc-mbar", scrolled && "is-scrolled")}>
      <div className="kc-mbar-in">
        <span className="kc-mbar-brand" aria-hidden="true">
          <KovraWordmark height={19} />
        </span>
        <div className="kc-mbar-end">{end}</div>
      </div>
    </header>
  );
}

// src/components/cabinet/CabinetRoot.tsx
// Root of every cabinet page: scope class, stylesheet, skip link, theme sync
// and the end of the language boot (removes html.kc-lang-pending once React
// renders in the resolved language).
"use client";

import { useEffect, type ReactNode } from "react";
import "@/app/cabinet.css";
import { ThemeSync } from "@/components/chrome/ThemeSync";
import { syncCabinetLang, useCabinetLang } from "@/lib/cabinet-lang";
import { useShellT } from "@/lib/i18n-shell";
import { cx } from "./util";

export interface CabinetRootProps {
  variant: "auth" | "dash";
  children: ReactNode;
  className?: string;
}

export function CabinetRoot({ variant, children, className }: CabinetRootProps) {
  const lang = useCabinetLang();
  const shell = useShellT();

  // After a client-side navigation <html data-lang> may carry another page's
  // language; re-resolve with the cabinet rules once on mount.
  useEffect(() => {
    syncCabinetLang();
  }, []);

  // Reveal the page once React renders in the language the boot script chose.
  useEffect(() => {
    const d = document.documentElement;
    if (!d.classList.contains("kc-lang-pending")) return;
    if (d.getAttribute("data-lang") !== lang) return;
    const raf = requestAnimationFrame(() => d.classList.remove("kc-lang-pending"));
    return () => cancelAnimationFrame(raf);
  }, [lang]);

  return (
    <div className={cx("kc", "kc-root", `kc-${variant}`, className)}>
      <a className="kc-skip" href="#kc-main">
        {shell.skip}
      </a>
      <ThemeSync />
      {children}
    </div>
  );
}

// src/components/cabinet/CabinetRoot.tsx
// Root of every cabinet page: scope class, stylesheet, skip link, theme sync
// and the end of the language boot (removes html.kc-lang-pending once React
// renders in the resolved language).
"use client";

import { useEffect, type ReactNode } from "react";
import "@/app/cabinet.css";
import { syncCabinetLang, useCabinetLang } from "@/lib/cabinet-lang";
import { useShellT } from "@/lib/i18n-shell";
import {
  applyThemePref,
  readThemePref,
  resolveTheme,
  syncThemeColorMeta,
  THEME_STORAGE_KEY,
  useThemePref,
} from "@/lib/theme";
import { cx } from "./util";

export interface CabinetRootProps {
  variant: "auth" | "dash";
  children: ReactNode;
  className?: string;
}

/** Keeps <html data-theme> and the theme-color meta in line with the preference. */
function ThemeSync() {
  const { pref, resolved } = useThemePref();

  // Reconcile once on mount: after a client-side navigation from a page with
  // its own toggle (NavToggles), the html attributes may disagree with storage.
  useEffect(() => {
    const stored = readThemePref();
    const d = document.documentElement;
    if (d.getAttribute("data-theme-pref") !== stored || d.getAttribute("data-theme") !== resolveTheme(stored)) {
      applyThemePref(stored);
    }
  }, []);

  useEffect(() => {
    syncThemeColorMeta();
  }, [pref, resolved]);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemePref("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  // Another tab changed the theme.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY || e.key === null) applyThemePref(readThemePref());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
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

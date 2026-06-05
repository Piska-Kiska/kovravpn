// src/components/NavToggles.tsx
"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { detectLang, setLang } from "@/i18n/runtime";
import type { Lang } from "@/i18n/dict";

/**
 * Compact navbar control: EN/RU language pill + theme icon button.
 *
 * Lives inside the public-page navbars on /, /guide, /terms, /privacy.
 * Same neumorphism design language as the existing wide ThemeToggle (used
 * on /dashboard) but sized to fit a navbar row alongside the Sign-in
 * button on phones (~360px viewport budget).
 *
 * Heights are aligned (~36px) so the two controls read as one group.
 *
 * Both toggles defer rendering until mounted to avoid hydration
 * mismatch — server has no access to localStorage.
 */
export default function NavToggles() {
  return (
    <div className="flex items-center gap-2">
      <LangPill />
      <ThemeIconButton />
    </div>
  );
}

/* ── EN / RU pill ──────────────────────────────────── */
function LangPill() {
  const [lang, setL] = useState<Lang>("ru");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Hydration-safe pattern: server can't read localStorage, so we
    // defer rendering the actual toggle state until after mount. The
    // lint rule below is the canonical exception for client-only state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setL(detectLang());
  }, []);

  const switchTo = (next: Lang) => {
    if (next === lang) return;
    setL(next);
    setLang(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState({}, "", url.toString());
    } catch {
      // No URL/history support: in-session swap still works via setLang().
    }
  };

  if (!mounted) {
    return <div className="w-[78px] h-9" aria-hidden />;
  }

  return (
    <div
      className="nm-toggle-track relative flex items-center w-[78px] h-9 rounded-full p-[3px]"
      role="group"
      aria-label="Language"
    >
      <div
        className={`nm-toggle-pill absolute top-[3px] h-[30px] w-[36px] rounded-full transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          lang === "ru" ? "left-[3px]" : "left-[39px]"
        }`}
      />
      <button
        type="button"
        onClick={() => switchTo("ru")}
        aria-pressed={lang === "ru"}
        className={`relative z-10 flex-1 text-[10px] font-bold tracking-[0.06em] uppercase cursor-pointer transition-colors duration-300 ${
          lang === "ru" ? "text-nm-text" : "text-nm-text-secondary"
        }`}
      >
        RU
      </button>
      <button
        type="button"
        onClick={() => switchTo("en")}
        aria-pressed={lang === "en"}
        className={`relative z-10 flex-1 text-[10px] font-bold tracking-[0.06em] uppercase cursor-pointer transition-colors duration-300 ${
          lang === "en" ? "text-nm-text" : "text-nm-text-secondary"
        }`}
      >
        EN
      </button>
    </div>
  );
}

/* ── Theme icon button ─────────────────────────────── */
function ThemeIconButton() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Same hydration-safe pattern as LangPill.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      const saved = localStorage.getItem("theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = saved === "dark" || (!saved && prefersDark);
      setDark(isDark);
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    } catch {
      // localStorage unavailable: stay on light.
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // No persistence: in-session toggle still works.
    }
  };

  if (!mounted) {
    return <div className="w-9 h-9" aria-hidden />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="nm-circle w-9 h-9 flex items-center justify-center cursor-pointer transition-shadow duration-300 hover:nm-circle-pressed"
    >
      {dark ? (
        <Sun className="w-4 h-4 text-nm-accent" />
      ) : (
        <Moon className="w-4 h-4 text-nm-accent" />
      )}
    </button>
  );
}

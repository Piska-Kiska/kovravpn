// src/components/NavToggles.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Globe, ChevronDown } from "lucide-react";
import { detectLang, setLang } from "@/i18n/runtime";
import type { Lang } from "@/i18n/dict";

/**
 * Navbar control: language dropdown (5 langs) + theme icon button.
 * Lives in the public-page navbars on /, /guide, /terms, /privacy and on
 * /login, /register. Uses the unified "kovra_lang" key (via runtime),
 * so the choice is shared with the landing and dashboard.
 */
export default function NavToggles() {
  return (
    <div className="flex items-center gap-2">
      <LangDropdown />
      <ThemeIconButton />
    </div>
  );
}

const LANGS: { code: Lang; native: string }[] = [
  { code: "en", native: "English" },
  { code: "ru", native: "Русский" },
  { code: "es", native: "Español" },
  { code: "de", native: "Deutsch" },
  { code: "fr", native: "Français" },
];

function LangDropdown() {
  const [lang, setL] = useState<Lang>("ru");
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setL(detectLang());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const switchTo = (next: Lang) => {
    setOpen(false);
    if (next === lang) return;
    setL(next);
    setLang(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* in-session swap still works via setLang() */
    }
  };

  if (!mounted) return <div className="w-[72px] h-9" aria-hidden />;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="nm-circle h-9 px-2.5 flex items-center gap-1 cursor-pointer"
        aria-label="Language"
      >
        <Globe className="w-3.5 h-3.5 text-nm-accent" />
        <span className="text-[11px] font-bold uppercase text-nm-text tracking-wide">
          {lang}
        </span>
        <ChevronDown className="w-3 h-3 text-nm-text-secondary" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-50 nm-raised rounded-xl overflow-hidden min-w-[136px] py-1">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => switchTo(l.code)}
              className={`w-full text-left px-3 py-2 text-xs cursor-pointer transition-colors ${
                lang === l.code
                  ? "text-nm-accent bg-white/5"
                  : "text-nm-text hover:bg-white/5"
              }`}
            >
              {l.native}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeIconButton() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      const saved = localStorage.getItem("theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = saved === "dark" || (!saved && prefersDark);
      setDark(isDark);
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    } catch {
      /* stay on light */
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* in-session toggle still works */
    }
  };

  if (!mounted) return <div className="w-9 h-9" aria-hidden />;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="nm-circle w-9 h-9 flex items-center justify-center cursor-pointer transition-shadow duration-300 hover:nm-circle-pressed"
    >
      {dark ? <Sun className="w-4 h-4 text-nm-accent" /> : <Moon className="w-4 h-4 text-nm-accent" />}
    </button>
  );
}

// src/components/NavToggles.tsx
"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import LangSwitcher from "./LangSwitcher";

/** Navbar control: unified language switcher + theme icon button. */
export default function NavToggles() {
  return (
    <div className="flex items-center gap-2">
      <LangSwitcher />
      <ThemeIconButton />
    </div>
  );
}

function ThemeIconButton() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
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

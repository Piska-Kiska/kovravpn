// src/components/ThemeToggle.tsx
"use client";

import { useState, useEffect } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved === "dark" || (!saved && prefersDark);
    setDark(isDark);
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  if (!mounted) return <div className="w-[140px] h-[46px]" />; // placeholder to avoid layout shift

  return (
    <button
      onClick={toggle}
      className="nm-toggle-track relative flex items-center w-[140px] h-[46px] rounded-full cursor-pointer p-[5px] transition-shadow duration-300"
      aria-label={dark ? "Светлая тема" : "Тёмная тема"}
    >
      {/* Sliding pill */}
      <div
        className={`nm-toggle-pill absolute top-[5px] h-[36px] w-[68px] rounded-full transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          dark ? "left-[5px]" : "left-[67px]"
        }`}
      />

      {/* Labels */}
      <span
        className={`relative z-10 flex-1 text-center text-[11px] font-bold tracking-[0.08em] uppercase transition-colors duration-300 ${
          dark ? "text-nm-text" : "text-nm-text-secondary"
        }`}
      >
        Dark
      </span>
      <span
        className={`relative z-10 flex-1 text-center text-[11px] font-bold tracking-[0.08em] uppercase transition-colors duration-300 ${
          !dark ? "text-nm-text" : "text-nm-text-secondary"
        }`}
      >
        Light
      </span>
    </button>
  );
}

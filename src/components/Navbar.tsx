// src/components/Navbar.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Shield, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "#features", label: "Возможности" },
  { href: "#pricing", label: "Тарифы" },
  { href: "#faq", label: "FAQ" },
] as const;

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-slate-950/70 border-b border-slate-800/50">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-heading font-extrabold tracking-tight text-indigo-400 hover:text-indigo-300 transition"
        >
          <Shield className="w-7 h-7" />
          <span>Kovra</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-slate-400 hover:text-white transition"
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/login"
            className="text-sm text-slate-300 hover:text-white transition"
          >
            Войти
          </Link>
          <Link
            href="/register"
            className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-lg transition shadow-lg shadow-indigo-500/20"
          >
            Подключиться
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 text-slate-400 hover:text-white transition"
          aria-label="Меню"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-slate-800/50 bg-slate-950/95 backdrop-blur-xl">
          <div className="container mx-auto px-6 py-4 flex flex-col gap-4">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-slate-300 hover:text-white transition py-1"
              >
                {l.label}
              </a>
            ))}
            <hr className="border-slate-800" />
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="text-slate-300 hover:text-white transition py-1"
            >
              Войти
            </Link>
            <Link
              href="/register"
              onClick={() => setOpen(false)}
              className="bg-indigo-600 hover:bg-indigo-500 text-center py-3 rounded-lg font-semibold transition"
            >
              Подключиться
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

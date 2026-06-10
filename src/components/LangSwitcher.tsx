// src/components/LangSwitcher.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { detectLang, setLang as persistLang } from "@/i18n/runtime";
import type { Lang } from "@/i18n/dict";

const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "EN", native: "English" },
  { code: "ru", label: "RU", native: "Русский" },
  { code: "es", label: "ES", native: "Español" },
  { code: "de", label: "DE", native: "Deutsch" },
  { code: "fr", label: "FR", native: "Français" },
];

const Globe = () => (
  <svg className="klang-glb" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.6 2.8 2.6 15.2 0 18c-2.6-2.8-2.6-15.2 0-18z" /></svg>
);
const Caret = () => (
  <svg className="klang-car" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
);

type Props = { value?: Lang; onChange?: (lang: Lang) => void };

export default function LangSwitcher({ value, onChange }: Props) {
  const [internal, setInternal] = useState<Lang>("en");
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lang = value ?? internal;

  useEffect(() => {
    setMounted(true);
    setInternal(detectLang());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (next: Lang) => {
    setOpen(false);
    setInternal(next);
    persistLang(next);
    onChange?.(next);
  };

  if (!mounted) return <div className="klang" style={{ width: 76, height: 40 }} aria-hidden />;

  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <div className="klang" ref={ref}>
      <button
        type="button"
        className={"klang-btn" + (open ? " is-open" : "")}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language"
      >
        <Globe />
        {current.label}
        <Caret />
      </button>
      {open && (
        <div className="klang-menu" role="listbox">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              role="option"
              aria-selected={l.code === lang}
              className={"klang-item" + (l.code === lang ? " is-active" : "")}
              onClick={() => pick(l.code)}
            >
              {l.native}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

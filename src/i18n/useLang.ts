// src/i18n/useLang.ts
"use client";

import { useEffect, useState } from "react";
import { detectLang, LANG_CHANGE_EVENT } from "./runtime";
import type { Lang } from "./dict";

/**
 * Current UI language for client components.
 * SSR/first paint returns "ru" (server renders RU — SEO parity); after mount it
 * resolves the real preference and re-renders on every LANG_CHANGE_EVENT.
 */
export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>("ru");

  useEffect(() => {
    setLang(detectLang());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ lang?: Lang }>).detail;
      setLang(detail?.lang ?? detectLang());
    };
    window.addEventListener(LANG_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, onChange);
  }, []);

  return lang;
}

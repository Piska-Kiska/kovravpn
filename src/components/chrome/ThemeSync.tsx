// src/components/chrome/ThemeSync.tsx
// Keeps <html data-theme> and the theme-color meta in line with the
// preference. Render it once per page (CabinetRoot, the landing, /guides and
// the pages using RuntimePrefs).
"use client";

import { useEffect } from "react";
import {
  applyThemePref,
  readThemePref,
  resolveTheme,
  syncThemeColorMeta,
  THEME_STORAGE_KEY,
  useThemePref,
} from "@/lib/theme";

export function ThemeSync() {
  const { pref, resolved } = useThemePref();

  // Reconcile once on mount: after a client-side navigation the html
  // attributes may disagree with storage.
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

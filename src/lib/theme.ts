// src/lib/theme.ts
//
// Theme preference for the cabinet (and anything else that wants it).
//
// Model: preference "system" | "light" | "dark" under the storage key
// "theme", shared with the landing and NavToggles. "system" is stored as the
// ABSENCE of the key, which every existing reader already treats as "follow
// the OS". <html> carries data-theme (resolved), data-theme-pref and
// style.colorScheme; the boot script in src/app/layout.tsx sets them before
// first paint.
"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";
export const THEME_CHANGE_EVENT = "kovra:theme-change";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isPref(v: unknown): v is ThemePref {
  return v === "system" || v === "light" || v === "dark";
}

/** Stored preference: "light" | "dark", anything else is "system". */
export function readThemePref(): ThemePref {
  if (typeof window === "undefined") return "system";
  try {
    const t = window.localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(p: ThemePref): ResolvedTheme {
  if (p !== "system") return p;
  if (typeof window === "undefined") return "dark";
  try {
    return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
  } catch {
    return "dark";
  }
}

/** Copies the page background of the cabinet root (or body) into every theme-color meta. */
export function syncThemeColorMeta(): void {
  if (typeof document === "undefined") return;
  const source = document.querySelector<HTMLElement>(".kc-root") ?? document.body;
  if (!source) return;
  const color = getComputedStyle(source).backgroundColor;
  if (!color || color === "rgba(0, 0, 0, 0)" || color === "transparent") return;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    if (m.content !== color) m.content = color;
  });
}

/**
 * Apply and persist a preference. Colour transitions are suspended for two
 * frames (html.kc-no-anim) so the whole page switches at once.
 */
export function applyThemePref(p: ThemePref): void {
  if (typeof document === "undefined") return;
  const d = document.documentElement;
  const resolved = resolveTheme(p);
  d.classList.add("kc-no-anim");
  d.setAttribute("data-theme", resolved);
  d.setAttribute("data-theme-pref", p);
  d.style.colorScheme = resolved;
  try {
    if (p === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, p);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  syncThemeColorMeta();
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { pref: p, resolved } }));
  requestAnimationFrame(() => {
    requestAnimationFrame(() => d.classList.remove("kc-no-anim"));
  });
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// The snapshot is a primitive string so useSyncExternalStore can compare it.
function getSnapshot(): string {
  const d = document.documentElement;
  const attrPref = d.getAttribute("data-theme-pref");
  const pref: ThemePref = isPref(attrPref) ? attrPref : readThemePref();
  const attrTheme = d.getAttribute("data-theme");
  const resolved: ResolvedTheme = attrTheme === "light" || attrTheme === "dark" ? attrTheme : resolveTheme(pref);
  return `${pref}:${resolved}`;
}

function getServerSnapshot(): string {
  return "system:dark";
}

export interface ThemePrefState {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (p: ThemePref) => void;
}

export function useThemePref(): ThemePrefState {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setPref = useCallback((p: ThemePref) => applyThemePref(p), []);
  return useMemo(() => {
    const [p, r] = snap.split(":");
    return {
      pref: isPref(p) ? p : "system",
      resolved: r === "light" ? "light" : "dark",
      setPref,
    };
  }, [snap, setPref]);
}

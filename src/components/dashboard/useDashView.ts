// src/components/dashboard/useDashView.ts
// Hash-routed views of the dashboard: #devices (home), #plan, #rewards,
// #account; #help opens Account and scrolls to the Help panel.
//
// - The hash is the source of truth (read through useSyncExternalStore, so
//   back / forward and manual edits just work).
// - navigate() uses history.pushState, never location.hash, so the browser
//   does not try to scroll to an element (no element may use a view name as
//   its id anyway).
// - Without a hash the initial view is decided once, when the account has
//   loaded: devices for returning users, plan for users without a plan.
// - After a navigation: scroll to the top and focus the view's h1
//   ([data-view-title]), or scroll to #help-panel and focus its heading.
"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type DashView = "devices" | "plan" | "rewards" | "account";
export type NavTarget = DashView | "help";

export const DASH_VIEWS: readonly DashView[] = ["devices", "plan", "rewards", "account"];

const NAV_EVENT = "kovra:dash-nav";

function parseHash(hash: string): NavTarget | null {
  const h = hash.replace(/^#/, "");
  if (h === "help") return "help";
  return (DASH_VIEWS as readonly string[]).includes(h) ? (h as DashView) : null;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAV_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAV_EVENT, onChange);
  };
}

function getSnapshot(): NavTarget | null {
  return parseHash(window.location.hash);
}

function getServerSnapshot(): NavTarget | null {
  return null;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

interface FocusRequest {
  target: NavTarget;
  seq: number;
  /** Initial load: scroll only, do not move focus. */
  quiet: boolean;
}

export interface DashViewState {
  /** null until a view can be decided (no hash and the account is loading). */
  view: DashView | null;
  target: NavTarget | null;
  navigate(target: NavTarget): void;
}

/**
 * @param ready    the account has loaded and the view content is rendered
 * @param fallback view to open when the URL has no hash (null while unknown)
 */
export function useDashView(ready: boolean, fallback: DashView | null): DashViewState {
  const hashTarget = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Decided once: later account changes (a promo, a payment) must not move
  // the user to another view under their feet.
  const [decided, setDecided] = useState<DashView | null>(null);
  if (decided === null && fallback !== null) setDecided(fallback);

  const [focusReq, setFocusReq] = useState<FocusRequest | null>(() => {
    if (typeof window === "undefined") return null;
    return getSnapshot() === "help" ? { target: "help", seq: 0, quiet: true } : null;
  });
  const handled = useRef(-1);

  const navigate = useCallback((target: NavTarget) => {
    const url = `${window.location.pathname}${window.location.search}#${target}`;
    if (`#${target}` !== window.location.hash) window.history.pushState(null, "", url);
    window.dispatchEvent(new Event(NAV_EVENT));
    setFocusReq((prev) => ({ target, seq: (prev?.seq ?? 0) + 1, quiet: false }));
  }, []);

  // Back / forward and manual hash edits: same scroll and focus treatment.
  useEffect(() => {
    const onHistory = () => {
      const t = getSnapshot();
      if (t) setFocusReq((prev) => ({ target: t, seq: (prev?.seq ?? 0) + 1, quiet: false }));
    };
    window.addEventListener("popstate", onHistory);
    window.addEventListener("hashchange", onHistory);
    return () => {
      window.removeEventListener("popstate", onHistory);
      window.removeEventListener("hashchange", onHistory);
    };
  }, []);

  useEffect(() => {
    if (!ready || !focusReq || handled.current === focusReq.seq) return;
    handled.current = focusReq.seq;
    const { target, quiet } = focusReq;
    const raf = requestAnimationFrame(() => {
      if (target === "help") {
        const panel = document.getElementById("help-panel");
        if (!panel) return;
        panel.scrollIntoView({ block: "start", behavior: quiet || prefersReducedMotion() ? "auto" : "smooth" });
        if (!quiet) panel.querySelector<HTMLElement>("[data-panel-title]")?.focus({ preventScroll: true });
        return;
      }
      window.scrollTo({ top: 0 });
      if (!quiet) document.querySelector<HTMLElement>("[data-view-title]")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [ready, focusReq]);

  const view: DashView | null = hashTarget ? (hashTarget === "help" ? "account" : hashTarget) : decided;
  return { view, target: hashTarget, navigate };
}

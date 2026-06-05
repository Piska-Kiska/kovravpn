// src/lib/attribution.ts
//
// First-touch UTM attribution helper.
//
// How it works:
// - When a user lands on any page with ?utm_source=... in the URL, we capture
//   those params once and persist them in localStorage (first-touch model:
//   subsequent visits never overwrite the original).
// - Conversion events (signup, payment, ...) read the stored attribution and
//   attach it as properties to Vercel Analytics track() calls.
//
// Why first-touch and not last-touch:
// - We want to know which marketing source *brought* the user (Telegraph,
//   GitHub, Reddit), not where they happened to be when they converted
//   (usually /dashboard, with no utm params).
//
// All functions are safe to call on the server — they no-op when window is
// undefined, so they can be invoked from shared React components without
// hydration issues.

import { track as vercelTrack } from "@vercel/analytics";

const STORAGE_KEY = "utm_attribution";
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

type UtmKey = (typeof UTM_KEYS)[number];

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  /** Epoch ms of first capture. Useful to debug stale attribution. */
  captured_at?: number;
  /** Landing path where UTM was first seen. */
  landing_path?: string;
}

/**
 * Read UTM params from current URL and persist them as first-touch attribution.
 * - No-op on the server.
 * - No-op if attribution is already stored (first-touch never overwrites).
 * - No-op if URL has no utm_* params.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return;

    const params = new URLSearchParams(window.location.search);
    const next: Attribution = {};
    let hasAny = false;

    for (const key of UTM_KEYS) {
      const val = params.get(key);
      if (val) {
        next[key as UtmKey] = val.slice(0, 120); // guard against absurdly long values
        hasAny = true;
      }
    }
    if (!hasAny) return;

    next.captured_at = Date.now();
    next.landing_path = window.location.pathname;

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* localStorage can throw in private mode / quota errors — non-fatal */
  }
}

/**
 * Get stored attribution, or empty object if none.
 */
export function getAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Track a conversion event via Vercel Analytics, automatically attaching
 * first-touch UTM attribution as event properties.
 *
 * Example:
 *   trackEvent("signup_complete", { method: "email" });
 *   // → Vercel Analytics sees the event with utm_source, utm_campaign, etc.
 *     baked in as properties, so you can filter the funnel by source.
 */
export function trackEvent(
  name: string,
  properties: Record<string, string | number | boolean | null> = {},
): void {
  if (typeof window === "undefined") return;

  const attr = getAttribution();
  // Vercel Analytics' `track` expects a flat property map of primitives.
  const payload: Record<string, string | number | boolean | null> = { ...properties };
  if (attr.utm_source) payload.utm_source = attr.utm_source;
  if (attr.utm_medium) payload.utm_medium = attr.utm_medium;
  if (attr.utm_campaign) payload.utm_campaign = attr.utm_campaign;
  if (attr.utm_content) payload.utm_content = attr.utm_content;
  if (attr.utm_term) payload.utm_term = attr.utm_term;

  try {
    vercelTrack(name, payload);
  } catch (err) {
    // Analytics must never break business flow — swallow errors.
    console.warn("[attribution] track failed:", err);
  }
}

/**
 * Remove the `?paid=1` / `?topup=1` success flag from the URL after the
 * payment_completed event is fired, so a refresh doesn't double-count.
 */
export function stripQueryParam(param: string): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) return;
    url.searchParams.delete(param);
    const newUrl =
      url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") + url.hash;
    window.history.replaceState({}, "", newUrl);
  } catch {
    /* non-fatal */
  }
}

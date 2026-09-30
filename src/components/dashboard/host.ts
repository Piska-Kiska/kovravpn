// src/components/dashboard/host.ts
//
// Where the dashboard runs: the site (/dashboard) or the Telegram Mini App
// (/tg). DashboardView asks its host for everything that differs between the
// two, so the views and components stay the same.
"use client";

import type { Lang } from "@/lib/cabinet-lang";

export type HostHaptic = "select" | "success" | "error" | "tap";

export interface DashHost {
  /** Inside the Telegram Mini App: no site header, Telegram decides the theme. */
  readonly embedded: boolean;
  /**
   * Go to a payment page. Site: in this tab (the provider returns to
   * /dashboard?paid=1). Mini App: in the external browser, the cabinet stays.
   */
  openPayment(url: string): void;
  /** The session is gone and could not be restored. Site: /login. */
  onAuthLost(): void;
  /**
   * Telegram's back arrow: show it with this handler, or hide it (null).
   * Returns the unbind. Absent on the site (the browser has its own Back).
   */
  bindBack?(handler: (() => void) | null): () => void;
  haptic?(kind: HostHaptic): void;
  /** The person switched the cabinet language (the Mini App tells the account). */
  onLangChange?(lang: Lang): void;
  /**
   * Subscribe to "the person is back in the app" beyond `visibilitychange`
   * (Telegram's `activated`, Bot API 8.0). Returns the unsubscribe.
   */
  onResume?(fn: () => void): () => void;
}

/** The site. */
export const WEB_HOST: DashHost = {
  embedded: false,
  openPayment(url) {
    window.location.href = url;
  },
  onAuthLost() {
    window.location.href = "/login";
  },
};

// src/app/tg/telegram-webapp-client.ts
//
// Typed access to `window.Telegram.WebApp` and the small bindings the Mini App
// cabinet needs around it. Telegram's script is loaded on /tg only (see
// TgShell.tsx), so the types live here and not in a global d.ts.
//
// Only the fields and methods we use are described. Every call that depends
// on a Bot API version checks it: an old client must degrade, never throw.

export type TelegramColorScheme = "light" | "dark";

export interface TelegramWebAppUser {
  id: number;
  language_code?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramViewportChange {
  /** true: the resize animation ended, the height is final. */
  isStateStable: boolean;
}

/** Bot API 6.1+: the back arrow in Telegram's own header. */
export interface TelegramBackButton {
  readonly isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(handler: () => void): void;
  offClick(handler: () => void): void;
}

export interface TelegramMainButtonParams {
  text?: string;
  color?: string;
  text_color?: string;
  is_active?: boolean;
  is_visible?: boolean;
}

/** Bot API 6.0+: the wide button at the bottom of Telegram's window. */
export interface TelegramMainButton {
  readonly isVisible: boolean;
  setParams(params: TelegramMainButtonParams): void;
  show(): void;
  hide(): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  onClick(handler: () => void): void;
  offClick(handler: () => void): void;
}

export type TelegramImpactStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
export type TelegramNotificationType = "error" | "success" | "warning";

/** Bot API 6.1+. Silent on desktops. */
export interface TelegramHapticFeedback {
  impactOccurred(style: TelegramImpactStyle): void;
  notificationOccurred(type: TelegramNotificationType): void;
  selectionChanged(): void;
}

/** Bot API 8.0+: insets of the device and of Telegram's own controls. */
export interface TelegramInsets {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export type TelegramEvent = "themeChanged" | "viewportChanged" | "activated";

export interface TelegramWebApp {
  /** The signed query string; the server checks it. Empty outside Telegram. */
  readonly initData: string;
  /** The same fields parsed WITHOUT a signature check: for display only. */
  readonly initDataUnsafe: { start_param?: string; user?: TelegramWebAppUser };
  readonly colorScheme: TelegramColorScheme;
  readonly version: string;
  readonly platform: string;
  readonly viewportHeight: number;
  readonly viewportStableHeight: number;
  readonly safeAreaInset?: TelegramInsets;
  readonly contentSafeAreaInset?: TelegramInsets;
  readonly BackButton?: TelegramBackButton;
  readonly MainButton?: TelegramMainButton;
  readonly HapticFeedback?: TelegramHapticFeedback;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(version: string): boolean;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  /** Bot API 7.10+. */
  setBottomBarColor?(color: string): void;
  /** Bot API 7.7+. */
  enableVerticalSwipes?(): void;
  disableVerticalSwipes?(): void;
  onEvent(event: "themeChanged" | "activated", handler: () => void): void;
  onEvent(event: "viewportChanged", handler: (payload: TelegramViewportChange) => void): void;
  offEvent(event: "themeChanged" | "activated", handler: () => void): void;
  offEvent(event: "viewportChanged", handler: (payload: TelegramViewportChange) => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const TG_SDK_URL = "https://telegram.org/js/telegram-web-app.js";

/** The Mini App's own path: links to it stay inside the Telegram window. */
export const MINI_APP_PATH = "/tg";

/** CSS variable with the stable height of Telegram's window. */
export const TG_VIEWPORT_VAR = "--tg-vh";

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/**
 * Wait for Telegram's script. It is loaded by next/script after hydration,
 * and neither mount nor `onLoad` (which does not fire for a script already in
 * the document) marks the moment reliably; polling every 50 ms does.
 */
export function waitForWebApp(timeoutMs: number): Promise<TelegramWebApp | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = (): void => {
      const wa = getWebApp();
      if (wa) {
        resolve(wa);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

function atLeast(wa: TelegramWebApp, version: string): boolean {
  try {
    return wa.isVersionAtLeast(version);
  } catch {
    return false;
  }
}

/**
 * Kovra's own page colours, per scheme (src/app/cabinet.css, .kc-dash): the
 * page behind the views and the panel colour of the bottom tab bar. Telegram's
 * header and bottom bar are painted in them, so the cabinet keeps its look
 * and the frame around it does not show a foreign colour.
 */
export const KOVRA_FRAME: Readonly<Record<TelegramColorScheme, { page: string; panel: string }>> = {
  dark: { page: "#050506", panel: "#0b0b0d" },
  light: { page: "#f5f5f7", panel: "#ffffff" },
};

/**
 * Follow Telegram's light/dark scheme with Kovra's palette. `apply` sets the
 * cabinet's theme (src/lib/theme.ts applyThemePref), the frame is painted
 * here. Returns the unsubscribe from `themeChanged`.
 */
export function bindTelegramTheme(wa: TelegramWebApp, apply: (scheme: TelegramColorScheme) => void): () => void {
  const run = (): void => {
    const scheme: TelegramColorScheme = wa.colorScheme === "dark" ? "dark" : "light";
    apply(scheme);
    const frame = KOVRA_FRAME[scheme];
    try {
      // Any colour for the background from 6.1, for the header from 6.9.
      if (atLeast(wa, "6.1")) wa.setBackgroundColor(frame.page);
      if (atLeast(wa, "6.9")) wa.setHeaderColor(frame.page);
      if (atLeast(wa, "7.10")) wa.setBottomBarColor?.(frame.panel);
    } catch {
      // An old client keeps its own colours.
    }
  };
  run();
  wa.onEvent("themeChanged", run);
  return () => wa.offEvent("themeChanged", run);
}

function px(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? `${Math.round(v)}px` : "0px";
}

/**
 * Telegram's window height and insets into CSS variables:
 *   --tg-vh            stable height (changes only when an animation ends),
 *   --tg-safe-top/bottom  device insets + Telegram's own controls (8.0+).
 * `100vh` lies inside a Mini App: the window rises from the bottom and
 * changes height with an animation. Returns an unbind that removes them.
 */
export function bindViewport(wa: TelegramWebApp): () => void {
  const root = document.documentElement;
  const set = (): void => {
    const h = wa.viewportStableHeight;
    if (Number.isFinite(h) && h > 0) root.style.setProperty(TG_VIEWPORT_VAR, `${Math.round(h)}px`);
    const safe = wa.safeAreaInset;
    const content = wa.contentSafeAreaInset;
    root.style.setProperty("--tg-safe-top", px((safe?.top ?? 0) + (content?.top ?? 0)));
    root.style.setProperty("--tg-safe-bottom", px((safe?.bottom ?? 0) + (content?.bottom ?? 0)));
  };
  const onChange = (payload: TelegramViewportChange): void => {
    if (payload.isStateStable) set();
  };
  set();
  wa.onEvent("viewportChanged", onChange);
  return () => {
    wa.offEvent("viewportChanged", onChange);
    for (const v of [TG_VIEWPORT_VAR, "--tg-safe-top", "--tg-safe-bottom"]) root.style.removeProperty(v);
  };
}

/**
 * Bot API 7.7+: a pull-down on the cabinet scrolls it instead of minimising
 * the Mini App (the cabinet is an app with a tab bar, not a sheet to flick
 * away; Telegram's close button stays). Returns a restore.
 */
export function lockVerticalSwipes(wa: TelegramWebApp): () => void {
  if (!atLeast(wa, "7.7")) return () => undefined;
  try {
    wa.disableVerticalSwipes?.();
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      wa.enableVerticalSwipes?.();
    } catch {
      // Nothing to restore.
    }
  };
}

const TELEGRAM_HOSTS: ReadonlySet<string> = new Set(["t.me", "telegram.me", "telegram.dog"]);

/**
 * Open a link outside the Mini App window. t.me goes through Telegram itself
 * (a bot, a channel); everything else opens in the external browser, so the
 * cabinet underneath survives. Only http(s) is ever opened.
 */
export function openOutside(wa: TelegramWebApp | null, href: string): void {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (!wa) {
    window.open(url.href, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    if (TELEGRAM_HOSTS.has(url.hostname) && atLeast(wa, "6.1")) wa.openTelegramLink(url.href);
    else wa.openLink(url.href);
  } catch {
    window.open(url.href, "_blank", "noopener,noreferrer");
  }
}

/**
 * Every link of the cabinet opens outside the Mini App window: a plain `<a>`
 * would replace the cabinet with a guide or an app store page with no way
 * back. One delegated listener instead of edits in every component. Left
 * alone: modified clicks, non-http schemes, in-page `#view` links (they
 * prevent the default themselves) and links to /tg itself.
 */
export function interceptLinks(wa: TelegramWebApp): () => void {
  const onClick = (e: MouseEvent): void => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!(e.target instanceof Element)) return;
    const anchor = e.target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    let url: URL;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.origin === window.location.origin && url.pathname === MINI_APP_PATH) return;
    e.preventDefault();
    openOutside(wa, url.href);
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}

/** Telegram's back arrow exists on this client. */
export function hasBackButton(wa: TelegramWebApp | null): boolean {
  return !!wa?.BackButton && atLeast(wa, "6.1");
}

/**
 * Show Telegram's back arrow with a handler; null hides it. Returns an unbind
 * that removes the handler (the arrow stays for the next binding to decide).
 */
export function bindBackButton(wa: TelegramWebApp, handler: (() => void) | null): () => void {
  const button = wa.BackButton;
  if (!button || !hasBackButton(wa)) return () => undefined;
  try {
    if (!handler) {
      button.hide();
      return () => undefined;
    }
    button.onClick(handler);
    button.show();
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      button.offClick(handler);
    } catch {
      // Client gone or unsupported.
    }
  };
}

/** Kovra's gold action colours (globals.css --k-accent / --k-on-accent), the same in both schemes. */
export const KOVRA_CTA = { color: "#C6A983", text: "#141210" } as const;

/** What Telegram's bottom button shows and does. */
export interface MainButtonSpec {
  text: string;
  /** False: shown greyed out (another request runs). */
  active: boolean;
  /** Telegram's own spinner on the button. */
  loading: boolean;
  onClick(): void;
}

/** Telegram's bottom button exists on this client. */
export function hasMainButton(wa: TelegramWebApp | null): boolean {
  return !!wa?.MainButton && atLeast(wa, "6.0");
}

/**
 * Show Telegram's bottom button with `spec` (Kovra's gold), or hide it
 * (null). Returns an unbind that removes the click handler and hides the
 * button, so a view that goes away never leaves a live button behind.
 */
export function bindMainButton(wa: TelegramWebApp, spec: MainButtonSpec | null): () => void {
  const button = wa.MainButton;
  if (!button || !hasMainButton(wa)) return () => undefined;
  const hide = (): void => {
    try {
      button.hideProgress();
      button.hide();
    } catch {
      // Client gone.
    }
  };
  if (!spec) {
    hide();
    return () => undefined;
  }
  const handler = (): void => spec.onClick();
  try {
    button.setParams({
      // Telegram cuts the label at 64 characters.
      text: spec.text.slice(0, 64),
      color: KOVRA_CTA.color,
      text_color: KOVRA_CTA.text,
      is_active: spec.active && !spec.loading,
      is_visible: true,
    });
    if (spec.loading) button.showProgress(false);
    else button.hideProgress();
    button.onClick(handler);
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      button.offClick(handler);
    } catch {
      // Client gone.
    }
    hide();
  };
}

/**
 * Telegram's own chat picker to share a link (t.me/share/url): present on
 * every client, unlike `navigator.share` in Telegram's webviews.
 */
export function shareViaTelegram(wa: TelegramWebApp | null, url: string, text: string): void {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  openOutside(wa, share);
}

export type HapticKind = "select" | "success" | "error" | "tap";

/** Haptics are a nicety: absent on desktops and old clients, never allowed to throw. */
export function haptic(wa: TelegramWebApp | null, kind: HapticKind): void {
  const feedback = wa?.HapticFeedback;
  if (!wa || !feedback || !atLeast(wa, "6.1")) return;
  try {
    if (kind === "select") feedback.selectionChanged();
    else if (kind === "tap") feedback.impactOccurred("light");
    else feedback.notificationOccurred(kind);
  } catch {
    // Not supported by this client.
  }
}

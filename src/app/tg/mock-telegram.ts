// src/app/tg/mock-telegram.ts
//
// DEV ONLY. A fake `window.Telegram.WebApp` for previewing the Mini App
// cabinet in a normal browser: `/tg?mock=1` with NEXT_PUBLIC_DASH_MOCK=1 in
// `next dev`. TgShell imports this file dynamically behind the same guard as
// the dashboard mock (NODE_ENV !== "production"), so a production build never
// loads it.
//
// It also draws a stand-in for Telegram's header (title, Close / Back, the
// colour the page asked for), so screenshots show the back arrow the cabinet
// drives. The header overlays the page like Telegram's fullscreen mode does,
// and reports its height as `contentSafeAreaInset.top`, which the cabinet
// honours.
//
// Query parameters: scheme=light|dark (else the OS), tgLang=<code>,
// startapp=<param>; TgShell reads accountLang=<code> and mockFail=auth|offline,
// the dashboard mockState=… and mockBalance=<cents>.

import type { TelegramInsets, TelegramViewportChange, TelegramWebApp } from "./telegram-webapp-client";

const HEADER_H = 56;

type Handler = () => void;
type ViewportHandler = (p: TelegramViewportChange) => void;

function versionAtLeast(have: string, want: string): boolean {
  const a = have.split(".").map(Number);
  const b = want.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

export interface MockTelegramLog {
  openedLinks: string[];
  haptics: string[];
  header: string | null;
  background: string | null;
  bottomBar: string | null;
}

declare global {
  interface Window {
    /** Dev preview: what the fake WebApp was asked to do (read by screenshot scripts). */
    __tgMock?: MockTelegramLog & { back(): void };
  }
}

export function installMockTelegram(): void {
  if (window.Telegram?.WebApp) return;
  const q = new URLSearchParams(window.location.search);
  const scheme: "light" | "dark" =
    q.get("scheme") === "light" ? "light" : q.get("scheme") === "dark" ? "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const log: MockTelegramLog = { openedLinks: [], haptics: [], header: null, background: null, bottomBar: null };

  const backHandlers = new Set<Handler>();
  let backVisible = false;
  const events = new Map<string, Set<Handler | ViewportHandler>>();

  // Telegram's header, drawn by the page itself.
  const bar = document.createElement("div");
  bar.setAttribute("data-tg-mock", "");
  bar.style.cssText = [
    "position:fixed", "z-index:1000", "top:0", "left:0", "right:0", `height:${HEADER_H}px`,
    "display:grid", "grid-template-columns:96px 1fr 96px", "align-items:center",
    "font:600 16px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "border-bottom:1px solid rgba(127,127,127,.18)",
  ].join(";");
  const left = document.createElement("button");
  left.type = "button";
  left.style.cssText = "justify-self:start;margin-left:12px;border:0;background:none;font:inherit;font-weight:500;cursor:pointer;padding:8px";
  const title = document.createElement("div");
  title.style.cssText = "text-align:center;display:flex;flex-direction:column;gap:2px";
  title.innerHTML = '<span>Kovra</span><span style="font-weight:400;font-size:12px;opacity:.6">mini app</span>';
  const right = document.createElement("div");
  right.style.cssText = "justify-self:end;margin-right:18px;font-size:22px;letter-spacing:1px";
  right.textContent = "···";
  bar.append(left, title, right);

  const paint = (): void => {
    const bg = log.header ?? (scheme === "dark" ? "#17212b" : "#ffffff");
    const fg = scheme === "dark" ? "#f5f5f7" : "#1d1d1f";
    bar.style.background = bg;
    bar.style.color = fg;
    left.style.color = scheme === "dark" ? "#6ab3f3" : "#2481cc";
    left.textContent = backVisible ? "‹ Back" : "Close";
  };
  left.addEventListener("click", () => {
    if (backVisible) for (const h of [...backHandlers]) h();
    else console.info("[tg-mock] close()");
  });

  const insets = (top: number): TelegramInsets => ({ top, bottom: 0, left: 0, right: 0 });

  const wa: TelegramWebApp = {
    initData: "mock",
    initDataUnsafe: {
      user: { id: 100000001, language_code: q.get("tgLang") ?? "en" },
      ...(q.get("startapp") ? { start_param: q.get("startapp") ?? undefined } : {}),
    },
    colorScheme: scheme,
    version: "8.0",
    platform: "mock",
    get viewportHeight() {
      return window.innerHeight;
    },
    get viewportStableHeight() {
      return window.innerHeight;
    },
    safeAreaInset: insets(0),
    contentSafeAreaInset: insets(HEADER_H),
    BackButton: {
      get isVisible() {
        return backVisible;
      },
      show() {
        backVisible = true;
        paint();
      },
      hide() {
        backVisible = false;
        paint();
      },
      onClick(h) {
        backHandlers.add(h);
      },
      offClick(h) {
        backHandlers.delete(h);
      },
    },
    HapticFeedback: {
      impactOccurred: (s) => void log.haptics.push(`impact:${s}`),
      notificationOccurred: (tp) => void log.haptics.push(`notify:${tp}`),
      selectionChanged: () => void log.haptics.push("select"),
    },
    ready() {},
    expand() {},
    close() {
      console.info("[tg-mock] close()");
    },
    isVersionAtLeast: (v) => versionAtLeast("8.0", v),
    openLink(url) {
      log.openedLinks.push(url);
      console.info("[tg-mock] openLink", url);
    },
    openTelegramLink(url) {
      log.openedLinks.push(url);
      console.info("[tg-mock] openTelegramLink", url);
    },
    setHeaderColor(c) {
      log.header = c;
      paint();
    },
    setBackgroundColor(c) {
      log.background = c;
    },
    setBottomBarColor(c) {
      log.bottomBar = c;
    },
    enableVerticalSwipes() {},
    disableVerticalSwipes() {},
    onEvent(event: string, handler: Handler | ViewportHandler) {
      const set = events.get(event) ?? new Set();
      set.add(handler);
      events.set(event, set);
    },
    offEvent(event: string, handler: Handler | ViewportHandler) {
      events.get(event)?.delete(handler);
    },
  };

  paint();
  document.body.appendChild(bar);
  window.Telegram = { WebApp: wa };
  window.__tgMock = { ...log, back: () => left.click() };
  // Keep the exported log live (the spread above copied the arrays by reference).
  Object.defineProperty(window.__tgMock, "header", { get: () => log.header });
  window.addEventListener("resize", () => {
    for (const h of events.get("viewportChanged") ?? []) (h as ViewportHandler)({ isStateStable: true });
  });
}

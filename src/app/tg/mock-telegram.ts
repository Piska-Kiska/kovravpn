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
// It draws Telegram's bottom button (MainButton) too, and reports its height
// as `contentSafeAreaInset.bottom` while it shows, which is how the cabinet's
// tab bar ends up above it, as in Telegram (there the webview shrinks).
//
// Query parameters: scheme=light|dark (else the OS), tgLang=<code>,
// startapp=<param>, tgName=<first name>, tgUser=<username>; TgShell reads accountLang=<code> and mockFail=auth|offline,
// the dashboard mockState=… and mockBalance=<cents>.

import type { TelegramInsets, TelegramViewportChange, TelegramWebApp } from "./telegram-webapp-client";

const HEADER_H = 56;
/** Telegram's bottom button bar (MainButton), drawn by the mock. */
const MAIN_BUTTON_H = 64;

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
  /** The bottom button as last shown, null while hidden. */
  mainButton: { text: string; active: boolean; progress: boolean } | null;
}

declare global {
  interface Window {
    /** Dev preview: what the fake WebApp was asked to do (read by screenshot scripts). */
    __tgMock?: MockTelegramLog & { back(): void; tapMainButton(): void };
  }
}

export function installMockTelegram(): void {
  if (window.Telegram?.WebApp) return;
  const q = new URLSearchParams(window.location.search);
  const scheme: "light" | "dark" =
    q.get("scheme") === "light" ? "light" : q.get("scheme") === "dark" ? "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const log: MockTelegramLog = { openedLinks: [], haptics: [], header: null, background: null, bottomBar: null, mainButton: null };

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
  const contentInset = insets(HEADER_H);

  // Telegram's bottom button, drawn by the page itself.
  const mbHandlers = new Set<Handler>();
  const mb = { text: "", active: true, visible: false, progress: false, color: "#2481cc", textColor: "#ffffff" };
  const mbBar = document.createElement("div");
  mbBar.setAttribute("data-tg-mock", "");
  mbBar.style.cssText = [
    "position:fixed", "z-index:1000", "left:0", "right:0", "bottom:0", `height:${MAIN_BUTTON_H}px`,
    "display:none", "padding:8px 12px", "box-sizing:border-box",
  ].join(";");
  const mbButton = document.createElement("button");
  mbButton.type = "button";
  mbButton.style.cssText =
    "width:100%;height:100%;border:0;border-radius:10px;font:600 15px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer";
  mbBar.append(mbButton);
  mbButton.addEventListener("click", () => {
    if (!mb.active || mb.progress) return;
    for (const h of [...mbHandlers]) h();
  });
  const fireViewport = (): void => {
    for (const h of events.get("viewportChanged") ?? []) (h as ViewportHandler)({ isStateStable: true });
  };
  const paintMainButton = (): void => {
    mbBar.style.display = mb.visible ? "block" : "none";
    mbBar.style.background = log.bottomBar ?? (scheme === "dark" ? "#17212b" : "#ffffff");
    mbButton.style.background = mb.color;
    mbButton.style.color = mb.textColor;
    mbButton.style.opacity = mb.active ? "1" : ".55";
    mbButton.textContent = mb.progress ? "…" : mb.text;
    log.mainButton = mb.visible ? { text: mb.text, active: mb.active, progress: mb.progress } : null;
    const bottom = mb.visible ? MAIN_BUTTON_H : 0;
    if (contentInset.bottom !== bottom) {
      (contentInset as { bottom: number }).bottom = bottom;
      fireViewport();
    }
  };

  const wa: TelegramWebApp = {
    initData: "mock",
    initDataUnsafe: {
      user: {
        id: 100000001,
        language_code: q.get("tgLang") ?? "en",
        first_name: q.get("tgName") ?? "Alex",
        ...(q.get("tgUser") !== "" ? { username: q.get("tgUser") ?? "alex_kovra" } : {}),
      },
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
    contentSafeAreaInset: contentInset,
    MainButton: {
      get isVisible() {
        return mb.visible;
      },
      setParams(p) {
        if (typeof p.text === "string") mb.text = p.text;
        if (typeof p.color === "string") mb.color = p.color;
        if (typeof p.text_color === "string") mb.textColor = p.text_color;
        if (typeof p.is_active === "boolean") mb.active = p.is_active;
        if (typeof p.is_visible === "boolean") mb.visible = p.is_visible;
        paintMainButton();
      },
      show() {
        mb.visible = true;
        paintMainButton();
      },
      hide() {
        mb.visible = false;
        paintMainButton();
      },
      showProgress() {
        mb.progress = true;
        paintMainButton();
      },
      hideProgress() {
        mb.progress = false;
        paintMainButton();
      },
      onClick(h) {
        mbHandlers.add(h);
      },
      offClick(h) {
        mbHandlers.delete(h);
      },
    },
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
      paintMainButton();
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
  document.body.appendChild(mbBar);
  window.Telegram = { WebApp: wa };
  window.__tgMock = { ...log, back: () => left.click(), tapMainButton: () => mbButton.click() };
  // Keep the exported log live (the spread above copied the arrays by reference).
  Object.defineProperty(window.__tgMock, "header", { get: () => log.header });
  Object.defineProperty(window.__tgMock, "mainButton", { get: () => log.mainButton });
  window.addEventListener("resize", () => {
    for (const h of events.get("viewportChanged") ?? []) (h as ViewportHandler)({ isStateStable: true });
  });
}

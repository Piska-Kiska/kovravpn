// src/app/tg/layout.tsx
//
// Like /dashboard: the cabinet is kept out of search. The page sets a
// localized document.title on the client (Telegram does not show it).
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { absolute: "Kovra" },
  robots: { index: false, follow: false, nocache: true },
};

// Telegram's webview: the page reaches the screen edges so the safe-area
// insets are real (the cabinet pads for them). Zoom stays allowed; inputs are
// 16px, so iOS does not zoom in on focus.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function TgLayout({ children }: { children: React.ReactNode }) {
  return children;
}

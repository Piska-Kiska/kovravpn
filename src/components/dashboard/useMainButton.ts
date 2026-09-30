// src/components/dashboard/useMainButton.ts
//
// Telegram's bottom button (the Mini App's MainButton) for the view's one
// gold action. The host binds it (TgShell, Bot API 6.0+); on the site, or on
// a client without it, nothing happens and the page keeps its own button.
//
// Re-binds only when what the button shows changes; the click always runs
// the latest handler (kept in a ref), so a re-render never re-creates it.
"use client";

import { useEffect, useRef } from "react";
import type { DashHost, HostMainButton } from "./host";

/** Returns true while Telegram's button stands in for the page's own. */
export function useMainButton(bind: DashHost["mainButton"], spec: HostMainButton | null): boolean {
  const onClick = useRef<(() => void) | null>(spec?.onClick ?? null);
  useEffect(() => {
    onClick.current = spec?.onClick ?? null;
  });
  const text = spec?.text ?? null;
  const active = spec?.active ?? false;
  const loading = spec?.loading ?? false;
  useEffect(() => {
    if (!bind || text === null) return;
    return bind({ text, active, loading, onClick: () => onClick.current?.() });
  }, [bind, text, active, loading]);
  return !!bind && text !== null;
}

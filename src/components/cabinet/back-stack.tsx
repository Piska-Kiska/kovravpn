// src/components/cabinet/back-stack.tsx
//
// "What does Back close?" for hosts that have their own Back control: the
// Telegram Mini App's back arrow (and Android's hardware Back, which Telegram
// routes to it). Every open layer — a dialog, a bottom sheet, an inline
// picker — pushes its close handler while it is open; Back runs the newest.
// With no layer open the host decides (the Mini App goes to the home view).
//
// Without a provider (the site) useBackLayer does nothing: the browser's own
// Back and Escape keep working as before.
"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { BackStack } from "@/lib/back-stack";

export { createBackStack, type BackStack } from "@/lib/back-stack";

const BackStackContext = createContext<BackStack | null>(null);

export function BackStackProvider({ stack, children }: { stack: BackStack; children: ReactNode }) {
  return <BackStackContext.Provider value={stack}>{children}</BackStackContext.Provider>;
}

/** While `active`, Back runs `onBack` (the newest active layer wins). */
export function useBackLayer(active: boolean, onBack: () => void): void {
  const stack = useContext(BackStackContext);
  const handler = useRef(onBack);
  useEffect(() => {
    handler.current = onBack;
  });
  useEffect(() => {
    if (!stack || !active) return;
    return stack.push(() => handler.current());
  }, [stack, active]);
}

/** Number of open layers (0 on the server). */
export function useBackStackSize(stack: BackStack): number {
  return useSyncExternalStore(stack.subscribe, stack.size, () => 0);
}

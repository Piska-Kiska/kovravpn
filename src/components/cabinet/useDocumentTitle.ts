// src/components/cabinet/useDocumentTitle.ts
// Localized document.title for client pages. Next streams route metadata into
// <head> after hydration, which would overwrite a title set once in an
// effect, so the hook re-applies its value whenever <head> changes while the
// page is mounted.
"use client";

import { useEffect } from "react";

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [title]);
}

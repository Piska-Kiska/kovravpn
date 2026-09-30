// src/app/add/[token]/AddClient.tsx
//
// The interactive half of the /add bridge: opens Happ once on arrival and
// offers the key to copy. Everything else is server-rendered by page.tsx.
"use client";

import { useEffect } from "react";
import { CopyField } from "@/components/cabinet/CopyField";

/** Opens `happUrl` once, shortly after the page shows (the button stays for a second try). */
export function AutoOpen({ happUrl }: { happUrl: string }) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      window.location.href = happUrl;
    }, 400);
    return () => window.clearTimeout(id);
  }, [happUrl]);
  return null;
}

export interface KeyCopyProps {
  value: string;
  label: string;
  copyLabel: string;
  copiedLabel: string;
  failedLabel: string;
}

export function KeyCopy(props: KeyCopyProps) {
  return (
    <CopyField
      value={props.value}
      label={props.label}
      copyLabel={props.copyLabel}
      copiedLabel={props.copiedLabel}
      failedLabel={props.failedLabel}
    />
  );
}

// src/components/cabinet/CopyField.tsx
// Read-only value (mono, one line, ellipsis) with a copy button.
// "Copied" appears only when the clipboard write succeeded; a polite live
// region announces the result either way.
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { Icon } from "./Icon";
import { cx } from "./util";

export interface CopyFieldProps {
  value: string;
  label: string;
  copyLabel: string;
  copiedLabel: string;
  failedLabel: string;
  hideLabel?: boolean;
  /** Shown instead of the value when it is empty; copying is disabled. */
  emptyText?: string;
  className?: string;
}

type CopyState = "idle" | "copied" | "failed";

export function CopyField({ value, label, copyLabel, copiedLabel, failedLabel, hideLabel, emptyText = "—", className }: CopyFieldProps) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onCopy = async () => {
    if (!value) return;
    const ok = await copyText(value);
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), ok ? 2000 : 6000);
  };

  const copied = state === "copied";
  return (
    <div className={cx("kc-copy", className)}>
      <span id={labelId} className={hideLabel ? "kc-sr" : "kc-label"}>
        {label}
      </span>
      <div className="kc-copy-row">
        {/* A link or code: keep the browser's page translation off it (the empty-state text stays translatable). */}
        <span className="kc-copy-value" translate={value ? "no" : undefined} title={value || undefined}>
          {value || emptyText}
        </span>
        <button
          type="button"
          className={cx("kc-copy-btn", copied && "is-copied")}
          onClick={onCopy}
          disabled={!value}
          aria-describedby={labelId}
        >
          <span className="kc-swap" key={copied ? "c" : "i"}>
            <Icon as={copied ? Check : Copy} size={18} />
          </span>
          <span className="kc-copy-text" aria-hidden="true">
            {copied ? copiedLabel : copyLabel}
          </span>
          <span className="kc-sr">{copyLabel}</span>
        </button>
      </div>
      {state === "failed" ? <p className="kc-copy-msg">{failedLabel}</p> : null}
      <span className="kc-sr" aria-live="polite">
        {state === "copied" ? copiedLabel : state === "failed" ? failedLabel : ""}
      </span>
    </div>
  );
}

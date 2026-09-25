// src/components/cabinet/CodeCard.tsx
// Shows a one-time code (the Telegram login code) with a real copy button.
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { Button } from "./Button";

export interface CodeCardProps {
  code: string;
  label: string;
  copyLabel: string;
  copiedLabel: string;
}

export function CodeCard({ code, label, copyLabel, copiedLabel }: CodeCardProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onCopy = async () => {
    const ok = await copyText(code);
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="kc-codecard">
      <span className="kc-mono kc-codecard-label">{label}</span>
      <span className="kc-codecard-code" translate="no">
        {code}
      </span>
      <Button variant="ghost" size="sm" icon={copied ? Check : Copy} onClick={onCopy}>
        {copied ? copiedLabel : copyLabel}
      </Button>
      <span className="kc-sr" aria-live="polite">
        {copied ? copiedLabel : ""}
      </span>
    </div>
  );
}

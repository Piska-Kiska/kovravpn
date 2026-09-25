// src/components/cabinet/TelegramAuth.tsx
// Telegram sign-in / sign-up: create a one-time code, open the bot, poll
// /api/auth/telegram/verify every 3 s. Unmounting (switching the method to
// Email) drops the code and stops polling.
"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Send } from "lucide-react";
import { useCabinetLang } from "@/lib/cabinet-lang";
import { useAuthT } from "@/lib/i18n-auth";
import { localizeError, useShellT } from "@/lib/i18n-shell";
import { Button, ButtonLink } from "./Button";
import { CodeCard } from "./CodeCard";
import { Notice } from "./Notice";
import { readJson } from "./util";

export interface TelegramAuthProps {
  /** Exactly what the page sends to POST /api/auth/telegram. */
  startInit: RequestInit;
  /** Called once the bot confirmed the code (track + redirect live here). */
  onVerified(): void;
}

type StartError = { kind: "server"; raw: unknown; status: number } | { kind: "start" };

const POLL_MS = 3000;

export function TelegramAuth({ startInit, onVerified }: TelegramAuthProps) {
  const lang = useCabinetLang();
  const t = useAuthT();
  const shell = useShellT();
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgPolling, setTgPolling] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<StartError | null>(null);
  const onVerifiedRef = useRef(onVerified);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
  });

  const startTelegram = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/telegram", startInit);
      const data = await readJson(res);
      if (typeof data.code === "string" && data.code) {
        setTgCode(data.code);
        setTgPolling(true);
      } else {
        setError(data.error ? { kind: "server", raw: data.error, status: res.status } : { kind: "start" });
      }
    } catch {
      setError({ kind: "start" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!tgPolling || !tgCode) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/telegram/verify?code=${tgCode}`);
        const data = await readJson(res);
        if (data.verified) {
          setTgPolling(false);
          onVerifiedRef.current();
        }
      } catch {
        /* retry on the next tick */
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [tgPolling, tgCode]);

  const errorText = error ? (error.kind === "server" ? localizeError(error.raw, error.status, lang) : t.err_tg_start) : null;

  if (!tgCode) {
    return (
      <div className="kc-stack">
        <p className="kc-body kc-t2">{t.tg_intro}</p>
        {errorText ? <Notice tone="error">{errorText}</Notice> : null}
        <Button variant="cta" block icon={Send} loading={loading} onClick={startTelegram}>
          {t.tg_continue}
        </Button>
      </div>
    );
  }

  const botLink = `https://t.me/KovraVPN_bot?start=${tgCode}`;
  return (
    <div className="kc-stack">
      {errorText ? <Notice tone="error">{errorText}</Notice> : null}
      <ButtonLink variant="cta" block icon={Send} href={botLink} target="_blank" rel="noopener noreferrer">
        {t.tg_open}
      </ButtonLink>
      <p className="kc-small">{t.tg_helper}</p>
      {tgPolling ? (
        <p className="kc-status" role="status">
          <span className="kc-spin" aria-hidden="true" />
          <span>{t.tg_waiting}</span>
        </p>
      ) : null}
      <hr className="kc-hair" />
      <p className="kc-tg-or">{t.tg_fallback}</p>
      <CodeCard code={tgCode} label={t.tg_code_label} copyLabel={shell.copy} copiedLabel={shell.copied} />
      <div>
        <Button variant="quiet" size="sm" icon={RotateCcw} iconSize={16} loading={loading} onClick={startTelegram}>
          {t.tg_new_code}
        </Button>
      </div>
    </div>
  );
}

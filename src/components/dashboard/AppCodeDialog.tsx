// src/components/dashboard/AppCodeDialog.tsx
// "Code for the app": a one-time code for one device that the Kovra app for
// iPhone and iPad takes in place of the link (POST /api/vpn/pair-code,
// lib/pair-code-server.ts). The code lives ten minutes and works once; the
// dialog counts down and offers a new one when it runs out. Signing in by the
// code moves the device's link into the app, out of any other app it is in:
// the dialog says so before the code is typed.
"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, CodeCard, Dialog, Notice, readJson } from "@/components/cabinet";
import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { dashError } from "@/lib/dashboard/errors";
import { formatLeft, parseAppCode, type AppCode } from "@/lib/dashboard/app-code";

export interface AppCodeDialogProps {
  /** The device the code is for; null keeps the dialog closed. */
  uuid: string | null;
  t: DashDict;
  lang: Lang;
  onClose(): void;
}

export function AppCodeDialog({ uuid, t, lang, onClose }: AppCodeDialogProps) {
  return (
    <Dialog open={uuid !== null} onClose={onClose} title={t.app_code_title} size="sm">
      {/* Dialog renders its children only while open: each opening asks for a fresh code. */}
      {uuid !== null ? <AppCodeBody uuid={uuid} t={t} lang={lang} onClose={onClose} /> : null}
    </Dialog>
  );
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; code: AppCode }
  | { kind: "expired" }
  /** `status` is null when the request never got an answer. */
  | { kind: "error"; raw: unknown; status: number | null };

/** One request for a code; resolves to the state it leads to, or null when cancelled. */
async function requestCode(uuid: string, signal: AbortSignal): Promise<State | null> {
  try {
    const res = await fetch("/api/vpn/pair-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid }),
      signal,
    });
    const body = await readJson(res);
    if (signal.aborted) return null;
    const code = res.ok ? parseAppCode(body, Date.now()) : null;
    return code ? { kind: "ready", code } : { kind: "error", raw: body.error, status: res.status };
  } catch {
    return signal.aborted ? null : { kind: "error", raw: undefined, status: null };
  }
}

function AppCodeBody({ uuid, t, lang, onClose }: { uuid: string; t: DashDict; lang: Lang; onClose(): void }) {
  const shell = useShellT();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());
  /** Bumped by "New code": each value is one request. */
  const [attempt, setAttempt] = useState(0);

  // One request per opening and per "New code"; closing the dialog or asking
  // again cancels the one under way, so no answer lands on a newer state.
  useEffect(() => {
    const ctrl = new AbortController();
    void requestCode(uuid, ctrl.signal).then((next) => {
      if (next === null) return;
      setNow(Date.now());
      setState(next);
    });
    return () => ctrl.abort();
  }, [uuid, attempt]);

  const retry = () => {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  };

  // The countdown ticks only while a code is shown.
  useEffect(() => {
    if (state.kind !== "ready") return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at >= state.code.expiresAt) setState({ kind: "expired" });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  return (
    <>
      <div className="kc-dialog-body kc-appcode">
        <p>{t.app_code_body}</p>
        {state.kind === "ready" ? (
          <>
            <CodeCard code={state.code.display} label={t.app_code_label} copyLabel={shell.copy} copiedLabel={shell.copied} />
            <p className="kc-mono kc-appcode-left" aria-live="off">
              {fmt(t.app_code_left, { time: formatLeft(state.code.expiresAt - now) })}
            </p>
          </>
        ) : null}
        {state.kind === "loading" ? (
          <p className="kc-appcode-wait" role="status">
            {t.app_code_loading}
          </p>
        ) : null}
        {state.kind === "expired" ? (
          <Notice tone="info" className="kc-appcode-notice">
            {t.app_code_expired}
          </Notice>
        ) : null}
        {state.kind === "error" ? (
          <Notice tone="error" className="kc-appcode-notice">
            {state.status === null ? t.err_conn : dashError(state.raw, state.status, lang, t, t.err_generic)}
          </Notice>
        ) : null}
        <p className="kc-small">{t.app_code_moves}</p>
      </div>
      <div className="kc-dialog-actions">
        <Button variant="ghost" onClick={onClose}>
          {shell.close}
        </Button>
        {state.kind === "expired" || state.kind === "error" ? (
          <Button variant="cta" icon={RefreshCw} onClick={retry} data-autofocus="">
            {t.app_code_new}
          </Button>
        ) : null}
      </div>
    </>
  );
}

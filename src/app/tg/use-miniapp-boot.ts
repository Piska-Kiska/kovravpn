"use client";

// src/app/tg/use-miniapp-boot.ts
//
// Boot of the Mini App cabinet: wait for Telegram's script, tell "not in
// Telegram" apart from "the script failed", hide initData from the address
// bar, call ready()/expand(), let the page wire itself up (`prepare`), sign in
// with initData, and only then report "ready".
//
// The order matters: `prepare` installs the Bearer fetch before the cabinet
// mounts (its effects call /api/auth/me on the first frame), and the language
// is decided after the sign-in, which returns the account's language.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { LoginResult, MiniAppAuth } from "./miniapp-fetch";
import { waitForWebApp, type TelegramWebApp } from "./telegram-webapp-client";

/** How long to wait for Telegram's script before calling it a failure. */
export const SDK_TIMEOUT_MS = 8_000;

export interface MiniAppPrepared<T> {
  readonly auth: MiniAppAuth;
  /** Run when the page unmounts or the boot restarts. */
  readonly cleanups: ReadonlyArray<() => void>;
  /** Called after a successful sign-in; its result is handed to the ready phase. */
  finish(): T;
}

export type MiniAppPhase<T> =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly wa: TelegramWebApp; readonly value: T }
  /** Opened outside Telegram: no signed initData. */
  | { readonly kind: "outside" }
  /** sdk: Telegram's script did not load; offline: no answer from us; auth: the server refused. */
  | { readonly kind: "error"; readonly reason: "sdk" | "offline" | "auth" };

export interface MiniAppBoot<T> {
  readonly phase: MiniAppPhase<T>;
  /** The WebApp object once known; read it in handlers, not during render. */
  readonly webAppRef: RefObject<TelegramWebApp | null>;
  /** The session could not be restored even by a fresh sign-in. */
  failAuth(): void;
  /** Telegram's script failed to load (next/script onError). */
  failSdk(): void;
  /** Retry after an error: reload for the script, sign in again otherwise. */
  retry(): void;
}

export function useMiniAppBoot<T>(
  prepare: (wa: TelegramWebApp, failAuth: () => void) => MiniAppPrepared<T>,
  /** Dev preview: resolves once a fake WebApp is installed (no-op in production). */
  beforeWait?: () => Promise<void>,
): MiniAppBoot<T> {
  const [phase, setPhase] = useState<MiniAppPhase<T>>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const webAppRef = useRef<TelegramWebApp | null>(null);
  const authRef = useRef<MiniAppAuth | null>(null);
  const prepareRef = useRef(prepare);
  const beforeRef = useRef(beforeWait);

  useEffect(() => {
    prepareRef.current = prepare;
    beforeRef.current = beforeWait;
  }, [prepare, beforeWait]);

  const failAuth = useCallback((): void => {
    setPhase({ kind: "error", reason: "auth" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const run = async (): Promise<void> => {
      await beforeRef.current?.();
      const wa = await waitForWebApp(SDK_TIMEOUT_MS);
      // Check after every await: React mounts twice in dev, and the first run
      // must not install anything nobody is left to remove.
      if (cancelled) return;
      if (!wa) {
        setPhase({ kind: "error", reason: "sdk" });
        return;
      }
      if (!wa.initData) {
        setPhase({ kind: "outside" });
        return;
      }
      webAppRef.current = wa;
      // Telegram puts initData (an hour-long pass to the account, plus name
      // and id) into the URL hash. The script has read it already; remove it
      // so no page script, analytics or Referer sees it.
      if (window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      try {
        wa.ready();
        wa.expand();
      } catch {
        // An odd client: the page still works at the height it got.
      }

      const prepared = prepareRef.current(wa, failAuth);
      cleanups.push(...prepared.cleanups);
      authRef.current = prepared.auth;

      // A token from an earlier load of this window is used as is: if it has
      // expired, the fetch layer signs in again on the first 401.
      let result: LoginResult = "ok";
      if (!prepared.auth.token) result = await prepared.auth.login();
      if (cancelled) return;
      if (result !== "ok") {
        setPhase({ kind: "error", reason: result === "offline" ? "offline" : "auth" });
        return;
      }
      setPhase({ kind: "ready", wa, value: prepared.finish() });
    };

    void run();
    return () => {
      cancelled = true;
      for (const fn of cleanups.splice(0)) fn();
    };
  }, [attempt, failAuth]);

  const failSdk = useCallback((): void => {
    setPhase({ kind: "error", reason: "sdk" });
  }, []);

  const retry = useCallback((): void => {
    if (phase.kind === "error" && phase.reason === "sdk") {
      // The script loads once per document; only a reload repeats it.
      window.location.reload();
      return;
    }
    authRef.current?.reset();
    setPhase({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, [phase]);

  return { phase, webAppRef, failAuth, failSdk, retry };
}

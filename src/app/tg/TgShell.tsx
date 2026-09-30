"use client";

// src/app/tg/TgShell.tsx
//
// The Mini App shell: loads Telegram's script, waits for it, follows its
// theme and window height, exchanges initData for a Bearer session, decides
// the language, and only then mounts the same DashboardView as /dashboard in
// embedded mode (no site header, Telegram's back arrow, payments in the
// external browser, auth loss -> "reopen", not /login).
//
// Entry points the shell understands (the cabinet reads the resulting URL):
//   ?lang=<code>      the bot's language (the bot's buttons pass it);
//   ?view=<view>      plan | rewards | account | devices | topup;
//   start_param       `https://t.me/<bot>?startapp=paid|topup|plan|…`: turned
//                     into ?paid=1 / ?view=… once per window.
//
// Dev preview: /tg?mock=1 with NEXT_PUBLIC_DASH_MOCK=1 under `next dev`
// installs a fake Telegram (mock-telegram.ts). Dead in production builds.

import Script from "next/script";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import KovraWordmark from "@/components/KovraWordmark";
import { Button, ButtonLink, CabinetRoot, Icon } from "@/components/cabinet";
import { DashboardView } from "@/components/dashboard/DashboardView";
import type { DashHost } from "@/components/dashboard/host";
import { botChatUrl } from "@/lib/bot-link";
import { syncCabinetLang, type Lang } from "@/lib/cabinet-lang";
import { useDashLang } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { LANG_EXPLICIT_STORAGE_KEY, LANG_STORAGE_KEY } from "@/i18n/resolve";
import { pickMiniAppLang, searchWithLang } from "@/lib/miniapp-lang";
import { parseStartParam, startActionQuery } from "@/lib/payment-return";
import { applyThemePref } from "@/lib/theme";
import { installMiniAppFetch, type MiniAppAuth } from "./miniapp-fetch";
import {
  TG_SDK_URL,
  bindBackButton,
  bindTelegramTheme,
  bindViewport,
  haptic,
  interceptLinks,
  lockVerticalSwipes,
  openOutside,
  type TelegramWebApp,
} from "./telegram-webapp-client";
import { useMiniAppBoot, type MiniAppPhase, type MiniAppPrepared } from "./use-miniapp-boot";
import "./tg.css";

const TG_MOCK = process.env.NEXT_PUBLIC_DASH_MOCK === "1" && process.env.NODE_ENV !== "production";

/** start_param handled in this window already: it stays in initData for the whole session. */
const START_SEEN_KEY = "kovra_tg_start_seen";

function botUrl(): string {
  return botChatUrl(undefined, { NEXT_PUBLIC_BOT_USERNAME: process.env.NEXT_PUBLIC_BOT_USERNAME });
}

/** `?startapp=` -> the cabinet's own query parameter, once per Mini App window. */
function consumeStartParam(wa: TelegramWebApp): readonly [string, string] | null {
  const param = wa.initDataUnsafe.start_param;
  const action = parseStartParam(param);
  if (!param || !action) return null;
  try {
    if (window.sessionStorage.getItem(START_SEEN_KEY) === param) return null;
    window.sessionStorage.setItem(START_SEEN_KEY, param);
  } catch {
    // Without storage a reload may repeat it: no worse than F5 on the site.
  }
  return startActionQuery(action);
}

function storedExplicitLang(): string | null {
  try {
    return window.localStorage.getItem(LANG_EXPLICIT_STORAGE_KEY) === "1" ? window.localStorage.getItem(LANG_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

/**
 * The cabinet's address before it mounts, in one replaceState (null state:
 * see replaceDashUrl): `lang` where the cabinet resolver reads it first, plus
 * the start parameter turned into the cabinet's own query. Then apply the
 * language.
 */
function applyEntryUrl(lang: Lang, start: readonly [string, string] | null): void {
  const url = new URL(window.location.href);
  url.search = searchWithLang(url.search, lang);
  if (start && !url.searchParams.has(start[0])) url.searchParams.set(start[0], start[1]);
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, "", next);
  }
  syncCabinetLang();
}

interface ShellValue {
  readonly mock: boolean;
}

/** A signed-in session for the preview: no server, no Redis. */
function mockAuth(): MiniAppAuth {
  const q = new URLSearchParams(window.location.search);
  // ?mockFail=auth|offline previews the error screens.
  const fail = q.get("mockFail");
  if (fail === "auth" || fail === "offline") {
    return { token: null, info: null, login: async () => (fail === "auth" ? "refused" : "offline"), reset() {} };
  }
  return {
    token: "00000000-0000-4000-8000-000000000000",
    info: { userId: "tg_100000001", lang: q.get("accountLang"), isNewUser: false },
    login: async () => "ok",
    reset() {},
  };
}

function prepareShell(wa: TelegramWebApp, failAuth: () => void, mock: boolean): MiniAppPrepared<ShellValue> {
  const cleanups: Array<() => void> = [
    bindTelegramTheme(wa, (scheme) => applyThemePref(scheme)),
    bindViewport(wa),
    interceptLinks(wa),
    lockVerticalSwipes(wa),
  ];
  let auth: MiniAppAuth;
  if (mock) {
    auth = mockAuth();
  } else {
    const uid = typeof wa.initDataUnsafe.user?.id === "number" ? String(wa.initDataUnsafe.user.id) : null;
    const installed = installMiniAppFetch(() => wa.initData, uid, failAuth);
    auth = installed.auth;
    cleanups.push(installed.uninstall);
  }
  const start = consumeStartParam(wa);
  return {
    auth,
    cleanups,
    finish() {
      const lang = pickMiniAppLang({
        urlLang: new URLSearchParams(window.location.search).get("lang"),
        accountLang: auth.info?.lang ?? null,
        telegramLang: wa.initDataUnsafe.user?.language_code ?? null,
        storedExplicit: storedExplicitLang(),
      });
      applyEntryUrl(lang, start);
      return { mock };
    },
  };
}

function useMockFlag(): boolean {
  // Read once on the client; the shell renders nothing on the server anyway.
  const [mock] = useState(() => TG_MOCK && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mock") === "1");
  return mock;
}

export default function TgShell() {
  const mock = useMockFlag();
  const prepare = useCallback((wa: TelegramWebApp, failAuth: () => void) => prepareShell(wa, failAuth, mock), [mock]);
  const beforeWait = useCallback(async () => {
    if (!mock || !TG_MOCK) return;
    const m = await import("./mock-telegram");
    m.installMockTelegram();
  }, [mock]);
  const { phase, webAppRef, failAuth, failSdk, retry } = useMiniAppBoot(prepare, beforeWait);

  // Hide Telegram's back arrow when the shell goes away.
  useEffect(
    () => () => {
      const wa = webAppRef.current;
      if (wa) bindBackButton(wa, null);
    },
    [webAppRef],
  );

  const host = useMemo<DashHost | null>(() => {
    if (phase.kind !== "ready") return null;
    const wa = phase.wa;
    const isMock = phase.value.mock;
    return {
      embedded: true,
      openPayment: (url) => openOutside(wa, url),
      onAuthLost: failAuth,
      bindBack: (handler) => bindBackButton(wa, handler),
      haptic: (kind) => haptic(wa, kind),
      onLangChange: (lang) => {
        // Keep it in the URL for a reload of this window, and on the account
        // so the bot speaks it too (and opens the cabinet with it).
        const search = searchWithLang(window.location.search, lang);
        window.history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
        if (isMock) return;
        void fetch("/api/account/lang", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang }),
        }).catch(() => {
          // The cabinet already switched; the bot catches up on the next change.
        });
      },
      onResume: (fn) => {
        wa.onEvent("activated", fn);
        return () => wa.offEvent("activated", fn);
      },
    };
  }, [phase, failAuth]);

  return (
    <>
      {mock ? null : <Script src={TG_SDK_URL} strategy="afterInteractive" onError={failSdk} />}
      {phase.kind === "ready" && host ? <DashboardView host={host} /> : <ShellScreen phase={phase.kind === "ready" ? null : phase} onRetry={retry} onClose={() => webAppRef.current?.close()} />}
    </>
  );
}

type ShellPhase = Exclude<MiniAppPhase<ShellValue>, { kind: "ready" }>;

/** Loading, "open in Telegram" and error screens, in Kovra's look. */
function ShellScreen({ phase, onRetry, onClose }: { phase: ShellPhase | null; onRetry(): void; onClose(): void }) {
  const { t } = useDashLang();
  const shell = useShellT();
  const kind = phase?.kind ?? "loading";
  return (
    <CabinetRoot variant="dash" className="kc-embedded kc-tgshell">
      <main id="kc-main" className="kc-tgshell-main" aria-busy={kind === "loading" || undefined}>
        <div className="kc-tgshell-card">
          <KovraWordmark height={26} />
          {kind === "loading" ? (
            <p className="kc-tgshell-status" role="status">
              <span className="kc-spin" aria-hidden="true" />
              <span>{t.tg_loading}</span>
            </p>
          ) : kind === "outside" ? (
            <>
              <div className="kc-tgshell-text">
                <h1 className="kc-h2">{t.tg_outside_title}</h1>
                <p className="kc-small">{t.tg_outside_body}</p>
              </div>
              <ButtonLink variant="cta" block icon={Send} href={botUrl()}>
                {t.tg_open_bot}
              </ButtonLink>
            </>
          ) : (
            <>
              <p className="kc-tgshell-error" role="alert">
                <Icon as={AlertTriangle} size={18} />
                <span>{phase?.kind === "error" && phase.reason === "auth" ? t.tg_err_auth : phase?.kind === "error" && phase.reason === "sdk" ? t.tg_err_sdk : t.err_conn}</span>
              </p>
              <div className="kc-tgshell-actions">
                <Button variant="cta" block onClick={onRetry}>
                  {shell.retry}
                </Button>
                {phase?.kind === "error" && phase.reason === "auth" ? (
                  <Button variant="ghost" block onClick={onClose}>
                    {t.tg_close}
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </main>
    </CabinetRoot>
  );
}

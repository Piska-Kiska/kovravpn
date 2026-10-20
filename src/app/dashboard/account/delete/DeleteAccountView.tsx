// src/app/dashboard/account/delete/DeleteAccountView.tsx
//
// The account deletion page: what goes (this account's own balance, plans
// and devices), a code to the account's own channel, one last question, then
// the deletion (lib/account-delete.ts). The Kovra app for iPhone and iPad
// opens this page; without a session the middleware sends the person to
// /login and back here (lib/login-return.ts).
//
// Opened from the app, the page must not lead to a page that sells: there is
// no link home and none to the cabinet, only the policy (a new tab) and the
// support address. The wordmark is not a link.
//
// OWNER FIRST. Accounts outside the gate `acctdel:users` get no form, only
// the support address (the server answers `enabled: false`). The owner's own
// account runs everything as a dry run and deletes nothing.
//
// AFTER DELETION the page calls nothing any more and offers nothing to
// press: the session is gone, and any request would only meet a 401.
"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Check, Mail, Trash2 } from "lucide-react";
import KovraWordmark from "@/components/KovraWordmark";
import { PrefsCapsule } from "@/components/chrome/PrefsCapsule";
import {
  Button,
  ButtonLink,
  CabinetRoot,
  ConfirmDialog,
  Icon,
  Notice,
  OtpInput,
  OTP_LENGTH,
  useDocumentTitle,
  type OtpInputHandle,
} from "@/components/cabinet";
import { fmt, fmtNodes, plural, setCabinetLang, useCabinetLang, type Lang } from "@/lib/cabinet-lang";
import { useShellT } from "@/lib/i18n-shell";
import { ACCOUNT_DELETE_DICT, type AccountDeleteDict } from "@/lib/account-delete-i18n";
import { fmtDate, fmtUsd } from "@/lib/dashboard/format";
import { loginUrlFor } from "@/lib/login-return";
import {
  ACCOUNT_DELETE_PATH,
  ERROR_KEYS,
  SUPPORT_EMAIL,
  codeOf,
  isPageError,
  needsNewCode,
  readCodeResponse,
  readDeleteResponse,
  readStatus,
  retryMinutes,
  showsSupport,
  type CodeChannel,
  type DeleteStatus,
  type FormError,
  type PageError,
} from "./delete-flow";

type Phase =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "closed" }
  | { readonly kind: "linked" }
  | { readonly kind: "open"; readonly status: DeleteStatus }
  | { readonly kind: "dry_run"; readonly keys: number; readonly devices: number }
  | { readonly kind: "deleted" };

interface ShownError {
  readonly error: FormError;
  readonly retryAfter?: number;
}

const EMPTY_CODE: readonly string[] = Array.from({ length: OTP_LENGTH }, () => "");

function errorText(t: AccountDeleteDict, e: ShownError): string {
  const line = t[ERROR_KEYS[e.error]];
  return e.error === "rate_limited" ? fmt(line, { min: retryMinutes(e.retryAfter) }) : line;
}

/** The support address as a button: the one way out the page offers. */
function SupportLink({ t }: { t: AccountDeleteDict }) {
  return (
    <ButtonLink variant="ghost" href={`mailto:${SUPPORT_EMAIL}`} icon={Mail} className="kc-del-support">
      {t.support}
      <span className="kc-del-addr">{SUPPORT_EMAIL}</span>
    </ButtonLink>
  );
}

/** One line of "what is deleted"; a loss is in the text colour, the rest muted. */
function Item({ children, loss = false }: { children: ReactNode; loss?: boolean }) {
  return <li className={loss ? "kc-del-item is-loss" : "kc-del-item"}>{children}</li>;
}

function Shell({ lang, title, sub, children }: { lang: Lang; title: string; sub?: ReactNode; children: ReactNode }) {
  const t = ACCOUNT_DELETE_DICT[lang];
  return (
    <CabinetRoot variant="auth" className="kc-del">
      <div className="k-grain" aria-hidden="true" />
      <div className="kc-auth-side">
        <header className="kc-auth-header">
          <span className="kc-brand" role="img" aria-label="Kovra">
            <KovraWordmark height={22} />
          </span>
          <div className="kc-header-tools kh-bar">
            <PrefsCapsule lang={lang} onLang={setCabinetLang} />
          </div>
        </header>
        <div className="kc-auth-body">
          <main id="kc-main" tabIndex={-1} className="kc-auth-main">
            <div className="kc-auth-col">
              <p className="kc-kicker kc-auth-kicker">{t.kicker}</p>
              <h1 className="kc-display k-metal">{title}</h1>
              {sub ? <p className="kc-auth-sub">{sub}</p> : null}
              <div className="kc-del-content">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </CabinetRoot>
  );
}

export default function DeleteAccountView() {
  const lang = useCabinetLang();
  const t = ACCOUNT_DELETE_DICT[lang];
  const shell = useShellT();
  useDocumentTitle(t.page_title);

  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [ack, setAck] = useState(false);
  const [sentTo, setSentTo] = useState<CodeChannel | null>(null);
  const [cells, setCells] = useState<string[]>(() => [...EMPTY_CODE]);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [shownError, setShownError] = useState<ShownError | null>(null);
  /** Bumped on every code sent: a resend clears the cells and focuses them again. */
  const [sends, setSends] = useState(0);
  const codeRef = useRef<OtpInputHandle>(null);
  const code = codeOf(cells);

  const authLost = useCallback((): void => {
    window.location.href = loginUrlFor(ACCOUNT_DELETE_PATH, window.location.search);
  }, []);

  // The code cells replace the button that was pressed, so focus would fall
  // to the page; on them, a phone offers the code from the message at once.
  useEffect(() => {
    if (sends > 0) codeRef.current?.focus(0);
  }, [sends]);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await fetch("/api/account/delete", { cache: "no-store", signal: ctrl.signal });
        const read = readStatus(r.status, await r.json().catch(() => null));
        if (ctrl.signal.aborted) return;
        if (read.kind === "auth") authLost();
        else if (read.kind === "open") setPhase(read.status.primary ? { kind: "open", status: read.status } : { kind: "linked" });
        else setPhase(read);
      } catch {
        if (!ctrl.signal.aborted) setPhase({ kind: "error" });
      }
    })();
    return () => ctrl.abort();
  }, [authLost, attempt]);

  /** Answers that change the whole page rather than a line under the form. */
  const pageLevel = (error: PageError): void => {
    if (error === "unauthorized") authLost();
    else setPhase({ kind: error === "not_enabled" ? "closed" : "linked" });
  };

  const sendCode = async (): Promise<void> => {
    if (sending) return;
    setSending(true);
    setShownError(null);
    try {
      const r = await fetch("/api/account/delete/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      const out = readCodeResponse(r.status, await r.json().catch(() => null));
      if (out.kind === "sent") {
        setSentTo(out.channel);
        setCells([...EMPTY_CODE]);
        setSends((n) => n + 1);
        return;
      }
      if (isPageError(out.error)) {
        pageLevel(out.error);
        return;
      }
      setShownError({ error: out.error, retryAfter: out.retryAfter });
    } catch {
      setShownError({ error: "internal" });
    } finally {
      setSending(false);
    }
  };

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (deleting || !code) return;
    setAsking(true);
  };

  const remove = async (): Promise<void> => {
    if (deleting || !code) return;
    setDeleting(true);
    setShownError(null);
    try {
      const r = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const out = readDeleteResponse(r.status, await r.json().catch(() => null));
      if (out.kind === "deleted") {
        setPhase({ kind: "deleted" });
        return;
      }
      if (out.kind === "dry_run") {
        setPhase(out);
        return;
      }
      if (isPageError(out.error)) {
        pageLevel(out.error);
        return;
      }
      // A burnt or expired code needs a new one: back to the send step.
      if (needsNewCode(out.error)) {
        setSentTo(null);
        setCells([...EMPTY_CODE]);
      }
      setShownError({ error: out.error, retryAfter: out.retryAfter });
    } catch {
      setShownError({ error: "internal" });
    } finally {
      setDeleting(false);
      setAsking(false);
    }
  };

  if (phase.kind === "loading") {
    return (
      <Shell lang={lang} title={t.title}>
        <Notice tone="pending">{t.loading}</Notice>
      </Shell>
    );
  }

  if (phase.kind === "error") {
    return (
      <Shell lang={lang} title={t.title}>
        <Notice tone="error">{t.load_failed}</Notice>
        <Button
          variant="ghost"
          block
          onClick={() => {
            setPhase({ kind: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          {t.retry}
        </Button>
      </Shell>
    );
  }

  if (phase.kind === "closed" || phase.kind === "linked") {
    return (
      <Shell lang={lang} title={t.title} sub={phase.kind === "closed" ? t.closed : t.linked}>
        <SupportLink t={t} />
      </Shell>
    );
  }

  if (phase.kind === "deleted") {
    return (
      <Shell lang={lang} title={t.done_title}>
        <Notice tone="success">{t.done_text}</Notice>
      </Shell>
    );
  }

  if (phase.kind === "dry_run") {
    return (
      <Shell lang={lang} title={t.dryrun_title} sub={fmt(t.dryrun_result, { keys: phase.keys, devices: phase.devices })}>
        <Notice tone="info">{t.dryrun_note}</Notice>
      </Shell>
    );
  }

  const s = phase.status;
  const hasMoney = s.walletCents > 0 || s.plans > 0;
  const signin = s.linkedEmail && s.linkedTelegram ? t.signin_both : s.linkedTelegram ? t.signin_telegram : t.signin_email;

  return (
    <Shell lang={lang} title={t.title} sub={t.lead}>
      {s.dryRun ? <Notice tone="info">{t.dryrun_note}</Notice> : null}

      {/* Money first: it is what a person regrets, and the numbers are this account's own. */}
      {hasMoney ? (
        <section className="kc-panel kc-del-money" aria-labelledby="kc-del-money">
          <h2 id="kc-del-money" className="kc-h3">
            {t.money_title}
          </h2>
          <ul className="kc-del-list">
            {s.walletCents > 0 ? <Item loss>{fmt(t.money_wallet, { amount: fmtUsd(s.walletCents / 100, lang) })}</Item> : null}
            {s.plans > 0 ? (
              <Item loss>{fmt(plural(lang, s.plans, t.money_plans), { date: fmtDate(s.plansUntil, lang) })}</Item>
            ) : null}
          </ul>
          <p className="kc-small">{t.money_hint}</p>
        </section>
      ) : null}

      <section aria-labelledby="kc-del-what">
        <h2 id="kc-del-what" className="kc-h3">
          {t.what_title}
        </h2>
        <ul className="kc-del-list">
          <Item loss>{signin}</Item>
          {s.devices > 0 ? <Item loss>{plural(lang, s.devices, t.what_devices)}</Item> : null}
          <Item>{t.what_referral}</Item>
          <Item>{t.what_kept}</Item>
        </ul>
        {/* A new tab: the flow stays open. */}
        <p className="kc-small kc-legal">
          {fmtNodes(t.details, {
            privacy: (
              <Link href={`/privacy?lang=${lang}`} target="_blank" rel="noopener">
                {t.privacy}
              </Link>
            ),
          })}
        </p>
      </section>

      <hr className="kc-hair" />

      {s.channel === null ? (
        <>
          <p className="kc-body">{t.err_no_channel}</p>
          <SupportLink t={t} />
        </>
      ) : sentTo === null ? (
        <div className="kc-del-step">
          <label className="kc-check">
            <input className="kc-sr" type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span className="kc-check-box" aria-hidden="true">
              <Icon as={Check} size={14} />
            </span>
            <span>{t.ack}</span>
          </label>
          <p className="kc-small">{s.channel === "telegram" ? t.send_telegram : t.send_email}</p>
          <Button variant="ghost" block onClick={sendCode} disabled={!ack} loading={sending}>
            {t.send}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="kc-del-step" noValidate>
          <p className="kc-body" role="status">
            {sentTo === "telegram" ? t.sent_telegram : t.sent_email}
          </p>
          <OtpInput
            id="acctdel-code"
            ref={codeRef}
            value={cells}
            onChange={(next) => {
              setCells(next);
              if (shownError?.error === "code_invalid") setShownError(null);
            }}
            label={t.code_label}
            digitLabel={(n) => fmt(t.digit_label, { n })}
            invalid={shownError?.error === "code_invalid"}
            describedBy={shownError ? "acctdel-err" : undefined}
          />
          <Button type="submit" variant="danger" block icon={Trash2} disabled={!code} loading={deleting}>
            {t.submit}
          </Button>
          <Button variant="quiet" size="sm" onClick={sendCode} disabled={deleting} loading={sending} className="kc-del-resend">
            {t.resend}
          </Button>
        </form>
      )}

      {shownError ? (
        <div className="kc-del-step" id="acctdel-err">
          <Notice tone="error">{errorText(t, shownError)}</Notice>
          {showsSupport(shownError.error) ? <SupportLink t={t} /> : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={asking}
        title={t.confirm_title}
        body={t.confirm_body}
        confirmLabel={t.confirm_yes}
        cancelLabel={shell.cancel}
        tone="danger"
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setAsking(false)}
      />
    </Shell>
  );
}

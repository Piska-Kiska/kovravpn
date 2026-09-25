// src/components/LinkAccounts.tsx
// Linked sign-in methods on the Account view: the linked ones (with Unlink
// where allowed, confirmed in a dialog) and forms to link the missing one.
// Requests are unchanged: /api/auth/unlink, /api/auth/link/telegram (+ /verify),
// /api/auth/link/email (+ /verify).
"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { ArrowLeft, Check, Mail, Send } from "lucide-react";
import {
  Button,
  ButtonLink,
  CodeCard,
  ConfirmDialog,
  EMAIL_RE,
  Field,
  Icon,
  Notice,
  OtpInput,
  PasswordField,
  type OtpInputHandle,
} from "@/components/cabinet";
import { fmt, fmtNodes } from "@/lib/cabinet-lang";
import { BreakableEmail } from "@/components/dashboard/shared";
import { useDashLang } from "@/lib/dash-i18n";
import { useAuthT } from "@/lib/i18n-auth";
import { localizeError, useShellT } from "@/lib/i18n-shell";

interface Props {
  userId: string;
  authMethod: string;
  email?: string;
  telegramId?: string;
  onUpdate?: () => void;
}

type UnlinkType = "email" | "telegram";

function LinkedRow({ icon, label, mono, email, canUnlink, busy, onUnlink }: { icon: typeof Mail; label: string; mono?: string; email?: boolean; canUnlink: boolean; busy: boolean; onUnlink(): void }) {
  const { t } = useDashLang();
  return (
    <li className="kc-link-row">
      <span className="kc-link-icon">
        <Icon as={icon} size={18} />
      </span>
      <span className="kc-link-text">
        <span className="kc-link-label">
          {email ? <BreakableEmail value={label} /> : label}
          {mono ? <span className="kc-link-mono"> {mono}</span> : null}
        </span>
        <span className="kc-link-status">
          <Icon as={Check} size={14} />
          {t.linked}
        </span>
      </span>
      {canUnlink ? (
        <Button variant="quiet" size="sm" onClick={onUnlink} disabled={busy}>
          {t.link_unlink}
        </Button>
      ) : null}
    </li>
  );
}

export default function LinkAccounts({ userId, email, telegramId, onUpdate }: Props) {
  const { t, lang } = useDashLang();
  const shell = useShellT();
  const hasEmail = !!email;
  const hasTelegram = !!telegramId;
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<UnlinkType | null>(null);

  // Unlink only while both sign-in methods are linked, and never the one the
  // account was created with: the last way in can never be removed.
  const both = hasEmail && hasTelegram;
  const canUnlinkEmail = both && !userId.startsWith("em_");
  const canUnlinkTelegram = both && !userId.startsWith("tg_");

  const handleUnlink = async (type: UnlinkType) => {
    setUnlinking(type);
    setUnlinkError(null);
    try {
      const res = await fetch("/api/auth/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.success) onUpdate?.();
      else setUnlinkError(localizeError(data.error, res.status, lang));
    } catch {
      setUnlinkError(t.err_generic);
    } finally {
      setUnlinking(null);
      setConfirming(null);
    }
  };

  return (
    <section className="kc-panel kc-links" aria-labelledby="kc-links-title">
      <h2 id="kc-links-title" className="kc-h2">
        {t.link_title}
      </h2>

      {hasEmail || hasTelegram ? (
        <ul className="kc-link-list">
          {hasEmail ? (
            <LinkedRow icon={Mail} label={email ?? ""} email canUnlink={canUnlinkEmail} busy={unlinking === "email"} onUnlink={() => setConfirming("email")} />
          ) : null}
          {hasTelegram ? (
            <LinkedRow icon={Send} label={t.link_tg_id} mono={telegramId} canUnlink={canUnlinkTelegram} busy={unlinking === "telegram"} onUnlink={() => setConfirming("telegram")} />
          ) : null}
        </ul>
      ) : null}

      {unlinkError ? (
        <Notice tone="error" onDismiss={() => setUnlinkError(null)} dismissLabel={shell.dismiss}>
          {unlinkError}
        </Notice>
      ) : null}

      {!hasTelegram ? <LinkTelegram /> : null}
      {!hasEmail ? <LinkEmail /> : null}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === "email" ? t.link_unlink_confirm_email : t.link_unlink_confirm_tg}
        body={t.link_unlink_body}
        confirmLabel={t.link_unlink}
        cancelLabel={t.cancel}
        tone="danger"
        busy={unlinking !== null}
        onConfirm={() => confirming && void handleUnlink(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </section>
  );
}

/* ─── Link Telegram ────────────────────────────── */
function LinkTelegram() {
  const { t, lang } = useDashLang();
  const auth = useAuthT();
  const shell = useShellT();
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/link/telegram", { method: "POST" });
      const data = await res.json();
      if (res.ok) { setCode(data.code); setPolling(true); }
      else setError(localizeError(data.error, res.status, lang));
    } catch {
      setError(t.err_conn);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!polling || !code) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/link/telegram/verify?code=${code}`);
        const data = await res.json();
        if (data.linked) { setPolling(false); setDone(true); }
        else if (data.error && res.status === 409) { setPolling(false); setError(localizeError(data.error, res.status, lang)); }
      } catch { /* retry */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling, code, lang]);

  if (done) {
    return (
      <Notice tone="success">{t.link_tg_linked}</Notice>
    );
  }

  return (
    <div className="kc-link-add">
      <div className="kc-link-add-head">
        <span className="kc-link-icon">
          <Icon as={Send} size={18} />
        </span>
        <div className="kc-link-text">
          <p className="kc-link-label">Telegram</p>
          <p className="kc-small">{t.link_tg_intro}</p>
        </div>
      </div>
      {code ? (
        <div className="kc-stack">
          <ButtonLink variant="ghost" block href={`https://t.me/KovraVPN_bot?start=${code}`} target="_blank" rel="noopener noreferrer" icon={Send}>
            {t.link_tg_open}
          </ButtonLink>
          {polling ? (
            <p className="kc-status" role="status">
              <span className="kc-spin" aria-hidden="true" />
              {t.link_waiting}
            </p>
          ) : null}
          <p className="kc-small">{auth.tg_fallback}</p>
          <CodeCard code={code} label={auth.tg_code_label} copyLabel={shell.copy} copiedLabel={shell.copied} />
        </div>
      ) : (
        <div>
          <Button variant="ghost" icon={Send} loading={loading} onClick={() => void startLink()}>
            {t.link_tg_btn}
          </Button>
        </div>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

/* ─── Link Email ───────────────────────────────── */
type EmailStep = "form" | "verify";

function LinkEmail() {
  const { t, lang } = useDashLang();
  const auth = useAuthT();
  const shell = useShellT();
  const [step, setStep] = useState<EmailStep>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState(["", "", "", "", "", ""]);
  const otpRef = useRef<OtpInputHandle>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resendCount, setResendCount] = useState(0);

  const sendCode = async (isResend = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/link/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("verify");
        if (isResend) setResendCount((c) => c + 1);
        const seconds = isResend && resendCount >= 1 ? 180 : 60;
        setCooldown(seconds);
      } else setError(localizeError(data.error, res.status, lang));
    } catch {
      setError(t.err_conn);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cooldown <= 0) return;
    const tm = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(tm);
  }, [cooldown]);

  const verifyEmail = async () => {
    const code = verifyCode.join("");
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/link/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (data.linked) setDone(true);
      else {
        setError(localizeError(data.error, res.status, lang));
        setVerifyCode(["", "", "", "", "", ""]);
        otpRef.current?.focus(0);
      }
    } catch {
      setError(t.err_generic);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (verifyCode.every((d) => d !== "")) verifyEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyCode]);

  const onSubmitForm = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const eErr = !email.trim() ? auth.err_email_required : !EMAIL_RE.test(email.trim()) ? shell.err_email_invalid : null;
    const pErr = password.length < 8 ? auth.err_password_short : null;
    setEmailErr(eErr);
    setPwErr(pErr);
    if (eErr) { emailRef.current?.focus(); return; }
    if (pErr) { pwRef.current?.focus(); return; }
    void sendCode();
  };

  if (done) {
    return <Notice tone="success">{t.link_email_linked}</Notice>;
  }

  const head = (
    <div className="kc-link-add-head">
      <span className="kc-link-icon">
        <Icon as={Mail} size={18} />
      </span>
      <div className="kc-link-text">
        <p className="kc-link-label">{auth.email_label}</p>
        <p className="kc-small">
          {step === "verify" ? fmtNodes(auth.sub_code_sent, { email: <span className="kc-em">{email}</span> }) : t.link_email_intro}
        </p>
      </div>
    </div>
  );

  if (step === "verify") {
    return (
      <form className="kc-link-add" noValidate onSubmit={(e) => { e.preventDefault(); void verifyEmail(); }}>
        {head}
        <OtpInput
          ref={otpRef}
          id="kc-link-otp"
          value={verifyCode}
          onChange={setVerifyCode}
          label={auth.code_label}
          digitLabel={(n) => fmt(auth.code_digit, { n })}
          invalid={!!error}
          disabled={loading}
          describedBy={error ? "kc-link-otp-err" : undefined}
        />
        {error ? <Notice id="kc-link-otp-err" tone="error">{error}</Notice> : null}
        <Button type="submit" variant="ghost" block loading={loading} disabled={verifyCode.some((d) => !d)}>
          {t.link_confirm}
        </Button>
        <div className="kc-form-links">
          <Button variant="quiet" size="sm" icon={ArrowLeft} iconSize={16} onClick={() => { setStep("form"); setVerifyCode(["", "", "", "", "", ""]); setError(null); }}>
            {auth.change_email}
          </Button>
          {cooldown > 0 ? (
            <span className="kc-resend-wait">{fmt(auth.resend_in, { s: cooldown })}</span>
          ) : (
            <Button variant="quiet" size="sm" onClick={() => void sendCode(true)} disabled={loading}>
              {auth.resend}
            </Button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form className="kc-link-add" noValidate onSubmit={onSubmitForm}>
      {head}
      <Field
        ref={emailRef}
        id="kc-link-email"
        label={auth.email_label}
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder={auth.email_ph}
        value={email}
        error={emailErr ?? undefined}
        onChange={(e) => { setEmail(e.target.value); setEmailErr(null); }}
      />
      <PasswordField
        ref={pwRef}
        id="kc-link-password"
        label={auth.password_label}
        autoComplete="new-password"
        value={password}
        hint={auth.password_hint}
        requirementMet={password.length >= 8}
        error={pwErr ?? undefined}
        showLabel={auth.show_password}
        hideLabel={auth.hide_password}
        onChange={(e) => { setPassword(e.target.value); setPwErr(null); }}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div>
        <Button type="submit" variant="ghost" icon={Mail} loading={loading}>
          {t.link_email_btn}
        </Button>
      </div>
    </form>
  );
}

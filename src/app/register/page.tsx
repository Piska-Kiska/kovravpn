// src/app/register/page.tsx
"use client";
// Kovra sign-up: email + password, then a 6-digit code from the email, or
// Telegram. Requests, payloads, the ?ref capture, the resend cooldown, the
// auto-submit of a complete code and the analytics events are unchanged from
// the previous page; presentation and error wording moved to the cabinet kit
// (src/components/cabinet) and typed dictionaries.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { trackEvent } from "@/lib/attribution";
import { fmt, fmtNodes, useCabinetLang } from "@/lib/cabinet-lang";
import { useAuthT } from "@/lib/i18n-auth";
import { localizeError, useShellT } from "@/lib/i18n-shell";
import { classifyServerError } from "@/lib/server-errors";
import {
  AuthShell,
  Button,
  ButtonLink,
  CabinetRoot,
  EMAIL_RE,
  Field,
  Notice,
  OtpInput,
  OTP_LENGTH,
  PasswordField,
  Segmented,
  TelegramAuth,
  readJson,
  useDocumentTitle,
  type OtpInputHandle,
} from "@/components/cabinet";

type AuthMethod = "email" | "telegram";
type EmailStep = "form" | "verify";
type FormError = { kind: "server"; raw: unknown; status: number } | { kind: "network" };
type FieldKey = "email" | "password" | "code";
type FieldErrorKey = "err_email_required" | "err_email_invalid" | "err_password_required" | "err_password_short" | "err_code_incomplete";

const EMPTY_CODE: readonly string[] = ["", "", "", "", "", ""];

export default function RegisterPage() {
  const lang = useCabinetLang();
  const t = useAuthT();
  const shell = useShellT();

  const [method, setMethod] = useState<AuthMethod>("email");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<FormError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, FieldErrorKey>>>({});
  const [refCode, setRefCode] = useState<string | null>(null);

  const [emailStep, setEmailStep] = useState<EmailStep>("form");
  const [verifyCode, setVerifyCode] = useState<string[]>([...EMPTY_CODE]);
  const otpRef = useRef<OtpInputHandle>(null);

  const [cooldown, setCooldown] = useState(0);
  const [resendCount, setResendCount] = useState(0);

  // ?ref=CODE, read once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setRefCode(ref);
  }, []);

  useDocumentTitle(fmt("{t} | Kovra", { t: t.page_register }));

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const fieldError = (k: FieldKey): string | undefined => {
    const key = fieldErrors[k];
    if (!key) return undefined;
    return key === "err_email_invalid" ? shell.err_email_invalid : t[key];
  };

  const clearFieldError = (k: FieldKey) => {
    if (fieldErrors[k]) setFieldErrors((e) => ({ ...e, [k]: undefined }));
  };

  const emailError = (value: string): FieldErrorKey | undefined => {
    const v = value.trim();
    if (!v) return "err_email_required";
    if (!EMAIL_RE.test(v)) return "err_email_invalid";
    return undefined;
  };

  const handleEmail = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Partial<Record<FieldKey, FieldErrorKey>> = {
      email: emailError(email),
      password: !password ? "err_password_required" : password.length < 8 ? "err_password_short" : undefined,
    };
    setFieldErrors(errs);
    if (errs.email || errs.password) {
      document.getElementById(errs.email ? "email" : "password")?.focus();
      return;
    }
    setLoading(true); setFormError(null);
    try {
      const res = await fetch("/api/auth/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await readJson(res);
      if (data.success) { setEmailStep("verify"); setCooldown(60); }
      else setFormError({ kind: "server", raw: data.error, status: res.status });
    } catch { setFormError({ kind: "network" }); }
    finally { setLoading(false); }
  };

  const resendCode = async () => {
    setLoading(true); setFormError(null);
    try {
      const res = await fetch("/api/auth/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await readJson(res);
      if (data.success) { setResendCount((c) => c + 1); setCooldown(resendCount >= 1 ? 180 : 60); setFormError(null); }
      else setFormError({ kind: "server", raw: data.error, status: res.status });
    } catch { setFormError({ kind: "network" }); }
    finally { setLoading(false); }
  };

  const submitVerification = async (e?: FormEvent) => {
    e?.preventDefault();
    const code = verifyCode.join("");
    if (code.length !== OTP_LENGTH) {
      if (e) {
        setFieldErrors({ code: "err_code_incomplete" });
        otpRef.current?.focus(verifyCode.findIndex((d) => !d));
      }
      return;
    }
    setLoading(true); setFormError(null); setFieldErrors({});
    try {
      const res = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, ref: refCode }) });
      const data = await readJson(res);
      if (data.success) { trackEvent("signup_complete", { method: "email", ref: refCode ? "yes" : "no" }); window.location.href = "/dashboard"; }
      else { setFormError({ kind: "server", raw: data.error, status: res.status }); setVerifyCode([...EMPTY_CODE]); otpRef.current?.focus(0); }
    } catch { setFormError({ kind: "network" }); }
    finally { setLoading(false); }
  };

  // Submit as soon as all six digits are in (typed, pasted or autofilled).
  useEffect(() => {
    if (verifyCode.every((d) => d !== "")) submitVerification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyCode]);

  const telegramInit = useMemo<RequestInit>(
    () => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: refCode }) }),
    [refCode],
  );

  const onTelegramVerified = useCallback(() => {
    trackEvent("signup_complete", { method: "telegram", ref: refCode ? "yes" : "no" });
    window.location.href = "/dashboard";
  }, [refCode]);

  const switchMethod = (m: AuthMethod) => {
    setMethod(m); setEmailStep("form");
    setVerifyCode([...EMPTY_CODE]); setFormError(null); setFieldErrors({});
  };

  const changeEmail = () => {
    setEmailStep("form"); setVerifyCode([...EMPTY_CODE]); setFormError(null); setFieldErrors({});
  };

  const errorText = formError ? (formError.kind === "network" ? shell.err_network : localizeError(formError.raw, formError.status, lang)) : null;
  const userExists = formError?.kind === "server" && (() => {
    const c = classifyServerError(formError.raw, formError.status);
    return c !== null && "key" in c && c.key === "err_user_exists";
  })();

  const verifying = method === "email" && emailStep === "verify";
  const title = verifying ? t.title_verify : t.title_register;
  const subtitle: ReactNode = verifying ? fmtNodes(t.sub_code_sent, { email: <span className="kc-em">{email}</span> }) : t.sub_register;

  const errorNotice = errorText ? (
    <Notice
      tone="error"
      action={
        userExists ? (
          <ButtonLink variant="quiet" size="sm" href="/login">
            {t.sign_in_link}
          </ButtonLink>
        ) : undefined
      }
    >
      {errorText}
    </Notice>
  ) : null;

  return (
    <CabinetRoot variant="auth">
      <AuthShell
        step={verifying ? "verify" : "form"}
        kicker={t.kicker_register}
        title={title}
        subtitle={subtitle}
        badge={refCode && !verifying ? <span className="kc-badge">{fmt(t.ref_badge, { code: refCode })}</span> : undefined}
        footer={
          verifying ? undefined : (
            <>
              <span>{t.have_account}</span>
              <ButtonLink variant="quiet" href="/login">
                {t.sign_in_link}
              </ButtonLink>
            </>
          )
        }
      >
        {!verifying ? (
          <Segmented<AuthMethod>
            name="register-method"
            label={t.method_label}
            value={method}
            onChange={switchMethod}
            block
            className="kc-auth-method"
            options={[
              { value: "email", label: t.method_email, icon: Mail },
              { value: "telegram", label: t.method_telegram, icon: Send },
            ]}
          />
        ) : null}

        {method === "email" && emailStep === "form" ? (
          <form noValidate onSubmit={handleEmail} className="kc-stack kc-auth-panel">
            <Field
              id="email"
              label={t.email_label}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t.email_ph}
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearFieldError("email"); }}
              onBlur={() => {
                if (email.trim()) setFieldErrors((fe) => ({ ...fe, email: emailError(email) }));
              }}
              error={fieldError("email")}
            />
            <PasswordField
              id="password"
              label={t.password_label}
              autoComplete="new-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); }}
              hint={t.password_hint}
              requirementMet={password.length >= 8}
              error={fieldError("password")}
              showLabel={t.show_password}
              hideLabel={t.hide_password}
            />
            {errorNotice}
            <Button type="submit" variant="cta" block loading={loading}>
              {t.submit_register}
            </Button>
          </form>
        ) : null}

        {verifying ? (
          <form noValidate onSubmit={submitVerification} className="kc-stack kc-auth-panel--tight">
            <OtpInput
              ref={otpRef}
              id="verify-code"
              autoFocus
              value={verifyCode}
              onChange={(next) => { setVerifyCode(next); clearFieldError("code"); }}
              label={t.code_label}
              digitLabel={(n) => fmt(t.code_digit, { n })}
              invalid={Boolean(fieldErrors.code)}
              describedBy={fieldErrors.code ? "verify-code-err" : undefined}
            />
            {fieldErrors.code ? (
              <p id="verify-code-err" className="kc-field-msg kc-field-msg--error">
                {fieldError("code")}
              </p>
            ) : null}
            {errorNotice}
            <Button type="submit" variant="cta" block loading={loading} disabled={verifyCode.some((d) => !d)}>
              {t.confirm}
            </Button>
            <div className="kc-form-links">
              <Button variant="quiet" size="sm" icon={ArrowLeft} iconSize={16} onClick={changeEmail}>
                {t.change_email}
              </Button>
              {cooldown > 0 ? (
                <span className="kc-resend-wait" aria-live="off">
                  {fmt(t.resend_in, { s: cooldown })}
                </span>
              ) : (
                <Button variant="quiet" size="sm" onClick={resendCode} disabled={loading}>
                  {t.resend}
                </Button>
              )}
            </div>
            <p className="kc-small">{t.spam_hint}</p>
          </form>
        ) : null}

        {method === "telegram" ? (
          <div className="kc-auth-panel">
            <TelegramAuth startInit={telegramInit} onVerified={onTelegramVerified} />
          </div>
        ) : null}
      </AuthShell>
    </CabinetRoot>
  );
}

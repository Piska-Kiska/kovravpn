// src/app/login/page.tsx
"use client";
// Kovra sign-in: email + password (with forgot / reset by emailed code) or
// Telegram. Requests, payloads, analytics events and redirects are unchanged
// from the previous page; only presentation, validation and error wording
// moved to the cabinet kit (src/components/cabinet) and typed dictionaries.

import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Check, Mail, Send } from "lucide-react";
import { trackEvent } from "@/lib/attribution";
import { fmt, fmtNodes, useCabinetLang } from "@/lib/cabinet-lang";
import { useAuthT } from "@/lib/i18n-auth";
import { localizeError, useShellT } from "@/lib/i18n-shell";
import {
  AuthShell,
  Button,
  ButtonLink,
  CabinetRoot,
  EMAIL_RE,
  Field,
  Icon,
  Notice,
  OtpInput,
  OTP_LENGTH,
  PasswordField,
  Segmented,
  TelegramAuth,
  readJson,
  useDocumentTitle,
} from "@/components/cabinet";

type AuthMethod = "email" | "telegram";
type Step = "login" | "forgot" | "reset";
type FormError = { kind: "server"; raw: unknown; status: number } | { kind: "network" };
type FieldKey = "email" | "password" | "code" | "newPassword";
type FieldErrorKey = "err_email_required" | "err_email_invalid" | "err_password_required" | "err_password_short" | "err_code_incomplete";

const EMPTY_CODE: readonly string[] = ["", "", "", "", "", ""];
const TG_START_INIT: RequestInit = { method: "POST" };

const FIELD_IDS: Record<FieldKey, string> = {
  email: "email",
  password: "password",
  code: "reset-code-0",
  newPassword: "new-password",
};

function focusFirst(order: readonly FieldKey[], errs: Partial<Record<FieldKey, FieldErrorKey>>) {
  const first = order.find((k) => errs[k]);
  if (first) document.getElementById(FIELD_IDS[first])?.focus();
}

export default function LoginPage() {
  const lang = useCabinetLang();
  const t = useAuthT();
  const shell = useShellT();

  const [method, setMethod] = useState<AuthMethod>("email");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<FormError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, FieldErrorKey>>>({});

  const [forgotStep, setForgotStep] = useState<Step>("login");
  const [resetDigits, setResetDigits] = useState<string[]>([...EMPTY_CODE]);
  const resetCode = resetDigits.join("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [remember, setRemember] = useState(false);

  useDocumentTitle(fmt("{t} | Kovra", { t: t.page_login }));

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

  const onEmailBlur = () => {
    if (!email.trim()) return;
    const err = emailError(email);
    setFieldErrors((e) => ({ ...e, email: err }));
  };

  const serverError = (err: FormError | null): string | null => {
    if (!err) return null;
    return err.kind === "network" ? shell.err_network : localizeError(err.raw, err.status, lang);
  };

  const handleEmail = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Partial<Record<FieldKey, FieldErrorKey>> = {
      email: emailError(email),
      password: password ? undefined : "err_password_required",
    };
    setFieldErrors(errs);
    if (errs.email || errs.password) {
      focusFirst(["email", "password"], errs);
      return;
    }
    setLoading(true); setFormError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, remember }) });
      const data = await readJson(res);
      if (data.success) { trackEvent("login", { method: "email" }); window.location.href = "/dashboard"; }
      else setFormError({ kind: "server", raw: data.error, status: res.status });
    } catch { setFormError({ kind: "network" }); }
    finally { setLoading(false); }
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Partial<Record<FieldKey, FieldErrorKey>> = { email: emailError(email) };
    setFieldErrors(errs);
    if (errs.email) {
      focusFirst(["email"], errs);
      return;
    }
    setLoading(true); setFormError(null);
    try {
      const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await readJson(res);
      if (data.success) setForgotStep("reset");
      else setFormError({ kind: "server", raw: data.error, status: res.status });
    } catch { setFormError({ kind: "network" }); }
    finally { setLoading(false); }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Partial<Record<FieldKey, FieldErrorKey>> = {
      code: resetCode.length === OTP_LENGTH ? undefined : "err_code_incomplete",
      newPassword: !newPassword ? "err_password_required" : newPassword.length < 8 ? "err_password_short" : undefined,
    };
    setFieldErrors(errs);
    if (errs.code || errs.newPassword) {
      focusFirst(["code", "newPassword"], errs);
      return;
    }
    setLoading(true); setFormError(null);
    try {
      const res = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: resetCode, password: newPassword }) });
      const data = await readJson(res);
      if (data.success) { setForgotSuccess(true); setForgotStep("login"); setFormError(null); setPassword(""); }
      else setFormError({ kind: "server", raw: data.error, status: res.status });
    } catch { setFormError({ kind: "network" }); }
    finally { setLoading(false); }
  };

  const goStep = (next: Step) => {
    setForgotStep(next);
    setFormError(null);
    setFieldErrors({});
    if (next === "forgot") setForgotSuccess(false);
  };

  const switchMethod = (m: AuthMethod) => {
    setMethod(m);
    setFormError(null);
    setFieldErrors({});
  };

  const onTelegramVerified = useCallback(() => {
    trackEvent("login", { method: "telegram" });
    window.location.href = "/dashboard";
  }, []);

  const errorText = serverError(formError);
  const showMethod = forgotStep === "login";

  let kicker = t.kicker_login;
  let title = t.title_login;
  let subtitle: ReactNode = t.sub_login;
  if (forgotStep === "forgot") {
    kicker = t.kicker_recovery;
    title = t.title_forgot;
    subtitle = t.sub_forgot;
  } else if (forgotStep === "reset") {
    kicker = t.kicker_recovery;
    title = t.title_reset;
    subtitle = fmtNodes(t.sub_code_sent, { email: <span className="kc-em">{email}</span> });
  }

  const emailField = (
    <Field
      id={FIELD_IDS.email}
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
      onBlur={onEmailBlur}
      error={fieldError("email")}
    />
  );

  return (
    <CabinetRoot variant="auth">
      <AuthShell
        step={forgotStep}
        kicker={kicker}
        title={title}
        subtitle={subtitle}
        footer={
          showMethod ? (
            <>
              <span>{t.no_account}</span>
              <ButtonLink variant="quiet" href="/register">
                {t.create_account}
              </ButtonLink>
            </>
          ) : undefined
        }
      >
        {showMethod ? (
          <Segmented<AuthMethod>
            name="login-method"
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

        {method === "email" && forgotStep === "login" ? (
          <form noValidate onSubmit={handleEmail} className="kc-stack kc-auth-panel">
            {forgotSuccess ? <Notice tone="success">{t.password_updated}</Notice> : null}
            {emailField}
            <PasswordField
              id={FIELD_IDS.password}
              label={t.password_label}
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); }}
              error={fieldError("password")}
              showLabel={t.show_password}
              hideLabel={t.hide_password}
              labelAction={
                <Button variant="quiet" size="sm" onClick={() => goStep("forgot")}>
                  {t.forgot_link}
                </Button>
              }
            />
            <label className="kc-check">
              <input className="kc-sr" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span className="kc-check-box" aria-hidden="true">
                <Icon as={Check} size={14} />
              </span>
              <span>{t.remember}</span>
            </label>
            {errorText ? <Notice tone="error">{errorText}</Notice> : null}
            <Button type="submit" variant="cta" block loading={loading}>
              {t.submit_login}
            </Button>
          </form>
        ) : null}

        {method === "email" && forgotStep === "forgot" ? (
          <form noValidate onSubmit={handleForgot} className="kc-stack kc-auth-panel--tight">
            {emailField}
            {errorText ? <Notice tone="error">{errorText}</Notice> : null}
            <Button type="submit" variant="cta" block loading={loading}>
              {t.send_code}
            </Button>
            <div>
              <Button variant="quiet" size="sm" icon={ArrowLeft} iconSize={16} onClick={() => goStep("login")}>
                {t.back_to_signin}
              </Button>
            </div>
          </form>
        ) : null}

        {method === "email" && forgotStep === "reset" ? (
          <form noValidate onSubmit={handleReset} className="kc-stack kc-auth-panel--tight">
            <OtpInput
              id="reset-code"
              autoFocus
              value={resetDigits}
              onChange={(next) => { setResetDigits(next); clearFieldError("code"); }}
              label={t.code_label}
              digitLabel={(n) => fmt(t.code_digit, { n })}
              invalid={Boolean(fieldErrors.code)}
              describedBy={fieldErrors.code ? "reset-code-err" : undefined}
            />
            {fieldErrors.code ? (
              <p id="reset-code-err" className="kc-field-msg kc-field-msg--error">
                {fieldError("code")}
              </p>
            ) : null}
            <PasswordField
              id={FIELD_IDS.newPassword}
              label={t.password_new_label}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); clearFieldError("newPassword"); }}
              hint={t.password_hint}
              requirementMet={newPassword.length >= 8}
              error={fieldError("newPassword")}
              showLabel={t.show_password}
              hideLabel={t.hide_password}
            />
            {errorText ? <Notice tone="error">{errorText}</Notice> : null}
            <Button
              type="submit"
              variant="cta"
              block
              loading={loading}
              disabled={resetCode.length < OTP_LENGTH || newPassword.length < 8}
            >
              {t.change_password}
            </Button>
            <div>
              <Button variant="quiet" size="sm" icon={ArrowLeft} iconSize={16} onClick={() => goStep("forgot")}>
                {t.use_other_email}
              </Button>
            </div>
          </form>
        ) : null}

        {method === "telegram" && forgotStep === "login" ? (
          <div className="kc-auth-panel">
            <TelegramAuth startInit={TG_START_INIT} onVerified={onTelegramVerified} />
          </div>
        ) : null}
      </AuthShell>
    </CabinetRoot>
  );
}

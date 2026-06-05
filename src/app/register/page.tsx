// src/app/register/page.tsx
"use client";

import Link from "next/link";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { Eye, EyeOff, ArrowLeft, Mail, Send, MailCheck } from "lucide-react";
import Logo from "@/components/Logo";
import NavToggles from "@/components/NavToggles";
import { trackEvent } from "@/lib/attribution";

type AuthMethod = "email" | "telegram";
type EmailStep = "form" | "verify";

export default function RegisterPage() {
  const [method, setMethod] = useState<AuthMethod>("email");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [refCode, setRefCode] = useState<string | null>(null);

  // Capture ref from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setRefCode(ref);
  }, []);

  // Email verification
  const [emailStep, setEmailStep] = useState<EmailStep>("form");
  const [verifyCode, setVerifyCode] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Telegram
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgPolling, setTgPolling] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Resend cooldown
  const [cooldown, setCooldown] = useState(0);
  const [resendCount, setResendCount] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /* ── Email submit → send verification code ───── */
  const handleEmail = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      const res = await fetch('/api/auth/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailStep('verify');
        setCooldown(60);
      } else {
        setFormError(data.error || 'Ошибка отправки');
      }
    } catch {
      setFormError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setLoading(true);
    setFormError(null);
    try {
      const res = await fetch('/api/auth/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success) {
        setResendCount((c) => c + 1);
        setCooldown(resendCount >= 1 ? 180 : 60);
        setFormError(null);
      } else {
        setFormError(data.error || 'Ошибка отправки');
      }
    } catch {
      setFormError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  /* ── Verify code input handling ───────────────── */
  const handleCodeInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...verifyCode];
    next[index] = value.slice(-1);
    setVerifyCode(next);

    // Auto-focus next
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !verifyCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setVerifyCode(pasted.split(""));
      inputRefs.current[5]?.focus();
    }
  };

  const submitVerification = async () => {
    const code = verifyCode.join("");
    if (code.length !== 6) return;
    setLoading(true);
    setFormError(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, ref: refCode }),
      });
      const data = await res.json();
      if (data.success) {
        trackEvent("signup_complete", { method: "email", ref: refCode ? "yes" : "no" });
        window.location.href = '/dashboard';
      } else {
        setFormError(data.error || 'Неверный код');
        setVerifyCode(['','','','','','']);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setFormError('Ошибка');
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when all 6 digits filled
  useEffect(() => {
    if (verifyCode.every((d) => d !== "")) {
      submitVerification();
    }
  }, [verifyCode]);

  /* ── Telegram flow ────────────────────────────── */
  const startTelegram = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: refCode }),
      });
      const data = await res.json();
      setTgCode(data.code);
      setTgPolling(true);
    } catch {
      console.error("Failed to generate Telegram code");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!tgPolling || !tgCode) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/telegram/verify?code=${tgCode}`);
        const data = await res.json();
        if (data.verified) {
          setTgPolling(false);
          trackEvent("signup_complete", { method: "telegram", ref: refCode ? "yes" : "no" });
          window.location.href = "/dashboard";
        }
      } catch { /* retry */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [tgPolling, tgCode]);

  const botLink = `https://t.me/proxysvpn_bot?start=${tgCode}`;

  /* ── Reset on method switch ───────────────────── */
  const switchMethod = (m: AuthMethod) => {
    setMethod(m);
    setTgCode(null);
    setTgPolling(false);
    setEmailStep("form");
    setVerifyCode(["", "", "", "", "", ""]);
    setFormError(null);
  };

  return (
    <div className="min-h-screen">
      {/* ── Nav with inline toggles ──────────────────── */}
      <nav className="relative z-10 container mx-auto px-4 md:px-6 pt-6 mb-12">
        <div className="nm-raised-sm px-3 md:px-5 py-3 flex items-center justify-between gap-2 min-w-0">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="nm-circle w-9 h-9 flex items-center justify-center">
              <Logo size={18} className="text-nm-accent" />
            </div>
            <span
              className="hidden sm:inline font-semibold text-nm-text tracking-tight"
              data-i18n="common.brand"
            >
              ПроксисВпнович
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <NavToggles />
            <Link
              href="/"
              className="nm-btn inline-flex items-center gap-1.5 px-3 md:px-4 py-2 text-xs md:text-sm text-nm-text-secondary"
            >
              <ArrowLeft className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span data-i18n="common.back.home.short">На главную</span>
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <div className="nm-raised p-8 md:p-10">
            {/* Logo */}
            <div className="flex items-center gap-2.5 mb-2">
              <div className="nm-circle w-10 h-10 flex items-center justify-center">
                <Logo size={20} className="text-nm-accent" />
              </div>
              <span className="font-semibold text-lg text-nm-text" data-i18n="common.brand">
                ПроксисВпнович
              </span>
            </div>
            <h1 className="text-2xl font-bold text-nm-text mb-1" data-i18n="register.title">
              Создать аккаунт
            </h1>
            <p className="text-nm-text-secondary text-sm mb-6" data-i18n="register.subtitle">
              Пополните 10 ₽ — 3 дня VPN
            </p>

            {/* Method toggle */}
            <div className="nm-pressed p-1 flex gap-1 mb-8 rounded-2xl">
              {[
                { id: "email" as const, i18nKey: "auth.method.email", label: "Почта", icon: Mail },
                { id: "telegram" as const, i18nKey: "auth.method.telegram", label: "Telegram", icon: Send },
              ].map((m) => (
                <button key={m.id} onClick={() => switchMethod(m.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium cursor-pointer rounded-[14px] transition-all duration-300 ${
                    method === m.id ? "nm-raised-sm text-nm-text" : "text-nm-text-secondary"
                  }`}>
                  <m.icon className="w-4 h-4" />
                  <span data-i18n={m.i18nKey}>{m.label}</span>
                </button>
              ))}
            </div>

            {/* ══ EMAIL: step 1 — form ═══════════════ */}
            {method === "email" && emailStep === "form" && (
              <form onSubmit={handleEmail} className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-nm-text mb-2"
                    data-i18n="auth.email.label"
                  >Email</label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    data-i18n-attr="placeholder=auth.email.placeholder"
                    className="w-full nm-pressed-sm px-4 py-3 text-sm text-nm-text placeholder:text-nm-text-secondary/50 bg-transparent outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-nm-text mb-2"
                    data-i18n="auth.password.label"
                  >Пароль</label>
                  <div className="relative">
                    <input
                      id="password"
                      type={show ? "text" : "password"}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Минимум 8 символов"
                      data-i18n-attr="placeholder=register.password.placeholder"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full nm-pressed-sm px-4 py-3 pr-12 text-sm text-nm-text placeholder:text-nm-text-secondary/50 bg-transparent outline-none"
                    />
                    <button type="button" onClick={() => setShow(!show)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-nm-text-secondary hover:text-nm-text transition cursor-pointer">
                      {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full nm-btn-accent py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer">
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <span data-i18n="register.submit">Продолжить</span>}
                </button>
                {formError && (
                  <p className="text-sm text-red-400 text-center mt-2">{formError}</p>
                )}
              </form>
            )}

            {/* ══ EMAIL: step 2 — verify code ════════ */}
            {method === "email" && emailStep === "verify" && (
              <div className="text-center py-2">
                <div className="nm-circle-pressed w-16 h-16 flex items-center justify-center mx-auto mb-5">
                  <MailCheck className="w-7 h-7 text-nm-accent" />
                </div>
                <h2 className="font-bold text-nm-text mb-1" data-i18n="register.verify.title">
                  Проверьте почту
                </h2>
                <p className="text-sm text-nm-text-secondary mb-6">
                  <span data-i18n="register.verify.codeSent.prefix">Код отправлен на</span>{" "}
                  <span className="text-nm-text font-medium">{email}</span>
                </p>

                {/* 6-digit code input */}
                <div className="flex justify-center gap-2 mb-6" onPaste={handleCodePaste}>
                  {verifyCode.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeInput(i, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(i, e)}
                      className="w-11 h-14 nm-pressed-sm text-center text-xl font-bold text-nm-text bg-transparent outline-none focus:ring-2 focus:ring-nm-accent/30 rounded-xl"
                    />
                  ))}
                </div>

                <button onClick={submitVerification} disabled={loading || verifyCode.some((d) => !d)}
                  className="w-full nm-btn-accent py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer">
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <span data-i18n="register.verify.submit">Подтвердить</span>}
                </button>

                {formError && (
                  <p className="text-sm text-red-400 text-center mt-2">{formError}</p>
                )}

                <div className="flex items-center justify-between mt-4">
                  <button onClick={() => { setEmailStep("form"); setVerifyCode(["","","","","",""]); setFormError(null); }}
                    className="text-sm text-nm-text-secondary hover:text-nm-text transition cursor-pointer"
                    data-i18n="register.verify.changeEmail"
                  >← Изменить email</button>
                  <button
                    onClick={resendCode}
                    disabled={cooldown > 0 || loading}
                    className="text-sm text-nm-accent cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  >
                    {cooldown > 0 ? (
                      <>
                        <span data-i18n="register.verify.resendIn.prefix">Повторно через </span>
                        {cooldown}
                        <span data-i18n="register.verify.resendIn.suffix">с</span>
                      </>
                    ) : (
                      <span data-i18n="register.verify.resend">Отправить снова</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ══ TELEGRAM ═══════════════════════════ */}
            {method === "telegram" && !tgCode && (
              <div className="text-center py-4">
                <div className="nm-circle-pressed w-20 h-20 flex items-center justify-center mx-auto mb-6">
                  <Send className="w-8 h-8 text-nm-accent" />
                </div>
                <p className="text-nm-text-secondary text-sm mb-6">
                  <span data-i18n="register.tg.hint.line1">Нажмите кнопку — мы сгенерируем код.</span>
                  <br />
                  <span data-i18n="register.tg.hint.line2">Отправьте его нашему боту в Telegram.</span>
                </p>
                <button onClick={startTelegram} disabled={loading}
                  className="nm-btn-accent w-full py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer">
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <span data-i18n="register.tg.getCode">Получить код</span>}
                </button>
              </div>
            )}

            {method === "telegram" && tgCode && (
              <div className="text-center py-4">
                <div className="nm-pressed p-6 mb-6 rounded-2xl cursor-pointer select-none"
                  onClick={() => { navigator.clipboard.writeText(tgCode!); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}>
                  <p className="text-xs text-nm-text-secondary mb-2 uppercase tracking-wider"
                     data-i18n={codeCopied ? "auth.tg.code.copied" : "auth.tg.code.copyHint"}>
                    {codeCopied ? "✓ Скопировано!" : "Нажмите чтобы скопировать"}
                  </p>
                  <p className="text-3xl font-bold text-nm-text tracking-[0.3em] font-mono">{tgCode}</p>
                </div>
                <p className="text-nm-text-secondary text-sm mb-4" data-i18n="register.tg.sendHint">
                  Отправьте код боту:
                </p>
                <a href={botLink} target="_blank" rel="noopener noreferrer"
                  className="nm-btn-accent w-full py-3.5 font-semibold flex items-center justify-center gap-2">
                  <Send className="w-4 h-4" />
                  <span data-i18n="auth.tg.open">Открыть бота</span>
                </a>
                {tgPolling && (
                  <div className="flex items-center justify-center gap-2 mt-4 text-sm text-nm-text-secondary">
                    <div className="w-3 h-3 border-2 border-nm-accent/30 border-t-nm-accent rounded-full animate-spin" />
                    <span data-i18n="auth.tg.waiting">Ожидаем подтверждение...</span>
                  </div>
                )}
              </div>
            )}

            <p
              className="text-center text-xs text-nm-text-secondary mt-6 leading-relaxed"
              data-i18n-html="auth.legal.html"
            >
              Продолжая регистрацию, вы соглашаетесь с{" "}
              <Link href="/terms" className="text-nm-accent hover:underline" target="_blank" rel="noopener">
                Условиями использования
              </Link>{" "}
              и{" "}
              <Link href="/privacy" className="text-nm-accent hover:underline" target="_blank" rel="noopener">
                Политикой конфиденциальности
              </Link>.
            </p>

            <p className="text-center text-sm text-nm-text-secondary mt-6">
              <span data-i18n="register.haveAccount">Уже есть аккаунт?</span>{" "}
              <Link href="/login" className="text-nm-accent hover:underline" data-i18n="register.haveAccount.cta">
                Войти
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

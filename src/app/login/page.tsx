// src/app/login/page.tsx
"use client";

import Link from "next/link";
import { useState, useEffect, type FormEvent } from "react";
import { Eye, EyeOff, ArrowLeft, Mail, Send } from "lucide-react";
import Logo from "@/components/Logo";
import NavToggles from "@/components/NavToggles";
import { trackEvent } from "@/lib/attribution";

type AuthMethod = "email" | "telegram";

export default function LoginPage() {
  const [method, setMethod] = useState<AuthMethod>("email");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgPolling, setTgPolling] = useState(false);

  // Forgot password
  const [forgotStep, setForgotStep] = useState<"login" | "forgot" | "reset">("login");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [remember, setRemember] = useState(false);

  const handleEmail = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const data = await res.json();
      if (data.success) {
        trackEvent("login", { method: "email" });
        window.location.href = "/dashboard";
      } else {
        setFormError(data.error || "Ошибка входа");
      }
    } catch {
      setFormError("Ошибка соединения");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email) { setFormError("Введите email"); return; }
    setLoading(true);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setForgotStep("reset");
      } else {
        setFormError(data.error || "Ошибка");
      }
    } catch { setFormError("Ошибка соединения"); }
    finally { setLoading(false); }
  };

  const handleReset = async () => {
    if (!resetCode || !newPassword) { setFormError("Заполните все поля"); return; }
    setLoading(true);
    setFormError(null);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: resetCode, password: newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setForgotSuccess(true);
        setForgotStep("login");
        setFormError(null);
        setPassword("");
      } else {
        setFormError(data.error || "Ошибка");
      }
    } catch { setFormError("Ошибка соединения"); }
    finally { setLoading(false); }
  };

  const startTelegram = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/telegram", { method: "POST" });
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
          trackEvent("login", { method: "telegram" });
          window.location.href = "/dashboard";
        }
      } catch { /* retry */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [tgPolling, tgCode]);

  const botLink = `https://t.me/proxysvpn_bot?start=${tgCode}`;

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
            <div className="flex items-center gap-2.5 mb-2">
              <div className="nm-circle w-10 h-10 flex items-center justify-center">
                <Logo size={20} className="text-nm-accent" />
              </div>
              <span className="font-semibold text-lg text-nm-text" data-i18n="common.brand">
                ПроксисВпнович
              </span>
            </div>
            <h1 className="text-2xl font-bold text-nm-text mb-1" data-i18n="login.title">Вход</h1>
            <p className="text-nm-text-secondary text-sm mb-6" data-i18n="login.subtitle">
              Управляйте подпиской и настройками
            </p>

            {/* Method toggle */}
            <div className="nm-pressed p-1 flex gap-1 mb-8 rounded-2xl">
              {[
                { id: "email" as const, i18nKey: "auth.method.email", label: "Почта", icon: Mail },
                { id: "telegram" as const, i18nKey: "auth.method.telegram", label: "Telegram", icon: Send },
              ].map((m) => (
                <button key={m.id}
                  onClick={() => { setMethod(m.id); setTgCode(null); setTgPolling(false); setFormError(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium cursor-pointer rounded-[14px] transition-all duration-300 ${
                    method === m.id ? "nm-raised-sm text-nm-text" : "text-nm-text-secondary"
                  }`}>
                  <m.icon className="w-4 h-4" />
                  <span data-i18n={m.i18nKey}>{m.label}</span>
                </button>
              ))}
            </div>

            {/* Email form */}
            {method === "email" && forgotStep === "login" && (
              <form onSubmit={handleEmail} className="space-y-5">
                {forgotSuccess && (
                  <p className="text-sm text-green-400 text-center" data-i18n="login.forgotSuccess">
                    Пароль обновлён — войдите с новым паролем
                  </p>
                )}
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
                    placeholder="you@example.com"
                    data-i18n-attr="placeholder=auth.email.placeholder"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full nm-pressed-sm px-4 py-3 text-sm text-nm-text placeholder:text-nm-text-secondary/50 bg-transparent outline-none"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-nm-text"
                      data-i18n="auth.password.label"
                    >Пароль</label>
                    <button type="button" onClick={() => { setForgotStep("forgot"); setFormError(null); setForgotSuccess(false); }}
                      className="text-xs text-nm-accent hover:underline cursor-pointer"
                      data-i18n="login.forgot"
                    >Забыли?</button>
                  </div>
                  <div className="relative">
                    <input id="password" type={show ? "text" : "password"} required autoComplete="current-password" placeholder="••••••••"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full nm-pressed-sm px-4 py-3 pr-12 text-sm text-nm-text placeholder:text-nm-text-secondary/50 bg-transparent outline-none" />
                    <button type="button" onClick={() => setShow(!show)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-nm-text-secondary hover:text-nm-text transition cursor-pointer">
                      {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded accent-nm-accent cursor-pointer" />
                  <span className="text-xs text-nm-text-secondary" data-i18n="login.remember">
                    Запомнить на 7 дней
                  </span>
                </label>
                <button type="submit" disabled={loading}
                  className="w-full nm-btn-accent py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer">
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <span data-i18n="login.submit">Войти</span>}
                </button>
                {formError && (
                  <p className="text-sm text-red-400 text-center mt-2">{formError}</p>
                )}
              </form>
            )}

            {/* Forgot password — enter email */}
            {method === "email" && forgotStep === "forgot" && (
              <div className="space-y-5">
                <p className="text-sm text-nm-text-secondary" data-i18n="login.forgot.intro">
                  Введите email — отправим код для сброса пароля
                </p>
                <div>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    data-i18n-attr="placeholder=auth.email.placeholder"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full nm-pressed-sm px-4 py-3 text-sm text-nm-text placeholder:text-nm-text-secondary/50 bg-transparent outline-none"
                  />
                </div>
                <button onClick={handleForgot} disabled={loading || !email}
                  className="w-full nm-btn-accent py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer">
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <span data-i18n="login.forgot.send">Отправить код</span>}
                </button>
                <button onClick={() => { setForgotStep("login"); setFormError(null); }}
                  className="w-full text-sm text-nm-text-secondary text-center cursor-pointer"
                  data-i18n="login.forgot.back"
                >← Назад к входу</button>
                {formError && <p className="text-sm text-red-400 text-center">{formError}</p>}
              </div>
            )}

            {/* Reset password — enter code + new password */}
            {method === "email" && forgotStep === "reset" && (
              <div className="space-y-5">
                <p className="text-sm text-nm-text-secondary text-center">
                  <span data-i18n="register.verify.codeSent.prefix">Код отправлен на</span>{" "}
                  <span className="text-nm-text font-medium">{email}</span>
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-значный код"
                  data-i18n-attr="placeholder=login.reset.codePlaceholder"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full nm-pressed-sm px-4 py-3 text-sm text-nm-text text-center tracking-[0.3em] font-mono placeholder:text-nm-text-secondary/50 placeholder:tracking-normal bg-transparent outline-none"
                />
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    placeholder="Новый пароль (мин. 8)"
                    data-i18n-attr="placeholder=login.reset.newPwPlaceholder"
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full nm-pressed-sm px-4 py-3 pr-12 text-sm text-nm-text placeholder:text-nm-text-secondary/50 bg-transparent outline-none"
                  />
                  <button type="button" onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-nm-text-secondary hover:text-nm-text transition cursor-pointer">
                    {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <button onClick={handleReset} disabled={loading || resetCode.length < 6 || newPassword.length < 8}
                  className="w-full nm-btn-accent py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer">
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <span data-i18n="login.reset.submit">Сменить пароль</span>}
                </button>
                <button onClick={() => { setForgotStep("forgot"); setFormError(null); }}
                  className="w-full text-sm text-nm-text-secondary text-center cursor-pointer"
                  data-i18n="login.reset.back"
                >← Назад</button>
                {formError && <p className="text-sm text-red-400 text-center">{formError}</p>}
              </div>
            )}

            {/* Telegram flow */}
            {method === "telegram" && !tgCode && (
              <div className="text-center py-4">
                <div className="nm-circle-pressed w-20 h-20 flex items-center justify-center mx-auto mb-6">
                  <Send className="w-8 h-8 text-nm-accent" />
                </div>
                <p className="text-nm-text-secondary text-sm mb-6" data-i18n="login.tg.hint">
                  Получите код и отправьте его боту в&nbsp;Telegram
                </p>
                <button onClick={startTelegram} disabled={loading}
                  className="nm-btn-accent w-full py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer">
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <span data-i18n="login.tg.getCode">Получить код</span>}
                </button>
              </div>
            )}

            {method === "telegram" && tgCode && (
              <div className="text-center py-4">
                <div className="nm-pressed p-6 mb-6 rounded-2xl cursor-pointer select-none"
                  onClick={() => { navigator.clipboard.writeText(tgCode!); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}>
                  <p className="text-xs text-nm-text-secondary mb-2 uppercase tracking-wider"
                     data-i18n={codeCopied ? "auth.tg.code.copied" : "auth.tg.code.copyHint"}
                  >
                    {codeCopied ? "✓ Скопировано!" : "Нажмите чтобы скопировать"}
                  </p>
                  <p className="text-3xl font-bold text-nm-text tracking-[0.3em] font-mono">{tgCode}</p>
                </div>
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
              Продолжая, вы соглашаетесь с{" "}
              <Link href="/terms" className="text-nm-accent hover:underline" target="_blank" rel="noopener">
                Условиями использования
              </Link>{" "}
              и{" "}
              <Link href="/privacy" className="text-nm-accent hover:underline" target="_blank" rel="noopener">
                Политикой конфиденциальности
              </Link>.
            </p>

            <p className="text-center text-sm text-nm-text-secondary mt-6">
              <span data-i18n="login.noAccount">Нет аккаунта?</span>{" "}
              <Link href="/register" className="text-nm-accent hover:underline" data-i18n="login.noAccount.cta">
                Создать
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

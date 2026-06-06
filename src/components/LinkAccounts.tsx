// src/components/LinkAccounts.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Mail, Send, Check, Loader2, Link2, Eye, EyeOff, X } from "lucide-react";
import { useDashLang } from "@/lib/dash-i18n";

interface Props {
  userId: string;
  authMethod: string;
  email?: string;
  telegramId?: string;
  onUpdate?: () => void;
}

export default function LinkAccounts({ userId, authMethod, email, telegramId, onUpdate }: Props) {
  const { t } = useDashLang();
  const hasEmail = !!email;
  const hasTelegram = !!telegramId;
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const canUnlinkEmail = hasEmail && !userId.startsWith("em_");
  const canUnlinkTelegram = hasTelegram && !userId.startsWith("tg_");

  const handleUnlink = async (type: "email" | "telegram") => {
    if (!confirm(type === "email" ? t.link_unlink_confirm_email : t.link_unlink_confirm_tg)) return;
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
      else setUnlinkError(data.error);
    } catch {
      setUnlinkError(t.err_generic);
    } finally {
      setUnlinking(null);
    }
  };

  if (hasEmail && hasTelegram) {
    return (
      <div className="nm-raised p-4 md:p-5">
        <h3 className="font-bold text-nm-text text-sm mb-3 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-nm-accent" />{t.link_title}
        </h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="w-3.5 h-3.5 text-green-400" />
            <span className="text-nm-text-secondary">{email}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-green-400" />
              {canUnlinkEmail && (
                <button onClick={() => handleUnlink("email")} disabled={unlinking === "email"}
                  className="text-nm-text-secondary hover:text-red-400 transition cursor-pointer disabled:opacity-50">
                  {unlinking === "email" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Send className="w-3.5 h-3.5 text-green-400" />
            <span className="text-nm-text-secondary">{t.link_tg_id} {telegramId}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-green-400" />
              {canUnlinkTelegram && (
                <button onClick={() => handleUnlink("telegram")} disabled={unlinking === "telegram"}
                  className="text-nm-text-secondary hover:text-red-400 transition cursor-pointer disabled:opacity-50">
                  {unlinking === "telegram" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>
        </div>
        {unlinkError && <p className="text-xs text-red-400 text-center mt-2">{unlinkError}</p>}
      </div>
    );
  }

  return (
    <div className="nm-raised p-4 md:p-5">
      <h3 className="font-bold text-nm-text text-sm mb-3 flex items-center gap-2">
        <Link2 className="w-4 h-4 text-nm-accent" />{t.link_title}
      </h3>

      {hasEmail && (
        <div className="flex items-center gap-2 text-sm mb-3">
          <Mail className="w-3.5 h-3.5 text-green-400" />
          <span className="text-nm-text-secondary">{email}</span>
          <Check className="w-3.5 h-3.5 text-green-400 ml-auto" />
        </div>
      )}
      {hasTelegram && (
        <div className="flex items-center gap-2 text-sm mb-3">
          <Send className="w-3.5 h-3.5 text-green-400" />
          <span className="text-nm-text-secondary">{t.link_tg_id} {telegramId}</span>
          <Check className="w-3.5 h-3.5 text-green-400 ml-auto" />
        </div>
      )}

      {!hasTelegram && <LinkTelegram />}
      {!hasEmail && <LinkEmail />}
    </div>
  );
}

/* ─── Link Telegram ────────────────────────────── */
function LinkTelegram() {
  const { t } = useDashLang();
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const startLink = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/link/telegram", { method: "POST" });
      const data = await res.json();
      if (res.ok) { setCode(data.code); setPolling(true); }
      else setError(data.error);
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
        else if (data.error && res.status === 409) { setPolling(false); setError(data.error); }
      } catch { /* retry */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling, code]);

  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-400">
        <Send className="w-3.5 h-3.5" /><Check className="w-3.5 h-3.5" />{t.link_tg_linked}
      </div>
    );
  }

  if (code) {
    return (
      <div>
        <div className="nm-pressed p-4 rounded-2xl text-center mb-3 cursor-pointer select-none"
          onClick={() => { navigator.clipboard.writeText(code!); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}>
          <p className="text-[10px] text-nm-text-secondary mb-1 uppercase tracking-wider">
            {codeCopied ? t.link_copied : t.link_copy_hint}
          </p>
          <p className="text-2xl font-bold text-nm-text tracking-[0.3em] font-mono">{code}</p>
        </div>
        <a href={`https://t.me/KovraVPN_bot?start=${code}`} target="_blank" rel="noopener noreferrer"
          className="nm-btn w-full py-2.5 text-sm font-medium text-nm-text flex items-center justify-center gap-2">
          <Send className="w-3.5 h-3.5" />{t.link_tg_open}
        </a>
        {polling && (
          <div className="flex items-center justify-center gap-2 mt-3 text-xs text-nm-text-secondary">
            <Loader2 className="w-3 h-3 animate-spin" />{t.link_waiting}
          </div>
        )}
        {error && <p className="text-xs text-red-400 text-center mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button onClick={startLink} disabled={loading}
        className="nm-btn w-full py-2.5 text-sm font-medium text-nm-text flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-nm-text-secondary" />}
        {t.link_tg_btn}
      </button>
      {error && <p className="text-xs text-red-400 text-center mt-2">{error}</p>}
    </div>
  );
}

/* ─── Link Email ───────────────────────────────── */
type EmailStep = "form" | "verify";

function LinkEmail() {
  const { t } = useDashLang();
  const [step, setStep] = useState<EmailStep>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
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
      } else setError(data.error);
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
        setError(data.error);
        setVerifyCode(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError(t.err_generic);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...verifyCode];
    next[index] = value.slice(-1);
    setVerifyCode(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
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

  useEffect(() => {
    if (verifyCode.every((d) => d !== "")) verifyEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyCode]);

  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-400">
        <Mail className="w-3.5 h-3.5" /><Check className="w-3.5 h-3.5" />{t.link_email_linked}
      </div>
    );
  }

  if (step === "verify") {
    return (
      <div>
        <p className="text-xs text-nm-text-secondary text-center mb-3">
          {t.link_code_sent} <span className="text-nm-text font-medium">{email}</span>
        </p>
        <div className="flex justify-center gap-1.5 mb-3" onPaste={handleCodePaste}>
          {verifyCode.map((digit, i) => (
            <input key={i} ref={(el) => { inputRefs.current[i] = el; }}
              type="text" inputMode="numeric" maxLength={1} value={digit}
              onChange={(e) => handleCodeInput(i, e.target.value)}
              onKeyDown={(e) => handleCodeKeyDown(i, e)}
              className="w-9 h-11 nm-pressed-sm text-center text-lg font-bold text-nm-text bg-transparent outline-none focus:ring-2 focus:ring-nm-accent/30 rounded-xl" />
          ))}
        </div>
        <button onClick={verifyEmail} disabled={loading || verifyCode.some((d) => !d)}
          className="nm-btn w-full py-2.5 text-sm font-medium text-nm-text flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t.link_confirm}
        </button>
        <div className="flex items-center justify-between mt-2">
          <button onClick={() => { setStep("form"); setVerifyCode(["","","","","",""]); setError(null); }}
            className="text-xs text-nm-text-secondary cursor-pointer">
            {t.link_back}
          </button>
          <button onClick={() => sendCode(true)} disabled={cooldown > 0 || loading}
            className="text-xs text-nm-accent cursor-pointer disabled:opacity-40 disabled:cursor-default">
            {cooldown > 0 ? `${t.link_resend_in} ${cooldown}s` : t.link_resend}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 text-center mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <input type="email" placeholder="you@example.com" value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full nm-pressed-sm px-3 py-2.5 text-sm text-nm-text placeholder:text-nm-text-secondary/50 bg-transparent outline-none" />
      <div className="relative">
        <input type={show ? "text" : "password"} placeholder={t.link_pwd_ph} value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full nm-pressed-sm px-3 py-2.5 pr-10 text-sm text-nm-text placeholder:text-nm-text-secondary/50 bg-transparent outline-none" />
        <button type="button" onClick={() => setShow(!show)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-nm-text-secondary hover:text-nm-text transition cursor-pointer">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <button onClick={() => sendCode()} disabled={loading || !email || password.length < 8}
        className="nm-btn w-full py-2.5 text-sm font-medium text-nm-text flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5 text-nm-text-secondary" />}
        {t.link_email_btn}
      </button>
      {error && <p className="text-xs text-red-400 text-center mt-2">{error}</p>}
    </div>
  );
}

// src/app/login/page.tsx
"use client";
// Kovra login — landing-matched liquid glass + globe. Self-contained kvr- styles.
// All auth logic (email, telegram, forgot/reset password) and data-i18n preserved.

import Link from "next/link";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { Eye, EyeOff, ArrowLeft, Mail, Send, Sun, Moon } from "lucide-react";
import LangSwitcher from "@/components/LangSwitcher";
import { trackEvent } from "@/lib/attribution";

type AuthMethod = "email" | "telegram";
type Theme = "dark" | "light";

const css = `
.kvr-root{
  --accent:#f5f5f7;--accent-soft:rgba(255,255,255,.10);--accent-line:rgba(255,255,255,.35);
  --base:#050506;--text:#f5f5f7;--muted:#86868b;--faint:#6e6e73;
  --glass:#0a0a0b;--glass-strong:#141417;--gborder:rgba(255,255,255,.08);
  --menu-bg:#101013;--ctrl-bg:rgba(255,255,255,.04);--ctrl-border:rgba(255,255,255,.12);
  --ghi:inset 0 1px 0 rgba(255,255,255,.04);--gshadow:0 18px 44px -26px rgba(0,0,0,.75);
  --btn-bg:#f5f5f7;--btn-fg:#0a0a0b;--btn-bg-hover:#ffffff;
  --glow1:rgba(255,255,255,.05);--glow2:rgba(217,165,94,.05);--grain-op:.015;--vig:rgba(0,0,0,.45);--sel-fg:#050506;
  --field:rgba(255,255,255,.04);--field-border:rgba(255,255,255,.10);
  --blur:blur(20px) saturate(120%);
  --fd:var(--k-font);--fb:var(--k-font);--fm:var(--k-mono);
  position:relative;min-height:100dvh;background:var(--base);color:var(--text);
  font-family:var(--fb);font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden;transition:background .3s,color .3s;
}
.kvr-root[data-theme="light"]{
  --accent:#1d1d1f;--accent-soft:rgba(0,0,0,.07);--accent-line:rgba(0,0,0,.35);
  --base:#ffffff;--text:#1d1d1f;--muted:#6e6e73;--faint:#a1a1a6;
  --glass:#f5f5f7;--glass-strong:#ededf0;--gborder:rgba(0,0,0,.08);
  --menu-bg:#fff;--ctrl-bg:rgba(0,0,0,.04);--ctrl-border:rgba(0,0,0,.14);
  --ghi:inset 0 1px 0 rgba(255,255,255,.6);--gshadow:0 18px 44px -26px rgba(20,22,40,.2);
  --btn-bg:#1d1d1f;--btn-fg:#f5f5f7;--btn-bg-hover:#000;
  --glow1:rgba(255,255,255,.7);--glow2:rgba(169,112,31,.06);--grain-op:.01;--vig:rgba(20,22,40,.05);--sel-fg:#fff;
  --field:rgba(0,0,0,.03);--field-border:rgba(0,0,0,.12);
}
.kvr-root *{box-sizing:border-box;margin:0;padding:0}
.kvr-root ::selection{background:var(--accent);color:var(--sel-fg)}
.kvr-root a{color:inherit;text-decoration:none}
.kvr-root button,.kvr-root input{font-family:inherit;color:inherit}
.kvr-bg{position:fixed;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(ellipse 72% 48% at 50% -8%,var(--glow1),transparent 68%),radial-gradient(ellipse 50% 40% at 82% 8%,var(--glow2),transparent 70%)}
.kvr-grain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:var(--grain-op);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.kvr-vig{position:fixed;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse 100% 80% at 50% 30%,transparent 55%,var(--vig))}
.kvr-shell{position:relative;z-index:2;min-height:100dvh;display:flex;flex-direction:column;align-items:center;padding:0 20px 64px}
.kvr-nav{width:100%;max-width:1140px;margin:18px auto 0}
.kvr-nav-in{display:flex;align-items:center;justify-content:space-between;height:58px;padding:0 12px 0 18px;border-radius:16px;background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--gborder);box-shadow:var(--ghi),var(--gshadow)}
.kvr-brand{display:flex;align-items:center;gap:10px;font-family:var(--fd);font-weight:700;font-size:19px;letter-spacing:-.02em}
.kvr-brand img{width:26px;height:26px;border-radius:7px;object-fit:contain}
.kvr-nav-right{display:flex;align-items:center;gap:10px}
.kvr-back{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:11px;font-size:13px;color:var(--muted);background:var(--glass);border:1px solid var(--gborder);transition:background .2s}
.kvr-back:hover{background:var(--glass-strong)}
.kvr-card{width:100%;max-width:430px;margin-top:min(8vh,72px);padding:38px 34px;border-radius:22px;
  background:var(--glass);backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);border:1px solid var(--gborder);box-shadow:var(--ghi),var(--gshadow)}
.kvr-logo{display:flex;align-items:center;gap:11px;margin-bottom:18px}
.kvr-logo img{width:38px;height:38px;border-radius:10px;object-fit:contain}
.kvr-logo span{font-family:var(--fd);font-weight:700;font-size:19px;letter-spacing:-.02em}
.kvr-h1{font-family:var(--fd);font-weight:700;font-size:27px;letter-spacing:-.02em;margin-bottom:5px}
.kvr-sub{color:var(--muted);font-size:14.5px;margin-bottom:26px}
.kvr-seg{display:flex;gap:5px;padding:5px;border-radius:14px;background:var(--field);border:1px solid var(--field-border);margin-bottom:26px}
.kvr-seg button{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border:none;background:transparent;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;color:var(--muted);transition:all .25s}
.kvr-seg button.on{background:var(--glass-strong);color:var(--text);box-shadow:var(--ghi)}
.kvr-label{display:block;font-size:13.5px;font-weight:600;margin-bottom:8px}
.kvr-label-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.kvr-field{width:100%;padding:13px 15px;border-radius:12px;background:var(--field);border:1px solid var(--field-border);font-size:14.5px;color:var(--text);outline:none;transition:border-color .2s}
.kvr-field::placeholder{color:var(--faint)}
.kvr-field:focus{border-color:var(--accent-line)}
.kvr-pwd-wrap{position:relative}
.kvr-eye{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--muted);cursor:pointer;display:flex}
.kvr-eye:hover{color:var(--text)}
.kvr-btn{width:100%;padding:14px;border:none;border-radius:13px;background:var(--btn-bg);color:var(--btn-fg);font-family:var(--fb);font-weight:700;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .2s,transform .15s;box-shadow:var(--ghi)}
.kvr-btn:hover:not(:disabled){background:var(--btn-bg-hover);transform:translateY(-1px)}
.kvr-btn:disabled{opacity:.55;cursor:default}
.kvr-spin{width:19px;height:19px;border:2px solid rgba(0,0,0,.25);border-top-color:rgba(0,0,0,.7);border-radius:50%;animation:kvr-rot .7s linear infinite}
.kvr-spin-accent{width:13px;height:13px;border:2px solid var(--accent-soft);border-top-color:var(--accent);border-radius:50%;animation:kvr-rot .7s linear infinite}
@keyframes kvr-rot{to{transform:rotate(360deg)}}
.kvr-stack{display:flex;flex-direction:column;gap:18px}
.kvr-check{display:flex;align-items:center;gap:9px;cursor:pointer;user-select:none;font-size:13px;color:var(--muted)}
.kvr-check input{width:16px;height:16px;accent-color:var(--accent);cursor:pointer}
.kvr-center{text-align:center}
.kvr-icon-circle{width:80px;height:80px;border-radius:50%;background:var(--field);border:1px solid var(--field-border);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;color:var(--accent)}
.kvr-code-single{width:100%;padding:13px 15px;text-align:center;font-size:18px;font-weight:700;font-family:var(--fm);letter-spacing:.3em;border-radius:12px;background:var(--field);border:1px solid var(--field-border);color:var(--text);outline:none}
.kvr-code-single::placeholder{letter-spacing:normal;font-family:var(--fb);font-weight:400;color:var(--faint)}
.kvr-code-single:focus{border-color:var(--accent-line)}
.kvr-codebox{padding:22px;border-radius:16px;background:var(--field);border:1px solid var(--field-border);margin-bottom:18px;cursor:pointer;user-select:none}
.kvr-codebox .h{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.kvr-codebox .c{font-size:30px;font-weight:700;font-family:var(--fm);letter-spacing:.28em;color:var(--text)}
.kvr-linkbtn{background:none;border:none;font-size:12.5px;color:var(--accent);cursor:pointer}
.kvr-linkbtn:hover{text-decoration:underline}
.kvr-back-link{width:100%;text-align:center;background:none;border:none;font-size:13.5px;color:var(--muted);cursor:pointer;transition:color .2s}
.kvr-back-link:hover{color:var(--text)}
.kvr-err{font-size:13.5px;color:#f87171;text-align:center;margin-top:8px}
.kvr-ok{font-size:13.5px;color:#4ade80;text-align:center}
.kvr-legal{text-align:center;font-size:12px;color:var(--muted);line-height:1.6;margin-top:22px}
.kvr-legal a{color:var(--accent)}
.kvr-legal a:hover{text-decoration:underline}
.kvr-foot{text-align:center;font-size:13.5px;color:var(--muted);margin-top:22px}
.kvr-foot a{color:var(--accent)}
.kvr-foot a:hover{text-decoration:underline}
.kvr-wait{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:16px;font-size:13.5px;color:var(--muted)}
.kvr-tg{display:flex;align-items:center;gap:8px}
.kvr-tg-lang{position:relative}
.kvr-tg-btn{display:flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:11px;background:var(--ctrl-bg);border:1px solid var(--ctrl-border);box-shadow:var(--ghi);color:var(--text);font-family:var(--fb);font-size:13px;font-weight:600;cursor:pointer;transition:border-color .2s,background .2s}
.kvr-tg-btn:hover{border-color:var(--accent);background:var(--glass-strong)}
.kvr-tg-icon{width:38px;padding:0;justify-content:center}
.kvr-tg-menu{position:absolute;top:46px;right:0;min-width:150px;padding:7px;border-radius:13px;background:var(--menu-bg);border:1px solid var(--ctrl-border);box-shadow:0 22px 54px -16px rgba(0,0,0,.55),var(--ghi);z-index:90;display:flex;flex-direction:column;gap:3px}
.kvr-tg-item{text-align:left;padding:10px 12px;border-radius:9px;border:none;background:transparent;color:var(--text);font-family:var(--fb);font-size:13.5px;font-weight:600;cursor:pointer;transition:background .15s}
.kvr-tg-item:hover{background:var(--accent-soft)}
.kvr-tg-item.on{background:var(--accent-soft);color:var(--accent)}
@media (max-width:480px){.kvr-card{padding:30px 22px}.kvr-h1{font-size:24px}}
.kvr-root .kvr-btn{color:var(--btn-fg)}

/* ── v3 Apple-minimal overrides ────────────────────── */
.kvr-card{border-radius:24px;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none;background:var(--glass)}
.kvr-nav-in{border-radius:999px}
.kvr-h1{font-weight:600;letter-spacing:-.03em;font-size:30px}
.kvr-brand,.kvr-logo span{font-weight:600}
.kvr-btn{border-radius:999px;font-weight:500;box-shadow:none}
.kvr-btn-glass{border-radius:999px;font-weight:500}
.kvr-back,.kvr-tg-btn{border-radius:999px;box-shadow:none}
.kvr-seg{border-radius:999px}
.kvr-seg button{border-radius:999px;font-weight:500}
.kvr-seg button.on{background:var(--btn-bg);color:var(--btn-fg);box-shadow:none}
.kvr-field{border-radius:14px}
.kvr-field:focus{box-shadow:0 0 0 3px rgba(128,128,128,.14)}
.kvr-codes input{border-radius:14px}
.kvr-link-accent{color:var(--text)}
.kvr-legal a,.kvr-foot a{color:var(--text);text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--faint)}
.kvr-icon-circle{color:var(--text)}
.kvr-tg-item.on{color:var(--text)}
@media (min-width:1800px){.kvr-card{max-width:470px}}

/* ── v3.1 — borderless auth layout (landing-matched) ── */
.kvr-nav{max-width:1280px;margin-top:0}
.kvr-nav-in{height:72px;background:transparent;border:none;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;padding:0 4px}
.kvr-shell{padding:0 36px 88px}
.kvr-card{margin-top:min(13vh,116px);max-width:400px;padding:0;background:transparent;border:none;border-radius:0;box-shadow:none}
.kvr-logo{display:none}
.kvr-h1{font-size:clamp(34px,4.5vw,46px);letter-spacing:-.035em;line-height:1.05;margin-bottom:10px;
  background:linear-gradient(180deg,var(--text) 18%,var(--muted) 96%);-webkit-background-clip:text;background-clip:text;color:transparent}
.kvr-sub{font-size:16px;margin-bottom:32px}
.kvr-stack{gap:20px}
.kvr-btn{padding:15px}
.kvr-btn-glass{background:transparent;border:1px solid var(--ctrl-border)}
.kvr-btn-glass:hover{background:var(--glass)}
.kvr-legal{margin-top:26px}
.kvr-codebox{background:var(--glass);border-color:var(--gborder)}
@media (max-width:480px){.kvr-shell{padding:0 20px 64px}.kvr-card{margin-top:56px}.kvr-h1{font-size:32px}}
@supports (padding:max(0px)){.kvr-shell{padding-left:max(36px,env(safe-area-inset-left));padding-right:max(36px,env(safe-area-inset-right))}}
@media (min-width:1800px){.kvr-card{max-width:440px}}

/* ── v3.2 — header controls unified with landing ───── */
.kvr-tg-btn{height:36px;padding:0 12px;background:transparent;border:1px solid var(--gborder);box-shadow:none;color:var(--muted);font-family:var(--fm);font-size:11.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase}
.kvr-tg-btn:hover{border-color:var(--ctrl-border);background:transparent;color:var(--text)}
.kvr-tg-icon{width:36px;padding:0}
.kvr-back{height:36px;padding:0 16px;border-radius:999px;background:transparent;border:1px solid var(--ctrl-border);color:var(--text);font-size:14px}
.kvr-back:hover{background:var(--glass);border-color:var(--muted)}
.kvr-tg-menu{border-radius:14px}
.kvr-tg-item{font-weight:500}
.kvr-tg-item:hover{background:var(--glass-strong);color:var(--text)}
.kvr-tg-item.on{background:var(--glass-strong);color:var(--text)}
`;

function KvrToggles({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("theme", next); } catch {}
  };
  return (
    <div className="kvr-tg">
      <LangSwitcher />
      <button className="kvr-tg-btn kvr-tg-icon" onClick={toggleTheme} aria-label="Theme">
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    </div>
  );
}

export default function LoginPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [method, setMethod] = useState<AuthMethod>("email");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgPolling, setTgPolling] = useState(false);

  const [forgotStep, setForgotStep] = useState<"login" | "forgot" | "reset">("login");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(saved === "light" ? "light" : saved === "dark" ? "dark" : prefersDark ? "dark" : "light");
    } catch { /* dark */ }
  }, []);

  const handleEmail = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setFormError(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, remember }) });
      const data = await res.json();
      if (data.success) { trackEvent("login", { method: "email" }); window.location.href = "/dashboard"; }
      else setFormError(data.error || "Sign-in error");
    } catch { setFormError("Connection error"); }
    finally { setLoading(false); }
  };

  const handleForgot = async () => {
    if (!email) { setFormError("Enter email"); return; }
    setLoading(true); setFormError(null);
    try {
      const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (data.success) setForgotStep("reset");
      else setFormError(data.error || "Error");
    } catch { setFormError("Connection error"); }
    finally { setLoading(false); }
  };

  const handleReset = async () => {
    if (!resetCode || !newPassword) { setFormError("Fill all fields"); return; }
    setLoading(true); setFormError(null);
    try {
      const res = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: resetCode, password: newPassword }) });
      const data = await res.json();
      if (data.success) { setForgotSuccess(true); setForgotStep("login"); setFormError(null); setPassword(""); }
      else setFormError(data.error || "Error");
    } catch { setFormError("Connection error"); }
    finally { setLoading(false); }
  };

  const startTelegram = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/telegram", { method: "POST" });
      const data = await res.json();
      setTgCode(data.code); setTgPolling(true);
    } catch { console.error("Failed to generate Telegram code"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!tgPolling || !tgCode) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/telegram/verify?code=${tgCode}`);
        const data = await res.json();
        if (data.verified) { setTgPolling(false); trackEvent("login", { method: "telegram" }); window.location.href = "/dashboard"; }
      } catch { /* retry */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [tgPolling, tgCode]);

  const botLink = `https://t.me/KovraVPN_bot?start=${tgCode}`;

  return (
    <div className="kvr-root" data-theme={theme}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="kvr-bg" aria-hidden />
      <div className="kvr-grain" aria-hidden />
      <div className="kvr-vig" aria-hidden />

      <div className="kvr-shell">
        <nav className="kvr-nav">
          <div className="kvr-nav-in">
            <Link href="/" className="kvr-brand">
              <img src="/icon-192.png" alt="" />
              <span data-i18n="common.brand">Kovra</span>
            </Link>
            <div className="kvr-nav-right">
              <KvrToggles theme={theme} setTheme={setTheme} />
              <Link href="/" className="kvr-back">
                <ArrowLeft size={15} />
                <span data-i18n="common.back.home.short">Home</span>
              </Link>
            </div>
          </div>
        </nav>

        <div className="kvr-card">
          <div className="kvr-logo">
            <img src="/icon-192.png" alt="" />
            <span data-i18n="common.brand">Kovra</span>
          </div>
          <h1 className="kvr-h1" data-i18n="login.title">Sign in</h1>
          <p className="kvr-sub" data-i18n="login.subtitle">Manage your subscription and settings</p>

          {/* Method toggle */}
          <div className="kvr-seg">
            {[
              { id: "email" as const, i18nKey: "auth.method.email", label: "Email", icon: Mail },
              { id: "telegram" as const, i18nKey: "auth.method.telegram", label: "Telegram", icon: Send },
            ].map((m) => (
              <button key={m.id} onClick={() => { setMethod(m.id); setTgCode(null); setTgPolling(false); setFormError(null); }} className={method === m.id ? "on" : ""}>
                <m.icon size={16} />
                <span data-i18n={m.i18nKey}>{m.label}</span>
              </button>
            ))}
          </div>

          {/* EMAIL — sign in */}
          {method === "email" && forgotStep === "login" && (
            <form onSubmit={handleEmail} className="kvr-stack">
              {forgotSuccess && <p className="kvr-ok" data-i18n="login.forgotSuccess">Password updated — sign in with the new one</p>}
              <div>
                <label htmlFor="email" className="kvr-label" data-i18n="auth.email.label">Email</label>
                <input id="email" type="email" required autoComplete="email" placeholder="you@example.com"
                  data-i18n-attr="placeholder=auth.email.placeholder" value={email}
                  onChange={(e) => setEmail(e.target.value)} className="kvr-field" />
              </div>
              <div>
                <div className="kvr-label-row">
                  <label htmlFor="password" className="kvr-label" style={{ marginBottom: 0 }} data-i18n="auth.password.label">Password</label>
                  <button type="button" onClick={() => { setForgotStep("forgot"); setFormError(null); setForgotSuccess(false); }} className="kvr-linkbtn" data-i18n="login.forgot">Forgot?</button>
                </div>
                <div className="kvr-pwd-wrap">
                  <input id="password" type={show ? "text" : "password"} required autoComplete="current-password" placeholder="••••••••"
                    value={password} onChange={(e) => setPassword(e.target.value)} className="kvr-field" style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShow(!show)} className="kvr-eye">
                    {show ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </div>
              <label className="kvr-check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span data-i18n="login.remember">Remember for 7 days</span>
              </label>
              <button type="submit" disabled={loading} className="kvr-btn">
                {loading ? <div className="kvr-spin" /> : <span data-i18n="login.submit">Sign in</span>}
              </button>
              {formError && <p className="kvr-err">{formError}</p>}
            </form>
          )}

          {/* FORGOT — enter email */}
          {method === "email" && forgotStep === "forgot" && (
            <div className="kvr-stack">
              <p className="kvr-sub" style={{ margin: 0 }} data-i18n="login.forgot.intro">Enter your email — we will send a reset code</p>
              <input type="email" placeholder="you@example.com" data-i18n-attr="placeholder=auth.email.placeholder"
                value={email} onChange={(e) => setEmail(e.target.value)} className="kvr-field" />
              <button onClick={handleForgot} disabled={loading || !email} className="kvr-btn">
                {loading ? <div className="kvr-spin" /> : <span data-i18n="login.forgot.send">Send code</span>}
              </button>
              <button onClick={() => { setForgotStep("login"); setFormError(null); }} className="kvr-back-link" data-i18n="login.forgot.back">← Back to sign in</button>
              {formError && <p className="kvr-err">{formError}</p>}
            </div>
          )}

          {/* RESET — code + new password */}
          {method === "email" && forgotStep === "reset" && (
            <div className="kvr-stack">
              <p className="kvr-sub kvr-center" style={{ margin: 0 }}>
                <span data-i18n="register.verify.codeSent.prefix">Code sent to</span>{" "}
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{email}</span>
              </p>
              <input type="text" inputMode="numeric" maxLength={6} placeholder="6-digit code"
                data-i18n-attr="placeholder=login.reset.codePlaceholder" value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="kvr-code-single" />
              <div className="kvr-pwd-wrap">
                <input type={show ? "text" : "password"} placeholder="New password (min. 8)" data-i18n-attr="placeholder=login.reset.newPwPlaceholder"
                  minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="kvr-field" style={{ paddingRight: 44 }} />
                <button type="button" onClick={() => setShow(!show)} className="kvr-eye">
                  {show ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              <button onClick={handleReset} disabled={loading || resetCode.length < 6 || newPassword.length < 8} className="kvr-btn">
                {loading ? <div className="kvr-spin" /> : <span data-i18n="login.reset.submit">Change password</span>}
              </button>
              <button onClick={() => { setForgotStep("forgot"); setFormError(null); }} className="kvr-back-link" data-i18n="login.reset.back">← Back</button>
              {formError && <p className="kvr-err">{formError}</p>}
            </div>
          )}

          {/* TELEGRAM */}
          {method === "telegram" && !tgCode && (
            <div className="kvr-center">
              <div className="kvr-icon-circle"><Send size={32} /></div>
              <p className="kvr-sub" data-i18n="login.tg.hint">Get a code and send it to the bot on Telegram</p>
              <button onClick={startTelegram} disabled={loading} className="kvr-btn">
                {loading ? <div className="kvr-spin" /> : <span data-i18n="login.tg.getCode">Get code</span>}
              </button>
            </div>
          )}

          {method === "telegram" && tgCode && (
            <div className="kvr-center">
              <div className="kvr-codebox" onClick={() => { navigator.clipboard.writeText(tgCode!); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}>
                <p className="h" data-i18n={codeCopied ? "auth.tg.code.copied" : "auth.tg.code.copyHint"}>{codeCopied ? "✓ Copied!" : "Tap to copy"}</p>
                <p className="c">{tgCode}</p>
              </div>
              <a href={botLink} target="_blank" rel="noopener noreferrer" className="kvr-btn" style={{ textDecoration: "none" }}>
                <Send size={16} /><span data-i18n="auth.tg.open">Open the bot</span>
              </a>
              {tgPolling && (
                <div className="kvr-wait"><div className="kvr-spin-accent" /><span data-i18n="auth.tg.waiting">Waiting for confirmation...</span></div>
              )}
            </div>
          )}

          <p className="kvr-legal" data-i18n-html="auth.legal.html">
            By continuing, you agree to the <Link href="/terms" target="_blank" rel="noopener">Terms of Service</Link> and <Link href="/privacy" target="_blank" rel="noopener">Privacy Policy</Link>.
          </p>

          <p className="kvr-foot">
            <span data-i18n="login.noAccount">No account?</span>{" "}
            <Link href="/register" data-i18n="login.noAccount.cta">Create</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

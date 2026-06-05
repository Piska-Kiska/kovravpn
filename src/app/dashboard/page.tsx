// src/app/dashboard/page.tsx
"use client";

import { features } from "@/lib/features";
import { useState, useEffect, useCallback } from "react";
import { QrToggle } from "@/components/QrToggle";
import { Home, LogOut, Copy, Check, Download, Zap, Shield, CircleAlert, ExternalLink, Power, Loader2, AlertTriangle, Trash2, Plus, ShoppingCart, Gift, Wallet, Smartphone } from "lucide-react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import LinkAccounts from "@/components/LinkAccounts";
import { trackEvent, stripQueryParam } from "@/lib/attribution";

type Tab = "home" | "help";
interface Profile { uuid: string; email: string; vlessUrl: string; createdAt: number; deviceType?: string; subToken?: string; }
interface AccountData { subUrl?: string; plan: string; planId: string; profiles: Profile[]; paidUntil: number; createdAt: number; balance: number; dailyRate: number; daysRemaining: number; devices: number; features?: { happEncrypted?: boolean }; }
interface ReferralData { code: string; link: string; botLink: string; total: number; rewarded: number; pending: number; }
const DEV_NAMES: Record<string, string> = { android: 'Android', iphone: 'iPhone', iphone_ru: 'iPhone', mac: 'Mac', mac_ru: 'Mac', windows: 'Windows', tv: 'Телевизор' };
function devLabel(profiles: Profile[], i: number) { const t = profiles[i]?.deviceType || ''; const n = DEV_NAMES[t] || 'Устройство'; const same = profiles.filter(p => (p.deviceType || '') === t); return same.length > 1 ? `${n} ${profiles.slice(0, i).filter(p => (p.deviceType || '') === t).length + 1}` : n; }
const PLAN_NAMES: Record<string, string> = { free: "Пробный", active: "Активный" };

/** Client-side mirror of server MIN_TOPUP_CRYPTO from src/lib/balance.ts.
 *  Keep in sync when server-side value changes. */
const MIN_TOPUP_CRYPTO_UI = 600;
const MIN_TOPUP_ENOT_RUB_UI = 100;
const MIN_TOPUP_ENOT_CRYPTO_UI = 150;

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>("home");
  const [userId, setUserId] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ authMethod: string; email?: string; telegramId?: string } | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [lastCreatedDevice, setLastCreatedDevice] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [minTopup, setMinTopup] = useState(10);
  const [topupLoading, setTopupLoading] = useState(false);
  const [payMethod, setPayMethod] = useState<"card" | "enot_rub" | "enot_crypto" | "crypto">("card");
  const [cryptoPending, setCryptoPending] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [refCopied, setRefCopied] = useState(false);

  // Live clock for countdown (tick every minute)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Detect return from YooKassa (?paid=1 for plan purchase, ?topup=1 for
  // balance top-up) and NOWPayments (?topupcrypto=1) and fire a
  // payment_completed event once. Then strip the query param from the URL
  // so a manual refresh doesn't double-count.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("paid");
    const topup = params.get("topup");
    const topupcrypto = params.get("topupcrypto");
    const topupenot = params.get("topupenot");
    if (paid === "1") {
      trackEvent("payment_completed", { type: "plan" });
      stripQueryParam("paid");
    } else if (topup === "1") {
      trackEvent("payment_completed", { type: "topup" });
      stripQueryParam("topup");
    } else if (topupcrypto === "1") {
      // NOTE: crypto payment initiated — actual credit happens via webhook
      // after network confirmation (5-30 min). Show a pending banner.
      trackEvent("payment_initiated", { type: "topup", method: "crypto_return" });
      setCryptoPending(true);
      stripQueryParam("topupcrypto");
    } else if (topupenot === "1") {
      trackEvent("payment_completed", { type: "topup", method: "enot" });
      stripQueryParam("topupenot");
    } else if (topupenot === "fail") {
      trackEvent("payment_failed", { type: "topup", method: "enot" });
      stripQueryParam("topupenot");
    }
  }, []);

  // Fetch current user from session
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) {
          setUserId(d.userId);
          setUserInfo({ authMethod: d.authMethod, email: d.email, telegramId: d.telegramId });
        }
        else window.location.href = "/login";
      })
      .catch(() => { window.location.href = "/login"; });
  }, []);

  const fetchAccount = useCallback(async () => {
    if (!userId) return;
    try { const r = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      const d = await r.json();
      setAccount({ plan: PLAN_NAMES[d.account?.plan] || d.account?.plan || 'Пробный', planId: d.account?.plan || 'free', profiles: d.profiles || [], paidUntil: d.account?.paidUntil || 0, createdAt: d.account?.createdAt || 0, balance: d.account?.balance || 0, dailyRate: d.account?.dailyRate || 0, daysRemaining: d.account?.daysRemaining || 0, devices: d.account?.devices || 0, subUrl: d.subUrl || '', features: d.account?.features || {} }); } catch {} finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { if (userId) fetchAccount(); }, [userId, fetchAccount]);

  // Fetch min topup
  useEffect(() => {
    if (!userId) return;
    fetch("/api/account/has-topup").then(r => r.json()).then(d => {
      setMinTopup(d.hasTopup ? 100 : 10);
    }).catch(() => {});
  }, [userId]);

  // Fetch referral data
  useEffect(() => {
    if (!userId) return;
    fetch("/api/referral").then(r => r.json()).then(d => {
      if (d.code) setReferral(d);
    }).catch(() => {});
  }, [userId]);

  const DEVICES: Record<string, { name: string; emoji: string; happ: string; v2ray: string }> = {
    android: { name: "Android", emoji: "🤖", happ: "https://play.google.com/store/apps/details?id=com.happproxy", v2ray: "https://play.google.com/store/apps/details?id=com.v2raytun.android" },
    iphone: { name: "iPhone", emoji: "🍎", happ: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215", v2ray: "https://apps.apple.com/us/app/v2raytun/id6476628951" },
    iphone_ru: { name: "iPhone (RU)", emoji: "🇷🇺", happ: "https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973", v2ray: "https://apps.apple.com/us/app/v2raytun/id6476628951" },
    mac: { name: "Mac", emoji: "💻", happ: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215", v2ray: "https://apps.apple.com/us/app/v2raytun/id6476628951" },
    mac_ru: { name: "Mac (RU)", emoji: "🇷🇺", happ: "https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973", v2ray: "https://apps.apple.com/us/app/v2raytun/id6476628951" },
    windows: { name: "Windows", emoji: "🪟", happ: "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe", v2ray: "https://storage.v2raytun.com/v2RayTun_Setup.exe" },
    tv: { name: "Телевизор", emoji: "📺", happ: "https://play.google.com/store/apps/details?id=com.happproxy", v2ray: "https://play.google.com/store/apps/details?id=com.v2raytun.android" },
  };

  const handleCreate = async (device?: string) => {
    if (!device) { setShowDevicePicker(true); return; }
    setShowDevicePicker(false);
    setCreating(true); setError(null); setLastCreatedDevice(null);
    try {
      const r = await fetch("/api/vpn/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
      const d = await r.json();
      if (d.success) { setLastCreatedDevice(device); await fetchAccount(); }
      else setError(d.error);
    } catch { setError("Ошибка соединения"); } finally { setCreating(false); }
  };

  const handleDelete = async (uuid: string) => {
    if (!confirm("Удалить профиль? Ссылка перестанет работать.")) return;
    setDeletingId(uuid);
    try { await fetch("/api/vpn/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, uuid }) }); await fetchAccount(); } catch {} finally { setDeletingId(null); }
  };

  const copyLink = (url: string, uuid: string) => { navigator.clipboard.writeText(url); setCopiedId(uuid); setTimeout(() => setCopiedId(null), 2000); };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch { /* ignore */ }
    window.location.href = "/login";
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-nm-text-secondary" /></div>;

  const profiles = account?.profiles || [];
  const isPaid = (account?.balance || 0) > 0;
  const hasBalance = (account?.balance || 0) > 0;
  const canCreate = profiles.length < 100 && hasBalance;

  return (
    <div className="min-h-screen flex">
      <aside className="nm-sidebar w-[60px] md:w-[72px] flex flex-col items-center py-5 gap-1 shrink-0">
        <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center mb-6"><Logo size={18} className="text-white/80" /></div>
        <nav className="flex-1 flex flex-col items-center gap-1">
          {([{ icon: Home, id: "home" as Tab }, { icon: CircleAlert, id: "help" as Tab }]).map((item) => (
            <button key={item.id} onClick={() => setTab(item.id)} className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${tab === item.id ? "bg-white/15 text-white" : "text-white/35 hover:text-white/60"}`}><item.icon className="w-5 h-5" /></button>
          ))}
        </nav>
        <button onClick={handleLogout} title="Выйти" className="w-10 h-10 rounded-2xl flex items-center justify-center text-white/25 hover:text-white/50 transition cursor-pointer"><LogOut className="w-5 h-5" /></button>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-auto min-w-0">
        <div className="flex items-start justify-between gap-3 mb-8">
          <h1 className="text-xl md:text-2xl font-bold text-nm-text truncate">{tab === "home" ? "Панель управления" : "Помощь"}</h1>
          <div className="shrink-0 scale-[0.85] md:scale-100 origin-right"><ThemeToggle /></div>
        </div>

        {tab === "home" && (
          <div className="space-y-5">
            {/* Status cards */}
            <div className="grid grid-cols-3 gap-3 md:gap-4">
              <div className="nm-raised p-3 md:p-4"><span className="text-[10px] md:text-xs text-nm-text-secondary">Устройства</span><div className="flex items-center gap-1.5 mt-1.5"><Smartphone className="w-3.5 h-3.5 text-nm-accent" /><span className="font-bold text-nm-text text-xs md:text-sm">{profiles.length}</span></div></div>
              <div className="nm-raised p-3 md:p-4"><span className="text-[10px] md:text-xs text-nm-text-secondary">Стоимость</span><div className="mt-1.5"><span className="font-bold text-nm-text text-xs md:text-sm">{profiles.length * 100} ₽/мес</span></div></div>
              <div className="nm-raised p-3 md:p-4"><span className="text-[10px] md:text-xs text-nm-text-secondary">Статус</span><div className="flex items-center gap-1.5 mt-1.5"><div className={`w-2 h-2 rounded-full ${profiles.length > 0 ? "bg-green-400 animate-pulse" : "bg-nm-text-secondary"}`} /><span className="font-bold text-nm-text text-xs md:text-sm">{profiles.length > 0 ? "Активен" : "Нет"}</span></div></div>
            </div>

            {/* Balance card */}
            {account && (
              <div className="nm-raised p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-nm-text text-sm flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-nm-accent" />Баланс
                  </h3>
                  <span className="text-lg font-bold text-nm-text">{account.balance.toFixed(2)} ₽</span>
                </div>
                {account.dailyRate > 0 && (
                  <div className="flex items-center justify-between text-xs text-nm-text-secondary mb-1">
                    <span>Расход: {account.dailyRate.toFixed(2)} ₽/день</span>
                    <span>Хватит на ~{account.daysRemaining} дн.</span>
                  </div>
                )}
                {!account.dailyRate && <div className="mb-3" />}

                {cryptoPending && (
                  <div className="nm-pressed-sm px-3 py-2 mb-3 text-xs text-nm-text flex items-start gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-nm-accent mt-0.5 flex-shrink-0" />
                    <span>Платёж создан. Баланс зачислится автоматически после подтверждения сети (5-30 минут).</span>
                  </div>
                )}

                {/* Payment method tabs */}
                <div className="grid grid-cols-3 gap-1 mb-3 nm-pressed-sm p-1 rounded-lg">
                  <button
                    onClick={() => { setPayMethod("card"); setTopupAmount(""); }}
                    className={`py-1.5 text-xs font-medium rounded cursor-pointer transition-colors ${
                      payMethod === "card" ? "nm-btn-accent text-white" : "text-nm-text-secondary"
                    }`}>
                    💳 Карта РФ
                  </button>
                  <button
                    onClick={() => { setPayMethod("enot_rub"); setTopupAmount(""); }}
                    className={`py-1.5 text-[11px] font-medium rounded cursor-pointer transition-colors ${
                      payMethod === "enot_rub" ? "nm-btn-accent text-white" : "text-nm-text-secondary"
                    }`}>
                    ⚡ СБП
                  </button>
                  {features.enotCryptoEnabled && (

                    <button
                    onClick={() => { setPayMethod("enot_crypto"); setTopupAmount(""); }}
                    className={`py-1.5 text-[11px] font-medium rounded cursor-pointer transition-colors ${
                      payMethod === "enot_crypto" ? "nm-btn-accent text-white" : "text-nm-text-secondary"
                    }`}>
                    ⚡ Крипта Бета
                  </button>

                  )}
                  <button
                    onClick={() => { setPayMethod("crypto"); setTopupAmount(""); }}
                    className={`py-1.5 text-xs font-medium rounded cursor-pointer transition-colors ${
                      payMethod === "crypto" ? "nm-btn-accent text-white" : "text-nm-text-secondary"
                    }`}>
                    🪙 Крипта
                  </button>
                </div>

                {/* Quick-amount buttons (differ per method) */}
                <div className="flex gap-2">
                  {(payMethod === "crypto"
                    ? [600, 1000, 2000]
                    : payMethod === "enot_crypto"
                      ? [150, 300, 500]
                      : [100, 250, 500]
                  ).map((amt) => (
                    <button key={amt} onClick={() => setTopupAmount(String(amt))}
                      className={`nm-btn flex-1 py-2 text-xs font-medium cursor-pointer ${topupAmount === String(amt) ? "text-nm-accent" : "text-nm-text-secondary"}`}>
                      {amt} ₽
                    </button>
                  ))}
                  <input type="number" placeholder="Сумма" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)}
                    className="nm-pressed-sm px-3 py-2 text-xs text-nm-text bg-transparent outline-none w-20" />
                </div>

                {(() => {
                  const currentMin =
                    payMethod === "crypto"
                      ? MIN_TOPUP_CRYPTO_UI
                      : payMethod === "enot_crypto"
                        ? MIN_TOPUP_ENOT_CRYPTO_UI
                        : payMethod === "enot_rub"
                          ? MIN_TOPUP_ENOT_RUB_UI
                          : minTopup;
                  const amountNum = Number(topupAmount);
                  const amountValid = amountNum >= currentMin && amountNum <= 10000;
                  return (
                    <>
                      <button
                        disabled={topupLoading || !topupAmount || !amountValid}
                        onClick={async () => {
                          setTopupLoading(true);
                          setError(null);
                          try {
                            let endpoint = "/api/balance/topup";
                            let payload: Record<string, unknown> = { amount: amountNum };
                            if (payMethod === "crypto") {
                              endpoint = "/api/balance/topup-crypto";
                            } else if (payMethod === "enot_rub") {
                              endpoint = "/api/balance/topup-enot";
                              payload = { amount: amountNum, kind: "rub" };
                            } else if (payMethod === "enot_crypto") {
                              endpoint = "/api/balance/topup-enot";
                              payload = { amount: amountNum, kind: "crypto" };
                            }
                            const r = await fetch(endpoint, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(payload),
                            });
                            const d = await r.json();
                            if (d.paymentUrl) {
                              trackEvent("payment_initiated", {
                                amount: amountNum,
                                type: "topup",
                                method: payMethod,
                              });
                              window.location.href = d.paymentUrl;
                            }
                            else setError(d.error || "Ошибка оплаты");
                          } catch { setError("Ошибка соединения"); }
                          finally { setTopupLoading(false); }
                        }}
                        className="nm-btn-accent w-full py-3 mt-3 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                        {topupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                          <><Wallet className="w-4 h-4" />
                          {payMethod === "card" && "Пополнить"}
                          {payMethod === "enot_rub" && "Оплатить через СБП"}
                          {payMethod === "enot_crypto" && "Оплатить криптой (Бета)"}
                          {payMethod === "crypto" && "Оплатить криптой"}</>
                        )}
                      </button>
                      <p className="text-[10px] text-nm-text-secondary text-center mt-1">
                        {payMethod === "card" && `Мин. сумма: ${currentMin} ₽`}
                        {payMethod === "enot_rub" && `Мин. сумма: ${currentMin} ₽ · Карта, СБП`}
                        {payMethod === "enot_crypto" && `Мин. сумма: ${currentMin} ₽ · BTC, ETH, USDT, LTC, TRX`}
                        {payMethod === "crypto" && `Мин. сумма: ${currentMin} ₽ · BTC, USDT, ETH, TON и др.`}
                      </p>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Balance countdown */}
            {account && profiles.length > 0 && account.daysRemaining > 0 && (
              <div className="nm-pressed p-4 rounded-2xl">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-nm-text-secondary">Баланса хватит на</span>
                  <span className={`text-sm font-bold ${account.daysRemaining <= 3 ? "text-red-400" : account.daysRemaining <= 7 ? "text-yellow-400" : "text-green-400"}`}>
                    ~{account.daysRemaining} дн.
                  </span>
                </div>
              </div>
            )}
            {account && profiles.length > 0 && account.daysRemaining <= 0 && (
              <div className="nm-pressed p-4 rounded-2xl border border-red-400/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-400 font-bold">Баланс исчерпан</span>
                </div>
                <p className="text-xs text-nm-accent mt-2 text-center">Подписка истекла</p>
                <div className="flex gap-2 mt-3"><a href="https://t.me/proxysvpn_bot" target="_blank" rel="noopener" className="nm-btn flex-1 py-2 text-xs text-center text-nm-accent cursor-pointer">Открыть бот</a><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="nm-btn flex-1 py-2 text-xs text-center text-nm-accent cursor-pointer">Пополнить</button></div>
              </div>
            )}

            
            {/* Profiles — each device has its OWN subscription URL.
                No top-level subscription card: that was the legacy "all profiles in one URL"
                model. We now show one per-device URL + per-device QR. */}
            {profiles.map((p, i) => {
              const happEnabled = account?.features?.happEncrypted ?? false;
              const subUrl = p.subToken
                ? (happEnabled
                    ? `https://proxysvpn.com/p/${p.subToken}`
                    : `https://proxysvpn.com/api/sub/${p.subToken}`)
                : "";
              return (
              <div key={p.uuid} className="nm-raised p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2"><div className="nm-circle-pressed w-7 h-7 flex items-center justify-center"><Shield className="w-3.5 h-3.5 text-nm-accent" /></div><span className="font-bold text-nm-text text-sm">{devLabel(profiles, i)}</span></div>
                  <button onClick={() => handleDelete(p.uuid)} disabled={deletingId === p.uuid} className="nm-btn px-2.5 py-1.5 text-xs text-red-400 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50">{deletingId === p.uuid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}Удалить</button>
                </div>
                <p className="text-[10px] text-nm-text-secondary mb-2">
                  Ссылка подписки для этого устройства. Добавьте её в Happ или V2RayTun.
                </p>
                <div className="nm-pressed p-2.5 rounded-2xl flex items-center gap-2">
                  <code className="flex-1 text-[10px] md:text-[11px] text-nm-accent truncate font-mono min-w-0">{subUrl || "—"}</code>
                  <button onClick={() => subUrl && copyLink(subUrl, p.uuid)} disabled={!subUrl} className="nm-btn w-8 h-8 flex items-center justify-center shrink-0 disabled:opacity-50">{copiedId === p.uuid ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-nm-text-secondary" />}</button>
                </div>
                {subUrl && <QrToggle url={subUrl} />}
              </div>
              );
            })}

            {/* Create / Device picker */}
            {canCreate && !showDevicePicker && (
              <button onClick={() => handleCreate()} disabled={creating} className="nm-btn-accent w-full py-3.5 font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
                {creating ? <><Loader2 className="w-5 h-5 animate-spin" />Создаём...</> : <><Plus className="w-5 h-5" />{profiles.length === 0 ? "Подключить" : "Добавить устройство"}</>}
              </button>
            )}

            {showDevicePicker && (
              <div className="nm-raised p-4 md:p-5">
                <h3 className="font-bold text-nm-text text-sm mb-3">📱 Выберите устройство</h3>
                <div className="grid grid-cols-2 gap-2">
                  {(["android", "iphone", "iphone_ru", "mac", "mac_ru", "windows"] as const).map((id) => {
                    const d = DEVICES[id];
                    return (
                      <button key={id} onClick={() => handleCreate(id)} disabled={creating}
                        className="nm-btn py-3 px-3 text-sm text-nm-text flex items-center gap-2 cursor-pointer disabled:opacity-50">
                        <span>{d.emoji}</span>{d.name}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setShowDevicePicker(false)} className="text-xs text-nm-text-secondary mt-3 cursor-pointer">Отмена</button>
              </div>
            )}

            {/* Download links after creation */}
            {lastCreatedDevice && DEVICES[lastCreatedDevice] && (
              <div className="nm-raised p-4 md:p-5">
                <p className="text-sm text-nm-text mb-3">📥 Скачайте приложение для <b>{DEVICES[lastCreatedDevice].name}</b>:</p>
                <div className="grid grid-cols-2 gap-2">
                  <a href={DEVICES[lastCreatedDevice].happ} target="_blank" rel="noopener noreferrer"
                    className="nm-btn-accent py-3 px-4 text-sm font-medium text-center">Happ</a>
                  <a href={DEVICES[lastCreatedDevice].v2ray} target="_blank" rel="noopener noreferrer"
                    className="nm-btn py-3 px-4 text-sm font-medium text-nm-accent text-center">V2RayTun</a>
                </div>
                <p className="text-xs text-nm-text-secondary mt-2 text-center">Скопируйте VLESS-ссылку и вставьте в приложение</p>
                <button onClick={() => setLastCreatedDevice(null)} className="text-xs text-nm-text-secondary mt-2 cursor-pointer block mx-auto">Скрыть</button>
              </div>
            )}

            {/* Need balance */}
            {!canCreate && profiles.length > 0 && profiles.length < 100 && (
              <div className="nm-pressed p-5 text-center rounded-2xl">
                <p className="text-sm text-nm-text-secondary mb-2">
                  Для нового устройства пополните баланс
                </p>
                <p className="text-xs text-nm-text-secondary">
                  100 ₽/мес за каждое устройство (~3.33 ₽/день, списывается ежедневно)
                </p>
              </div>
            )}
            {profiles.length >= 100 && (
              <div className="nm-pressed p-5 text-center rounded-2xl">
                <p className="text-sm text-nm-text-secondary">Максимум 100 устройств</p>
              </div>
            )}

            {error && <div className="nm-pressed-sm p-3 rounded-xl flex items-center gap-2 justify-center text-sm text-red-400"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}

            <div className="nm-raised p-4 md:p-5">
                <h3 className="font-bold text-nm-text text-sm mb-3">🎟 Промокод</h3>
                <div className="flex gap-2">
                  <input type="text" placeholder="Введите промокод" value={promoCode} onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoMsg(null); }}
                    className="nm-pressed-sm px-3 py-2 text-xs text-nm-text bg-transparent outline-none flex-1" maxLength={32} />
                  <button disabled={promoLoading || !promoCode} onClick={async () => {
                    setPromoLoading(true); setPromoMsg(null);
                    try {
                      const r = await fetch("/api/promo/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: promoCode }) });
                      const d = await r.json();
                      if (d.success) { setPromoMsg("\u2705 +" + d.amount + " \u20bd"); setPromoCode(""); await fetchAccount(); }
                      else setPromoMsg("\u274c " + d.error);
                    } catch { setPromoMsg("\u274c Ошибка"); }
                    finally { setPromoLoading(false); }
                  }} className="nm-btn-accent px-4 py-2 text-xs font-medium cursor-pointer disabled:opacity-50">
                    {promoLoading ? "..." : "OK"}
                  </button>
                </div>
                {promoMsg && <p className={`text-xs mt-2 ${promoMsg.startsWith("\u2705") ? "text-green-400" : "text-red-400"}`}>{promoMsg}</p>}
              </div>

            {/* Downloads */}
            <div className="nm-raised p-4 md:p-5">
              <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-nm-text text-sm">Happ</h3><a href="https://www.happ.su/main" target="_blank" rel="noopener noreferrer" className="text-xs text-nm-accent hover:underline">Все →</a></div>
              <div className="grid grid-cols-2 gap-2">
                <a href="https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />Windows</a>
                <a href="https://play.google.com/store/apps/details?id=com.happproxy" target="_blank" rel="noopener noreferrer" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />Android</a>
                <a href="https://apps.apple.com/us/app/happ-proxy-utility/id6504287215" target="_blank" rel="noopener noreferrer" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />iOS / macOS</a>
                <a href="https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973" target="_blank" rel="noopener noreferrer" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />iOS / macOS<span className="text-[10px] text-nm-accent ml-auto">RU</span></a>
              </div>
              <div className="flex items-center justify-between mt-4 mb-3"><h3 className="font-bold text-nm-text text-sm">V2RayTun</h3><a href="https://v2raytun.com" target="_blank" rel="noopener noreferrer" className="text-xs text-nm-accent hover:underline">Сайт →</a></div>
              <div className="grid grid-cols-2 gap-2">
                <a href="https://storage.v2raytun.com/v2RayTun_Setup.exe" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />Windows</a>
                <a href="https://play.google.com/store/apps/details?id=com.v2raytun.android" target="_blank" rel="noopener noreferrer" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />Android / TV</a>
                <a href="https://apps.apple.com/us/app/v2raytun/id6476628951" target="_blank" rel="noopener noreferrer" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />iOS / macOS</a>
              </div>
            </div>

            {/* Account linking */}
            {userId && userInfo && (
              <LinkAccounts
                userId={userId}
                authMethod={userInfo.authMethod}
                email={userInfo.email}
                telegramId={userInfo.telegramId}
                onUpdate={() => {
                  fetch("/api/auth/me").then(r => r.json()).then(d => {
                    if (d.authenticated) setUserInfo({ authMethod: d.authMethod, email: d.email, telegramId: d.telegramId });
                  });
                }}
              />
            )}

            {/* Referral */}
            {referral && (
              <div className="nm-raised p-4 md:p-5">
                <h3 className="font-bold text-nm-text text-sm mb-3 flex items-center gap-2">
                  <Gift className="w-4 h-4 text-nm-accent" />Пригласить друга
                </h3>
                <p className="text-xs text-nm-text-secondary mb-3">
                  +50 ₽ за каждого друга, пополнившего баланс (макс. 30)
                </p>
                <div className="nm-pressed p-3 rounded-2xl mb-3 cursor-pointer select-none"
                  onClick={() => { navigator.clipboard.writeText(referral.link); setRefCopied(true); setTimeout(() => setRefCopied(false), 2000); }}>
                  <p className="text-[10px] text-nm-text-secondary mb-1">
                    {refCopied ? "✓ Скопировано!" : "Нажмите чтобы скопировать"}
                  </p>
                  <code className="text-xs text-nm-text break-all">{referral.link}</code>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="nm-pressed-sm p-2 rounded-xl">
                    <p className="text-lg font-bold text-nm-text">{referral.total}</p>
                    <p className="text-[10px] text-nm-text-secondary">Приглашено</p>
                  </div>
                  <div className="nm-pressed-sm p-2 rounded-xl">
                    <p className="text-lg font-bold text-nm-text">{referral.rewarded}</p>
                    <p className="text-[10px] text-nm-text-secondary">Оплатили</p>
                  </div>
                  <div className="nm-pressed-sm p-2 rounded-xl">
                    <p className="text-lg font-bold text-nm-accent">{referral.rewarded * 50}</p>
                    <p className="text-[10px] text-nm-text-secondary">₽ получено</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "help" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="nm-raised p-6 flex flex-col">
              <h3 className="font-bold text-nm-text mb-2">Инструкция</h3>
              <p className="text-sm text-nm-text-secondary mb-4 flex-1">Пошаговая настройка</p>
              <a href="/guide" target="_blank" rel="noopener noreferrer" className="nm-btn-accent w-full py-3 text-sm font-medium flex items-center justify-center gap-2">Открыть<ExternalLink className="w-4 h-4" /></a>
            </div>
            <div className="nm-raised p-6 flex flex-col">
              <h3 className="font-bold text-nm-text mb-2">Поддержка</h3>
              <p className="text-sm text-nm-text-secondary mb-4 flex-1">Telegram</p>
              <a href="https://t.me/proxysvpn_bot" target="_blank" rel="noopener noreferrer" className="nm-btn w-full py-3 text-sm font-medium text-nm-text flex items-center justify-center gap-2">Написать<ExternalLink className="w-4 h-4" /></a>
            </div>
          </div>
        )}
        <div className="text-center mt-6 mb-4">
          <a href="/guide" target="_blank" rel="noopener noreferrer" className="text-xs text-nm-text-secondary hover:text-nm-accent inline-flex items-center gap-1">Инструкция<ExternalLink className="w-3 h-3" /></a>
        </div>
      </main>
    </div>
  );
}

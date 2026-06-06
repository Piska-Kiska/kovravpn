// src/app/dashboard/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { QrToggle } from "@/components/QrToggle";
import {
  Home, LogOut, Copy, Check, Download, Shield, CircleAlert,
  ExternalLink, Loader2, AlertTriangle, Trash2, Plus, Gift,
  Globe, ChevronDown, Calendar, Layers,
} from "lucide-react";
import LinkAccounts from "@/components/LinkAccounts";
import { trackEvent, stripQueryParam } from "@/lib/attribution";
import { useDashLang, DASH_LANGS, type DashLang } from "@/lib/dash-i18n";

type Tab = "home" | "help";

interface Profile { uuid: string; clientEmail?: string; vlessUrl: string; createdAt: number; deviceType?: string; subToken?: string; }
interface SubItem { id: string; kind: "plan1" | "plan3" | "device" | "referral"; slots: number; createdAt: number; expiresAt: number; }
interface PlanPrice { term: number; total: number; perMonth: number; refMonthly: number; }
interface Pricing {
  plan1: Record<string, PlanPrice>;
  plan3: Record<string, PlanPrice>;
  plan1Slots: number; plan3Slots: number;
  deviceAddonPrice: number; deviceAddonDays: number;
}
interface AccountData {
  plan: string;
  activeSlots: number;
  hasActive: boolean;
  maxExpiry: number;
  nextExpiry: number;
  daysRemaining: number;
  devices: number;
  subs: SubItem[];
  features?: { happEncrypted?: boolean };
}
interface ReferralData { code: string; link: string; botLink: string; total: number; rewarded: number; pending: number; }

const DEVICE_DEFS: Record<string, { name: string; emoji: string; happ: string; v2ray: string }> = {
  android: { name: "Android", emoji: "🤖", happ: "https://play.google.com/store/apps/details?id=com.happproxy", v2ray: "https://play.google.com/store/apps/details?id=com.v2raytun.android" },
  iphone: { name: "iPhone", emoji: "🍎", happ: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215", v2ray: "https://apps.apple.com/us/app/v2raytun/id6476628951" },
  mac: { name: "Mac", emoji: "💻", happ: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215", v2ray: "https://apps.apple.com/us/app/v2raytun/id6476628951" },
  windows: { name: "Windows", emoji: "🪟", happ: "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe", v2ray: "https://storage.v2raytun.com/v2RayTun_Setup.exe" },
  tv: { name: "TV", emoji: "📺", happ: "https://play.google.com/store/apps/details?id=com.happproxy", v2ray: "https://play.google.com/store/apps/details?id=com.v2raytun.android" },
};
const DEVICE_ORDER = ["android", "iphone", "mac", "windows", "tv"] as const;

function fmtDate(ms: number, lang: string): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleDateString(lang === "en" ? "en-US" : lang, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export default function DashboardPage() {
  const { lang, setLang, t } = useDashLang();
  const [tab, setTab] = useState<Tab>("home");
  const [langOpen, setLangOpen] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ authMethod: string; email?: string; telegramId?: string } | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [loading, setLoading] = useState(true);

  // purchase UI
  const [planKind, setPlanKind] = useState<"plan1" | "plan3">("plan3");
  const [term, setTerm] = useState<1 | 6 | 12>(12);
  const [buying, setBuying] = useState(false);
  const [buyingDevice, setBuyingDevice] = useState(false);

  // device create
  const [creating, setCreating] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [lastCreatedDevice, setLastCreatedDevice] = useState<string | null>(null);

  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [refCopied, setRefCopied] = useState(false);
  const [cryptoPending, setCryptoPending] = useState(false);

  // return-from-payment detection
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("paid") === "1") {
      trackEvent("payment_initiated", { type: "plan", method: "crypto_return" });
      setCryptoPending(true);
      stripQueryParam("paid");
    }
  }, []);

  // current user
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) {
          setUserId(d.userId);
          setUserInfo({ authMethod: d.authMethod, email: d.email, telegramId: d.telegramId });
        } else window.location.href = "/login";
      })
      .catch(() => { window.location.href = "/login"; });
  }, []);

  const fetchAccount = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
      const d = await r.json();
      if (d.account) {
        setAccount({
          plan: d.account.plan || "free",
          activeSlots: d.account.activeSlots || 0,
          hasActive: !!d.account.hasActive,
          maxExpiry: d.account.maxExpiry || 0,
          nextExpiry: d.account.nextExpiry || 0,
          daysRemaining: d.account.daysRemaining || 0,
          devices: d.account.devices || 0,
          subs: d.account.subs || [],
          features: d.account.features || {},
        });
      }
      if (d.pricing) setPricing(d.pricing);
      // attach profiles via a parallel field
      setProfiles(d.profiles || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [userId]);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  useEffect(() => { if (userId) fetchAccount(); }, [userId, fetchAccount]);

  useEffect(() => {
    if (!userId) return;
    fetch("/api/referral").then((r) => r.json()).then((d) => { if (d.code) setReferral(d); }).catch(() => {});
  }, [userId]);

  const handleBuyPlan = async () => {
    setBuying(true); setError(null);
    try {
      const r = await fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: planKind, term }) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "plan", method: "crypto", kind: planKind, term });
        window.location.href = d.paymentUrl;
      } else setError(d.error || t.err_pay);
    } catch { setError(t.err_conn); } finally { setBuying(false); }
  };

  const handleBuyDevice = async () => {
    setBuyingDevice(true); setError(null);
    try {
      const r = await fetch("/api/subscribe/device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "device", method: "crypto" });
        window.location.href = d.paymentUrl;
      } else setError(d.error || t.err_pay);
    } catch { setError(t.err_conn); } finally { setBuyingDevice(false); }
  };

  const handleCreate = async (device?: string) => {
    if (!device) { setShowDevicePicker(true); return; }
    setShowDevicePicker(false);
    setCreating(true); setError(null); setLastCreatedDevice(null);
    try {
      const r = await fetch("/api/vpn/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, deviceType: device }) });
      const d = await r.json();
      if (d.success) { setLastCreatedDevice(device); await fetchAccount(); }
      else setError(d.error);
    } catch { setError(t.err_conn); } finally { setCreating(false); }
  };

  const handleDelete = async (uuid: string) => {
    if (!confirm(t.confirm_delete)) return;
    setDeletingId(uuid);
    try { await fetch("/api/vpn/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, uuid }) }); await fetchAccount(); } catch { /* ignore */ } finally { setDeletingId(null); }
  };

  const copyLink = (url: string, uuid: string) => { navigator.clipboard.writeText(url); setCopiedId(uuid); setTimeout(() => setCopiedId(null), 2000); };

  const handleLogout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    window.location.href = "/login";
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-nm-text-secondary" /></div>;

  const slots = account?.activeSlots || 0;
  const canCreate = profiles.length < 100 && profiles.length < slots;
  const subLabel = (k: SubItem["kind"]) => k === "plan3" ? t.sub_plan3 : k === "plan1" ? t.sub_plan1 : k === "device" ? t.sub_device : t.sub_referral;

  const price1 = pricing?.plan1?.[String(term)];
  const price3 = pricing?.plan3?.[String(term)];
  const selPrice = planKind === "plan3" ? price3 : price1;

  const devLabel = (i: number) => {
    const ty = profiles[i]?.deviceType || "";
    const base = DEVICE_DEFS[ty]?.name || "Device";
    const same = profiles.filter((p) => (p.deviceType || "") === ty);
    return same.length > 1 ? `${base} ${profiles.slice(0, i).filter((p) => (p.deviceType || "") === ty).length + 1}` : base;
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="nm-sidebar w-[60px] md:w-[72px] flex flex-col items-center py-5 gap-1 shrink-0">
        <div className="w-10 h-10 rounded-2xl overflow-hidden mb-6 flex items-center justify-center bg-nm-accent/10">
          <img src="/icon-192.png" alt="Kovra" className="w-9 h-9 object-contain" />
        </div>
        <nav className="flex-1 flex flex-col items-center gap-1">
          {([{ icon: Home, id: "home" as Tab }, { icon: CircleAlert, id: "help" as Tab }]).map((item) => (
            <button key={item.id} onClick={() => setTab(item.id)} className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${tab === item.id ? "bg-nm-accent/15 text-nm-accent" : "text-nm-text-secondary hover:text-nm-text"}`}><item.icon className="w-5 h-5" /></button>
          ))}
        </nav>
        <button onClick={handleLogout} title={t.logout} className="w-10 h-10 rounded-2xl flex items-center justify-center text-nm-text-secondary hover:text-red-400 transition cursor-pointer"><LogOut className="w-5 h-5" /></button>
      </aside>

      {/* Main */}
      <main className="flex-1 max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-3">
          <h1 className="text-xl md:text-2xl font-bold text-nm-text truncate">{tab === "home" ? t.dash_title : t.help_title}</h1>
          <div className="relative">
            <button onClick={() => setLangOpen((v) => !v)} className="nm-btn px-3 py-2 text-xs font-medium text-nm-text inline-flex items-center gap-1.5 cursor-pointer">
              <Globe className="w-3.5 h-3.5 text-nm-accent" />{lang.toUpperCase()}<ChevronDown className="w-3 h-3" />
            </button>
            {langOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                <div className="absolute right-0 mt-1 z-50 nm-raised rounded-xl overflow-hidden min-w-[140px]">
                  {DASH_LANGS.map((l) => (
                    <button key={l.code} onClick={() => { setLang(l.code as DashLang); setLangOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs cursor-pointer transition-colors ${lang === l.code ? "text-nm-accent bg-white/5" : "text-nm-text hover:bg-white/5"}`}>
                      {l.native}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {tab === "home" && (
          <div className="space-y-4">
            {/* Overview */}
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <div className="nm-raised p-3 md:p-4"><span className="text-[10px] md:text-xs text-nm-text-secondary">{t.active_devices}</span><div className="flex items-center gap-1.5 mt-1.5"><Layers className="w-3.5 h-3.5 text-nm-accent" /><span className="font-bold text-nm-text text-xs md:text-sm">{profiles.length}/{slots}</span></div></div>
              <div className="nm-raised p-3 md:p-4"><span className="text-[10px] md:text-xs text-nm-text-secondary">{t.status}</span><div className="flex items-center gap-1.5 mt-1.5"><div className={`w-2 h-2 rounded-full ${account?.hasActive ? "bg-green-400 animate-pulse" : "bg-nm-text-secondary"}`} /><span className="font-bold text-nm-text text-xs md:text-sm">{account?.hasActive ? t.status_active : t.status_none}</span></div></div>
              <div className="nm-raised p-3 md:p-4"><span className="text-[10px] md:text-xs text-nm-text-secondary">{t.expires}</span><div className="flex items-center gap-1.5 mt-1.5"><Calendar className="w-3.5 h-3.5 text-nm-accent" /><span className="font-bold text-nm-text text-[11px] md:text-sm">{account?.hasActive ? fmtDate(account.maxExpiry, lang) : "—"}</span></div></div>
            </div>

            {cryptoPending && (
              <div className="nm-pressed p-4 rounded-2xl flex items-start gap-2">
                <Loader2 className="w-4 h-4 text-nm-accent animate-spin shrink-0 mt-0.5" />
                <span className="text-xs text-nm-text-secondary">{t.pending_crypto}</span>
              </div>
            )}

            {/* Plan purchase (always available — buy or extend) */}
            {pricing && (
              <div className="nm-raised p-4 md:p-5">
                <h3 className="font-bold text-nm-text text-sm mb-3">{t.choose_plan}</h3>

                {/* plan kind toggle */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {(["plan3", "plan1"] as const).map((k) => {
                    const active = planKind === k;
                    const label = k === "plan3" ? t.plan_3dev : t.plan_1dev;
                    const pm = (k === "plan3" ? pricing.plan3 : pricing.plan1)[String(term)];
                    return (
                      <button key={k} onClick={() => setPlanKind(k)}
                        className={`p-3 rounded-xl text-left transition-all cursor-pointer ${active ? "nm-btn-accent" : "nm-pressed-sm"}`}>
                        <div className={`text-base font-bold ${active ? "" : "text-nm-text"}`}>{label}</div>
                        <div className={`text-sm mt-0.5 ${active ? "opacity-80" : "text-nm-text-secondary"}`}>${pm?.perMonth.toFixed(2)}{t.per_mo}</div>
                      </button>
                    );
                  })}
                </div>

                {/* term selector */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {([1, 6, 12] as const).map((tm) => {
                    const active = term === tm;
                    const label = tm === 1 ? t.term_1 : tm === 6 ? t.term_6 : t.term_12;
                    const pr = (planKind === "plan3" ? pricing.plan3 : pricing.plan1)[String(tm)];
                    const disc = pr ? Math.round((1 - pr.perMonth / pr.refMonthly) * 100) : 0;
                    return (
                      <button key={tm} onClick={() => setTerm(tm)}
                        className={`relative p-2.5 rounded-xl text-center transition-all cursor-pointer ${active ? "nm-btn-accent" : "nm-pressed-sm"}`}>
                        {tm === 12 && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-nm-accent text-black whitespace-nowrap">{t.best_value}</span>}
                        <div className={`text-base font-bold ${active ? "" : "text-nm-text"}`}>{label}</div>
                        {disc > 0 && <div className={`text-xs mt-0.5 ${active ? "opacity-80" : "text-nm-accent"}`}>-{disc}%</div>}
                      </button>
                    );
                  })}
                </div>

                {/* total + pay */}
                <div className="flex items-baseline justify-between mb-3 px-1">
                  <span className="text-sm text-nm-text-secondary">{t.total_now}</span>
                  <span className="text-3xl font-bold text-nm-text">${selPrice?.total.toFixed(2)}</span>
                </div>
                <button disabled={buying} onClick={handleBuyPlan}
                  className="nm-btn-accent w-full py-3.5 font-semibold text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                  {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <>🪙 {t.pay_crypto}</>}
                </button>
                <p className="text-xs text-nm-text-secondary text-center mt-2">{t.renews_note}</p>
              </div>
            )}

            {/* Active subscriptions */}
            {account && account.subs.length > 0 && (
              <div className="nm-raised p-4 md:p-5">
                <h3 className="font-bold text-nm-text text-sm mb-3">{t.your_subs}</h3>
                <div className="space-y-2">
                  {account.subs.map((s) => (
                    <div key={s.id} className="nm-pressed-sm p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-nm-accent shrink-0" />
                        <span className="text-xs text-nm-text">{subLabel(s.kind)}</span>
                      </div>
                      <span className="text-[11px] text-nm-text-secondary">{t.active_until} {fmtDate(s.expiresAt, lang)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add device add-on */}
            {pricing && (
              <div className="nm-raised p-4 md:p-5">
                <h3 className="font-bold text-nm-text text-sm mb-1">{t.add_device}</h3>
                <p className="text-xs text-nm-text-secondary mb-3">{t.add_device_note}</p>
                <button disabled={buyingDevice} onClick={handleBuyDevice}
                  className="nm-btn w-full py-2.5 text-sm font-medium text-nm-accent flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                  {buyingDevice ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" />{t.buy_device}</>}
                </button>
              </div>
            )}

            {/* Devices */}
            {profiles.map((p, i) => {
              const happEnabled = account?.features?.happEncrypted ?? false;
              const subUrl = p.subToken ? (happEnabled ? `https://kovravpn.com/p/${p.subToken}` : `https://kovravpn.com/api/sub/${p.subToken}`) : "";
              return (
                <div key={p.uuid} className="nm-raised p-4 md:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2"><div className="nm-circle-pressed w-7 h-7 flex items-center justify-center"><Shield className="w-3.5 h-3.5 text-nm-accent" /></div><span className="font-bold text-nm-text text-sm">{devLabel(i)}</span></div>
                    <button onClick={() => handleDelete(p.uuid)} disabled={deletingId === p.uuid} className="nm-btn px-2.5 py-1.5 text-xs text-red-400 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50">{deletingId === p.uuid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}{t.delete}</button>
                  </div>
                  <p className="text-[10px] text-nm-text-secondary mb-2">{t.device_link_note}</p>
                  <div className="nm-pressed p-2.5 rounded-2xl flex items-center gap-2">
                    <code className="flex-1 text-[10px] md:text-[11px] text-nm-accent truncate font-mono min-w-0">{subUrl || "—"}</code>
                    <button onClick={() => subUrl && copyLink(subUrl, p.uuid)} disabled={!subUrl} className="nm-btn w-8 h-8 flex items-center justify-center shrink-0 disabled:opacity-50">{copiedId === p.uuid ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-nm-text-secondary" />}</button>
                  </div>
                  {subUrl && <QrToggle url={subUrl} />}
                </div>
              );
            })}

            {/* Create device */}
            {canCreate && !showDevicePicker && (
              <button onClick={() => handleCreate()} disabled={creating} className="nm-btn-accent w-full py-3.5 font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
                {creating ? <><Loader2 className="w-5 h-5 animate-spin" />{t.creating}</> : <><Plus className="w-5 h-5" />{profiles.length === 0 ? t.connect : t.add_one}</>}
              </button>
            )}

            {showDevicePicker && (
              <div className="nm-raised p-4 md:p-5">
                <h3 className="font-bold text-nm-text text-sm mb-3">📱 {t.pick_device}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {DEVICE_ORDER.map((id) => {
                    const d = DEVICE_DEFS[id];
                    return (
                      <button key={id} onClick={() => handleCreate(id)} disabled={creating}
                        className="nm-btn py-3 px-3 text-sm text-nm-text flex items-center gap-2 cursor-pointer disabled:opacity-50">
                        <span>{d.emoji}</span>{d.name}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setShowDevicePicker(false)} className="text-xs text-nm-text-secondary mt-3 cursor-pointer">{t.cancel}</button>
              </div>
            )}

            {/* Downloads after creation */}
            {lastCreatedDevice && DEVICE_DEFS[lastCreatedDevice] && (
              <div className="nm-raised p-4 md:p-5">
                <p className="text-sm text-nm-text mb-3">📥 {t.download_app_for} <b>{DEVICE_DEFS[lastCreatedDevice].name}</b>:</p>
                <div className="grid grid-cols-2 gap-2">
                  <a href={DEVICE_DEFS[lastCreatedDevice].happ} target="_blank" rel="noopener noreferrer" className="nm-btn-accent py-3 px-4 text-sm font-medium text-center">Happ</a>
                  <a href={DEVICE_DEFS[lastCreatedDevice].v2ray} target="_blank" rel="noopener noreferrer" className="nm-btn py-3 px-4 text-sm font-medium text-nm-accent text-center">V2RayTun</a>
                </div>
                <p className="text-xs text-nm-text-secondary mt-2 text-center">{t.copy_vless_note}</p>
                <button onClick={() => setLastCreatedDevice(null)} className="text-xs text-nm-text-secondary mt-2 cursor-pointer block mx-auto">{t.hide}</button>
              </div>
            )}

            {/* Need slot */}
            {!canCreate && profiles.length >= slots && profiles.length < 100 && (
              <div className="nm-pressed p-5 text-center rounded-2xl">
                <p className="text-sm text-nm-text-secondary mb-1">{t.need_slot}</p>
                <p className="text-xs text-nm-text-secondary">{t.need_slot_note}</p>
              </div>
            )}
            {profiles.length >= 100 && (
              <div className="nm-pressed p-5 text-center rounded-2xl"><p className="text-sm text-nm-text-secondary">{t.max_devices}</p></div>
            )}

            {error && <div className="nm-pressed-sm p-3 rounded-xl flex items-center gap-2 justify-center text-sm text-red-400"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}

            {/* Promo */}
            <div className="nm-raised p-4 md:p-5">
              <h3 className="font-bold text-nm-text text-sm mb-3">🎟 {t.promo_title}</h3>
              <div className="flex gap-2">
                <input type="text" placeholder={t.promo_ph} value={promoCode} onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoMsg(null); }}
                  className="nm-pressed-sm px-3 py-2 text-xs text-nm-text bg-transparent outline-none flex-1" maxLength={32} />
                <button disabled={promoLoading || !promoCode} onClick={async () => {
                  setPromoLoading(true); setPromoMsg(null);
                  try {
                    const r = await fetch("/api/promo/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: promoCode }) });
                    const d = await r.json();
                    if (d.success) { setPromoMsg(`✅ ${t.promo_applied}`); setPromoCode(""); await fetchAccount(); }
                    else setPromoMsg(`❌ ${d.error}`);
                  } catch { setPromoMsg("❌ " + t.err_conn); } finally { setPromoLoading(false); }
                }} className="nm-btn-accent px-4 py-2 text-xs font-medium cursor-pointer disabled:opacity-50">
                  {promoLoading ? "..." : t.promo_ok}
                </button>
              </div>
              {promoMsg && <p className={`text-xs mt-2 ${promoMsg.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>{promoMsg}</p>}
            </div>

            {/* Downloads */}
            <div className="nm-raised p-4 md:p-5">
              <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-nm-text text-sm">Happ</h3><a href="https://www.happ.su/main" target="_blank" rel="noopener noreferrer" className="text-xs text-nm-accent hover:underline">{t.downloads_all} →</a></div>
              <div className="grid grid-cols-2 gap-2">
                <a href="https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />{t.windows}</a>
                <a href="https://play.google.com/store/apps/details?id=com.happproxy" target="_blank" rel="noopener noreferrer" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />{t.android}</a>
                <a href="https://apps.apple.com/us/app/happ-proxy-utility/id6504287215" target="_blank" rel="noopener noreferrer" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />{t.ios_mac}</a>
              </div>
              <div className="flex items-center justify-between mt-4 mb-3"><h3 className="font-bold text-nm-text text-sm">V2RayTun</h3><a href="https://v2raytun.com" target="_blank" rel="noopener noreferrer" className="text-xs text-nm-accent hover:underline">{t.downloads_site} →</a></div>
              <div className="grid grid-cols-2 gap-2">
                <a href="https://storage.v2raytun.com/v2RayTun_Setup.exe" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />{t.windows}</a>
                <a href="https://play.google.com/store/apps/details?id=com.v2raytun.android" target="_blank" rel="noopener noreferrer" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />{t.android_tv}</a>
                <a href="https://apps.apple.com/us/app/v2raytun/id6476628951" target="_blank" rel="noopener noreferrer" className="nm-btn py-2.5 px-3 text-sm text-nm-text flex items-center gap-2"><Download className="w-4 h-4 text-nm-text-secondary shrink-0" />{t.ios_mac}</a>
              </div>
            </div>

            {/* Account linking */}
            {userId && userInfo && (
              <LinkAccounts userId={userId} authMethod={userInfo.authMethod} email={userInfo.email} telegramId={userInfo.telegramId}
                onUpdate={() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.authenticated) setUserInfo({ authMethod: d.authMethod, email: d.email, telegramId: d.telegramId }); }); }} />
            )}

            {/* Referral */}
            {referral && (
              <div className="nm-raised p-4 md:p-5">
                <h3 className="font-bold text-nm-text text-sm mb-3 flex items-center gap-2"><Gift className="w-4 h-4 text-nm-accent" />{t.ref_title}</h3>
                <p className="text-xs text-nm-text-secondary mb-3">{t.ref_note}</p>
                <div className="nm-pressed p-3 rounded-2xl mb-3 cursor-pointer select-none"
                  onClick={() => { navigator.clipboard.writeText(referral.link); setRefCopied(true); setTimeout(() => setRefCopied(false), 2000); }}>
                  <p className="text-[10px] text-nm-text-secondary mb-1">{refCopied ? t.ref_copied : t.ref_click_copy}</p>
                  <code className="text-xs text-nm-text break-all">{referral.link}</code>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="nm-pressed-sm p-2 rounded-xl"><p className="text-lg font-bold text-nm-text">{referral.total}</p><p className="text-[10px] text-nm-text-secondary">{t.ref_invited}</p></div>
                  <div className="nm-pressed-sm p-2 rounded-xl"><p className="text-lg font-bold text-nm-text">{referral.rewarded}</p><p className="text-[10px] text-nm-text-secondary">{t.ref_paid}</p></div>
                  <div className="nm-pressed-sm p-2 rounded-xl"><p className="text-lg font-bold text-nm-accent">{referral.rewarded * 14}</p><p className="text-[10px] text-nm-text-secondary">{t.ref_days_earned}</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "help" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="nm-raised p-6 flex flex-col">
              <h3 className="font-bold text-nm-text mb-2">{t.guide}</h3>
              <p className="text-sm text-nm-text-secondary mb-4 flex-1">{t.guide_note}</p>
              <a href="/guide" target="_blank" rel="noopener noreferrer" className="nm-btn-accent w-full py-3 text-sm font-medium flex items-center justify-center gap-2">{t.open}<ExternalLink className="w-4 h-4" /></a>
            </div>
            <div className="nm-raised p-6 flex flex-col">
              <h3 className="font-bold text-nm-text mb-2">{t.support}</h3>
              <p className="text-sm text-nm-text-secondary mb-4 flex-1">{t.support_note}</p>
              <a href="https://t.me/KovraVPN_bot" target="_blank" rel="noopener noreferrer" className="nm-btn w-full py-3 text-sm font-medium text-nm-text flex items-center justify-center gap-2">{t.write}<ExternalLink className="w-4 h-4" /></a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

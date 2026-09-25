// src/app/dashboard/page.tsx
//
// The personal dashboard. This file owns all state, data loading and the
// request handlers (URLs, payloads, trackEvent calls and redirects are
// unchanged); the views in src/components/dashboard/* are presentational.
//
// Views (hash-routed, see useDashView): #devices (home), #plan, #rewards,
// #account (#help scrolls to the Help panel).
"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { trackEvent, stripQueryParam } from "@/lib/attribution";
import { useDashLang } from "@/lib/dash-i18n";
import type { LavaCurrency, LavaMethodId } from "@/lib/lava-methods";
import { Button, CabinetRoot, ConfirmDialog, Notice, cx, readJson, useDocumentTitle } from "@/components/cabinet";
import { fmt } from "@/lib/cabinet-lang";
import { copyText } from "@/lib/clipboard";
import { useShellT } from "@/lib/i18n-shell";
import { DEVICE_DEFS, isDeviceId, type DeviceId } from "@/lib/dashboard/devices";
import { dashError } from "@/lib/dashboard/errors";
import { daysLeft, fmtDate, heroState } from "@/lib/dashboard/format";
import type { PayRoute } from "@/lib/dashboard/pay-methods";
import type { AccountData, PlanKind, Pricing, Profile, ReferralData, SubItem, Term } from "@/lib/dashboard/types";
import { AccountView, type UserInfo } from "@/components/dashboard/AccountView";
import { AppsSection } from "@/components/dashboard/AppsSection";
import { BottomNav } from "@/components/dashboard/BottomNav";
import { DashHeader } from "@/components/dashboard/DashHeader";
import { DashSkeleton } from "@/components/dashboard/DashSkeleton";
import { DevicesSection } from "@/components/dashboard/DevicesSection";
import { ExtraSlotDialog } from "@/components/dashboard/ExtraSlotDialog";
import { PaymentReturnNotice } from "@/components/dashboard/PaymentReturnNotice";
import { PlanView } from "@/components/dashboard/PlanView";
import { RewardsView, type PromoMsg } from "@/components/dashboard/RewardsView";
import { StatusHero } from "@/components/dashboard/StatusHero";
import { FirstVisitProvider } from "@/components/dashboard/shared";
import { useDashView, type DashView } from "@/components/dashboard/useDashView";
import "./dashboard.css";

/** After ?paid=1, a subscription created this long before the page opened counts as the payment. */
const PAID_RECENT_MS = 30 * 60 * 1000;
/** sessionStorage key: the plan as it was when the user left for a payment page. */
const PAID_BASE_KEY = "kovra_paid_base";
/** A stored baseline older than this is ignored (a payment abandoned long ago). */
const PAID_BASE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type PaidBaseline = { maxExpiry: number; activeSlots: number };

/** Remembers the plan before leaving for a payment page, so a renewal (which
 *  extends an existing subscription and keeps its createdAt) is recognised on
 *  return even when the webhook landed before the first load. */
function savePaidBaseline(base: PaidBaseline | null): void {
  try {
    // Unknown plan (account not loaded): drop any older baseline rather than keep a wrong one.
    if (base === null) sessionStorage.removeItem(PAID_BASE_KEY);
    else sessionStorage.setItem(PAID_BASE_KEY, JSON.stringify({ ...base, at: Date.now() }));
  } catch {
    // Storage blocked: the first load after the return serves as the baseline.
  }
}

/** Reads and clears the stored baseline; null when missing, stale or malformed. */
function takePaidBaseline(): PaidBaseline | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PAID_BASE_KEY);
    sessionStorage.removeItem(PAID_BASE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { maxExpiry, activeSlots, at } = v as Record<string, unknown>;
    if (typeof maxExpiry !== "number" || !Number.isFinite(maxExpiry)) return null;
    if (typeof activeSlots !== "number" || !Number.isFinite(activeSlots)) return null;
    if (typeof at !== "number" || !(Date.now() - at < PAID_BASE_MAX_AGE_MS)) return null;
    return { maxExpiry, activeSlots };
  } catch {
    return null;
  }
}

// ── Dev-only mock (design preview without Redis): NEXT_PUBLIC_DASH_MOCK=1 ──
const MOCK = process.env.NEXT_PUBLIC_DASH_MOCK === "1" && process.env.NODE_ENV !== "production";
const MOCK_NOW = 1783000000000;
const MOCK_ACCOUNT: AccountData = {
  plan: "plan3", activeSlots: 3, hasActive: true,
  maxExpiry: MOCK_NOW + 186 * 864e5, nextExpiry: MOCK_NOW + 186 * 864e5,
  daysRemaining: 186, devices: 2,
  subs: [{ id: "sub_demo1", kind: "plan3", slots: 3, createdAt: MOCK_NOW - 30 * 864e5, expiresAt: MOCK_NOW + 186 * 864e5 }],
  features: { happEncrypted: true },
};
const MOCK_PRICING: Pricing = {
  plan1: { "1": { term: 1, total: 5, perMonth: 5, refMonthly: 5 }, "6": { term: 6, total: 22.5, perMonth: 3.75, refMonthly: 5 }, "12": { term: 12, total: 33, perMonth: 2.75, refMonthly: 5 } },
  plan3: { "1": { term: 1, total: 11.99, perMonth: 11.99, refMonthly: 11.99 }, "6": { term: 6, total: 53.94, perMonth: 8.99, refMonthly: 11.99 }, "12": { term: 12, total: 79.08, perMonth: 6.59, refMonthly: 11.99 } },
  plan1Slots: 1, plan3Slots: 3, deviceAddonPrice: 5, deviceAddonDays: 30,
  // show the full method catalog in the preview (lava.top configured)
  lavaEnabled: true,
};
const MOCK_PROFILES: Profile[] = [
  { uuid: "6f9c2d54-demo-4a1b-9c1e-aaaaaaaaaaaa", clientEmail: "vpn_web_demo_1", vlessUrl: "vless://demo@nl.kovravpn.com:443?security=reality&sni=example.com#Kovra-NL", createdAt: MOCK_NOW - 20 * 864e5, deviceType: "iphone", subToken: "demoToken1" },
  { uuid: "1b2e7c10-demo-4f00-8d2a-bbbbbbbbbbbb", clientEmail: "vpn_web_demo_2", vlessUrl: "vless://demo@de.kovravpn.com:443?security=reality&sni=example.com#Kovra-DE", createdAt: MOCK_NOW - 5 * 864e5, deviceType: "android", subToken: "demoToken2" },
];
const MOCK_REFERRAL: ReferralData = { code: "45288149", link: "https://kovravpn.com/register?ref=45288149", botLink: "https://t.me/kovravpn_bot?start=45288149", total: 3, rewarded: 1, pending: 2 };

/**
 * Dev-only variants for the design preview (?mockState=…, read only when
 * MOCK is on): new|none = no plan and no devices; expiring = 5 days left;
 * expired = plan ended 3 days ago; full = 3 of 3 devices; fresh = active
 * plan without devices.
 */
function mockData(state: string | null): { account: AccountData; profiles: Profile[] } {
  const sub = MOCK_ACCOUNT.subs[0];
  switch (state) {
    case "new":
    case "none":
      return {
        account: { plan: "free", activeSlots: 0, hasActive: false, maxExpiry: 0, nextExpiry: 0, daysRemaining: 0, devices: 0, subs: [], features: { happEncrypted: true } },
        profiles: [],
      };
    case "expiring": {
      const exp = Date.now() + 5 * 864e5;
      return { account: { ...MOCK_ACCOUNT, maxExpiry: exp, nextExpiry: exp, daysRemaining: 5, subs: [{ ...sub, expiresAt: exp }] }, profiles: MOCK_PROFILES };
    }
    case "expired": {
      const exp = Date.now() - 3 * 864e5;
      return {
        account: { ...MOCK_ACCOUNT, plan: "free", activeSlots: 0, hasActive: false, maxExpiry: exp, nextExpiry: 0, daysRemaining: 0, subs: [{ ...sub, expiresAt: exp }] },
        profiles: MOCK_PROFILES,
      };
    }
    case "fresh":
      return { account: { ...MOCK_ACCOUNT, devices: 0 }, profiles: [] };
    case "full":
      return {
        account: { ...MOCK_ACCOUNT, devices: 3 },
        profiles: [
          ...MOCK_PROFILES,
          { uuid: "9d3f4a21-demo-4c3d-8e5f-cccccccccccc", clientEmail: "vpn_web_demo_3", vlessUrl: "vless://demo@uk.kovravpn.com:443?security=reality&sni=example.com#Kovra-UK", createdAt: MOCK_NOW - 2 * 864e5, deviceType: "mac", subToken: "demoToken3" },
        ],
      };
    default:
      return { account: MOCK_ACCOUNT, profiles: MOCK_PROFILES };
  }
}

/** Mounts once per view switch: rise-in on the first visit, a quick fade after. */
function ViewFrame({ view, firstVisit, onVisit, children }: { view: DashView; firstVisit: boolean; onVisit(v: DashView): void; children: ReactNode }) {
  const [first] = useState(firstVisit);
  useEffect(() => {
    onVisit(view);
  }, [view, onVisit]);
  return (
    <FirstVisitProvider value={first}>
      <div className={cx("kc-view", `kc-view--${view}`, !first && "kc-enter")}>{children}</div>
    </FirstVisitProvider>
  );
}

export default function DashboardPage() {
  const { lang, t } = useDashLang();
  const shell = useShellT();
  useDocumentTitle(fmt("{t} | Kovra", { t: t.page_title }));

  const [userId, setUserId] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // purchase UI
  const [planKind, setPlanKind] = useState<PlanKind>("plan3");
  const [term, setTerm] = useState<Term>(12);
  const [buying, setBuying] = useState(false);
  const [buyingDevice, setBuyingDevice] = useState(false);
  const [buyingCard, setBuyingCard] = useState(false);
  const [buyingAlt, setBuyingAlt] = useState(false);
  const [buyingAltDevice, setBuyingAltDevice] = useState(false);
  // Какая именно кнопка lava.top сейчас крутится. Не булево: способов
  // несколько, и крутиться должен только нажатый.
  const [buyingLava, setBuyingLava] = useState<string | null>(null);
  const [buyingCardDevice, setBuyingCardDevice] = useState(false);
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);

  // device create
  const [creating, setCreating] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [lastCreatedDevice, setLastCreatedDevice] = useState<string | null>(null);
  const [pendingDevice, setPendingDevice] = useState<DeviceId | null>(null);

  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoMsg, setPromoMsg] = useState<PromoMsg | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetDoneId, setResetDoneId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ uuid: string; name: string } | null>(null);

  // errors, one per section
  const [planError, setPlanError] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<Record<string, string>>({});

  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [cryptoPending, setCryptoPending] = useState(false);
  const [paidBaseline, setPaidBaseline] = useState<PaidBaseline | null>(null);
  // When the dashboard opened: a subscription created within 30 minutes before
  // it counts as the payment the user is returning from.
  const [mountTs] = useState(() => Date.now());
  const [visited, setVisited] = useState<ReadonlySet<DashView>>(() => new Set<DashView>());
  const devicesHeadingRef = useRef<HTMLHeadingElement>(null);

  /** Server error -> UI text; `fallback` when the response carries no error. */
  const errText = (raw: unknown, status: number, fallback: string) => dashError(raw, status, lang, t, fallback);
  const setDeviceErr = (uuid: string, msg: string | null) =>
    setDeviceError((prev) => {
      const next = { ...prev };
      if (msg) next[uuid] = msg;
      else delete next[uuid];
      return next;
    });

  // return-from-payment detection
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("paid") === "1") {
      trackEvent("payment_initiated", { type: "plan", method: "crypto_return" });
      setCryptoPending(true);
      const stored = takePaidBaseline();
      if (stored) setPaidBaseline(stored);
      stripQueryParam("paid");
    }
  }, []);

  // current user
  useEffect(() => {
    if (MOCK) {
      setUserId("mock-user");
      setUserInfo({ authMethod: "email", email: "demo@kovravpn.com" });
      return;
    }
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

  const [profiles, setProfiles] = useState<Profile[]>([]);

  const fetchAccount = useCallback(async () => {
    if (!userId) return;
    if (MOCK) {
      const m = mockData(new URLSearchParams(window.location.search).get("mockState"));
      setAccount(m.account);
      setPricing(MOCK_PRICING);
      setProfiles(m.profiles);
      setLoadError(false);
      setLoading(false);
      return;
    }
    try {
      const r = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
      if (!r.ok) { setLoadError(true); return; }
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
      setLoadError(false);
    } catch { setLoadError(true); } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { if (userId) fetchAccount(); }, [userId, fetchAccount]);

  useEffect(() => {
    if (!userId) return;
    if (MOCK) { setReferral(MOCK_REFERRAL); return; }
    fetch("/api/referral").then((r) => r.json()).then((d) => { if (d.code) setReferral(d); }).catch(() => {});
  }, [userId]);

  // Renewal mode: lock the plan tier to the user's currently active plan.
  useEffect(() => {
    const n = Date.now();
    const subs = account?.subs || [];
    const ak = subs.some((x) => x.kind === "plan3" && x.expiresAt > n) ? "plan3"
      : subs.some((x) => x.kind === "plan1" && x.expiresAt > n) ? "plan1" : null;
    if (ak) setPlanKind(ak as "plan1" | "plan3");
  }, [account]);

  // ?paid=1: done once a purchased subscription from the last 30 minutes is on the
  // account (card webhooks usually land before the redirect back), or once the
  // plan differs from the baseline: the one saved before leaving for the payment
  // page (a renewal keeps its createdAt), else the first load here; until then, poll.
  if (cryptoPending && account && paidBaseline === null) {
    setPaidBaseline({ maxExpiry: account.maxExpiry, activeSlots: account.activeSlots });
  }
  const recentPaid =
    cryptoPending && account !== null && account.subs.some((x) => x.kind !== "referral" && x.createdAt > mountTs - PAID_RECENT_MS);
  const paidDone =
    recentPaid ||
    (cryptoPending && paidBaseline !== null && account !== null &&
      (account.maxExpiry !== paidBaseline.maxExpiry || account.activeSlots !== paidBaseline.activeSlots));

  useEffect(() => {
    if (MOCK || !cryptoPending || paidDone || !userId) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      if (Date.now() - started > 30 * 60 * 1000) { window.clearInterval(id); return; }
      void fetchAccount();
    }, 15000);
    return () => window.clearInterval(id);
  }, [cryptoPending, paidDone, userId, fetchAccount]);

  const handleBuyPlan = async () => {
    setBuying(true); setPlanError(null);
    try {
      const r = await fetch("/api/platega/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: planKind, term, method: "card" }) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "plan", method: "card", provider: "platega", kind: planKind, term });
        window.location.href = d.paymentUrl;
      } else setPlanError(errText(d.error, r.status, t.err_pay));
    } catch { setPlanError(t.err_conn); } finally { setBuying(false); }
  };

  const handleBuyDevice = async () => {
    setBuyingDevice(true); setSlotError(null);
    try {
      const r = await fetch("/api/platega/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "device", method: "card" }) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "device", method: "card", provider: "platega" });
        window.location.href = d.paymentUrl;
      } else setSlotError(errText(d.error, r.status, t.err_pay));
    } catch { setSlotError(t.err_conn); } finally { setBuyingDevice(false); }
  };

  const handleBuyPlanCard = async () => {
    setBuyingCard(true); setPlanError(null);
    try {
      const r = await fetch("/api/cashera/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: planKind, term }) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "plan", method: "card", provider: "cashera", kind: planKind, term });
        window.location.href = d.paymentUrl;
      } else setPlanError(errText(d.error, r.status, t.err_pay));
    } catch { setPlanError(t.err_conn); } finally { setBuyingCard(false); }
  };

  const handleBuyDeviceCard = async () => {
    setBuyingCardDevice(true); setSlotError(null);
    try {
      const r = await fetch("/api/cashera/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "device" }) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "device", method: "card", provider: "cashera" });
        window.location.href = d.paymentUrl;
      } else setSlotError(errText(d.error, r.status, t.err_pay));
    } catch { setSlotError(t.err_conn); } finally { setBuyingCardDevice(false); }
  };

  // Alternative crypto rail (NOWPayments) — kept as the third option.
  const handleBuyPlanAlt = async () => {
    setBuyingAlt(true); setPlanError(null);
    try {
      const r = await fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: planKind, term }) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "plan", method: "crypto", provider: "nowpayments", kind: planKind, term });
        window.location.href = d.paymentUrl;
      } else setPlanError(errText(d.error, r.status, t.err_pay));
    } catch { setPlanError(t.err_conn); } finally { setBuyingAlt(false); }
  };

  const handleBuyDeviceAlt = async () => {
    setBuyingAltDevice(true); setSlotError(null);
    try {
      const r = await fetch("/api/subscribe/device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "device", method: "crypto", provider: "nowpayments" });
        window.location.href = d.paymentUrl;
      } else setSlotError(errText(d.error, r.status, t.err_pay));
    } catch { setSlotError(t.err_conn); } finally { setBuyingAltDevice(false); }
  };

  // lava.top — единственный способ заплатить из-за рубежа не криптовалютой.
  // Способ и валюта уходят вместе: лава показывает покупателю ровно один
  // способ на счёт, а подпись на кнопке обязана совпасть со списанием.
  const handleBuyLava = async (
    body: Record<string, unknown>,
    id: LavaMethodId,
    currency: LavaCurrency,
    tag: string,
  ) => {
    const setError = tag.startsWith("device:") ? setSlotError : setPlanError;
    setBuyingLava(tag); setError(null);
    try {
      const r = await fetch("/api/subscribe/lava", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, method: id, currency }),
      });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { ...body, method: id, currency, provider: "lava" });
        window.location.href = d.paymentUrl;
      } else setError(errText(d.error, r.status, t.err_pay));
    } catch { setError(t.err_conn); } finally { setBuyingLava(null); }
  };

  // Runs after the user confirms in the reset dialog.
  const handleResetHwid = async (uuid: string) => {
    setResettingId(uuid); setDeviceErr(uuid, null);
    try {
      if (MOCK) { await new Promise((r) => setTimeout(r, 500)); }
      else {
        const r = await fetch("/api/vpn/reset-hwid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uuid }) });
        const d = await r.json();
        if (!d.success) { setDeviceErr(uuid, errText(d.error, r.status, t.err_conn)); return; }
      }
      trackEvent("reset_hwid", { uuid });
      setResetDoneId(uuid);
      setTimeout(() => setResetDoneId((cur) => (cur === uuid ? null : cur)), 4000);
    } catch { setDeviceErr(uuid, t.err_conn); } finally { setResettingId(null); }
  };

  const handleCreate = async (device?: string) => {
    if (!device) { setShowDevicePicker(true); return; }
    setShowDevicePicker(false);
    setCreating(true); setCreateError(null); setLastCreatedDevice(null);
    try {
      const r = await fetch("/api/vpn/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, deviceType: device }) });
      const d = await r.json();
      if (d.success) { setLastCreatedDevice(device); await fetchAccount(); }
      else setCreateError(errText(d.error, r.status, t.err_generic));
    } catch { setCreateError(t.err_conn); } finally { setCreating(false); }
  };

  // Runs after the user confirms in the delete dialog. Returns true on success.
  const handleDelete = async (uuid: string): Promise<boolean> => {
    setDeletingId(uuid); setDeviceErr(uuid, null);
    let ok = false;
    try {
      const r = await fetch("/api/vpn/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, uuid }) });
      const d = await readJson(r);
      if (!r.ok || typeof d.error === "string") setDeviceErr(uuid, errText(d.error, r.status, t.err_generic));
      else ok = true;
      await fetchAccount();
    } catch { setDeviceErr(uuid, t.err_conn); } finally { setDeletingId(null); }
    return ok;
  };

  const copyLink = async (url: string, uuid: string) => {
    const ok = await copyText(url);
    if (!ok) return;
    setCopiedId(uuid);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLogout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    window.location.href = "/login";
  };

  const handlePromo = async () => {
    setPromoLoading(true); setPromoMsg(null);
    try {
      const r = await fetch("/api/promo/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: promoCode }) });
      const d = await r.json();
      if (d.success) { setPromoMsg({ kind: "ok", text: t.promo_applied }); setPromoCode(""); await fetchAccount(); }
      else setPromoMsg({ kind: "err", text: errText(d.error, r.status, t.err_generic) });
    } catch { setPromoMsg({ kind: "err", text: t.err_conn }); } finally { setPromoLoading(false); }
  };

  const refreshUser = () => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.authenticated) setUserInfo({ authMethod: d.authMethod, email: d.email, telegramId: d.telegramId }); })
      .catch(() => {});
  };

  // ── derived ──
  const slots = account?.activeSlots || 0;
  const canCreate = profiles.length < 100 && profiles.length < slots;
  const happEnabled = account?.features?.happEncrypted ?? false;

  const nowTs = Date.now();
  const activePlanKind: PlanKind | null =
    (account?.subs || []).some((x) => x.kind === "plan3" && x.expiresAt > nowTs) ? "plan3"
    : (account?.subs || []).some((x) => x.kind === "plan1" && x.expiresAt > nowTs) ? "plan1"
    : null;
  const isRenewal = activePlanKind !== null;
  const effectiveKind: PlanKind = isRenewal && activePlanKind ? activePlanKind : planKind;
  const lastPlan: SubItem | undefined = (account?.subs || [])
    .filter((s) => s.kind === "plan1" || s.kind === "plan3")
    .sort((a, b) => b.expiresAt - a.expiresAt)[0];
  const labelKind = activePlanKind ?? lastPlan?.kind ?? null;
  const planLabel = labelKind === "plan3" ? t.sub_plan3 : labelKind === "plan1" ? t.sub_plan1 : null;

  const hState = heroState(account, nowTs);
  const heroGold = hState !== "active";

  const devLabel = (i: number) => {
    const ty = profiles[i]?.deviceType || "";
    const base = isDeviceId(ty) ? t[DEVICE_DEFS[ty].nameKey] : t.dev_fallback;
    const same = profiles.filter((p) => (p.deviceType || "") === ty);
    return same.length > 1 ? `${base} ${profiles.slice(0, i).filter((p) => (p.deviceType || "") === ty).length + 1}` : base;
  };
  const subUrlOf = (p: Profile) =>
    p.subToken ? (happEnabled ? `https://kovravpn.com/p/${p.subToken}` : `https://kovravpn.com/api/sub/${p.subToken}`) : "";

  const payBusy = buying || buyingCard || buyingAlt || buyingDevice || buyingCardDevice || buyingAltDevice || buyingLava !== null;

  const rememberPaidBaseline = () =>
    savePaidBaseline(account ? { maxExpiry: account.maxExpiry, activeSlots: account.activeSlots } : null);
  const payPlan = (route: PayRoute) => {
    rememberPaidBaseline();
    switch (route.kind) {
      case "platega": return void handleBuyPlan();
      case "cashera": return void handleBuyPlanCard();
      case "nowpayments": return void handleBuyPlanAlt();
      case "lava": return void handleBuyLava({ what: "plan", kind: effectiveKind, term }, route.id, route.currency, `plan:${route.id}`);
    }
  };
  const paySlot = (route: PayRoute) => {
    rememberPaidBaseline();
    switch (route.kind) {
      case "platega": return void handleBuyDevice();
      case "cashera": return void handleBuyDeviceCard();
      case "nowpayments": return void handleBuyDeviceAlt();
      case "lava": return void handleBuyLava({ what: "device" }, route.id, route.currency, `device:${route.id}`);
    }
  };
  const planLoading = (route: PayRoute) =>
    route.kind === "platega" ? buying : route.kind === "cashera" ? buyingCard : route.kind === "nowpayments" ? buyingAlt : buyingLava === `plan:${route.id}`;
  const slotLoading = (route: PayRoute) =>
    route.kind === "platega" ? buyingDevice : route.kind === "cashera" ? buyingCardDevice : route.kind === "nowpayments" ? buyingAltDevice : buyingLava === `device:${route.id}`;

  const fallbackView: DashView | null = loading ? null : loadError && !account ? "devices" : account?.hasActive || profiles.length > 0 ? "devices" : "plan";
  const { view, navigate } = useDashView(!loading, fallbackView);
  const onVisit = useCallback((v: DashView) => setVisited((prev) => (prev.has(v) ? prev : new Set(prev).add(v))), []);

  const identity = userInfo?.email
    ? { label: userInfo.email, initial: userInfo.email.trim().charAt(0).toUpperCase() || null }
    : userInfo?.telegramId
      ? { label: fmt(t.tg_id, { id: userInfo.telegramId }), initial: null }
      : null;

  const openSlotDialog = () => { setSlotError(null); setSlotDialogOpen(true); };

  let content: ReactNode = null;
  if (view === "devices") {
    content = (
      <>
        <StatusHero
          t={t}
          lang={lang}
          state={hState}
          planLabel={planLabel}
          days={account ? daysLeft(account, nowTs) : 0}
          date={fmtDate(account?.maxExpiry ?? 0, lang)}
          used={profiles.length}
          total={slots}
          onNavigate={navigate}
        />
        <DevicesSection
          t={t}
          lang={lang}
          index={1}
          profiles={profiles}
          slots={slots}
          canCreate={canCreate}
          happEncrypted={happEnabled}
          showPicker={showDevicePicker}
          creating={creating}
          pendingDevice={pendingDevice}
          lastCreatedDevice={lastCreatedDevice}
          goldSetup={!heroGold}
          resetDoneId={resetDoneId}
          deviceError={deviceError}
          createError={createError}
          copiedId={copiedId}
          headingRef={devicesHeadingRef}
          devLabel={devLabel}
          subUrlOf={subUrlOf}
          onStartSetup={() => void handleCreate()}
          onPick={(id) => { setPendingDevice(id); void handleCreate(id); }}
          onCancelPick={() => setShowDevicePicker(false)}
          onRequestReset={(uuid) => setConfirmReset(uuid)}
          onRequestDelete={(uuid) => setConfirmDelete({ uuid, name: devLabel(profiles.findIndex((p) => p.uuid === uuid)) })}
          onDismissDeviceError={(uuid) => setDeviceErr(uuid, null)}
          onDismissCreateError={() => setCreateError(null)}
          onCopyLink={(url, uuid) => void copyLink(url, uuid)}
          onSetupDone={() => setLastCreatedDevice(null)}
          onBuySlot={openSlotDialog}
        />
        <AppsSection t={t} index={2} />
      </>
    );
  } else if (view === "plan") {
    content = (
      <PlanView
        t={t}
        lang={lang}
        pricing={pricing}
        account={account}
        isRenewal={isRenewal}
        effectiveKind={effectiveKind}
        planKind={planKind}
        term={term}
        onPlanKind={setPlanKind}
        onTerm={setTerm}
        busy={payBusy}
        isLoading={planLoading}
        onPay={payPlan}
        planError={planError}
        onDismissPlanError={() => setPlanError(null)}
        onBuySlot={openSlotDialog}
      />
    );
  } else if (view === "rewards") {
    content = (
      <RewardsView
        t={t}
        referral={referral}
        promoCode={promoCode}
        onPromoCode={(v) => { setPromoCode(v.toUpperCase()); setPromoMsg(null); }}
        promoLoading={promoLoading}
        promoMsg={promoMsg}
        onApplyPromo={() => void handlePromo()}
      />
    );
  } else if (view === "account") {
    content = <AccountView t={t} userId={userId} userInfo={userInfo} onUserUpdate={refreshUser} onLogout={() => void handleLogout()} />;
  }

  return (
    <CabinetRoot variant="dash">
      <DashHeader t={t} view={view} identity={identity} onNavigate={navigate} onLogout={() => void handleLogout()} />
      <main id="kc-main" tabIndex={-1} className="kc-dash-main" aria-busy={loading || undefined}>
        <div className="kc-dash-wrap">
          {cryptoPending ? (
            <PaymentReturnNotice t={t} done={paidDone} dismissLabel={shell.dismiss} onDismiss={() => setCryptoPending(false)} />
          ) : null}
          {loadError ? (
            <Notice
              tone="error"
              className="kc-load-error"
              action={
                <Button variant="ghost" size="sm" onClick={() => void fetchAccount()}>
                  {shell.retry}
                </Button>
              }
            >
              {t.load_failed}
            </Notice>
          ) : null}
          {loading || !view ? (
            <DashSkeleton label={t.loading_account} />
          ) : loadError && !account ? null : (
            <ViewFrame key={view} view={view} firstVisit={!visited.has(view)} onVisit={onVisit}>
              {content}
            </ViewFrame>
          )}
        </div>
      </main>
      <BottomNav t={t} view={view} onNavigate={navigate} />

      <ConfirmDialog
        open={confirmReset !== null}
        title={t.reset_title}
        body={t.reset_hwid_note}
        confirmLabel={t.reset_confirm}
        cancelLabel={t.cancel}
        busy={resettingId !== null}
        onConfirm={async () => {
          if (!confirmReset) return;
          await handleResetHwid(confirmReset);
          setConfirmReset(null);
        }}
        onCancel={() => setConfirmReset(null)}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        tone="danger"
        title={fmt(t.delete_title, { name: confirmDelete?.name ?? t.dev_fallback })}
        body={t.delete_body}
        confirmLabel={t.delete_device}
        cancelLabel={t.cancel}
        busy={deletingId !== null}
        onConfirm={async () => {
          if (!confirmDelete) return;
          const ok = await handleDelete(confirmDelete.uuid);
          setConfirmDelete(null);
          // The card (and its menu button) is gone: land on the section heading.
          if (ok) window.setTimeout(() => devicesHeadingRef.current?.focus({ preventScroll: true }), 60);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
      {pricing ? (
        <ExtraSlotDialog
          open={slotDialogOpen}
          onClose={() => setSlotDialogOpen(false)}
          t={t}
          lang={lang}
          price={pricing.deviceAddonPrice}
          days={pricing.deviceAddonDays}
          lavaEnabled={pricing.lavaEnabled}
          busy={payBusy}
          isLoading={slotLoading}
          onPay={paySlot}
          error={slotError}
          onDismissError={() => setSlotError(null)}
        />
      ) : null}
    </CabinetRoot>
  );
}

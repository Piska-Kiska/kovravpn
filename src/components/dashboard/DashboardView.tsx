// src/components/dashboard/DashboardView.tsx
//
// The personal dashboard, on the site (/dashboard) and inside the Telegram
// Mini App (/tg). This file owns all state, data loading and the request
// handlers; the views in src/components/dashboard/* are presentational. What
// differs between the two places comes from the `host` (host.ts): where a
// payment page opens, what happens when the session is lost, Telegram's back
// arrow and haptics.
//
// Views (hash-routed, see useDashView): #devices (home), #plan, #rewards,
// #account (#help scrolls to the Help panel). `?view=<view>` or `?view=topup`
// opens a view (or the top-up sheet) once, for entry points like the bot's
// buttons.
//
// The unified balance: the bot's USD wallet (integer cents) is shown and
// spent here too. "Pay from balance" calls /api/wallet/purchase with a request
// id that is kept until the purchase succeeds (lib/dashboard/wallet.ts), and
// "Top up" creates an invoice with /api/wallet/topup.
"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { trackEvent } from "@/lib/attribution";
import { useDashLang } from "@/lib/dash-i18n";
import type { LavaCurrency, LavaMethodId } from "@/lib/lava-methods";
import {
  BackStackProvider,
  Button,
  CabinetRoot,
  ConfirmDialog,
  Notice,
  createBackStack,
  cx,
  readJson,
  useBackStackSize,
  useDocumentTitle,
} from "@/components/cabinet";
import { statusTone, type AccountStatus, type Identity } from "@/components/chrome";
import { fmt, plural, type Lang } from "@/lib/cabinet-lang";
import { copyText } from "@/lib/clipboard";
import { useShellT } from "@/lib/i18n-shell";
import { DEVICE_DEFS, isDeviceId, type DeviceId } from "@/lib/dashboard/devices";
import { dashError } from "@/lib/dashboard/errors";
import { daysLeft, fmtDate, fmtMoney, heroState } from "@/lib/dashboard/format";
import type { PayRoute, TopupMethodInfo, TopupRoute } from "@/lib/dashboard/pay-methods";
import type { AccountData, PlanKind, Pricing, Profile, ReferralData, SubItem, Term } from "@/lib/dashboard/types";
import {
  clearRequestId,
  keepsRequestId,
  purchaseOutcome,
  requestIdFor,
  type KeyValueStore,
  type PurchaseOutcome,
  type WalletProduct,
} from "@/lib/dashboard/wallet";
import {
  PAID_BASE_KEY,
  PAID_POLL_MAX_MS,
  PAID_RECENT_MS,
  detectPaid,
  isPaidReturnValue,
  parseBaseline,
  serializeBaseline,
  type PaidBaseline,
  type PaidKind,
} from "@/lib/payment-return";
import { AccountView, type UserInfo } from "./AccountView";
import { AppsSection } from "./AppsSection";
import { BottomNav } from "./BottomNav";
import { DashHeader } from "./DashHeader";
import { DashSkeleton } from "./DashSkeleton";
import { DevicesSection } from "./DevicesSection";
import { ExtraSlotDialog } from "./ExtraSlotDialog";
import { MiniAppBar } from "./MiniAppBar";
import { PaymentReturnNotice } from "./PaymentReturnNotice";
import { PlanView } from "./PlanView";
import { RewardsView, type PromoMsg } from "./RewardsView";
import { StatusHero } from "./StatusHero";
import { TopupDialog, type TopupConfig } from "./TopupDialog";
import { WalletChip, fmtCents } from "./WalletPanel";
import { WEB_HOST, type DashHost } from "./host";
import { FirstVisitProvider } from "./shared";
import { isDashView, replaceDashUrl, useDashView, type DashView } from "./useDashView";
import "@/app/dashboard/dashboard.css";

/** Poll the account this often while a payment is being checked. */
const PAID_POLL_MS = 15_000;

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sessionStore(): KeyValueStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Remembers the plan and the balance before leaving for a payment page. */
function saveBaseline(base: PaidBaseline | null): void {
  const s = localStore();
  try {
    // Unknown plan (account not loaded): drop an older baseline rather than keep a wrong one.
    if (base === null) s?.removeItem(PAID_BASE_KEY);
    else s?.setItem(PAID_BASE_KEY, serializeBaseline(base, Date.now()));
  } catch {
    // Storage blocked: the first load after the return serves as the baseline.
  }
}

/** Reads and clears the stored baseline; null when missing, stale or malformed. */
function takeBaseline(): PaidBaseline | null {
  const s = localStore();
  let raw: string | null = null;
  try {
    raw = s?.getItem(PAID_BASE_KEY) ?? null;
    s?.removeItem(PAID_BASE_KEY);
  } catch {
    return null;
  }
  return parseBaseline(raw, Date.now());
}

interface WalletState {
  balanceCents: number;
  topup: TopupConfig;
}

const TOPUP_IDS: readonly TopupMethodInfo["id"][] = ["card", "cryptobot", "crypto", "lava"];

/** `wallet` of /api/account; null when absent (an older deployment) or malformed. */
function parseWallet(v: unknown): WalletState | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as { balanceUsdCents?: unknown; topup?: unknown };
  if (typeof o.balanceUsdCents !== "number" || !Number.isFinite(o.balanceUsdCents)) return null;
  const tp = (typeof o.topup === "object" && o.topup !== null ? o.topup : {}) as { methods?: unknown; maxUsd?: unknown; quickUsd?: unknown };
  const methods: TopupMethodInfo[] = Array.isArray(tp.methods)
    ? tp.methods.flatMap((m: unknown) => {
        if (typeof m !== "object" || m === null) return [];
        const x = m as { id?: unknown; minUsd?: unknown; enabled?: unknown };
        const id = TOPUP_IDS.find((k) => k === x.id);
        if (!id || typeof x.minUsd !== "number" || !Number.isFinite(x.minUsd)) return [];
        return [{ id, minUsd: x.minUsd, enabled: x.enabled === true }];
      })
    : [];
  const maxUsd = typeof tp.maxUsd === "number" && Number.isFinite(tp.maxUsd) && tp.maxUsd > 0 ? tp.maxUsd : 1000;
  const quickUsd = Array.isArray(tp.quickUsd)
    ? tp.quickUsd.filter((n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= maxUsd)
    : [];
  return {
    balanceCents: Math.max(0, Math.floor(o.balanceUsdCents)),
    topup: { methods, maxUsd, quickUsd: quickUsd.length > 0 ? quickUsd : [10, 20, 50, 100] },
  };
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
const MOCK_TOPUP: TopupConfig = {
  methods: [
    { id: "card", minUsd: 5, enabled: true },
    { id: "cryptobot", minUsd: 5, enabled: true },
    { id: "crypto", minUsd: 8, enabled: true },
    { id: "lava", minUsd: 5, enabled: true },
  ],
  maxUsd: 1000,
  quickUsd: [10, 20, 50, 100],
};

/** ?mockBalance=<cents> (default $12.50: covers a month of one device, not a year of three). */
function mockWallet(): WalletState {
  const param = new URLSearchParams(window.location.search).get("mockBalance");
  const raw = param === null || param.trim() === "" ? NaN : Number(param);
  return { balanceCents: Number.isFinite(raw) && raw >= 0 && raw <= 1e7 ? Math.floor(raw) : 1250, topup: MOCK_TOPUP };
}

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

/** Mock of POST /api/wallet/purchase: same answers, no server. */
async function mockPurchase(product: WalletProduct, balanceCents: number): Promise<{ status: number; body: unknown }> {
  await new Promise((r) => setTimeout(r, 700));
  const priceCents =
    product.kind === "device"
      ? Math.round(MOCK_PRICING.deviceAddonPrice * 100) * product.term
      : Math.round((MOCK_PRICING[product.kind][String(product.term)]?.total ?? 0) * 100);
  if (balanceCents < priceCents) {
    return { status: 402, body: { ok: false, error: "insufficient_balance", priceCents, balanceCents, needCents: priceCents - balanceCents } };
  }
  return { status: 200, body: { ok: true, product, priceCents, balanceCents: balanceCents - priceCents, replayed: false } };
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

export interface DashboardViewProps {
  /** Where the dashboard runs; the site when omitted. */
  host?: DashHost;
}

export function DashboardView({ host = WEB_HOST }: DashboardViewProps) {
  const { lang, t } = useDashLang();
  const shell = useShellT();
  const embedded = host.embedded;
  useDocumentTitle(fmt("{t} | Kovra", { t: t.page_title }));

  const [userId, setUserId] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
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

  // the unified balance
  const [walletBusy, setWalletBusy] = useState<"plan" | "slot" | null>(null);
  const [planDone, setPlanDone] = useState<string | null>(null);
  const [slotDone, setSlotDone] = useState<string | null>(null);
  /** Cents missing for the last balance purchase that did not fit (offers a top-up). */
  const [shortCents, setShortCents] = useState<number | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupSeq, setTopupSeq] = useState(0);
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupSuggest, setTopupSuggest] = useState<number | null>(null);
  const [topupWanted, setTopupWanted] = useState(false);
  const requestIds = useRef(new Map<string, string>());

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

  // Payment return: "Checking payment…" until the plan or the balance changes.
  const [paidPending, setPaidPending] = useState(false);
  /** The pending check started from a ?paid= return (not from a payment opened on this page view). */
  const [paidFromUrl, setPaidFromUrl] = useState(false);
  const [paidBaseline, setPaidBaseline] = useState<PaidBaseline | null>(null);
  const [paidSlow, setPaidSlow] = useState(false);
  // When the dashboard opened: a subscription created within 30 minutes before
  // it counts as the payment the user is returning from.
  const [mountTs] = useState(() => Date.now());
  const [visited, setVisited] = useState<ReadonlySet<DashView>>(() => new Set<DashView>());
  const devicesHeadingRef = useRef<HTMLHeadingElement>(null);
  const [backStack] = useState(createBackStack);

  /** Server error -> UI text; `fallback` when the response carries no error. */
  const errText = (raw: unknown, status: number, fallback: string) => dashError(raw, status, lang, t, fallback);
  const setDeviceErr = (uuid: string, msg: string | null) =>
    setDeviceError((prev) => {
      const next = { ...prev };
      if (msg) next[uuid] = msg;
      else delete next[uuid];
      return next;
    });
  /** Body field of payment requests made inside the Mini App: the provider returns there. */
  const returnTo: Record<string, string> = embedded ? { returnTo: "miniapp" } : {};

  // Entry-point parameters, once: ?paid= (back from a payment page), ?view=.
  // Both are removed from the address in one replaceState (see replaceDashUrl).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has("paid")) {
      if (isPaidReturnValue(url.searchParams.get("paid"))) {
        trackEvent("payment_initiated", { type: "plan", method: "crypto_return" });
        setPaidPending(true);
        setPaidFromUrl(true);
        const stored = takeBaseline();
        if (stored) setPaidBaseline(stored);
      }
      url.searchParams.delete("paid");
      changed = true;
    }
    const v = url.searchParams.get("view");
    if (v !== null) {
      url.searchParams.delete("view");
      changed = true;
      if (v === "topup") {
        url.hash = "plan";
        setTopupWanted(true);
      } else if (isDashView(v)) {
        url.hash = v;
      }
    }
    if (changed) replaceDashUrl(`${url.pathname}${url.search}${url.hash}`);
  }, []);

  // current user
  const loadUser = useCallback(async () => {
    if (MOCK) {
      setUserId("mock-user");
      setUserInfo(embedded ? { authMethod: "telegram", telegramId: "100000001" } : { authMethod: "email", email: "demo@kovravpn.com" });
      return;
    }
    try {
      const r = await fetch("/api/auth/me");
      const d = await readJson(r);
      if (d.authenticated === true && typeof d.userId === "string") {
        setUserId(d.userId);
        setUserInfo({
          authMethod: typeof d.authMethod === "string" ? d.authMethod : "",
          email: typeof d.email === "string" ? d.email : undefined,
          telegramId: typeof d.telegramId === "string" || typeof d.telegramId === "number" ? String(d.telegramId) : undefined,
        });
      } else {
        host.onAuthLost();
      }
    } catch {
      // Site: as before, back to the sign-in. Mini App: a network blip is not
      // a lost session; offer a retry.
      if (embedded) {
        setLoadError(true);
        setLoading(false);
      } else {
        host.onAuthLost();
      }
    }
  }, [embedded, host]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const [profiles, setProfiles] = useState<Profile[]>([]);

  const fetchAccount = useCallback(async () => {
    if (!userId) return;
    if (MOCK) {
      const m = mockData(new URLSearchParams(window.location.search).get("mockState"));
      setAccount(m.account);
      setPricing(MOCK_PRICING);
      setProfiles(m.profiles);
      setWallet((w) => w ?? mockWallet());
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
      setWallet(parseWallet(d.wallet));
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

  // Back from a payment: done once the plan or the balance moved against the
  // baseline saved before leaving (else the first load here). A plan bought
  // within 30 minutes before a ?paid= return also counts (card webhooks
  // usually land before the redirect back). Until then, poll.
  const balanceCents = wallet?.balanceCents ?? null;
  if (paidPending && account && paidBaseline === null) {
    setPaidBaseline({ maxExpiry: account.maxExpiry, activeSlots: account.activeSlots, balanceCents, kind: null });
  }
  const recentPaid =
    paidPending && paidFromUrl && account !== null && account.subs.some((x) => x.kind !== "referral" && x.createdAt > mountTs - PAID_RECENT_MS);
  const paidKind =
    paidPending && account
      ? detectPaid(paidBaseline, { maxExpiry: account.maxExpiry, activeSlots: account.activeSlots, balanceCents }, recentPaid)
      : null;
  const paidDone = paidKind !== null;

  useEffect(() => {
    if (!paidPending || paidDone || !userId) return;
    const started = Date.now();
    setPaidSlow(false);
    const id = window.setInterval(() => {
      if (Date.now() - started > PAID_POLL_MAX_MS) {
        window.clearInterval(id);
        setPaidSlow(true);
        return;
      }
      if (!MOCK) void fetchAccount();
    }, PAID_POLL_MS);
    // Coming back to the page (from the payment tab, or to Telegram from the
    // browser): check at once instead of waiting for the next tick.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !MOCK) void fetchAccount();
    };
    document.addEventListener("visibilitychange", onVisible);
    const offResume = host.onResume?.(() => {
      if (!MOCK) void fetchAccount();
    });
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      offResume?.();
    };
  }, [paidPending, paidDone, userId, fetchAccount, host]);

  useEffect(() => {
    if (!paidKind) return;
    // Seen: a later ?paid= must not compare against this payment's baseline.
    saveBaseline(null);
    host.haptic?.("success");
  }, [paidKind, host]);

  /**
   * Leave for a payment page. The baseline is saved first. On the site the
   * page goes away; in the Mini App it stays, so the check starts right away
   * and runs while the person pays in the browser.
   */
  const openPayment = (url: string, kind: PaidKind) => {
    const base: PaidBaseline | null = account
      ? { maxExpiry: account.maxExpiry, activeSlots: account.activeSlots, balanceCents, kind }
      : null;
    saveBaseline(base);
    if (MOCK) {
      console.info("[dash-mock] payment page:", url);
    } else {
      host.openPayment(url);
    }
    if (embedded || MOCK) {
      setPaidBaseline(base);
      setPaidFromUrl(false);
      setPaidPending(true);
    }
  };

  const handleBuyPlan = async () => {
    setBuying(true); setPlanError(null);
    try {
      const r = await fetch("/api/platega/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: planKind, term, method: "card", ...returnTo }) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "plan", method: "card", provider: "platega", kind: planKind, term });
        openPayment(d.paymentUrl, "plan");
      } else setPlanError(errText(d.error, r.status, t.err_pay));
    } catch { setPlanError(t.err_conn); } finally { setBuying(false); }
  };

  const handleBuyDevice = async () => {
    setBuyingDevice(true); setSlotError(null);
    try {
      const r = await fetch("/api/platega/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "device", method: "card", ...returnTo }) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "device", method: "card", provider: "platega" });
        openPayment(d.paymentUrl, "slot");
      } else setSlotError(errText(d.error, r.status, t.err_pay));
    } catch { setSlotError(t.err_conn); } finally { setBuyingDevice(false); }
  };

  const handleBuyPlanCard = async () => {
    setBuyingCard(true); setPlanError(null);
    try {
      const r = await fetch("/api/cashera/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: planKind, term, ...returnTo }) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "plan", method: "card", provider: "cashera", kind: planKind, term });
        openPayment(d.paymentUrl, "plan");
      } else setPlanError(errText(d.error, r.status, t.err_pay));
    } catch { setPlanError(t.err_conn); } finally { setBuyingCard(false); }
  };

  const handleBuyDeviceCard = async () => {
    setBuyingCardDevice(true); setSlotError(null);
    try {
      const r = await fetch("/api/cashera/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "device", ...returnTo }) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "device", method: "card", provider: "cashera" });
        openPayment(d.paymentUrl, "slot");
      } else setSlotError(errText(d.error, r.status, t.err_pay));
    } catch { setSlotError(t.err_conn); } finally { setBuyingCardDevice(false); }
  };

  // Alternative crypto rail (NOWPayments) — kept as the third option.
  const handleBuyPlanAlt = async () => {
    setBuyingAlt(true); setPlanError(null);
    try {
      const r = await fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: planKind, term, ...returnTo }) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "plan", method: "crypto", provider: "nowpayments", kind: planKind, term });
        openPayment(d.paymentUrl, "plan");
      } else setPlanError(errText(d.error, r.status, t.err_pay));
    } catch { setPlanError(t.err_conn); } finally { setBuyingAlt(false); }
  };

  const handleBuyDeviceAlt = async () => {
    setBuyingAltDevice(true); setSlotError(null);
    try {
      const r = await fetch("/api/subscribe/device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...returnTo }) });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { type: "device", method: "crypto", provider: "nowpayments" });
        openPayment(d.paymentUrl, "slot");
      } else setSlotError(errText(d.error, r.status, t.err_pay));
    } catch { setSlotError(t.err_conn); } finally { setBuyingAltDevice(false); }
  };

  // lava.top — единственный способ заплатить из-за рубежа не криптовалютой.
  // Способ и валюта уходят вместе: лава показывает покупателю ровно один
  // способ на счёт, а подпись на кнопке обязана совпасть со списанием.
  const handleBuyLava = async (
    body: Record<string, string | number>,
    id: LavaMethodId,
    currency: LavaCurrency,
    tag: string,
  ) => {
    const isSlot = tag.startsWith("device:");
    const setError = isSlot ? setSlotError : setPlanError;
    setBuyingLava(tag); setError(null);
    try {
      const r = await fetch("/api/subscribe/lava", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, method: id, currency, ...returnTo }),
      });
      const d = await r.json();
      if (d.paymentUrl) {
        trackEvent("payment_initiated", { ...body, method: id, currency, provider: "lava" });
        openPayment(d.paymentUrl, isSlot ? "slot" : "plan");
      } else setError(errText(d.error, r.status, t.err_pay));
    } catch { setError(t.err_conn); } finally { setBuyingLava(null); }
  };

  /** Text for a balance purchase that did not go through. */
  const walletErrText = (o: PurchaseOutcome): string => {
    switch (o.kind) {
      case "insufficient":
        return fmt(t.wallet_err_short, { need: fmtCents(o.needCents, lang) });
      case "busy":
        return t.wallet_err_busy;
      case "other_plan":
        return t.wallet_err_other_plan;
      case "refunded":
        return t.wallet_err_refunded;
      case "stuck":
        return t.wallet_err_stuck;
      case "rate_limited":
        return errText(undefined, 429, t.err_generic);
      default:
        return t.err_generic;
    }
  };

  /**
   * "Pay from balance": one tap, no redirect. The request id is kept per
   * product until the purchase succeeds, so a lost answer or a second tap
   * can never charge twice.
   */
  const payFromBalance = async (target: "plan" | "slot") => {
    const product: WalletProduct = target === "plan" ? { kind: effectiveKind, term } : { kind: "device", term: 1 };
    const setErr = target === "plan" ? setPlanError : setSlotError;
    const setDone = target === "plan" ? setPlanDone : setSlotDone;
    setErr(null); setDone(null); setShortCents(null);
    setWalletBusy(target);
    const store = sessionStore();
    const requestId = requestIdFor(store, product, requestIds.current);
    try {
      let status: number;
      let body: unknown;
      if (MOCK) {
        ({ status, body } = await mockPurchase(product, balanceCents ?? 0));
      } else {
        const r = await fetch("/api/wallet/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: product.kind, term: product.term, requestId, source: embedded ? "miniapp" : "web" }),
        });
        status = r.status;
        body = await readJson(r);
      }
      const o = purchaseOutcome(status, body);
      if (!keepsRequestId(o)) clearRequestId(store, product, requestIds.current);
      if (o.kind === "ok") {
        setWallet((w) => (w ? { ...w, balanceCents: o.balanceCents } : w));
        const amount = fmtCents(o.priceCents, lang);
        setDone(fmt(target === "plan" ? t.wallet_paid_plan : t.wallet_paid_slot, { amount }));
        trackEvent("wallet_purchase", { kind: product.kind, term: product.term, cents: o.priceCents, source: embedded ? "miniapp" : "web" });
        host.haptic?.("success");
        await fetchAccount();
        return;
      }
      if (o.kind === "unauthorized") {
        host.onAuthLost();
        return;
      }
      if (o.kind === "insufficient") {
        setWallet((w) => (w ? { ...w, balanceCents: o.balanceCents } : w));
        setShortCents(o.needCents);
      }
      setErr(walletErrText(o));
      host.haptic?.("error");
    } catch {
      setErr(t.err_conn);
    } finally {
      setWalletBusy(null);
    }
  };

  const openTopup = (suggest: number | null) => {
    setTopupSuggest(suggest);
    setTopupError(null);
    setTopupSeq((n) => n + 1);
    setTopupOpen(true);
  };

  // ?view=topup: open the sheet once the balance is known.
  useEffect(() => {
    if (!topupWanted || !wallet) return;
    setTopupWanted(false);
    setTopupSuggest(null);
    setTopupError(null);
    setTopupSeq((n) => n + 1);
    setTopupOpen(true);
  }, [topupWanted, wallet]);

  const topupErrText = (status: number, d: Record<string, unknown>): string => {
    if (d.error === "invalid_amount" && typeof d.minUsd === "number") {
      return fmt(t.topup_min, { amount: fmtMoney(d.minUsd, "USD", lang) });
    }
    if (status === 503) return t.topup_unavailable;
    return errText(undefined, status, t.err_pay);
  };

  const startTopup = async (route: TopupRoute, amountUsd: number) => {
    setTopupBusy(true); setTopupError(null);
    try {
      if (MOCK) {
        await new Promise((r) => setTimeout(r, 700));
        setTopupOpen(false);
        openPayment("https://kovravpn.com/#mock-topup", "topup");
        // The "webhook" of the preview: the money lands a few seconds later.
        window.setTimeout(() => setWallet((w) => (w ? { ...w, balanceCents: w.balanceCents + Math.round(amountUsd * 100) } : w)), 3500);
        return;
      }
      const r = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: route.kind,
          amountUsd,
          returnTo: embedded ? "miniapp" : "web",
          ...(route.kind === "lava" ? { lavaMethod: route.id, lavaCurrency: route.currency } : {}),
        }),
      });
      const d = await readJson(r);
      if (r.ok && typeof d.payUrl === "string") {
        trackEvent("payment_initiated", { type: "topup", method: route.kind, amountUsd });
        if (embedded) setTopupOpen(false);
        openPayment(d.payUrl, "topup");
      } else {
        setTopupError(topupErrText(r.status, d));
        host.haptic?.("error");
      }
    } catch {
      setTopupError(t.err_conn);
    } finally {
      setTopupBusy(false);
    }
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

  const payBusy =
    buying || buyingCard || buyingAlt || buyingDevice || buyingCardDevice || buyingAltDevice || buyingLava !== null || walletBusy !== null || topupBusy;

  const payPlan = (route: PayRoute) => {
    setPlanDone(null);
    switch (route.kind) {
      case "wallet": return void payFromBalance("plan");
      case "platega": return void handleBuyPlan();
      case "cashera": return void handleBuyPlanCard();
      case "nowpayments": return void handleBuyPlanAlt();
      case "lava": return void handleBuyLava({ what: "plan", kind: effectiveKind, term }, route.id, route.currency, `plan:${route.id}`);
    }
  };
  const paySlot = (route: PayRoute) => {
    switch (route.kind) {
      case "wallet": return void payFromBalance("slot");
      case "platega": return void handleBuyDevice();
      case "cashera": return void handleBuyDeviceCard();
      case "nowpayments": return void handleBuyDeviceAlt();
      case "lava": return void handleBuyLava({ what: "device" }, route.id, route.currency, `device:${route.id}`);
    }
  };
  const planLoading = (route: PayRoute) =>
    route.kind === "wallet" ? walletBusy === "plan"
    : route.kind === "platega" ? buying : route.kind === "cashera" ? buyingCard : route.kind === "nowpayments" ? buyingAlt : buyingLava === `plan:${route.id}`;
  const slotLoading = (route: PayRoute) =>
    route.kind === "wallet" ? walletBusy === "slot"
    : route.kind === "platega" ? buyingDevice : route.kind === "cashera" ? buyingCardDevice : route.kind === "nowpayments" ? buyingAltDevice : buyingLava === `device:${route.id}`;

  const fallbackView: DashView | null = loading ? null : loadError && !account ? "devices" : account?.hasActive || profiles.length > 0 ? "devices" : "plan";
  const { view, navigate } = useDashView(!loading, fallbackView);
  const onVisit = useCallback((v: DashView) => setVisited((prev) => (prev.has(v) ? prev : new Set(prev).add(v))), []);

  // ── Telegram's back arrow: the newest open layer, else home ──
  useEffect(() => (showDevicePicker ? backStack.push(() => setShowDevicePicker(false)) : undefined), [showDevicePicker, backStack]);
  useEffect(() => (lastCreatedDevice ? backStack.push(() => setLastCreatedDevice(null)) : undefined), [lastCreatedDevice, backStack]);
  const layers = useBackStackSize(backStack);
  useEffect(() => {
    if (!host.bindBack) return;
    const handler = layers > 0 ? () => void backStack.back() : view !== null && view !== "devices" ? () => navigate("devices") : null;
    return host.bindBack(handler);
  }, [host, layers, view, navigate, backStack]);

  // The Mini App tells the account when the person switches the language.
  const reportedLang = useRef<Lang | null>(null);
  useEffect(() => {
    if (!host.onLangChange) return;
    if (reportedLang.current === null) {
      reportedLang.current = lang;
      return;
    }
    if (lang !== reportedLang.current) {
      reportedLang.current = lang;
      host.onLangChange(lang);
    }
  }, [lang, host]);

  const identity: Identity | null = userInfo?.email
    ? { label: userInfo.email, initial: userInfo.email.trim().charAt(0).toUpperCase() || null }
    : userInfo?.telegramId
      ? { label: fmt(t.tg_id, { id: userInfo.telegramId }), initial: null }
      : null;

  // Plan line of the header account menu (no line while loading or without a plan).
  const accountDays = account ? daysLeft(account, nowTs) : 0;
  const accountTone = loading || !account ? null : statusTone(hState);
  const accountStatus: AccountStatus | null = accountTone
    ? {
        tone: accountTone,
        text:
          accountTone === "danger"
            ? fmt(t.expired_on, { date: fmtDate(account?.maxExpiry ?? 0, lang) })
            : `${accountDays} ${plural(lang, accountDays, t.days_left_unit)}`,
      }
    : null;

  const openSlotDialog = () => { setSlotError(null); setSlotDone(null); setShortCents(null); setSlotDialogOpen(true); };
  const topupFromShort = () => openTopup(shortCents);
  const shortAction = (visible: boolean) =>
    visible && shortCents !== null && wallet ? (
      <Button variant="quiet" size="sm" onClick={topupFromShort}>
        {t.wallet_topup}
      </Button>
    ) : null;

  const walletChip = (always: boolean) =>
    wallet && (always || wallet.balanceCents > 0) ? (
      <WalletChip t={t} lang={lang} balanceCents={wallet.balanceCents} pending={paidPending && !paidDone && !paidSlow} onClick={() => openTopup(null)} />
    ) : null;

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
        onPlanKind={(k) => { setPlanKind(k); setPlanError(null); setShortCents(null); }}
        onTerm={(tm) => { setTerm(tm); setPlanError(null); setShortCents(null); }}
        busy={payBusy}
        isLoading={planLoading}
        onPay={payPlan}
        planError={planError}
        planErrorAction={shortAction(!slotDialogOpen)}
        onDismissPlanError={() => { setPlanError(null); setShortCents(null); }}
        planDone={planDone}
        onDismissPlanDone={() => setPlanDone(null)}
        onBuySlot={openSlotDialog}
        balanceCents={wallet ? wallet.balanceCents : null}
        onTopup={() => openTopup(null)}
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
    content = (
      <AccountView t={t} userId={userId} userInfo={userInfo} onUserUpdate={refreshUser} onLogout={() => void handleLogout()} embedded={embedded} />
    );
  }

  return (
    <BackStackProvider stack={backStack}>
      <CabinetRoot variant="dash" className={embedded ? "kc-embedded" : undefined}>
        {embedded ? (
          <MiniAppBar end={walletChip(true)} />
        ) : (
          <DashHeader
            t={t}
            view={view}
            identity={identity}
            status={accountStatus}
            onNavigate={navigate}
            onLogout={() => void handleLogout()}
            walletSlot={walletChip(false)}
          />
        )}
        <main id="kc-main" tabIndex={-1} className="kc-dash-main" aria-busy={loading || undefined}>
          <div className="kc-dash-wrap">
            {paidPending ? (
              <PaymentReturnNotice
                t={t}
                state={paidKind ?? (paidSlow ? "slow" : "pending")}
                kind={paidBaseline?.kind ?? null}
                balance={wallet ? fmtCents(wallet.balanceCents, lang) : null}
                dismissLabel={shell.dismiss}
                onDismiss={() => setPaidPending(false)}
              />
            ) : null}
            {loadError ? (
              <Notice
                tone="error"
                className="kc-load-error"
                action={
                  <Button variant="ghost" size="sm" onClick={() => void (userId ? fetchAccount() : loadUser())}>
                    {shell.retry}
                  </Button>
                }
              >
                {t.load_failed}
              </Notice>
            ) : null}
            {loading || !view ? (
              loadError ? null : <DashSkeleton label={t.loading_account} />
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
            onClose={() => { setSlotDialogOpen(false); setSlotDone(null); setShortCents(null); }}
            t={t}
            lang={lang}
            price={pricing.deviceAddonPrice}
            days={pricing.deviceAddonDays}
            lavaEnabled={pricing.lavaEnabled}
            busy={payBusy}
            isLoading={slotLoading}
            onPay={paySlot}
            error={slotError}
            errorAction={shortAction(slotDialogOpen)}
            onDismissError={() => { setSlotError(null); setShortCents(null); }}
            balanceCents={wallet ? wallet.balanceCents : null}
            done={slotDone}
          />
        ) : null}
        {wallet ? (
          <TopupDialog
            open={topupOpen}
            openSeq={topupSeq}
            onClose={() => setTopupOpen(false)}
            t={t}
            lang={lang}
            balanceCents={wallet.balanceCents}
            config={wallet.topup}
            suggestCents={topupSuggest}
            busy={topupBusy}
            error={topupError}
            onDismissError={() => setTopupError(null)}
            onSubmit={(route, amountUsd) => void startTopup(route, amountUsd)}
          />
        ) : null}
      </CabinetRoot>
    </BackStackProvider>
  );
}

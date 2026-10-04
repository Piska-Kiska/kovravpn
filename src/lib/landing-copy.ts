// src/lib/landing-copy.ts
//
// The English copy of the two landing pages, /vless and /crypto, as plain
// data: the pages render it and the FAQPage markup is built from the same
// arrays, so the visible FAQ and the markup cannot drift (Google wants them
// word for word). Prices, the refund window and the limits are never typed
// here: they come from src/lib/plan-prices.ts and from the home copy, so a
// claim is made once.
//
// What the pages may say is the claims bank of the 02.10.2026 research
// (growth-2026-10-02, section 4.D): the plans and the add-on price, one-time
// payments, the refund rule of the Terms, crypto "usually 5-30 minutes" with
// the network fee on the buyer, VLESS + REALITY as a description of the
// mechanism (never "undetectable"), Happ and INCY, one link per device bound
// by the device identifier, the data the Privacy Policy lists, BitTorrent
// blocked, China and Iran never tested. tests/landing-copy.test.mjs holds the
// pages to it.

import type { FaqItem } from "./faq-items";
import { homeCopyFor } from "./home-copy";
import { DEVICE_ADDON_PRICE, PLAN_PRICES, REFUND_WINDOW_DAYS, usd } from "./plan-prices";

const home = homeCopyFor("en");

/** An internal link. */
export interface Link {
  href: string;
  label: string;
}

/** The prices these pages quote, "$5" style, from the module the server charges from. */
export const PRICES = {
  oneDeviceMonth: usd(PLAN_PRICES.plan1[1].total),
  oneDeviceYear: usd(PLAN_PRICES.plan1[12].total),
  threeDevicesMonth: usd(PLAN_PRICES.plan3[1].total),
  threeDevicesYear: usd(PLAN_PRICES.plan3[12].total),
  extraDevice: usd(DEVICE_ADDON_PRICE),
} as const;

/** What Kovra does not promise, said on every landing page (same words as the home page). */
export const LIMITS_TEXT = home.limits_b;

/** The refund rule of the Terms (section 5), as the home FAQ words it. */
export const REFUND_TEXT = home.faq_refund_a;

/** How a card and a crypto invoice are charged, as the home page words it. */
export const PAYMENT_TEXT = home.b4_b;

/** What the discount compares with, as the home page words it. */
export const SAVINGS_TEXT = home.plan_savings;

/** The names of the terms, as the home page's pricing table has them. */
export const TERM_LABELS = { 1: home.term1, 6: home.term6, 12: home.term12 } as const;

/** The one-time payment line that sits next to every price. */
export const NO_RENEWAL_TEXT = "Paid once for the whole term. Nothing renews automatically.";

/** Crypto activation, as the cabinet says it. */
export const CRYPTO_TIMING_TEXT = "Access activates after network confirmation, usually in 5-30 minutes.";

// ─── /vless ────────────────────────────────────────────────────────

export const VLESS_PAGE = {
  kicker: "Need a VLESS subscription for Happ?",
  h1: "Your VLESS link. We keep the servers running.",
  lead: `One link per device for Happ and INCY, on VLESS + REALITY. ${NO_RENEWAL_TEXT}`,
  cta: `Get a link - from ${PRICES.oneDeviceMonth}/mo`,
  rows: [
    {
      h: "Not a key list. A subscription.",
      p: "Free key lists are shared by many people and change without notice. Your Kovra link is issued to one device and maintained by us.",
    },
    {
      h: "Locations update themselves.",
      p: "When we add a location, it appears in your app at the next refresh.",
    },
    {
      h: "Works in the apps you already use.",
      p: "Happ and INCY: we test with them and show the setup.",
      links: [
        { href: "/guide", label: "Setup guide" },
        { href: "/guides/how-to-set-up-vpn-on-iphone", label: "iPhone" },
        { href: "/guides/how-to-set-up-vpn-on-android", label: "Android" },
        { href: "/guides/how-to-set-up-vpn-on-mac", label: "Mac" },
        { href: "/guides/how-to-set-up-vpn-on-windows", label: "Windows" },
      ],
    },
  ],
} as const;

/** Quiet links under the page: the guides that explain it, and the other landing page. */
export const VLESS_MORE: readonly Link[] = [
  { href: "/guides/vpn-subscription-link-explained", label: "What a subscription link is" },
  { href: "/guides/vless-reality-protocol", label: "VLESS + Reality explained" },
  { href: "/crypto", label: "Paying with crypto" },
];

export const VLESS_FAQ: readonly FaqItem[] = [
  {
    q: "What is a VLESS subscription link?",
    a: "A link your app downloads to get server settings. When servers change, the app refreshes the link and gets the new ones.",
  },
  {
    q: "Which apps support a Kovra VLESS link?",
    a: "We support and test Happ and INCY. Other Xray-based apps may import it, but we don't promise they work.",
  },
  {
    q: "How is this different from free VLESS keys?",
    a: "Free keys are shared by many people and disappear without notice. A Kovra link is issued to one device and maintained by us.",
  },
  {
    q: "Can I use one link on two devices?",
    a: `No. Each link is bound to one device. A plan covers 1 or 3 devices, and an extra device costs ${PRICES.extraDevice} per 30 days.`,
  },
  {
    q: "Is REALITY detectable?",
    a: "It is designed to look like ordinary HTTPS to a real website. No protocol is guaranteed against every network.",
  },
  {
    q: "How much does it cost?",
    a: `${PRICES.oneDeviceMonth} a month for one device, or ${PRICES.oneDeviceYear} for a year. Three devices are ${PRICES.threeDevicesMonth} a month, or ${PRICES.threeDevicesYear} for a year. Every plan is paid once, and nothing renews automatically.`,
  },
];

// ─── /crypto ───────────────────────────────────────────────────────

export const CRYPTO_PAGE = {
  kicker: "Pay in USDT. No email. One link.",
  h1: "Pay in USDT. Sign up with Telegram.",
  lead: "Sign up in Telegram, pay the invoice in the coin you pick, import one link into Happ or INCY.",
  ctaWeb: "Sign up on the web",
  rows: [
    {
      h: "Pick your coin.",
      p: "On the website the payment page lets you choose the coin: USDT, BTC, ETH and more. In the Telegram bot you can also pay in @CryptoBot with USDT, TON or BTC.",
    },
    {
      h: "Active after confirmation.",
      p: `${CRYPTO_TIMING_TEXT} Network fees are added at checkout.`,
    },
    {
      h: "What we store.",
      p: "Telegram ID, username and display name. Never your phone. The full list, with the IP address at payment and at connection and the device identifier your app sends, is in the Privacy Policy.",
    },
    {
      h: "What it costs.",
      p: `${PRICES.oneDeviceMonth} for one device for a month, or ${PRICES.oneDeviceYear} for a year. Three devices: ${PRICES.threeDevicesMonth} a month, or ${PRICES.threeDevicesYear} for a year. ${NO_RENEWAL_TEXT}`,
    },
  ],
} as const;

/** Quiet links under the page: the guides that explain it, and the other landing page. */
export const CRYPTO_MORE: readonly Link[] = [
  { href: "/guides/vpn-that-accepts-usdt", label: "VPN that accepts USDT" },
  { href: "/guides/pay-for-vpn-with-crypto", label: "Paying for a VPN with crypto" },
  { href: "/guides/vpn-without-email", label: "VPN without email" },
  { href: "/vless", label: "The VLESS subscription" },
];

export const CRYPTO_FAQ: readonly FaqItem[] = [
  {
    q: "Which cryptocurrencies can I pay with?",
    a: "On the website you pay a crypto invoice and choose the coin there: USDT, BTC, ETH and more. In the Telegram bot you can also pay in @CryptoBot with USDT, TON or BTC.",
  },
  {
    q: "How long does a crypto payment take?",
    a: CRYPTO_TIMING_TEXT,
  },
  {
    q: "Who pays the network fee?",
    a: "You do; it is added at checkout.",
  },
  {
    q: "Do I need an email or a phone number?",
    a: "No email if you sign up with Telegram, and we never ask for your phone. The website signup uses email and a password.",
  },
  {
    q: "What data does Kovra keep?",
    a: "Your Telegram ID, username and display name (or your email if you sign up on the website), traffic totals, last-connection time, the IP address at payment and at connection, the device identifier your app sends, and your plan and payment details. Everything we store is listed in the Privacy Policy.",
  },
  {
    q: "Is paying in crypto anonymous?",
    a: "Not by itself. Blockchain transactions are public, and the payment processor sees the payment. What Kovra stores is listed in the Privacy Policy.",
  },
  {
    q: "Can I get a refund in crypto?",
    a: `Payments are generally non-refundable once a plan is active. If the service was not delivered because of a fault on our side and you contact support within ${REFUND_WINDOW_DAYS} days of payment, an approved crypto refund goes to the same wallet in the same asset, less network fees (Terms, section 5).`,
  },
];

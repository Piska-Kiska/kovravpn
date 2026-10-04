// src/lib/site-meta.ts
//
// Titles and descriptions of the landing pages. One module, so a test can
// hold every one of them to the search-result limits (title at most 60
// characters, description at most 160) and so the price in a description is
// the one the server charges: it is computed here, never typed.
//
// Plain data with no I/O: the layout and the pages import it.

import { PLAN_PRICES, usd } from "./plan-prices";

/** The cheapest way in: one device for one month, "$5". */
const FROM_PRICE = usd(PLAN_PRICES.plan1[1].perMonth);

export interface PageMeta {
  title: string;
  description: string;
}

export const HOME_META: PageMeta = {
  title: "Kovra VPN: VLESS Reality · Telegram signup · Crypto & Cards",
  description: `VPN on VLESS + REALITY: to the network it looks like a visit to an ordinary website. Sign up with Telegram, pay in USDT or by card. From ${FROM_PRICE}/mo.`,
};

export const VLESS_META: PageMeta = {
  title: "VLESS Reality VPN subscription for Happ & INCY | Kovra",
  description: `A managed VLESS + REALITY subscription for Happ and INCY: one link per device, new locations arrive on their own. ${FROM_PRICE}/month, USDT or card.`,
};

export const CRYPTO_META: PageMeta = {
  title: "VPN with USDT payment, no email signup | Kovra",
  description: `Pay for a VPN in USDT, BTC or other coins and sign up with Telegram - no email, no phone. VLESS + REALITY, from ${FROM_PRICE}/month.`,
};

/** What a search result shows before it cuts the line. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;

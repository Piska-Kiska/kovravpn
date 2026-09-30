// src/lib/bot-v2/links.ts
//
// Every URL a bot v2 button opens. Pure.
//
// The site is always the apex https://kovravpn.com: subscription links
// (accounts.getSubUrl) already use it, and the Mini App must open on the
// same origin its API calls go to.

import type { BotLang } from "../bot-i18n";
import { botChatUrl } from "../bot-link";
import type { DeviceKind } from "./callbacks";

export const SITE_ORIGIN = "https://kovravpn.com";
export const SUPPORT_EMAIL = "support@kovravpn.com";

/** The Mini App ("Open Kovra"). The language rides along so the cabinet opens in the bot's language. */
export function miniAppPageUrl(lang: BotLang): string {
  return `${SITE_ORIGIN}/tg?lang=${lang}`;
}

/**
 * The one-tap bridge into Happ: the page opens `happ://add/<subscription
 * link>` (see src/app/add/[token]/page.tsx). Telegram buttons accept only
 * http(s) and tg:// links, so the app link needs a page in between.
 */
export function addToHappUrl(subToken: string, lang: BotLang): string {
  return `${SITE_ORIGIN}/add/${encodeURIComponent(subToken)}?lang=${lang}`;
}

const HAPP = {
  apple: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
  android: "https://play.google.com/store/apps/details?id=com.happproxy",
  windows: "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe",
  appleTv: "https://apps.apple.com/us/app/happ-proxy-utility-for-tv/id6748297274",
} as const;

/** Where to get Happ for a device. A TV has two stores. */
export function happDownloads(device: DeviceKind | null): { androidTv?: string; appleTv?: string; main?: string } {
  switch (device) {
    case "iphone":
    case "mac":
      return { main: HAPP.apple };
    case "windows":
      return { main: HAPP.windows };
    case "tv":
      return { androidTv: HAPP.android, appleTv: HAPP.appleTv };
    case "android":
    case null:
      return { main: HAPP.android };
  }
}

/**
 * The setup guide for a device (English guides). A TV goes to the Android TV
 * and Google TV part of the Android guide, the only guide that covers a TV;
 * an unknown device to the general guide, in the bot's language (the page
 * reads ?lang first).
 */
export function setupGuideUrl(device: DeviceKind | null, lang: BotLang): string {
  switch (device) {
    case "iphone":
    case "android":
    case "mac":
    case "windows":
      return `${SITE_ORIGIN}/guides/how-to-set-up-vpn-on-${device}`;
    case "tv":
      return `${SITE_ORIGIN}/guides/how-to-set-up-vpn-on-android#tv`;
    case null:
      return `${SITE_ORIGIN}/guide?lang=${lang}`;
  }
}

export const HELP_LINKS = {
  guides: `${SITE_ORIGIN}/guides`,
  troubleshooting: `${SITE_ORIGIN}/guides/vpn-connected-but-no-internet`,
} as const;

/**
 * The Terms or the Privacy policy in the bot's language. Both pages exist in
 * every bot language and read ?lang first; without it they follow the
 * browser, which in Telegram's in-app browser need not be the bot's language.
 */
export function legalUrl(doc: "terms" | "privacy", lang: BotLang): string {
  return `${SITE_ORIGIN}/${doc}?lang=${lang}`;
}

/** The referral link: a /start payload in the bot. Codes are 8 hex characters. */
export function referralLink(code: string): string {
  return botChatUrl(`ref_${code}`);
}

/** Telegram's share sheet for a link. */
export function shareUrl(link: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}

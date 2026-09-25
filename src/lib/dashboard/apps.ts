// src/lib/dashboard/apps.ts
// Download links for the two client apps the dashboard recommends.
// V2RayTun is no longer offered anywhere in the cabinet.
import type { DashDict } from "@/lib/dash-i18n";
import type { DeviceId } from "./devices";

/** Happ: the recommended client (adds the /p/ link in one tap). */
export const HAPP_LINKS = {
  apple: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
  android: "https://play.google.com/store/apps/details?id=com.happproxy",
  windows: "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe",
  all: "https://www.happ.su/main",
} as const;

/**
 * INCY: the alternative client.
 * OWNER TO VERIFY before release: the App Store id and the GitHub releases
 * path come from the audit and have not been checked against the live stores.
 */
export const INCY_LINKS = {
  apple: "https://apps.apple.com/app/id6756943388",
  other: "https://github.com/INCY-DEV/incy-platforms/releases/latest",
  all: "https://github.com/INCY-DEV/incy-platforms",
} as const;

export interface AppRow {
  key: string;
  labelKey: keyof Pick<DashDict, "dl_apple" | "dl_android_tv" | "dl_windows" | "dl_incy_other">;
  href: string;
  /** Platforms this row serves; the user's platform row is listed first. */
  platforms: readonly DeviceId[];
  /** Direct installer download rather than a store page. */
  download?: boolean;
}

export const HAPP_ROWS: readonly AppRow[] = [
  { key: "happ-apple", labelKey: "dl_apple", href: HAPP_LINKS.apple, platforms: ["iphone", "mac"] },
  { key: "happ-android", labelKey: "dl_android_tv", href: HAPP_LINKS.android, platforms: ["android", "tv"] },
  { key: "happ-windows", labelKey: "dl_windows", href: HAPP_LINKS.windows, platforms: ["windows"], download: true },
];

export const INCY_ROWS: readonly AppRow[] = [
  { key: "incy-apple", labelKey: "dl_apple", href: INCY_LINKS.apple, platforms: ["iphone", "mac"] },
  { key: "incy-other", labelKey: "dl_incy_other", href: INCY_LINKS.other, platforms: ["android", "windows", "tv"] },
];

/** Rows with the one serving `platform` moved to the front (stable otherwise). */
export function rowsFor(rows: readonly AppRow[], platform: DeviceId | null): AppRow[] {
  if (!platform) return [...rows];
  const first = rows.filter((r) => r.platforms.includes(platform));
  return [...first, ...rows.filter((r) => !r.platforms.includes(platform))];
}

/** INCY link for a device type (setup step 1). */
export function incyLinkFor(device: DeviceId): string {
  return device === "iphone" || device === "mac" ? INCY_LINKS.apple : INCY_LINKS.other;
}

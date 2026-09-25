// src/lib/dashboard/devices.ts
// Device types the user can set up, with their icon and Happ download link.
import { Laptop, Monitor, Smartphone, Tv, type LucideIcon } from "lucide-react";
import type { DashDict } from "@/lib/dash-i18n";
import { HAPP_LINKS } from "./apps";

export type DeviceId = "android" | "iphone" | "mac" | "windows" | "tv";

export interface DeviceDef {
  nameKey: keyof Pick<DashDict, "dev_android" | "dev_iphone" | "dev_mac" | "dev_windows" | "dev_tv">;
  icon: LucideIcon;
  /** Where to get Happ for this device. */
  happ: string;
}

export const DEVICE_DEFS: Readonly<Record<DeviceId, DeviceDef>> = {
  android: { nameKey: "dev_android", icon: Smartphone, happ: HAPP_LINKS.android },
  iphone: { nameKey: "dev_iphone", icon: Smartphone, happ: HAPP_LINKS.apple },
  mac: { nameKey: "dev_mac", icon: Laptop, happ: HAPP_LINKS.apple },
  windows: { nameKey: "dev_windows", icon: Monitor, happ: HAPP_LINKS.windows },
  tv: { nameKey: "dev_tv", icon: Tv, happ: HAPP_LINKS.android },
};

export const DEVICE_ORDER: readonly DeviceId[] = ["android", "iphone", "mac", "windows", "tv"];

export function isDeviceId(v: unknown): v is DeviceId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(DEVICE_DEFS, v);
}

/**
 * Best guess of the platform from a user-agent string, or null.
 * Order matters: iPhone user agents contain "like Mac OS X", and Android TV
 * user agents contain "Android".
 */
export function detectPlatform(ua: string): DeviceId | null {
  if (!ua) return null;
  if (/iPhone|iPad|iPod/i.test(ua)) return "iphone";
  if (/Android/i.test(ua)) return /\bTV\b|AFT[A-Z]|BRAVIA|GoogleTV|SmartTV|Android TV/i.test(ua) ? "tv" : "android";
  if (/SmartTV|SMART-TV|Tizen|Web0S|webOS|HbbTV|NetCast|AppleTV/i.test(ua)) return "tv";
  if (/Windows NT|Win64|Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  return null;
}

// src/lib/dashboard/types.ts
// Shapes of the data the dashboard reads from /api/account and /api/referral.
// Moved verbatim from src/app/dashboard/page.tsx.

export interface Profile { uuid: string; clientEmail?: string; vlessUrl: string; createdAt: number; deviceType?: string; subToken?: string; }
export interface SubItem { id: string; kind: "plan1" | "plan3" | "device" | "referral"; slots: number; createdAt: number; expiresAt: number; }
export interface PlanPrice { term: number; total: number; perMonth: number; refMonthly: number; }
export interface Pricing {
  plan1: Record<string, PlanPrice>;
  plan3: Record<string, PlanPrice>;
  plan1Slots: number; plan3Slots: number;
  deviceAddonPrice: number; deviceAddonDays: number;
  /** Настроена ли линия lava.top. Пусто у старого ответа — считаем «нет». */
  lavaEnabled?: boolean;
}
export interface AccountData {
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
export interface ReferralData { code: string; link: string; botLink: string; total: number; rewarded: number; pending: number; }

export type PlanKind = "plan1" | "plan3";
export type Term = 1 | 6 | 12;

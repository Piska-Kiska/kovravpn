// src/app/api/account/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getAccount,
  getProfiles,
  getOrCreateSubToken,
  getSubUrl,
  ensureProfileSubToken,
} from "@/lib/accounts";
import {
  getSubscriptions,
  summarize,
  PLAN_PRICES,
  PLAN_SLOTS,
  DEVICE_ADDON_PRICE,
  DEVICE_ADDON_DAYS,
} from "@/lib/subscriptions";
import { lavaConfigured } from "@/lib/lava";
import { isHappEncryptedEnabled } from "@/lib/feature-flags";
import { authenticateRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.userId;
    const account = await getAccount(userId);
    if (!account) return NextResponse.json({ account: null, profiles: [] });

    const rawProfiles = await getProfiles(userId);

    // Ensure every profile has a per-profile subToken (lazy-create for legacy).
    const profiles = await Promise.all(
      rawProfiles.map(async (p) => {
        if (p.subToken) return p;
        const token = await ensureProfileSubToken(userId, p.uuid);
        return { ...p, subToken: token };
      }),
    );

    const subs = await getSubscriptions(userId);
    const s = summarize(subs);

    // Legacy user-level sub URL (kept for backward compat; dashboard uses
    // per-profile URLs).
    const subToken = await getOrCreateSubToken(userId);
    const subUrl = getSubUrl(subToken, userId);
    const happEncrypted = isHappEncryptedEnabled(userId);

    return NextResponse.json({
      account: {
        plan: account.plan,
        paidUntil: account.paidUntil,
        createdAt: account.createdAt,
        // subscription summary
        activeSlots: s.activeSlots,
        hasActive: s.hasActive,
        maxExpiry: s.maxExpiry,
        nextExpiry: s.nextExpiry,
        daysRemaining: s.daysRemaining,
        devices: profiles.length,
        // active subscription breakdown (for "what's active" list)
        subs: s.subs.map((x) => ({
          id: x.id,
          kind: x.kind,
          slots: x.slots,
          createdAt: x.createdAt,
          expiresAt: x.expiresAt,
        })),
        features: { happEncrypted },
      },
      // pricing catalog so the dashboard renders plans/term selector without
      // hardcoding (server is source of truth)
      pricing: {
        plan1: PLAN_PRICES.plan1,
        plan3: PLAN_PRICES.plan3,
        plan1Slots: PLAN_SLOTS.plan1,
        plan3Slots: PLAN_SLOTS.plan3,
        deviceAddonPrice: DEVICE_ADDON_PRICE,
        deviceAddonDays: DEVICE_ADDON_DAYS,
        // Настроена ли линия lava.top. Кнопки способов рисует клиент, и без
        // этого признака он показывал бы их и на проекте без ключей — каждое
        // нажатие возвращало бы 503. Отдаём только «да/нет», без значений.
        lavaEnabled: lavaConfigured,
      },
      profiles,
      subUrl,
    });
  } catch (error) {
    console.error("[account]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

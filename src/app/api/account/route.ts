// src/app/api/account/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  getAccount,
  getProfiles,
  getOrCreateSubToken,
  getSubUrl,
  ensureProfileSubToken,
} from "@/lib/accounts";
import { getBalanceInfo } from "@/lib/balance";
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

    // Ensure every profile has a per-profile subToken (lazy-create for legacy profiles).
    // After this, the client can build subscription URLs as /api/sub/<subToken> per device.
    const profiles = await Promise.all(
      rawProfiles.map(async (p) => {
        if (p.subToken) return p;
        const token = await ensureProfileSubToken(userId, p.uuid);
        return { ...p, subToken: token };
      })
    );

    const bal = getBalanceInfo(account, profiles.length);

    // Legacy user-level sub URL (returns ALL profiles at once).
    // Kept for backward compatibility with anything still subscribed to it.
    // The dashboard no longer displays it — it uses per-profile URLs instead.
    const subToken = await getOrCreateSubToken(userId);
    const subUrl = getSubUrl(subToken, userId);
    const happEncrypted = isHappEncryptedEnabled(userId);

    return NextResponse.json({
      account: {
        plan: account.plan,
        paidUntil: account.paidUntil,
        createdAt: account.createdAt,
        limit: 100,
        balance: bal.balance,
        dailyRate: bal.dailyRate,
        daysRemaining: bal.daysRemaining,
        devices: profiles.length,
        features: { happEncrypted },
      },
      profiles,
      subUrl,
    });
  } catch (error) {
    console.error("[account]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

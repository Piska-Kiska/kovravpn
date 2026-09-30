// src/lib/referral-reward.ts
//
// The referral reward for a purchase paid from the wallet: the person who
// invited the buyer gets +14 days for one device, once per invited person
// (the `ref_granted:{userId}` guard in referrals.ts), exactly as the payment
// webhooks grant it for a plan bought by card or crypto.
//
// Every purchase in the bot and in the Mini App goes through the wallet (top
// up, then "Pay from balance"), so without this the reward the bot promises
// would never come for them. A top-up alone is not a purchase and earns
// nothing.
//
// Never throws: the purchase is already paid and granted when this runs.

import { grantReferralReward } from "./referrals";
import { applyReferralReward } from "./subscriptions";
import { syncAllExpiry } from "./balance";
import { notifyUser } from "./bot-v2/notify";

/** Injectable for tests; the defaults are the real ones. */
export interface ReferralRewardDeps {
  grant(referredUserId: string): Promise<{ rewarded: boolean; referrerId?: string }>;
  applyReward(referrerId: string): Promise<unknown>;
  syncExpiry(referrerId: string): Promise<void>;
  notify(referrerId: string): Promise<unknown>;
}

const LEGACY_TEXT = [
  "🎁 <b>Referral reward!</b>",
  "",
  "Your friend bought a subscription.",
  "You got <b>+14 days</b> for 1 device.",
].join("\n");

const defaultDeps: ReferralRewardDeps = {
  grant: grantReferralReward,
  applyReward: applyReferralReward,
  syncExpiry: syncAllExpiry,
  notify: (referrerId) => notifyUser(referrerId, { kind: "referral_reward" }, LEGACY_TEXT),
};

/**
 * Reward whoever invited `userId`, if this is the first paid purchase of an
 * invited person. Returns the referrer that was rewarded, or null.
 */
export async function rewardReferrerForPurchase(
  userId: string,
  overrides: Partial<ReferralRewardDeps> = {},
): Promise<string | null> {
  const deps: ReferralRewardDeps = { ...defaultDeps, ...overrides };
  let referrerId: string | null = null;
  try {
    const r = await deps.grant(userId);
    if (!r.rewarded || !r.referrerId) return null;
    referrerId = r.referrerId;
    await deps.applyReward(referrerId);
  } catch (err) {
    // The guard key is taken before the grant: a failure here means the
    // referrer did not get the days, and a person should look.
    console.error(
      JSON.stringify({
        evt: "referral.reward_failed",
        userId,
        referrerId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
  console.info(JSON.stringify({ evt: "referral.reward", userId, referrerId, via: "wallet" }));
  try {
    await deps.syncExpiry(referrerId);
  } catch (err) {
    console.error("[referral] expiry sync failed:", err instanceof Error ? err.message : err);
  }
  try {
    await deps.notify(referrerId);
  } catch (err) {
    console.warn("[referral] notice not sent:", err instanceof Error ? err.message : err);
  }
  return referrerId;
}

// src/lib/device-capacity.ts
//
// Which of a user's devices may connect, and until when (KM-03).
//
// A user owns device slots through subscriptions (plan1 = 1, plan3 = 3, a
// device add-on or a referral bonus = 1 each). Before 30.09.2026 every device
// got the date of the furthest subscription, so when a 3-device plan ended
// and only a 14-day referral bonus or a $5 add-on was left, all three devices
// came back to life on that one slot.
//
// Now the slots are handed out one per device:
//   • every running subscription contributes `slots` entries of its end date;
//     the entries are sorted furthest first;
//   • devices are ordered NEWEST first (createdAt, then uuid); device i gets
//     entry i. So the newest devices keep access, and as slots end one by
//     one the panels switch off the oldest of the remaining devices first,
//     each on its own date, with no resync needed;
//   • devices beyond the running slots are PAUSED: the panels get an expiry
//     in the past, PRO nodes do not list them, the subscription link serves a
//     notice. Nothing is deleted: a new plan or slot, or deleting another
//     device, turns them back on at the next expiry sync;
//   • with no running slot at all every device is EXPIRED, as before (the
//     plan ended; the screens already say so).
//
// Pure: no I/O, only structural types, so it runs under plain Node type
// stripping (tests/device-capacity.test.mjs, lib/node-uuids-body.ts).

/** Hard ceiling on slots one user can hold (as MAX_SLOTS in subscriptions.ts). */
export const CAPACITY_MAX_SLOTS = 100;

export type DeviceAccessState = "active" | "paused" | "expired";

export interface DeviceAccess {
  uuid: string;
  state: DeviceAccessState;
  /** Active: the end of the slot the device holds. Otherwise 0. */
  until: number;
}

/** The parts of a profile this reads (VpnProfile satisfies it). */
export interface CapacityProfile {
  readonly uuid: string;
  readonly createdAt?: number;
}

/** The parts of a subscription this reads (Subscription satisfies it). */
export interface CapacitySub {
  readonly slots: number;
  readonly expiresAt: number;
}

/** One end date per running slot, furthest first, at most CAPACITY_MAX_SLOTS. O(s log s). */
export function slotEnds(subs: readonly CapacitySub[], now: number): number[] {
  const ends: number[] = [];
  for (const s of subs) {
    if (!s || typeof s !== "object") continue;
    const { slots, expiresAt } = s;
    if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= now) continue;
    if (!Number.isSafeInteger(slots) || slots <= 0) continue;
    for (let i = 0; i < Math.min(slots, CAPACITY_MAX_SLOTS); i += 1) ends.push(Math.floor(expiresAt));
  }
  ends.sort((a, b) => b - a);
  return ends.slice(0, CAPACITY_MAX_SLOTS);
}

function createdAtOf(p: CapacityProfile): number {
  return typeof p.createdAt === "number" && Number.isFinite(p.createdAt) ? p.createdAt : 0;
}

/**
 * The access of every device, in the order of `profiles`. O(p log p + s log s).
 */
export function deviceAccess(
  profiles: readonly CapacityProfile[],
  subs: readonly CapacitySub[],
  now: number,
): DeviceAccess[] {
  const ends = slotEnds(subs, now);
  if (ends.length === 0) return profiles.map((p) => ({ uuid: p.uuid, state: "expired", until: 0 }));

  const newestFirst = profiles
    .map((p, index) => ({ p, index }))
    .sort((a, b) => createdAtOf(b.p) - createdAtOf(a.p) || (a.p.uuid < b.p.uuid ? -1 : a.p.uuid > b.p.uuid ? 1 : 0));
  const out: DeviceAccess[] = new Array(profiles.length);
  newestFirst.forEach(({ p, index }, rank) => {
    out[index] =
      rank < ends.length
        ? { uuid: p.uuid, state: "active", until: ends[rank] }
        : { uuid: p.uuid, state: "paused", until: 0 };
  });
  return out;
}

/** The access of one device of a user, or null when the uuid is not among `profiles`. */
export function accessOf(
  uuid: string,
  profiles: readonly CapacityProfile[],
  subs: readonly CapacitySub[],
  now: number,
): DeviceAccess | null {
  return deviceAccess(profiles, subs, now).find((a) => a.uuid === uuid) ?? null;
}

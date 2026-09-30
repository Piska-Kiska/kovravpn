// src/lib/profile-delete.ts
//
// Delete one of the CALLER'S OWN devices (VPN profiles): remove the client
// from the panels, drop the profile, resync expiry.
//
// The uuid comes from the client (a bot callback `cdel_<uuid>`, which anyone
// can forge). Before 30.09.2026 the bot removed the panel client for ANY
// uuid — another user's device included — and only the profile list was
// scoped to the caller. Ownership is checked first now, and nothing is
// touched for a uuid the caller does not own.

import { getProfiles, removeProfile } from "./accounts";
import { removeClientFromStaticPanels } from "./kovra-servers-sync";
import { syncAllExpiry } from "./balance";

export type DeleteOwnProfileResult = "deleted" | "not_found";

export interface DeleteOwnProfileDeps {
  removeFromPanels(uuid: string, clientEmail: string): Promise<unknown>;
  syncExpiry(userId: string): Promise<void>;
}

const defaultDeps: DeleteOwnProfileDeps = {
  removeFromPanels: removeClientFromStaticPanels,
  syncExpiry: syncAllExpiry,
};

export async function deleteOwnProfile(
  userId: string,
  uuid: string,
  overrides: Partial<DeleteOwnProfileDeps> = {},
): Promise<DeleteOwnProfileResult> {
  const deps: DeleteOwnProfileDeps = { ...defaultDeps, ...overrides };
  if (typeof uuid !== "string" || uuid.length === 0 || uuid.length > 64) return "not_found";

  const profiles = await getProfiles(userId);
  const profile = profiles.find((p) => p.uuid === uuid);
  if (!profile) {
    console.warn(JSON.stringify({ evt: "profile.delete_denied", userId, reason: "not_owner" }));
    return "not_found";
  }

  try {
    await deps.removeFromPanels(uuid, profile.clientEmail || uuid);
  } catch (err) {
    // The profile still goes: a panel client without a profile is disabled by
    // the next expiry sync, a profile without a panel client is worse.
    console.error("[profile-delete] panel delete failed:", err instanceof Error ? err.message : err);
  }
  await removeProfile(userId, uuid);
  await deps.syncExpiry(userId);
  console.info(JSON.stringify({ evt: "profile.delete", userId, uuid }));
  return "deleted";
}

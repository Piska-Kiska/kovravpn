// src/lib/profile-delete.ts
//
// Delete one of the CALLER'S OWN devices (VPN profiles): remove the client
// from the panels, drop the profile, resync expiry. Used by the bot (both
// interfaces) and by POST /api/vpn/delete (the site and the Mini App).
//
// The uuid comes from the client (a bot callback `cdel_<uuid>`, which anyone
// can forge). Before 30.09.2026 the bot removed the panel client for ANY
// uuid — another user's device included — and only the profile list was
// scoped to the caller. Ownership is checked first now, and nothing is
// touched for a uuid the caller does not own.
//
// A panel that does not confirm the removal (after the retries inside
// removeClientFromStaticPanels) keeps the profile: the device is NOT reported
// removed, the person is asked to try again, and the owner gets an alert.
// Dropping the profile anyway would free the slot while the old link kept
// working on that panel until its old expiry: the expiry sync only walks the
// profiles that remain, so it never reaches that client.

import { getProfiles, removeProfile } from "./accounts";
import { removeClientFromStaticPanels, type PanelSyncResult } from "./kovra-servers-sync";
import { syncAllExpiry } from "./balance";
import { ADMIN_TG_ID } from "./bot-owner";
import { createTelegramApi } from "./bot-v2/telegram";

export type DeleteOwnProfileResult = "deleted" | "not_found" | "panel_failed";

export interface DeleteOwnProfileDeps {
  /** Per-panel results; a throw counts as every panel failing. */
  removeFromPanels(uuid: string, clientEmail: string): Promise<readonly PanelSyncResult[]>;
  syncExpiry(userId: string): Promise<void>;
  /** Tell the owner (Telegram). Never throws. */
  alertOwner(text: string): Promise<void>;
}

async function alertOwnerViaBot(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) return;
  try {
    await createTelegramApi(token).call("sendMessage", { chat_id: ADMIN_TG_ID, text, parse_mode: "HTML" });
  } catch (err) {
    console.warn("[profile-delete] owner alert not sent:", err instanceof Error ? err.message : err);
  }
}

const defaultDeps: DeleteOwnProfileDeps = {
  removeFromPanels: removeClientFromStaticPanels,
  syncExpiry: syncAllExpiry,
  alertOwner: alertOwnerViaBot,
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

  let failed: string[];
  try {
    const results = await deps.removeFromPanels(uuid, profile.clientEmail || uuid);
    failed = results.filter((r) => !r.ok).map((r) => r.key);
  } catch (err) {
    console.error("[profile-delete] panel delete threw:", err instanceof Error ? err.message : err);
    failed = ["*"];
  }
  if (failed.length > 0) {
    console.error(JSON.stringify({ evt: "profile.delete_panel_failed", userId, uuid, panels: failed }));
    await deps.alertOwner(
      [
        "⚠️ <b>Kovra: устройство не удалено с панели</b>",
        "",
        `user <code>${escapeHtml(userId)}</code>`,
        `uuid <code>${escapeHtml(uuid)}</code>`,
        `панели: ${escapeHtml(failed.join(", "))}`,
        "",
        "Профиль оставлен, человеку предложено повторить.",
      ].join("\n"),
    );
    return "panel_failed";
  }

  await removeProfile(userId, uuid);
  try {
    await deps.syncExpiry(userId);
  } catch (err) {
    console.error("[profile-delete] expiry sync failed:", err instanceof Error ? err.message : err);
  }
  console.info(JSON.stringify({ evt: "profile.delete", userId, uuid }));
  return "deleted";
}

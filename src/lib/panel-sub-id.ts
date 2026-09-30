// src/lib/panel-sub-id.ts
//
// The 3X-UI `subId` of a device's panel clients.
//
// A 3X-UI panel serves every client's full config at /sub/<subId> on its
// subscription port, without a login. Kovra used to set subId to the
// client's e-mail, `vpn_<userId>_<Date.now()>` (the Telegram id and the
// creation time in ms, both guessable), prefixed kovra_ by the panel sync.
// Knowing a user's Telegram id and roughly when they signed up was enough to
// fetch their config from any panel whose subscription port is reachable.
//
// New devices get a random subId (96 bits) stored on the profile; the expiry
// sync writes it back unchanged. Devices created before 30.09.2026 keep the
// e-mail-shaped one they have: rewriting live clients' subIds is left to the
// owner (it changes nothing Kovra serves, since Kovra's own subscription is
// /api/sub/<token>, but it is a write to shared panels).

import { randomBytes } from "node:crypto";

/** A stored random subId: 24 lower-case hex characters. */
export const PANEL_SUB_ID_RE = /^[0-9a-f]{24}$/;

/** A fresh random subId for a new device's panel clients. */
export function newPanelSubId(): string {
  return randomBytes(12).toString("hex");
}

/**
 * The subId a device's panel clients carry: its own random one, or, for a
 * device created before random subIds, the e-mail it was created with.
 */
export function panelSubIdOf(profile: { readonly panelSubId?: unknown; readonly clientEmail: string }): string {
  const own = profile.panelSubId;
  return typeof own === "string" && PANEL_SUB_ID_RE.test(own) ? own : profile.clientEmail;
}

/** A copy of a profile without its panelSubId, for answers that leave the server. */
export function withoutPanelSubId<T extends { panelSubId?: unknown }>(profile: T): Omit<T, "panelSubId"> {
  const copy = { ...profile };
  delete copy.panelSubId;
  return copy;
}

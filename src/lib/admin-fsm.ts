// src/lib/admin-fsm.ts
//
// Tiny FSM stored in Redis for the admin inline-button flow.
//
// Why a separate module: the bot webhook already has ad-hoc "*_await" keys
// (promo_await, topup_await). The admin flow is more involved (multi-step,
// remembers selected userId across messages) so it gets its own typed state.
//
// State lives in Redis with a 30-minute TTL. If the admin walks away, the
// state expires and they'll just start over with /admin.

import { redis } from "./redis";
import { randomBytes } from "crypto";

export type AdminStep =
  | "idle"
  | "awaiting_lookup_input"      // user is typing email/username/TG ID to search
  | "awaiting_link_telegram_id"  // user picked "Link TG", needs TG ID input
  | "awaiting_balance_amount"    // user picked "Edit balance", needs amount input
  | "awaiting_broadcast_targets" // user picked "Manual targets" — needs list
  | "awaiting_broadcast_content" // targets resolved, needs text/photo/gif (any)
  | "awaiting_broadcast_buttons"; // optional inline-button DSL input

export type BroadcastMediaRef =
  | { type: "photo"; file_id: string }
  | { type: "animation"; file_id: string }
  | { type: "video"; file_id: string }
  | { type: "document"; file_id: string };

export type BroadcastBtnRef =
  | { type: "url"; text: string; url: string }
  | { type: "web_app"; text: string; url: string };

export interface BroadcastDraft {
  /** "all" = everyone with linked TG; "manual" = explicit chatIds list. */
  audience: "all" | "manual";
  /** Resolved targets. For "all" this is filled at confirm time, not earlier. */
  resolvedChatIds?: number[];
  /** Pretty preview of resolved-by-name targets, for the recap screen. */
  resolvedSummary?: { ok: number; notFound: number; noTelegram: number };
  /** Composed message body (or caption when media is attached). */
  message?: string;
  /** Optional attached media (file_id from the admin's own upload). */
  media?: BroadcastMediaRef;
  /** Optional inline keyboard, parsed from DSL. */
  keyboard?: BroadcastBtnRef[][];
}

export interface AdminState {
  step: AdminStep;
  /** userId currently being inspected (set after a successful lookup). */
  selectedUserId?: string;
  /** Snapshot of last lookup, kept short to fit Redis comfortably. */
  selectedUserSummary?: {
    primaryUserId: string;
    telegramId?: string;
    tgUsername?: string;
    email?: string;
    balance: number;
    profilesCount: number;
  };
  /** Anti-replay nonce for destructive operations. */
  pendingActionNonce?: string;
  /** What confirmation is in flight. */
  pendingAction?: "wipe_redis_only" | "wipe_with_3xui" | "unlink_tg" | "broadcast";
  /** Broadcast composer state. */
  broadcastDraft?: BroadcastDraft;
}

const TTL_SECONDS = 30 * 60;

export async function getAdminState(chatId: number): Promise<AdminState> {
  const raw = await redis.get(`admin_state:${chatId}`);
  if (!raw) return { step: "idle" };
  try {
    return typeof raw === "string" ? JSON.parse(raw) : (raw as AdminState);
  } catch {
    return { step: "idle" };
  }
}

export async function setAdminState(
  chatId: number,
  state: AdminState,
): Promise<void> {
  // Lightweight transition log. Helps debug "where did my state go" reports
  // by giving us a Vercel log line per transition.
  console.log(
    `[admin-fsm] chatId=${chatId} step=${state.step}` +
      (state.selectedUserId ? ` user=${state.selectedUserId}` : "") +
      (state.pendingAction ? ` pending=${state.pendingAction}` : ""),
  );
  await redis.set(`admin_state:${chatId}`, JSON.stringify(state), {
    ex: TTL_SECONDS,
  });
}

export async function clearAdminState(chatId: number): Promise<void> {
  console.log(`[admin-fsm] chatId=${chatId} CLEARED`);
  await redis.del(`admin_state:${chatId}`);
}

/** Generate a cryptographically-random nonce (8 hex chars) for confirm-button payloads. */
export function newNonce(): string {
  return randomBytes(4).toString("hex");
}

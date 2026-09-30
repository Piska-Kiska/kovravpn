// src/lib/sub-notices.ts
//
// The answers a subscription feed gives instead of servers, shared by every
// feed of a token (/api/sub/<token> and /api/sub/<token>/vless) so that the
// same device sees the same notice whichever URL its app polls.
//
// A notice is a 200 with a dummy vless:// line pointing at 127.0.0.1:1 and
// Happ headers (sub-info-*, announce, profile-title) that say what happened:
// an error status would make apps keep the old, working servers.

import { NextResponse } from "next/server";
import type { SubRefusal } from "./sub-access";

export const HAPP_UI: Record<string, string> = {
  "providerid": "oPZtVoIH",
  "profile-title": "base64:8J+boe+4jyBLb3ZyYSDwn4yN",
  "profile-update-interval": "1",
  "support-url": "https://t.me/KovraVPN_bot",
  "subscription-ping-onopen-enabled": "1",
  "profile-web-page-url": "https://kovravpn.com",
  "subscription-pin": "1",
  "routing-enable": "false",
  "hide-settings": "1",
};

const EMPTY_BALANCE_TITLE = "base64:" + Buffer.from("⚠️ No active plan", "utf-8").toString("base64");

export function balanceInfoHeaders(empty: boolean): Record<string, string> {
  if (!empty) {
    // Per Happ spec, omitting sub-info-text means "block not displayed".
    // Sending "0" should also disable it, but current Happ builds render a
    // literal "0" banner (observed 2026-07) — so send nothing at all.
    return {};
  }
  const text = "No active plan. Buy a plan to keep using Kovra.";
  return {
    "sub-info-color": "red",
    "sub-info-text": "base64:" + Buffer.from(text, "utf-8").toString("base64"),
    "sub-info-button-text": "Get plan",
    "sub-info-button-link": "https://kovravpn.com",
  };
}

const EMPTY_BALANCE_ANNOUNCE =
  "base64:" +
  Buffer.from(
    "No active plan. Buy a plan at kovravpn.com to keep using Kovra.",
    "utf-8",
  ).toString("base64");
const EMPTY_BALANCE_BODY = Buffer.from(
  "vless://00000000-0000-0000-0000-000000000000@127.0.0.1:1?encryption=none&type=tcp&security=none#No%20active%20plan%20-%20kovravpn.com",
).toString("base64");

// ── 1 subscription = 1 device (HWID binding) ────────────────────────────
// Happ sends x-hwid by default; non-Happ clients (v2rayN/sing-box) omit it
// and pass through unbound. A second device on the same link gets a dummy
// config telling the user to use a separate link per device.
const SECOND_DEVICE_TITLE =
  "base64:" + Buffer.from("Device limit", "utf-8").toString("base64");
const SECOND_DEVICE_TEXT =
  "One link works on one device. Use a separate link from your dashboard for each device.";
const SECOND_DEVICE_BODY = Buffer.from(
  "vless://00000000-0000-0000-0000-000000000000@127.0.0.1:1?encryption=none&type=tcp&security=none#" +
    encodeURIComponent("One device per link - kovravpn.com"),
).toString("base64");

function secondDeviceHeaders(): HeadersInit {
  return {
    ...HAPP_UI,
    "sub-info-color": "red",
    "sub-info-text": "base64:" + Buffer.from(SECOND_DEVICE_TEXT, "utf-8").toString("base64"),
    announce: "base64:" + Buffer.from(SECOND_DEVICE_TEXT, "utf-8").toString("base64"),
    "profile-title": SECOND_DEVICE_TITLE,
    "support-url": "https://t.me/KovraVPN_bot",
    "profile-web-page-url": "https://kovravpn.com",
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-store",
  };
}

// ── Deleted-subscription notice ─────────────────────────────────────────
// removeProfile sets `sub_deleted:{token}` = owner userId; the client then
// shows "buy a new plan" instead of a stale 404.
const DELETED_SUB_TITLE =
  "base64:" + Buffer.from("Subscription removed", "utf-8").toString("base64");
const DELETED_SUB_TEXT =
  "You removed this subscription. Create a new one on kovravpn.com or in the bot.";
const DELETED_SUB_BODY = Buffer.from(
  "vless://00000000-0000-0000-0000-000000000000@127.0.0.1:1?encryption=none&type=tcp&security=none#" +
    encodeURIComponent("Subscription removed - kovravpn.com"),
).toString("base64");

function deletedSubHeaders(): HeadersInit {
  return {
    ...HAPP_UI,
    "sub-info-color": "red",
    "sub-info-text": "base64:" + Buffer.from(DELETED_SUB_TEXT, "utf-8").toString("base64"),
    announce: "base64:" + Buffer.from(DELETED_SUB_TEXT, "utf-8").toString("base64"),
    "profile-title": DELETED_SUB_TITLE,
    "support-url": "https://t.me/KovraVPN_bot",
    "profile-web-page-url": "https://kovravpn.com",
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-store",
  };
}

// ── Paused device (KM-03) ───────────────────────────────────────────────
// More devices than running slots: the newest keep access, the others are
// paused (lib/device-capacity.ts) and get this notice instead of servers.
const PAUSED_TITLE = "base64:" + Buffer.from("Device paused", "utf-8").toString("base64");
const PAUSED_TEXT =
  "This device is paused: you have more devices than slots. Buy a plan or an extra slot, or delete another device.";
const PAUSED_BODY = Buffer.from(
  "vless://00000000-0000-0000-0000-000000000000@127.0.0.1:1?encryption=none&type=tcp&security=none#" +
    encodeURIComponent("Device paused - no free slot - kovravpn.com"),
).toString("base64");

function pausedHeaders(): HeadersInit {
  return {
    ...HAPP_UI,
    "sub-info-color": "red",
    "sub-info-text": "base64:" + Buffer.from(PAUSED_TEXT, "utf-8").toString("base64"),
    "sub-info-button-text": "Open Kovra",
    "sub-info-button-link": "https://kovravpn.com/dashboard",
    announce: "base64:" + Buffer.from(PAUSED_TEXT, "utf-8").toString("base64"),
    "profile-title": PAUSED_TITLE,
    "support-url": "https://t.me/KovraVPN_bot",
    "profile-web-page-url": "https://kovravpn.com",
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-store",
  };
}

function emptyHeaders(): HeadersInit {
  // No subscription-userinfo here: an expire value would trigger Happ's
  // expire message, which suppresses the sub-info block we want to show.
  return {
    ...HAPP_UI,
    ...balanceInfoHeaders(true),
    announce: EMPTY_BALANCE_ANNOUNCE,
    "profile-web-page-url": "https://kovravpn.com",
    "support-url": "https://t.me/KovraVPN_bot",
    "profile-title": EMPTY_BALANCE_TITLE,
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-store",
  };
}

/** The answer for a token that may not get servers (see lib/sub-access.ts). */
export function subRefusalResponse(refusal: SubRefusal): NextResponse {
  switch (refusal.kind) {
    case "invalid":
      return new NextResponse("Invalid token", { status: 403 });
    case "not-found":
      return new NextResponse(refusal.message, { status: 404 });
    case "deleted":
      return new NextResponse(DELETED_SUB_BODY, { status: 200, headers: deletedSubHeaders() });
    case "second-device":
      return new NextResponse(SECOND_DEVICE_BODY, { status: 200, headers: secondDeviceHeaders() });
    case "no-plan":
      return new NextResponse(EMPTY_BALANCE_BODY, { status: 200, headers: emptyHeaders() });
    case "paused":
      return new NextResponse(PAUSED_BODY, { status: 200, headers: pausedHeaders() });
  }
}

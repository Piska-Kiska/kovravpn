// src/lib/own-app.ts
//
// Whether a request names itself as our own app (the Kovra app for iPhone and
// iPad), by its User-Agent.
//
// The app's client sends exactly one shape (`device_id.rs` of the app,
// `format_user_agent`; the brand's name from its `brand.rs`):
//
//   Kovra/<version> (<platform>; appstore)
//
// Kovra ships as a store build only: the app refuses to compile its brand for
// anything but the iPhone, so there is no "Kovra-Desktop" agent to accept.
//
// This is a filter, not a proof: anyone can send a User-Agent. It is used
// where being wrong in the "yes" direction is bounded by something else - the
// one decision that reads it (lib/sub-access.ts: a redeemed "code for the app"
// lets our app take the link) also needs the link itself and the owner's code
// spent minutes ago. What the filter does there is keep another client (Happ
// on a third device, refreshing in the background) from taking what the owner
// asked for in our app.
//
// Anchored at both ends: a UA that merely carries our name somewhere is not
// our app as it ships.
//
// No imports on purpose: tests load this file under plain Node type stripping.

/** Longer than any User-Agent of ours; a longer one is not ours. */
const UA_MAX_LENGTH = 512;

const STORE_UA_RE = /^Kovra\/[^\s()]+ \([^()]+;\s*appstore\)$/;

/** Whether this User-Agent is one our own app sends. Anything else, an empty or missing one included, is false. */
export function isOwnAppUa(ua: string | null | undefined): boolean {
  if (typeof ua !== "string") return false;
  const trimmed = ua.trim();
  if (trimmed === "" || trimmed.length > UA_MAX_LENGTH) return false;
  return STORE_UA_RE.test(trimmed);
}

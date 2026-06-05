// src/lib/email.ts

/**
 * Normalize email to prevent duplicate accounts via +tag and dot tricks.
 * Gmail: strips dots and +tag, normalizes googlemail.com → gmail.com
 * Others: strips +tag only (dots may be significant)
 */
export function normalizeEmail(email: string): string {
  const raw = email.toLowerCase().trim();
  const atIdx = raw.lastIndexOf("@");
  if (atIdx < 1) return raw;

  let local = raw.slice(0, atIdx);
  const domain = raw.slice(atIdx + 1);

  const gmailLike = ["gmail.com", "googlemail.com"];
  if (gmailLike.includes(domain)) {
    local = local.replace(/\./g, "").replace(/\+.*$/, "");
    return `${local}@gmail.com`;
  }

  // Other providers: only strip +tag
  local = local.replace(/\+.*$/, "");
  return `${local}@${domain}`;
}

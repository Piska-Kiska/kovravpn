// src/lib/xpanel-multi.ts
/**
 * Vless URL builder for inbounds described by InboundEntry. Delegates
 * connection-param resolution to inbound-resolver so panel and static
 * sources are handled uniformly.
 *
 * Kept as the legacy single-line-per-inbound entrypoint used when the
 * subscription endpoint serves the historical base64 vless format. New
 * code paths should reach for xray-subscription's profile generator
 * instead, which handles split-tunneling.
 */
import { buildVlessUrl } from "./xpanel";
import { resolveInbound } from "./inbound-resolver";
import type { InboundEntry } from "./inbounds";

/**
 * Strip "[text](url)" markdown wrappers that occasionally leak into
 * 3X-UI fields when operators paste formatted text. Non-greedy capture
 * — a greedy character class can backtrack across the inner delimiters
 * and return the whole string unchanged.
 */
export function sanitizeField(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  const s = String(raw).trim();
  const m = s.match(/^\[(.+?)\]\(.+?\)$/);
  return (m ? m[1] : s).trim();
}

export async function buildVlessForInbound(
  uuid: string,
  entry: InboundEntry
): Promise<string | null> {
  const params = await resolveInbound(uuid, entry);
  if (!params) return null;

  return buildVlessUrl(
    uuid,
    params.address,
    params.port,
    params.serverName,
    params.publicKey,
    params.shortId,
    params.spiderX,
    params.fingerprint,
    params.encryption,
    (entry.flag ? entry.flag + " " : "") + entry.label,
    params.flow
  );
}

// src/lib/fetch-timeout.ts
//
// fetch() wrapper that aborts on timeout. Without this, Vercel functions can
// hang up to their hard limit (10s on Hobby) when an upstream stalls,
// causing Telegram/Enot to retry the webhook and triggering double-credit
// races. AbortController-based timeout is the standard pattern.

export interface FetchWithTimeoutInit extends RequestInit {
  /** Milliseconds. Default 5000. */
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  url: string,
  init: FetchWithTimeoutInit = {},
): Promise<Response> {
  const { timeoutMs = 5000, signal: externalSignal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Honour an externally-provided signal too.
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

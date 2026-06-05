// src/lib/indexnow.ts
//
// IndexNow is an open protocol used by Bing, Yandex, Seznam and Naver to
// receive instant notifications when URLs on a site are created, updated
// or deleted. Instead of waiting for the crawler to notice (days/weeks),
// we tell them directly and they re-crawl within minutes.
//
// Spec: https://www.indexnow.org/documentation
//
// Ownership verification: we host a text file at
//   https://proxysvpn.com/<KEY>.txt
// whose body is exactly the key. IndexNow search engines fetch this file
// before accepting any submissions. The file lives in /public so Next.js
// serves it at the site root.
//
// Usage — inside any server code after content changes:
//   await pingIndexNow(["https://proxysvpn.com/guide"]);
//
// Failures are logged but never thrown: SEO notifications must not break
// user-facing requests.

const KEY = process.env.INDEXNOW_KEY || "304bed382c0140e9b8e8359700e3db34";
const HOST = "proxysvpn.com";
// Any of the IndexNow endpoints accept submissions and forward to the rest
// of the network. We pick Bing's endpoint — it's the most active consumer
// for our target market.
const ENDPOINT = "https://api.indexnow.org/indexnow";
// IndexNow caps a single batch at 10k URLs. We cap at 100 to fit comfortably
// inside Vercel's serverless request/response size limits and avoid accidental
// floods.
const MAX_URLS = 100;

export type IndexNowResult =
  | { ok: true; submitted: number }
  | { ok: false; status?: number; error: string };

/**
 * Push a list of URLs to IndexNow. Returns the result instead of throwing
 * so callers can decide whether to log or retry.
 *
 * All URLs must belong to {@link HOST} — IndexNow rejects mixed-host batches.
 */
export async function pingIndexNow(urls: string[]): Promise<IndexNowResult> {
  const clean = urls
    .map((u) => u.trim())
    .filter((u) => u.startsWith(`https://${HOST}/`) || u === `https://${HOST}`)
    .slice(0, MAX_URLS);

  if (clean.length === 0) {
    return { ok: false, error: "No valid URLs (must be https://" + HOST + "/*)" };
  }

  const body = {
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList: clean,
  };

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    clearTimeout(t);

    // 200/202 → accepted. 422 → KeyLocation mismatch (site not verified yet).
    // 403 → key invalid. 429 → rate limit. Non-2xx means retry later.
    if (r.ok || r.status === 202) {
      console.log("[indexnow] submitted", clean.length, "URLs");
      return { ok: true, submitted: clean.length };
    }
    const text = await r.text().catch(() => "");
    console.warn("[indexnow] non-OK", r.status, text.slice(0, 200));
    return { ok: false, status: r.status, error: text.slice(0, 200) || r.statusText };
  } catch (err) {
    clearTimeout(t);
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[indexnow] fetch failed", msg);
    return { ok: false, error: msg };
  }
}

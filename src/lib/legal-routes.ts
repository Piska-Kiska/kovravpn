// src/lib/legal-routes.ts
//
// The app view of the pages our app opens: /privacy, /terms and /support
// with `?src=app` (the app's src/legal.ts, held to its App Store allowlist,
// src/externalUrl.ts, which accepts these pages with exactly this query).
//
// The app ships through the App Store without in-app purchases (Guideline
// 3.1.3(f)), so a page it opens must not lead to the prices: the app view
// has no way home (the home page sells), keeps `?src=app` on its links to
// the other pages, and shows the Telegram bot, which sells too, as plain
// text, never as a link. Everything else on the page is the same.
//
// No imports: tests load this file under plain Node type stripping.

export const APP_SOURCE_PARAM = "src";
export const APP_SOURCE_VALUE = "app";

/** Exactly this spelling: the app compares it as a whole. */
export const APP_VIEW_QUERY = `?${APP_SOURCE_PARAM}=${APP_SOURCE_VALUE}`;

/** A page's `searchParams`, as Next.js hands them over. */
export type PageSearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** Whether a page was asked for in its app view. A repeated or empty `src` is the web view. */
export function isAppView(params: PageSearchParams | undefined): boolean {
  return params?.[APP_SOURCE_PARAM] === APP_SOURCE_VALUE;
}

/** `path` with the app view's query when `appView` is set. */
export function legalHref(path: string, appView: boolean): string {
  return appView ? `${path}${APP_VIEW_QUERY}` : path;
}

/**
 * Whether an absolute or root-relative address is a page in its app view:
 * its `src` is exactly `app`. Anything that does not parse is not.
 * O(length of the address).
 */
export function isAppViewUrl(url: string): boolean {
  try {
    const params = new URL(url, "https://kovravpn.com").searchParams;
    return params.getAll(APP_SOURCE_PARAM).length === 1 && params.get(APP_SOURCE_PARAM) === APP_SOURCE_VALUE;
  } catch {
    return false;
  }
}

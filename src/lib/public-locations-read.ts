// src/lib/public-locations-read.ts
//
// The bounded, fail-safe read of the country list: it takes the registry
// source as a parameter (no Redis, no Next here), so the tests can feed it a
// fake and the Next glue (public-locations-server.ts) feeds it the real one.
//
// Whatever goes wrong - the source throws, answers nothing, answers entries
// without a usable flag, or is slower than the timeout - the answer is null
// and the pages show no list at all. They never invent one.

import { nameCountries, publicCountries, type PublicCountryView, type RegistryEntryLike } from "./public-locations";

/** Upper bound on the registry read, so a slow Redis cannot hold a build. */
export const REGISTRY_READ_TIMEOUT_MS = 2500;

/** Where the entries come from: null means "no valid registry". */
export type RegistryReader = () => Promise<readonly RegistryEntryLike[] | null>;

/**
 * The countries behind the registry entries `read` returns, with names in
 * every site language, or null. Only a country leaves this function: the
 * entries it receives carry connection parameters and are dropped here.
 * O(n log n) in the number of entries.
 */
export async function readPublicCountries(
  read: RegistryReader,
  timeoutMs: number = REGISTRY_READ_TIMEOUT_MS,
): Promise<PublicCountryView[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const entries = await Promise.race([read(), timeout]);
    if (!entries) return null;
    const countries = publicCountries(entries);
    return countries.length > 0 ? nameCountries(countries) : null;
  } catch (err) {
    // The message only: an error object from a client library can carry the
    // request it was making.
    console.error("[public-locations] registry read failed:", err instanceof Error ? err.message : "unknown error");
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

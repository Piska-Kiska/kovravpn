// src/lib/public-locations-server.ts
//
// Reads the live registry for the public pages. Server only: it imports the
// Redis client, and the registry entries it reads carry connection
// parameters. No client component may import this file (a test walks the
// imports); a page passes the result down as props, and what it holds is
// only countries (public-locations.ts).
//
// The read is cached with unstable_cache (the Redis client's fetches are
// no-store, which would make every page that reads it dynamic) and the pages
// are statically rendered and revalidated (ISR), so the registry is read at
// build time and then at most once per revalidation window, never per
// visitor. A failed read is not cached: it throws out of the cached function
// and comes back here as null.
//
// When the registry cannot be read (no Redis at build time, a timeout, an
// empty key) the answer is null and the pages show no list at all. They never
// fall back to inbounds.ts DEFAULT_REGISTRY, which names a location Kovra
// does not have.

import { unstable_cache } from "next/cache";
import { getLiveEnabledInbounds } from "./inbounds";
import type { PublicCountryView } from "./public-locations";
import { readPublicCountries } from "./public-locations-read";

/** How long a read of the registry is reused: the pages' ISR window. */
export const PUBLIC_COUNTRIES_REVALIDATE_S = 3600;

const readCached = unstable_cache(
  async (): Promise<PublicCountryView[]> => {
    const countries = await readPublicCountries(getLiveEnabledInbounds);
    if (!countries) throw new Error("public country list unavailable");
    return countries;
  },
  ["public-countries"],
  { revalidate: PUBLIC_COUNTRIES_REVALIDATE_S, tags: ["public-countries"] },
);

/** The countries Kovra connects to, from the live registry, or null. */
export async function getPublicCountries(): Promise<PublicCountryView[] | null> {
  try {
    return await readCached();
  } catch {
    return null;
  }
}

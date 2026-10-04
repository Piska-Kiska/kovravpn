// src/app/page.tsx: the Kovra landing.
//
// A server component around the client view (src/app/HomeView.tsx), so the
// page can read what only the server knows: the countries in the live
// registry. Only countries cross into the view (public-locations.ts); the
// registry entries behind them carry connection parameters and never leave
// this file's server side.
//
// Statically rendered and revalidated: the registry is read at build time and
// then at most once per window, never per visitor. When it cannot be read the
// page simply shows no list.
import HomeView from "./HomeView";
import { homeFaq } from "@/lib/home-copy";
import { getPublicCountries } from "@/lib/public-locations-server";
import { buildFaqPageSchema, jsonLd } from "@/lib/structured-data";

// The same window as the cached registry read (PUBLIC_COUNTRIES_REVALIDATE_S
// in src/lib/public-locations-server.ts); a segment option must be a literal.
export const revalidate = 3600;

export default async function Page() {
  const countries = await getPublicCountries();
  return (
    <>
      {/* The server renders English, so the markup carries the English FAQ, word for
          word what the visible accordion shows before the visitor's language is applied. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(buildFaqPageSchema(homeFaq("en"))) }}
      />
      <HomeView countries={countries} />
    </>
  );
}

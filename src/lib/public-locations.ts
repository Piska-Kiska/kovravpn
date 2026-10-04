// src/lib/public-locations.ts
//
// The countries the public pages show, derived from the server registry
// (inbounds:registry, read in public-locations-server.ts). No I/O here, so
// the client pages and the tests share it.
//
// Only a country leaves this module: its ISO code, read from the entry's
// flag emoji, that flag and the country's name in each site language. Never a
// key, label, address, port, SNI or key material: this repository is public
// and the pages are crawled. Labels are ignored on purpose ("USA New York"
// names a city, not what we sell).
//
// The list is never hardcoded and never counted in copy: a location that is
// added to or disabled in the registry appears or disappears at the next
// revalidation of the page.

import { CABINET_LANGS_ORDER, type Lang } from "@/i18n/resolve";

/** The fields of a registry entry this module reads (InboundEntry has more). */
export interface RegistryEntryLike {
  flag?: string;
  enabled: boolean;
  priority: number;
}

export interface PublicCountry {
  /** ISO 3166-1 alpha-2, upper case ("DE"). */
  code: string;
  /** The flag emoji the registry carries for it. */
  flag: string;
}

/**
 * A country with its name in every site language, written on the server: the
 * names come from the runtime's ICU data, and a browser with older data would
 * spell some of them differently than the HTML it hydrates.
 */
export interface PublicCountryView extends PublicCountry {
  names: Readonly<Record<Lang, string>>;
}

/**
 * Countries kept off a first screen (the hero visual). Owner, 02.10.2026:
 * Russia stays in the app and in the full list further down the page, but
 * a foreign visitor's first impression should not read "a Russian service".
 */
export const FIRST_SCREEN_EXCLUDED: readonly string[] = ["RU"];

const REGIONAL_A = 0x1f1e6;
const REGIONAL_Z = 0x1f1ff;

/** "🇩🇪" -> "DE"; anything that is not exactly two regional indicators -> null. O(1). */
export function isoFromFlag(flag: string | undefined | null): string | null {
  if (typeof flag !== "string") return null;
  const cps = Array.from(flag.trim(), (c) => c.codePointAt(0) ?? 0);
  if (cps.length !== 2) return null;
  if (!cps.every((cp) => cp >= REGIONAL_A && cp <= REGIONAL_Z)) return null;
  return cps.map((cp) => String.fromCharCode(cp - REGIONAL_A + 65)).join("");
}

/** "DE" -> "🇩🇪". */
export function flagFromIso(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) throw new RangeError(`not an ISO country code: ${code}`);
  return Array.from(code, (c) => String.fromCodePoint(REGIONAL_A + c.charCodeAt(0) - 65)).join("");
}

/**
 * Enabled entries -> distinct countries in registry priority order (lowest
 * first; the first entry of a country decides its place). Entries without a
 * valid flag are skipped rather than guessed. `exclude` drops ISO codes.
 * O(n log n) for the sort.
 */
export function publicCountries(
  entries: readonly RegistryEntryLike[],
  opts: { exclude?: readonly string[] } = {},
): PublicCountry[] {
  const exclude = new Set((opts.exclude ?? []).map((c) => c.toUpperCase()));
  const sorted = entries.filter((e) => e && e.enabled === true).slice().sort((a, b) => a.priority - b.priority);
  const seen = new Set<string>();
  const out: PublicCountry[] = [];
  for (const e of sorted) {
    const code = isoFromFlag(e.flag);
    if (!code || seen.has(code) || exclude.has(code)) continue;
    seen.add(code);
    out.push({ code, flag: flagFromIso(code) });
  }
  return out;
}

/** The same list without the first-screen exclusions. */
export function firstScreenCountries<T extends PublicCountry>(all: readonly T[]): T[] {
  const exclude = new Set(FIRST_SCREEN_EXCLUDED);
  return all.filter((c) => !exclude.has(c.code));
}

const displayNames = new Map<string, Intl.DisplayNames | null>();

function displayNamesFor(lang: string): Intl.DisplayNames | null {
  if (displayNames.has(lang)) return displayNames.get(lang) ?? null;
  let dn: Intl.DisplayNames | null = null;
  try {
    dn = new Intl.DisplayNames([lang, "en"], { type: "region" });
  } catch {
    dn = null;
  }
  displayNames.set(lang, dn);
  return dn;
}

/**
 * The country's name in `lang` ("GB", "en" -> "United Kingdom"), from the
 * runtime's Intl data; falls back to the code where Intl.DisplayNames is
 * missing or does not know it.
 */
export function countryName(code: string, lang: string): string {
  try {
    return displayNamesFor(lang)?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Adds each country's name in every site language. O(n * languages). */
export function nameCountries(countries: readonly PublicCountry[]): PublicCountryView[] {
  return countries.map((c) => ({
    code: c.code,
    flag: c.flag,
    names: Object.fromEntries(CABINET_LANGS_ORDER.map((lang) => [lang, countryName(c.code, lang)])) as Record<Lang, string>,
  }));
}

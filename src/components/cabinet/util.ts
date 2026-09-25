// src/components/cabinet/util.ts
// Small helpers shared by the cabinet components and pages.
import type { CSSProperties } from "react";

/** Joins truthy class names. */
export function cx(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Typed custom properties for inline styles: style={cssVars({ "--i": 2 })}. */
export function cssVars(vars: Readonly<Record<`--${string}`, string | number>>): CSSProperties {
  return vars as CSSProperties;
}

/** Shape of the JSON bodies our auth and account routes return. */
export interface ApiBody {
  success?: boolean;
  error?: unknown;
  code?: unknown;
  verified?: boolean;
  [key: string]: unknown;
}

/**
 * Parses a JSON response body without throwing: a non-JSON body (an HTML
 * error page, an empty 502) becomes {}, so callers show a localized error
 * for the HTTP status instead of a misleading "connection problem".
 */
export async function readJson(res: Response): Promise<ApiBody> {
  try {
    const v: unknown = await res.json();
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as ApiBody) : {};
  } catch {
    return {};
  }
}

/** Email shape check used by the auth forms (the server validates again). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

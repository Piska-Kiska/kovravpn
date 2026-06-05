// src/lib/happ-crypto.ts
//
// Encrypts plain URLs into happ://crypt4/<base64> links.
//
// Strategy:
//   1. Local RSA-4096 PKCS#1 v1.5 encryption with the OFFICIAL public key
//      published in Happ's docs (https://www.happ.su/main/dev-docs/crypto-link).
//      This guarantees the resulting crypt4 link uses the same key that's
//      embedded in the Happ application, so the app can decrypt it.
//   2. Fallback to crypto.happ.su API only if local encryption fails (e.g.
//      payload too long for RSA-4096 PKCS#1, which caps at 501 bytes).
//
// Why not crypt5? crypto.happ.su API v2 returns crypt5 by default, but in
// practice those keys don't match what's embedded in client builds — reports
// of "ошибка 39 / no server links" confirmed crypt4/5 from the API fail to
// decrypt on iOS Happ. crypt4 with the documented public key works.

import { redis } from "./redis";
import { createHash, publicEncrypt, constants } from "crypto";

// Official RSA-4096 public key for crypt4 encryption.
// Source: https://www.happ.su/main/dev-docs/crypto-link
const HAPP_CRYPT4_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAlBetA0wjbaj+h7oJ/d/h
pNrXvAcuhOdFGEFcfCxSWyLzWk4SAQ05gtaEGZyetTax2uqagi9HT6lapUSUe2S8
nMLJf5K+LEs9TYrhhBdx/B0BGahA+lPJa7nUwp7WfUmSF4hir+xka5ApHjzkAQn6
cdG6FKtSPgq1rYRPd1jRf2maEHwiP/e/jqdXLPP0SFBjWTMt/joUDgE7v/IGGB0L
Q7mGPAlgmxwUHVqP4bJnZ//5sNLxWMjtYHOYjaV+lixNSfhFM3MdBndjpkmgSfmg
D5uYQYDL29TDk6Eu+xetUEqry8ySPjUbNWdDXCglQWMxDGjaqYXMWgxBA1UKjUBW
wbgr5yKTJ7mTqhlYEC9D5V/LOnKd6pTSvaMxkHXwk8hBWvUNWAxzAf5JZ7EVE3jt
0j682+/hnmL/hymUE44yMG1gCcWvSpB3BTlKoMnl4yrTakmdkbASeFRkN3iMRewa
IenvMhzJh1fq7xwX94otdd5eLB2vRFavrnhOcN2JJAkKTnx9dwQwFpGEkg+8U613
+Tfm/f82l56fFeoFN98dD2mUFLFZoeJ5CG81ZeXrH83niI0joX7rtoAZIPWzq3Y1
Zb/Zq+kK2hSIhphY172Uvs8X2Qp2ac9UoTPM71tURsA9IvPNvUwSIo/aKlX5KE3I
VE0tje7twWXL5Gb1sfcXRzsCAwEAAQ==
-----END PUBLIC KEY-----`;

const HAPP_API_FALLBACK = "https://crypto.happ.su/api-v2.php";
const CACHE_TTL_SEC = 24 * 60 * 60;

export interface HappEncryptResult {
  link: string;
  cached: boolean;
}

interface ApiResponseJson {
  link?: string;
  encrypted?: string;
  url?: string;
  result?: string;
  data?: string;
}

export async function encryptHappLink(
  plainUrl: string,
  cacheKey?: string
): Promise<HappEncryptResult> {
  if (!/^[a-z][a-z0-9+\-.]*:\/\//i.test(plainUrl)) {
    throw new Error("plainUrl must be a full URL with scheme");
  }

  if (cacheKey) {
    try {
      const cached = await redis.get(cacheRedisKey(cacheKey, plainUrl));
      if (typeof cached === "string" && cached.startsWith("happ://")) {
        return { link: cached, cached: true };
      }
    } catch {
      /* cache miss → fresh encrypt */
    }
  }

  let link: string | null = null;

  // Primary: local RSA-4096 PKCS#1 v1.5 with the official Happ public key
  try {
    const buffer = Buffer.from(plainUrl, "utf8");
    if (buffer.length > 501) {
      throw new Error(
        `plainUrl too long for RSA-4096 PKCS#1 (${buffer.length} > 501 bytes)`
      );
    }
    const encrypted = publicEncrypt(
      {
        key: HAPP_CRYPT4_PUBLIC_KEY,
        padding: constants.RSA_PKCS1_PADDING,
      },
      buffer
    );
    link = `happ://crypt4/${encrypted.toString("base64")}`;
  } catch (err) {
    console.warn(
      "[happ-crypto] local encrypt failed, falling back to API:",
      err instanceof Error ? err.message : err
    );
  }

  // Fallback: remote crypto.happ.su API (produces crypt5)
  if (!link) {
    link = await encryptViaRemoteApi(plainUrl);
  }

  if (cacheKey) {
    try {
      await redis.set(cacheRedisKey(cacheKey, plainUrl), link, {
        ex: CACHE_TTL_SEC,
      });
    } catch {
      /* non-fatal */
    }
  }

  return { link, cached: false };
}

async function encryptViaRemoteApi(plainUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(HAPP_API_FALLBACK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: plainUrl }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Happ API HTTP ${res.status}`);
    const text = (await res.text()).trim();
    const link = extractHappLink(text);
    if (!link) {
      throw new Error(
        `Happ API returned unparseable response: ${text.slice(0, 200)}`
      );
    }
    return link;
  } finally {
    clearTimeout(timeout);
  }
}

function extractHappLink(raw: string): string | null {
  if (!raw) return null;
  if (raw.startsWith("happ://")) return raw;
  try {
    const j: ApiResponseJson = JSON.parse(raw);
    for (const c of [j.link, j.encrypted, j.url, j.result, j.data]) {
      if (typeof c === "string" && c.startsWith("happ://")) return c;
    }
  } catch {
    /* not JSON */
  }
  const m = raw.match(/happ:\/\/crypt[1-9][0-9]*\/[A-Za-z0-9+/=]+/);
  return m ? m[0] : null;
}

function cacheRedisKey(cacheKey: string, plainUrl: string): string {
  const hash = createHash("sha256").update(plainUrl).digest("hex").slice(0, 16);
  return `happ_link:${cacheKey}:${hash}`;
}

export async function invalidateHappLink(
  cacheKey: string,
  plainUrl: string
): Promise<void> {
  try {
    await redis.del(cacheRedisKey(cacheKey, plainUrl));
  } catch {
    /* non-fatal */
  }
}

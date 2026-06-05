// src/lib/features.ts
// Centralized feature flags. Used on client and server.
// To re-enable Enot crypto: set NEXT_PUBLIC_ENOT_CRYPTO_ENABLED=true in Vercel and redeploy.
//
// IMPORTANT: when adding new flags, prefix with NEXT_PUBLIC_ for client-side access.
// Without this prefix, process.env.X is undefined in the browser bundle.

export const features = {
  /** Enot.io crypto invoices (BTC/ETH/USDT/LTC/TRX). Hidden in beta. */
  enotCryptoEnabled: process.env.NEXT_PUBLIC_ENOT_CRYPTO_ENABLED === "true",
} as const;

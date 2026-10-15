import type { NextConfig } from "next";

/**
 * Who may show the site inside a frame (audit 15.10.2026, item 5). Until now
 * anyone could: the sign-in, the cabinet and its payment buttons could be laid
 * under a decoy page and clicked through it. Allowed:
 *
 * - the site itself;
 * - Telegram: the Mini App (`/tg`) runs in a frame of web.telegram.org, and
 *   what it opens in the same frame must load there too. Inside a frame of
 *   Telegram our cookie is a third party's and is not sent, and Telegram
 *   draws nothing over a Mini App, so this opens no clickjacking.
 *
 * CSP only, without X-Frame-Options: it cannot name more than one origin, and
 * a browser that honoured it over this list would break the Mini App in
 * Telegram Web. Every browser in use reads frame-ancestors.
 */
const FRAME_ANCESTORS_CSP = "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Every page: no framing by strangers, no type sniffing, and only the
        // origin in the referrer to other sites (the /add/<token> address
        // carries a subscription token).
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: FRAME_ANCESTORS_CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

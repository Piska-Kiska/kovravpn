// src/app/api/og/route.tsx
//
// Dynamic Open Graph image generator. Produces a 1200×630 PNG with the
// page's title rendered on top of the brand visual.
//
// Usage (from page metadata):
//   openGraph: { images: ["/api/og?title=Как+подключить+VPN&subtitle=Инструкция"] }
//
// The `next/og` runtime compiles a tiny JSX tree into PNG on the edge.
// It supports a strict subset of CSS — flexbox, absolute positioning,
// colors, gradients, basic fonts. No external images (we draw the logo
// inline with SVG to avoid an extra fetch per image generation).
//
// Caching: ImageResponse sets Cache-Control automatically. We add a long
// max-age so Telegram/VK/Twitter only fetch once per unique URL.
//
// Ref: https://nextjs.org/docs/app/api-reference/functions/image-response

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

const WIDTH = 1200;
const HEIGHT = 630;

// Keep these in sync with Tailwind tokens in tailwind.config.ts
const BG = "#1a1d23";
const BG_SECONDARY = "#252930";
const ACCENT = "#10B981";
const TEXT = "#f1f3f7";
const TEXT_SECONDARY = "#9ca3af";

const MAX_TITLE = 80;
const MAX_SUBTITLE = 120;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") || "ПроксисВпнович").slice(0, MAX_TITLE);
  const subtitle = (searchParams.get("subtitle") || "VPN для всех устройств").slice(0, MAX_SUBTITLE);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: `linear-gradient(135deg, ${BG} 0%, ${BG_SECONDARY} 100%)`,
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Decorative accent blob in the corner */}
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: ACCENT,
            opacity: 0.15,
            filter: "blur(80px)",
            display: "flex",
          }}
        />

        {/* Top: logo + brand name */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 900,
              color: BG,
            }}
          >
            П
          </div>
          <span style={{ color: TEXT, fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" }}>
            ПроксисВпнович
          </span>
        </div>

        {/* Middle: page-specific title + subtitle */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
          <h1
            style={{
              color: TEXT,
              fontSize: title.length > 50 ? 64 : 80,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              margin: 0,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              color: TEXT_SECONDARY,
              fontSize: 32,
              lineHeight: 1.3,
              margin: 0,
              fontWeight: 400,
            }}
          >
            {subtitle}
          </p>
        </div>

        {/* Bottom: domain + tagline */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: ACCENT, fontSize: 28, fontWeight: 600, letterSpacing: "-0.01em" }}>
            proxysvpn.com
          </span>
          <span style={{ color: TEXT_SECONDARY, fontSize: 22, fontWeight: 500 }}>
            от 10 ₽ · 100 ₽/мес за устройство
          </span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // Cache aggressively — the output only changes if query params change.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}

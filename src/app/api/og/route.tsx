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
const BG = "#050506";
const BG_SECONDARY = "#0f0f11";
const ACCENT = "#C5A572";
const TEXT = "#f5f5f7";
const TEXT_SECONDARY = "#86868b";

const MAX_TITLE = 80;
const MAX_SUBTITLE = 120;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") || "Kovra").slice(0, MAX_TITLE);
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
              background: "linear-gradient(135deg, #2C2C2E 0%, #1C1C1E 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="30" height="30" viewBox="0 0 48 48" fill="none">
              <path d="M14 8 L14 40" stroke="#F5F5F7" strokeWidth="6" strokeLinecap="round" />
              <path d="M16 22 L34 8" stroke="#C5A572" strokeWidth="6" strokeLinecap="round" />
              <path d="M16 26 L34 40" stroke="#C5A572" strokeWidth="6" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ color: TEXT, fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Kovra<span style={{ color: "#C5A572" }}>.</span>
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
            kovravpn.com
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

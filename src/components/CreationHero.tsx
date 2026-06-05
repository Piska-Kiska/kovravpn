// src/components/CreationHero.tsx
"use client";

import { useState } from "react";
import Link from "next/link";

export default function CreationHero() {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="relative w-full flex flex-col items-center justify-center py-12 md:py-20 select-none">
      {/* ── Main composition ──────────────────────── */}
      <div
        className="relative w-full max-w-4xl mx-auto flex items-center justify-center h-[280px] md:h-[400px]"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Left hand/finger */}
        <div
          className="absolute right-1/2 mr-[40px] md:mr-[60px] transition-transform duration-700 ease-out"
          style={{ transform: hovered ? "translateX(24px)" : "translateX(0)" }}
        >
          <svg
            viewBox="0 0 300 120"
            className="w-[35vw] max-w-[300px] h-auto"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Forearm */}
            <path
              d="M0 45 C20 42, 60 38, 120 36 L120 84 C60 82, 20 78, 0 75Z"
              fill="url(#armGradL)"
              opacity="0.7"
            />
            {/* Hand/palm */}
            <path
              d="M120 30 C140 28, 170 26, 200 32 C210 34, 215 40, 218 48
                 L220 52
                 C222 58, 220 66, 215 72 C210 78, 200 82, 185 84
                 C170 86, 140 84, 120 82Z"
              fill="url(#handGradL)"
            />
            {/* Index finger — the reaching one */}
            <path
              d="M218 44 C230 40, 255 38, 275 40
                 C285 41, 292 44, 296 48 C298 50, 298 54, 296 56
                 C292 60, 285 63, 275 64
                 C255 66, 230 64, 220 56Z"
              fill="url(#fingerGradL)"
            />
            {/* Finger highlight */}
            <path
              d="M250 42 C265 41, 280 43, 290 47
                 C288 44, 278 41, 260 41Z"
              fill="rgba(200,200,240,0.15)"
            />
            {/* Fingertip glow when hovered */}
            <circle
              cx="296"
              cy="52"
              r="8"
              className="transition-opacity duration-700"
              fill="url(#tipGlowL)"
              opacity={hovered ? 0.8 : 0}
            />
            <defs>
              <linearGradient id="armGradL" x1="0" y1="60" x2="120" y2="60" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#1a1a2e" />
                <stop offset="1" stopColor="#2a2a48" />
              </linearGradient>
              <linearGradient id="handGradL" x1="120" y1="55" x2="220" y2="55" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#3a3a58" />
                <stop offset="1" stopColor="#5a5a80" />
              </linearGradient>
              <linearGradient id="fingerGradL" x1="218" y1="52" x2="298" y2="52" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#5a5a80" />
                <stop offset="0.7" stopColor="#7a7aaa" />
                <stop offset="1" stopColor="#9a9acc" />
              </linearGradient>
              <radialGradient id="tipGlowL" cx="296" cy="52" r="8" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#818cf8" />
                <stop offset="1" stopColor="transparent" />
              </radialGradient>
            </defs>
          </svg>
        </div>

        {/* ── Center VPN button ────────────────────── */}
        <Link
          href="/register"
          className="relative z-20 group"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Outer glow rings */}
          <div
            className={`absolute inset-0 -m-6 rounded-full transition-all duration-700 ${
              hovered
                ? "bg-indigo-500/10 shadow-[0_0_80px_rgba(99,102,241,0.4)]"
                : "bg-transparent shadow-[0_0_40px_rgba(99,102,241,0.15)]"
            }`}
          />
          <div
            className={`absolute inset-0 -m-3 rounded-full border transition-all duration-700 ${
              hovered
                ? "border-indigo-400/40 scale-110"
                : "border-indigo-500/20 scale-100"
            }`}
          />

          {/* Shield icon */}
          <div
            className={`relative w-20 h-20 md:w-28 md:h-28 flex items-center justify-center rounded-full border-2 transition-all duration-500 ${
              hovered
                ? "border-indigo-400 bg-indigo-600/30 scale-110"
                : "border-indigo-500/50 bg-indigo-950/60 scale-100"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className={`w-8 h-8 md:w-12 md:h-12 transition-all duration-500 ${
                hovered ? "text-indigo-300" : "text-indigo-500"
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" />
              <path
                d="M9 12l2 2 4-4"
                className={`transition-all duration-500 ${
                  hovered ? "opacity-100" : "opacity-40"
                }`}
              />
            </svg>
          </div>
        </Link>

        {/* Right hand/finger (mirrored) */}
        <div
          className="absolute left-1/2 ml-[40px] md:ml-[60px] transition-transform duration-700 ease-out"
          style={{ transform: hovered ? "translateX(-24px) scaleX(-1)" : "scaleX(-1)" }}
        >
          <svg
            viewBox="0 0 300 120"
            className="w-[35vw] max-w-[300px] h-auto"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Same paths, mirrored via scaleX(-1) on parent */}
            <path
              d="M0 45 C20 42, 60 38, 120 36 L120 84 C60 82, 20 78, 0 75Z"
              fill="url(#armGradR)"
              opacity="0.7"
            />
            <path
              d="M120 30 C140 28, 170 26, 200 32 C210 34, 215 40, 218 48
                 L220 52
                 C222 58, 220 66, 215 72 C210 78, 200 82, 185 84
                 C170 86, 140 84, 120 82Z"
              fill="url(#handGradR)"
            />
            <path
              d="M218 44 C230 40, 255 38, 275 40
                 C285 41, 292 44, 296 48 C298 50, 298 54, 296 56
                 C292 60, 285 63, 275 64
                 C255 66, 230 64, 220 56Z"
              fill="url(#fingerGradR)"
            />
            <path
              d="M250 42 C265 41, 280 43, 290 47
                 C288 44, 278 41, 260 41Z"
              fill="rgba(200,200,240,0.15)"
            />
            <circle
              cx="296"
              cy="52"
              r="8"
              className="transition-opacity duration-700"
              fill="url(#tipGlowR)"
              opacity={hovered ? 0.8 : 0}
            />
            <defs>
              <linearGradient id="armGradR" x1="0" y1="60" x2="120" y2="60" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#1a1a2e" />
                <stop offset="1" stopColor="#2a2a48" />
              </linearGradient>
              <linearGradient id="handGradR" x1="120" y1="55" x2="220" y2="55" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#3a3a58" />
                <stop offset="1" stopColor="#5a5a80" />
              </linearGradient>
              <linearGradient id="fingerGradR" x1="218" y1="52" x2="298" y2="52" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#5a5a80" />
                <stop offset="0.7" stopColor="#7a7aaa" />
                <stop offset="1" stopColor="#9a9acc" />
              </linearGradient>
              <radialGradient id="tipGlowR" cx="296" cy="52" r="8" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#818cf8" />
                <stop offset="1" stopColor="transparent" />
              </radialGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* ── Label under the button ───────────────── */}
      <p
        className={`mt-4 text-sm uppercase tracking-[0.3em] transition-all duration-500 ${
          hovered ? "text-indigo-300" : "text-slate-600"
        }`}
      >
        Подключиться
      </p>

      {/* ── Spark line between fingers (appears on hover) ── */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div
          className={`h-[2px] rounded-full bg-gradient-to-r from-transparent via-indigo-400 to-transparent transition-all duration-700 ${
            hovered ? "w-[200px] md:w-[280px] opacity-60" : "w-0 opacity-0"
          }`}
          style={{ marginTop: "-20px" }}
        />
      </div>
    </div>
  );
}

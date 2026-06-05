// src/components/VpnToggle.tsx
"use client";

import { useState } from "react";
import { Shield, Check } from "lucide-react";
import Link from "next/link";

export default function VpnToggle() {
  const [active, setActive] = useState(false);

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Main toggle circle */}
      <button
        onClick={() => setActive(!active)}
        className={`relative w-44 h-44 md:w-56 md:h-56 rounded-full transition-all duration-500 cursor-pointer group ${
          active ? "nm-circle-pressed" : "nm-circle"
        }`}
      >
        {/* Inner ring */}
        <div
          className={`absolute inset-4 md:inset-5 rounded-full flex items-center justify-center transition-all duration-500 ${
            active
              ? "bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-[0_0_40px_rgba(99,102,241,0.35)]"
              : "nm-circle-pressed group-hover:shadow-[inset_3px_3px_8px_var(--color-nm-dark),inset_-3px_-3px_8px_var(--color-nm-light),0_0_20px_rgba(99,102,241,0.1)]"
          }`}
        >
          {active ? (
            <Check className="w-16 h-16 md:w-20 md:h-20 text-white drop-shadow-lg" strokeWidth={2.5} />
          ) : (
            <Shield
              className="w-16 h-16 md:w-20 md:h-20 text-nm-text-secondary group-hover:text-nm-accent transition-colors duration-300"
              strokeWidth={1.5}
            />
          )}
        </div>

        {/* Pulse ring when active */}
        {active && (
          <div className="absolute inset-0 rounded-full border-2 border-indigo-400/30 animate-ping" />
        )}
      </button>

      {/* Status text */}
      <div className="text-center">
        <p
          className={`font-heading text-lg font-semibold transition-colors duration-300 ${
            active ? "text-nm-accent" : "text-nm-text-secondary"
          }`}
        >
          {active ? "Защита активна" : "Нажми для защиты"}
        </p>
        <p className="text-sm text-nm-text-secondary mt-1">
          {active ? "Амстердам • 88 мс • Зашифровано" : "Демо-режим"}
        </p>
      </div>

      {/* CTA under toggle */}
      <Link
        href="/register"
        className="nm-btn-accent px-8 py-3.5 font-semibold text-sm tracking-wide"
      >
        Подключиться за 10 ₽
      </Link>
    </div>
  );
}

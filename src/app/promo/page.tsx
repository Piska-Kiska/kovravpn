// src/app/promo/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Oswald } from "next/font/google";

/**
 * Promo page is admin/marketing-only — never meant to appear in search
 * results. noindex keeps it out of SERPs even if someone shares the URL.
 */
export const metadata: Metadata = {
  title: "Промо",
  robots: { index: false, follow: false },
};

const oswald = Oswald({
  subsets: ["cyrillic", "latin"],
  variable: "--font-oswald",
  weight: ["700"],
  display: "swap",
});

/* ── Marquee ticker ─────────────────────────────────── */
const TICKER_ITEMS = [
  "БЕЗОПАСНОСТЬ",
  "СКОРОСТЬ",
  "ЕВРОПА",
  "ЗАЩИТА",
  "VLESS REALITY",
  "АМСТЕРДАМ",
  "ФРАНКФУРТ",
  "ЛОНДОН",
  "НИЗКИЙ ПИНГ",
  "ШИФРОВАНИЕ",
];

function Marquee({ reverse = false }: { reverse?: boolean }) {
  const text = TICKER_ITEMS.join(" » ") + " » ";
  return (
    <div className="bg-indigo-600 overflow-hidden whitespace-nowrap py-2.5 select-none">
      <div
        className={`inline-flex ${reverse ? "animate-marquee-reverse" : "animate-marquee"}`}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="text-sm font-bold tracking-[0.2em] text-white/90 px-4"
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */

export default function PromoPage() {
  return (
    <div className={`${oswald.variable} min-h-screen bg-black text-white overflow-hidden`}>
      {/* ── Top Marquee ──────────────────────────────── */}
      <Marquee />

      {/* ── Main Section ─────────────────────────────── */}
      <main className="relative min-h-[calc(100vh-88px)] flex flex-col justify-between px-4 md:px-8 lg:px-12 py-8">
        
        {/* ── Typography + Image Grid ────────────────── */}
        <div className="flex-1 flex flex-col justify-center">
          
          {/* Row 1: Image + ТВОЁ */}
          <div className="flex items-end gap-4 md:gap-8">
            {/* Window image */}
            <div className="relative w-[35vw] md:w-[28vw] lg:w-[22vw] shrink-0 drop-shadow-[0_0_60px_rgba(99,102,241,0.15)]">
              <Image
                src="/window.png"
                alt="Окно в Европу"
                width={600}
                height={800}
                className="w-full h-auto"
                priority
              />
              {/* Glow underneath */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-indigo-500/20 blur-3xl rounded-full" />
            </div>

            {/* ТВОЁ */}
            <h1
              className="font-oswald uppercase leading-[0.85] tracking-[-0.02em] text-[18vw] md:text-[16vw] lg:text-[14vw] text-slate-700"
              aria-hidden="true"
            >
              ТВОЁ
            </h1>
          </div>

          {/* Row 2: ОКНО */}
          <div className="-mt-[1vw]">
            <h1 className="font-oswald uppercase leading-[0.85] tracking-[-0.02em] text-[22vw] md:text-[20vw] lg:text-[18vw] text-slate-500">
              ОКНО
            </h1>
          </div>

          {/* Row 3: В ЕВРОПУ */}
          <div className="-mt-[1vw]">
            <h1 className="font-oswald uppercase leading-[0.85] tracking-[-0.02em] text-[19vw] md:text-[17vw] lg:text-[15vw] text-slate-300">
              В&nbsp;ЕВРОПУ
            </h1>
          </div>
        </div>

        {/* ── Bottom info ────────────────────────────── */}
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-8 mt-8 pb-4">
          {/* Description */}
          <div className="max-w-md">
            <p className="text-slate-400 text-sm md:text-base leading-relaxed mb-6">
              Безопасный маршрут к&nbsp;европейским серверам.
              <br />
              Защита данных в&nbsp;публичных сетях. Стабильный пинг для&nbsp;игр.
              <br />
              <span className="text-slate-500">
                Амстердам&nbsp;• Франкфурт&nbsp;• Лондон
              </span>
            </p>
            <Link
              href="/register"
              className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-10 py-4 rounded-none text-sm uppercase tracking-[0.15em] transition shadow-[0_0_40px_rgba(99,102,241,0.3)] hover:shadow-[0_0_60px_rgba(99,102,241,0.5)]"
            >
              Подключиться
            </Link>
          </div>

          {/* Stats */}
          <div className="flex gap-8 md:gap-12 text-right">
            <div>
              <div className="font-oswald text-3xl md:text-4xl text-white">848</div>
              <div className="text-xs text-slate-500 uppercase tracking-widest">Мбит/с</div>
            </div>
            <div>
              <div className="font-oswald text-3xl md:text-4xl text-white">88</div>
              <div className="text-xs text-slate-500 uppercase tracking-widest">мс пинг</div>
            </div>
            <div>
              <div className="font-oswald text-3xl md:text-4xl text-white">3</div>
              <div className="text-xs text-slate-500 uppercase tracking-widest">Локации</div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Bottom Marquee ───────────────────────────── */}
      <Marquee reverse />
    </div>
  );
}

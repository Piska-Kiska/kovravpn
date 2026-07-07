"use client";

// Woven gold threads on <canvas> — the Kovra brand signature.
// Deterministic (seeded PRNG), DPR-aware, pauses when off-screen or the
// tab is hidden, renders a single static frame under prefers-reduced-motion.
// Colors come from --k-thread / --k-thread-alpha so the canvas follows the
// active theme without re-mounting.

import { useEffect, useRef } from "react";

type Props = {
  className?: string;
  /** thread count per 100px of height */
  density?: number;
  /** master opacity 0..1 */
  opacity?: number;
  /** 0..1 — pull threads into a weave knot at the section center */
  converge?: number;
  seed?: number;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Thread = {
  y: number;
  amp: number;
  freq: number;
  phase: number;
  vel: number;
  width: number;
  alpha: number;
};

export default function ThreadCanvas({
  className,
  density = 1.1,
  opacity = 0.5,
  converge = 0,
  seed = 7,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    let running = false;
    let color = "217,164,65";
    let themeAlpha = 1;
    let threads: Thread[] = [];

    const readColor = () => {
      const cs = getComputedStyle(canvas);
      const c = cs.getPropertyValue("--k-thread").trim();
      if (c) color = c;
      const a = parseFloat(cs.getPropertyValue("--k-thread-alpha"));
      themeAlpha = Number.isFinite(a) ? a : 1;
    };

    const build = () => {
      const rand = mulberry32(seed);
      const n = Math.max(6, Math.round((h / 100) * density));
      threads = Array.from({ length: n }, (_, i) => ({
        y: ((i + 0.5) / n + ((rand() - 0.5) * 0.5) / n) * h,
        amp: 12 + rand() * 30,
        freq: (0.7 + rand() * 1.1) * ((Math.PI * 2) / Math.max(w, 1)),
        phase: rand() * Math.PI * 2,
        vel: (0.12 + rand() * 0.3) * (rand() > 0.5 ? 1 : -1),
        width: 0.5 + rand() * 0.7,
        alpha: 0.25 + rand() * 0.6,
      }));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      readColor();
      build();
    };

    const bell = (t: number) => Math.exp(-((t - 0.5) ** 2) / (2 * 0.16 ** 2));

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h);
      const t = time / 1000;
      const focalY = h * 0.5;
      const step = 10;
      for (const th of threads) {
        ctx.beginPath();
        ctx.lineWidth = th.width;
        ctx.strokeStyle = `rgba(${color},${(th.alpha * opacity * themeAlpha).toFixed(3)})`;
        for (let x = -step; x <= w + step; x += step) {
          const wave =
            Math.sin(x * th.freq + th.phase + t * th.vel) * th.amp +
            Math.sin(x * th.freq * 2.7 + th.phase * 1.7 + t * th.vel * 1.6) *
              th.amp *
              0.25;
          let y = th.y + wave;
          if (converge > 0) {
            const p = bell(x / w) * converge;
            y += (focalY - y) * p * 0.85;
          }
          if (x <= 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    const loop = (time: number) => {
      draw(time);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!running && !reduced) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    resize();
    if (reduced) draw(0);
    else start();

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    });
    io.observe(canvas);

    const onVis = () => {
      if (!document.hidden && visible) start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVis);

    // follow theme switches (data-theme lives on <html>)
    const mo = new MutationObserver(() => {
      readColor();
      if (reduced) draw(0);
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [density, opacity, converge, seed]);

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
}

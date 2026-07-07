"use client";

// Count-up for stats: animates the numeric part of strings like
// "30+", "<20", "10", "0" when the element scrolls into view.
// Non-numeric values and prefers-reduced-motion render statically.

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  duration?: number;
  className?: string;
};

export default function CountUp({ value, duration = 1400, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    setDisplay(value);
    const el = ref.current;
    if (!el) return;
    const m = value.match(/^([^\d]*)(\d+)(.*)$/);
    if (!m) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const [, pre, numStr, post] = m;
    const target = parseInt(numStr, 10);
    let raf = 0;

    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setDisplay(`${pre}${Math.round(target * eased)}${post}`);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}

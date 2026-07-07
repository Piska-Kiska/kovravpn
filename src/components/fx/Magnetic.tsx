"use client";

// Magnetic hover: the wrapped element drifts toward the cursor while it
// is within `range` px of the element bounds (capped at `max` px shift)
// and springs back on leave. Pointer devices only; disabled under
// prefers-reduced-motion.

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  range?: number;
  max?: number;
};

export default function Magnetic({
  children,
  className,
  range = 60,
  max = 10,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return;

    let raf = 0;
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let active = false;

    const tick = () => {
      cx += (tx - cx) * 0.16;
      cy += (ty - cy) * 0.16;
      el.style.transform = `translate(${cx.toFixed(2)}px,${cy.toFixed(2)}px)`;
      if (Math.abs(cx - tx) > 0.1 || Math.abs(cy - ty) > 0.1) {
        raf = requestAnimationFrame(tick);
      } else {
        active = false;
        if (tx === 0 && ty === 0) el.style.transform = "";
      }
    };
    const kick = () => {
      if (!active) {
        active = true;
        raf = requestAnimationFrame(tick);
      }
    };

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const outX = Math.max(0, Math.abs(dx) - r.width / 2);
      const outY = Math.max(0, Math.abs(dy) - r.height / 2);
      const dist = Math.hypot(outX, outY);
      if (dist > range) {
        if (tx !== 0 || ty !== 0) {
          tx = 0;
          ty = 0;
          kick();
        }
        return;
      }
      const pull = 1 - dist / range;
      tx = Math.max(-max, Math.min(max, dx * 0.18 * pull));
      ty = Math.max(-max, Math.min(max, dy * 0.18 * pull));
      kick();
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [range, max]);

  return (
    <span
      ref={ref}
      className={className}
      style={{ display: "inline-block", willChange: "transform" }}
    >
      {children}
    </span>
  );
}

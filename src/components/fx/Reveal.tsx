"use client";

// Scroll-reveal wrapper: fade + translateY(24px), optional 60ms child
// stagger (see .k-rv / .k-stagger in globals.css). Fires once.

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  /** extra transition delay, ms */
  delay?: number;
  /** stagger direct children instead of revealing the wrapper as one */
  stagger?: boolean;
  id?: string;
  style?: CSSProperties;
};

export default function Reveal({
  children,
  className = "",
  as,
  delay = 0,
  stagger = false,
  id,
  style,
}: Props) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cls = [stagger ? "k-stagger" : "k-rv", inView ? "is-in" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag
      ref={ref}
      id={id}
      className={cls}
      style={{
        ...style,
        ...(delay ? ({ "--rv-delay": `${delay}ms` } as CSSProperties) : null),
      }}
    >
      {children}
    </Tag>
  );
}

// src/components/dashboard/shared.tsx
// Small building blocks shared by the dashboard views.
"use client";

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";
import CountUp from "@/components/fx/CountUp";
import { Icon, cssVars, cx, type ButtonSize, type ButtonVariant } from "@/components/cabinet";
import type { NavTarget } from "./useDashView";

/* ── in-page navigation link styled as a button ─────────────────────────── */

export interface HashLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> {
  to: NavTarget;
  onNavigate(target: NavTarget): void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: LucideIcon;
  iconEnd?: LucideIcon;
  /** Render as a bare link (no button look). */
  bare?: boolean;
}

/**
 * A real link to "#plan" etc. (so it can be opened in a new tab), which
 * switches the view in place on a plain click.
 */
export function HashLink({ to, onNavigate, variant = "ghost", size = "md", block, icon, iconEnd, bare, className, children, ...rest }: HashLinkProps) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate(to);
  };
  const cls = bare
    ? className
    : cx("kc-btn", `kc-btn--${variant}`, size === "sm" && "kc-btn--sm", block && "kc-btn--block", className);
  return (
    <a {...rest} href={`#${to}`} className={cls} onClick={onClick}>
      {icon ? <Icon as={icon} size={18} /> : null}
      {bare ? children : <span className="kc-btn-label">{children}</span>}
      {iconEnd ? <Icon as={iconEnd} size={18} /> : null}
    </a>
  );
}

/* ── media query ────────────────────────────────────────────────────────── */

/** Live `matchMedia(query).matches`; false on the server and during hydration. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/* ── first visit of a view: rise-in and count-up only once ─────────────── */

const FirstVisitContext = createContext(false);

export function FirstVisitProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <FirstVisitContext.Provider value={value}>{children}</FirstVisitContext.Provider>;
}

export function useFirstVisit(): boolean {
  return useContext(FirstVisitContext);
}

/** Class and --i for a section that rises in on the first visit of its view. */
export function useRise(): (i: number) => { className?: string; style?: CSSProperties } {
  const first = useFirstVisit();
  return (i: number) => (first ? { className: "kc-rise", style: cssVars({ "--i": i }) } : {});
}

/** A number that counts up on the first visit of its view only. */
export function Count({ value, className }: { value: number; className?: string }) {
  const first = useFirstVisit();
  const v = String(Math.max(0, Math.round(value)));
  return first ? <CountUp value={v} className={className} duration={1100} /> : <span className={className}>{v}</span>;
}

/* ── view header (kicker + h1) ─────────────────────────────────────────── */

export function ViewHead({ kicker, title, aside }: { kicker: string; title: string; aside?: ReactNode }) {
  const rise = useRise();
  const r = rise(0);
  return (
    <header className={cx("kc-view-head", r.className)} style={r.style}>
      <div className="kc-view-head-text">
        <p className="kc-kicker">{kicker}</p>
        <h1 className="kc-h1 kc-view-title" tabIndex={-1} data-view-title="">
          {title}
        </h1>
      </div>
      {aside}
    </header>
  );
}

/* ── e-mail address that wraps after "@" rather than mid-word ───────────── */

/** "name@<wbr>domain": a long address breaks at the "@" first. */
export function BreakableEmail({ value }: { value: string }) {
  const at = value.lastIndexOf("@");
  if (at <= 0) return <>{value}</>;
  return (
    <>
      {value.slice(0, at + 1)}
      <wbr />
      {value.slice(at + 1)}
    </>
  );
}

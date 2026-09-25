// src/components/cabinet/Button.tsx
// Pill buttons for the cabinet. Variants: cta (the one gold action per view),
// ghost, quiet (underlined text), danger, icon (44x44 circle).
// Sizes: md 48px, sm 40px with a 44px hit area.
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "./Icon";
import { cx } from "./util";

export type ButtonVariant = "cta" | "ghost" | "quiet" | "danger" | "icon";
export type ButtonSize = "md" | "sm";

interface ButtonLookProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Leading icon; replaced by the spinner while loading. */
  icon?: LucideIcon;
  iconEnd?: LucideIcon;
  iconSize?: number;
}

export interface ButtonProps extends ButtonLookProps, ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

function classesFor({ variant = "ghost", size = "md", block }: ButtonLookProps, extra?: string, loading?: boolean): string {
  return cx("kc-btn", `kc-btn--${variant}`, size === "sm" && "kc-btn--sm", block && "kc-btn--block", loading && "is-loading", extra);
}

function Inner({ icon, iconEnd, iconSize, loading, children }: { icon?: LucideIcon; iconEnd?: LucideIcon; iconSize?: number; loading?: boolean; children?: ReactNode }) {
  const size = iconSize ?? 18;
  return (
    <>
      {loading ? <span className="kc-spin" aria-hidden="true" /> : icon ? <Icon as={icon} size={size} /> : null}
      {children !== undefined && children !== null && children !== false ? <span className="kc-btn-label">{children}</span> : null}
      {iconEnd ? <Icon as={iconEnd} size={size} /> : null}
    </>
  );
}

export function Button({
  variant,
  size,
  block,
  icon,
  iconEnd,
  iconSize,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={classesFor({ variant, size, block }, className, loading)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      <Inner icon={icon} iconEnd={iconEnd} iconSize={iconSize} loading={loading}>
        {children}
      </Inner>
    </button>
  );
}

export interface ButtonLinkProps extends ButtonLookProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  ref?: Ref<HTMLAnchorElement>;
}

/** Same look as Button. Internal paths use next/link; http(s), mailto and tg links use <a>. */
export function ButtonLink({ variant, size, block, icon, iconEnd, iconSize, className, children, href, ref, ...rest }: ButtonLinkProps) {
  const cls = classesFor({ variant, size, block }, className);
  const inner = (
    <Inner icon={icon} iconEnd={iconEnd} iconSize={iconSize}>
      {children}
    </Inner>
  );
  if (/^(https?:|mailto:|tg:)/.test(href)) {
    return (
      <a {...rest} ref={ref} href={href} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link {...rest} ref={ref} href={href} className={cls}>
      {inner}
    </Link>
  );
}

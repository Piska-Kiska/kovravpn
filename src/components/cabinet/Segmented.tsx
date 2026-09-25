// src/components/cabinet/Segmented.tsx
// Segmented control built from native radios (arrow keys, form semantics and
// screen-reader state for free) with a sliding thumb.
"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "./Icon";
import { cssVars, cx } from "./util";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** A ready glyph (decorative, 16px), rendered in place of `icon`. */
  glyph?: ReactNode;
}

export interface SegmentedProps<T extends string> {
  name: string;
  /** Accessible name of the radiogroup. */
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange(v: T): void;
  block?: boolean;
  className?: string;
}

export function Segmented<T extends string>({ name, label, value, options, onChange, block, className }: SegmentedProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx("kc-seg", block && "kc-seg--block", className)}
      style={cssVars({ "--n": options.length, "--i": index })}
    >
      <span className="kc-seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <label key={o.value} className="kc-seg-opt">
          <input
            className="kc-sr"
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
          />
          {o.glyph ?? (o.icon ? <Icon as={o.icon} size={16} /> : null)}
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

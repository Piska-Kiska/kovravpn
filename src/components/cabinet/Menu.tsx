// src/components/cabinet/Menu.tsx
// Menu button (WAI-ARIA menu pattern) with data-driven items; the keyboard
// and focus logic lives in useMenuButton (src/components/chrome).
// Trigger: Enter / Space / click open and focus the current (checked) item,
// ArrowDown opens on the current item, ArrowUp on the last one.
// Menu: ArrowUp / ArrowDown wrap, Home / End jump, a letter jumps to the next
// matching item, Enter / Space select, Escape closes and returns focus to
// the trigger, Tab closes, a pointerdown outside closes.
// A checked radio ends with the wordmark's gold full stop (no check icon).
"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useMenuButton, type MenuTriggerProps } from "@/components/chrome/useMenuButton";
import { Icon } from "./Icon";
import { cx } from "./util";

export type { MenuTriggerProps };

export type MenuItemKind = "radio" | "action" | "link" | "head" | "separator";

export interface MenuItem {
  id: string;
  kind: MenuItemKind;
  label?: string;
  icon?: LucideIcon;
  /** Right-aligned secondary text (mono), or the identity line of a "head". */
  meta?: string;
  /** BCP 47 language of the label (native language names). */
  lang?: string;
  checked?: boolean;
  tone?: "danger";
  href?: string;
  /** Open a link item in a new tab. */
  external?: boolean;
  onSelect?: () => void;
}

export interface MenuProps {
  /** Renders the trigger button; spread the props onto a <button>. */
  trigger: (props: MenuTriggerProps, state: { open: boolean }) => ReactNode;
  items: readonly MenuItem[];
  align?: "start" | "end";
  /** Accessible name of the trigger (and, through aria-labelledby, of the menu). */
  label: string;
  /** Stretch the wrapper to the full width (inline variants). */
  block?: boolean;
  className?: string;
}

function isInteractive(it: MenuItem): boolean {
  return it.kind === "radio" || it.kind === "action" || it.kind === "link";
}

export function Menu({ trigger, items, align = "end", label, block, className }: MenuProps) {
  const interactive = items.filter(isInteractive);
  // Position of each entry among the interactive items (-1 for heads and separators).
  const positions = items.map((it) => interactive.indexOf(it));
  const { open, close, wrapRef, triggerProps, menuProps, itemRef } = useMenuButton({
    label,
    itemLabels: interactive.map((it) => it.label ?? ""),
    checkedIndex: interactive.findIndex((it) => it.kind === "radio" && it.checked),
  });

  return (
    <div ref={wrapRef} className={cx("kc-menu-wrap", block && "kc-menu-wrap--block", className)}>
      {trigger(triggerProps, { open })}
      {open ? (
        <div {...menuProps} className={cx("kc-menu", align === "start" ? "kc-menu--start" : "kc-menu--end")}>
          {items.map((it, i) => {
            if (it.kind === "separator") return <div key={it.id} role="separator" className="kc-menu-sep" />;
            if (it.kind === "head") {
              return (
                <div key={it.id} role="none" className="kc-menu-head">
                  <span className="kc-small">{it.label}</span>
                  {it.meta ? <span className="kc-menu-head-meta">{it.meta}</span> : null}
                </div>
              );
            }
            const setRef = itemRef(positions[i]);
            const content = (
              <>
                {it.icon ? <Icon as={it.icon} size={18} /> : null}
                <span className="kc-menu-label">
                  {it.label}
                  {it.kind === "radio" && it.checked ? <span className="kc-menu-dot" aria-hidden="true" /> : null}
                </span>
                {it.meta ? <span className="kc-menu-meta">{it.meta}</span> : null}
              </>
            );
            const cls = cx("kc-menu-item", it.tone === "danger" && "kc-menu-item--danger");
            if (it.kind === "link") {
              return (
                <a
                  key={it.id}
                  ref={setRef}
                  role="menuitem"
                  tabIndex={-1}
                  className={cls}
                  href={it.href}
                  lang={it.lang}
                  target={it.external ? "_blank" : undefined}
                  rel={it.external ? "noopener noreferrer" : undefined}
                  onClick={() => {
                    it.onSelect?.();
                    close(false);
                  }}
                >
                  {content}
                </a>
              );
            }
            return (
              <button
                key={it.id}
                ref={setRef}
                type="button"
                role={it.kind === "radio" ? "menuitemradio" : "menuitem"}
                aria-checked={it.kind === "radio" ? Boolean(it.checked) : undefined}
                tabIndex={-1}
                className={cls}
                lang={it.lang}
                onClick={() => {
                  it.onSelect?.();
                  close(true);
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// src/components/cabinet/Menu.tsx
// Menu button (WAI-ARIA menu pattern).
// Trigger: Enter / Space / click open and focus the current (checked) item,
// ArrowDown opens on the current item, ArrowUp on the last one.
// Menu: ArrowUp / ArrowDown wrap, Home / End jump, a letter jumps to the next
// matching item, Enter / Space select, Escape closes and returns focus to
// the trigger, Tab closes, a pointerdown outside closes.
"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import { Check, type LucideIcon } from "lucide-react";
import { Icon } from "./Icon";
import { cx } from "./util";

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

export interface MenuTriggerProps {
  ref: RefObject<HTMLButtonElement | null>;
  id: string;
  type: "button";
  "aria-label": string;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
  onClick: MouseEventHandler<HTMLButtonElement>;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
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

type FocusTarget = "current" | "first" | "last";

function isInteractive(it: MenuItem): boolean {
  return it.kind === "radio" || it.kind === "action" || it.kind === "link";
}

export function Menu({ trigger, items, align = "end", label, block, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const triggerId = `${uid}-trigger`;
  const menuId = `${uid}-menu`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const pendingFocus = useRef<FocusTarget | null>(null);

  const interactive = items.flatMap((it, i) => (isInteractive(it) ? [i] : []));

  const focusIndex = (idx: number | undefined) => {
    if (idx === undefined) return;
    itemRefs.current[idx]?.focus();
  };

  // Focus the requested item once the menu has rendered.
  useEffect(() => {
    if (!open || !pendingFocus.current) return;
    const where = pendingFocus.current;
    pendingFocus.current = null;
    const indices = items.flatMap((it, i) => (isInteractive(it) ? [i] : []));
    if (where === "last") focusIndex(indices[indices.length - 1]);
    else if (where === "current") {
      const checked = items.findIndex((it) => it.kind === "radio" && it.checked);
      focusIndex(checked >= 0 ? checked : indices[0]);
    } else focusIndex(indices[0]);
  }, [open, items]);

  // Close on a pointerdown outside the trigger and menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (wrapRef.current && t instanceof Node && !wrapRef.current.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const openAt = (where: FocusTarget) => {
    pendingFocus.current = where;
    setOpen(true);
  };

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onTriggerClick: MouseEventHandler<HTMLButtonElement> = () => {
    if (open) close(false);
    else openAt("current");
  };

  const onTriggerKeyDown: KeyboardEventHandler<HTMLButtonElement> = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openAt("current");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openAt("last");
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close(true);
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = interactive.length;
    if (n === 0) return;
    const active = itemRefs.current.findIndex((el) => el !== null && el === document.activeElement);
    const pos = interactive.indexOf(active);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusIndex(interactive[pos < 0 ? 0 : (pos + 1) % n]);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusIndex(interactive[pos < 0 ? n - 1 : (pos - 1 + n) % n]);
        break;
      case "Home":
        e.preventDefault();
        focusIndex(interactive[0]);
        break;
      case "End":
        e.preventDefault();
        focusIndex(interactive[n - 1]);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
      default: {
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || e.key === " ") return;
        const ch = e.key.toLocaleLowerCase();
        for (let step = 1; step <= n; step++) {
          const idx = interactive[(Math.max(pos, 0) + step) % n];
          const text = (items[idx].label ?? "").toLocaleLowerCase();
          if (text.startsWith(ch)) {
            e.preventDefault();
            focusIndex(idx);
            break;
          }
        }
      }
    }
  };

  const triggerProps: MenuTriggerProps = {
    ref: triggerRef,
    id: triggerId,
    type: "button",
    "aria-label": label,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: onTriggerClick,
    onKeyDown: onTriggerKeyDown,
  };

  return (
    <div ref={wrapRef} className={cx("kc-menu-wrap", block && "kc-menu-wrap--block", className)}>
      {trigger(triggerProps, { open })}
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          className={cx("kc-menu", align === "start" ? "kc-menu--start" : "kc-menu--end")}
          onKeyDown={onMenuKeyDown}
        >
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
            const setRef = (el: HTMLElement | null) => {
              itemRefs.current[i] = el;
            };
            const content = (
              <>
                {it.icon ? <Icon as={it.icon} size={18} /> : null}
                <span className="kc-menu-label">{it.label}</span>
                {it.meta ? <span className="kc-menu-meta">{it.meta}</span> : null}
                {it.kind === "radio" ? (
                  <span className="kc-menu-check">{it.checked ? <Icon as={Check} size={16} /> : null}</span>
                ) : null}
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
                    setOpen(false);
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

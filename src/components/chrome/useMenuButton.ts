// src/components/chrome/useMenuButton.ts
//
// Headless WAI-ARIA menu button, shared by the header chrome (PrefsCapsule,
// AccountMark) and the cabinet Menu.
// Trigger: Enter / Space open and focus the checked item (else the first),
// ArrowDown opens on the checked item, ArrowUp on the last one, Escape closes.
// A pointer click opens with the menu itself focused, so nothing is
// highlighted until the pointer or an arrow key picks an item.
// Menu: ArrowUp / ArrowDown wrap (plus ArrowLeft / ArrowRight when the menu
// is horizontal), Home / End jump, a letter jumps to the next matching item,
// Escape closes and returns focus to the trigger, Tab closes (focus moves on
// as usual), a pointerdown outside the wrapper closes.
// One highlight: a mouse over an item focuses it and leaving the items
// focuses the menu again, so styling the highlight on :focus alone keeps the
// pointer and the keyboard on the same single item.
// Items are the interactive entries only, indexed 0..n-1; render each with
// ref={itemRef(i)} and tabIndex={-1}.
"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type RefObject,
} from "react";

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

export interface MenuListProps {
  ref: RefObject<HTMLDivElement | null>;
  id: string;
  role: "menu";
  tabIndex: -1;
  "aria-labelledby": string;
  "aria-orientation"?: "horizontal";
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerLeave: PointerEventHandler<HTMLDivElement>;
}

export interface UseMenuButtonOptions {
  /** Accessible name of the trigger. */
  label: string;
  /** Visible labels of the interactive items, in order (type-ahead). */
  itemLabels: readonly string[];
  /** Index of the checked item; focus lands there on open. */
  checkedIndex?: number;
  orientation?: "vertical" | "horizontal";
  /** What names the menu: the trigger (default) or a visible heading with id={headingId}. */
  labelledBy?: "trigger" | "heading";
}

export interface MenuButton {
  open: boolean;
  close(restoreFocus: boolean): void;
  wrapRef: RefObject<HTMLDivElement | null>;
  triggerProps: MenuTriggerProps;
  headingId: string;
  menuProps: MenuListProps;
  itemRef(i: number): (el: HTMLElement | null) => void;
}

type FocusTarget = "current" | "last" | "menu";

export function useMenuButton({
  label,
  itemLabels,
  checkedIndex = -1,
  orientation = "vertical",
  labelledBy = "trigger",
}: UseMenuButtonOptions): MenuButton {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const triggerId = `${uid}-trigger`;
  const menuId = `${uid}-menu`;
  const headingId = `${uid}-heading`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const count = itemLabels.length;

  const focusIndex = (idx: number) => {
    if (idx < 0 || idx >= count) return;
    itemRefs.current[idx]?.focus();
  };

  // Focus the requested item once the menu has rendered.
  useEffect(() => {
    if (!open || !pendingFocus.current) return;
    const where = pendingFocus.current;
    pendingFocus.current = null;
    if (where === "menu") {
      menuRef.current?.focus({ preventScroll: true });
      return;
    }
    const idx = where === "last" ? count - 1 : checkedIndex >= 0 && checkedIndex < count ? checkedIndex : 0;
    itemRefs.current[idx]?.focus();
  }, [open, count, checkedIndex]);

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

  const onTriggerClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    if (open) close(false);
    // detail is 0 for the click that Enter / Space synthesize.
    else openAt(e.detail > 0 ? "menu" : "current");
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

  const horizontal = orientation === "horizontal";

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const pos = itemRefs.current.findIndex((el, i) => i < count && el !== null && el === document.activeElement);
    const next = () => focusIndex(pos < 0 ? 0 : (pos + 1) % count);
    const prev = () => focusIndex(pos < 0 ? count - 1 : (pos - 1 + count) % count);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        next();
        break;
      case "ArrowUp":
        e.preventDefault();
        prev();
        break;
      case "ArrowRight":
        if (!horizontal) return;
        e.preventDefault();
        next();
        break;
      case "ArrowLeft":
        if (!horizontal) return;
        e.preventDefault();
        prev();
        break;
      case "Home":
        e.preventDefault();
        focusIndex(0);
        break;
      case "End":
        e.preventDefault();
        focusIndex(count - 1);
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
        for (let step = 1; step <= count; step++) {
          const idx = (Math.max(pos, 0) + step) % count;
          if ((itemLabels[idx] ?? "").toLocaleLowerCase().startsWith(ch)) {
            e.preventDefault();
            focusIndex(idx);
            break;
          }
        }
      }
    }
  };

  // One highlight: the item under a mouse takes focus; off the items (a
  // separator, outside the menu) focus returns to the menu. Touch has no
  // hover, so a tap only focuses what it activates.
  const releaseToMenu = (menu: HTMLDivElement) => {
    const active = document.activeElement;
    if (active !== menu && active instanceof Node && menu.contains(active)) menu.focus({ preventScroll: true });
  };

  const onMenuPointerMove: PointerEventHandler<HTMLDivElement> = (e) => {
    if (e.pointerType === "touch") return;
    const menu = e.currentTarget;
    const hit = e.target instanceof Element ? e.target.closest<HTMLElement>('[role^="menuitem"]') : null;
    if (hit && menu.contains(hit)) {
      if (hit !== document.activeElement) hit.focus({ preventScroll: true });
    } else {
      releaseToMenu(menu);
    }
  };

  const onMenuPointerLeave: PointerEventHandler<HTMLDivElement> = (e) => {
    if (e.pointerType === "touch") return;
    releaseToMenu(e.currentTarget);
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

  const menuProps: MenuListProps = {
    ref: menuRef,
    id: menuId,
    role: "menu",
    tabIndex: -1,
    "aria-labelledby": labelledBy === "heading" ? headingId : triggerId,
    ...(horizontal ? { "aria-orientation": "horizontal" as const } : {}),
    onKeyDown: onMenuKeyDown,
    onPointerMove: onMenuPointerMove,
    onPointerLeave: onMenuPointerLeave,
  };

  const itemRef = (i: number) => (el: HTMLElement | null) => {
    itemRefs.current[i] = el;
  };

  return { open, close, wrapRef, triggerProps, headingId, menuProps, itemRef };
}

// src/components/cabinet/Dialog.tsx
// Modal dialog on native <dialog>.showModal(): Escape, the inert background
// and initial focus come from the platform. Focus returns to the element that
// was focused before opening. A click on the backdrop closes. Below 768px the
// panel is a bottom sheet (see .kc-dialog in cabinet.css).
"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useShellT } from "@/lib/i18n-shell";
import { Button } from "./Button";
import { cx } from "./util";

export interface DialogProps {
  open: boolean;
  onClose(): void;
  title: ReactNode;
  children: ReactNode;
  /** id of an element that labels the dialog instead of the title. */
  labelledBy?: string;
  size?: "sm" | "md";
  /** When true, Escape and the backdrop do not close (e.g. while a request runs). */
  locked?: boolean;
}

export function Dialog({ open, onClose, title, children, labelledBy, size = "md", locked = false }: DialogProps) {
  const shell = useShellT();
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);
  const lockedRef = useRef(locked);

  useEffect(() => {
    openRef.current = open;
    onCloseRef.current = onClose;
    lockedRef.current = locked;
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      try {
        d.showModal();
      } catch {
        d.setAttribute("open", "");
      }
      // React does not render the autofocus attribute, so the platform would
      // focus the first control (the close button). Honour data-autofocus.
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  // Close the native dialog if the component unmounts while open.
  useEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={cx("kc-dialog", size === "sm" && "kc-dialog--sm")}
      aria-labelledby={labelledBy ?? titleId}
      onCancel={(e) => {
        // Escape: let the parent own the state.
        e.preventDefault();
        if (!lockedRef.current) onCloseRef.current();
      }}
      onClose={() => {
        // Fired after d.close(); also covers a close forced by the browser.
        if (openRef.current) onCloseRef.current();
        const back = opener.current;
        opener.current = null;
        if (back && back.isConnected) back.focus({ preventScroll: true });
      }}
      onClick={(e) => {
        if (e.target === ref.current && !lockedRef.current) onCloseRef.current();
      }}
    >
      {open ? (
        <div className="kc-dialog-panel">
          <div className="kc-dialog-head">
            <h2 id={titleId} className="kc-h2">
              {title}
            </h2>
            <Button
              variant="icon"
              icon={X}
              className="kc-dialog-close"
              aria-label={shell.close}
              disabled={locked}
              onClick={() => onCloseRef.current()}
            />
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "danger" | "default";
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

/** Replacement for window.confirm(): the action runs only after "confirm". */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, tone = "default", busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} size="sm" locked={busy}>
      {body ? <div className="kc-dialog-body">{body}</div> : null}
      <div className="kc-dialog-actions">
        <Button variant="ghost" onClick={onCancel} disabled={busy} data-autofocus="">
          {cancelLabel}
        </Button>
        <Button variant={tone === "danger" ? "danger" : "cta"} onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

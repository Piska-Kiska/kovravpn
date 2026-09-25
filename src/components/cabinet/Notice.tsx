// src/components/cabinet/Notice.tsx
// Inline status message. error -> role="alert"; others -> role="status".
import type { ReactNode } from "react";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { Icon } from "./Icon";
import { cx } from "./util";

export type NoticeTone = "info" | "success" | "error" | "pending";

export interface NoticeProps {
  tone: NoticeTone;
  children: ReactNode;
  /** Optional follow-up control under the text (e.g. a quiet ButtonLink). */
  action?: ReactNode;
  onDismiss?(): void;
  dismissLabel?: string;
  className?: string;
  id?: string;
}

export function Notice({ tone, children, action, onDismiss, dismissLabel, className, id }: NoticeProps) {
  return (
    <div id={id} className={cx("kc-notice", `kc-notice--${tone}`, className)} role={tone === "error" ? "alert" : "status"}>
      <span className="kc-notice-icon">
        {tone === "pending" ? (
          <span className="kc-spin" aria-hidden="true" />
        ) : (
          <Icon as={tone === "success" ? Check : tone === "error" ? CircleAlert : Info} size={18} />
        )}
      </span>
      <div className="kc-notice-body">
        <div>{children}</div>
        {action ? <div className="kc-notice-action">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="kc-btn kc-btn--icon kc-notice-dismiss" aria-label={dismissLabel} onClick={onDismiss}>
          <Icon as={X} size={18} />
        </button>
      ) : null}
    </div>
  );
}

// src/components/cabinet/Field.tsx
// Labelled 48px text field with a persistent hint that an error replaces,
// wired through aria-describedby / aria-invalid. PasswordField adds a 44x44
// reveal toggle and an optional requirement marker on the hint: a neutral dot
// until the rule is met, then a green check.
"use client";

import { useState, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { Check, CircleAlert, Eye, EyeOff } from "lucide-react";
import { Icon } from "./Icon";
import { cx } from "./util";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Shown at the end of the label row, e.g. a "Forgot password?" quiet button;
   *  it follows the input in the tab order. */
  labelAction?: ReactNode;
  mono?: boolean;
  ref?: Ref<HTMLInputElement>;
}

interface FrameProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  labelAction?: ReactNode;
  requirementMet?: boolean;
  children: (describedBy: string | undefined, invalid: boolean) => ReactNode;
  extraDescribedBy?: string;
}

function FieldFrame({ id, label, hint, error, labelAction, requirementMet, children, extraDescribedBy }: FrameProps) {
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  const hasHint = !hasError && hint !== undefined && hint !== null && hint !== false && hint !== "";
  const msgId = `${id}-msg`;
  const describedBy = [hasError || hasHint ? msgId : null, extraDescribedBy].filter(Boolean).join(" ") || undefined;
  const hasAction = labelAction !== undefined && labelAction !== null && labelAction !== false;
  return (
    <div className={cx("kc-field", hasAction && "kc-field--action")}>
      <div className="kc-field-top">
        <label htmlFor={id} className="kc-label">
          {label}
        </label>
      </div>
      {children(describedBy, hasError)}
      {hasError ? (
        <p id={msgId} className="kc-field-msg kc-field-msg--error">
          <Icon as={CircleAlert} size={14} />
          <span>{error}</span>
        </p>
      ) : hasHint ? (
        <p id={msgId} className={cx("kc-field-msg", requirementMet && "is-met")}>
          {requirementMet !== undefined ? (
            <span className="kc-req" aria-hidden="true">
              {requirementMet ? <Icon as={Check} size={14} /> : <span className="kc-req-dot" />}
            </span>
          ) : null}
          <span>{hint}</span>
        </p>
      ) : null}
      {/* Last in the DOM so Tab goes label -> input (-> reveal) -> action;
          the grid puts it back at the end of the label row. */}
      {hasAction ? <div className="kc-field-action">{labelAction}</div> : null}
    </div>
  );
}

export function Field({ id, label, hint, error, labelAction, mono, className, ref, ...input }: FieldProps) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} labelAction={labelAction} extraDescribedBy={input["aria-describedby"]}>
      {(describedBy, invalid) => (
        <input
          {...input}
          ref={ref}
          id={id}
          className={cx("kc-input", mono && "kc-input--mono", className)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
      )}
    </FieldFrame>
  );
}

export interface PasswordFieldProps extends Omit<FieldProps, "type" | "mono"> {
  /** Accessible name of the reveal toggle (it is a pressed/not-pressed button). */
  showLabel: string;
  /** Tooltip while the password is visible. */
  hideLabel: string;
  /** Adds a leading marker to the hint: a neutral dot, a green check once true. */
  requirementMet?: boolean;
}

export function PasswordField({ id, label, hint, error, labelAction, showLabel, hideLabel, requirementMet, className, ref, ...input }: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      error={error}
      labelAction={labelAction}
      requirementMet={requirementMet}
      extraDescribedBy={input["aria-describedby"]}
    >
      {(describedBy, invalid) => (
        <div className="kc-input-wrap">
          <input
            {...input}
            ref={ref}
            id={id}
            type={shown ? "text" : "password"}
            className={cx("kc-input", "kc-input--pw", className)}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="kc-reveal"
            aria-label={showLabel}
            title={shown ? hideLabel : showLabel}
            aria-pressed={shown}
            aria-controls={id}
            onClick={() => setShown((s) => !s)}
          >
            <Icon as={shown ? EyeOff : Eye} size={18} />
          </button>
        </div>
      )}
    </FieldFrame>
  );
}

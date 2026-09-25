// src/components/cabinet/OtpInput.tsx
// Six single-digit cells for email codes.
// - digits only; typing advances, Backspace on an empty cell goes back;
// - pasting (or autofilling, as iOS does into the first cell) several digits
//   distributes them across the cells; six digits fill everything and focus
//   the last cell;
// - autocomplete="one-time-code" on the first cell only;
// - autoFocus focuses the first cell on mount and marks it [data-autofocus],
//   which AuthShell focuses (instead of the h1) when a step opens.
"use client";

import {
  useId,
  useImperativeHandle,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { cx } from "./util";

export const OTP_LENGTH = 6;

export interface OtpInputHandle {
  focus(index?: number): void;
}

export interface OtpInputProps {
  /** Always six entries, "" for an empty cell. */
  value: string[];
  onChange(next: string[]): void;
  label: string;
  digitLabel(n: number): string;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  /** id of an error or hint element. */
  describedBy?: string;
  ref?: Ref<OtpInputHandle>;
}

function normalized(value: readonly string[]): string[] {
  return Array.from({ length: OTP_LENGTH }, (_, i) => (value[i] ?? "").replace(/\D/g, "").slice(0, 1));
}

export function OtpInput({ value, onChange, label, digitLabel, invalid, disabled, autoFocus, id, describedBy, ref }: OtpInputProps) {
  const autoId = useId();
  const baseId = id ?? `otp-${autoId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const labelId = `${baseId}-label`;
  const cells = useRef<(HTMLInputElement | null)[]>([]);
  const digits = normalized(value);

  const focusCell = (i: number) => {
    const el = cells.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))];
    el?.focus();
    el?.select();
  };

  useImperativeHandle(ref, () => ({ focus: (index = 0) => focusCell(index) }), []);

  /** Writes `incoming` digits starting at `start`; returns the index to focus. */
  const distribute = (start: number, incoming: string): number => {
    const next = [...digits];
    const from = incoming.length >= OTP_LENGTH ? 0 : start;
    let k = 0;
    for (; k < incoming.length && from + k < OTP_LENGTH; k++) next[from + k] = incoming[k];
    onChange(next);
    return Math.min(from + k, OTP_LENGTH - 1);
  };

  const handleChange = (i: number, e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    let typed = input.value.replace(/\D/g, "");
    const prev = digits[i];
    if (!typed) {
      const next = [...digits];
      next[i] = "";
      onChange(next);
      return;
    }
    // Typing over an existing digit without a selection yields two chars:
    // keep the one just typed (left of the caret).
    if (typed.length === 2 && prev) {
      const caret = input.selectionStart ?? typed.length;
      typed = typed[Math.max(0, Math.min(typed.length - 1, caret - 1))];
    }
    if (typed.length === 1) {
      const next = [...digits];
      next[i] = typed;
      onChange(next);
      if (i < OTP_LENGTH - 1) focusCell(i + 1);
      return;
    }
    focusCell(distribute(i, typed));
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      focusCell(i - 1);
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusCell(i - 1);
    } else if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) {
      e.preventDefault();
      focusCell(i + 1);
    }
  };

  const handlePaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    if (pasted.length === OTP_LENGTH) {
      onChange(pasted.split(""));
      focusCell(OTP_LENGTH - 1);
      return;
    }
    focusCell(distribute(i, pasted));
  };

  return (
    <div className="kc-otp-wrap">
      <span id={labelId} className="kc-label">
        {label}
      </span>
      <div className="kc-otp" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              cells.current[i] = el;
            }}
            id={`${baseId}-${i}`}
            className={cx("kc-otp-cell", d !== "" && "is-filled")}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={digitLabel(i + 1)}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            data-autofocus={autoFocus && i === 0 ? "" : undefined}
            value={d}
            onChange={(e) => handleChange(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => handlePaste(i, e)}
            onFocus={(e) => e.currentTarget.select()}
          />
        ))}
      </div>
    </div>
  );
}

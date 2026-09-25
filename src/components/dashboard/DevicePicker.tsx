// src/components/dashboard/DevicePicker.tsx
// "Which device are you setting up?" — five platform tiles. The visitor's own
// platform, the likeliest pick, comes first and carries a "This device" badge
// in a third grid row that every tile reserves (an empty span stands in on the
// others), so icons and names line up; the clicked tile shows a spinner while
// the device is created.
"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Icon, cx } from "@/components/cabinet";
import type { DashDict } from "@/lib/dash-i18n";
import { DEVICE_DEFS, DEVICE_ORDER, detectPlatform, type DeviceId } from "@/lib/dashboard/devices";

export interface DevicePickerProps {
  t: DashDict;
  /** Device being created, or null. */
  pending: DeviceId | null;
  onPick(id: DeviceId): void;
  onCancel(): void;
}

export function DevicePicker({ t, pending, onPick, onCancel }: DevicePickerProps) {
  const [platform] = useState<DeviceId | null>(() => (typeof navigator === "undefined" ? null : detectPlatform(navigator.userAgent)));
  const titleRef = useRef<HTMLHeadingElement>(null);
  const order: readonly DeviceId[] = platform ? [platform, ...DEVICE_ORDER.filter((d) => d !== platform)] : DEVICE_ORDER;

  // Opening the picker moves focus to its question.
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    titleRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <section className="kc-panel kc-picker kc-enter" aria-labelledby="kc-picker-title" aria-busy={pending !== null || undefined}>
      <h3 id="kc-picker-title" ref={titleRef} tabIndex={-1} className="kc-h3">
        {t.picker_title}
      </h3>
      <div className="kc-picker-grid">
        {order.map((id) => {
          const d = DEVICE_DEFS[id];
          const busy = pending === id;
          return (
            <button
              key={id}
              type="button"
              className={cx("kc-tile", "kc-picker-tile", busy && "is-selected")}
              disabled={pending !== null}
              aria-busy={busy || undefined}
              onClick={() => onPick(id)}
            >
              {busy ? <span className="kc-spin kc-picker-spin" aria-hidden="true" /> : <Icon as={d.icon} size={24} />}
              <span>{t[d.nameKey]}</span>
              {platform === id ? <span className="kc-badge kc-picker-badge">{t.this_device}</span> : <span aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="kc-picker-foot">
        <Button variant="quiet" size="sm" onClick={onCancel} disabled={pending !== null}>
          {t.cancel}
        </Button>
        {pending ? (
          <span className="kc-status" role="status">
            {t.creating}
          </span>
        ) : null}
      </div>
    </section>
  );
}

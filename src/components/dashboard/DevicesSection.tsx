// src/components/dashboard/DevicesSection.tsx
// "Your devices": device cards, the setup steps after a new device, the
// setup tile or the device picker, the no-free-slot state and the create
// error. 1 column below 1024px, 2 columns from 1024px.
"use client";

import type { Ref } from "react";
import { MonitorSmartphone, Plus } from "lucide-react";
import { Button, Icon, Notice, cx } from "@/components/cabinet";
import { fmt, plural, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { isDeviceId, type DeviceId } from "@/lib/dashboard/devices";
import type { Profile } from "@/lib/dashboard/types";
import { DeviceCard } from "./DeviceCard";
import { DevicePicker } from "./DevicePicker";
import { SetupSteps } from "./SetupSteps";
import { useMediaQuery, useRise } from "./shared";

export interface DevicesSectionProps {
  t: DashDict;
  lang: Lang;
  index: number;
  profiles: readonly Profile[];
  slots: number;
  canCreate: boolean;
  happEncrypted: boolean;
  showPicker: boolean;
  creating: boolean;
  pendingDevice: DeviceId | null;
  lastCreatedDevice: string | null;
  /** The setup tile may be the view's gold action (no devices, hero has none). */
  goldSetup: boolean;
  resetDoneId: string | null;
  deviceError: Readonly<Record<string, string>>;
  createError: string | null;
  copiedId: string | null;
  headingRef?: Ref<HTMLHeadingElement>;
  devLabel(i: number): string;
  subUrlOf(p: Profile): string;
  onStartSetup(): void;
  onPick(id: DeviceId): void;
  onCancelPick(): void;
  onRequestReset(uuid: string): void;
  onRequestDelete(uuid: string): void;
  onDismissDeviceError(uuid: string): void;
  onDismissCreateError(): void;
  onCopyLink(url: string, uuid: string): void;
  onSetupDone(): void;
  onBuySlot(): void;
}

export function DevicesSection({ headingRef, ...p }: DevicesSectionProps) {
  const { t, lang, profiles, slots } = p;
  const shell = useShellT();
  const rise = useRise();
  const r = rise(p.index);
  const twoCols = useMediaQuery("(min-width: 1024px)");

  // SetupSteps follow the newest profile of the device just created; in the
  // two-column grid they go after the end of that card's row, so the grid
  // keeps no hole and the DOM order matches what is seen.
  let setupFor = -1;
  if (p.lastCreatedDevice) {
    let newest = -Infinity;
    profiles.forEach((pr, i) => {
      if ((pr.deviceType || "") === p.lastCreatedDevice && pr.createdAt >= newest) {
        newest = pr.createdAt;
        setupFor = i;
      }
    });
  }
  const setupAfter = setupFor < 0 ? -1 : twoCols ? Math.min(setupFor | 1, profiles.length - 1) : setupFor;
  const setupProfile = setupFor >= 0 ? profiles[setupFor] : null;
  const setupDevice: DeviceId | null = setupProfile && isDeviceId(p.lastCreatedDevice) ? p.lastCreatedDevice : null;
  const setupUrl = setupProfile ? p.subUrlOf(setupProfile) : "";

  const pickerOpen = p.showPicker || p.creating;
  const noSlot = !p.canCreate && profiles.length >= slots && profiles.length < 100;
  const free = Math.max(0, slots - profiles.length);

  return (
    <section className={cx("kc-section", r.className)} style={r.style} aria-labelledby="kc-devices-title">
      <div className="kc-section-head">
        <h2 id="kc-devices-title" ref={headingRef} tabIndex={-1} className="kc-h2">
          {t.devices_title}
        </h2>
        {slots > 0 ? (
          <span className="kc-count">
            <span aria-hidden="true">
              {profiles.length} / {slots}
            </span>
            <span className="kc-sr">{fmt(t.slots_used_sr, { used: profiles.length, total: slots })}</span>
          </span>
        ) : null}
      </div>

      <div className="kc-dev-grid">
        {profiles.map((pr, i) => {
          const subUrl = p.subUrlOf(pr);
          return [
            <DeviceCard
              key={pr.uuid}
              t={t}
              lang={lang}
              profile={pr}
              name={p.devLabel(i)}
              subUrl={subUrl}
              happEncrypted={p.happEncrypted}
              resetDone={p.resetDoneId === pr.uuid}
              error={p.deviceError[pr.uuid] ?? null}
              onRequestReset={() => p.onRequestReset(pr.uuid)}
              onRequestDelete={() => p.onRequestDelete(pr.uuid)}
              onDismissError={() => p.onDismissDeviceError(pr.uuid)}
            />,
            i === setupAfter && setupDevice && setupProfile ? (
              <div key={`setup-${setupProfile.uuid}`} className="kc-dev-full">
                <SetupSteps
                  t={t}
                  device={setupDevice}
                  subUrl={setupUrl}
                  happEncrypted={p.happEncrypted}
                  copied={p.copiedId === setupProfile.uuid}
                  onCopy={() => setupUrl && p.onCopyLink(setupUrl, setupProfile.uuid)}
                  onDone={p.onSetupDone}
                />
              </div>
            ) : null,
          ];
        })}

        {p.canCreate && !pickerOpen ? (
          profiles.length === 0 && p.goldSetup ? (
            <div className="kc-dev-full kc-panel kc-firstdev">
              <span className="kc-firstdev-text">
                <span className="kc-addtile-icon">
                  <Icon as={MonitorSmartphone} size={20} />
                </span>
                {/* the CTA carries the action wording; the title says what is available */}
                <span className="kc-h3 kc-firstdev-title">{plural(lang, free, t.slots_free)}</span>
              </span>
              <Button variant="cta" icon={Plus} onClick={p.onStartSetup}>
                {t.setup_first}
              </Button>
            </div>
          ) : (
            <button type="button" className={cx("kc-panel kc-addtile", profiles.length === 0 && "kc-addtile--wide")} onClick={p.onStartSetup}>
              <span className="kc-addtile-icon">
                <Icon as={Plus} size={20} />
              </span>
              <span className="kc-addtile-text">
                <span className="kc-h3">{profiles.length === 0 ? t.setup_first : t.setup_device}</span>
                <span className="kc-addtile-meta">{plural(lang, free, t.slots_free)}</span>
              </span>
            </button>
          )
        ) : null}

        {pickerOpen ? (
          <div className="kc-dev-full">
            <DevicePicker t={t} pending={p.creating ? p.pendingDevice : null} onPick={p.onPick} onCancel={p.onCancelPick} />
          </div>
        ) : null}

        {profiles.length >= 100 ? (
          <div className="kc-dev-full kc-panel kc-quiet-panel">
            <p className="kc-body kc-t2">{t.max_devices}</p>
          </div>
        ) : noSlot ? (
          slots === 0 ? (
            // Expired plans keep their device cards; the hero already asks to renew.
            profiles.length === 0 ? (
              <div className="kc-dev-full kc-panel kc-quiet-panel">
                <p className="kc-body kc-t2">{t.no_plan_devices}</p>
              </div>
            ) : null
          ) : (
            // With an odd number of cards the panel fills the free grid cell.
            <div className={cx("kc-panel kc-noslot", profiles.length % 2 === 0 ? "kc-dev-full" : "kc-noslot--cell")}>
              <div className="kc-noslot-text">
                <h3 className="kc-h3">{t.no_slot_title}</h3>
                <p className="kc-small">{t.no_slot_body}</p>
              </div>
              <Button variant="ghost" icon={Plus} onClick={p.onBuySlot}>
                {t.buy_slot}
              </Button>
            </div>
          )
        ) : null}
      </div>

      {p.createError ? (
        <Notice tone="error" className="kc-section-notice" onDismiss={p.onDismissCreateError} dismissLabel={shell.dismiss}>
          {p.createError}
        </Notice>
      ) : null}
    </section>
  );
}

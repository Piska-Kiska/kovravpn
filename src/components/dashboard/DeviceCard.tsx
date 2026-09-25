// src/components/dashboard/DeviceCard.tsx
// One device: platform icon, name, added date, a "more" menu (TV scanner,
// reset binding, delete), its subscription link, Open in Happ and QR code in
// one row, and the per-device result notices.
"use client";

import { useRef } from "react";
import { ArrowUpRight, Ellipsis, MonitorSmartphone, RotateCcw, ScanLine, Trash2 } from "lucide-react";
import { QrToggle, type QrToggleHandle } from "@/components/QrToggle";
import { ButtonLink, CopyField, Icon, Menu, Notice, type MenuItem } from "@/components/cabinet";
import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { DEVICE_DEFS, isDeviceId } from "@/lib/dashboard/devices";
import { fmtDate } from "@/lib/dashboard/format";
import type { Profile } from "@/lib/dashboard/types";

export interface DeviceCardProps {
  t: DashDict;
  lang: Lang;
  profile: Profile;
  name: string;
  /** "" when the profile has no subscription token. */
  subUrl: string;
  happEncrypted: boolean;
  resetDone: boolean;
  error: string | null;
  onRequestReset(): void;
  onRequestDelete(): void;
  onDismissError(): void;
}

export function DeviceCard({ t, lang, profile, name, subUrl, happEncrypted, resetDone, error, onRequestReset, onRequestDelete, onDismissError }: DeviceCardProps) {
  const shell = useShellT();
  const def = isDeviceId(profile.deviceType) ? DEVICE_DEFS[profile.deviceType] : null;
  const qrRef = useRef<QrToggleHandle>(null);

  const items: MenuItem[] = [
    // The TV scanner lives in QrToggle, which renders only with a link.
    ...(subUrl ? [{ id: "scan", kind: "action", label: t.scan_tv, icon: ScanLine, onSelect: () => qrRef.current?.openScanner() } satisfies MenuItem] : []),
    { id: "reset", kind: "action", label: t.reset_hwid, icon: RotateCcw, onSelect: onRequestReset },
    { id: "sep", kind: "separator" },
    { id: "delete", kind: "action", label: t.delete_device, icon: Trash2, tone: "danger", onSelect: onRequestDelete },
  ];

  const openInHapp =
    happEncrypted && subUrl ? (
      <ButtonLink variant="ghost" size="sm" href={subUrl} iconEnd={ArrowUpRight} iconSize={16} target="_blank" rel="noopener noreferrer">
        {t.open_in_happ}
      </ButtonLink>
    ) : null;

  return (
    <article className="kc-panel kc-dev" aria-label={name}>
      <div className="kc-dev-head">
        <span className="kc-dev-icon">
          <Icon as={def?.icon ?? MonitorSmartphone} size={20} />
        </span>
        <div className="kc-dev-title">
          <h3 className="kc-h3">{name}</h3>
          <p className="kc-dev-meta">{fmt(t.added_on, { date: fmtDate(profile.createdAt, lang) })}</p>
        </div>
        <Menu
          label={fmt(t.more_actions, { name })}
          items={items}
          align="end"
          trigger={(props) => (
            <button {...props} className="kc-btn kc-btn--icon kc-dev-more">
              <Icon as={Ellipsis} size={20} />
            </button>
          )}
        />
      </div>

      <CopyField
        className="kc-dev-link"
        value={subUrl}
        label={t.sub_link}
        copyLabel={shell.copy}
        copiedLabel={shell.copied}
        failedLabel={shell.copy_failed}
      />

      {subUrl ? (
        <QrToggle ref={qrRef} url={subUrl} leading={openInHapp} />
      ) : openInHapp ? (
        <div className="kc-dev-actions">{openInHapp}</div>
      ) : null}

      {resetDone ? (
        <Notice tone="success" className="kc-dev-notice">
          {t.reset_hwid_done}
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="error" className="kc-dev-notice" onDismiss={onDismissError} dismissLabel={shell.dismiss}>
          {error}
        </Notice>
      ) : null}
    </article>
  );
}

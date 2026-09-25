// src/components/dashboard/AppsSection.tsx
// "Get the app": Happ (recommended) and INCY (also works). The download row
// for the visitor's own platform is listed first.
"use client";

import { useState } from "react";
import { ArrowUpRight, Download } from "lucide-react";
import { ButtonLink, Icon, cx } from "@/components/cabinet";
import type { DashDict } from "@/lib/dash-i18n";
import { HAPP_LINKS, HAPP_ROWS, INCY_LINKS, INCY_ROWS, rowsFor, type AppRow } from "@/lib/dashboard/apps";
import { detectPlatform, type DeviceId } from "@/lib/dashboard/devices";
import { useRise } from "./shared";

function AppCard({ t, name, badge, gold, desc, rows, all }: { t: DashDict; name: string; badge: string; gold: boolean; desc: string; rows: readonly AppRow[]; all: string }) {
  return (
    <article className="kc-panel kc-app" aria-label={name}>
      <div className="kc-app-head">
        <h3 className="kc-h3">{name}</h3>
        <span className={cx("kc-badge", gold && "kc-badge--gold")}>{badge}</span>
      </div>
      <p className="kc-small kc-app-desc">{desc}</p>
      <ul className="kc-linkrows">
        {rows.map((r) => (
          <li key={r.key}>
            <a className="kc-linkrow" href={r.href} target={r.download ? undefined : "_blank"} rel={r.download ? undefined : "noopener noreferrer"}>
              <span className="kc-linkrow-label">{t[r.labelKey]}</span>
              <Icon as={r.download ? Download : ArrowUpRight} size={18} className="kc-linkrow-icon" />
            </a>
          </li>
        ))}
      </ul>
      <ButtonLink variant="quiet" size="sm" href={all} target="_blank" rel="noopener noreferrer" iconEnd={ArrowUpRight} iconSize={16} className="kc-app-all">
        {t.dl_all}
      </ButtonLink>
    </article>
  );
}

export function AppsSection({ t, index }: { t: DashDict; index: number }) {
  const [platform] = useState<DeviceId | null>(() => (typeof navigator === "undefined" ? null : detectPlatform(navigator.userAgent)));
  const rise = useRise();
  const r = rise(index);
  return (
    <section className={cx("kc-section", r.className)} style={r.style} aria-labelledby="kc-apps-title">
      <div className="kc-section-head">
        <h2 id="kc-apps-title" className="kc-h2">
          {t.apps_title}
        </h2>
      </div>
      <div className="kc-apps">
        <AppCard t={t} name="Happ" badge={t.apps_recommended} gold desc={t.happ_desc} rows={rowsFor(HAPP_ROWS, platform)} all={HAPP_LINKS.all} />
        <AppCard t={t} name="INCY" badge={t.apps_also} gold={false} desc={t.incy_desc} rows={rowsFor(INCY_ROWS, platform)} all={INCY_LINKS.all} />
      </div>
    </section>
  );
}

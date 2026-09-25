// src/components/dashboard/SubsList.tsx
// "Your subscriptions": one hairline row per subscription.
"use client";

import { ShieldCheck } from "lucide-react";
import { Icon } from "@/components/cabinet";
import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { fmtDate } from "@/lib/dashboard/format";
import type { SubItem } from "@/lib/dashboard/types";

export function subLabel(t: DashDict, k: SubItem["kind"]): string {
  return k === "plan3" ? t.sub_plan3 : k === "plan1" ? t.sub_plan1 : k === "device" ? t.sub_device : t.sub_referral;
}

export function SubsList({ t, lang, subs }: { t: DashDict; lang: Lang; subs: readonly SubItem[] }) {
  if (subs.length === 0) return null;
  return (
    <section className="kc-panel kc-subs" aria-labelledby="kc-subs-title">
      <h2 id="kc-subs-title" className="kc-h3">
        {t.subs_title}
      </h2>
      <ul className="kc-subs-list">
        {subs.map((s) => (
          <li key={s.id} className="kc-sub-row">
            <Icon as={ShieldCheck} size={16} className="kc-sub-icon" />
            <span className="kc-sub-label">{subLabel(t, s.kind)}</span>
            <span className="kc-sub-until">{fmt(t.until, { date: fmtDate(s.expiresAt, lang) })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

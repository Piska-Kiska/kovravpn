// src/components/dashboard/WalletPanel.tsx
// The unified balance on the Plan view (the same USD wallet the Telegram bot
// keeps): the amount, what it is for, and "Top up". WalletChip is its compact
// form for the headers.
"use client";

import { Loader2, Plus, WalletMinimal } from "lucide-react";
import { Button, Icon, cx } from "@/components/cabinet";
import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { fmtMoney } from "@/lib/dashboard/format";

export function fmtCents(cents: number, lang: Lang): string {
  return fmtMoney(cents / 100, "USD", lang);
}

export interface WalletPanelProps {
  t: DashDict;
  lang: Lang;
  balanceCents: number;
  onTopup(): void;
  disabled?: boolean;
}

export function WalletPanel({ t, lang, balanceCents, onTopup, disabled }: WalletPanelProps) {
  return (
    <section className="kc-panel kc-wallet" aria-labelledby="kc-wallet-title">
      <div className="kc-wallet-text">
        <h2 id="kc-wallet-title" className="kc-mono kc-t2">
          {t.wallet_title}
        </h2>
        <p className="kc-wallet-figure">{fmtCents(balanceCents, lang)}</p>
        <p className="kc-small">{t.wallet_body}</p>
      </div>
      <Button variant="ghost" icon={Plus} onClick={onTopup} disabled={disabled}>
        {t.wallet_topup}
      </Button>
    </section>
  );
}

export interface WalletChipProps {
  t: DashDict;
  lang: Lang;
  balanceCents: number;
  /** A payment is being checked: a spinner instead of the wallet glyph. */
  pending?: boolean;
  onClick(): void;
  className?: string;
}

/** "$12.50" pill that opens the top-up sheet. */
export function WalletChip({ t, lang, balanceCents, pending, onClick, className }: WalletChipProps) {
  const amount = fmtCents(balanceCents, lang);
  return (
    <button type="button" className={cx("kc-wchip", pending && "is-pending", className)} onClick={onClick} aria-label={fmt(t.wallet_chip_label, { amount })}>
      {pending ? <Icon as={Loader2} size={16} className="kc-wchip-spin" /> : <Icon as={WalletMinimal} size={16} />}
      <span className="kc-wchip-amount" aria-hidden="true">
        {amount}
      </span>
      <span className="kc-wchip-plus" aria-hidden="true">
        <Icon as={Plus} size={14} />
      </span>
    </button>
  );
}

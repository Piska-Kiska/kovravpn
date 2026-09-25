// src/components/dashboard/PaymentReturnNotice.tsx
// After a return from a payment page (?paid=1): "confirming" while the
// account is polled, "received" once the plan changed. Shown on every view.
import { Notice } from "@/components/cabinet";
import type { DashDict } from "@/lib/dash-i18n";

export function PaymentReturnNotice({ t, done, dismissLabel, onDismiss }: { t: DashDict; done: boolean; dismissLabel: string; onDismiss(): void }) {
  return (
    <Notice tone={done ? "success" : "pending"} className="kc-paid-notice" onDismiss={onDismiss} dismissLabel={dismissLabel}>
      {done ? t.paid_done : t.paid_pending}
    </Notice>
  );
}

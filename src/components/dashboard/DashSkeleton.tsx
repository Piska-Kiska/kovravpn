// src/components/dashboard/DashSkeleton.tsx
// Loading placeholder: a hero block and two device cards.
export function DashSkeleton({ label }: { label: string }) {
  return (
    <div className="kc-skel" aria-hidden="false">
      <span className="kc-sr" role="status">
        {label}
      </span>
      <div className="kc-skel-block kc-skel-hero" aria-hidden="true" />
      <div className="kc-skel-row" aria-hidden="true">
        <div className="kc-skel-block kc-skel-title" />
      </div>
      <div className="kc-skel-cards" aria-hidden="true">
        <div className="kc-skel-block kc-skel-card" />
        <div className="kc-skel-block kc-skel-card" />
      </div>
    </div>
  );
}

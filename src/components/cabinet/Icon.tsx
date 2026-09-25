// src/components/cabinet/Icon.tsx
// Lucide wrapper: stroke 1.5, decorative (aria-hidden, not focusable).
import type { LucideIcon } from "lucide-react";

export interface IconProps {
  as: LucideIcon;
  size?: number;
  className?: string;
}

export function Icon({ as: Glyph, size = 18, className }: IconProps) {
  return <Glyph size={size} strokeWidth={1.5} aria-hidden="true" focusable="false" className={className} />;
}

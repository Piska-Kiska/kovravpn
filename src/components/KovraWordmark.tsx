// src/components/KovraWordmark.tsx
//
// The Kovra wordmark (new logo, 25.09.2026): "kovra" with the o–v ligature,
// followed by the gold dot.
//
// The letters are a single mask image painted with `currentColor`, so one
// file serves both themes and follows the text colour of wherever it sits.
// The dot is drawn rather than baked into the image: a baked dot would be
// recoloured with the letters, and the brand gold must stay gold.
//
// Geometry comes from the owner's artwork: the trimmed ink box of
// /brand/kovra-word.png is 988 x 317 px, the dot sits at (1046.5, 274.5)
// with radius 34 in the same units.
import type { CSSProperties } from "react";

const WORD_W = 988;
const WORD_H = 317;
const DOT = { cx: 1046.5, cy: 274.5, r: 34 } as const;
const GOLD = "#C6A983";
const MASK = "url(/brand/kovra-word.png)";

interface Props {
  /** Height of the letters' ink box (ascender of "k" to the baseline), px. */
  height?: number;
  className?: string;
  style?: CSSProperties;
}

export default function KovraWordmark({ height = 24, className = "", style }: Props) {
  const k = height / WORD_H;
  const word: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: WORD_W * k,
    height,
    backgroundColor: "currentColor",
    WebkitMaskImage: MASK,
    maskImage: MASK,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };
  const dot: CSSProperties = {
    position: "absolute",
    left: (DOT.cx - DOT.r) * k,
    top: (DOT.cy - DOT.r) * k,
    width: 2 * DOT.r * k,
    height: 2 * DOT.r * k,
    borderRadius: "50%",
    backgroundColor: GOLD,
  };
  return (
    <span
      role="img"
      aria-label="Kovra"
      className={className}
      style={{ position: "relative", display: "inline-block", flex: "none", width: (DOT.cx + DOT.r) * k, height, ...style }}
    >
      <span aria-hidden="true" style={word} />
      <span aria-hidden="true" style={dot} />
    </span>
  );
}

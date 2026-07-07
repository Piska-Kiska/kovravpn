"use client";

// Rolling odometer for prices ("$79.08" → "$143.88"). Each digit is a
// vertical 0–9 strip translated to the active value; columns are keyed
// from the string end so cents keep their columns when the integer part
// grows. Screen readers get the plain value, the strips are decorative.

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

type Props = {
  value: string;
  className?: string;
};

export default function DigitRoll({ value, className }: Props) {
  const chars = value.split("");
  const len = chars.length;
  return (
    <span className={`k-dr${className ? ` ${className}` : ""}`}>
      <span className="k-sr">{value}</span>
      {chars.map((ch, i) => {
        const key = len - i;
        return /\d/.test(ch) ? (
          <span key={`d${key}`} className="k-dr-col" aria-hidden="true">
            <span
              className="k-dr-strip"
              style={{
                transform: `translateY(-${Number(ch)}em)`,
                transitionDelay: `${i * 30}ms`,
              }}
            >
              {DIGITS.map((d) => (
                <span key={d} className="k-dr-d">
                  {d}
                </span>
              ))}
            </span>
          </span>
        ) : (
          <span key={`c${key}`} className="k-dr-ch" aria-hidden="true">
            {ch}
          </span>
        );
      })}
    </span>
  );
}

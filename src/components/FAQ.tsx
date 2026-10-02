// src/components/FAQ.tsx
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FaqItem } from "@/lib/faq-items";

interface FAQProps {
  /** FAQ list to render. */
  items: readonly FaqItem[];
  /**
   * i18n key prefix. When set, each item's question and answer get
   * `data-i18n="<prefix>.<index>.q"` and `…<index>.a"` attributes so the
   * Localizer can swap text in EN; the guide page passes `"faq.guide"`.
   */
  keyPrefix: string;
}

export default function FAQ({ items, keyPrefix }: FAQProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {items.map((item, i) => (
        <div
          key={i}
          className={`transition-all duration-200 ${
            openIdx === i ? "nm-pressed" : "nm-raised-sm"
          }`}
        >
          <button
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            className="w-full flex items-center justify-between px-6 py-5 text-left gap-4 cursor-pointer"
          >
            <span
              className="font-semibold text-nm-text"
              data-i18n={`${keyPrefix}.${i}.q`}
            >
              {item.q}
            </span>
            <ChevronDown
              className={`w-5 h-5 text-nm-text-secondary shrink-0 transition-transform duration-300 ${
                openIdx === i ? "rotate-180" : ""
              }`}
            />
          </button>
          <div className={`accordion-content ${openIdx === i ? "open" : ""}`}>
            <div className="accordion-inner">
              <p
                className="px-6 pb-5 text-nm-text-secondary leading-relaxed"
                data-i18n={`${keyPrefix}.${i}.a`}
              >
                {item.a}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

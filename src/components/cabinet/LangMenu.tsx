// src/components/cabinet/LangMenu.tsx
// The single language switcher of the cabinet (auth header, dashboard header,
// Account > Preferences). Writes through setCabinetLang(), which stores the
// choice together with the explicit flag.
"use client";

import { ChevronDown, Globe } from "lucide-react";
import { CABINET_LANGS, fmt, setCabinetLang, useCabinetLang } from "@/lib/cabinet-lang";
import { useShellT } from "@/lib/i18n-shell";
import { Icon } from "./Icon";
import { Menu, type MenuItem } from "./Menu";

export interface LangMenuProps {
  variant?: "pill" | "inline";
  align?: "start" | "end";
}

export function LangMenu({ variant = "pill", align = "end" }: LangMenuProps) {
  const lang = useCabinetLang();
  const shell = useShellT();
  const current = CABINET_LANGS.find((l) => l.code === lang) ?? CABINET_LANGS[0];

  const items: MenuItem[] = CABINET_LANGS.map((l) => ({
    id: l.code,
    kind: "radio",
    label: l.native,
    meta: l.short,
    lang: l.code,
    checked: l.code === lang,
    onSelect: () => {
      if (l.code !== lang) setCabinetLang(l.code);
    },
  }));

  return (
    <Menu
      label={fmt(shell.lang_button, { name: current.native })}
      items={items}
      align={align}
      block={variant === "inline"}
      trigger={(props) =>
        variant === "inline" ? (
          <button {...props} className="kc-inline-trigger">
            <span lang={current.code}>{current.native}</span>
            <Icon as={ChevronDown} size={16} className="kc-chev" />
          </button>
        ) : (
          <button {...props} className="kc-pill">
            <Icon as={Globe} size={16} className="kc-pill-globe" />
            <span className="kc-pill-code">{current.short}</span>
            <Icon as={ChevronDown} size={14} className="kc-chev" />
          </button>
        )
      }
    />
  );
}

// src/components/cabinet/LangMenu.tsx
// Inline language picker of Account > Preferences (the headers use the
// shared capsule, src/components/chrome/PrefsCapsule). Writes through
// setCabinetLang(), which stores the choice together with the explicit flag.
"use client";

import { ChevronDown } from "lucide-react";
import { CABINET_LANGS, fmt, setCabinetLang, useCabinetLang } from "@/lib/cabinet-lang";
import { useShellT } from "@/lib/i18n-shell";
import { Icon } from "./Icon";
import { Menu, type MenuItem } from "./Menu";

export interface LangMenuProps {
  align?: "start" | "end";
}

export function LangMenu({ align = "start" }: LangMenuProps) {
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
      block
      trigger={(props) => (
        <button {...props} className="kc-inline-trigger">
          <span lang={current.code}>{current.native}</span>
          <Icon as={ChevronDown} size={16} className="kc-chev" />
        </button>
      )}
    />
  );
}

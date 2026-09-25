// src/components/cabinet/ThemeMenu.tsx
// Theme switcher: System / Light / Dark. The trigger icon shows the
// preference (not the resolved theme), so "System" is always visible.
"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { fmt } from "@/lib/cabinet-lang";
import { useShellT, type ShellDict } from "@/lib/i18n-shell";
import { useThemePref, type ThemePref } from "@/lib/theme";
import { Icon } from "./Icon";
import { Menu, type MenuItem } from "./Menu";

export const THEME_OPTIONS: readonly { value: ThemePref; icon: LucideIcon; key: keyof Pick<ShellDict, "theme_system" | "theme_light" | "theme_dark"> }[] = [
  { value: "system", icon: Monitor, key: "theme_system" },
  { value: "light", icon: Sun, key: "theme_light" },
  { value: "dark", icon: Moon, key: "theme_dark" },
];

export interface ThemeMenuProps {
  align?: "start" | "end";
}

export function ThemeMenu({ align = "end" }: ThemeMenuProps) {
  const shell = useShellT();
  const { pref, setPref } = useThemePref();
  const current = THEME_OPTIONS.find((o) => o.value === pref) ?? THEME_OPTIONS[0];

  const items: MenuItem[] = THEME_OPTIONS.map((o) => ({
    id: o.value,
    kind: "radio",
    label: shell[o.key],
    icon: o.icon,
    checked: o.value === pref,
    onSelect: () => setPref(o.value),
  }));

  return (
    <Menu
      label={fmt(shell.theme_button, { name: shell[current.key] })}
      items={items}
      align={align}
      trigger={(props) => (
        <button {...props} className="kc-roundbtn">
          <Icon as={current.icon} size={18} />
        </button>
      )}
    />
  );
}

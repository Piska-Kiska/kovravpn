// src/components/PlanSelector.tsx
"use client";

import Link from "next/link";
import { Shield, Smartphone, Zap, Wifi, Globe } from "lucide-react";

const FEATURES = [
  { icon: Smartphone, key: "plan.feat.0", text: "До 100 устройств на аккаунт" },
  { icon: Zap, key: "plan.feat.1", text: "Скорость до 10 Гбит/с" },
  { icon: Shield, key: "plan.feat.2", text: "VLESS Reality шифрование" },
  { icon: Globe, key: "plan.feat.3", text: "Все платформы: Windows, macOS, Android, iOS" },
] as const;

export default function PlanSelector() {
  return (
    <div className="max-w-lg mx-auto">
      {/* Price card */}
      <div className="nm-raised p-8 md:p-10">
        <div className="text-center mb-8">
          <div
            className="nm-pressed-sm inline-block px-4 py-1.5 text-xs font-medium text-nm-accent mb-4"
            data-i18n="plan.badge"
          >
            Простая цена
          </div>
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="font-heading text-6xl font-bold text-nm-text">100</span>
            <div className="text-left">
              <span className="text-xl text-nm-text-secondary">₽</span>
              <span
                className="block text-xs text-nm-text-secondary"
                data-i18n="plan.unit"
              >
                /мес за устройство
              </span>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="space-y-3 mb-8">
          {FEATURES.map((f) => (
            <div key={f.key} className="flex items-center gap-3">
              <div className="nm-circle-pressed w-8 h-8 flex items-center justify-center shrink-0">
                <f.icon className="w-4 h-4 text-nm-accent" />
              </div>
              <span className="text-sm text-nm-text" data-i18n={f.key}>
                {f.text}
              </span>
            </div>
          ))}
        </div>

        <Link
          href="/register"
          className="nm-btn-accent block w-full py-4 font-semibold text-base text-center"
          data-i18n="plan.cta"
        >
          Выбрать
        </Link>
        <p
          className="text-xs text-nm-text-secondary text-center mt-3"
          data-i18n="plan.note"
        >
          Пополните 10 ₽ — попробуйте VPN на 3 дня
        </p>
      </div>
    </div>
  );
}

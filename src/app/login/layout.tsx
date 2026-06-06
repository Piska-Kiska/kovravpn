// src/app/login/layout.tsx
//
// Login is a "use client" page so it can't export metadata directly.
// A route-scoped layout lets us set per-route metadata that overrides
// the root template.

import type { Metadata } from "next";

const TITLE = "Войти в личный кабинет";
const DESC =
  "Вход в личный кабинет Kovra: управление подписками, оплата, добавление устройств. Авторизация через email или Telegram.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/login" },
  openGraph: {
    title: `${TITLE} | Kovra`,
    description: DESC,
    url: "/login",
  },
  twitter: {
    title: `${TITLE} | Kovra`,
    description: DESC,
  },
  // Auth pages shouldn't show up in SERPs.
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

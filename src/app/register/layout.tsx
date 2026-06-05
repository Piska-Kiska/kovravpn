// src/app/register/layout.tsx
import type { Metadata } from "next";

const TITLE = "Регистрация";
const DESC =
  "Создайте аккаунт ПроксисВпнович за минуту: подтверждение по email или один клик через Telegram. Первое пополнение от 10 ₽, без подписки и автосписаний.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/register" },
  openGraph: {
    title: `${TITLE} | ПроксисВпнович`,
    description: DESC,
    url: "/register",
  },
  twitter: {
    title: `${TITLE} | ПроксисВпнович`,
    description: DESC,
  },
  robots: { index: false, follow: true },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}

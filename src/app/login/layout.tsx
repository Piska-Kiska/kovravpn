// src/app/login/layout.tsx
//
// Login is a "use client" page, so its metadata lives in this route layout.
// The title is absolute (no root template); the page sets a localized
// document.title at runtime.

import type { Metadata } from "next";

const TITLE = "Sign in | Kovra";
const DESC = "Sign in to your Kovra account to manage your devices, plan and payments. Email or Telegram.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: "/login" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "/login",
    locale: "en_US",
  },
  twitter: {
    title: TITLE,
    description: DESC,
  },
  // Auth pages shouldn't show up in SERPs.
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

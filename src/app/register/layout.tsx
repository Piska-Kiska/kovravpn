// src/app/register/layout.tsx
//
// Register is a "use client" page, so its metadata lives in this route
// layout. The title is absolute (no root template); the page sets a
// localized document.title at runtime.

import type { Metadata } from "next";

const TITLE = "Create account | Kovra";
const DESC = "Create your Kovra account in a minute with email or Telegram. Card or crypto, up to 3 devices.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: "/register" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "/register",
    locale: "en_US",
  },
  twitter: {
    title: TITLE,
    description: DESC,
  },
  robots: { index: false, follow: true },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}

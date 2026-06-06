// src/app/register/layout.tsx
import type { Metadata } from "next";

const TITLE = "Sign up";
const DESC =
  "Create your Kovra account in a minute - email or one-tap Telegram. Crypto payments, up to 3 devices, from $6.59/mo.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/register" },
  openGraph: {
    title: `${TITLE} | Kovra`,
    description: DESC,
    url: "/register",
  },
  twitter: {
    title: `${TITLE} | Kovra`,
    description: DESC,
  },
  robots: { index: false, follow: true },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}

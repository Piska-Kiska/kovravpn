// src/app/(landing)/layout.tsx
//
// Chrome for the English landing pages (/vless, /crypto): the same English-only
// header and footer as /guides, with the guides' stylesheet and the landing
// rules. The route group adds nothing to the URLs.
import type { Metadata } from "next";
import "../guides/guides.css";
import "./landing.css";
import EnglishShell from "@/components/EnglishShell";

export const metadata: Metadata = {
  openGraph: { locale: "en_US" },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <EnglishShell langNote="This page is in English. Other languages open the home page.">{children}</EnglishShell>;
}

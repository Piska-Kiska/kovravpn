// src/app/guides/layout.tsx
//
// Chrome for the English /guides section: the shared English-only shell
// (src/components/EnglishShell.tsx) with the guides' stylesheet.
import type { Metadata } from "next";
import "./guides.css";
import EnglishShell from "@/components/EnglishShell";

export const metadata: Metadata = {
  openGraph: { locale: "en_US" },
};

export default function GuidesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EnglishShell langNote="Guides are in English. Other languages open the home page.">{children}</EnglishShell>
  );
}

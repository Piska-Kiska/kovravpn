// src/app/dashboard/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  // Absolute: the global "%s | Kovra" template is not applied twice. The page
  // sets a localized document.title on the client.
  title: { absolute: "Dashboard | Kovra" },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}

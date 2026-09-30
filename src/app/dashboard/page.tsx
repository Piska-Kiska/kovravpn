// src/app/dashboard/page.tsx
//
// The personal dashboard on the site. Everything lives in DashboardView,
// shared with the Telegram Mini App (/tg), which renders it in embedded mode.
"use client";

import { DashboardView } from "@/components/dashboard/DashboardView";

export default function DashboardPage() {
  return <DashboardView />;
}

// src/components/SiteAnalytics.tsx
//
// Vercel's page analytics and speed insights for every page, except the app
// view of the pages our app opens (`?src=app`, lib/legal-routes.ts): the app
// promises that those pages count nothing (its src/legal.ts), so their
// events are dropped before they are sent.
"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { isAppViewUrl } from "@/lib/legal-routes";

function dropAppView<T extends { url: string }>(event: T): T | null {
  return isAppViewUrl(event.url) ? null : event;
}

export default function SiteAnalytics() {
  return (
    <>
      <Analytics beforeSend={(event: BeforeSendEvent) => dropAppView(event)} />
      <SpeedInsights beforeSend={dropAppView} />
    </>
  );
}

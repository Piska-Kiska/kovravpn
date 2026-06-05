// src/components/AttributionCapture.tsx
//
// Tiny client component that runs `captureAttribution()` once on mount.
// Mounted once in the root layout so that UTM params on *any* landing page
// (/, /guide, /register, /terms, ...) are captured and persisted.
//
// Renders nothing visible.

"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

export default function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}

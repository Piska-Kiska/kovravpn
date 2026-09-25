// src/components/NavToggles.tsx
// Header preferences of the runtime-translated pages (/guide, /privacy,
// /terms): the shared language | theme capsule.
"use client";

import { RuntimePrefs } from "@/components/chrome/RuntimePrefs";

export default function NavToggles() {
  return <RuntimePrefs />;
}

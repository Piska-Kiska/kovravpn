// src/app/dashboard/account/delete/page.tsx
//
// Account deletion on the site: the page the Kovra app for iPhone and iPad
// opens. Everything lives in DeleteAccountView.
//
// Under /dashboard on purpose: the middleware checks the session here, and
// without one sends the person to /login with `?next=` so they come back to
// this page (lib/login-return.ts). Indexing is off through the dashboard
// layout; the tab title is translated in the browser (useDocumentTitle).
import type { Metadata } from "next";
import DeleteAccountView from "./DeleteAccountView";

export const metadata: Metadata = {
  // Absolute, as in the dashboard layout: the global "%s | Kovra" template is not applied twice.
  title: { absolute: "Delete account | Kovra" },
};

export default function DeleteAccountPage() {
  return <DeleteAccountView />;
}

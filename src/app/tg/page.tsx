// src/app/tg/page.tsx
//
// The cabinet inside Telegram (Mini App): the same DashboardView as
// /dashboard in embedded mode; all the Telegram mechanics are in TgShell.
//
// Deliberately NOT in the middleware matcher: the session here comes from the
// signed initData, which only Telegram's script hands over in the browser. A
// cookie check before that is meaningless, and a redirect to /login inside
// Telegram is a dead end.
import TgShell from "./TgShell";

export default function TgPage() {
  return <TgShell />;
}

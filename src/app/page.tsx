// src/app/page.tsx: the Kovra landing.
//
// A server component around the client view (src/app/HomeView.tsx), so the
// page can read what only the server knows. The view keeps the language and
// theme switch in the browser.
import HomeView from "./HomeView";

export default function Page() {
  return <HomeView />;
}

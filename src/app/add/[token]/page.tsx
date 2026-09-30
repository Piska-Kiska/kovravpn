// src/app/add/[token]/page.tsx
//
// The bridge from the bot's "Add to Happ" button into the Happ app.
//
// Telegram inline buttons open only http(s) and tg:// links, so the bot links
// here and this page opens `happ://add/<subscription link>`, the import link
// Happ documents. It stays on screen with the button, the store links and the
// key to copy, for when Happ is not installed yet.
//
// Why not /p/<token>: that page encrypts ANOTHER feed (/api/sub/<token>/vless)
// into happ://crypt4, which is paused (lib/feature-flags.ts: iOS Happ fails
// to decrypt it). Here Happ gets exactly the link the person sees and copies,
// the one it will then keep refreshing.
//
// An unknown or deleted token is a 404, not a page with a dead button. The
// lookup is rate-limited per address before it touches Redis, so the page is
// no cheap oracle for guessing tokens (they are 128-bit anyway).

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import KovraWordmark from "@/components/KovraWordmark";
import { HAPP_LINKS } from "@/lib/dashboard/apps";
import { rateLimit } from "@/lib/ratelimit";
import { isSubTokenShape, plainSubUrl, subTokenExists } from "@/lib/sub-token-lookup";
import { ADD_DICTS, addLangOf } from "./add-i18n";
import { AutoOpen, KeyCopy } from "./AddClient";
import "@/app/cabinet.css";
import "./add.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Add to Happ | Kovra" },
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}

const RL_MAX = 60;
const RL_WINDOW_SEC = 60;

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return (h.get("x-real-ip") ?? "unknown").slice(0, 64);
}

export default async function AddToHappPage({ params, searchParams }: PageProps) {
  const [{ token }, { lang: rawLang }] = await Promise.all([params, searchParams]);
  const lang = addLangOf(rawLang);
  const t = ADD_DICTS[lang];
  if (!isSubTokenShape(token)) notFound();

  let limited = false;
  try {
    limited = !(await rateLimit(`add:${await clientIp()}`, RL_MAX, RL_WINDOW_SEC)).ok;
  } catch (err) {
    console.error("[add] rate limit unavailable:", err instanceof Error ? err.message : err);
  }

  if (limited) {
    return (
      <div className="kc kc-root kc-add" lang={lang}>
        <main className="kc-add-main" id="kc-main">
          <KovraWordmark height={22} />
          <p className="kc-body kc-t2">{t.limited}</p>
        </main>
      </div>
    );
  }

  // Redis down: show the page anyway. It holds nothing but the token already
  // in the address, and a real person should not get an error page for it.
  let exists = true;
  try {
    exists = await subTokenExists(token);
  } catch (err) {
    console.error("[add] token lookup unavailable:", err instanceof Error ? err.message : err);
  }
  if (!exists) notFound();

  const subUrl = plainSubUrl(token);
  const happUrl = `happ://add/${subUrl}`;

  return (
    <div className="kc kc-root kc-add" lang={lang}>
      <AutoOpen happUrl={happUrl} />
      <main className="kc-add-main" id="kc-main">
        <KovraWordmark height={22} className="kc-add-mark" />
        <p className="kc-kicker">{t.kicker}</p>
        <h1 className="kc-h1">{t.title}</h1>
        <p className="kc-body kc-t2">{t.lead}</p>
        <a className="kc-btn kc-btn--cta kc-btn--block" href={happUrl}>
          <span className="kc-btn-label">{t.open}</span>
        </a>
        <p className="kc-small">{t.noApp}</p>
        <div className="kc-add-stores">
          <a className="kc-btn kc-btn--ghost kc-btn--sm" href={HAPP_LINKS.apple} rel="noopener">
            <span className="kc-btn-label">App Store</span>
          </a>
          <a className="kc-btn kc-btn--ghost kc-btn--sm" href={HAPP_LINKS.android} rel="noopener">
            <span className="kc-btn-label">Google Play</span>
          </a>
          <a className="kc-btn kc-btn--ghost kc-btn--sm" href={HAPP_LINKS.windows} rel="noopener">
            <span className="kc-btn-label">Windows</span>
          </a>
        </div>
        <hr className="kc-add-hair" />
        <KeyCopy value={subUrl} label={t.copyLabel} copyLabel={t.copy} copiedLabel={t.copied} failedLabel={t.copyFailed} />
      </main>
    </div>
  );
}

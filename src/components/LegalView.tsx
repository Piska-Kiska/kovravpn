// src/components/LegalView.tsx
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLang } from "@/i18n/useLang";
import { LEGAL, type LegalDocId } from "@/i18n/legal";
import { legalHref } from "@/lib/legal-routes";

type ContactLink = { token: string; href: string; external: boolean };

const BOT_LINK: ContactLink = { token: "@KovraVPN_bot", href: "https://t.me/KovraVPN_bot", external: true };
const EMAIL_LINK: ContactLink = { token: "support@kovravpn.com", href: "mailto:support@kovravpn.com", external: false };

/** The app view shows the bot as plain text: it sells, and the app may not lead there (lib/legal-routes.ts). */
const WEB_LINKS: readonly ContactLink[] = [BOT_LINK, EMAIL_LINK];
const APP_LINKS: readonly ContactLink[] = [EMAIL_LINK];

/** Turn known contact tokens inside a paragraph into anchors. */
function linkify(text: string, links: readonly ContactLink[]): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    let hit: { idx: number; link: ContactLink } | null = null;
    for (const link of links) {
      const idx = rest.indexOf(link.token);
      if (idx !== -1 && (hit === null || idx < hit.idx)) hit = { idx, link };
    }
    if (hit === null) {
      out.push(rest);
      break;
    }
    if (hit.idx > 0) out.push(rest.slice(0, hit.idx));
    out.push(
      <a
        key={`l${key++}`}
        href={hit.link.href}
        className="text-nm-accent hover:underline"
        {...(hit.link.external ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        {hit.link.token}
      </a>,
    );
    rest = rest.slice(hit.idx + hit.link.token.length);
  }
  return out;
}

/**
 * Renders a single legal document body (Terms or Privacy) in the active
 * language. `appView`: the page was opened by our app (lib/legal-routes.ts).
 */
export default function LegalView({ doc, appView = false }: { doc: LegalDocId; appView?: boolean }) {
  const lang = useLang();
  const links = appView ? APP_LINKS : WEB_LINKS;
  const d = LEGAL[lang][doc];
  const other: LegalDocId = doc === "terms" ? "privacy" : "terms";

  return (
    <article className="space-y-8" lang={lang}>
      <header className="space-y-2">
        <h1 className="font-heading text-3xl md:text-4xl font-bold text-nm-text tracking-tight">
          {d.title}
        </h1>
        <p className="text-sm text-nm-text-secondary">{d.updated}</p>
      </header>

      <div className="space-y-8 text-sm leading-relaxed text-nm-text-secondary">
        {d.sections.map((s, i) => (
          <section key={i} className="space-y-2">
            <h2 className="text-lg font-semibold text-nm-text">{s.h}</h2>
            {s.p.map((para, j) => (
              <p key={j}>{linkify(para, links)}</p>
            ))}
          </section>
        ))}

        <section className="space-y-2 pt-2 border-t border-nm-text/10">
          <h2 className="text-lg font-semibold text-nm-text">{d.related}</h2>
          <p>
            <Link href={legalHref(`/${other}`, appView)} className="text-nm-accent hover:underline">
              {LEGAL[lang][other].title}
            </Link>
          </p>
        </section>
      </div>
    </article>
  );
}

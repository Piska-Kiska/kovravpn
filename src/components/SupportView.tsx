// src/components/SupportView.tsx
//
// The support page's body in the visitor's language (src/i18n/support.ts),
// laid out like the legal pages (components/LegalView.tsx). `appView`: the
// page was opened by our app (lib/legal-routes.ts), so the paragraphs that
// point to the bot or to other apps are left out, and the links to the
// documents keep the app view.
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLang } from "@/i18n/useLang";
import { SUPPORT, type SupportLink, type SupportPara } from "@/i18n/support";
import { legalHref } from "@/lib/legal-routes";

/** Account deletion has no app view: the page itself is on the app's allowlist as it is. */
const ACCOUNT_DELETE_PATH = "/dashboard/account/delete";

function hrefOf(link: SupportLink, appView: boolean): string {
  switch (link) {
    case "email":
      return "mailto:support@kovravpn.com";
    case "bot":
      return "https://t.me/KovraVPN_bot";
    case "delete":
      return ACCOUNT_DELETE_PATH;
    case "privacy":
      return legalHref("/privacy", appView);
    case "terms":
      return legalHref("/terms", appView);
  }
}

const LINK_CLASS = "text-nm-accent hover:underline";

function renderPara(para: SupportPara, appView: boolean): ReactNode[] {
  return para.parts.map((part, i) => {
    if (typeof part === "string") return part;
    const href = hrefOf(part.link, appView);
    if (part.link === "email" || part.link === "bot") {
      return (
        <a key={i} href={href} className={LINK_CLASS} {...(part.link === "bot" ? { target: "_blank", rel: "noreferrer" } : {})}>
          {part.text}
        </a>
      );
    }
    return (
      <Link key={i} href={href} className={LINK_CLASS}>
        {part.text}
      </Link>
    );
  });
}

/** The paragraphs this view may show. */
function shown(paras: readonly SupportPara[], appView: boolean): readonly SupportPara[] {
  return appView ? paras.filter((p) => !p.webOnly) : paras;
}

export default function SupportView({ appView = false }: { appView?: boolean }) {
  const lang = useLang();
  const d = SUPPORT[lang];

  return (
    <article className="space-y-8" lang={lang}>
      <header className="space-y-2">
        <h1 className="font-heading text-3xl md:text-4xl font-bold text-nm-text tracking-tight">{d.title}</h1>
        <p className="text-sm text-nm-text-secondary">{d.intro}</p>
      </header>

      <div className="space-y-8 text-sm leading-relaxed text-nm-text-secondary">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-nm-text">{d.contactH}</h2>
          {shown(d.contact, appView).map((p, i) => (
            <p key={i}>{renderPara(p, appView)}</p>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-nm-text">{d.faqH}</h2>
          {d.faq.map((item, i) => (
            <div key={i} className="space-y-1">
              <h3 className="font-semibold text-nm-text">{item.q}</h3>
              {shown(item.a, appView).map((p, j) => (
                <p key={j}>{renderPara(p, appView)}</p>
              ))}
            </div>
          ))}
        </section>

        <section className="space-y-2 pt-2 border-t border-nm-text/10">
          <h2 className="text-lg font-semibold text-nm-text">{d.docsH}</h2>
          {d.docs.map((p, i) => (
            <p key={i}>{renderPara(p, appView)}</p>
          ))}
        </section>
      </div>
    </article>
  );
}

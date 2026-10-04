// src/app/(landing)/crypto/page.tsx: /crypto, "VPN with USDT payment, no email signup".
//
// English, static. The guides vpn-that-accepts-usdt, pay-for-vpn-with-crypto
// and vpn-without-email stay the "how"; this page is the "buy". The copy is
// src/lib/landing-copy.ts, the title and description src/lib/site-meta.ts, the
// prices src/lib/plan-prices.ts, the bot link src/lib/bot-link.ts.
import Link from "next/link";
import type { Metadata } from "next";
import LandingCrumbs from "@/components/LandingCrumbs";
import LandingFaq from "@/components/LandingFaq";
import { botChatUrl, botUsername } from "@/lib/bot-link";
import { CRYPTO_FAQ, CRYPTO_MORE, CRYPTO_PAGE, LIMITS_TEXT } from "@/lib/landing-copy";
import { CRYPTO_META, landingMetadata } from "@/lib/site-meta";

export const metadata: Metadata = landingMetadata(CRYPTO_META, "/crypto", "Pay for a VPN in USDT");

export default function CryptoPage() {
  const botUrl = botChatUrl();
  const botLabel = `Open @${botUsername()}`;

  return (
    <main className="lp">
      <div className="gd-wrap">
        <LandingCrumbs name="Pay with crypto" path="/crypto" />

        <section className="lp-hero">
          <p className="lp-kicker">{CRYPTO_PAGE.kicker}</p>
          <h1>{CRYPTO_PAGE.h1}</h1>
          <p className="lp-lead">{CRYPTO_PAGE.lead}</p>
          <div className="lp-cta">
            <a href={botUrl} className="k-btn k-btn-gold" rel="noopener">
              {botLabel}
            </a>
            <a href="/register" className="k-btn k-btn-ghost">
              {CRYPTO_PAGE.ctaWeb}
            </a>
          </div>
        </section>

        <div className="lp-rows">
          {CRYPTO_PAGE.rows.map((row) => (
            <section className="lp-row" key={row.h}>
              <h2>{row.h}</h2>
              <div>
                <p>{row.p}</p>
              </div>
            </section>
          ))}
        </div>

        <p className="gd-notice" role="note">
          {LIMITS_TEXT}
        </p>

        <LandingFaq items={CRYPTO_FAQ} />

        <div className="lp-cta">
          <a href={botUrl} className="k-btn k-btn-gold" rel="noopener">
            {botLabel}
          </a>
          <a href="/register" className="k-btn k-btn-ghost">
            {CRYPTO_PAGE.ctaWeb}
          </a>
        </div>

        <nav className="lp-more" aria-label="Keep reading">
          {CRYPTO_MORE.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}

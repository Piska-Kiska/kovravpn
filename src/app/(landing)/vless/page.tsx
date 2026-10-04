// src/app/(landing)/vless/page.tsx: /vless, "VLESS Reality VPN subscription for Happ & INCY".
//
// English, static. The copy is src/lib/landing-copy.ts, the title and
// description src/lib/site-meta.ts, the prices src/lib/plan-prices.ts: nothing
// on this page is typed twice.
import Link from "next/link";
import type { Metadata } from "next";
import LandingCrumbs from "@/components/LandingCrumbs";
import LandingFaq from "@/components/LandingFaq";
import {
  LIMITS_TEXT,
  NO_RENEWAL_TEXT,
  PAYMENT_TEXT,
  PRICES,
  REFUND_TEXT,
  SAVINGS_TEXT,
  TERM_LABELS,
  VLESS_FAQ,
  VLESS_MORE,
  VLESS_PAGE,
} from "@/lib/landing-copy";
import { planRows } from "@/lib/plan-prices";
import { VLESS_META, landingMetadata } from "@/lib/site-meta";

export const metadata: Metadata = landingMetadata(VLESS_META, "/vless", "VLESS subscription for Happ & INCY");

export default function VlessPage() {
  const oneDevice = planRows("plan1");
  const threeDevices = planRows("plan3");

  return (
    <main className="lp">
      <div className="gd-wrap">
        <LandingCrumbs name="VLESS subscription" path="/vless" />

        <section className="lp-hero">
          <p className="lp-kicker">{VLESS_PAGE.kicker}</p>
          <h1>{VLESS_PAGE.h1}</h1>
          <p className="lp-lead">{VLESS_PAGE.lead}</p>
          <div className="lp-cta">
            <a href="/register" className="k-btn k-btn-gold">
              {VLESS_PAGE.cta}
            </a>
            <a href="/guide" className="k-btn k-btn-ghost">
              Setup guide
            </a>
          </div>
        </section>

        <div className="lp-rows">
          {VLESS_PAGE.rows.map((row) => (
            <section className="lp-row" key={row.h}>
              <h2>{row.h}</h2>
              <div>
                <p>{row.p}</p>
                {"links" in row && (
                  <p className="lp-links">
                    {row.links.map((link) => (
                      <Link href={link.href} key={link.href}>
                        {link.label}
                      </Link>
                    ))}
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>

        <section className="lp-sec" id="pricing">
          <h2>Pricing</h2>
          <div className="lp-table-wrap">
            <table className="lp-table">
              <thead>
                <tr>
                  <th scope="col">Term</th>
                  <th scope="col">1 device</th>
                  <th scope="col">Up to 3 devices</th>
                </tr>
              </thead>
              <tbody>
                {oneDevice.map((row, i) => (
                  <tr key={row.term}>
                    <th scope="row">{TERM_LABELS[row.term]}</th>
                    <td>
                      {row.total}
                      {row.discount > 0 && <span className="lp-save">-{row.discount}%</span>}
                    </td>
                    <td>
                      {threeDevices[i].total}
                      {threeDevices[i].discount > 0 && <span className="lp-save">-{threeDevices[i].discount}%</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="lp-fine">
            {NO_RENEWAL_TEXT} An extra device is {PRICES.extraDevice} per 30 days. {SAVINGS_TEXT} {PAYMENT_TEXT}
          </p>
          <p className="lp-fine">{REFUND_TEXT}</p>
          <div className="lp-cta">
            <a href="/register" className="k-btn k-btn-gold">
              {VLESS_PAGE.cta}
            </a>
          </div>
        </section>

        <p className="gd-notice" role="note">
          {LIMITS_TEXT}
        </p>

        <LandingFaq items={VLESS_FAQ} />

        <nav className="lp-more" aria-label="Keep reading">
          {VLESS_MORE.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}

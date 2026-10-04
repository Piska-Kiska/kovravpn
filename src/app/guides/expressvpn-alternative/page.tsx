// src/app/guides/expressvpn-alternative/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "expressvpn-alternative";
const OG = ogImageUrl("ExpressVPN Alternatives", "Compared on what matters");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Why do people look for ExpressVPN alternatives?",
    a: "Three recurring reasons: the price, where the promotional rate renews noticeably higher; the account model, which requires an email and ties the subscription to an identity; and the ownership question, since the 2021 acquisition by Kape Technologies made jurisdiction and corporate history a live topic for privacy-minded users.",
  },
  {
    q: "Is ExpressVPN still trustworthy?",
    a: "It runs audited RAM-only infrastructure and has a long operating record, and in 2017 Turkish authorities seized a server and recovered no usable data — a real-world test most providers have never faced. Whether the corporate ownership changes your assessment is a judgement call, not a technical fact.",
  },
  {
    q: "What is the closest alternative for streaming?",
    a: "The mainstream field is genuinely competitive here: NordVPN, Surfshark and ProtonVPN all invest in unblocking. Privacy-first providers explicitly do not, so if streaming is the main use case, stay in the mainstream and choose on price.",
  },
  {
    q: "What is the best alternative for privacy?",
    a: "Providers that collect little or no identity: Mullvad's account numbers, IVPN's signup with no email, or Kovra's Telegram signup with crypto invoices (Kovra publishes this guide). All three ask for less than an email-based account.",
  },
  {
    q: "Which alternative works on censored networks?",
    a: "One that uses a camouflaged protocol rather than a standard one. VLESS with Reality is designed to look like ordinary HTTPS, while standard VPN protocols are easier for DPI to classify. No protocol is guaranteed on every network, so test on yours first.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        ExpressVPN is a good product with a specific shape: broad server
        coverage, reliable streaming, polished apps on every platform, and
        promotional prices that renew higher. People search for alternatives when
        one of those attributes stops matching what they need. The useful
        approach is to identify which one, because the right replacement is
        completely different in each case.
      </p>

      <h2>What you are actually paying for</h2>
      <p>
        The subscription buys server footprint across a large number of
        countries, an in-house protocol (Lightway) that connects quickly,
        consistent unblocking of major streaming platforms, apps and router
        firmware for practically every platform, and 24/7 support. That
        bundle is worth its price to a particular user — someone who travels,
        streams, and wants zero configuration.
      </p>
      <p>
        It also comes with two things a privacy-focused user may not want:
        an account tied to an email address, and a corporate structure that
        became a topic of discussion after the 2021 Kape acquisition. Neither
        is evidence of wrongdoing. Both are reasons people go looking.
      </p>

      <h2>Match the gap to the alternative</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Your reason for leaving</th>
              <th>What to look at</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>A price that jumps at renewal</td>
              <td>Mullvad, Kovra (ours)</td>
              <td>A flat monthly price, or one-time payments with no auto-renewal</td>
            </tr>
            <tr>
              <td>Identity at signup</td>
              <td>Mullvad, IVPN, Kovra (ours)</td>
              <td>Account numbers or no-email registration</td>
            </tr>
            <tr>
              <td>Blocked on your network</td>
              <td>VLESS + Reality providers</td>
              <td>TLS camouflage instead of a fingerprintable handshake</td>
            </tr>
            <tr>
              <td>Ownership and jurisdiction</td>
              <td>Mullvad (Sweden), IVPN (Gibraltar)</td>
              <td>Independent, long-published audit history</td>
            </tr>
            <tr>
              <td>Streaming was the point</td>
              <td>NordVPN, Surfshark, ProtonVPN</td>
              <td>Only the mainstream providers maintain unblocking</td>
            </tr>
            <tr>
              <td>Port forwarding for seeding</td>
              <td>AirVPN</td>
              <td>One of the few still offering configurable inbound ports</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>The privacy-first options in detail</h2>
      <h3>Mullvad</h3>
      <p>
        A 16-digit account number instead of an email, a flat €5 per month
        since 2009, cash accepted by post, repeated third-party audits, and
        RAM-only servers. The reference implementation of an anonymous
        account. Limitations: WireGuard is easy for DPI to classify, port
        forwarding was removed in 2023, and streaming is an explicit
        non-goal. More in{" "}
        <Link href="/guides/mullvad-alternatives">
          the Mullvad guide
        </Link>
        .
      </p>
      <h3>IVPN</h3>
      <p>
        Gibraltar-based, no email required, Bitcoin, Lightning and Monero
        accepted, published audits, multi-hop routing, and v2Ray and
        obfsproxy obfuscation on top of WireGuard. Pricier than the others
        in this group.
      </p>
      <h3>Kovra (ours)</h3>
      <p>
        Signup is a Telegram login with no email, or email and a password on
        the website. Payment is a crypto invoice (USDT, USDC, BTC and more)
        or a card, and the transport is VLESS with Reality, which presents
        as ordinary TLS to a real website. That last point is the
        differentiator: it is built for networks where WireGuard-based
        services are dropped, though no protocol gets through every network.
        Honest limitations: a younger service without published audits,
        locations in Europe, the US and Asia rather than a global map,
        BitTorrent blocked, and no streaming-unblock ambitions. Plans start
        at $2.75 per month on the annual term, paid once.
      </p>
      <h3>AirVPN</h3>
      <p>
        Run by privacy activists with unusual transparency about network
        status, wide coin support, and configurable inbound port forwarding
        for seeding and self-hosting. Assumes technical comfort and runs
        classic protocols that DPI can recognise.
      </p>

      <h2>The comparison that decides it</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>ExpressVPN</th>
              <th>Mullvad</th>
              <th>IVPN</th>
              <th>Kovra (ours)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Email at signup</td>
              <td>Yes</td>
              <td>No</td>
              <td>No</td>
              <td>Optional: Telegram signup needs none</td>
            </tr>
            <tr>
              <td>Crypto</td>
              <td>BTC, USDT, USDC and more via BitPay</td>
              <td>BTC, BCH, Monero</td>
              <td>BTC, Lightning, Monero</td>
              <td>USDT, USDC, BTC, ETH and more</td>
            </tr>
            <tr>
              <td>Main protocol</td>
              <td>Lightway (its own)</td>
              <td>WireGuard</td>
              <td>WireGuard, with obfuscation options</td>
              <td>VLESS + Reality</td>
            </tr>
            <tr>
              <td>Price</td>
              <td>$2.99–$7.49/mo for the first 28 months, then $99.95–$199.95/year</td>
              <td>€5/mo, flat</td>
              <td>From $6/mo or $60/year</td>
              <td>From $2.75/mo, paid once, no auto-renewal</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="gd-source">
        Sources, checked 2 October 2026: ExpressVPN&apos;s order page and
        its &quot;buy a VPN with Bitcoin&quot; page, Mullvad&apos;s and
        IVPN&apos;s pricing pages, Kovra&apos;s price list.
      </p>

      <h2>Switching without losing anything</h2>
      <ol>
        <li>
          <strong>Write down what you actually used.</strong> Which countries,
          which devices, which services. Most people need far less than the
          plan they are leaving.
        </li>
        <li>
          <strong>Buy one month of the candidate</strong> and run both in
          parallel. Test the networks that matter: home, office, phone,
          travel.
        </li>
        <li>
          <strong>Run a leak test on the new one</strong> before cancelling
          the old — the checks are in the{" "}
          <Link href="/guides/vpn-leak-test">leak test guide</Link>.
        </li>
        <li>
          <strong>Cancel before the renewal date</strong>, not after. Annual
          renewals are the single largest source of &quot;I meant to
          switch&quot; regret.
        </li>
      </ol>

      <h2>The honest conclusion</h2>
      <p>
        If ExpressVPN&apos;s bundle matches your use — streaming, travel,
        zero configuration — there is no technical reason to move. If you are
        paying premium prices for a server map you do not use while handing
        over an email you did not want to give, the alternatives cost less
        and ask for less. Start from{" "}
        <Link href="/guides/truly-anonymous-vpn">
          what anonymity actually requires
        </Link>{" "}
        and{" "}
        <Link href="/guides/best-crypto-vpn-2026">
          the crypto VPN comparison
        </Link>
        , then pick on the one attribute you are actually missing.
      </p>
    </GuideArticle>
  );
}

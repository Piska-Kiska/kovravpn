// src/app/guides/cheapest-private-vpn/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "cheapest-private-vpn";
const OG = ogImageUrl("Cheapest Private VPN", "What $3 a month really buys");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "What is the cheapest VPN that is actually private?",
    a: "Realistically $2.50 to $5 per month on a longer term. Below that, providers are either running a two-year prepay promotion that renews far higher, or earning money from something other than your subscription. Compare renewal prices, not headline prices.",
  },
  {
    q: "Why are two-year VPN deals so cheap?",
    a: "Because they are customer acquisition, funded by the renewal. A plan advertised at $1.99 per month often renews at $80 to $130 per year. The honest way to compare is total cost over three years, including the first renewal.",
  },
  {
    q: "Is a cheap VPN worse than an expensive one?",
    a: "Price correlates with marketing spend more than with quality. The expensive mainstream brands buy server footprint, streaming support and advertising; the cheaper privacy-focused providers spend on infrastructure and audits. What you should not buy is a service with no visible revenue model at all.",
  },
  {
    q: "Can I pay monthly without losing the discount?",
    a: "Rarely — the discount is the whole reason long terms exist. If you want to avoid prepaying a year to a provider you have not tested, start with one month at the full price, verify it works on your networks, then commit.",
  },
  {
    q: "Does paying in crypto make it cheaper?",
    a: "Sometimes marginally, because card processing fees and chargeback risk disappear; some providers pass that back as a discount. The real reason to pay in crypto is that it does not attach a billing identity to the account.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        VPN pricing is designed to be hard to compare. Headline numbers
        assume a two-year prepayment, renewal prices sit in the footnotes,
        and &quot;83% off&quot; has been running continuously for four years.
        Underneath all of it is a real cost floor, and knowing where it sits
        makes the whole category legible.
      </p>

      <h2>What a VPN costs to run</h2>
      <p>
        The dominant expense is bandwidth, not servers. A single active user
        with normal habits moves somewhere between 50 GB and several hundred
        gigabytes a month; a heavy user moves much more. Providers buy
        transit and server capacity in bulk, and reasonable public estimates
        put the delivered cost per active user somewhere in the region of one
        to two dollars a month. Add support staff, payment processing,
        client development for four platforms, audits, and the constant work
        of replacing blocklisted addresses.
      </p>
      <p>
        That is why the sustainable floor for a service with no secondary
        revenue lands around <strong>$2.50 to $5 per month</strong>. Below
        it, one of three things is true: you are inside a promotional window,
        you are subsidised by users on worse terms, or the traffic is the
        product — see{" "}
        <Link href="/guides/are-free-vpns-safe">are free VPNs safe</Link>.
      </p>

      <h2>The renewal trap, with numbers</h2>
      <p>
        Compare on three-year total cost, which captures one renewal.
      </p>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Pricing shape</th>
              <th>Advertised</th>
              <th>Renews at</th>
              <th>3-year total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Aggressive 2-year promo</td>
              <td>$1.99/mo</td>
              <td>~$110/yr</td>
              <td>~$158</td>
            </tr>
            <tr>
              <td>Mainstream premium</td>
              <td>$6.67/mo</td>
              <td>~$100/yr</td>
              <td>~$260</td>
            </tr>
            <tr>
              <td>Flat-price privacy provider</td>
              <td>€5/mo</td>
              <td>€5/mo</td>
              <td>~€180</td>
            </tr>
            <tr>
              <td>Annual term, honest renewal</td>
              <td>$2.75/mo</td>
              <td>Same</td>
              <td>~$99</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The pattern: the cheapest headline is rarely the cheapest outcome,
        and a flat price that never changes beats a discount that expires.
        Figures above are illustrative of the shapes on the market, not a
        quote for any specific provider — check the current renewal price
        before buying, because that is the number you will actually pay
        twice.
      </p>

      <h2>What you should refuse to trade away for price</h2>
      <ul>
        <li>
          <strong>A verifiable no-logs posture.</strong> The checks that do
          not require trusting marketing are in{" "}
          <Link href="/guides/how-to-verify-no-logs-vpn">
            the verification guide
          </Link>
          .
        </li>
        <li>
          <strong>A working kill switch.</strong> Non-negotiable, and testable
          in a minute with the{" "}
          <Link href="/guides/vpn-leak-test">leak test</Link>.
        </li>
        <li>
          <strong>DNS resolved inside the tunnel.</strong> Otherwise you paid
          for encryption and gave away the destination list anyway.
        </li>
        <li>
          <strong>A protocol that works on your networks.</strong> A cheap
          plan that will not connect at your office or abroad has an
          effective price of infinity — see{" "}
          <Link href="/guides/wireguard-vs-openvpn-vs-vless">
            the protocol comparison
          </Link>
          .
        </li>
      </ul>

      <h2>What you can trade away, cheerfully</h2>
      <ul>
        <li>
          <strong>Ninety countries.</strong> Most people use two or three
          regions. A large map is a marketing asset, and many entries are
          virtual locations anyway.
        </li>
        <li>
          <strong>Streaming unblocking.</strong> Expensive to maintain
          because it is an arms race. If you do not need it, do not pay for
          it.
        </li>
        <li>
          <strong>Bundled password managers and antivirus.</strong> Bundles
          inflate the perceived value and the price.
        </li>
        <li>
          <strong>Ten simultaneous devices</strong>, if you have three.
        </li>
      </ul>

      <h2>Paying less without paying with data</h2>
      <ol>
        <li>
          <strong>Commit only after testing.</strong> Buy one month at full
          price, run it on every network you care about, then take the annual
          discount.
        </li>
        <li>
          <strong>Check the renewal price before the first payment.</strong>{" "}
          It is the only number that describes the long run.
        </li>
        <li>
          <strong>Prefer flat pricing</strong> where it exists. Providers that
          have not raised prices in a decade are telling you something about
          how they run the business.
        </li>
        <li>
          <strong>Pay in stablecoins if the provider invoices them
          natively.</strong> No card fees, no billing address, no
          subscription that renews itself silently — see{" "}
          <Link href="/guides/vpn-that-accepts-usdt">
            the USDT walkthrough
          </Link>{" "}
          and{" "}
          <Link href="/guides/pay-for-vpn-with-crypto">
            the general crypto guide
          </Link>
          .
        </li>
        <li>
          <strong>Buy fewer devices if the plan is tiered by them.</strong>{" "}
          A single-device plan at a lower tier is often half the price of the
          family tier nobody in the household uses.
        </li>
      </ol>

      <h2>Where the cheap end genuinely sits</h2>
      <p>
        Privacy-focused providers cluster between roughly $2.75 and $5 a
        month on annual terms — Kovra&apos;s single-device annual plan at
        $2.75, Mullvad&apos;s unchanging €5, IVPN&apos;s tiers, AirVPN&apos;s
        long-term rates. That band is the honest floor, and the differences
        inside it are about protocol, jurisdiction and payment model rather
        than price. Which one fits which situation is laid out in{" "}
        <Link href="/guides/best-crypto-vpn-2026">
          the 2026 comparison
        </Link>
        , and the brand-by-brand view in{" "}
        <Link href="/guides/expressvpn-alternative">
          ExpressVPN alternatives
        </Link>{" "}
        and{" "}
        <Link href="/guides/nordvpn-alternative-crypto">
          NordVPN alternatives
        </Link>
        .
      </p>

      <h2>The rule of thumb</h2>
      <p>
        Under $2 a month, ask what else is being sold. Over $8, ask what you
        are getting that the $3 providers do not offer — and if the answer is
        a server map and a streaming promise you will not use, you have found
        your saving.
      </p>
    </GuideArticle>
  );
}

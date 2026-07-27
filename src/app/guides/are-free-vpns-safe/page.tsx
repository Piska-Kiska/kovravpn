// src/app/guides/are-free-vpns-safe/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "are-free-vpns-safe";
const OG = ogImageUrl("Are Free VPNs Safe?", "Follow the money");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Are free VPNs safe to use?",
    a: "Most are not, and the reason is structural rather than malicious intent: bandwidth, servers and support cost money, so a service with no subscription revenue monetizes the traffic. Documented models include selling browsing data, injecting advertising, and reselling users' connections as residential proxy exits.",
  },
  {
    q: "Do free VPNs sell your data?",
    a: "Several have been caught doing exactly that, and others disclose it in the privacy policy in terms most users never read. The tell is a policy that reserves the right to share 'aggregated' or 'anonymized' usage data with partners, which in practice can mean browsing history.",
  },
  {
    q: "Is the free tier of a paid VPN safe?",
    a: "Usually yes. A limited free tier from a provider whose revenue comes from subscriptions is a marketing cost, not a business model, so the incentive to monetize your traffic is absent. Expect real limits on data, speed or server choice.",
  },
  {
    q: "What about a VPN built into my browser?",
    a: "Browser-based proxies from major vendors are funded by the vendor's core business and are generally honest about what they do. They also only cover browser traffic and usually only some of it, so treat them as an IP-masking convenience rather than a VPN.",
  },
  {
    q: "How much does a trustworthy VPN actually cost?",
    a: "Roughly $2.50 to $5 per month on a longer term. That is the level where subscription revenue covers bandwidth and servers without needing a second income stream from your data.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        The question is usually framed as a matter of trust, which makes it
        unanswerable from the outside. Reframe it as arithmetic and it
        becomes tractable: a VPN with a million users moves petabytes of
        traffic per month, and someone pays for that. If it is not the user,
        the money comes from somewhere else, and there are only a few
        possible somewheres.
      </p>

      <h2>The four ways a free VPN pays its bills</h2>
      <h3>1. Selling usage data</h3>
      <p>
        The most direct. Connection logs, visited domains and app usage are
        valuable to analytics and advertising brokers. Privacy policies
        describe it as sharing &quot;aggregated&quot; or
        &quot;de-identified&quot; data with partners — language that has been
        used to cover the sale of browsing histories, and which is difficult
        to distinguish from the real thing without an audit.
      </p>
      <h3>2. Advertising and injection</h3>
      <p>
        Ads inside the app are the honest version. The dishonest version is
        modifying traffic in transit: injecting scripts into pages, or
        rewriting affiliate links so the operator earns the commission on
        purchases you make. HTTPS blocks most of this, which is why apps
        doing it have historically pushed users toward permissions that
        weaken that protection.
      </p>
      <h3>3. Reselling your bandwidth</h3>
      <p>
        The model people find most surprising: the app enrolls your device as
        an exit node in a commercial proxy network, and someone else&apos;s
        traffic leaves the internet through your home connection. It is
        disclosed in the terms of service of several free apps. It also means
        activity you know nothing about is attributed to your IP address.
      </p>
      <h3>4. Free tier as a funnel</h3>
      <p>
        The legitimate model. A paid provider offers a limited free tier to
        demonstrate the product. Revenue comes from subscriptions, so there
        is no incentive to monetize traffic, and the limits are the point:
        modest data cap, fewer locations, lower priority.
      </p>

      <h2>How to tell which one you are looking at</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Signal</th>
              <th>Reassuring</th>
              <th>Warning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Business model</td>
              <td>Paid plans exist and are prominent</td>
              <td>Free with no paid tier at all</td>
            </tr>
            <tr>
              <td>Company identity</td>
              <td>Named entity, jurisdiction, address</td>
              <td>Anonymous developer, no legal entity</td>
            </tr>
            <tr>
              <td>Privacy policy</td>
              <td>Specific about what is not collected</td>
              <td>Reserves rights to share with &quot;partners&quot;</td>
            </tr>
            <tr>
              <td>Permissions requested</td>
              <td>VPN configuration only</td>
              <td>Contacts, storage, accessibility services</td>
            </tr>
            <tr>
              <td>Audit</td>
              <td>Published report with readable scope</td>
              <td>&quot;Independently verified&quot; with no document</td>
            </tr>
            <tr>
              <td>Data limits</td>
              <td>Explicit and modest</td>
              <td>Unlimited everything, free, forever</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The last row is the most reliable single heuristic. Unlimited free
        bandwidth is the one promise that cannot be kept without a second
        revenue stream. The full verification method — audits, jurisdiction,
        court records — is in{" "}
        <Link href="/guides/how-to-verify-no-logs-vpn">
          how to verify no-logs claims
        </Link>
        .
      </p>

      <h2>The threat model actually matters</h2>
      <p>
        A free VPN is not uniformly wrong. Watching a geo-restricted video on
        a device with nothing sensitive on it is a different situation from
        routing your logged-in life through an unknown operator. Sort by
        stakes:
      </p>
      <ul>
        <li>
          <strong>Acceptable:</strong> one-off geo checks, casual browsing on
          a spare device, testing whether a site is region-locked.
        </li>
        <li>
          <strong>Not acceptable:</strong> banking, work email, messengers,
          anything on{" "}
          <Link href="/guides/vpn-for-public-wifi">public Wi-Fi</Link>,
          anything on a censored network where being flagged has
          consequences, and{" "}
          <Link href="/guides/no-logs-vpn-for-torrenting">
            peer-to-peer traffic
          </Link>{" "}
          where a wrong attribution is a legal letter.
        </li>
      </ul>

      <h2>Free VPNs on censored networks</h2>
      <p>
        Beyond the privacy question, they usually do not work. Free apps run
        the most heavily fingerprinted protocols on the best-known address
        ranges, so they are blocked first. If the network is doing protocol
        inspection, the choice is not free versus paid but recognizable
        versus camouflaged — see{" "}
        <Link href="/guides/vpn-that-works-in-china">
          what works in China
        </Link>{" "}
        and{" "}
        <Link href="/guides/shadowsocks-vs-vless-reality">
          Shadowsocks versus VLESS Reality
        </Link>
        .
      </p>

      <h2>What paying actually removes</h2>
      <p>
        A subscription does not automatically buy honesty; it removes the
        structural need for dishonesty. Combine that with signup that
        collects nothing and payment that carries no identity, and the
        provider ends up holding very little about you even if it wanted to
        sell something. The practical routes are{" "}
        <Link href="/guides/vpn-without-email">
          signing up without an email
        </Link>{" "}
        and{" "}
        <Link href="/guides/pay-for-vpn-with-crypto">paying in crypto</Link>.
        On what it should cost, see{" "}
        <Link href="/guides/cheapest-private-vpn">
          the cheapest private VPN in 2026
        </Link>
        .
      </p>

      <h2>The one-line test</h2>
      <p>
        Ask who pays for the bandwidth. If the honest answer is not
        &quot;the users, through subscriptions&quot;, the second answer is
        always your traffic — and a VPN is precisely the piece of software
        with the most complete view of it.
      </p>
    </GuideArticle>
  );
}

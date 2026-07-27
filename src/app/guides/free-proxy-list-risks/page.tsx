// src/app/guides/free-proxy-list-risks/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "free-proxy-list-risks";
const OG = ogImageUrl("Free Proxy Lists", "Who pays for the bandwidth");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Are free proxies safe?",
    a: "As a category, no. Bandwidth and servers cost money, so an operator giving them away is recovering the cost some other way: injecting ads, harvesting sessions, logging traffic for resale, or using the proxy as a laundering hop. You cannot tell which from the outside.",
  },
  {
    q: "Can a free proxy steal my passwords?",
    a: "Not directly from an HTTPS session, because the encryption is end-to-end between your browser and the site. The realistic attacks are downgrade attempts, fake certificate warnings you are nudged to accept, and harvesting anything sent over plain HTTP. Session cookies on non-HTTPS pages are the classic loss.",
  },
  {
    q: "Why do free proxy lists exist at all?",
    a: "Three sources: misconfigured servers exposed by accident and scanned into lists, deliberately operated honeypots, and compromised machines forming a botnet. All three are found on the same lists, and none of them come with an accountable operator.",
  },
  {
    q: "Is a free VPN better than a free proxy?",
    a: "Slightly, because at least the tunnel is encrypted, but the business model problem is identical. Free VPN apps have been documented selling browsing data and reselling users' bandwidth as residential exit nodes. See the free VPN guide for what to check.",
  },
  {
    q: "What should I use instead of a free proxy?",
    a: "For occasional geo-checks, a browser's own private relay or a reputable paid proxy with an accountable operator. For privacy, a paid VPN: the entry price for a private, no-logs service is a few dollars a month, which is well below the value of a compromised session.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        Search &quot;free proxy list&quot; and you get thousands of IP and
        port pairs, updated hourly, sorted by country and uptime. The
        infrastructure behind those tables is real: someone is paying for
        bandwidth, someone is scanning the internet to find them, someone is
        keeping the list fresh. The useful question is not whether free
        proxies work. It is who benefits when you use one.
      </p>

      <h2>Where the entries on those lists come from</h2>
      <h3>1. Misconfigured servers</h3>
      <p>
        Open proxies exposed by accident — a default Squid install, a
        forgotten test container, a router with UPnP doing something
        unintended. They appear in lists within hours of being scanned, work
        erratically, and vanish when someone notices the bandwidth bill.
        Using them is unauthorized use of someone else&apos;s machine.
      </p>
      <h3>2. Deliberate collection points</h3>
      <p>
        Proxies run specifically to see what passes through. This is cheap:
        a small VPS costs a few dollars a month and can sit on dozens of
        lists. The operator gets a stream of requests to inspect, replay or
        modify.
      </p>
      <h3>3. Compromised machines</h3>
      <p>
        Residential devices infected with malware and rented out as exit
        nodes. Your traffic goes out through a stranger&apos;s home
        connection — which is also why some &quot;free residential
        proxies&quot; look impressively legitimate to websites.
      </p>

      <h2>What the operator can actually do</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Attack</th>
              <th>Possible?</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Log every domain you visit</td>
              <td>Always</td>
              <td>Connection metadata is unavoidable — that is the job</td>
            </tr>
            <tr>
              <td>Read plain HTTP content</td>
              <td>Always</td>
              <td>Forms, cookies, tokens on non-HTTPS pages</td>
            </tr>
            <tr>
              <td>Inject ads or scripts</td>
              <td>On HTTP pages</td>
              <td>Documented in the wild for years</td>
            </tr>
            <tr>
              <td>Read HTTPS content</td>
              <td>No, not silently</td>
              <td>Requires you to accept a bad certificate</td>
            </tr>
            <tr>
              <td>Trigger downgrade to HTTP</td>
              <td>Sometimes</td>
              <td>Blocked by HSTS on well-configured sites</td>
            </tr>
            <tr>
              <td>Attribute your traffic to you</td>
              <td>Always</td>
              <td>Your real IP is the connecting address</td>
            </tr>
            <tr>
              <td>Get you blocked</td>
              <td>Frequently</td>
              <td>Shared IPs are already on abuse blocklists</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Note the asymmetry in that last row: you are anonymous to the
        website, and completely identified to the proxy. That trade is only
        sensible when you trust the operator more than the destination —
        precisely the opposite of the situation with an anonymous list entry.
      </p>

      <h2>The practical problems, before the security ones</h2>
      <ul>
        <li>
          <strong>They are already blocklisted.</strong> Public proxy IPs are
          on every commercial abuse feed, so Cloudflare challenges, login
          blocks and CAPTCHA walls follow you around.
        </li>
        <li>
          <strong>Uptime is fiction.</strong> The &quot;98%&quot; in the list
          was measured against the list&apos;s own checker, not against real
          sites.
        </li>
        <li>
          <strong>Bandwidth is shared with whoever else found it.</strong>
        </li>
        <li>
          <strong>No encryption</strong> means your network operator sees the
          same hostnames it always did — the proxy hides you from the site,
          not from the network. That distinction is the whole of the{" "}
          <Link href="/guides/vpn-vs-proxy">VPN versus proxy question</Link>.
        </li>
      </ul>

      <h2>If you must use one</h2>
      <ol>
        <li>Only for content that is already public and not sensitive.</li>
        <li>
          Never while logged into anything. One session cookie is worth more
          than a year of any subscription.
        </li>
        <li>
          Use a separate browser profile so cookies and history stay isolated.
        </li>
        <li>
          Never accept a certificate warning. That prompt is the attack.
        </li>
        <li>
          Verify afterwards that DNS did not leak around it — the checks are
          in the{" "}
          <Link href="/guides/vpn-leak-test">leak test guide</Link>.
        </li>
      </ol>

      <h2>The alternatives, by budget</h2>
      <p>
        <strong>Free but accountable:</strong> Tor for anonymity where speed
        does not matter, or a browser&apos;s built-in private relay for
        casual IP masking. Both have named operators and published designs.
      </p>
      <p>
        <strong>Paid proxy:</strong> if you genuinely need rotating exits for
        automation, a commercial provider with a contract and an abuse desk.
        The technical trade-offs are in{" "}
        <Link href="/guides/socks5-proxy-vs-vpn">
          SOCKS5 versus VPN
        </Link>
        .
      </p>
      <p>
        <strong>Paid VPN:</strong> for privacy rather than IP rotation, this
        is the category that fits. A private no-logs service starts around
        three dollars a month — see{" "}
        <Link href="/guides/cheapest-private-vpn">
          what that money actually buys
        </Link>{" "}
        — and can be paid in{" "}
        <Link href="/guides/pay-for-vpn-with-crypto">crypto</Link> with{" "}
        <Link href="/guides/vpn-without-email">no email at signup</Link>, so
        &quot;paid&quot; does not have to mean &quot;identified&quot;.
      </p>

      <h2>The rule</h2>
      <p>
        A proxy sees everything you route through it. Choosing a free one
        from a public list means picking an anonymous stranger to see it —
        selected, in effect, at random. The reason paid services can be held
        to a no-logs standard is that there is someone to hold; the method
        for checking is in{" "}
        <Link href="/guides/how-to-verify-no-logs-vpn">
          how to verify no-logs claims
        </Link>
        .
      </p>
    </GuideArticle>
  );
}

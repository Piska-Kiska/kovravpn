// src/app/guides/socks5-proxy-vs-vpn/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "socks5-proxy-vs-vpn";
const OG = ogImageUrl("SOCKS5 vs VPN", "Speed, encryption, and the leak");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Does SOCKS5 encrypt my traffic?",
    a: "No. SOCKS5 is a relay protocol: it forwards TCP and UDP without adding any encryption layer. Anything already encrypted, such as HTTPS, stays encrypted end-to-end, but the proxy adds nothing and everyone on the path still sees which hosts you connect to.",
  },
  {
    q: "Is SOCKS5 faster than a VPN?",
    a: "Slightly, because there is no encryption or virtual interface overhead. On modern CPUs with AES acceleration the gap is a few percent, far smaller than the effect of server distance. A close VPN server will outperform a distant SOCKS5 proxy.",
  },
  {
    q: "Is SOCKS5 safe for torrenting?",
    a: "It is commonly used and it does hide your IP from the swarm while it works, but it fails silently. If the proxy drops, most clients fall back to the direct connection and expose your real address without warning. A VPN with a kill switch fails closed instead.",
  },
  {
    q: "What is the difference between SOCKS5 and an HTTP proxy?",
    a: "An HTTP proxy understands web requests and only handles them; a SOCKS5 proxy is protocol-agnostic and relays any TCP stream plus UDP, so it works for torrents, games and mail clients. SOCKS5 also supports username and password authentication.",
  },
  {
    q: "Can I use SOCKS5 and a VPN together?",
    a: "Yes, and it is the one configuration where a proxy adds value for privacy: the VPN encrypts everything device-wide while the proxy gives one application a different exit IP. The proxy connection travels inside the tunnel, so its lack of encryption stops mattering to the local network.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        SOCKS5 is the proxy people actually use. It is protocol-agnostic,
        supports UDP, handles authentication, and appears as a paid add-on in
        several mainstream VPN subscriptions. It is also routinely described
        as a lightweight VPN, which it is not: it lacks the one property that
        defines a VPN. Here is the accurate version.
      </p>

      <h2>What SOCKS5 does</h2>
      <p>
        SOCKS operates at the session layer. Your application says &quot;open
        a connection to this host and port&quot;, and the proxy opens it and
        shuttles bytes in both directions. Version 5 added three things that
        made it the default: UDP support (so it works for BitTorrent
        peer traffic, DNS, games and voice), authentication, and IPv6 support.
      </p>
      <p>
        What it never added is encryption. There is no cipher negotiation in
        the protocol at all. When people call SOCKS5 &quot;secure&quot;, they
        usually mean the site they visited was HTTPS — which would have been
        true without the proxy.
      </p>

      <h2>The comparison that matters</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>SOCKS5 proxy</th>
              <th>VPN</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Encryption</td>
              <td>None</td>
              <td>Full tunnel</td>
            </tr>
            <tr>
              <td>Coverage</td>
              <td>Per application, manually configured</td>
              <td>Whole device via routing table</td>
            </tr>
            <tr>
              <td>UDP</td>
              <td>Yes</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>DNS</td>
              <td>Depends on the client; often leaks locally</td>
              <td>Resolved inside the tunnel</td>
            </tr>
            <tr>
              <td>Failure behaviour</td>
              <td>Falls back to direct connection silently</td>
              <td>Kill switch blocks traffic</td>
            </tr>
            <tr>
              <td>Overhead</td>
              <td>Near zero</td>
              <td>Low single-digit percent</td>
            </tr>
            <tr>
              <td>Blocked by DPI</td>
              <td>Easily, by port and handshake</td>
              <td>Depends on protocol; camouflaged ones survive</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>The leak that catches most users</h2>
      <p>
        Two failure modes account for nearly every &quot;my SOCKS5 proxy
        exposed me&quot; story.
      </p>
      <p>
        <strong>Silent fallback.</strong> When a proxy becomes unreachable,
        many clients simply retry directly. There is no alarm, no
        disconnection, no visible change — the transfer keeps going from your
        real address. Torrent clients are the classic case: the proxy setting
        lives in the network preferences and nothing enforces it. A VPN kill
        switch is the opposite design: no tunnel, no packets.
      </p>
      <p>
        <strong>DNS resolution outside the proxy.</strong> Unless the
        application explicitly sends hostname lookups through the proxy
        (SOCKS5 supports it; not every client uses it), your system resolver
        does the lookup. Your provider then holds a list of every domain you
        visited, in order, with timestamps — the exact metadata people use a
        proxy to avoid. Run the checks in the{" "}
        <Link href="/guides/vpn-leak-test">leak test guide</Link> before
        trusting any per-app configuration.
      </p>

      <h2>When SOCKS5 is the better choice</h2>
      <ul>
        <li>
          <strong>One app needs a different exit IP</strong> while everything
          else stays local — testing, region checks, account separation.
        </li>
        <li>
          <strong>Latency is the entire point</strong> and the traffic is not
          sensitive.
        </li>
        <li>
          <strong>Inside a VPN tunnel</strong>, to add a second exit hop
          without a second full tunnel.
        </li>
        <li>
          <strong>On a network you already trust</strong>, where hiding
          hostnames from the operator is not a goal.
        </li>
      </ul>

      <h2>When it is the wrong tool</h2>
      <ul>
        <li>
          <strong>Public Wi-Fi.</strong> The threat is the local network, and
          SOCKS5 does not protect against it. See{" "}
          <Link href="/guides/vpn-for-public-wifi">
            public Wi-Fi security
          </Link>
          .
        </li>
        <li>
          <strong>Censored networks.</strong> A SOCKS5 handshake on a
          non-standard port is trivially fingerprinted and dropped. What
          survives is covered in{" "}
          <Link href="/guides/shadowsocks-vs-vless-reality">
            Shadowsocks versus VLESS Reality
          </Link>
          .
        </li>
        <li>
          <strong>Anything where a silent failure is unacceptable</strong> —
          which includes{" "}
          <Link href="/guides/no-logs-vpn-for-torrenting">
            torrenting
          </Link>
          , despite SOCKS5 being popular there.
        </li>
        <li>
          <strong>Free proxies from public lists.</strong> Unencrypted plus
          unaccountable is the worst combination available; the details are
          in{" "}
          <Link href="/guides/free-proxy-list-risks">
            free proxy lists
          </Link>
          .
        </li>
      </ul>

      <h2>The honest summary</h2>
      <p>
        SOCKS5 is a good router and a bad bodyguard. It changes where your
        traffic appears to come from, quickly and cheaply, for one program at
        a time. It does not hide what you are doing from anyone between you
        and the proxy, and it does not fail safely. Use it for what it is,
        and use a{" "}
        <Link href="/guides/vpn-vs-proxy">VPN for the rest</Link>.
      </p>
    </GuideArticle>
  );
}

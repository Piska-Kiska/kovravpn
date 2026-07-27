// src/app/guides/vpn-vs-proxy/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "vpn-vs-proxy";
const OG = ogImageUrl("VPN vs Proxy", "What actually hides your traffic");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Is a proxy the same as a VPN?",
    a: "No. Both replace the IP address a website sees, but a proxy usually handles one application and adds no encryption, while a VPN encrypts everything leaving the device and routes it through a single tunnel. The visible result looks similar; what your network operator can read is completely different.",
  },
  {
    q: "Is a proxy faster than a VPN?",
    a: "Often marginally, because there is no encryption overhead and no virtual network interface. In practice the difference is a few percent on modern hardware, and it is dwarfed by the distance to the server. A nearby VPN endpoint beats a distant proxy almost every time.",
  },
  {
    q: "Can my internet provider see what I do through a proxy?",
    a: "Yes, in most cases. With an HTTP or SOCKS proxy the connection between you and the proxy is not encrypted by the proxy itself, so your provider still sees the destination hostname through TLS SNI and DNS. A VPN hides both because the entire session is inside an encrypted tunnel.",
  },
  {
    q: "Do I need both a VPN and a proxy?",
    a: "Rarely. Chaining a proxy inside a VPN tunnel is useful when you need a specific exit IP for one application while keeping the rest of the device on the VPN. For everyday privacy it adds latency and failure modes without adding protection.",
  },
  {
    q: "Are free proxies safe to use?",
    a: "Treat them as hostile. Running a public proxy costs money, so the operator monetizes the traffic: ad injection, session harvesting, or reselling the exit as a residential IP. If a service is free and unaccountable, your traffic is the payment.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        &quot;VPN or proxy&quot; sounds like a question about two competing
        products. It is really a question about scope. A proxy changes the
        address one program presents to the internet. A VPN changes what the
        network underneath your device is allowed to know. Everything else
        that matters follows from that one difference.
      </p>

      <h2>What each one actually does to a packet</h2>
      <p>
        When your browser opens a site through a <strong>proxy</strong>, it
        asks the proxy to fetch the page on its behalf. The proxy makes the
        outbound connection, so the site logs the proxy&apos;s IP. Your
        packets still travel from your device to the proxy as ordinary
        traffic on the local network: the operator of that network sees a
        connection to the proxy, and with a plain HTTP proxy sees the
        destination hostname in clear text. Even with HTTPS, the TLS
        handshake and DNS lookups reveal which domains you are reaching.
      </p>
      <p>
        With a <strong>VPN</strong>, the operating system creates a virtual
        interface and every packet from every application is encrypted and
        wrapped before it leaves. The local network sees one continuous
        encrypted stream to one address, with no hostnames, no DNS queries
        and no way to tell a video call from a download. Decryption happens
        at the VPN server, which then makes the request on your behalf.
      </p>

      <h2>Side by side</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Proxy</th>
              <th>VPN</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Scope</td>
              <td>Per application, usually the browser</td>
              <td>Entire device, all apps</td>
            </tr>
            <tr>
              <td>Encryption</td>
              <td>None of its own (HTTPS still applies end-to-end)</td>
              <td>Full tunnel encryption</td>
            </tr>
            <tr>
              <td>What your ISP sees</td>
              <td>Destination domains via DNS and TLS SNI</td>
              <td>One encrypted connection, nothing else</td>
            </tr>
            <tr>
              <td>DNS handling</td>
              <td>Usually still your ISP&apos;s resolver</td>
              <td>Resolved inside the tunnel</td>
            </tr>
            <tr>
              <td>Leak surface</td>
              <td>High: any app not configured bypasses it</td>
              <td>Low, with kill switch and DNS forcing</td>
            </tr>
            <tr>
              <td>Speed cost</td>
              <td>Minimal</td>
              <td>A few percent on modern devices</td>
            </tr>
            <tr>
              <td>Typical use</td>
              <td>IP rotation, scraping, geo-checks, one-off unblocks</td>
              <td>Privacy, untrusted networks, censorship, torrenting</td>
            </tr>
            <tr>
              <td>Setup</td>
              <td>Per app, manual, easy to get wrong</td>
              <td>Once per device</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>The failure mode nobody mentions: partial coverage</h2>
      <p>
        A proxy configured in your browser does nothing for the updater
        running in the background, the messenger in your tray, the mail
        client, or the operating system&apos;s telemetry. This is not a
        theoretical gap. The most common way people are deanonymized while
        &quot;using a proxy&quot; is that a second application on the same
        machine reached the same service directly, from the real IP, at the
        same time. A VPN has no such split because the routing table sends
        everything through one interface.
      </p>
      <p>
        The related trap is DNS. If your browser proxies traffic but the
        system still resolves names through your provider&apos;s resolver,
        every domain you visit is logged upstream regardless of the proxy.
        Our{" "}
        <Link href="/guides/vpn-leak-test">leak test guide</Link> walks
        through checking this in a couple of minutes.
      </p>

      <h2>Where a proxy is genuinely the right tool</h2>
      <ul>
        <li>
          <strong>Automation and scraping</strong> where you need many
          different exit IPs, and the traffic is not sensitive.
        </li>
        <li>
          <strong>Checking geo-specific content</strong> — how a page renders
          in another country, what price a store shows.
        </li>
        <li>
          <strong>Per-application routing</strong> when the rest of the
          device must keep its normal connection: one game, one client, one
          test.
        </li>
        <li>
          <strong>Inside an existing tunnel</strong>, when a specific service
          needs a specific exit and everything else stays on the VPN.
        </li>
      </ul>
      <p>
        The technical details of the most common variant are covered in the{" "}
        <Link href="/guides/socks5-proxy-vs-vpn">
          SOCKS5 versus VPN guide
        </Link>
        , and the ecosystem of &quot;free&quot; ones in{" "}
        <Link href="/guides/free-proxy-list-risks">
          what really happens on public proxy lists
        </Link>
        .
      </p>

      <h2>Where only a VPN will do</h2>
      <ul>
        <li>
          <strong>Untrusted networks.</strong> Hotel, airport, conference and
          cafe Wi-Fi. See{" "}
          <Link href="/guides/vpn-for-public-wifi">
            what a VPN actually prevents there
          </Link>
          .
        </li>
        <li>
          <strong>Hiding the domain list from your provider or employer.</strong>{" "}
          A proxy leaves that visible; a tunnel does not.
        </li>
        <li>
          <strong>Censored or filtered networks.</strong> Plain proxies are
          trivially blocked by port and IP. Camouflaged tunnels are the whole
          field of{" "}
          <Link href="/guides/vless-reality-protocol">
            VLESS with Reality
          </Link>
          .
        </li>
        <li>
          <strong>Peer-to-peer traffic</strong>, where every peer in the swarm
          sees your address — see the{" "}
          <Link href="/guides/no-logs-vpn-for-torrenting">
            torrenting guide
          </Link>
          .
        </li>
      </ul>

      <h2>What neither of them fixes</h2>
      <p>
        Both change the network path, not your identity. If you log into a
        personal account, the service knows exactly who you are no matter
        which IP the request came from. Browser fingerprinting, cookies and
        logged-in sessions survive every tunnel ever built. A VPN moves the
        trust boundary from your network operator to your VPN provider,
        which is why the provider&apos;s logging posture is the thing to
        verify — the method is in{" "}
        <Link href="/guides/how-to-verify-no-logs-vpn">
          how to actually verify no-logs claims
        </Link>
        , and the payment side in{" "}
        <Link href="/guides/truly-anonymous-vpn">
          the anonymity guide
        </Link>
        .
      </p>

      <h2>Choosing in one line</h2>
      <p>
        If the question is &quot;which IP does this website see&quot;, a
        proxy answers it. If the question is &quot;who can see what I am
        doing&quot;, only a VPN does. Most people asking about proxies are
        actually asking the second question.
      </p>
    </GuideArticle>
  );
}

// src/app/guides/vpn-that-works-in-china/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "vpn-that-works-in-china";
const OG = ogImageUrl("VPN That Works in China", "What still gets through");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Why do most VPNs stop working in China?",
    a: "Because the Great Firewall blocks by protocol fingerprint, not only by IP. WireGuard, OpenVPN and IKEv2 each have a recognizable handshake, so the connection is dropped whatever port it uses. Servers that look suspicious are then actively probed and blocklisted.",
  },
  {
    q: "Is using a VPN illegal in China?",
    a: "Only licensed VPN services are legal for commercial use, and unlicensed providers operate in a grey zone. Enforcement against individual travellers using a VPN for ordinary browsing is rare, but the legal position is genuinely ambiguous, and rules can be applied differently to residents and visitors. Read the current situation before relying on any service.",
  },
  {
    q: "What should I set up before flying to China?",
    a: "Everything. Install the client, load the configuration, test the connection, and save an offline copy of the subscription link plus at least one backup server. Provider websites, app stores and account emails are frequently unreachable once you arrive, which makes recovery hard exactly when you need it.",
  },
  {
    q: "Which protocol works best behind the Great Firewall?",
    a: "Protocols that imitate real HTTPS traffic. VLESS with Reality is the current best answer because it borrows a genuine site's TLS certificate chain and answers active probes with that real site. Shadowsocks with a TLS plugin and various obfuscation wrappers still work in places, less reliably.",
  },
  {
    q: "Does roaming with a foreign SIM bypass the firewall?",
    a: "Often yes, because traffic is routed back to your home carrier's network. It is expensive, throttled, and outside your control, but it is a reasonable emergency fallback for a short trip.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        Most VPN recommendations for China are written by people who have not
        tested one there, and they fail for a single technical reason. The
        Great Firewall does not primarily maintain a list of VPN company IP
        addresses. It looks at how your connection begins and decides whether
        it looks like a VPN. Once you know that, the shortlist of what
        actually works becomes short and obvious.
      </p>

      <h2>Three layers you have to get past</h2>
      <h3>DNS and IP filtering</h3>
      <p>
        The cheap layer: poisoned DNS responses for blocked domains, and
        null-routed addresses. Encrypted DNS handles the first, and a server
        outside the blocklist handles the second. This is the layer every
        &quot;just use a VPN&quot; article assumes is the whole problem.
      </p>
      <h3>Protocol fingerprinting</h3>
      <p>
        The decisive layer. Deep packet inspection reads the first packets of
        every connection and matches them against known protocol shapes.
        WireGuard&apos;s handshake initiation has a fixed message type and
        fixed field offsets. OpenVPN has a documented opcode structure.
        IKEv2/IPsec is unmistakable. All three are dropped on any port —
        moving OpenVPN to 443 does not help, because the inspection is on
        content, not port number. The mechanics are in{" "}
        <Link href="/guides/wireguard-vs-openvpn-vs-vless">
          the protocol comparison
        </Link>
        .
      </p>
      <h3>Active probing</h3>
      <p>
        The layer that kills obfuscation. When a connection looks unusual,
        the firewall&apos;s own infrastructure connects to that server and
        tests how it responds. A server that refuses to answer anything
        without a secret key answers unlike any normal service, which
        confirms the suspicion. This is why plain Shadowsocks — designed to
        look like random noise — has been steadily degraded since around
        2019, as described in{" "}
        <Link href="/guides/shadowsocks-vs-vless-reality">
          Shadowsocks versus VLESS Reality
        </Link>
        .
      </p>

      <h2>What survives, ranked</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Approach</th>
              <th>Status in 2026</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>VLESS + Reality</td>
              <td>Works</td>
              <td>Presents a real site&apos;s TLS chain; probes hit that real site</td>
            </tr>
            <tr>
              <td>VLESS/Trojan over TLS + CDN</td>
              <td>Mostly works</td>
              <td>Hides behind a large CDN&apos;s address space</td>
            </tr>
            <tr>
              <td>Shadowsocks + v2ray-plugin</td>
              <td>Patchy</td>
              <td>TLS wrapper helps; your own domain is still a weak identity</td>
            </tr>
            <tr>
              <td>Plain Shadowsocks</td>
              <td>Unreliable</td>
              <td>Entropy analysis plus active probing</td>
            </tr>
            <tr>
              <td>WireGuard</td>
              <td>Blocked</td>
              <td>Fixed handshake layout, one packet to identify</td>
            </tr>
            <tr>
              <td>OpenVPN, including TCP/443</td>
              <td>Blocked</td>
              <td>Recognizable opcode structure</td>
            </tr>
            <tr>
              <td>IKEv2 / L2TP / PPTP</td>
              <td>Blocked</td>
              <td>Distinctive and long since classified</td>
            </tr>
            <tr>
              <td>International roaming SIM</td>
              <td>Works</td>
              <td>Traffic exits via the home carrier</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>The preparation checklist</h2>
      <ol>
        <li>
          <strong>Install and test before departure.</strong> App stores,
          provider websites and support channels are often unreachable inside
          the country.
        </li>
        <li>
          <strong>Save the subscription link offline</strong> — a note on the
          device, a screenshot, a copy on a second device. If your account
          email is a blocked provider, recovery becomes very hard.
        </li>
        <li>
          <strong>Carry more than one endpoint.</strong> Individual servers
          get blocklisted; a provider offering several regions gives you
          somewhere to fall back to.
        </li>
        <li>
          <strong>Prefer nearby regions</strong> — Japan, Singapore, Hong
          Kong, Korea — for latency, but keep a European or US endpoint as a
          backup, since routing quirks sometimes favour the distant one.
        </li>
        <li>
          <strong>Pay before you go</strong>, and preferably in a way that
          does not depend on a payment page loading later. Crypto
          subscriptions are convenient here for a mundane reason: they
          activate without a card 3-D Secure page that may not load. See{" "}
          <Link href="/guides/pay-for-vpn-with-crypto">
            paying with crypto
          </Link>
          .
        </li>
        <li>
          <strong>Verify there is no leak</strong> once connected, using the{" "}
          <Link href="/guides/vpn-leak-test">leak test guide</Link>.
        </li>
      </ol>

      <h2>Practical behaviour once you are there</h2>
      <ul>
        <li>
          <strong>Expect worse conditions around politically sensitive
          dates.</strong> Filtering visibly tightens around major political
          meetings and anniversaries.
        </li>
        <li>
          <strong>Hotel and airport networks are often the most
          filtered.</strong> Mobile data frequently performs better than
          venue Wi-Fi.
        </li>
        <li>
          <strong>Turn off automatic connection on unknown networks</strong>{" "}
          if you would rather fail closed than hand a captive portal your
          traffic.
        </li>
        <li>
          <strong>Do not rely on free apps.</strong> They are the most
          heavily fingerprinted, the first to be blocked, and the least
          accountable — see{" "}
          <Link href="/guides/are-free-vpns-safe">are free VPNs safe</Link>.
        </li>
      </ul>

      <h2>What this means beyond China</h2>
      <p>
        The same architecture — fingerprinting plus active probing — is now
        deployed in Iran, Russia and Turkmenistan, and increasingly by
        corporate network vendors. A protocol chosen for censorship
        resistance today is also the one that keeps working on a hotel
        network with an aggressive filtering appliance. That is the practical
        argument for{" "}
        <Link href="/guides/vless-reality-protocol">
          camouflaged transports
        </Link>{" "}
        even if you never leave home.
      </p>

      <h2>The short version</h2>
      <p>
        Nothing that announces itself as a VPN connects in China. What
        connects is traffic that is indistinguishable from an ordinary HTTPS
        session to an ordinary website, backed by a provider that maintains
        multiple endpoints and replaces them when they are blocked. Set it up
        before you fly, keep a backup, and test it while you still have an
        unfiltered connection.
      </p>
    </GuideArticle>
  );
}

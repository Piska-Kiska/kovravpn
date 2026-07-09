// src/app/guides/vless-reality-protocol/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "vless-reality-protocol";
const OG = ogImageUrl(
  "VLESS + Reality Explained",
  "Why it beats OpenVPN and WireGuard",
);

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Is VLESS + Reality faster than WireGuard?",
    a: "On an uncensored network WireGuard is usually a touch faster because it lives in the kernel. On networks with DPI the comparison flips: WireGuard gets throttled or blocked outright, while Reality keeps running at full speed because it is indistinguishable from regular TLS traffic.",
  },
  {
    q: "Does Reality require buying a domain and TLS certificate?",
    a: "No, and that is its core trick. The server borrows the TLS identity of a real, reputable website during the handshake, so there is no self-owned domain to blacklist and no certificate to purchase or renew.",
  },
  {
    q: "Which apps support VLESS + Reality?",
    a: "Any client built on the Xray core: Happ and V2RayTun on iOS and Android, the same apps plus Xray wrappers on Windows and macOS, and sing-box based clients. Kovra's setup guide covers each platform in three steps.",
  },
  {
    q: "What does post-quantum ML-KEM add?",
    a: "A hybrid X25519 + ML-KEM-768 key exchange protects the session against harvest-now-decrypt-later attacks, where an adversary records encrypted traffic today hoping quantum computers decrypt it in the future. The hybrid stays secure as long as either component holds.",
  },
  {
    q: "Can deep packet inspection detect Reality at all?",
    a: "There is no published reliable detector for a correctly configured Reality server. Sloppy configurations, such as impersonating a site that obviously does not match the server's region or network, can raise statistical suspicion, which is why configuration quality matters as much as the protocol.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        OpenVPN and WireGuard were designed to encrypt traffic, not to hide
        the fact that a VPN is being used. On networks with deep packet
        inspection that difference is fatal: both protocols announce
        themselves within the first packets of a connection. VLESS + Reality
        is a different answer to a different question: how do you make a VPN
        session that an observer cannot tell apart from an ordinary visit to
        a major website? This guide explains how it works, where classic
        protocols fail, and what the numbers look like.
      </p>

      <h2>The detection problem classic VPNs cannot solve</h2>
      <p>
        Deep packet inspection does not need to decrypt your traffic to block
        it. It only needs to classify it. OpenVPN has a recognizable
        handshake signature. WireGuard is even easier: a fixed 4-byte message
        type, characteristic packet sizes, UDP, no response to random probes.
        A censor writes one rule and an entire protocol disappears from the
        national internet. This is not hypothetical; it is standard practice
        in China, Iran, Russia and Turkmenistan, and increasingly appears in
        corporate and campus firewalls.
      </p>
      <p>
        The countermeasure evolution went through obfuscation layers
        (obfs4, Shadowsocks), then TLS mimicry (VMess over WebSocket+TLS,
        Trojan), and each generation was eventually fingerprinted. Reality
        is the current end of that arms race, and it takes a structurally
        different approach: instead of imitating TLS, it borrows a real TLS
        identity.
      </p>

      <h2>What VLESS is</h2>
      <p>
        VLESS is the transport-agnostic session protocol of the{" "}
        <a
          href="https://github.com/XTLS/Xray-core"
          target="_blank"
          rel="noopener noreferrer"
        >
          Xray project
        </a>
        . It is deliberately minimal: a UUID identifies the client, and the
        protocol adds almost no framing overhead and no built-in encryption
        of its own. That last part sounds like a weakness but is the point:
        encryption and camouflage are delegated to the transport layer
        underneath, so VLESS rides on whatever disguise that layer provides.
        Less redundancy also means less fingerprintable structure and lower
        latency.
      </p>

      <h2>What Reality adds</h2>
      <p>
        Reality is the transport. When your client connects, the exchange
        looks like this:
      </p>
      <ol>
        <li>
          The client sends a TLS ClientHello that is byte-identical to a
          real browser (fingerprints like Chrome or Firefox) asking for a
          legitimate site, for example a large CDN-hosted domain.
        </li>
        <li>
          The server holds no certificate for that domain. Instead it relays
          the handshake to the genuine site and returns the{" "}
          <strong>authentic certificate chain</strong> to anyone probing it.
          A censor that connects to the server sees the real website answer,
          with a valid certificate, correct TLS version and matching
          behavior.
        </li>
        <li>
          A real client proves itself inside the handshake through an
          embedded X25519 key exchange invisible to observers. Only then does
          the server switch the connection into tunnel mode.
        </li>
      </ol>
      <p>
        The consequences are elegant. There is no self-hosted TLS
        certificate to issue, expire or blacklist. Active probing, the
        technique that killed many Shadowsocks and VMess deployments,
        returns the genuine third-party website and learns nothing.
        Blocking the server means deciding to block traffic that looks
        exactly like the borrowed site, with all the collateral damage that
        implies.
      </p>

      <h2>How it compares in practice</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Property</th>
              <th>OpenVPN</th>
              <th>WireGuard</th>
              <th>VLESS + Reality</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Survives DPI blocking</td>
              <td>No</td>
              <td>No</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>Looks like normal TLS</td>
              <td>No</td>
              <td>No</td>
              <td>Yes, with a real certificate</td>
            </tr>
            <tr>
              <td>Resists active probing</td>
              <td>Identifiable</td>
              <td>Silent but fingerprintable</td>
              <td>Answers as the borrowed site</td>
            </tr>
            <tr>
              <td>Raw speed, clean network</td>
              <td>Moderate</td>
              <td>Excellent</td>
              <td>Excellent</td>
            </tr>
            <tr>
              <td>Speed under censorship</td>
              <td>Blocked or throttled</td>
              <td>Blocked or throttled</td>
              <td>Unaffected</td>
            </tr>
            <tr>
              <td>Certificate maintenance</td>
              <td>Own PKI</td>
              <td>Keys only</td>
              <td>None, identity is borrowed</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        On a clean connection the honest summary is: WireGuard and a tuned
        VLESS setup both saturate typical consumer links, with WireGuard
        having a small latency edge from its kernel implementation. The
        moment DPI enters the picture, only one column of that table keeps
        working.
      </p>

      <h2>Post-quantum: X25519 + ML-KEM-768</h2>
      <p>
        The newest addition to the stack addresses a quieter threat:
        harvest now, decrypt later. Agencies and well-funded adversaries can
        record encrypted traffic today and wait for cryptographically
        relevant quantum computers to break the classical key exchange.
        Recent Xray releases support a hybrid handshake that combines
        classical X25519 with ML-KEM-768, the NIST-standardized post-quantum
        KEM. The session key is derived from both, so breaking it requires
        defeating both the classical and the post-quantum component. Kovra's
        stack runs on this hybrid: today's traffic stays sealed even against
        tomorrow's hardware.
      </p>

      <h2>What speed to expect in numbers</h2>
      <p>
        Concrete expectations beat adjectives. On a 300 to 500 Mbps consumer
        line, a nearby VLESS + Reality server typically delivers 250 to 450
        Mbps with 3 to 8 ms of added latency, comfortably enough for 4K
        streaming, cloud gaming and large uploads at once. The protocol adds
        single-digit percent overhead on top of TLS itself, and because the
        traffic is classified as ordinary HTTPS, it dodges the
        protocol-specific throttling that ISPs increasingly apply to
        recognizable VPN flows. Distance to the server and your ISP's
        peering matter far more than the protocol at this point, which is
        the correct state of the world: the tunnel has stopped being the
        bottleneck.
      </p>

      <h2>Honest limitations</h2>
      <ul>
        <li>
          <strong>Configuration quality matters.</strong> Reality is as
          strong as its disguise. Borrowing the identity of a site that
          makes no geographic or network sense weakens the statistical
          camouflage. This is a server-side responsibility; on managed
          services like Kovra you inherit the configuration rather than
          maintain it.
        </li>
        <li>
          <strong>It is a censorship tool, not an anonymity network.</strong>{" "}
          Reality hides the tunnel from the network path. It does not make
          you anonymous to the destination website or replace good account
          hygiene, which is why it pairs with{" "}
          <Link href="/guides/vpn-without-email">
            identity-free signup
          </Link>{" "}
          and{" "}
          <Link href="/guides/pay-for-vpn-with-crypto">crypto payment</Link>.
        </li>
        <li>
          <strong>Client ecosystem is younger.</strong> Instead of the
          decades-old OpenVPN clients you use Xray-based apps like Happ and
          V2RayTun. They are mature and cross-platform, but the names are
          less familiar; our <Link href="/guide">setup guide</Link> gets each
          platform connected in three steps.
        </li>
      </ul>

      <h2>Who should use it</h2>
      <p>
        If you are on a network that blocks or throttles VPN protocols, the
        answer is simply: you, because nothing else will stay up. If you are
        on an open network, VLESS + Reality still buys future-proofing: the
        same subscription keeps working when you travel through a censored
        country, when your ISP starts traffic-shaping VPNs, or when a hotel
        firewall gets aggressive. There is no scenario where the camouflage
        hurts, and a growing number where it is the only thing that works.
      </p>
    </GuideArticle>
  );
}

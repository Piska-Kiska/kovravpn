// src/app/guides/wireguard-vs-openvpn-vs-vless/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "wireguard-vs-openvpn-vs-vless";
const OG = ogImageUrl("WireGuard vs OpenVPN vs VLESS", "The real comparison");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Which VPN protocol is fastest?",
    a: "WireGuard, in most benchmarks, thanks to a small codebase running in kernel space and modern ciphers. VLESS is close because it is an equally thin transport. OpenVPN is consistently slowest, particularly over TCP where it suffers from TCP-in-TCP retransmission stalls.",
  },
  {
    q: "Which protocol is the most secure?",
    a: "All three, configured correctly, use ciphers with no practical attacks. WireGuard has the strongest audit story because there is very little code to audit. Security in practice is decided by the provider's key handling and server hygiene, not by the protocol name.",
  },
  {
    q: "Why does my VPN not connect on some networks?",
    a: "Because the protocol is recognizable. WireGuard's first handshake packet has a fixed layout, and OpenVPN has a distinctive opcode structure, so deep packet inspection can identify and drop both regardless of port. Protocols that imitate ordinary TLS, such as VLESS with Reality, do not present that signature.",
  },
  {
    q: "Is WireGuard bad for privacy because of static IPs?",
    a: "The protocol assigns each peer a fixed internal address and keeps it in memory, which is why serious providers add a layer that rotates or anonymizes the mapping. It is a solved problem, but worth asking a provider about rather than assuming.",
  },
  {
    q: "Should I use TCP or UDP?",
    a: "UDP whenever possible: lower latency, no TCP-in-TCP stalling. Use TCP on port 443 only as a fallback on restrictive networks, and accept that throughput will suffer under packet loss.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        Protocol comparisons usually rank speed, list cipher names, and stop.
        That produces a clean answer — WireGuard wins — and misses the metric
        that decides real outcomes: whether the connection is allowed to
        exist on the network you are actually sitting on. Here are all three
        protocols on both axes.
      </p>

      <h2>OpenVPN: the compatible one</h2>
      <p>
        Released in 2001, roughly half a million lines of code including its
        OpenSSL dependency, runs in user space, speaks both UDP and TCP, and
        exists for every platform anyone has ever shipped. Two decades of
        deployment mean it works with hardware routers, ancient systems and
        enterprise authentication schemes nothing else supports.
      </p>
      <p>
        The costs are structural. User-space processing and per-packet
        overhead make it the slowest of the three. Over TCP it suffers
        TCP-in-TCP meltdown: when the outer connection retransmits, the inner
        one does too, and throughput collapses under loss. And the handshake
        is recognizable — the opcode layout is documented, so DPI identifies
        it on any port, including 443.
      </p>

      <h2>WireGuard: the fast one</h2>
      <p>
        About 4,000 lines in the Linux kernel, a fixed modern cipher suite
        (ChaCha20-Poly1305, Curve25519, BLAKE2s) with no negotiation, UDP
        only. The result is fast connections, near-instant handshakes,
        excellent battery behaviour on mobile, and roaming that survives
        network changes without reconnecting. The small codebase is also why
        it has the most credible audit story of the three: there is little
        room to hide a mistake.
      </p>
      <p>
        Two caveats. First, the design keeps a static internal IP for each
        peer in server memory, so a provider must layer something on top to
        avoid that becoming a persistent identifier — a solved problem, but
        one to ask about, as covered in{" "}
        <Link href="/guides/how-to-verify-no-logs-vpn">
          verifying no-logs claims
        </Link>
        . Second, and more consequential: the handshake initiation packet has
        a fixed message type, fixed length and fixed field positions. It is
        one of the easiest protocols on the internet to fingerprint, which is
        why WireGuard is the first thing filtered networks drop.
      </p>

      <h2>VLESS with Reality: the invisible one</h2>
      <p>
        VLESS is a deliberately thin transport from the Xray project: no
        encryption of its own, because it expects to run inside TLS, and no
        redundant framing. Reality is the transport layer that makes it
        interesting — the server borrows the certificate chain of a real,
        popular website, so an observer sees a normal TLS 1.3 session with a
        real certificate and normal traffic patterns. Probing the server as a
        censor does returns the actual borrowed website.
      </p>
      <p>
        Performance sits close to WireGuard: the encryption is the same class
        of modern AEAD, and the extra cost is one TLS handshake at connection
        setup. It also supports hybrid post-quantum key exchange (X25519
        combined with ML-KEM-768), which matters for anyone concerned about
        recorded traffic being decrypted later. The trade is ecosystem
        maturity: fewer clients, no kernel implementation, and configuration
        that assumes a modern app rather than a router checkbox. Details in{" "}
        <Link href="/guides/vless-reality-protocol">
          the VLESS Reality guide
        </Link>
        .
      </p>

      <h2>The comparison table</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>OpenVPN</th>
              <th>WireGuard</th>
              <th>VLESS + Reality</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Throughput</td>
              <td>Moderate</td>
              <td>Highest</td>
              <td>High</td>
            </tr>
            <tr>
              <td>Connection time</td>
              <td>Seconds</td>
              <td>Instant</td>
              <td>Sub-second</td>
            </tr>
            <tr>
              <td>Battery on mobile</td>
              <td>Worst</td>
              <td>Best</td>
              <td>Good</td>
            </tr>
            <tr>
              <td>Codebase size</td>
              <td>~500k lines</td>
              <td>~4k lines</td>
              <td>Small, Go implementation</td>
            </tr>
            <tr>
              <td>DPI fingerprint</td>
              <td>Recognizable</td>
              <td>Trivially recognizable</td>
              <td>Indistinguishable from HTTPS</td>
            </tr>
            <tr>
              <td>Works behind national firewalls</td>
              <td>Rarely</td>
              <td>Rarely</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>Post-quantum option</td>
              <td>No</td>
              <td>Via preshared keys only</td>
              <td>Yes, ML-KEM hybrid</td>
            </tr>
            <tr>
              <td>Router and legacy support</td>
              <td>Excellent</td>
              <td>Good</td>
              <td>Limited</td>
            </tr>
            <tr>
              <td>Audit history</td>
              <td>Long</td>
              <td>Strong</td>
              <td>Younger</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Choosing by situation, not by benchmark</h2>
      <ul>
        <li>
          <strong>Home network, unfiltered, you want maximum speed:</strong>{" "}
          WireGuard. Nothing else is faster and the audit story is the best
          available.
        </li>
        <li>
          <strong>Old router, corporate gateway, exotic platform:</strong>{" "}
          OpenVPN, because it is the only one that will run there.
        </li>
        <li>
          <strong>Censored, throttled or probed network:</strong> VLESS with
          Reality. This is the only category where the other two simply do
          not connect — see{" "}
          <Link href="/guides/vpn-that-works-in-china">
            what works in China
          </Link>{" "}
          and{" "}
          <Link href="/guides/shadowsocks-vs-vless-reality">
            Shadowsocks versus Reality
          </Link>
          .
        </li>
        <li>
          <strong>Mobile, constantly switching between Wi-Fi and cellular:</strong>{" "}
          WireGuard for roaming, Reality if the networks are also filtered.
        </li>
        <li>
          <strong>Long-term confidentiality against recorded traffic:</strong>{" "}
          a hybrid post-quantum key exchange, which today means Reality.
        </li>
      </ul>

      <h2>What the protocol does not decide</h2>
      <p>
        Whether the provider keeps logs. Whether payment ties the account to
        your identity. Whether the kill switch actually blocks traffic when
        the tunnel drops. Whether DNS resolves inside the tunnel. Those are
        provider and client questions, and they cause far more real-world
        exposure than any cipher choice — the checks are in the{" "}
        <Link href="/guides/vpn-leak-test">leak test guide</Link> and the{" "}
        <Link href="/guides/how-to-verify-no-logs-vpn">
          no-logs verification checklist
        </Link>
        .
      </p>

      <h2>The one-line version</h2>
      <p>
        WireGuard is the best protocol on a network that permits VPNs.
        OpenVPN is the one that runs everywhere. VLESS with Reality is the
        one that works where the other two are blocked — and for a growing
        number of users, that is the only comparison that matters.
      </p>
    </GuideArticle>
  );
}

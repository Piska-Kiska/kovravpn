// src/app/guides/shadowsocks-vs-vless-reality/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "shadowsocks-vs-vless-reality";
const OG = ogImageUrl("Shadowsocks vs VLESS Reality", "Which survives DPI");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Is Shadowsocks dead in 2026?",
    a: "Not dead, but no longer sufficient on aggressively filtered networks. It still works fine where filtering is coarse. Where a censor runs statistical classification and active probing, a fully random-looking stream is itself the signal, and Shadowsocks servers get probed and blocked.",
  },
  {
    q: "What is active probing?",
    a: "After flagging a suspicious connection, the censor's infrastructure connects to the same server itself and sends crafted data to see how it responds. A plain Shadowsocks server answers differently from a web server, which confirms the guess. Reality defeats this by proxying unknown clients to the real website it borrows its certificate from.",
  },
  {
    q: "Is VLESS Reality better than Shadowsocks for speed?",
    a: "They are close. Both are thin transports with modern ciphers, and the real determinants are server distance and capacity. Reality adds a TLS handshake, which costs a few milliseconds at connection setup and nothing thereafter.",
  },
  {
    q: "Does Shadowsocks with a plugin still work?",
    a: "v2ray-plugin and similar TLS wrappers help, because they put the traffic inside a genuine TLS session. The remaining weakness is the certificate: it belongs to your own domain, which is a new domain with no history serving a single user. Reality avoids that by using an existing, popular site's certificate chain.",
  },
  {
    q: "Which one should I set up today?",
    a: "If you control the server and your network is lightly filtered, Shadowsocks is simple and fine. If you are behind serious DPI, or want one configuration that works everywhere, use VLESS with Reality. It is the current answer to the specific attack that beats everything else.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        Shadowsocks and VLESS Reality solve the same problem — getting
        traffic past a censor — with opposite philosophies. Shadowsocks tries
        to look like nothing. Reality tries to look like something
        specific and boring. In 2026, that difference decides which one
        connects.
      </p>

      <h2>Shadowsocks: the traffic that looks like noise</h2>
      <p>
        Shadowsocks was written in 2012 by a Chinese developer who needed
        something the Great Firewall could not classify. The design is
        minimal: a lightweight SOCKS5-like protocol with authenticated
        encryption, no handshake preamble, no version fields, no
        distinguishing header. On the wire it is a stream of bytes with no
        structure a pattern matcher can latch onto.
      </p>
      <p>
        That worked beautifully for years, and it still works on networks
        that block by keyword and IP. The weakness only appears against a
        censor that changed the question — from &quot;does this match a known
        protocol&quot; to &quot;does this match <em>any</em> known
        protocol&quot;.
      </p>

      <h2>How modern DPI beats it</h2>
      <p>
        <strong>Entropy analysis.</strong> Real internet traffic is not
        uniformly random. HTTPS has a plaintext handshake before the
        encrypted part; video has telltale bursts; even compressed downloads
        carry framing. A connection that is high-entropy from the very first
        byte is unusual, and unusual is enough to flag.
      </p>
      <p>
        <strong>Traffic shape.</strong> Packet size distributions, timing
        between bursts and the ratio of upstream to downstream all leave a
        classifiable signature, independent of content.
      </p>
      <p>
        <strong>Active probing.</strong> The decisive one. Having flagged a
        candidate, the censor connects to that server and speaks to it —
        replaying captured bytes, sending garbage, opening TLS. A web server
        answers like a web server. A Shadowsocks server, which by design
        answers nothing to anyone without the correct key, answers like
        neither. That silence is itself the confession, and the IP goes on a
        blocklist.
      </p>

      <h2>Reality: the traffic that looks like a real website</h2>
      <p>
        Reality inverts the strategy. Instead of hiding structure, it borrows
        someone else&apos;s: during the handshake the server presents the
        certificate chain of a genuine, popular third-party site. A censor
        inspecting the connection sees a valid TLS 1.3 session, a real
        certificate for a real domain with years of history, and normal
        HTTPS traffic patterns.
      </p>
      <p>
        Active probing fails too. A client without the correct key is
        transparently forwarded to the actual website whose certificate is
        being borrowed — so the probe gets a real page from a real server,
        exactly as it would if the address hosted a mirror. There is nothing
        anomalous to report. The full mechanism is in{" "}
        <Link href="/guides/vless-reality-protocol">
          the VLESS Reality guide
        </Link>
        .
      </p>

      <h2>Side by side</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Shadowsocks</th>
              <th>Shadowsocks + TLS plugin</th>
              <th>VLESS + Reality</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Looks like</td>
              <td>Random bytes</td>
              <td>TLS to your own domain</td>
              <td>TLS to a well-known site</td>
            </tr>
            <tr>
              <td>Survives entropy analysis</td>
              <td>No</td>
              <td>Yes</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>Survives active probing</td>
              <td>No</td>
              <td>Partly</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>Needs your own domain</td>
              <td>No</td>
              <td>Yes</td>
              <td>No</td>
            </tr>
            <tr>
              <td>Certificate to maintain</td>
              <td>None</td>
              <td>Yes, renewals included</td>
              <td>None</td>
            </tr>
            <tr>
              <td>Handshake overhead</td>
              <td>None</td>
              <td>One TLS round trip</td>
              <td>One TLS round trip</td>
            </tr>
            <tr>
              <td>Client support</td>
              <td>Very wide</td>
              <td>Wide</td>
              <td>Modern Xray-based clients</td>
            </tr>
            <tr>
              <td>Post-quantum key exchange</td>
              <td>No</td>
              <td>Depends on TLS stack</td>
              <td>Yes, ML-KEM hybrid available</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>The domain problem with TLS plugins</h2>
      <p>
        Wrapping Shadowsocks in TLS closes the entropy gap, but introduces a
        different tell. Your certificate is for your domain: registered
        recently, hosting one service, receiving traffic from a handful of
        residential addresses that all pull large volumes. A censor
        correlating certificate age, traffic volume and client diversity has
        a workable heuristic, and blocking one unknown domain costs nothing
        politically. Reality sidesteps this because blocking the borrowed
        identity would mean blocking a site the country actually uses.
      </p>

      <h2>What to run, by situation</h2>
      <ul>
        <li>
          <strong>Light filtering, self-hosted, minimal effort:</strong>{" "}
          Shadowsocks. It is a single binary and it still does the job.
        </li>
        <li>
          <strong>Moderate filtering, you own a domain:</strong> Shadowsocks
          with a TLS plugin, or plain VLESS over TLS.
        </li>
        <li>
          <strong>Serious DPI, active probing, national firewalls:</strong>{" "}
          VLESS with Reality. See{" "}
          <Link href="/guides/vpn-that-works-in-china">
            what still works in China
          </Link>
          .
        </li>
        <li>
          <strong>Corporate or campus networks with TLS inspection:</strong>{" "}
          neither is a silver bullet on a managed device — the constraints
          are in{" "}
          <Link href="/guides/unblock-websites-at-school-or-work">
            unblocking sites at school or work
          </Link>
          .
        </li>
      </ul>

      <h2>Where WireGuard and OpenVPN sit</h2>
      <p>
        Below both, for this purpose. WireGuard&apos;s first packet has a
        fixed, documented layout that any DPI engine identifies in one
        packet; OpenVPN has an equally recognizable opcode structure. They
        are excellent protocols with the wrong threat model for censorship —
        the full comparison is in{" "}
        <Link href="/guides/wireguard-vs-openvpn-vs-vless">
          WireGuard versus OpenVPN versus VLESS
        </Link>
        .
      </p>

      <h2>The takeaway</h2>
      <p>
        Invisibility is no longer achievable — anything unclassifiable is
        classified as suspicious. The winning move is to be a plausible,
        uninteresting member of the largest crowd on the internet: ordinary
        HTTPS traffic to an ordinary website. That is what Reality does, and
        it is why the protocol keeps connecting where the alternatives get
        probed and dropped.
      </p>
    </GuideArticle>
  );
}

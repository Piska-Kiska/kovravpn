// src/app/guides/unblock-websites-at-school-or-work/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "unblock-websites-at-school-or-work";
const OG = ogImageUrl("Unblock Websites", "School and work networks, honestly");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "How do school and office networks block websites?",
    a: "Most use DNS filtering, which intercepts name lookups, or SNI filtering, which reads the hostname from the unencrypted part of the TLS handshake. Larger deployments add a categorized URL database and, on managed devices, full TLS inspection through an installed root certificate.",
  },
  {
    q: "Can my employer see my traffic if I use a VPN?",
    a: "On a personal device, they see that an encrypted connection exists and how much data it carries, not its contents. On a managed device with an installed root certificate or MDM profile, assume everything is visible regardless of the tunnel, because the inspection happens before encryption.",
  },
  {
    q: "Is it illegal to bypass a school or work filter?",
    a: "Rarely illegal by itself in most jurisdictions, but it usually breaches the acceptable-use policy you agreed to, which is a disciplinary matter rather than a legal one. On equipment you do not own, the practical risk is administrative, not criminal.",
  },
  {
    q: "Does incognito mode unblock websites?",
    a: "No. Private browsing only stops your browser from storing history and cookies locally. The filter operates on the network, sees the same requests, and blocks them identically.",
  },
  {
    q: "Why do web proxies stop working after a while?",
    a: "Because filtering vendors categorize known proxy sites and push updates continuously. A public web proxy that works today is usually categorized within days. This is why people move from web proxies to tunnels, and why camouflaged tunnels outlast obvious ones.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        Before choosing a method, it is worth being precise about two things:
        how the filter in front of you works, and what it can see either way.
        Most advice on this topic gets both wrong, which is why it either
        fails immediately or works while quietly leaving a trail.
      </p>

      <h2>How the block is implemented</h2>
      <h3>DNS filtering</h3>
      <p>
        The cheapest and most common. The network forces all name lookups
        through its own resolver, which returns a block page instead of the
        real address. It is easy to deploy across thousands of devices and
        easy to bypass with encrypted DNS — which is exactly why the next
        layer exists.
      </p>
      <h3>SNI and IP filtering</h3>
      <p>
        Even over HTTPS, the hostname you are requesting travels in clear
        text in the TLS handshake unless Encrypted Client Hello is in use.
        A filtering appliance reads it and resets the connection. IP-level
        blocks add a coarse fallback for well-known destinations.
      </p>
      <h3>TLS inspection on managed devices</h3>
      <p>
        The layer that changes everything. If the organization installed a
        root certificate on the device, the appliance can terminate TLS,
        read the plaintext, and re-encrypt to the destination. Nothing
        running on that device can hide from it, because the interception
        happens at the point where your own software does the encryption.
        On a managed laptop or a phone with an MDM profile, assume this is
        possible.
      </p>
      <h3>Application and protocol blocking</h3>
      <p>
        Enterprise firewalls also classify traffic by protocol shape and drop
        recognizable VPN handshakes. WireGuard and OpenVPN are trivially
        identified; this is the same fingerprinting problem described in{" "}
        <Link href="/guides/wireguard-vs-openvpn-vs-vless">
          the protocol comparison
        </Link>
        .
      </p>

      <h2>What actually works, and against what</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th>Beats DNS filter</th>
              <th>Beats SNI filter</th>
              <th>Beats TLS inspection</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Alternative DNS server</td>
              <td>Sometimes</td>
              <td>No</td>
              <td>No</td>
            </tr>
            <tr>
              <td>DNS over HTTPS in the browser</td>
              <td>Yes</td>
              <td>No</td>
              <td>No</td>
            </tr>
            <tr>
              <td>Public web proxy</td>
              <td>Yes</td>
              <td>Until categorized</td>
              <td>No</td>
            </tr>
            <tr>
              <td>VPN, standard protocol</td>
              <td>Yes</td>
              <td>Yes</td>
              <td>No, if managed device</td>
            </tr>
            <tr>
              <td>VPN with TLS camouflage</td>
              <td>Yes</td>
              <td>Yes</td>
              <td>No, if managed device</td>
            </tr>
            <tr>
              <td>Mobile data instead of Wi-Fi</td>
              <td>Yes</td>
              <td>Yes</td>
              <td>Yes</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Read the last two columns together. Nothing you install bypasses
        inspection on a device the organization controls — and the simplest
        genuine bypass, using your own cellular connection on your own phone,
        involves no bypass at all.
      </p>

      <h2>The visibility question, answered honestly</h2>
      <p>
        On a personal device on the organization&apos;s Wi-Fi, a VPN hides
        the destinations and contents of your traffic. What remains visible:
      </p>
      <ul>
        <li>That an encrypted connection exists, and to which IP address.</li>
        <li>How much data moved, and when.</li>
        <li>
          On networks that block unknown protocols, the fact that something
          was blocked or that an unusual connection was attempted.
        </li>
      </ul>
      <p>
        That last point is the one people underestimate. A filter that logs
        &quot;VPN attempt from this device&quot; has recorded something
        interesting even though it learned nothing about the traffic. A
        camouflaged protocol that presents as normal HTTPS avoids generating
        that log entry, which is a different property from encryption — the
        mechanism is in{" "}
        <Link href="/guides/vless-reality-protocol">
          the VLESS Reality guide
        </Link>
        .
      </p>

      <h2>If you decide to do it anyway</h2>
      <ol>
        <li>
          <strong>Use your own device.</strong> This is the single most
          important line. Personal phone, personal laptop, no work profile.
        </li>
        <li>
          <strong>Never install a certificate the organization asks for on a
          personal device.</strong> That is the switch that makes inspection
          possible.
        </li>
        <li>
          <strong>Prefer a protocol that does not announce itself</strong>, so
          the attempt is not logged as a policy violation.
        </li>
        <li>
          <strong>Turn on the kill switch</strong>, so a dropped tunnel does
          not silently resume in clear text.
        </li>
        <li>
          <strong>Verify DNS resolves inside the tunnel</strong> — the checks
          are in the{" "}
          <Link href="/guides/vpn-leak-test">leak test guide</Link>.
        </li>
        <li>
          <strong>Do not use free proxy sites.</strong> On a network that is
          already logging you, adding an anonymous operator with full
          visibility into your session is the worst of both worlds; see{" "}
          <Link href="/guides/free-proxy-list-risks">
            free proxy lists
          </Link>
          .
        </li>
      </ol>

      <h2>The part that has nothing to do with technology</h2>
      <p>
        The real risk here is almost never technical. It is the acceptable-use
        policy: a document that typically permits monitoring of network use
        and treats circumvention as misconduct. Filters exist for a mixture of
        legitimate reasons — bandwidth, malware, legal obligations for
        minors — and blanket ones. Knowing which category applies to the site
        you want is usually more useful than any of the methods above, and
        &quot;this tool is blocked and I need it for work&quot; is a request
        IT departments grant routinely.
      </p>

      <h2>The summary</h2>
      <p>
        DNS and SNI filters are bypassable and a camouflaged tunnel does it
        cleanly. TLS inspection on a managed device is not bypassable by
        anything you install on that device. And the method with the fewest
        complications is often the one people skip: your own phone, your own
        data plan, no policy to violate.
      </p>
    </GuideArticle>
  );
}

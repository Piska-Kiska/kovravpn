// src/app/guides/how-to-set-up-vpn-on-iphone/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata, SITE_URL } from "@/lib/guides";
import { buildHowToSchema, jsonLd } from "@/lib/structured-data";

const SLUG = "how-to-set-up-vpn-on-iphone";
const OG = ogImageUrl("VPN on iPhone", "Three minutes, done properly");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

/**
 * HowTo schema for the setup sequence. Google renders numbered step results
 * for these, and the steps below are the same five the page shows — schema
 * that does not match visible content is a policy violation, not a shortcut.
 */
const HOW_TO = buildHowToSchema({
  name: "Set up a VPN on iPhone",
  description:
    "Install a VPN client on iOS, add a subscription link, allow the VPN configuration and connect.",
  url: `${SITE_URL}/guides/${SLUG}`,
  totalTime: "PT3M",
  steps: [
    {
      name: "Choose a provider and get a subscription link",
      text: "Sign up with a provider that issues a subscription URL, and copy that link. It contains your server list and keys.",
    },
    {
      name: "Install a client that supports modern protocols",
      text: "Install an iOS client such as Happ or Streisand from the App Store. Native iOS VPN settings do not support VLESS or Reality.",
    },
    {
      name: "Add the subscription",
      text: "Open the client, choose Add subscription, and paste the link. The server list populates automatically.",
    },
    {
      name: "Allow the VPN configuration",
      text: "Tap connect and approve the iOS prompt to add a VPN configuration. This is required once per app and is what creates the system tunnel.",
    },
    {
      name: "Verify and tune",
      text: "Check your IP and DNS with a leak test, enable Connect On Demand for automatic reconnection, and disable iCloud Private Relay to avoid double tunnelling Safari.",
    },
  ],
});

const FAQ: FaqItem[] = [
  {
    q: "How do I set up a VPN on my iPhone?",
    a: "Install a client app that supports your provider's protocol, paste the subscription link the provider gave you, approve the iOS prompt that adds a VPN configuration, and connect. The whole process takes about three minutes and needs no jailbreak or computer.",
  },
  {
    q: "Why can I not add my VPN in iOS Settings directly?",
    a: "The built-in VPN screen supports IKEv2, IPsec and L2TP only. Modern protocols such as WireGuard, VLESS and Reality are implemented by apps using the NetworkExtension framework, which is why every current provider ships or recommends a client app.",
  },
  {
    q: "Does a VPN drain iPhone battery?",
    a: "Modern protocols cost a few percent of battery per day, mostly from keeping one connection alive. Older protocols such as OpenVPN cost noticeably more. Leaving the VPN connected all day on WireGuard or VLESS is not a battery problem on current hardware.",
  },
  {
    q: "Should I turn off iCloud Private Relay when using a VPN?",
    a: "Yes. Private Relay routes Safari traffic through Apple's own relays, which layers a second tunnel inside your VPN and adds latency for no privacy gain. Disable it in Settings under your Apple Account, iCloud, Private Relay.",
  },
  {
    q: "Will the VPN stay connected in the background?",
    a: "It does if you enable Connect On Demand in the client, which asks iOS to re-establish the tunnel whenever traffic starts. Without it, iOS may drop the tunnel during long idle periods to save power.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(HOW_TO) }}
      />

      <p>
        Setting up a VPN on an iPhone is quick once you know one thing: the
        VPN screen in iOS Settings is not where modern VPNs live. It supports
        protocols standardized over a decade ago, and everything current runs
        through an app using Apple&apos;s NetworkExtension framework. That
        single fact explains the whole flow below.
      </p>

      <h2>Step 1: get a subscription link, not an installer</h2>
      <p>
        Providers using modern protocols issue a <em>subscription URL</em>: a
        link containing your server list, keys and parameters, which any
        compatible client on iOS, Android, macOS or Windows can import. Some
        providers, Kovra included, issue one link per device, so a second
        phone or a laptop gets its own link rather than a copy of this one.{" "}
        <Link href="/guides/vpn-subscription-link-explained">
          How subscription links work
        </Link>
        .
      </p>
      <p>
        If you are still choosing a provider, the criteria worth weighing are
        in{" "}
        <Link href="/guides/best-crypto-vpn-2026">
          the 2026 comparison
        </Link>{" "}
        and{" "}
        <Link href="/guides/cheapest-private-vpn">
          what a private VPN should cost
        </Link>
        .
      </p>

      <h2>Step 2: install a client</h2>
      <p>
        On iOS the well-maintained options are <strong>Happ</strong> and{" "}
        <strong>Streisand</strong>, and <strong>INCY</strong> also imports
        standard subscription links. They support VLESS with Reality
        alongside older protocols; providers usually name one because they
        have tested it against their own servers. <strong>V2RayTun</strong>,
        still recommended by older guides, was not listed in the US, UK,
        German or Dutch App Store when we checked on 25 September 2026.
      </p>
      <p>
        Ignore the App Store&apos;s &quot;top free VPN&quot; results while
        you are there. That chart is where the ad-funded and
        bandwidth-reselling apps live —{" "}
        <Link href="/guides/are-free-vpns-safe">
          the business models are here
        </Link>
        .
      </p>

      <h2>Step 3: add the subscription</h2>
      <ol>
        <li>Copy your subscription link.</li>
        <li>
          Open the client and choose <em>Add subscription</em> (wording
          varies: &quot;+&quot;, &quot;Import from clipboard&quot;).
        </li>
        <li>
          Paste the link. The server list populates within a second or two.
        </li>
        <li>
          If the client offers it, enable automatic updates for the
          subscription so new servers arrive without re-pasting anything.
        </li>
      </ol>

      <h2>Step 4: allow the VPN configuration</h2>
      <p>
        Tap connect and iOS will ask permission to add a VPN configuration,
        then request Face ID or your passcode. This is the system-level step
        that creates the tunnel, and it happens once per app. Afterwards a{" "}
        <strong>VPN</strong> badge appears in the status bar whenever the
        tunnel is up.
      </p>
      <p>
        If nothing happens after the prompt, the usual causes are an expired
        subscription, a server that is unreachable from your current network,
        or a configuration-profile restriction on a managed device. On a
        work-managed
        iPhone, see{" "}
        <Link href="/guides/unblock-websites-at-school-or-work">
          what MDM changes
        </Link>
        .
      </p>

      <h2>Step 5: the four settings that matter afterwards</h2>
      <ul>
        <li>
          <strong>Connect On Demand.</strong> In the client&apos;s settings.
          Tells iOS to bring the tunnel up automatically when traffic starts,
          which prevents the silent gap after the phone wakes.
        </li>
        <li>
          <strong>iCloud Private Relay: off.</strong> Settings, your Apple
          Account, iCloud, Private Relay. It tunnels Safari through
          Apple&apos;s relays, which inside a VPN means two tunnels and extra
          latency for no benefit.
        </li>
        <li>
          <strong>Kill switch, if the client has one.</strong> Ensures no
          traffic leaves outside the tunnel when it drops — the difference is
          demonstrated in the{" "}
          <Link href="/guides/vpn-leak-test">leak test guide</Link>.
        </li>
        <li>
          <strong>Low Data Mode: off</strong> on the Wi-Fi networks where you
          use the VPN. It throttles background refresh in ways that make the
          tunnel look unreliable.
        </li>
      </ul>

      <h2>Step 6: verify, once</h2>
      <p>
        Connect, then check your public IP, DNS resolvers and IPv6 status.
        Two minutes now saves the situation where the icon says connected for
        a week and DNS was resolving through your carrier the whole time. The
        exact checks are in the{" "}
        <Link href="/guides/vpn-leak-test">VPN leak test</Link>.
      </p>

      <h2>Troubleshooting the three common failures</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Symptom</th>
              <th>Cause</th>
              <th>Fix</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Connects, then drops after a minute</td>
              <td>Server unreachable or overloaded</td>
              <td>Switch server in the list; check subscription validity</td>
            </tr>
            <tr>
              <td>Connected but no internet</td>
              <td>DNS misconfiguration in the client</td>
              <td>Reset to provider DNS; reconnect</td>
            </tr>
            <tr>
              <td>Will not connect on one network only</td>
              <td>That network filters the protocol</td>
              <td>
                Use a camouflaged protocol — see{" "}
                <Link href="/guides/wireguard-vs-openvpn-vs-vless">
                  the comparison
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>One habit worth forming</h2>
      <p>
        Turn on automatic connection for unknown Wi-Fi networks. The moment
        that matters is not when you are browsing deliberately; it is the
        thirty seconds after your phone joins a hotel network on its own and
        every app starts syncing. What that window exposes is covered in{" "}
        <Link href="/guides/vpn-for-public-wifi">
          public Wi-Fi security
        </Link>
        .
      </p>
    </GuideArticle>
  );
}

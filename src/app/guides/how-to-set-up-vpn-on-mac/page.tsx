// src/app/guides/how-to-set-up-vpn-on-mac/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata, SITE_URL } from "@/lib/guides";
import { buildHowToSchema, jsonLd } from "@/lib/structured-data";

const SLUG = "how-to-set-up-vpn-on-mac";
const OG = ogImageUrl("VPN on a Mac", "VLESS Reality clients that still exist");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

/** Anchored headings clear the sticky header when jumped to. */
const ANCHOR = { scrollMarginTop: 88 } as const;

/** Mirrors the four numbered steps plus the Private Relay and verify sections. */
const HOW_TO = buildHowToSchema({
  name: "Set up a VPN on a Mac",
  description:
    "Install Happ on macOS from the Mac App Store or Happ's DMG, import a VLESS subscription, allow the VPN configuration, switch off iCloud Private Relay and verify.",
  url: `${SITE_URL}/guides/${SLUG}`,
  totalTime: "PT10M",
  steps: [
    {
      name: "Get a link for this Mac",
      text: "In your VPN provider's dashboard, create a device of the Mac type and copy its subscription link. On Kovra, the Mac needs its own link, separate from the iPhone's.",
    },
    {
      name: "Install Happ",
      text: "On macOS 15 or later, install Happ - Proxy Utility from the Mac App Store. On macOS 13 or 14, use the DMG from Happ's official GitHub releases page.",
    },
    {
      name: "Import the subscription",
      text: "Paste the subscription link into Happ. The list of locations appears and refreshes on its own.",
    },
    {
      name: "Allow the VPN configuration",
      text: "Approve the macOS prompt to add a VPN configuration (App Store build), or enter the administrator password to install Happ's background service (DMG build).",
    },
    {
      name: "Switch off iCloud Private Relay and verify",
      text: "Turn off iCloud Private Relay so Safari does not mix Private Relay and the VPN, then check IP, DNS and IPv6 with a leak test.",
    },
  ],
});

const FAQ: FaqItem[] = [
  {
    q: "Can I reuse my iPhone's VPN link on my Mac?",
    a: "Not on Kovra. The Mac App Store build of Happ is the same listing as the iPhone app, but each Kovra link is bound to the first device that opens it. A second device receives a single 'One device per link' entry instead of locations. Add a Mac device in the dashboard; it uses its own device slot.",
  },
  {
    q: "Why does the App Store version of Happ need macOS 15?",
    a: "Happ's requirements page says the App Store build is made with Apple's Catalyst technology and needs macOS 15 or later. The App Store page itself may show a lower number. If your Mac runs macOS 13 or 14, use the DMG build from Happ's GitHub releases, which Happ lists for macOS 13 and newer.",
  },
  {
    q: "Is there a Linux app?",
    a: "Happ publishes Linux builds, but Kovra's dashboard has no Linux device type today, and this guide does not cover Linux.",
  },
  {
    q: "Does iCloud Private Relay conflict with a VPN?",
    a: "It does not stop the VPN from connecting. An Apple engineer has stated that traffic going through a VPN configured on the device, such as the App Store build's tunnel, is not eligible for Private Relay. Traffic outside that tunnel, for example Safari in the DMG build's Proxy mode, can still use Private Relay, and sites then see a Private Relay address instead of the location you picked. Switching it off keeps the result predictable: System Settings, your Apple Account, iCloud, Private Relay.",
  },
  {
    q: "Which Happ build should I pick if my Mac can run both?",
    a: "On macOS 15 or later, the App Store build is the simpler choice: it updates through the App Store and uses the standard macOS VPN prompt. The DMG build is the desktop app shared with Windows and Linux, with a Proxy or TUN mode switch and a background service. Use it if you need those desktop options or are on macOS 13 or 14.",
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
        Setting up a VLESS Reality VPN on a Mac is quick, but many of the
        guides that rank for it are out of date. They recommend clients that
        are no longer in the App Store. They also skip the fact that the same
        client comes in two different builds for macOS. This guide uses
        Happ, which is still listed. It covers both builds, the macOS prompts
        you will see, and the two Apple privacy features that overlap with
        a VPN.
      </p>
      <p>
        The worked example in Step 1 is Kovra, the service that publishes
        this guide. Every other step applies to any VLESS subscription link.
      </p>

      <h2>Which build fits your Mac</h2>
      <p>
        Open the Apple menu and choose About This Mac to see your macOS
        version. Then pick a build. The versions below are the ones Happ
        states on its own requirements page:
      </p>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Mac App Store build</th>
              <th>DMG build</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Minimum macOS</td>
              <td>macOS 15</td>
              <td>macOS 13</td>
            </tr>
            <tr>
              <td>Where from</td>
              <td>Mac App Store, same listing as iPhone</td>
              <td>Happ&apos;s GitHub releases page</td>
            </tr>
            <tr>
              <td>What it is</td>
              <td>The iPhone and iPad app, built for Mac with Catalyst</td>
              <td>The desktop app shared with Windows and Linux</td>
            </tr>
            <tr>
              <td>First-run prompt</td>
              <td>Add VPN configuration</td>
              <td>Administrator password for a background service</td>
            </tr>
            <tr>
              <td>Updates</td>
              <td>Through the App Store</td>
              <td>From inside the app or a new DMG</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        On macOS 15 or later, start with the App Store build. On macOS 13 or
        14, use the DMG. Current Happ builds do not support anything older
        than macOS 13.
      </p>

      <h2>Step 1: get the link for this Mac</h2>
      <p>
        In your <a href="/dashboard">Kovra dashboard</a>, press{" "}
        <strong>Add device</strong> (or <strong>Connect</strong> for your
        first device) and pick <strong>Mac</strong>. The new card holds the
        subscription link with a copy button and a QR code option. The
        dashboard&apos;s Happ button for Mac opens the same App Store listing
        as the iPhone one, but the Mac still needs <em>its own link</em>.
        Kovra binds each link to the first device that opens it, and any
        other device gets a &quot;One device per link&quot; entry instead of
        locations. Each device uses a slot. The 3-device plan has three, and
        an extra slot costs $5 for 30 days. The rules are in{" "}
        <Link href="/guides/vpn-subscription-link-explained#one-device">
          one link, one device
        </Link>
        .
      </p>

      <h2>Step 2: install Happ</h2>
      <p>
        <strong>App Store build.</strong> Search the Mac App Store for{" "}
        <strong>Happ - Proxy Utility</strong> by Flyfrog LLC. The App Store
        also carries apps with similar names from other developers, so check
        the developer name before you install.
      </p>
      <p>
        <strong>DMG build.</strong> Download{" "}
        <code>Happ.macOS.universal.dmg</code> from Happ&apos;s official GitHub
        releases page (Happ-proxy/happ-desktop). It runs on both Apple
        silicon and Intel Macs. Open the DMG and drag Happ into Applications.
        If macOS says it cannot verify the app, and only if the file came
        from that page, open System Settings, Privacy &amp; Security, and use
        the Open Anyway button for Happ. Do not take the DMG from anywhere
        else.
      </p>

      <h2>Step 3: import the subscription</h2>
      <p>
        Copy the link from the dashboard, open Happ and add it as a
        subscription. In both builds, use the <strong>+</strong> button and
        add the link from the clipboard; in the App Store build this works
        the same way as on iPhone. Labels shift a little between versions.
        The list of locations appears, and Kovra asks Happ to refresh it
        every hour, so you never re-paste the link.
      </p>
      <p>
        If the link on your card starts with kovravpn.com/p/, it is a
        one-tap import page rather than a plain subscription address. Open
        it in a browser on the Mac and let it open Happ, which then adds the
        subscription.
      </p>

      <h2>Step 4: allow the VPN configuration</h2>
      <p>
        <strong>App Store build:</strong> the first time you connect, macOS
        asks whether Happ may add VPN configurations. Choose Allow and
        confirm with your password or Touch ID. Happ then appears under
        System Settings, VPN, which also shows whether it is connected.
      </p>
      <p>
        <strong>DMG build:</strong> Happ asks for your administrator password
        to install its background service. Since version 4.0.5 the whole
        installation runs on a single confirmation. The desktop build then offers the same Proxy,
        TUN and Mixed modes as on Windows. TUN covers every app, while Proxy
        covers apps that use the system proxy setting, mainly browsers. The{" "}
        <Link href="/guides/how-to-set-up-vpn-on-windows#modes">
          Windows guide explains the difference
        </Link>
        , and it applies unchanged to the Mac.
      </p>
      <p>
        On a work Mac managed by an organisation, a configuration profile
        can block new VPN configurations or background services entirely.
        If the prompt never appears, or is refused without asking you, that
        is the likely reason. Ask IT before you look for a workaround.
      </p>

      <h2 id="private-relay" style={ANCHOR}>
        iCloud Private Relay and Limit IP Address Tracking
      </h2>
      <p>
        <strong>iCloud Private Relay</strong> is part of iCloud+. It sends
        Safari traffic, DNS lookups and unencrypted web traffic through two
        relays: the first run by Apple, the second by a partner network.
        According to an Apple engineer on Apple&apos;s developer forums,
        traffic that goes through a VPN configured on the device, such as
        the App Store build&apos;s tunnel, is not eligible for Private Relay.
        Traffic outside the tunnel is, and in the DMG build&apos;s Proxy mode
        Safari may use Private Relay instead of the proxy, so sites see a
        Private Relay address rather than the location you picked. To keep
        the result predictable, turn it off in System Settings: click your
        name (Apple Account), then iCloud, then Private Relay.
      </p>
      <p>
        <strong>Limit IP Address Tracking</strong> is a per-network setting
        that hides your IP address from known trackers in Mail and Safari.
        It is much less intrusive. If a site misbehaves only on one Wi-Fi
        network with the VPN on, switch it off for that network under System
        Settings, Wi-Fi, Details next to the network name.
      </p>

      <h2>Other clients, and the ones that disappeared</h2>
      <p>
        Mac VLESS guides go stale fast because the App Store changes under
        them. Before you follow a recommendation, check the current listing
        in your own region:
      </p>
      <ul>
        <li>
          <strong>FoXray</strong> has been missing from every App Store
          storefront tested by applecensorship.com since April 2025, yet older
          guides still recommend it. An app with a similar name from a
          different developer has appeared since; it is not the same product.
        </li>
        <li>
          <strong>V2RayTun</strong> was not found in the US, UK, German or
          Dutch App Store when we checked the listing on 25 September 2026.
        </li>
        <li>
          <strong>V2Box</strong>, <strong>Streisand</strong> and{" "}
          <strong>Hiddify</strong> were listed in those storefronts on the
          same date. Whether each installs on a Mac depends on the app and
          your region, so check the Mac App Store listing itself. Hiddify
          also publishes a macOS DMG on GitHub.
        </li>
        <li>
          <strong>INCY</strong> reads Kovra subscriptions and is in the App
          Store, where its Mac version requires an Apple silicon Mac. Its
          separate desktop client is labelled pre-alpha by its developer.
        </li>
      </ul>
      <p>
        Whatever you pick, avoid the App Store&apos;s &quot;free VPN&quot;
        results. Why is covered in{" "}
        <Link href="/guides/are-free-vpns-safe">are free VPNs safe</Link>.
      </p>

      <h2>Verify</h2>
      <p>
        With the VPN connected, check that your public IP belongs to the
        location you picked, that DNS is not answered by your internet
        provider, and that IPv6 does not show your real address. In Proxy
        mode on the DMG build, also check WebRTC in the browser. The{" "}
        <Link href="/guides/vpn-leak-test">VPN leak test</Link> covers every
        check in a few minutes.
      </p>

      <h2 id="troubleshooting" style={ANCHOR}>
        When it fails
      </h2>
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
              <td>The VPN prompt never appears</td>
              <td>
                Managed Mac, a stale configuration, or another VPN app holding
                the tunnel
              </td>
              <td>
                Check System Settings, VPN; remove old entries, quit other VPN
                apps, reopen Happ
              </td>
            </tr>
            <tr>
              <td>Connected, but Safari fails</td>
              <td>Private Relay, a proxy extension, or a leftover proxy</td>
              <td>
                Turn off Private Relay; check Wi-Fi, Details, Proxies; then see{" "}
                <Link href="/guides/vpn-connected-but-no-internet">
                  connected but no internet
                </Link>
              </td>
            </tr>
            <tr>
              <td>The only entry is &quot;One device per link - kovravpn.com&quot;</td>
              <td>The link is bound to another device, often the iPhone</td>
              <td>
                Use the Mac&apos;s own link, or press Reset device binding and
                refresh on the Mac
              </td>
            </tr>
            <tr>
              <td>The only entry is &quot;No active plan - kovravpn.com&quot;</td>
              <td>The plan has ended</td>
              <td>Renew; the list returns on the next refresh</td>
            </tr>
            <tr>
              <td>App Store says the app needs a newer macOS</td>
              <td>The App Store build needs macOS 15</td>
              <td>Install the DMG build (macOS 13 and newer) or update macOS</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The placeholder entries ending in &quot;kovravpn.com&quot; point to a
        dummy local address, so connecting to one gives no internet by
        design. Setting up the phone as well? The iPhone steps are in{" "}
        <Link href="/guides/how-to-set-up-vpn-on-iphone">
          how to set up a VPN on iPhone
        </Link>
        .
      </p>
    </GuideArticle>
  );
}

// src/app/guides/how-to-set-up-vpn-on-windows/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata, SITE_URL } from "@/lib/guides";
import { buildHowToSchema, jsonLd } from "@/lib/structured-data";

const SLUG = "how-to-set-up-vpn-on-windows";
const OG = ogImageUrl("VPN on Windows", "TUN or system proxy, explained");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

/** Anchored headings clear the sticky header when jumped to. */
const ANCHOR = { scrollMarginTop: 88 } as const;

/** Mirrors the numbered steps and the mode choice shown on the page. */
const HOW_TO = buildHowToSchema({
  name: "Set up a VPN on Windows 11 or 10",
  description:
    "Install Happ from its official GitHub releases, import a VLESS subscription, choose TUN or system proxy mode and verify the connection.",
  url: `${SITE_URL}/guides/${SLUG}`,
  totalTime: "PT10M",
  steps: [
    {
      name: "Get a link for this PC",
      text: "In your VPN provider's dashboard, create a device of the Windows type and copy its subscription link. On Kovra, each link works on one device.",
    },
    {
      name: "Install Happ from the official source",
      text: "Download the installer from Happ's GitHub releases page (setup-Happ.x64.exe, or the arm64 installer for ARM PCs), approve the administrator prompt and finish the setup.",
    },
    {
      name: "Import the subscription",
      text: "Copy the subscription link, open Happ, use the + button and add the link from the clipboard. The list of locations appears.",
    },
    {
      name: "Choose TUN or system proxy",
      text: "Use TUN if games, launchers or command-line tools must go through the VPN. System proxy covers mainly browsers.",
    },
    {
      name: "Verify",
      text: "Check your public IP, DNS, IPv6 and WebRTC with a leak test.",
    },
  ],
});

const FAQ: FaqItem[] = [
  {
    q: "Does Happ run on Windows 7 or 8?",
    a: "Current Happ desktop builds need Windows 10 version 1809 or later, or Windows 11. Happ keeps an old Legacy build, 1.0.2, for older systems, but it is a frozen version, and Windows 7 and 8.1 no longer receive security updates from Microsoft. Upgrading Windows is the better fix.",
  },
  {
    q: "Is there a Linux option?",
    a: "Happ publishes Linux builds, but Kovra's dashboard has no Linux device type today, and this guide does not cover Linux.",
  },
  {
    q: "Can I use v2rayN instead of Happ?",
    a: "v2rayN is an open-source desktop client that imports subscription links, and it can read the same link. Kovra's dashboard and support instructions are written for Happ, so you would be following v2rayN's own documentation for its modes and settings. One link still belongs to one device.",
  },
  {
    q: "Do I need to keep Happ open for the VPN to work?",
    a: "The tunnel runs while Happ and its background service are running. Happ has a tray icon with a menu, so the main window does not need to stay on screen. When you want the VPN off, disconnect or quit from Happ itself rather than ending the process in Task Manager, so the app can clean up the system proxy it set.",
  },
  {
    q: "Why does my game ignore the VPN?",
    a: "Most games, launchers and anti-cheat services connect directly and ignore Windows proxy settings, so in system proxy mode their traffic never enters the tunnel. Switch Happ to TUN mode, which captures traffic from every app through a virtual network adapter.",
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
        On Windows, installing and importing take five minutes. The part
        that decides whether the VPN actually works for you is one setting.
        A VLESS client can carry your traffic in two ways: as a{" "}
        <strong>system proxy</strong> or through a <strong>TUN</strong>{" "}
        virtual network adapter. Pick the wrong one and the browser goes
        through the VPN while your game, launcher or terminal does not. This
        guide explains both modes, the install, and the leftover-proxy
        problem that can leave a PC with no internet after a crash.
      </p>
      <p>
        The worked example in Steps 1 and 2 is Kovra, the service that
        publishes this guide. The rest applies to any VLESS subscription.
      </p>

      <h2>What you need</h2>
      <ul>
        <li>
          <strong>Windows 10 version 1809 or later, or Windows 11.</strong>{" "}
          That is Happ&apos;s stated minimum. To check, press Win + R, type{" "}
          <code>winver</code> and press Enter. Version 1809 is OS build 17763.
        </li>
        <li>
          <strong>Administrator rights</strong> for the install. Happ
          installs a background service that it uses to connect, including
          in TUN mode.
        </li>
        <li>
          <strong>A link created for this PC.</strong> Kovra binds each link
          to the first device that opens it, so your phone&apos;s link will
          not work here.
        </li>
      </ul>

      <h2>Step 1: get the link for this PC</h2>
      <p>
        In your <a href="/dashboard">Kovra dashboard</a>, press{" "}
        <strong>Add device</strong> (or <strong>Connect</strong> if it is
        your first) and pick <strong>Windows</strong>. The new card holds the
        subscription link with a copy button. It uses one device slot. The
        3-device plan has three, and an extra slot costs $5 for 30 days.
        Copy the link. How these links work, and why each one belongs to one
        device, is explained in{" "}
        <Link href="/guides/vpn-subscription-link-explained">
          VPN subscription links explained
        </Link>
        .
      </p>

      <h2>Step 2: install Happ from the official source</h2>
      <p>
        The dashboard&apos;s Happ button downloads{" "}
        <code>setup-Happ.x64.exe</code> from Happ&apos;s official GitHub
        releases page (Happ-proxy/happ-desktop). If your PC has an ARM
        processor, as some Snapdragon laptops do, download{" "}
        <code>setup-Happ.arm64.exe</code> from the same page instead.
        Settings, System, About shows the processor type under System type.
      </p>
      <p>
        Run the installer and approve the User Account Control prompt. If
        SmartScreen shows &quot;Windows protected your PC&quot;, check that
        the file came from that GitHub page before choosing More info and
        Run anyway. Do not use repackaged installers from download portals:
        a VPN client sees all your traffic, and a modified one could do
        anything with it.
      </p>

      <h2>Step 3: import the subscription</h2>
      <p>
        Copy the link, open Happ, use the <strong>+</strong> button and add
        the link from the clipboard. Happ&apos;s documentation lists the
        clipboard, a QR code and a deep link as the ways to add a
        subscription, and the exact labels shift a little between versions.
        The list of locations appears. Kovra asks Happ to refresh it every
        hour, so new locations arrive on their own.
      </p>
      <p>
        If the link on your card starts with kovravpn.com/p/, it is a
        one-tap import page rather than a plain subscription address. Open
        it in a browser on this PC and let it open Happ, which then adds the
        subscription.
      </p>

      <h2 id="modes" style={ANCHOR}>
        System proxy vs TUN: the one choice that matters
      </h2>
      <p>
        <strong>System proxy</strong> runs a small proxy on your own PC and
        points Windows&apos; proxy setting at it. Apps that respect that
        setting, mainly browsers and some Microsoft apps, send their traffic
        through the VPN. Everything else connects directly: most games and
        launchers, command-line tools such as curl, git and package managers,
        and many chat and sync clients. Some Microsoft Store apps cannot use
        a proxy on your own PC at all, because Windows isolates them from it.
      </p>
      <p>
        <strong>TUN</strong> adds a virtual network adapter and routes the
        system&apos;s traffic into it, so every app goes through the tunnel
        without knowing a VPN exists. It is the mode to use if anything other
        than a browser must be covered.
      </p>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>System proxy</th>
              <th>TUN</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Browsers</td>
              <td>Covered</td>
              <td>Covered</td>
            </tr>
            <tr>
              <td>Games, launchers, CLI tools</td>
              <td>Usually not covered</td>
              <td>Covered</td>
            </tr>
            <tr>
              <td>Browser WebRTC</td>
              <td>Can reveal your real IP</td>
              <td>Goes through the tunnel</td>
            </tr>
            <tr>
              <td>Microsoft Store apps</td>
              <td>Some cannot connect</td>
              <td>Covered</td>
            </tr>
            <tr>
              <td>Risk after a crash</td>
              <td>A leftover proxy setting blocks browsing</td>
              <td>No proxy setting is left behind</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        In Happ desktop, the choice is a dropdown on the main screen.{" "}
        <strong>Proxy</strong> and <strong>TUN</strong> can be switched on
        separately or together, which Happ shows as <strong>Mixed</strong>.
        The same dropdown picks the TUN provider, and the tray menu lists the
        providers too. Since Happ 4.2.1 the default provider is Xray TUN;
        leave it unless you have a specific reason to change it. Happ&apos;s
        release notes also list a Per-App Proxy option when running Xray TUN,
        for keeping chosen apps outside the tunnel.
      </p>

      <h2>Administrator prompts, firewall and antivirus</h2>
      <p>
        Creating a network adapter needs administrator rights. Happ works
        through a background service installed with the app, so the
        administrator prompt normally comes once, at install time. If the
        service cannot start, current versions say so and suggest
        reinstalling. The release notes also mention a Reset action that
        repairs the service.
      </p>
      <p>
        Windows Defender Firewall allows outgoing connections by default, so
        Happ normally needs no firewall rule. A firewall prompt usually
        appears only if you turn on LAN sharing, which Happ&apos;s release
        notes call <strong>Allow from LAN</strong>. That setting opens proxy
        ports to other devices on your network, so leave it off unless you
        need it. Third-party firewalls that filter
        outgoing traffic need to allow Happ.
      </p>
      <p>
        Antivirus products sometimes flag proxy and VPN clients. Do not
        switch the antivirus off. Check the source instead. Happ&apos;s
        4.2.1 release notes say the Windows installer now ships fully signed
        binaries, so look at the Digital Signatures tab in the Properties
        window of the flagged file. If the file came from the official
        GitHub page and shows a valid signature, report the false positive to
        the antivirus vendor or add an exclusion for that file only.
      </p>

      <h2>One VPN client at a time</h2>
      <p>
        Two clients fight over the same system proxy setting and the same
        routes, and the result is a connection that works on some sites and
        not others. Quit, or uninstall, other VPN and proxy apps before you
        connect. That includes other VLESS clients, &quot;free VPN&quot;
        browser extensions and proxy extensions. Corporate VPNs such as a
        work laptop&apos;s access client can override your routes entirely.
        On a managed PC, ask IT before installing anything. More on
        conflicting software is in{" "}
        <Link href="/guides/vpn-connected-but-no-internet#check-5">
          another VPN, proxy or security app
        </Link>
        .
      </p>

      <h2 id="leftover-proxy" style={ANCHOR}>
        The leftover-proxy trap
      </h2>
      <p>
        In system proxy mode, Windows is told to send web traffic to a proxy
        on your own PC. If the client crashes, or is killed in Task Manager,
        that setting can survive the app. Windows keeps pointing browsers at
        a proxy that no longer exists, and nothing loads, even with the VPN
        off. The fix takes a minute:
      </p>
      <ol>
        <li>
          Open Settings, Network &amp; internet, Proxy.
        </li>
        <li>
          Under Manual proxy setup, open the <strong>Use a proxy
          server</strong> entry and switch it off. On Windows 11 it sits
          behind a Set up or Edit button; save afterwards. On Windows 10 it
          is a toggle on the same page.
        </li>
        <li>Reload the page in your browser.</li>
      </ol>
      <p>
        Recent Happ versions clear their own leftover proxy on startup, so
        opening Happ and disconnecting cleanly also fixes it. To prevent it,
        disconnect or quit from Happ&apos;s window or tray menu instead of
        ending the process.
      </p>

      <h2>Kill switch on Windows</h2>
      <p>
        A kill switch blocks all traffic when the tunnel drops, so nothing
        leaks through your normal connection during the gap. Android has one
        built into the system. Windows has no single switch that does this
        for an app like Happ, so on Windows it depends on the client. As of
        September 2026, Happ&apos;s documentation and desktop release notes
        do not describe a kill switch, so do not assume one.
        INCY&apos;s desktop readme lists a kill switch, but INCY labels its
        desktop client pre-alpha. The{" "}
        <Link href="/guides/vpn-leak-test">leak test guide</Link> shows how
        to check what your client actually does when the tunnel drops.
      </p>

      <h2>Verify</h2>
      <p>
        Connect, then check four things: your public IP matches the location
        you picked, DNS is not answered by your provider, IPv6 does not show
        your real address, and WebRTC in the browser does not reveal it
        either. WebRTC matters most in system proxy mode. The{" "}
        <Link href="/guides/vpn-leak-test">VPN leak test</Link> covers each
        check. If you are curious why VLESS is used here instead of
        WireGuard or OpenVPN, see{" "}
        <Link href="/guides/wireguard-vs-openvpn-vs-vless">
          the protocol comparison
        </Link>
        .
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
              <td>A game or launcher ignores the VPN</td>
              <td>System proxy mode; the app does not use proxy settings</td>
              <td>Switch to TUN</td>
            </tr>
            <tr>
              <td>No internet after closing or crashing the app</td>
              <td>Leftover system proxy setting</td>
              <td>
                Switch off Use a proxy server, or open Happ and disconnect
                cleanly
              </td>
            </tr>
            <tr>
              <td>The only entry is &quot;One device per link - kovravpn.com&quot;</td>
              <td>The link is bound to another device</td>
              <td>
                Reset device binding on the card and refresh here, or use a
                separate link for this PC
              </td>
            </tr>
            <tr>
              <td>The only entry is &quot;No active plan - kovravpn.com&quot;</td>
              <td>The plan has ended</td>
              <td>Renew; the list returns on the next refresh</td>
            </tr>
            <tr>
              <td>TUN will not start</td>
              <td>Often Happ&apos;s background service is not running</td>
              <td>Use Happ&apos;s service reset or reinstall as administrator</td>
            </tr>
            <tr>
              <td>Connected, but nothing loads</td>
              <td>DNS, clock, network filtering or another client</td>
              <td>
                Work through{" "}
                <Link href="/guides/vpn-connected-but-no-internet">
                  connected but no internet
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The placeholder entries ending in &quot;kovravpn.com&quot; point to a
        dummy local address. Connecting to one gives no internet by design,
        so switch to a real location once the cause is fixed.
      </p>
    </GuideArticle>
  );
}

// src/app/guides/vpn-not-working-on-hotel-wifi/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata, SITE_URL } from "@/lib/guides";
import { buildHowToSchema, jsonLd } from "@/lib/structured-data";

const SLUG = "vpn-not-working-on-hotel-wifi";
const OG = ogImageUrl("VPN on Hotel Wi-Fi", "Getting past the login page");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

/**
 * HowTo schema for the portal-first sequence. The steps are the same six
 * the page shows in its ordered list; keep them in sync, since schema that
 * does not match visible content is a policy violation.
 */
const HOW_TO = buildHowToSchema({
  name: "Get a VPN working on hotel or airport Wi-Fi",
  description:
    "Pause the VPN, complete the network's login page, confirm the connection works, then reconnect the VPN.",
  url: `${SITE_URL}/guides/${SLUG}`,
  totalTime: "PT3M",
  steps: [
    {
      name: "Pause the VPN",
      text: "Disconnect or pause the VPN, and temporarily turn off any setting that blocks traffic when the VPN is down.",
    },
    {
      name: "Join the network and wait",
      text: "Join the Wi-Fi network and give the device a few seconds to show its sign-in page.",
    },
    {
      name: "Open the login page yourself if it does not appear",
      text: "Open a browser and go to http://neverssl.com or http://captive.apple.com. These plain-HTTP pages exist so that a login page can intercept them.",
    },
    {
      name: "Complete the login",
      text: "Enter what the page asks for, such as a room number, surname or voucher code, and accept the terms.",
    },
    {
      name: "Confirm the connection is real",
      text: "Load an ordinary website you have not opened recently. If it loads, the network is letting your traffic out.",
    },
    {
      name: "Reconnect the VPN",
      text: "Turn the VPN back on, re-enable any blocking setting you paused, and refresh the subscription if the app asks.",
    },
  ],
});

const FAQ: FaqItem[] = [
  {
    q: "Why doesn't the hotel Wi-Fi login page appear when my VPN is on?",
    a: "The login page works by intercepting your first unencrypted web request. A VPN sends that request into an encrypted tunnel instead, and the tunnel cannot open until you have logged in. Pause the VPN, open http://neverssl.com to bring up the login page, finish it, then reconnect.",
  },
  {
    q: "Is it safe to disconnect the VPN to log in?",
    a: "The risk during that minute is usually small, because most apps and sites use HTTPS, so their contents stay encrypted without the VPN. Reconnect as soon as the network lets you out. What an open network can still see, and what to avoid while the tunnel is down, is covered in the public Wi-Fi security guide.",
  },
  {
    q: "Why does my VPN work in the lobby but not in my room?",
    a: "Rooms are often served by different access points, sometimes on a separate network with its own rules and limits. A weak signal causes packet loss, which makes any tunnel feel broken. Moving between access points can also end your login session. Log in again from the room, move closer to the access point, or ask for a room with better coverage.",
  },
  {
    q: "Will a VPN work on airplane Wi-Fi?",
    a: "On a paid browsing tier it often can, though an airline's terms may restrict VPNs. Free messaging-only tiers allow a few specific apps and block everything else, including VPNs. Satellite links add latency, so expect slower page loads than on the ground.",
  },
  {
    q: "Why does the hotel keep asking me to log in again?",
    a: "Portals usually remember devices by their Wi-Fi hardware address, and modern phones and laptops use a private address that can change. Sessions also expire after a set time. If a changing address is the cause, setting the private address to fixed for that one network stops the repeated logins; an expired session still needs a new login.",
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
        The pattern is familiar. You join the hotel Wi-Fi, the VPN spins on
        &quot;connecting&quot;, and nothing loads. Often the VPN is not
        being blocked at all. The network simply has not let you out yet,
        and the VPN is hiding the page that would. Here is what is
        going on and the order in which to fix it.
      </p>

      <h2>Why these networks break VPNs</h2>
      <h3>Captive portals</h3>
      <p>
        A captive portal holds every new device at a login or terms page
        until you complete it. Your phone or laptop detects this by
        requesting a known plain-HTTP address from Apple, Google or
        Microsoft and checking whether the answer has been tampered with.
        If it has, the system opens the sign-in sheet. Depending on the
        system and the app, a VPN that captures all traffic can send that
        check, or the login page itself, into a tunnel which cannot open,
        so the sheet never appears or never loads.
      </p>
      <h3>DNS interception</h3>
      <p>
        Many portals answer every DNS lookup with their own address until
        you log in. Encrypted DNS can bypass that trick. Examples include
        Android&apos;s Private DNS set to a specific provider, secure DNS in
        Chrome and DNS over HTTPS in Firefox. Android and the browsers try
        to detect portals and step aside, but when that fails, the redirect
        never happens.
      </p>
      <h3>Port and UDP restrictions</h3>
      <p>
        Guest networks are often configured for web browsing and little
        else. Some block UDP apart from DNS, and some allow only a handful
        of ports. Both break common VPN setups even after you have logged
        in.
      </p>
      <h3>Client isolation and time limits</h3>
      <p>
        Client isolation stops guests from seeing each other&apos;s devices.
        That is good for security, but it is why casting to the room TV can
        fail, and it is not a VPN problem. Sessions are often time-limited
        or capped per room. When a session expires mid-stay, the portal
        silently returns and the VPN looks as if it has died.
      </p>

      <h2>The portal-first sequence</h2>
      <ol>
        <li>
          <strong>Pause the VPN.</strong> Disconnect or pause it, and
          temporarily turn off any setting that blocks traffic when the VPN
          is down (see the next section).
        </li>
        <li>
          <strong>Join the network and wait</strong> a few seconds for the
          sign-in page.
        </li>
        <li>
          <strong>If nothing appears, open the page yourself.</strong> In a
          browser, go to <code>http://neverssl.com</code> or{" "}
          <code>http://captive.apple.com</code>. Both are deliberately
          plain HTTP, so the portal can intercept them. An HTTPS site cannot
          be redirected without a certificate warning.
        </li>
        <li>
          <strong>Complete the login.</strong> Enter the room number,
          surname or voucher code, and accept the terms. Enter no more than
          the portal genuinely needs.
        </li>
        <li>
          <strong>Confirm the connection is real.</strong> Load an ordinary
          website you have not opened recently. If it loads, the network is
          letting you out.
        </li>
        <li>
          <strong>Reconnect the VPN.</strong> Re-enable any blocking setting
          you paused, and refresh the subscription if the app asks.
        </li>
      </ol>
      <p>
        Order matters for that last step. A subscription refresh sent while
        you are still behind the portal cannot reach the server. Happ, for
        example, documents a &quot;Timeout while adding a subscription&quot;
        error when the subscription server does not answer within nine
        seconds. Finish the login first, then retry.
      </p>

      <h2>When your own settings keep the login page away</h2>
      <h3>Android: Always-on VPN</h3>
      <p>
        Android can keep a VPN permanently on and block all traffic when it
        is down. On stock Android, both switches are under Settings, Network
        &amp; internet, VPN, then the gear icon next to the app: Always-on
        VPN and Block connections without VPN. Other manufacturers put the
        VPN screen elsewhere, and Samsung, for example, puts it under
        Connections. With blocking on, the phone may be unable to reach the
        portal until the VPN is up, and the VPN cannot come up until the
        portal is done. Turn off blocking for the login, then turn it back on. The
        rest of the Android setup is in the{" "}
        <Link href="/guides/how-to-set-up-vpn-on-android#always-on">
          Android setup guide
        </Link>
        .
      </p>
      <h3>iPhone and iPad: Connect On Demand</h3>
      <p>
        Some iOS VPN apps ask the system to reconnect automatically. For
        configurations that use it, iOS shows a Connect On Demand switch on
        the VPN&apos;s info screen under Settings, General, VPN &amp; Device
        Management, VPN. Other apps keep an auto-connect option in their own
        settings. Switch it off, log in, then switch it back on.
      </p>
      <h3>Desktop: full-traffic modes and kill switches</h3>
      <p>
        Desktop clients that capture all system traffic, often called TUN
        mode, and kill switches that block traffic outside the tunnel both
        stop the portal check. The names differ between apps and versions,
        so look in your client&apos;s current settings rather than for a
        specific label. Pause the mode, log in, and resume.
      </p>
      <h3>Encrypted DNS</h3>
      <p>
        If the page still refuses to appear with the VPN off, set
        Android&apos;s Private DNS to Automatic and switch off secure DNS in
        your browser for the login, then restore them.
      </p>

      <h2>Private Wi-Fi addresses: why you keep logging in again</h2>
      <p>
        Portals usually remember a device by its Wi-Fi hardware (MAC)
        address. Modern systems use a private address per network, and
        some rotate it. Each new address looks like a new guest.
      </p>
      <ul>
        <li>
          <strong>iPhone and iPad (iOS 18 and later):</strong> Settings,
          Wi-Fi, the info button next to the network, then Private Wi-Fi
          Address: Off, Fixed or Rotating. Apple says devices choose
          Rotating by default on open and weakly secured networks, which
          includes most portals. Choose Fixed for a hotel you are staying
          at. On a Mac with macOS Sequoia or later, the same menu is under
          System Settings, Wi-Fi, Details.
        </li>
        <li>
          <strong>Android:</strong> open the network&apos;s settings and
          look for Privacy, with the options Use randomized MAC and Use
          device MAC. Samsung calls it MAC address type. Android normally
          keeps one random address per network, so it is a less frequent
          cause of repeated logins.
        </li>
        <li>
          <strong>Windows 11:</strong> in the network&apos;s properties
          under Settings, Network &amp; internet, Wi-Fi, find Random
          hardware address. Wording varies slightly between Windows builds.
          The Change daily option means a new login every day, so set it to
          On or Off for that network instead.
        </li>
      </ul>
      <p>
        A fixed address lets that one network recognise you across visits.
        At a hotel that already has your name, it costs little.
      </p>

      <h2>Networks that block UDP or unusual ports</h2>
      <p>
        WireGuard runs only over UDP, and OpenVPN usually defaults to it.
        On a network that drops UDP, the handshake never completes. The app
        sits on &quot;connecting&quot;, or it connects and then passes no
        traffic. Switching to a TCP-based option often helps: OpenVPN over
        TCP, or protocols built on TCP such as VLESS. The trade-offs are in{" "}
        <Link href="/guides/wireguard-vs-openvpn-vs-vless">
          the protocol comparison
        </Link>
        .
      </p>
      <p>
        Kovra, the service that publishes this guide, runs VLESS with
        REALITY over TCP on every location, so it does not depend on UDP.
        That is a property, not a promise. A network that allows only a few
        ports, or filters by destination, can still stop any VPN. If only
        web ports are open, ask your provider which ports its servers use.
      </p>

      <h2>In-flight Wi-Fi</h2>
      <ul>
        <li>
          <strong>Messaging-only tiers</strong> recognise a few specific
          apps and block everything else. A VPN hides which app the traffic
          belongs to, so it is blocked. You need a browsing tier.
        </li>
        <li>
          <strong>Browsing tiers</strong> often let VPNs connect. An
          airline&apos;s terms may restrict them, and streaming may be
          throttled either way.
        </li>
        <li>
          <strong>Satellite latency is physical.</strong> Links through
          geostationary satellites add several hundred milliseconds per round
          trip before the VPN adds its own share. Newer low-orbit services
          are much faster. Keep expectations for calls and gaming low.
        </li>
        <li>
          <strong>The portal rules still apply.</strong> Airline portals
          behave like hotel ones, so the same sequence works.
        </li>
      </ul>

      <h2>Quick diagnosis</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Symptom</th>
              <th>Likely cause</th>
              <th>What to do</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>No login page, nothing loads</td>
              <td>VPN or encrypted DNS hiding the portal</td>
              <td>Pause both, open neverssl.com</td>
            </tr>
            <tr>
              <td>Login page loops or reappears daily</td>
              <td>Session limit, or a changing private Wi-Fi address</td>
              <td>Log in again; set a fixed address for this network</td>
            </tr>
            <tr>
              <td>Logged in, VPN never connects</td>
              <td>UDP or ports blocked</td>
              <td>Try a TCP-based protocol or another location</td>
            </tr>
            <tr>
              <td>VPN connected, no pages load</td>
              <td>Session expired, or DNS inside the tunnel</td>
              <td>
                Re-check the portal, then see{" "}
                <Link href="/guides/vpn-connected-but-no-internet">
                  connected but no internet
                </Link>
              </td>
            </tr>
            <tr>
              <td>Works in the lobby, not the room</td>
              <td>Weak signal or a different access point</td>
              <td>Log in again from the room, or use a hotspot</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>When nothing works</h2>
      <ul>
        <li>
          <strong>Use a phone hotspot or roaming data.</strong> It bypasses
          the venue network entirely, and it is usually the fastest fix.
        </li>
        <li>
          <strong>Forget the network and join it again.</strong> This often
          gets you a fresh session and a fresh portal.
        </li>
        <li>
          <strong>Try another VPN location.</strong> Some networks block
          specific destinations rather than VPNs in general.
        </li>
        <li>
          <strong>Check the date and time.</strong> If the clock is far
          off, HTTPS certificate checks fail, including the app&apos;s
          subscription refresh. Set both to automatic.
        </li>
        <li>
          <strong>Ask the front desk.</strong> Some hotels run a separate
          business or premium network, or a wired port, with fewer
          restrictions.
        </li>
        <li>
          <strong>Try again later.</strong> Congestion and portal behaviour
          change through the day.
        </li>
      </ul>
      <p>
        Some countries add national blocking on top of venue rules. If you
        are travelling to one, prepare before you leave, as described in the
        guides to{" "}
        <Link href="/guides/vpn-in-turkey">using a VPN in Turkey</Link> and{" "}
        <Link href="/guides/vpn-that-works-in-china">
          what still works in China
        </Link>
        .
      </p>

      <h2>Once you are online</h2>
      <p>
        Getting connected is half the job. What an open network can still
        see, and which settings close those gaps, is covered in{" "}
        <Link href="/guides/vpn-for-public-wifi">public Wi-Fi security</Link>
        . Run the{" "}
        <Link href="/guides/vpn-leak-test">leak test</Link> once on a new
        network to confirm that DNS goes through the tunnel as well.
      </p>
    </GuideArticle>
  );
}

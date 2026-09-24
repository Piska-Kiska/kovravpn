// src/app/guides/vpn-connected-but-no-internet/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "vpn-connected-but-no-internet";
const OG = ogImageUrl(
  "Connected, but No Internet",
  "Seven checks, in the right order",
);

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

/** Keeps in-page anchors clear of the sticky guides header. */
const ANCHOR = { scrollMarginTop: 88 } as const;

/** Two-column tables fit a phone screen without sideways scrolling. */
const FIT = { minWidth: 0 } as const;

const FAQ: FaqItem[] = [
  {
    q: "Why does my VPN say connected when nothing loads?",
    a: "Because 'connected' only means the app built the tunnel on your device. It does not confirm that the server answered, that the entry is a real server, or that your network lets the traffic through. Check the entry's name first, then refresh the subscription, switch location and network, and check your clock and DNS.",
  },
  {
    q: "Does resetting the device binding help?",
    a: "Only when the entry you see is 'One device per link - kovravpn.com'. In that case reset the binding in the dashboard and refresh the subscription on this device straight away. For every other cause a reset changes nothing, and it lets whichever device refreshes next claim the link.",
  },
  {
    q: "Will reinstalling the VPN app help?",
    a: "Rarely on its own. It helps when settings were changed by hand, because a reinstall returns them to defaults. After reinstalling, import your link again. If the app then shows 'One device per link', the device identifier may have changed, so reset the binding in the dashboard and refresh.",
  },
  {
    q: "Why does the VPN work on mobile data but not on Wi-Fi?",
    a: "The Wi-Fi network is the difference. Often it is a login page that the VPN hides: disconnect, open neverssl.com to bring the page up, sign in and reconnect. If there is no login page, the network may be filtering VPN-like traffic, and mobile data or another network is the practical way round it.",
  },
  {
    q: "Should I change the SNI, fingerprint or Mux settings to fix it?",
    a: "No. In a REALITY profile the SNI, keys and flow have to match the server, Mux is known to break connections that use the Vision flow, and the provider has already chosen the fingerprint. Changing these values usually turns a working profile into one that connects and carries nothing. If you already edited settings, delete the subscription from the app and import the link again.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        &quot;Connected&quot; in a VPN app means one thing: the app has built
        the tunnel on your device. It does not mean the server at the other
        end answered, that the entry you picked is a real server, or that your
        network lets the traffic through. A green button with nothing loading
        is therefore common, and it usually has an ordinary cause. Work
        through the checks below in order. The first two take about a minute
        and rule out the causes on the account side.
      </p>

      <h2 id="triage" style={ANCHOR}>
        Find your symptom
      </h2>
      <div className="gd-table-scroll">
        <table style={FIT}>
          <thead>
            <tr>
              <th>What you see</th>
              <th>Likely cause</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                The location name is a sentence, such as &quot;No active
                plan&quot;
              </td>
              <td>
                An account notice, not a server.{" "}
                <a href="#check-1">Check 1 →</a>
              </td>
            </tr>
            <tr>
              <td>Nothing loads on any location, on any network</td>
              <td>
                A stale list, a wrong clock, another VPN app or a DNS setting.{" "}
                <a href="#check-2">Checks 2</a>, <a href="#check-4">4</a>,{" "}
                <a href="#check-5">5</a>, <a href="#check-6">6 →</a>
              </td>
            </tr>
            <tr>
              <td>One location fails, others work</td>
              <td>
                That location is down or filtered from where you are.{" "}
                <a href="#check-3">Check 3 →</a>
              </td>
            </tr>
            <tr>
              <td>Works on mobile data, not on this Wi-Fi</td>
              <td>
                A login page, or a network that filters.{" "}
                <a href="#check-7">Check 7 →</a>
              </td>
            </tr>
            <tr>
              <td>It worked until you changed a setting</td>
              <td>
                An edited profile.{" "}
                <a href="#dont-edit">Don&apos;t edit →</a>
              </td>
            </tr>
            <tr>
              <td>Pages load, but slowly or behind CAPTCHAs</td>
              <td>
                Distance, Wi-Fi quality, shared addresses.{" "}
                <a href="#slow">Slow or CAPTCHAs →</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="check-1" style={ANCHOR}>
        Check 1: are you connected to a real location?
      </h2>
      <p>
        Read the name of the entry you are connected to. Kovra, like many
        providers, delivers account notices as entries in the server list,
        because a server entry is the one thing every VPN app can display.
        These entries point nowhere on purpose, so the app reports
        &quot;connected&quot; and nothing loads. On Kovra this is the first
        thing to rule out.
      </p>
      <ul>
        <li>
          <strong>No active plan - kovravpn.com.</strong> The account has no
          active plan. Renew in the <a href="/dashboard">dashboard</a>, then
          refresh the subscription (check 2).
        </li>
        <li>
          <strong>One device per link - kovravpn.com.</strong> This link
          belongs to another device. Use this device&apos;s own link, or press{" "}
          <strong>Reset device binding</strong> in the dashboard and refresh
          here straight away.
        </li>
        <li>
          <strong>Subscription removed - kovravpn.com.</strong> This device was
          deleted in the dashboard. Add the device again and import its new
          link.
        </li>
      </ul>
      <p>
        Happ also shows the matching message in a red info block. How these
        entries work, and why each device has its own link, is explained in{" "}
        <Link href="/guides/vpn-subscription-link-explained">
          what a subscription link is
        </Link>
        .
      </p>

      <h2 id="check-2" style={ANCHOR}>
        Check 2: refresh the subscription
      </h2>
      <p>
        The app works from the last copy of the server list it downloaded. If
        a location was replaced, or you renewed your plan since then, the old
        copy is wrong until the next refresh. Kovra asks apps to refresh every
        hour, but you do not have to wait: use the refresh control next to the
        subscription&apos;s name (a circular-arrow icon in Happ; its place
        varies by app and version), then reconnect.
      </p>
      <p>
        If the refresh fails, read the error. Happ reports{" "}
        <em>Timeout while adding a subscription</em> when the subscription
        server does not answer within nine seconds. That means the list could
        not be downloaded from this network, which makes it a network
        question rather than an account one. Try again on mobile data or
        another Wi-Fi. The locations already in the app normally stay there
        in the meantime.
      </p>

      <h2 id="check-3" style={ANCHOR}>
        Check 3: switch location, then switch network
      </h2>
      <p>
        Two quick swaps separate a server problem from a network problem.
        First connect to a different location. If nothing works, switch
        between Wi-Fi and mobile data and try again.
      </p>
      <div className="gd-table-scroll">
        <table style={FIT}>
          <thead>
            <tr>
              <th>Result</th>
              <th>What it tells you</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Another location works</td>
              <td>
                The first location is down or filtered from where you are. Use
                another one for now and tell support which one failed.
              </td>
            </tr>
            <tr>
              <td>No location works on Wi-Fi, all work on mobile data</td>
              <td>
                The Wi-Fi network is the problem: a login page or a filter (
                <a href="#check-7">check 7</a>).
              </td>
            </tr>
            <tr>
              <td>Nothing works anywhere</td>
              <td>
                The cause is on the device or the account: checks{" "}
                <a href="#check-1">1</a>, <a href="#check-4">4</a>,{" "}
                <a href="#check-5">5</a> and <a href="#check-6">6</a>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Switching location is also the quickest workaround while you look
        for the cause. All nine Kovra locations run VLESS with REALITY over
        TCP, so a different location means a different server, not a
        different protocol.
      </p>

      <h2 id="check-4" style={ANCHOR}>
        Check 4: date, time and time zone
      </h2>
      <p>
        A device clock that is far off breaks HTTPS certificate checks. That
        alone is enough to break the subscription refresh and many apps and
        websites, even while the tunnel is up. Set the date, time and time
        zone to automatic:
      </p>
      <div className="gd-table-scroll">
        <table style={FIT}>
          <thead>
            <tr>
              <th>Device</th>
              <th>Where to find it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>iPhone, iPad</td>
              <td>Settings → General → Date &amp; Time → Set Automatically</td>
            </tr>
            <tr>
              <td>Android</td>
              <td>
                Settings → System → Date &amp; time on most phones; Samsung
                keeps it under General management. Turn on automatic time and
                time zone.
              </td>
            </tr>
            <tr>
              <td>Windows</td>
              <td>
                Settings → Time &amp; language → Date &amp; time → Set time
                automatically
              </td>
            </tr>
            <tr>
              <td>Mac</td>
              <td>
                System Settings → General → Date &amp; Time → Set time and date
                automatically
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>After fixing the clock, refresh the subscription and reconnect.</p>

      <h2 id="check-5" style={ANCHOR}>
        Check 5: another VPN, proxy or security app
      </h2>
      <p>
        Two tunnels on one device fight over the same traffic. Phones allow
        only one active VPN at a time, and apps that are not called
        &quot;VPN&quot; often take that slot: ad blockers, firewall apps,
        parental controls and some antivirus suites. Close or pause them and
        reconnect.
      </p>
      <ul>
        <li>
          <strong>Android always-on VPN.</strong> If another app is set as the
          always-on VPN, Android keeps handing it the slot. Look under
          Settings → Network &amp; internet → VPN (the path differs by
          manufacturer), open the gear next to other apps and turn always-on
          off for them.
        </li>
        <li>
          <strong>Other VPN configurations on iPhone.</strong> Settings →
          General → VPN &amp; Device Management → VPN lists every VPN
          configuration installed on the phone. Only one can be active, so
          check that the selected one belongs to the app you are testing.
        </li>
        <li>
          <strong>Antivirus web shields.</strong> Features called web
          protection, HTTPS scanning or secure DNS intercept connections and
          can break VPN traffic. Pause them to test.
        </li>
        <li>
          <strong>The leftover proxy on Windows.</strong> When a proxy app is
          closed uncleanly, Windows can keep sending browser traffic to a local
          proxy that no longer exists, so nothing loads whether the VPN is on
          or off. With every VPN and proxy app closed, open Settings → Network
          &amp; internet → Proxy and, under manual proxy setup, turn off a
          proxy server that is still switched on (it often points to{" "}
          <code>127.0.0.1</code>).
        </li>
        <li>
          <strong>Work or school management.</strong> A managed device can
          force its own VPN or DNS settings. A personal VPN cannot override
          them.
        </li>
      </ul>

      <h2 id="check-6" style={ANCHOR}>
        Check 6: DNS and IPv6
      </h2>
      <p>
        If the tunnel is up but websites fail by name, DNS is the usual
        suspect. Put the settings back to their defaults:
      </p>
      <ul>
        <li>
          <strong>Private DNS on Android.</strong> Settings → Network &amp;
          internet → Private DNS (on Samsung: Connections → More connection
          settings). If it is set to a specific provider hostname, switch it
          to Automatic while testing. A DNS server that cannot be reached from
          your network breaks every lookup.
        </li>
        <li>
          <strong>Custom DNS inside the VPN app.</strong> If you typed DNS
          servers into the client&apos;s settings, clear them. The imported
          profile works with the app&apos;s defaults.
        </li>
        <li>
          <strong>DNS profiles on iPhone.</strong> An installed DNS app or
          configuration profile can take over name resolution. Check Settings
          → General → VPN &amp; Device Management and disable it while
          testing.
        </li>
        <li>
          <strong>IPv6 options.</strong> If you switched on IPv6-related
          options in the app, return them to their defaults.
        </li>
      </ul>
      <p>
        Once pages load, confirm that nothing escapes the tunnel with the{" "}
        <Link href="/guides/vpn-leak-test">VPN leak test</Link>.
      </p>

      <h2 id="check-7" style={ANCHOR}>
        Check 7: a login page, or a network that filters
      </h2>
      <p>
        Hotel, airport, train and café Wi-Fi often holds all traffic until
        you accept terms on a login page, known as a captive portal. With the
        VPN on, that page often fails to appear, so the network quietly drops
        everything. Disconnect the VPN, open a plain-HTTP page such as{" "}
        <a href="http://neverssl.com" rel="nofollow">
          neverssl.com
        </a>{" "}
        or captive.apple.com to bring the login page up, sign in, then
        reconnect. The full routine is in{" "}
        <Link href="/guides/vpn-not-working-on-hotel-wifi">
          VPN not working on hotel Wi-Fi
        </Link>
        .
      </p>
      <p>
        Other networks filter on purpose. Workplaces, schools and some national
        networks block traffic that looks like a VPN, and they change their
        rules without notice. REALITY is built to resemble an ordinary HTTPS
        connection, but no protocol is certain to pass every filter, and
        nobody can honestly promise that one will. If a network blocks you
        while mobile data works, the network is the cause. Where a country
        restricts VPN use, check the local rules before trying to get around
        a block.
      </p>

      <h2 id="dont-edit" style={ANCHOR}>
        Don&apos;t edit the imported profile
      </h2>
      <p>
        Forum threads about this problem are full of advice to switch on Mux,
        change the SNI, pick another fingerprint or remove the flow. In a
        REALITY profile the SNI, keys and flow have to match what the server
        expects, and Mux is known to break connections that use the Vision
        flow. Your provider has already set these values, and changing them
        usually turns a working profile into one that connects and carries
        nothing. Kovra&apos;s subscription asks Happ to hide the server
        settings, so this mostly concerns other apps.
      </p>
      <p>
        If you have already changed settings, don&apos;t undo them one by one.
        Delete the subscription from the app and import your link again from
        the dashboard. On Kovra, re-importing on the same device does not
        affect the device binding.
      </p>

      <h2 id="slow" style={ANCHOR}>
        Connected, but slow or full of CAPTCHAs
      </h2>
      <p>If pages load but badly, the causes are different:</p>
      <ul>
        <li>
          <strong>CAPTCHAs.</strong> VPN servers live in datacentres, and many
          users share each address. Some sites treat shared datacentre
          addresses with suspicion and ask for more CAPTCHAs. Switching
          location sometimes helps. This is a trait of VPNs in general, not a
          fault in your setup.
        </li>
        <li>
          <strong>Distance.</strong> Every request travels to the server and
          back, so a nearby location is usually faster than a distant one.
        </li>
        <li>
          <strong>Wi-Fi quality.</strong> A weak signal or a crowded network
          slows everything, tunnel or not. Compare with the VPN off on the
          same network.
        </li>
        <li>
          <strong>Fair use.</strong> Kovra&apos;s{" "}
          <Link href="/terms">Terms</Link> (section 8) allow a temporary speed
          limit or a paused connection for atypical load, which they describe
          as including sustained
          maximum-speed use, large-volume peer-to-peer traffic, signs of
          reselling and automated connections. If you run long full-speed
          transfers or heavy peer-to-peer traffic, that clause can apply.
        </li>
      </ul>

      <h2 id="support" style={ANCHOR}>
        What to send support
      </h2>
      <p>
        If the checks don&apos;t solve it, a precise report gets a precise
        answer. Write to{" "}
        <a href="https://t.me/KovraVPN_bot">@KovraVPN_bot</a> on Telegram or{" "}
        <a href="mailto:support@kovravpn.com">support@kovravpn.com</a> with:
      </p>
      <ul>
        <li>
          Your device and app, with versions if you can see them (for example
          &quot;Android 14, Happ&quot;).
        </li>
        <li>The exact name of the location you connected to.</li>
        <li>
          The network: Wi-Fi or mobile data, and which country you are in.
        </li>
        <li>What you have already tried from this list.</li>
        <li>
          A screenshot of any error, with the subscription link cropped out.
        </li>
      </ul>
      <p>
        Support finds your account from your Telegram or email. Share the link
        itself only inside the private support chat, never in a public group
        or comment thread. If the problem started right after a payment, the{" "}
        <Link href="/guides/crypto-payment-not-credited">
          crypto payment troubleshooting guide
        </Link>{" "}
        may be the faster route.
      </p>
    </GuideArticle>
  );
}

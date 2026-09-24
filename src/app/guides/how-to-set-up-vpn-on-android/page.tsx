// src/app/guides/how-to-set-up-vpn-on-android/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata, SITE_URL } from "@/lib/guides";
import { buildHowToSchema, jsonLd } from "@/lib/structured-data";

const SLUG = "how-to-set-up-vpn-on-android";
const OG = ogImageUrl("VPN on Android", "Happ, Always-on, no surprises");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

/** Anchored headings clear the sticky header when jumped to. */
const ANCHOR = { scrollMarginTop: 88 } as const;

/**
 * HowTo schema. The six steps mirror the six "Step N" headings on the page
 * word for word in intent: schema that describes steps the page does not
 * show is a structured-data policy violation.
 */
const HOW_TO = buildHowToSchema({
  name: "Set up a VPN on Android",
  description:
    "Import a VLESS subscription into Happ on Android, accept the system VPN request, turn on Always-on VPN and stop Android from closing the tunnel.",
  url: `${SITE_URL}/guides/${SLUG}`,
  totalTime: "PT5M",
  steps: [
    {
      name: "Get a link for this phone",
      text: "In your VPN provider's dashboard, create a device of the Android type and copy its subscription link or open its QR code. On Kovra, each link works on one device.",
    },
    {
      name: "Install a client",
      text: "Install Happ from Google Play (package com.happproxy). INCY also imports subscription links. Avoid APK mirror sites.",
    },
    {
      name: "Import the subscription",
      text: "In Happ, tap the plus button and paste the link from the clipboard, or scan its QR code. The list of locations appears.",
    },
    {
      name: "Accept Android's VPN request",
      text: "Pick a location and connect. Android asks once whether the app may set up a VPN connection. Tap OK, and a key icon appears in the status bar.",
    },
    {
      name: "Turn on Always-on VPN",
      text: "In Android Settings, open the VPN screen, tap the gear next to the app, and turn on Always-on VPN and Block connections without VPN.",
    },
    {
      name: "Stop Android from closing the tunnel",
      text: "Set the app's battery usage to Unrestricted, set Private DNS to Automatic, and allow the app unrestricted data under Data Saver.",
    },
  ],
});

const FAQ: FaqItem[] = [
  {
    q: "Can I use my phone's VPN link on my tablet too?",
    a: "Not on Kovra. Each subscription link is bound to the first device that opens it, and any other device receives a single 'One device per link' entry instead of locations. Add a second device in the dashboard for the tablet. The 3-device plan includes three slots, and an extra slot on any plan costs $5 for 30 days.",
  },
  {
    q: "Does Always-on VPN drain the battery?",
    a: "The setting itself only tells Android to start the VPN at boot and restart it if it stops. The battery cost comes from keeping the tunnel connected all day, which is the point of the setting. If you already leave the VPN on, Always-on adds little beyond making the restarts automatic.",
  },
  {
    q: "Do I need to root my phone to use a VPN on Android?",
    a: "No. Android has a built-in VPN interface for apps, called VpnService, which is what Happ, INCY and every other VPN app use. Root is not needed for the tunnel, Always-on VPN, or per-app routing.",
  },
  {
    q: "Can I use INCY instead of Happ on Android?",
    a: "Yes. INCY is on Google Play and reads the same subscription link. Kovra's dashboard buttons and support instructions are written for Happ, so expect menu names in this guide to differ in INCY. If you switch apps on the same phone and see 'One device per link', press Reset device binding in the dashboard and refresh the subscription in the new app.",
  },
  {
    q: "Why does my banking app complain when the VPN is on?",
    a: "Two common reasons. The bank's fraud checks may dislike a connection that exits in another country, or the app may refuse to run while any VPN is active on the phone. Excluding the app with per-app routing usually helps in the first case. For the second, pause the VPN while you use the app. An excluded app uses your normal connection and is not protected by the tunnel.",
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
        Android gives VPN apps more to work with than most systems: a proper
        VPN interface, a system-level kill switch, and the same app on
        phones and TVs. The import takes a minute. What usually goes wrong
        comes later, when power management or a network setting ends the
        tunnel without warning. This guide covers both parts.
      </p>
      <p>
        The worked example in Step 1 is Kovra, the service that publishes
        this guide. Every other step applies to any provider that gives you a
        VLESS subscription link. If you are new to subscription links,{" "}
        <Link href="/guides/vpn-subscription-link-explained">
          what a subscription link is
        </Link>{" "}
        takes three minutes to read.
      </p>

      <h2>What you need</h2>
      <ul>
        <li>
          <strong>Android 5.0 or newer.</strong> That is Happ&apos;s stated
          minimum. The Always-on VPN switch in Step 5 needs Android 7.0 or
          newer, and Block connections without VPN needs Android 8.0 or newer.
        </li>
        <li>
          <strong>An active plan with a free device slot.</strong> Each phone,
          tablet or TV uses one slot.
        </li>
        <li>
          <strong>A link created for this phone.</strong> Kovra binds each
          link to the first device that opens it, so a link already used on
          another device will not work here.
        </li>
      </ul>
      <p>
        VPN use is legal in most countries, but some restrict or ban it.
        Check the rules where you are before you rely on one.
      </p>

      <h2>Step 1: get the link for this phone</h2>
      <p>
        Sign in to your <a href="/dashboard">Kovra dashboard</a> and press{" "}
        <strong>Add device</strong> (it reads <strong>Connect</strong> if you
        have no devices yet), then pick <strong>Android</strong>. A new card
        named Android appears with the subscription link, a copy button, a QR
        code option and a <strong>Reset device binding</strong> button. The
        dashboard also offers a Happ download button for the device you just
        added.
      </p>
      <ul>
        <li>
          <strong>Dashboard open on the phone itself:</strong> tap the copy
          button next to the link.
        </li>
        <li>
          <strong>Dashboard open on a computer:</strong> show the QR code and
          scan it from the phone in Step 3.
        </li>
        <li>
          <strong>Link starts with kovravpn.com/p/:</strong> this is a
          one-tap import page, not a plain subscription address. Open it in
          the phone&apos;s browser, or scan its QR code with the phone&apos;s
          camera, and it hands the subscription to Happ once Happ is
          installed.
        </li>
      </ul>
      <p>
        Every device you add uses a slot. The 1-device plan has one, the
        3-device plan has three, and an extra slot costs $5 for 30 days on top
        of any plan. With another provider, copy whatever subscription link it
        gives you; the import works the same way.
      </p>

      <h2>Step 2: install a client</h2>
      <p>
        Install <strong>Happ - Proxy Utility</strong> from Google Play. Its
        package name is <code>com.happproxy</code>, which you can see in the
        Play Store web address, and the developer shown on the listing is
        HappDev. For phones without Google Play, Happ publishes APK files on
        its official GitHub page (Happ-proxy/happ-android). Use either of
        those two sources and nothing else.
      </p>
      <p>
        <strong>INCY</strong> (listed on Google Play as &quot;incy&quot;, by
        INCY-DEV, package <code>llc.itdev.incy</code>) reads the same
        subscription link and is a reasonable alternative. Menu names below
        are Happ&apos;s.
      </p>
      <p>
        Skip APK mirror sites, which can serve modified builds, and the Play
        Store&apos;s &quot;top free VPN&quot; chart, for the reasons in{" "}
        <Link href="/guides/are-free-vpns-safe">are free VPNs safe</Link>.
      </p>

      <h2>Step 3: import the subscription</h2>
      <ol>
        <li>Open Happ.</li>
        <li>
          Tap the <strong>+</strong> button and choose to paste from the
          clipboard, or choose the QR code option and point the camera at the
          code on your computer screen. Labels differ slightly between Happ
          versions.
        </li>
        <li>
          The subscription appears with one entry per location. Kovra&apos;s
          subscription asks Happ to refresh it every hour, so added or
          replaced locations arrive without re-importing anything. To refresh
          by hand, use the menu next to the subscription.
        </li>
      </ol>
      <p>
        If Happ shows &quot;Timeout while adding a subscription&quot;, the
        subscription server did not answer within nine seconds, which is
        Happ&apos;s documented limit. Try again, or switch between Wi-Fi and
        mobile data. The network you are on may be slow or filtering the
        request.
      </p>

      <h2>Step 4: accept Android&apos;s VPN request</h2>
      <p>
        Pick a location and tap the connect button. The first time, Android
        shows a system dialog asking whether Happ may set up a VPN
        connection. Tap <strong>OK</strong>. When the tunnel is up, a key
        icon appears in the status bar.
      </p>
      <p>
        Android runs only one VPN app at a time, so connecting Happ
        disconnects any other VPN app. If another app is set to Always-on
        VPN, switch that off first, or the two will fight over the tunnel.
      </p>

      <h2 id="always-on" style={ANCHOR}>
        Step 5: Always-on VPN and Block connections without VPN
      </h2>
      <p>
        These are Android system settings, not app features, so they work
        the same with any client:
      </p>
      <ul>
        <li>
          <strong>Always-on VPN</strong> starts the VPN when the phone boots
          and restarts it if it stops.
        </li>
        <li>
          <strong>Block connections without VPN</strong> drops all traffic
          while the tunnel is down. This is Android&apos;s own kill switch.
        </li>
      </ul>
      <p>
        On Pixel and phones with stock Android, open Settings, Network &amp;
        internet, VPN, and tap the gear icon next to Happ. On Samsung, the
        VPN screen is under Settings, Connections, More connection settings,
        VPN. Other manufacturers move it around, so search Settings for
        &quot;VPN&quot;. Turn on both switches. If they are greyed out, the
        app has opted out of Android&apos;s Always-on mode, which Android
        allows VPN apps to do.
      </p>
      <div className="gd-note">
        <strong>The trade-off:</strong> with blocking on, hotel, airport and
        train Wi-Fi login pages cannot load, because the phone cannot reach
        the login page until the VPN is up, and the VPN cannot come up until
        you have logged in. Turn blocking off, log in, then turn it back on.
        The same applies if your plan ends or the link stops working: with
        blocking on, the phone cannot reach anything, including your
        dashboard, until you switch blocking off. The full routine is in{" "}
        <Link href="/guides/vpn-not-working-on-hotel-wifi">
          VPN not working on hotel Wi-Fi
        </Link>
        .
      </div>

      <h2>Step 6: three settings that quietly kill the tunnel</h2>
      <h3>Battery optimisation and background limits</h3>
      <p>
        Android stops background apps to save power, and some manufacturers
        do it much harder than others. When the VPN app is stopped, the
        tunnel goes with it. Without blocking, traffic silently falls back to
        your normal connection. With blocking on, the phone simply has no
        internet. Exempt the app:
      </p>
      <ul>
        <li>
          <strong>Pixel and stock Android:</strong> Settings, Apps, Happ, App
          battery usage, <strong>Unrestricted</strong>.
        </li>
        <li>
          <strong>Samsung:</strong> the same path ends at Battery,{" "}
          <strong>Unrestricted</strong>. Also check that Happ is not in the
          sleeping or deep sleeping apps lists under Settings, Battery,
          Background usage limits.
        </li>
        <li>
          <strong>Xiaomi, OPPO, vivo, Huawei and others:</strong> look for
          autostart and battery saver settings on the app&apos;s info page.
          The names change with every system version, and the site
          dontkillmyapp.com keeps per-brand instructions.
        </li>
      </ul>

      <h3>Private DNS set to a custom hostname</h3>
      <p>
        Android&apos;s Private DNS setting has three positions: Off,
        Automatic, and a specific provider hostname. On Pixel it is under
        Settings, Network &amp; internet, Private DNS. On Samsung it is under
        Settings, Connections, More connection settings, Private DNS. A
        custom hostname makes Android insist on that DNS-over-TLS server. If
        it cannot be reached through the tunnel, apps cannot look up names:
        the key icon is on and nothing loads. Set it to{" "}
        <strong>Automatic</strong> while you test. The wider checklist is
        in{" "}
        <Link href="/guides/vpn-connected-but-no-internet">
          VPN connected but no internet
        </Link>
        .
      </p>

      <h3>Data Saver</h3>
      <p>
        With Data Saver on, apps in the background cannot use mobile data
        unless they are on the unrestricted list. On some phones a VPN app
        counts as a background app, and the result is a tunnel that works on
        Wi-Fi and stalls on mobile data. On Pixel, open Settings, Network &amp; internet, Data
        Saver, Unrestricted data, and switch Happ on. On Samsung, open
        Settings, Connections, Data usage, Data saver, and allow Happ to use
        data while Data saver is on. While you are there, check that the
        app&apos;s own Background data switch is on.
      </p>

      <h2>Optional: keep some apps outside the tunnel</h2>
      <p>
        Happ for Android has a <strong>Per App Proxy</strong> feature: pick
        the apps that use the tunnel, or invert the list to exclude them
        instead. It sits in Happ&apos;s settings, and its exact place has
        moved between versions. Typical uses are a banking app that rejects
        foreign connections or a local delivery or taxi app.
      </p>
      <p>
        Two things to know. An excluded app uses your normal connection and
        gets none of the tunnel&apos;s protection. And some apps check
        whether any VPN is active on the phone, and they complain whether or
        not you exclude them. Happ&apos;s release notes also say that
        private network addresses are excluded by default. Printers and
        casting targets on your home network therefore stay reachable with
        the VPN on.
      </p>

      <h2 id="tv" style={ANCHOR}>
        Android TV and Google TV
      </h2>
      <p>
        Happ&apos;s Android TV app is the same app, installed from the same
        Google Play listing. In the Kovra dashboard, add a device of the{" "}
        <strong>TV</strong> type, which means Android TV and Google TV. It
        gets its own link, separate from your phone&apos;s.
      </p>
      <p>
        Typing a long link with a remote is miserable, and a TV has no camera
        to scan a code. Happ solves this the other way round: the TV shows a
        QR code, and your phone sends the subscription to it. Happ documents
        two user-facing ways to do this:
      </p>
      <ul>
        <li>
          <strong>Web Import (recommended with Kovra).</strong> Choose Web
          Import on the TV. On your phone, scan the TV&apos;s QR code with the
          camera, or open tv.happ.su and enter the code the TV shows. Paste
          the <em>TV&apos;s</em> link from your dashboard and send it. Your
          phone&apos;s Happ never opens the link, so the binding goes to the
          TV. The link does pass through Happ&apos;s web service on its way.
          If the TV still shows &quot;One device per link&quot;, press{" "}
          <strong>Reset device binding</strong> on the TV card and refresh
          the subscription on the TV.
        </li>
        <li>
          <strong>Local transfer from Happ on your phone.</strong> This sends
          a subscription that is already in your phone&apos;s Happ. If you
          send your phone&apos;s own subscription, the TV receives a link that
          is bound to the phone and shows &quot;One device per link&quot;. To
          use this route anyway, add the TV&apos;s link to your phone, send
          it, delete it from the phone, press{" "}
          <strong>Reset device binding</strong> on the TV card, then refresh
          the subscription on the TV.
        </li>
      </ul>
      <p>
        Samsung (Tizen) and LG (webOS) TVs cannot run Android apps, so this
        guide does not cover them.
      </p>

      <h2>Verify once</h2>
      <p>
        With the tunnel up, check three things: that your public IP address
        belongs to the location you picked, that DNS lookups are not
        answered by your mobile carrier or home provider, and that IPv6 is
        not leaking your real address. The{" "}
        <Link href="/guides/vpn-leak-test">VPN leak test</Link> walks
        through each check. If you turned on blocking, also disconnect in
        Happ and confirm that pages stop loading. That is your kill switch
        working.
      </p>

      <h2 id="troubleshooting" style={ANCHOR}>
        When it fails
      </h2>
      <p>
        Kovra marks problems with entries in the location list whose names
        end in &quot;kovravpn.com&quot;. They point to a dummy local
        address, so &quot;connecting&quot; to one gives you no internet by
        design. What each one means is explained in{" "}
        <Link href="/guides/vpn-subscription-link-explained#placeholders">
          entries that are not servers
        </Link>
        .
      </p>
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
              <td>The only entry is &quot;One device per link - kovravpn.com&quot;</td>
              <td>
                The link is bound to another device, or to another VPN app on
                this phone
              </td>
              <td>
                Press Reset device binding on that link&apos;s card, then
                refresh the subscription on this phone. Or use a separate link
                for each device
              </td>
            </tr>
            <tr>
              <td>The only entry is &quot;No active plan - kovravpn.com&quot;</td>
              <td>The plan has ended</td>
              <td>Renew in the dashboard; the list returns on the next refresh</td>
            </tr>
            <tr>
              <td>&quot;Subscription removed - kovravpn.com&quot;</td>
              <td>The device was deleted in the dashboard</td>
              <td>Add a new device and import its link</td>
            </tr>
            <tr>
              <td>Connected, key icon on, nothing loads</td>
              <td>
                Private DNS hostname, a location unreachable from this network,
                or a placeholder entry selected
              </td>
              <td>
                Pick another location, set Private DNS to Automatic, then see{" "}
                <Link href="/guides/vpn-connected-but-no-internet">
                  connected but no internet
                </Link>
              </td>
            </tr>
            <tr>
              <td>Works on Wi-Fi, not on mobile data</td>
              <td>
                Data Saver or background data restriction, or the mobile network
                filters the connection
              </td>
              <td>
                Give Happ unrestricted data, then try another location on the
                same network
              </td>
            </tr>
            <tr>
              <td>Drops when the screen is off</td>
              <td>Battery optimisation stops the app</td>
              <td>Set battery usage to Unrestricted and remove sleep limits</td>
            </tr>
            <tr>
              <td>Wi-Fi login page never appears</td>
              <td>Block connections without VPN is on</td>
              <td>Turn blocking off, log in, turn it back on</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        On an iPhone the flow is similar but the system settings are
        different: see{" "}
        <Link href="/guides/how-to-set-up-vpn-on-iphone">
          how to set up a VPN on iPhone
        </Link>
        .
      </p>
    </GuideArticle>
  );
}

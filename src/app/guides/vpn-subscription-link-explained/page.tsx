// src/app/guides/vpn-subscription-link-explained/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "vpn-subscription-link-explained";
const OG = ogImageUrl(
  "VPN Subscription Links",
  "What they hold, how to guard one",
);

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

/** Keeps in-page anchors clear of the sticky guides header. */
const ANCHOR = { scrollMarginTop: 88 } as const;

/** Two-column tables fit a phone screen without sideways scrolling. */
const FIT = { minWidth: 0 } as const;

/** Code sample block: scrolls sideways inside its card if a line is long. */
const PRE = {
  margin: 0,
  padding: "16px 18px",
  fontFamily: "var(--k-mono)",
  fontSize: 13,
  lineHeight: 1.65,
  color: "var(--k-text)",
  whiteSpace: "pre",
} as const;

/**
 * Redacted on purpose: no real host, port, key or account ID may ever appear
 * on this page. Parameter names mirror what src/lib/xpanel.ts emits.
 */
const SAMPLE_ENTRY = [
  "vless://<account-id>",
  "  @<server-host>:<port>",
  "  /?type=tcp&encryption=none",
  "  &security=reality",
  "  &flow=xtls-rprx-vision",
  "  &sni=<cover-site>",
  "  &fp=<fingerprint>",
  "  &pbk=<public-key>",
  "  &sid=<short-id>",
  "  #Germany",
].join("\n");

const FAQ: FaqItem[] = [
  {
    q: "Is the subscription link the same as my account?",
    a: "No. Your account is what you sign in to on kovravpn.com, with email or Telegram. The subscription link is a per-device key that the account issues. Someone holding the link does not get into your dashboard, and from the dashboard you can view the link, reset its device binding, or delete the device and create a new link.",
  },
  {
    q: "Can I share my subscription link with family?",
    a: "Not on Kovra. A link works on one device only, so a second phone receives a 'One device per link' notice instead of servers. Give each device its own link: add a device slot for $5 per 30 days, or choose the 3-device plan, then create a link for each device in the dashboard.",
  },
  {
    q: "Does a subscription link expire?",
    a: "The link keeps working for as long as the device exists in your dashboard. What expires is the plan: without one, the link returns a 'No active plan' entry instead of locations, and after you renew, the next refresh brings the locations back. Deleting the device retires its link for good.",
  },
  {
    q: "Is a QR code safer than copying the link?",
    a: "No. The QR code encodes the same URL, so a photo of it is as good as the text. It is simply more convenient for a TV or a second screen. Keep it out of screenshots and shared photos exactly as you would the link.",
  },
  {
    q: "Why does my only phone say 'One device per link'?",
    a: "The link is bound to a different device identifier. That can happen when a factory reset or reinstall changed the app's device identifier, when the link was opened on another device first, or after the binding was reset and another device refreshed sooner. Press Reset device binding in the dashboard, then refresh the subscription on your phone straight away.",
  },
  {
    q: "Which apps can read a Kovra subscription link?",
    a: "Apps that import VLESS subscriptions with REALITY. Kovra recommends Happ on iOS, Android, Windows and macOS, and INCY also reads the standard link; the one-tap kovravpn.com/p/ link that some accounts get is made for Happ. Check the current app store listing before relying on any alternative, because client availability changes.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        If a VPN provider gave you a long URL instead of an installer or a
        username and password, that URL is a <em>subscription link</em>. It
        is how most VLESS, Xray and sing-box based services, Kovra included,
        hand configuration to your app. This page explains what the link
        contains, why it keeps itself up to date, why it deserves the same
        care as a password, and how Kovra&apos;s one-link-per-device rule
        works in practice.
      </p>

      <nav className="gd-note" aria-label="On this page">
        <strong>On this page</strong>
        <ol style={{ marginTop: 10 }}>
          <li>
            <a href="#what-it-is">What a subscription link is</a>
          </li>
          <li>
            <a href="#what-it-contains">What your app downloads</a>
          </li>
          <li>
            <a href="#vs-single-link">Subscription link vs a vless:// link</a>
          </li>
          <li>
            <a href="#updates">How updates arrive</a>
          </li>
          <li>
            <a href="#secret">Why the link is a secret</a>
          </li>
          <li>
            <a href="#one-device">One link, one device</a>
          </li>
          <li>
            <a href="#placeholders">Entries that are not servers</a>
          </li>
          <li>
            <a href="#leaked">If you think your link leaked</a>
          </li>
          <li>
            <a href="#apps">Which apps can read it</a>
          </li>
        </ol>
      </nav>

      <h2 id="what-it-is" style={ANCHOR}>
        What a subscription link is
      </h2>
      <p>
        A subscription link is a private HTTPS address. Your VPN app
        downloads it, reads the list of connection profiles inside, and shows
        each one as a location you can tap. Later the app goes back to the
        same address on its own and checks for changes. On some Kovra
        accounts the dashboard shows a one-tap link instead, starting with
        kovravpn.com/p/, which opens Happ and imports the subscription for
        you. It carries the same token and deserves the same care.
      </p>
      <p>
        Two properties matter more than any technical detail. First, the link
        needs no login: the server recognises you by the token in the URL
        alone. Second, because it carries that account token, the response
        contains working credentials for your plan. That is why the rest of
        this guide keeps returning to one rule: treat the link like a
        password.
      </p>

      <h2 id="what-it-contains" style={ANCHOR}>
        What your app downloads
      </h2>
      <p>
        Open a subscription link in a browser and you will usually see a
        block of seemingly random letters. That block is base64, a plain text
        encoding rather than encryption. Decoded, it is a list with one
        connection profile per line. Some providers send full JSON
        configurations instead, but the idea is the same. One VLESS entry,
        with every private value replaced by a placeholder, looks like this
        (wrapped for reading; in the real list it is a single line):
      </p>
      <div className="gd-table-scroll">
        <pre style={PRE}>{SAMPLE_ENTRY}</pre>
      </div>
      <p>Each part has a job:</p>
      <div className="gd-table-scroll">
        <table style={FIT}>
          <thead>
            <tr>
              <th style={{ width: "40%" }}>Part</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>vless://</code>
              </td>
              <td>
                The protocol. VLESS is a lightweight transport; the details
                are in{" "}
                <Link href="/guides/vless-reality-protocol">
                  how VLESS and REALITY work
                </Link>
                .
              </td>
            </tr>
            <tr>
              <td>
                <code>&lt;account-id&gt;</code>
              </td>
              <td>
                Your credential on the server. This is the part that makes the
                entry yours.
              </td>
            </tr>
            <tr>
              <td>
                <code>&lt;server-host&gt;:&lt;port&gt;</code>
              </td>
              <td>Where the app connects.</td>
            </tr>
            <tr>
              <td>
                <code>security=reality</code>, <code>sni</code>,{" "}
                <code>pbk</code>, <code>sid</code>, <code>fp</code>
              </td>
              <td>
                REALITY settings: the cover site the connection presents, the
                server&apos;s public key, a short ID and the browser
                fingerprint to imitate. The name, key and short ID must match
                the server&apos;s settings; the provider picks the fingerprint.
              </td>
            </tr>
            <tr>
              <td>
                <code>flow=xtls-rprx-vision</code>
              </td>
              <td>The Vision flow, which Kovra uses on every location.</td>
            </tr>
            <tr>
              <td>
                <code>#Germany</code>
              </td>
              <td>The label your app shows as the location name.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Alongside the list, the server can send refresh hints in the response
        headers, which apps such as Happ read: how often to re-check the
        link, when the plan expires, a title for the subscription and a
        support contact. Kovra uses them to ask for an hourly refresh and to
        point the app&apos;s support button at its Telegram bot.
      </p>

      <h2 id="vs-single-link" style={ANCHOR}>
        A subscription link versus a single vless:// link
      </h2>
      <p>
        You may also meet bare <code>vless://</code> links, shared one at a
        time. Each describes exactly one server, frozen at the moment the
        link was made. A subscription link is a pointer to a list that the
        provider maintains.
      </p>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Single vless:// link</th>
              <th>Subscription link</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Contains</td>
              <td>One server&apos;s settings</td>
              <td>An address that returns a list of servers</td>
            </tr>
            <tr>
              <td>A server address changes</td>
              <td>The link stops working; you need a new one</td>
              <td>The provider updates the list; the app picks it up</td>
            </tr>
            <tr>
              <td>New locations</td>
              <td>Pasted in by hand, one by one</td>
              <td>Appear after the next refresh</td>
            </tr>
            <tr>
              <td>Plan status and notices</td>
              <td>Not shown</td>
              <td>Can carry the expiry date and messages</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        That is why providers prefer subscriptions. Servers move, addresses
        get blocked or replaced, and a list that updates itself saves
        everyone from re-sending links. Kovra&apos;s dashboard gives you a
        subscription link for each device.
      </p>

      <h2 id="updates" style={ANCHOR}>
        How updates arrive
      </h2>
      <p>
        Apps re-fetch the link on a timer. Kovra&apos;s subscription asks for
        a refresh every hour, and Happ schedules its automatic updates by
        that hint, though the phone or computer decides exactly when they
        run. Every client also
        has a manual refresh, usually a circular-arrow icon next to the
        subscription&apos;s name; where exactly it sits differs between apps
        and versions.
      </p>
      <ul>
        <li>
          <strong>New or replaced locations appear after the next
          refresh.</strong> You never need to paste the link again for that.
        </li>
        <li>
          <strong>The link itself stays the same</strong> when the server list
          changes. The same URL keeps working for as long as the device exists
          in your dashboard.
        </li>
        <li>
          <strong>A refresh also carries your plan status.</strong> When a
          plan runs out, the next refresh replaces the locations with a notice
          (explained below); after you renew, the next refresh brings them
          back.
        </li>
      </ul>
      <p>
        If a refresh fails, apps normally keep the entries they already have.
        A failed refresh usually means the subscription server could not be
        reached from your current network, not that anything changed on your
        account. The{" "}
        <Link href="/guides/vpn-connected-but-no-internet">
          connected-but-no-internet checklist
        </Link>{" "}
        covers that case.
      </p>

      <h2 id="secret" style={ANCHOR}>
        Why the link is a secret
      </h2>
      <p>
        Nothing stands between the link and the server list: no password, no
        second factor. Anyone who has the URL can import it into their own
        app. In practice:
      </p>
      <ul>
        <li>
          <strong>Don&apos;t post it</strong> in group chats, public forums,
          issue trackers or social media, including &quot;can someone check
          my config?&quot; threads.
        </li>
        <li>
          <strong>Crop it out of screenshots.</strong> The dashboard shows the
          link on each device card, and many apps show it in their
          subscription settings.
        </li>
        <li>
          <strong>A QR code is the same secret in another shape.</strong> A
          photo of your screen with the code visible hands over the link.
        </li>
        <li>
          <strong>Move it between your own devices privately,</strong> for
          example through a personal note or an end-to-end encrypted chat with
          yourself.
        </li>
        <li>
          <strong>Support does not need it to find you.</strong> They can find
          your account from your Telegram or email. Share the link only inside
          the private support chat, and only if you are asked for it.
        </li>
      </ul>

      <h2 id="one-device" style={ANCHOR}>
        One link, one device
      </h2>
      <p>
        Kovra issues a separate link for every device, and each link works on
        exactly one device. When Happ opens a subscription, it sends a device
        identifier. The first device that opens a Kovra link is bound to it
        for a year. Any other device that opens the same link gets a single
        entry instead of servers:
      </p>
      <div className="gd-note">
        <strong>One device per link - kovravpn.com</strong>
        <br />
        One link works on one device. Use a separate link from your dashboard
        for each device.
      </div>
      <p>
        The binding exists to keep one link on one device. It is not a
        substitute for keeping the link private, so the rules in the
        previous section still apply.
      </p>

      <h3>Adding a link for another device</h3>
      <ol>
        <li>
          Open your <a href="/dashboard">dashboard</a> and press{" "}
          <strong>Add device</strong> (it reads <strong>Connect</strong> if you
          have no devices yet).
        </li>
        <li>
          Pick the device type: Android, iPhone, Mac, Windows or TV (Android
          TV and Google TV). The dashboard then links to the matching Happ
          download.
        </li>
        <li>
          Copy the new link, or show its QR code and scan it, and import it
          into the app on that device.
        </li>
      </ol>
      <p>
        Each device needs a free slot. The 1-device plan includes one slot and
        the 3-device plan three; an extra slot costs $5 for 30 days,
        independent of your plan, up to 100 devices per account. If the
        dashboard says &quot;No free device slot&quot;, that is the reason.
      </p>

      <h3>Moving a link to a new phone</h3>
      <p>
        Each device card in the dashboard has a{" "}
        <strong>Reset device binding</strong> button. It clears the binding,
        and the dashboard confirms: &quot;Binding reset. Refresh the
        subscription on the device you want to use.&quot; The next device that
        opens the link claims it, so the order matters:
      </p>
      <ol>
        <li>
          Remove the subscription from the old device first, so its automatic
          refresh cannot claim the link back.
        </li>
        <li>
          Press <strong>Reset device binding</strong> on that device&apos;s
          card and confirm.
        </li>
        <li>
          Straight away, import the link on the new device, or refresh it if
          it is already there.
        </li>
      </ol>

      <h2 id="placeholders" style={ANCHOR}>
        Entries that are not servers
      </h2>
      <p>
        Sometimes the list holds a single entry whose name is a sentence
        rather than a country. These are notices, delivered through the one
        channel every VPN app understands: a server entry. They point nowhere
        on purpose, so &quot;connecting&quot; to one gives you no internet.
        That is by design, not a fault.
      </p>
      <div className="gd-table-scroll">
        <table style={FIT}>
          <thead>
            <tr>
              <th>Entry name</th>
              <th>What it means</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>No active plan - kovravpn.com</td>
              <td>
                The account has no active plan. Happ also shows &quot;No
                active plan. Buy a plan to keep using Kovra.&quot;
                <br />
                <strong>Fix:</strong> buy or renew a plan, then refresh the
                subscription.
              </td>
            </tr>
            <tr>
              <td>One device per link - kovravpn.com</td>
              <td>
                This link is bound to another device.
                <br />
                <strong>Fix:</strong> use this device&apos;s own link, or reset
                the binding as described above.
              </td>
            </tr>
            <tr>
              <td>Subscription removed - kovravpn.com</td>
              <td>
                The device was deleted in the dashboard, so its link is
                retired.
                <br />
                <strong>Fix:</strong> add the device again and import the new
                link.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="leaked" style={ANCHOR}>
        If you think your link leaked
      </h2>
      <p>
        One warning sign is your own device suddenly showing{" "}
        <strong>One device per link</strong> when you did not switch devices.
        The app&apos;s device identifier may have changed (a factory reset or
        reinstall can do that), or the binding was reset and another device
        refreshed first. Either way:
      </p>
      <ol>
        <li>
          Press <strong>Reset device binding</strong> in the dashboard and
          refresh the subscription on your device immediately, so that your
          device claims the link first.
        </li>
        <li>
          If you suspect the link is circulating, delete that device in the
          dashboard and add it again. The old link then returns{" "}
          <strong>Subscription removed</strong>, and the new device card
          carries a fresh link.
        </li>
        <li>
          Tell support at{" "}
          <a href="https://t.me/KovraVPN_bot">@KovraVPN_bot</a> or{" "}
          <a href="mailto:support@kovravpn.com">support@kovravpn.com</a>,
          especially if you did not reset the binding yourself.
        </li>
      </ol>

      <h2 id="apps" style={ANCHOR}>
        Which apps can read the link
      </h2>
      <p>
        Any app that imports VLESS subscriptions with REALITY can read the
        format. Kovra&apos;s instructions are written for{" "}
        <strong>Happ</strong>, which is available for iOS, Android, Windows
        and macOS; <strong>INCY</strong> also reads Kovra&apos;s standard
        subscription link, while the one-tap kovravpn.com/p/ link is made for
        Happ. The step-by-step setup is in the guides for{" "}
        <Link href="/guides/how-to-set-up-vpn-on-android">Android</Link>,{" "}
        <Link href="/guides/how-to-set-up-vpn-on-iphone">iPhone</Link>,{" "}
        <Link href="/guides/how-to-set-up-vpn-on-windows">Windows</Link> and{" "}
        <Link href="/guides/how-to-set-up-vpn-on-mac">Mac</Link>.
      </p>
      <p>
        Two cautions. App availability changes, and some VLESS clients have
        disappeared from the App Store, so check the current listing before
        relying on an alternative. And an app that ignores the refresh hints
        still connects, but it may not show new locations or plan notices
        until it refreshes on its own schedule or you refresh by hand.
      </p>

      <h2>The rules in one place</h2>
      <ul>
        <li>One link per device; create a new link for each device.</li>
        <li>Treat the link, and its QR code, like a password.</li>
        <li>
          Let the app refresh on its own, and refresh by hand after renewing
          or when something looks wrong.
        </li>
        <li>A location named like a sentence is a notice, not a server.</li>
        <li>
          Changing phones: remove the subscription from the old one, reset the
          binding, then refresh on the new one right away.
        </li>
      </ul>
    </GuideArticle>
  );
}

// src/app/guides/vpn-for-public-wifi/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "vpn-for-public-wifi";
const OG = ogImageUrl("Public Wi-Fi Security", "What a VPN actually prevents");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Is public Wi-Fi actually dangerous in 2026?",
    a: "Less than the old advice suggests. Nearly all traffic is HTTPS, so passwords are not readable off the air. The remaining risks are metadata (which sites you visit), captive portals that manipulate traffic, and rogue access points impersonating the venue's network.",
  },
  {
    q: "Can someone steal my password on public Wi-Fi?",
    a: "Not from an HTTPS session, which covers effectively every login page today. The realistic attacks are phishing pages served by a rogue access point and users clicking through certificate warnings. Never dismiss a certificate warning on an open network.",
  },
  {
    q: "Do I need a VPN on hotel Wi-Fi?",
    a: "It is the case where a VPN earns its keep. Hotel networks combine unknown operators, mandatory captive portals, long sessions and guests doing work on them. The VPN hides your destination list and pins traffic into one encrypted tunnel the local network cannot interpret.",
  },
  {
    q: "Is mobile data safer than public Wi-Fi?",
    a: "Generally yes: the link is encrypted by the carrier and there is no local attacker on the segment. Your carrier still sees the domains you reach, which is exactly the visibility a VPN removes.",
  },
  {
    q: "Should the VPN connect automatically on open networks?",
    a: "Yes. Most clients offer automatic connection on untrusted Wi-Fi, which removes the failure mode that matters most: the few seconds after joining, when apps are already syncing and you have not pressed connect yet.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        The standard warning about public Wi-Fi — hackers sniffing your
        passwords out of the air — describes a world that mostly ended when
        the web moved to HTTPS. Repeating it has an unfortunate side effect:
        people who learn it was overstated conclude the whole topic is
        marketing. The real risks are narrower, less dramatic and still worth
        addressing.
      </p>

      <h2>What HTTPS already solved</h2>
      <p>
        Any site worth logging into uses TLS, browsers now warn loudly on
        anything that does not, and HSTS prevents silent downgrades on sites
        that have been visited before. The contents of your sessions — the
        pages, the form fields, the credentials — are encrypted between your
        device and the server, and no one on the local network can read them.
        That is a genuine, structural fix, and it removed the original reason
        to fear the coffee shop.
      </p>

      <h2>What it did not solve</h2>
      <h3>The destination list</h3>
      <p>
        Encryption hides content, not addressing. Anyone on the network
        segment, and the network operator by default, can observe which
        servers you contact: through DNS queries, through the hostname in the
        TLS handshake, and through IP addresses. A list of every site and app
        you touched, with timestamps, is a meaningful profile — health
        services, employers, banks, dating apps, news outlets — even with
        every page unreadable.
      </p>
      <h3>Captive portals</h3>
      <p>
        The &quot;accept terms to connect&quot; page works by intercepting
        traffic, which means every venue network ships with an interception
        mechanism turned on by design. Most only redirect until you accept,
        but the capability is there, it is often implemented by a third-party
        vendor, and the portal itself frequently collects an email address or
        a phone number tied to your device.
      </p>
      <h3>Rogue access points</h3>
      <p>
        The realistic attack today. An access point named identically to the
        venue&apos;s, with a stronger signal, and devices join it
        automatically because the name matches a saved network. The operator
        then sees the same metadata as above and can serve convincing
        phishing pages for anything you reach by typing a name rather than
        following a bookmark.
      </p>
      <h3>Devices on the same segment</h3>
      <p>
        On networks without client isolation, other guests can scan your
        device. Shared folders, media servers, printer services and debug
        ports left open at home are all reachable from the next table.
      </p>

      <h2>What a VPN changes, precisely</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Risk</th>
              <th>Without VPN</th>
              <th>With VPN</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Reading HTTPS content</td>
              <td>Not possible</td>
              <td>Not possible</td>
            </tr>
            <tr>
              <td>Seeing which sites you visit</td>
              <td>Visible via DNS and SNI</td>
              <td>Hidden</td>
            </tr>
            <tr>
              <td>Plain HTTP content</td>
              <td>Readable and modifiable</td>
              <td>Protected inside the tunnel</td>
            </tr>
            <tr>
              <td>Captive portal interception</td>
              <td>Full</td>
              <td>Limited to before you connect</td>
            </tr>
            <tr>
              <td>Rogue access point profiling</td>
              <td>Effective</td>
              <td>Sees only one encrypted stream</td>
            </tr>
            <tr>
              <td>Local network scanning</td>
              <td>Possible</td>
              <td>Unchanged — firewall handles this</td>
            </tr>
            <tr>
              <td>Phishing page you type into</td>
              <td>Works</td>
              <td>Still works — a VPN is not an anti-phishing tool</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>The five-minute setup that covers it</h2>
      <ol>
        <li>
          <strong>Turn on automatic connection for untrusted networks.</strong>{" "}
          The gap between joining and connecting manually is when your mail
          client syncs.
        </li>
        <li>
          <strong>Enable the kill switch</strong>, so a dropped tunnel does
          not resume in clear text on a network you do not control.
        </li>
        <li>
          <strong>Turn off automatic joining of open networks</strong> in the
          operating system. This is what rogue access points exploit.
        </li>
        <li>
          <strong>Set the network as public</strong> when the system asks, so
          sharing and discovery are disabled.
        </li>
        <li>
          <strong>Verify the tunnel is doing its job</strong> once, using the{" "}
          <Link href="/guides/vpn-leak-test">leak test guide</Link>. A DNS
          leak on public Wi-Fi hands the destination list straight back to
          the network you were trying to hide it from.
        </li>
      </ol>

      <h2>A note on captive portals</h2>
      <p>
        Portals must be reached before the VPN connects, which produces the
        awkward sequence everyone knows: connect to Wi-Fi, accept terms, then
        start the tunnel. Keep that window short, do not open anything else
        during it, and be wary of portals asking for more than a name — some
        collect email and phone numbers purely for marketing, and that data
        is now tied to your device on that network.
      </p>

      <h2>Where free VPNs fail this specific test</h2>
      <p>
        Using a free VPN on public Wi-Fi moves your metadata from the cafe
        operator to an app whose revenue model you cannot see. That is not
        obviously an improvement — and for the class of app that resells
        bandwidth, it is worse. The reasoning is in{" "}
        <Link href="/guides/are-free-vpns-safe">are free VPNs safe</Link>.
        The same applies to public proxies, only more so, as covered in{" "}
        <Link href="/guides/free-proxy-list-risks">free proxy lists</Link>.
      </p>

      <h2>The honest conclusion</h2>
      <p>
        You are unlikely to be robbed by joining a cafe network in 2026. You
        will be profiled: by the venue&apos;s network vendor, by whoever runs
        the access point, and by anyone who set one up nearby. A VPN removes
        the metadata that makes that profiling possible, which is a smaller
        claim than the old warnings made and the accurate one.
      </p>
    </GuideArticle>
  );
}

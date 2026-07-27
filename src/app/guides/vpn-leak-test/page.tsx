// src/app/guides/vpn-leak-test/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "vpn-leak-test";
const OG = ogImageUrl("VPN Leak Test", "DNS, IPv6, WebRTC in 5 minutes");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "How do I know if my VPN is leaking?",
    a: "Connect the VPN, then check four things: the public IP a website reports, which DNS resolvers answer for you, whether you have a working IPv6 address, and what local addresses WebRTC exposes in the browser. Anything that still points at your home ISP is a leak.",
  },
  {
    q: "What is a DNS leak?",
    a: "It means name lookups are going to your ISP's resolver instead of through the tunnel. Your traffic is encrypted, but the resolver holds a timestamped list of every domain you visited, which is most of the metadata a VPN is supposed to hide.",
  },
  {
    q: "How do I fix a WebRTC leak?",
    a: "WebRTC asks the operating system for local network addresses to establish peer connections, which can expose your real IP even through a VPN. Fix it by disabling WebRTC in the browser, using an extension that limits it, or relying on a browser that restricts the API by default.",
  },
  {
    q: "Why do I still see my real IP after connecting?",
    a: "Usually one of three causes: IPv6 is enabled and the VPN only tunnels IPv4, the browser cached an earlier result, or split tunnelling is excluding that app. Test in a fresh private window first, then check IPv6.",
  },
  {
    q: "How often should I run a leak test?",
    a: "After any change: new client version, new server, new operating system update, or a switch between Wi-Fi and cellular. Leaks appear from configuration drift far more often than from provider failure.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        A connected VPN icon means one thing: a tunnel was established. It
        does not mean every packet is using it. The four checks below take
        about five minutes and cover the ways traffic escapes an active
        tunnel — each one a documented way people have been identified while
        believing they were protected.
      </p>

      <h2>Before you start</h2>
      <p>
        Record your real values first, with the VPN <em>off</em>: your public
        IP address and the DNS resolvers your system uses. Every test below
        is a comparison against those two values, and without them you are
        guessing whether an unfamiliar address belongs to your provider or
        your ISP.
      </p>

      <h2>Test 1: the public IP</h2>
      <p>
        Connect the VPN and load any &quot;what is my IP&quot; service.
        Expected: the VPN server&apos;s address, and a location matching the
        server region.
      </p>
      <ul>
        <li>
          <strong>Still your real IP:</strong> the tunnel is not carrying
          browser traffic. Check split tunnelling and per-app rules first.
        </li>
        <li>
          <strong>Right IP, wrong country:</strong> harmless in itself —
          geolocation databases lag behind IP reassignments — but worth
          knowing if you are using the VPN for regional access.
        </li>
        <li>
          <strong>Use a private window.</strong> Cached pages produce a
          surprising share of false alarms.
        </li>
      </ul>

      <h2>Test 2: DNS</h2>
      <p>
        This is the leak that matters most, because it defeats the purpose of
        the tunnel without breaking anything visible. Run a DNS leak test
        with the VPN connected and read the list of resolvers that answered.
      </p>
      <ul>
        <li>
          <strong>Resolvers belong to your VPN provider or a neutral public
          resolver:</strong> correct.
        </li>
        <li>
          <strong>Resolvers belong to your ISP:</strong> leaking. Your ISP
          holds an ordered, timestamped list of every domain you visited.
        </li>
        <li>
          <strong>Mixed results:</strong> also leaking. One query out of ten
          is enough to build the same list, more slowly.
        </li>
      </ul>
      <p>
        Common causes: a client that does not force DNS through the tunnel, a
        manually configured resolver left over from a previous setup,
        Windows&apos; parallel query behaviour across interfaces, or a router
        that intercepts port 53 regardless of client settings. Fix by
        enabling the client&apos;s &quot;use provider DNS&quot; or &quot;block
        DNS outside tunnel&quot; option, then re-testing.
      </p>

      <h2>Test 3: IPv6</h2>
      <p>
        Many networks now provide IPv6 by default while some VPN
        configurations tunnel only IPv4. The result is quietly severe: any
        site reachable over IPv6 gets your real, globally routable address —
        which, unlike a shared IPv4 address, often identifies a single
        device.
      </p>
      <ul>
        <li>Load an IPv6 test page with the VPN connected.</li>
        <li>
          <strong>&quot;No IPv6 detected&quot;:</strong> good. Either your
          network has none, or the client is blocking it correctly.
        </li>
        <li>
          <strong>An address is shown:</strong> compare it against your
          pre-test value. If it matches, that is a full leak.
        </li>
      </ul>
      <p>
        Fix by enabling IPv6 support in the client if the provider offers it,
        turning on &quot;block IPv6&quot;, or disabling IPv6 on the network
        adapter as a last resort.
      </p>

      <h2>Test 4: WebRTC</h2>
      <p>
        WebRTC lets browsers open direct peer connections for calls and
        screen sharing, and to do that it asks the operating system for
        candidate addresses. Historically this exposed the local and
        sometimes the public IP to any page that asked, without a permission
        prompt. Modern browsers have narrowed it, but the API is still worth
        checking.
      </p>
      <ul>
        <li>Run a WebRTC leak test with the VPN connected.</li>
        <li>
          Private addresses such as <code>192.168.x.x</code> are not a
          privacy problem on their own.
        </li>
        <li>
          Your real public IP appearing there <em>is</em> the leak.
        </li>
      </ul>
      <p>
        Fix by disabling WebRTC where the browser allows it, using an
        extension that restricts candidate gathering, or switching browsers
        for sensitive sessions.
      </p>

      <h2>Test 5: the kill switch</h2>
      <p>
        The one nobody runs, and the one that matters during real use. Start
        a continuous download or a ping, then forcibly stop the VPN — quit
        the client, or disable the network adapter it uses. Correct
        behaviour: all traffic stops immediately. Incorrect: the transfer
        continues, which means it continued from your real address.
      </p>
      <p>
        This is decisive for{" "}
        <Link href="/guides/no-logs-vpn-for-torrenting">
          peer-to-peer traffic
        </Link>
        , where a two-second reconnect is enough for the swarm to record your
        address.
      </p>

      <h2>Reading the results</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Symptom</th>
              <th>Likely cause</th>
              <th>Fix</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Real IP visible in browser</td>
              <td>Split tunnelling or cached page</td>
              <td>Private window; check per-app rules</td>
            </tr>
            <tr>
              <td>ISP resolvers answering</td>
              <td>DNS not forced through tunnel</td>
              <td>Enable provider DNS / block outside DNS</td>
            </tr>
            <tr>
              <td>IPv6 address matches pre-test value</td>
              <td>IPv4-only tunnel</td>
              <td>Enable IPv6 in client or block it</td>
            </tr>
            <tr>
              <td>Public IP in WebRTC results</td>
              <td>Browser candidate gathering</td>
              <td>Restrict or disable WebRTC</td>
            </tr>
            <tr>
              <td>Traffic continues after tunnel drops</td>
              <td>Kill switch off or ineffective</td>
              <td>Enable it, then retest</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>What a clean test does not prove</h2>
      <p>
        It proves your traffic is leaving through the tunnel. It says nothing
        about what the provider does with it at the other end — that is a
        separate question with its own method, in{" "}
        <Link href="/guides/how-to-verify-no-logs-vpn">
          verifying no-logs claims
        </Link>
        . It also says nothing about identity: logged-in accounts, cookies
        and browser fingerprints survive any tunnel, as covered in{" "}
        <Link href="/guides/truly-anonymous-vpn">
          the anonymity guide
        </Link>
        . And on networks that block VPNs outright, a passing leak test on a
        connection that keeps dropping is not much comfort — that is a
        protocol problem, discussed in{" "}
        <Link href="/guides/wireguard-vs-openvpn-vs-vless">
          the protocol comparison
        </Link>
        .
      </p>

      <h2>Run it after every change</h2>
      <p>
        Client updates reset options. Operating system updates re-enable
        IPv6. New servers behave differently. Five minutes after any change
        is the difference between a VPN that works and a VPN that appears to.
      </p>
    </GuideArticle>
  );
}

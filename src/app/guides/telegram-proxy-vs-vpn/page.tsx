// src/app/guides/telegram-proxy-vs-vpn/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "telegram-proxy-vs-vpn";
const OG = ogImageUrl("Telegram Proxy vs VPN", "MTProto, and what it costs");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "What is an MTProto proxy?",
    a: "A proxy that speaks Telegram's own MTProto transport. Telegram supports it natively, so enabling one takes a single tap on a link and requires no extra app. It relays only Telegram traffic and does nothing for the rest of the device.",
  },
  {
    q: "Is an MTProto proxy safe?",
    a: "Your messages stay encrypted end-to-end by Telegram's own protocol, so the proxy cannot read them. It does see your IP address, connection times and traffic volume, and it is operated by whoever posted the link. Treat it as unmasking you to a stranger in exchange for access.",
  },
  {
    q: "Does a Telegram proxy hide my IP from Telegram?",
    a: "Yes, Telegram's servers see the proxy address instead of yours, which is why some channels promote them for privacy. The trade is straightforward: the proxy operator now sees what Telegram would have seen.",
  },
  {
    q: "Telegram proxy or VPN — which should I use?",
    a: "A proxy if only Telegram is blocked, you need it working in ten seconds, and the operator is someone you have reason to trust. A VPN if the block is broader, if other apps are also failing, or if you do not want an unknown operator holding your connection metadata.",
  },
  {
    q: "Why does my Telegram proxy keep dying?",
    a: "Public MTProto proxies are blocked by IP as fast as they are shared, and popular ones collapse under load. That churn is the main practical argument for a paid tunnel: it is the same fight, but someone else is fighting it for you.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        When Telegram stops connecting, the fastest fix circulates within
        minutes: a proxy link that configures itself in one tap. It works,
        it costs nothing, and it is the right answer surprisingly often. It
        also quietly changes who knows where you are. Both halves are worth
        understanding before the next outage.
      </p>

      <h2>How MTProto proxies work</h2>
      <p>
        Telegram built proxy support into the client because its users have
        needed it since 2018. An MTProto proxy speaks Telegram&apos;s own
        transport, so from the network&apos;s point of view the connection
        does not look like a standard proxy protocol on a standard port.
        Enabling one is a <code>tg://proxy?server=...</code> link: tap,
        confirm, connected.
      </p>
      <p>
        Message content is never at risk. Telegram&apos;s client-server
        encryption terminates at Telegram, not at the proxy, so the operator
        relays ciphertext. What the operator gets instead is the connection:
        your IP address, when you are online, how much you send, and for how
        long. In a country where using Telegram is itself the sensitive act,
        that metadata is the sensitive part.
      </p>

      <h2>Proxy versus VPN, for this specific problem</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>MTProto proxy</th>
              <th>VPN</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Setup time</td>
              <td>One tap on a link</td>
              <td>Two to three minutes, once</td>
            </tr>
            <tr>
              <td>Covers</td>
              <td>Telegram only</td>
              <td>Every app on the device</td>
            </tr>
            <tr>
              <td>Cost</td>
              <td>Free</td>
              <td>A few dollars a month</td>
            </tr>
            <tr>
              <td>Who sees your IP</td>
              <td>Anonymous operator</td>
              <td>Provider you chose and can check</td>
            </tr>
            <tr>
              <td>Stability</td>
              <td>Hours to days before it is blocked</td>
              <td>Maintained continuously</td>
            </tr>
            <tr>
              <td>Speed on media</td>
              <td>Depends entirely on the volunteer&apos;s uplink</td>
              <td>Consistent</td>
            </tr>
            <tr>
              <td>Works when the whole network is filtered</td>
              <td>Sometimes</td>
              <td>With a camouflaged protocol, yes</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>When the proxy is the right call</h2>
      <ul>
        <li>
          <strong>Telegram alone is blocked</strong> and everything else on
          the connection is fine.
        </li>
        <li>
          <strong>You need it working right now</strong>, on a borrowed phone,
          with no time to install anything.
        </li>
        <li>
          <strong>You know who runs it</strong> — a proxy from an organization
          you already trust is a different object from a link in a public
          channel.
        </li>
        <li>
          <strong>The traffic is not sensitive</strong> and neither is the
          fact that you are using Telegram.
        </li>
      </ul>

      <h2>When it is the wrong call</h2>
      <ul>
        <li>
          <strong>Your IP is the thing to protect.</strong> Handing it to an
          unknown operator in a jurisdiction you cannot name is a poor trade
          for one app.
        </li>
        <li>
          <strong>More than Telegram is failing.</strong> If browsers,
          messengers and app stores are all struggling, the network is doing
          protocol-level filtering and you need a tunnel that survives it —
          see{" "}
          <Link href="/guides/shadowsocks-vs-vless-reality">
            Shadowsocks versus VLESS Reality
          </Link>
          .
        </li>
        <li>
          <strong>You are on public Wi-Fi.</strong> The proxy protects
          Telegram; everything else on the device stays exposed to the local
          network. See{" "}
          <Link href="/guides/vpn-for-public-wifi">
            public Wi-Fi security
          </Link>
          .
        </li>
        <li>
          <strong>The proxy came from a random channel.</strong> Free
          infrastructure is paid for by someone, for some reason — the
          general case is in{" "}
          <Link href="/guides/free-proxy-list-risks">free proxy lists</Link>.
        </li>
      </ul>

      <h2>A note on sponsored channels</h2>
      <p>
        Telegram allows MTProto proxy operators to attach a sponsored channel
        that appears in the chat list of everyone using the proxy. That is the
        official monetization path, and it is at least transparent. Its
        existence is also the answer to &quot;why would anyone run this for
        free&quot;: attention has value, and so does the connection log that
        comes with it.
      </p>

      <h2>The practical setup</h2>
      <p>
        If you settle on a tunnel instead, the requirement is a protocol that
        does not announce itself. Networks that block Telegram usually block
        obvious VPN handshakes in the same sweep, which rules out stock
        WireGuard and OpenVPN — the comparison is in{" "}
        <Link href="/guides/wireguard-vs-openvpn-vs-vless">
          WireGuard versus OpenVPN versus VLESS
        </Link>
        . Camouflaged transports such as{" "}
        <Link href="/guides/vless-reality-protocol">VLESS with Reality</Link>{" "}
        look like ordinary HTTPS to a real website, which is why they keep
        working when proxy links stop. Setup on a phone takes about three
        minutes:{" "}
        <Link href="/guides/how-to-set-up-vpn-on-iphone">
          the iPhone walkthrough
        </Link>{" "}
        covers the iOS side.
      </p>

      <h2>The summary</h2>
      <p>
        An MTProto proxy is a keyhole: exactly one app, instantly, for free,
        at the cost of telling a stranger where you are. A VPN is a door:
        everything, consistently, for a few dollars, from a provider whose
        logging posture you can{" "}
        <Link href="/guides/how-to-verify-no-logs-vpn">check</Link>. Use the
        keyhole in an emergency and the door for everything else.
      </p>
    </GuideArticle>
  );
}

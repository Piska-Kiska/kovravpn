// src/app/guides/mullvad-alternatives/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "mullvad-alternatives";
const OG = ogImageUrl(
  "Mullvad Alternatives",
  "When the gold standard falls short",
);

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Is Mullvad still worth it in 2026?",
    a: "For most privacy-focused users on open networks, yes. Anonymous account numbers, a flat 5 euro price unchanged since 2009, repeated independent audits and RAM-only servers remain a benchmark. The reasons to look elsewhere are specific: censored networks where WireGuard is blocked, port forwarding needs, or streaming.",
  },
  {
    q: "Why does Mullvad not work on some restrictive networks?",
    a: "Mullvad is built around WireGuard, and WireGuard has a recognizable handshake that deep packet inspection can classify and drop. Obfuscation layers help, but they are an add-on rather than the protocol's native shape. Camouflage-first protocols like VLESS with Reality look like ordinary TLS to a mainstream site, which is much harder to block without collateral damage.",
  },
  {
    q: "Did Mullvad remove port forwarding?",
    a: "Yes. Mullvad announced the removal in May 2023 and shut down existing forwards that July, citing abuse. Leeching torrents still works fine, but users who need inbound connections for seeding or self-hosting have to look at providers that still offer the feature, such as AirVPN.",
  },
  {
    q: "Which Mullvad alternative is best for censored networks?",
    a: "Pick by protocol rather than brand: you want traffic that does not look like a VPN at all. Kovra runs VLESS with the Reality transport, which camouflages the session as regular TLS to a real website, and pairs it with the same no-email, crypto-payment account model Mullvad users expect.",
  },
  {
    q: "Do these alternatives accept anonymous payment like Mullvad?",
    a: "The ones worth considering do. Kovra takes USDT, BTC and other coins with no email at signup; IVPN accepts Monero and Bitcoin without personal details; AirVPN accepts a wide set of coins. If an alternative demands a card and an email, it has already given up Mullvad's main advantage.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        Mullvad earned its reputation the hard way: random account numbers
        instead of emails, cash accepted by post, a flat 5 euro price that
        has not moved since 2009, and audit reports actually published. If
        you are reading this, you probably respect all of that and still
        hit one of its walls. This guide is honest about what Mullvad does
        best, specific about the gaps, and concrete about what covers each
        gap.
      </p>

      <h2>What Mullvad gets right</h2>
      <p>
        Credit first. Mullvad pioneered the no-identity account model that
        this whole site advocates: a 16-digit number, no email, no name,
        crypto and cash accepted with a discount for coins. Infrastructure
        runs RAM-only, the client apps are open source, and Cure53 plus
        Assured have audited the stack repeatedly. Any alternative you
        consider should be measured against that bar, using the same
        outside-in checks from our{" "}
        <Link href="/guides/how-to-verify-no-logs-vpn">
          no-logs verification checklist
        </Link>
        .
      </p>

      <h2>Where it genuinely falls short</h2>
      <ul>
        <li>
          <strong>DPI-heavy and censored networks.</strong> Mullvad is a
          WireGuard shop, and WireGuard announces itself: a fixed
          handshake pattern that deep packet inspection classifies
          instantly. On networks in Russia, Iran, China, on filtered
          corporate Wi-Fi, or behind national firewalls during protests,
          the tunnel often simply does not come up. Obfuscation bridges
          exist but are bolted on, not the protocol's native shape.
        </li>
        <li>
          <strong>No port forwarding, permanently.</strong> Removed in
          2023 for abuse reasons, with no plans to return. Fine for
          browsing and leeching; a dealbreaker for seeding ratios and
          self-hosted services.
        </li>
        <li>
          <strong>Streaming is a non-goal.</strong> Mullvad says so openly.
          If unblocking catalogs matters to you, it is the wrong tool by
          design.
        </li>
        <li>
          <strong>One price, one shape.</strong> The flat rate is
          principled, but there is no cheaper long-term tier and no
          flexibility for multi-device families beyond five connections.
        </li>
      </ul>

      <h2>The alternatives, by the gap they close</h2>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Mullvad</th>
              <th>Kovra</th>
              <th>IVPN</th>
              <th>AirVPN</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Signup data</td>
              <td>None (account number)</td>
              <td>None (Telegram or one field)</td>
              <td>None required</td>
              <td>Email</td>
            </tr>
            <tr>
              <td>Anonymous payment</td>
              <td>BTC, Monero, cash</td>
              <td>USDT, BTC, ETH and more</td>
              <td>BTC, Monero</td>
              <td>Wide coin support</td>
            </tr>
            <tr>
              <td>Core protocol</td>
              <td>WireGuard</td>
              <td>VLESS + Reality</td>
              <td>WireGuard, obfuscation add-ons</td>
              <td>OpenVPN, WireGuard</td>
            </tr>
            <tr>
              <td>Survives DPI censorship</td>
              <td>Weak</td>
              <td>Strong by design</td>
              <td>Moderate with bridges</td>
              <td>Weak to moderate</td>
            </tr>
            <tr>
              <td>Port forwarding</td>
              <td>No</td>
              <td>No</td>
              <td>Check current policy</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>Jurisdiction</td>
              <td>Sweden</td>
              <td>Crypto-first, EU servers</td>
              <td>Gibraltar</td>
              <td>Italy</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>If your problem is censorship: Kovra</h2>
      <p>
        This is the gap Kovra was built for. VLESS with the Reality
        transport does not obfuscate a VPN handshake; it never produces
        one. The session presents as ordinary TLS to a mainstream website,
        with a genuine certificate and a real browser fingerprint, so a
        censor must either allow it or break normal HTTPS for everyone.
        The{" "}
        <Link href="/guides/vless-reality-protocol">
          protocol explainer
        </Link>{" "}
        covers the mechanics. The account model will feel familiar to a
        Mullvad user: no email, no phone, crypto-native payment, and the
        same expectation that the provider should know nothing worth
        subpoenaing. Being a younger service, it does not yet have
        Mullvad's audit history; hold it to the checklist like anyone
        else.
      </p>

      <h2>If your problem is port forwarding: AirVPN</h2>
      <p>
        AirVPN has offered configurable port forwarding for years and is
        run with unusual transparency about its network. The trade-offs
        are an email at signup, an interface that assumes technical
        comfort, and classic protocols that are as visible to DPI as
        Mullvad's.
      </p>

      <h2>If you want a second purist with Monero: IVPN</h2>
      <p>
        IVPN is the closest philosophical sibling: Gibraltar-based, no
        personal details required, Monero accepted, audits published, and
        more built-in obfuscation options than Mullvad ships. It costs
        more, and its anti-censorship story is still bridges over
        WireGuard rather than camouflage from the ground up.
      </p>

      <h2>How to switch without downgrading</h2>
      <ol>
        <li>
          Write down which wall you actually hit: censorship, ports,
          streaming or price. Choose for that, not for a feature list.
        </li>
        <li>
          Keep the account anonymous: no email where possible, crypto at
          checkout. The{" "}
          <Link href="/guides/pay-for-vpn-with-crypto">
            crypto payment guide
          </Link>{" "}
          covers fees and networks in five minutes.
        </li>
        <li>
          Run both side by side for a week before letting the Mullvad time
          expire. Flat-rate months make cheap overlap insurance.
        </li>
      </ol>
      <p>
        Mullvad remains the reference for anonymous accounts on open
        networks. The point of an alternative is not to beat it everywhere,
        but to cover the specific situations where the gold standard,
        by its own admission, does not go.
      </p>
    </GuideArticle>
  );
}

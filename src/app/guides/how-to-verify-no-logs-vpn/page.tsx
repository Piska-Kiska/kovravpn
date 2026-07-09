// src/app/guides/how-to-verify-no-logs-vpn/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "how-to-verify-no-logs-vpn";
const OG = ogImageUrl(
  "No-Logs VPN Claims",
  "How to actually verify them",
);

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Does a no-logs audit prove the VPN keeps no logs?",
    a: "It proves that at the moment of inspection the audited systems matched the policy. It is meaningful evidence, not a guarantee of future behavior. Treat audits as one strong signal inside a bigger checklist rather than a verdict.",
  },
  {
    q: "What logs can a VPN keep without breaking a no-logs promise?",
    a: "Honest providers distinguish traffic logs (what you visited, never acceptable) from minimal operational data such as subscription expiry or aggregate load. Read the policy for what is explicitly excluded, not for the headline.",
  },
  {
    q: "Can I test a no-logs claim myself from the outside?",
    a: "Not directly, but you can test adjacent claims: DNS, IPv6 and WebRTC leaks, whether the kill switch works, and whether signup and payment really avoid collecting identity. A provider careless about testable claims is careless about untestable ones.",
  },
  {
    q: "Why does jurisdiction matter if there are no logs?",
    a: "Jurisdiction decides what a provider can be forced to do next. A data-retention law can compel future logging even where none exists today. Prefer providers outside mandatory-retention regimes and read how they say they would respond to orders.",
  },
  {
    q: "Is a free VPN ever no-logs?",
    a: "Almost never in a meaningful sense. Infrastructure costs money; when subscriptions do not pay for it, data usually does. Several of the largest free apps have been documented selling bandwidth or browsing data.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        Every VPN on the market claims to keep no logs, including several
        that were later caught handing detailed connection records to
        authorities or leaking analytics databases to the open internet. The
        phrase is unregulated marketing. What you can do is triangulate:
        there is a specific set of signals that are verifiable from the
        outside, and together they separate providers who engineered for
        privacy from providers who wrote a paragraph about it.
      </p>

      <h2>First, know what "logs" even means</h2>
      <p>
        A useful conversation needs the five categories separated, because
        "no logs" collapses them dishonestly:
      </p>
      <ul>
        <li>
          <strong>Traffic content</strong>: what you downloaded or said.
          Encrypted end to end in modern protocols; nobody serious stores
          this.
        </li>
        <li>
          <strong>Activity logs</strong>: sites and services you visited.
          This is the category that must not exist, and the one the
          marketing phrase refers to.
        </li>
        <li>
          <strong>Connection logs</strong>: timestamps, source IPs, session
          durations, bandwidth per user. The dangerous middle: enough to
          deanonymize when correlated.
        </li>
        <li>
          <strong>Operational data</strong>: subscription expiry, device
          count, aggregate server load. Necessary to run a service; harmless
          when it is not tied to traffic.
        </li>
        <li>
          <strong>Account and payment data</strong>: email, name, card
          records. Not "logs" at all, yet the richest identity source, which
          is why it deserves its own scrutiny.
        </li>
      </ul>

      <h2>The verification checklist</h2>
      <h3>1. Read the policy for exclusions, not slogans</h3>
      <p>
        A serious policy names the categories above and states which are not
        collected. Vague wording ("we do not log your activity") that never
        mentions connection metadata is a classic tell. Also check the
        retention period for whatever operational data is admitted.
      </p>
      <h3>2. Check the jurisdiction</h3>
      <p>
        The company's legal home decides what it can be compelled to do.
        Mandatory data retention laws can force future logging regardless of
        today's policy. Prefer jurisdictions without retention mandates, and
        note where the servers physically sit, because local seizure is a
        separate risk from corporate legal pressure.
      </p>
      <h3>3. Look for court-tested evidence</h3>
      <p>
        The strongest public proof a no-logs claim can have is a documented
        case where records were demanded and the provider had nothing to
        produce. Search the provider's name together with "court",
        "subpoena" or "seized server". Absence of such history proves
        nothing either way; presence of the opposite ends the evaluation.
      </p>
      <h3>4. Independent audits, read correctly</h3>
      <p>
        An audit by a reputable firm is a strong positive signal with a
        precise meaning: at inspection time, configuration matched policy.
        Check the audit's scope (infrastructure or just apps), its date, and
        whether the full report is public rather than a press release about
        it.
      </p>
      <h3>5. Architecture that cannot remember</h3>
      <p>
        The best log is one that cannot exist. Signals of privacy-first
        engineering: RAM-only or diskless nodes that lose all state on
        reboot, authentication via opaque identifiers rather than
        identities, and a subscription model where the server only needs to
        know "this key is valid until date X". When user identity was never
        collected, as with{" "}
        <Link href="/guides/vpn-without-email">
          email-free Telegram signup
        </Link>{" "}
        and{" "}
        <Link href="/guides/pay-for-vpn-with-crypto">crypto payment</Link>,
        entire categories of dangerous data have nothing to attach to.
      </p>
      <h3>6. Follow the money</h3>
      <p>
        Infrastructure is expensive. If the service is free, ask what pays
        for it; documented answers across the industry include selling
        bandwidth, injecting ads and selling browsing data. A paid service
        with anonymous payment options has the healthiest incentive
        structure: revenue comes from subscriptions, and the provider
        profits from knowing less about you, not more.
      </p>

      <h2>The 60-second version</h2>
      <p>
        When you have one minute instead of an evening, run this compressed
        pass. Open the privacy policy and search for the words "connection",
        "timestamp" and "IP address": either they are explicitly excluded or
        you have your answer. Check the company's jurisdiction against
        mandatory data-retention regimes. Search the brand plus "logs" plus
        "court" for history. Confirm the signup form works without personal
        data and that crypto is among the payment methods, because both are
        expensive to fake. Any single failure is survivable in context; two
        or more means the marketing department wrote the privacy story and
        the engineers were not consulted.
      </p>

      <h2>Red flags that end the conversation</h2>
      <ul>
        <li>
          A privacy policy that reserves the right to log "for service
          improvement" without defining limits.
        </li>
        <li>
          A history of quietly edited policies after incidents, or a parent
          company in the data business.
        </li>
        <li>
          Mandatory personal data at signup: full name, phone number,
          address. There is no technical reason a tunnel needs them.
        </li>
        <li>
          Marketing that promises total anonymity. Serious providers
          describe threat models, not magic.
        </li>
      </ul>

      <h2>What you can test yourself today</h2>
      <p>
        You cannot inspect a provider's disks, but you can test the claims
        that touch your device, and diligence here predicts diligence there:
      </p>
      <ol>
        <li>
          <strong>DNS leaks</strong>: with the VPN connected, a DNS leak
          test site must show only resolver locations consistent with the
          VPN, never your ISP.
        </li>
        <li>
          <strong>IPv6 and WebRTC</strong>: browser WebRTC checks should not
          reveal your real address; IPv6 must be tunneled or disabled.
        </li>
        <li>
          <strong>Kill switch behavior</strong>: drop the connection
          mid-download and confirm traffic stops instead of failing open.
        </li>
        <li>
          <strong>Signup and payment claims</strong>: create an account and
          verify how little the flow actually demands. A provider that
          advertises anonymous signup but then requires a card has answered
          your question.
        </li>
      </ol>

      <h2>How Kovra approaches this, stated plainly</h2>
      <p>
        We prefer verifiable design over adjectives. Accounts can be created
        with a Telegram login and no email; payment can be cryptocurrency,
        which leaves us holding a transaction hash instead of a billing
        identity. The service model is subscription-based: infrastructure
        needs to know that a key is valid and until when, not what flows
        through it, and the{" "}
        <Link href="/guides/vless-reality-protocol">
          VLESS + Reality protocol
        </Link>{" "}
        keeps even the existence of the tunnel invisible on the wire. We
        will not claim more than that in a guide about verifying claims:
        apply the checklist above to us the same way you would to anyone
        else.
      </p>
    </GuideArticle>
  );
}

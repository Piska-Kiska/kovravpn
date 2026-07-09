// src/app/guides/vpn-without-email/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "vpn-without-email";
const OG = ogImageUrl(
  "VPN Without Email or Phone",
  "How anonymous signup works",
);

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Can I really use a VPN without giving any email address?",
    a: "Yes. Kovra supports Telegram-based signup: you authorize through your Telegram account and no email is ever collected. Providers built around account numbers instead of identities offer the same property.",
  },
  {
    q: "Is a Telegram signup anonymous?",
    a: "It is pseudonymous. The VPN sees a numeric Telegram ID, not your name or phone. Telegram itself knows the phone behind the account, so for stricter threat models pair it with a Telegram account registered on a prepaid SIM.",
  },
  {
    q: "What if I lose access to my Telegram account?",
    a: "Access recovery is the real trade-off of anonymous signup. Without an email there is no reset link, so keep your Telegram account protected with a password and, where offered, save your subscription link somewhere safe.",
  },
  {
    q: "Do disposable email addresses work for VPN signup?",
    a: "Usually yes, and they are a reasonable middle ground: the provider gets a working inbox for the verification click, but the address says nothing about you. Just remember the mailbox disappears, taking password resets with it.",
  },
  {
    q: "Is signing up without an email against the rules?",
    a: "No. Choosing the Telegram option or a burner address is an intended use of the signup form, not a violation. Fraud rules concern payment abuse, not how little personal data you provide.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        Every field on a signup form is a liability. An email address links
        your VPN account to your inbox, your inbox to your identity, and one
        subpoena or one database leak later, to everything else. This guide
        explains what a VPN without email or phone number actually looks
        like, what you give up in exchange, and how to complete the picture
        so the payment does not reintroduce what the signup removed.
      </p>

      <h2>Why VPN services ask for an email at all</h2>
      <p>
        Three reasons, and only one of them serves you. First, account
        recovery: a reset link needs somewhere to go. Second, billing and
        receipts, which card processors often require. Third, marketing, the
        part nobody asked for. Notice that none of these is technically
        necessary to route encrypted packets. The email requirement is a
        business convention, not an engineering one, which is why
        privacy-first providers drop it.
      </p>

      <h2>What "no email" actually removes from the data trail</h2>
      <p>
        Think of your VPN account as a bundle of identifiers. A conventional
        signup bundles together: your email (often your real name in the
        handle), your IP at registration time, a password you may have
        reused, your card details, and a billing address. A well designed
        anonymous signup reduces the bundle to a random account identifier
        and nothing else.
      </p>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Signup method</th>
              <th>Provider learns</th>
              <th>Recovery path</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Email + card</td>
              <td>Email, name, card, billing address</td>
              <td>Email reset</td>
            </tr>
            <tr>
              <td>Burner email + crypto</td>
              <td>A dead mailbox address</td>
              <td>While the mailbox lives</td>
            </tr>
            <tr>
              <td>Telegram login + crypto</td>
              <td>Numeric Telegram ID</td>
              <td>Your Telegram account</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The Telegram row is the interesting one. The provider receives an
        opaque numeric ID and a first name field that can say anything. No
        email, no phone: Telegram never shares the phone number behind an
        account with third-party logins.
      </p>

      <h2>Signing up with Telegram only, step by step</h2>
      <ol>
        <li>
          Open the <a href="/register">registration page</a> and choose{" "}
          <strong>Continue with Telegram</strong> instead of the email field.
        </li>
        <li>
          Telegram asks you to confirm the login inside the app. Confirm, and
          you are back on the site with a live account. Total time: about
          fifteen seconds.
        </li>
        <li>
          Pick a plan and pay with crypto so the payment side stays as clean
          as the signup side. The{" "}
          <Link href="/guides/pay-for-vpn-with-crypto">
            crypto payment guide
          </Link>{" "}
          covers networks and fees.
        </li>
        <li>
          Connect a device using the <Link href="/guide">setup guide</Link>.
          Your subscription link is the only credential a client app needs.
        </li>
      </ol>
      <p>
        A useful side effect: the same Telegram account gets you into the
        Kovra bot, where you can manage devices, renew and top up without
        touching the website at all.
      </p>

      <h2>The payment has to match the signup</h2>
      <p>
        An anonymous signup paid with a personal credit card is theater. The
        card record contains your legal name and links straight back to the
        account you just carefully anonymized. If the goal is a VPN account
        with no identity attached, the payment must be cryptocurrency: the
        provider sees a transaction hash, and the invoice is satisfied by
        math rather than by a billing profile. Cards remain available for
        people who simply do not care about this dimension, and that is
        fine; the point is that the choice exists.
      </p>

      <h2>What you give up, honestly</h2>
      <ul>
        <li>
          <strong>Password resets.</strong> No email means no reset link.
          Your access is your Telegram account or your saved credentials.
          Protect the Telegram account with two-step verification.
        </li>
        <li>
          <strong>Receipts and invoices.</strong> If you need documents for
          expense reports, an emailless account is the wrong tool.
        </li>
        <li>
          <strong>Service notifications.</strong> Expiry warnings arrive in
          the Telegram bot instead of an inbox. Practically this is often
          better, but it is a change of habit.
        </li>
      </ul>

      <h2>A quick threat-model check</h2>
      <p>
        Skipping the email is worth it when the risk you care about is data
        aggregation: leaks, subpoenas to the provider, marketing databases,
        or a future change of ownership of the VPN company. It does not
        protect against network-level observation of your traffic, which is
        the job of the protocol itself. For that layer, see{" "}
        <Link href="/guides/vless-reality-protocol">
          how VLESS + Reality hides VPN usage from deep packet inspection
        </Link>
        . The two measures are independent and stack cleanly: one removes
        identity from the account, the other removes the VPN fingerprint
        from the wire.
      </p>

      <h2>Burner email or Telegram login: a decision guide</h2>
      <p>
        Both remove your real inbox from the equation; they fail in
        different directions. A <strong>burner address</strong> keeps the
        familiar email-and-password flow and works with any provider, but
        the mailbox is mortal: when the temporary service deletes it, the
        recovery path dies with it, and some burner domains are blocked at
        signup. A <strong>Telegram login</strong> ties access to an account
        you already protect and carry on every device, gives the provider
        only a numeric ID, and doubles as the channel for expiry reminders
        and support. The trade is that your access now lives inside one
        Telegram account, so its security settings become your security
        settings. Rule of thumb: Telegram if you have it and protect it,
        burner if you refuse to link even a pseudonymous messenger.
      </p>

      <h2>Three myths worth retiring</h2>
      <ul>
        <li>
          <strong>"No email means no way to contact support."</strong>{" "}
          Support happens where the account lives: the Telegram bot thread
          is a better support channel than email ping-pong, and it works
          without revealing anything new.
        </li>
        <li>
          <strong>"Anonymous accounts are for wrongdoing."</strong> The
          same design protects journalists, people in restrictive countries,
          and anyone who has watched enough breach notifications land in
          their inbox. Data that is never collected cannot leak, be sold or
          be subpoenaed.
        </li>
        <li>
          <strong>"The provider secretly logs identity anyway."</strong> A
          provider can always behave badly, which is exactly why the
          architecture matters more than promises: when signup collects a
          numeric ID and payment arrives as a transaction hash, there is no
          identity in the pipeline to log. Verification habits for the rest
          are in the checklist linked below.
        </li>
      </ul>

      <h2>Provider-side design that makes it real</h2>
      <p>
        For a no-email account to mean anything, the backend has to be built
        for it. Things worth checking in any provider, Kovra included: the
        account key is a random identifier rather than an email hash; the
        subscription mechanism is a bearer link that works without a login
        session; and support can help you through a bot conversation without
        demanding identity confirmation it never collected in the first
        place. When these hold, "we do not know who you are" stops being a
        slogan and becomes an architectural fact, which pairs nicely with
        the verification habits from{" "}
        <Link href="/guides/how-to-verify-no-logs-vpn">
          our no-logs verification checklist
        </Link>
        .
      </p>
    </GuideArticle>
  );
}

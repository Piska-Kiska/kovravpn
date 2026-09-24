// src/app/guides/crypto-payment-not-credited/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "crypto-payment-not-credited";
const OG = ogImageUrl(
  "Crypto Payment Not Credited",
  "Find the TxID, find the cause",
);

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

/** Keeps in-page anchors clear of the sticky guides header. */
const ANCHOR = { scrollMarginTop: 88 } as const;

/** Two-column tables fit a phone screen without sideways scrolling. */
const FIT = { minWidth: 0 } as const;

const FAQ: FaqItem[] = [
  {
    q: "How long should I wait for a crypto payment to activate a VPN plan?",
    a: "Until a block explorer shows the transaction confirmed, then a little longer for the processor to finish. Kovra's dashboard says the plan activates automatically after network confirmation and gives 5-30 minutes as a guide; Bitcoin can take longer when the network is busy. If the transfer is confirmed and still nothing has happened after that, contact support with the transaction hash.",
  },
  {
    q: "Is my money lost if I underpaid?",
    a: "Not necessarily. The partial amount reached the processor and is recorded against the invoice, but the plan does not activate on its own. Contact support with the transaction hash. What happens next depends on the case, so no particular outcome is guaranteed.",
  },
  {
    q: "Can a refund go to a different wallet?",
    a: "Kovra's Terms say approved refunds are paid to the same wallet and in the same asset used for payment, less network fees. If you paid straight from an exchange, the sending address belongs to the exchange rather than to you, so mention that when you write to support.",
  },
  {
    q: "Why can't I pay on the network I want?",
    a: "The invoice page lists the coins and networks the processor accepts for that invoice, and only a payment made with one of them can be matched to your invoice automatically. Coins sent on an unlisted network may never arrive where the processor is watching. Choose a listed option, or use one of the Telegram bot's top-up methods.",
  },
  {
    q: "Should I pay again if nothing happened?",
    a: "No. Check the first transaction on a block explorer. If it is still confirming, a second payment only creates a second problem. If it is confirmed and the plan is still inactive after the activation window, contact support with the transaction hash instead of paying twice.",
  },
];

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        You sent the crypto, your wallet says it went through, and the VPN
        still says there is no active plan. A stuck payment usually has a
        traceable cause. Invoices have rules, and most stuck payments break
        one of them: the transfer is still confirming, less than the invoiced
        amount arrived, it went out on a different network, or it was sent
        long after the invoice was created. The fix starts with one piece of
        data, your transaction hash. The general advice here applies to any merchant
        that uses a hosted crypto invoice such as NOWPayments; the parts
        specific to Kovra are labelled. For the payment flow from the start,
        see{" "}
        <Link href="/guides/pay-for-vpn-with-crypto">
          how to pay for a VPN with crypto
        </Link>
        .
      </p>

      <div className="gd-note">
        <strong>Before anything else:</strong> no genuine support agent will
        ever ask for your seed phrase, recovery words or private key. Anyone
        who does, however official they look in a chat or a comment thread,
        is trying to empty your wallet. A transaction hash is public and safe
        to share. Your recovery phrase never is.
      </div>

      <h2 id="how-it-works" style={ANCHOR}>
        How a crypto invoice becomes an active plan
      </h2>
      <ol>
        <li>
          <strong>The invoice is priced in US dollars.</strong> On Kovra,
          choosing <strong>Pay with crypto</strong> opens a NOWPayments invoice
          for the plan price.
        </li>
        <li>
          <strong>You choose the coin on the invoice page</strong>, and the
          network where it matters. The page then shows a deposit address and
          the exact amount to send. The rate is not fixed in advance, and
          Kovra&apos;s invoices are set so that the payer covers the fees, so
          the coin amount can be slightly higher than a plain dollar
          conversion.
        </li>
        <li>
          <strong>The processor watches the blockchain</strong> for a payment
          to that address.
        </li>
        <li>
          <strong>
            The plan activates when the payment reaches the final status,{" "}
            <code>finished</code>.
          </strong>{" "}
          Kovra&apos;s dashboard says the plan &quot;activates automatically
          after network confirmation{" "}
          <span style={{ whiteSpace: "nowrap" }}>(5-30 min)</span>&quot;.
        </li>
      </ol>
      <p>
        On the way, the payment passes through statuses. You may see them on
        the invoice page, and support uses them when looking a payment up:
      </p>
      <div className="gd-table-scroll">
        <table style={FIT}>
          <thead>
            <tr>
              <th style={{ width: "34%" }}>Status</th>
              <th>What it means, and your move</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>waiting</code>
              </td>
              <td>
                No payment detected yet.
                <br />
                <strong>Next:</strong> if you sent one, look up the hash (
                <a href="#step-1">step 1</a>).
              </td>
            </tr>
            <tr>
              <td>
                <code>confirming</code>
              </td>
              <td>
                Seen on the blockchain, collecting confirmations.
                <br />
                <strong>Next:</strong> wait, and do not pay again.
              </td>
            </tr>
            <tr>
              <td>
                <code>confirmed</code>, <code>sending</code>
              </td>
              <td>
                Confirmed; the processor is completing it.
                <br />
                <strong>Next:</strong> wait a few more minutes.
              </td>
            </tr>
            <tr>
              <td>
                <code>partially_paid</code>
              </td>
              <td>
                Less than the invoiced amount arrived.
                <br />
                <strong>Next:</strong> contact support with the hash.
              </td>
            </tr>
            <tr>
              <td>
                <code>finished</code>
              </td>
              <td>
                Complete; the plan activates.
                <br />
                <strong>Next:</strong> refresh the subscription in your app.
              </td>
            </tr>
            <tr>
              <td>
                <code>expired</code>
              </td>
              <td>
                No deposit was detected in time; NOWPayments marks a payment
                expired after 7 days without one.
                <br />
                <strong>Next:</strong> contact support if you paid late.
              </td>
            </tr>
            <tr>
              <td>
                <code>failed</code>, <code>refunded</code>
              </td>
              <td>
                An error, or the funds were returned.
                <br />
                <strong>Next:</strong> contact support with the hash.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>
          On Kovra, a plan is granted only on <code>finished</code>.
        </strong>{" "}
        Every other status, <code>partially_paid</code> included, leaves your
        account unchanged, and a payment that never reaches{" "}
        <code>finished</code> needs a person to look at it.
      </p>

      <h2 id="step-1" style={ANCHOR}>
        Step 1: find your transaction hash and look it up
      </h2>
      <p>
        The transaction hash, or TxID, is the receipt for a blockchain
        transfer. You will find it in one of two places:
      </p>
      <ul>
        <li>
          <strong>A self-custody wallet</strong> such as Trust Wallet, Exodus,
          MetaMask or TronLink: open the transaction in your history. The
          details show the hash or a link to a block explorer.
        </li>
        <li>
          <strong>An exchange:</strong> open your withdrawal history and the
          withdrawal&apos;s details, and look for TxID or transaction hash. If
          there is no hash yet and the status says processing, the exchange has
          not sent the coins, and the question is for the exchange, not the
          merchant.
        </li>
      </ul>
      <p>
        Paste the hash into the block explorer for the network you used:
        Tronscan for TRON, Etherscan for Ethereum, BscScan for BNB Chain, or
        a Bitcoin explorer such as mempool.space. Check four things:
      </p>
      <ol>
        <li>
          <strong>Status:</strong> pending or confirmed.
        </li>
        <li>
          <strong>Recipient:</strong> exactly the deposit address from the
          invoice.
        </li>
        <li>
          <strong>Amount received:</strong> what reached the address, not what
          you typed.
        </li>
        <li>
          <strong>Network and token:</strong> the same network and coin the
          invoice named.
        </li>
      </ol>
      <p>Whichever of those doesn&apos;t match tells you where to go next:</p>
      <div className="gd-table-scroll">
        <table style={FIT}>
          <thead>
            <tr>
              <th>What the explorer shows</th>
              <th>Your case</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Pending, or still few confirmations</td>
              <td>
                <a href="#confirming">Still confirming</a>
              </td>
            </tr>
            <tr>
              <td>Confirmed, but less arrived than the invoice asked</td>
              <td>
                <a href="#underpaid">Underpaid</a>
              </td>
            </tr>
            <tr>
              <td>Confirmed on another network, or a different coin</td>
              <td>
                <a href="#wrong-network">Wrong network or coin</a>
              </td>
            </tr>
            <tr>
              <td>Sent long after the invoice was created</td>
              <td>
                <a href="#expired">Late payment</a>
              </td>
            </tr>
            <tr>
              <td>Confirmed, right amount, right network</td>
              <td>
                <a href="#still-no-plan">Paid, but the app shows no plan</a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="confirming" style={ANCHOR}>
        Still pending or confirming
      </h2>
      <p>
        Blockchains confirm transactions in blocks, and busy networks queue
        them. Stablecoins on fast networks usually confirm within minutes;
        Bitcoin can take much longer when fees are low and the network is
        congested. Kovra&apos;s dashboard says the plan activates
        automatically after network confirmation and gives 5-30 minutes as a
        guide.
      </p>
      <p>
        <strong>Don&apos;t pay a second time.</strong> A second transfer does
        not speed up the first, and it leaves support with two payments to
        untangle. Wait until the explorer shows the transfer confirmed, then
        allow the activation window.
      </p>

      <h2 id="underpaid" style={ANCHOR}>
        Underpaid because a fee came out of the amount
      </h2>
      <p>
        This is a common way money gets stuck. Many exchanges take their
        withdrawal fee out of the amount you enter: type the invoice
        amount, and the invoice receives that amount minus the fee. The
        processor sees less than it asked for and marks the payment as
        partially paid.
      </p>
      <p>
        On Kovra, a partially paid invoice does not activate on its own.
        Contact support with the hash; they can see what arrived. The outcome
        depends on the case, so this guide does not promise one.
      </p>
      <p>
        To avoid it, look for the field an exchange shows as the amount you
        will receive, and make that equal to the invoice amount. Paying from
        a self-custody wallet usually avoids the problem, because most
        wallets charge the network fee on top of the amount you send.
      </p>

      <h2 id="wrong-network" style={ANCHOR}>
        Wrong network or wrong coin
      </h2>
      <p>
        USDT and several other coins exist on more than one blockchain, and an
        invoice names one of them, for example USDT on TRON or USDT on BNB
        Chain. Coins sent on a different network do not arrive on the one the
        processor is watching.
      </p>
      <p>
        The easiest mix-up is between Ethereum-style networks. Ethereum, BNB
        Chain, Polygon and others share the same address format, starting
        with <code>0x</code>, so a wallet or exchange will often let you send
        on the wrong one without a warning. TRON addresses start with{" "}
        <code>T</code>, which makes a TRON and Ethereum mix-up less likely,
        though not impossible through some exchanges.
      </p>
      <p>
        Whether such coins can be recovered depends on the networks involved
        and on the processor, and sometimes they cannot be recovered at all.
        Contact support with the hash and the network you actually used, and
        treat any recovery as uncertain until it happens.
      </p>

      <h2 id="expired" style={ANCHOR}>
        The invoice expired, or you paid late
      </h2>
      <p>
        Kovra&apos;s invoices use a floating rate, so the coin amount reflects
        the market when the invoice was created, and coins that arrive much
        later are valued at the rate on arrival. A late payment can therefore
        come up short and stay unfinished. NOWPayments also stops tracking a
        payment that receives nothing for 7 days and marks it expired. Pay
        soon after creating the invoice. If you sent the coins late, the plan
        may not activate automatically; contact support with the hash. Next
        time, create a fresh invoice instead of reusing an old one.
      </p>

      <h2 id="still-no-plan" style={ANCHOR}>
        Confirmed, but the app still says &quot;No active plan&quot;
      </h2>
      <p>
        If the explorer shows the payment confirmed and your{" "}
        <a href="/dashboard">dashboard</a> shows an active plan, the app is
        working from an old copy of your subscription. It refreshes about
        once an hour on its own; to update it now, refresh the subscription
        in the app and reconnect. The <strong>No active plan - kovravpn.com</strong> entry
        should give way to real locations. Why that entry exists is explained
        in{" "}
        <Link href="/guides/vpn-subscription-link-explained">
          what a subscription link is
        </Link>
        .
      </p>
      <p>
        If the dashboard itself shows no plan, check that you paid while
        signed in to the right account. A Kovra account can use Telegram or
        email, and the two only share a plan once they are linked in the
        dashboard&apos;s <strong>Linked accounts</strong> section. A payment
        made in one account does not appear in the other.
      </p>
      <p>
        Paid through the Telegram bot? The bot works differently from the
        website: a payment there tops up a US-dollar balance, and you then buy
        a plan from that balance. If the top-up arrived but no plan was
        bought, the money is waiting as balance.
      </p>

      <h2 id="support" style={ANCHOR}>
        What to send support, and what never to send
      </h2>
      <p>
        Write to <a href="https://t.me/KovraVPN_bot">@KovraVPN_bot</a> on
        Telegram or{" "}
        <a href="mailto:support@kovravpn.com">support@kovravpn.com</a>, and
        include:
      </p>
      <ul>
        <li>The transaction hash (TxID).</li>
        <li>The coin and network, for example USDT on TRON.</li>
        <li>The amount sent and the time, with your time zone.</li>
        <li>The Telegram username or email of the account you paid in.</li>
        <li>A screenshot of the invoice page, if you still have it.</li>
      </ul>
      <p>
        Never send your seed phrase, recovery words, private key or wallet
        password. Support will never ask for them, and the hash already holds
        everything needed to find the payment on the blockchain.
      </p>

      <h2 id="refunds" style={ANCHOR}>
        Refunds, plainly
      </h2>
      <p>
        Crypto transfers are irreversible; there is no chargeback. Under
        Kovra&apos;s <Link href="/terms">Terms</Link> (section 5), payments
        are generally non-refundable once a plan is active. A refund may be
        considered only where the service was not delivered because of a
        fault on Kovra&apos;s side, confirmed by a support request made within
        14 days of payment. Approved refunds go to the same wallet, in the
        same asset, less network fees.
      </p>
      <p>
        One practical consequence: if you paid straight from an exchange, the
        sending address usually belongs to the exchange, not to you. Say so
        when you contact support.
      </p>

      <h2 id="next-time" style={ANCHOR}>
        Avoiding it next time
      </h2>
      <ul>
        <li>
          <strong>Pay from a self-custody wallet,</strong> or, from an
          exchange, make sure the amount received matches the invoice.
        </li>
        <li>
          <strong>Check the network twice.</strong> The invoice&apos;s network,
          your wallet&apos;s network and the address format should all agree.
          The{" "}
          <Link href="/guides/vpn-that-accepts-usdt">USDT walkthrough</Link>{" "}
          compares the common networks.
        </li>
        <li>
          <strong>Pay soon after creating the invoice,</strong> and create a
          new one rather than reusing an old one.
        </li>
        <li>
          <strong>Start with one month.</strong> Kovra&apos;s Terms recommend
          buying the shortest term first; one month for one device is $5.
        </li>
        <li>
          <strong>Use Bitcoin for longer terms.</strong> Its network fee can be
          large next to a one-month price; see{" "}
          <Link href="/guides/pay-vpn-with-bitcoin">
            paying for a VPN with Bitcoin
          </Link>
          .
        </li>
        <li>
          <strong>Consider the Telegram bot</strong> if its methods suit you
          better. It takes top-ups through CryptoBot (USDT, TON and BTC) from
          $5 and through NOWPayments from $8, credited to a US-dollar balance.
        </li>
      </ul>
    </GuideArticle>
  );
}

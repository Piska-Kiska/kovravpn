// src/app/guides/vpn-in-turkey/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import GuideArticle from "@/components/GuideArticle";
import type { FaqItem } from "@/lib/faq-items";
import { ogImageUrl } from "@/lib/og-url";
import { buildGuideMetadata } from "@/lib/guides";

const SLUG = "vpn-in-turkey";
const OG = ogImageUrl("VPN in Turkey", "What's legal, what's blocked");

export const metadata: Metadata = buildGuideMetadata(SLUG, OG);

const FAQ: FaqItem[] = [
  {
    q: "Is it legal to use a VPN in Turkey?",
    a: "No Turkish law makes personal VPN use an offence. The authorities restrict VPN services instead, by blocking provider websites and server addresses, and a 2026 draft would require VPN providers to be licensed. Anything illegal stays illegal through a VPN, including speech offences for social media posts. This is general information, not legal advice.",
  },
  {
    q: "Can I buy a VPN after I arrive in Turkey?",
    a: "Do not plan on it. In a September 2026 test on a Turkish mobile connection, Nomad Istanbul could not reach 8 of 10 major VPN provider websites, and payment pages can fail too. Kovra has not verified whether its own website is reachable from Turkish networks, so buy, install and test before you travel.",
  },
  {
    q: "Which VPN location should I use while in Turkey?",
    a: "A location outside Turkey, such as Germany, Poland, Finland or Sweden. A server in Turkey reaches the internet through Turkish networks and follows Turkish blocking rules, so do not expect it to help with sites blocked in Turkey.",
  },
  {
    q: "Will my Turkish banking app work through a VPN?",
    a: "No VPN can promise that. Banks often treat foreign or datacentre addresses as a risk signal. Inside Turkey, disconnect the VPN for banking. Abroad, a Turkish VPN location may help or may be flagged, so follow your bank's guidance for customers abroad.",
  },
  {
    q: "Will social media work through a VPN during throttling?",
    a: "Not reliably. During the March and September 2025 events, platforms were deliberately slowed. A tunnel hides which platform your traffic is for, but VPN servers are blocked too, and no VPN restores bandwidth that has been cut. Keep a fallback such as SMS or a phone call.",
  },
  {
    q: "Does an eSIM bought before the trip still work in Turkey?",
    a: "Travellers and eSIM sellers consistently report that an eSIM installed and activated before arrival keeps working. Buying, topping up or downloading a profile inside Turkey is the problem, because most large travel-eSIM stores have been blocked in waves since July 2025.",
  },
];

/** External source link: new tab, no referrer, same style as prose links. */
function Src({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function Page() {
  return (
    <GuideArticle slug={SLUG} faq={FAQ}>
      <p>
        Turkey sits in an awkward middle ground. Using a VPN there is not a
        crime, yet the state blocks a long and changing list of websites,
        including the sites of many well-known VPN providers and, since
        2025, most large travel-eSIM stores. This guide is for visitors, foreign
        residents and Turks abroad. Every figure carries its source and
        date, because this list goes out of date quickly.
      </p>

      <h2>Is using a VPN legal in Turkey?</h2>
      <p>
        No Turkish law makes it an offence for an individual to use a VPN.
        The state restricts VPN services instead. Freedom House records
        orders from the Information and Communication Technologies Authority
        (BTK) to block more than 10 VPN services and Tor in 2016, and 17 VPN
        services in late 2023, the latter without a court order. Nomad
        Istanbul&apos;s September 2026 guide, written from inside the
        country, puts it plainly: using a VPN is legal, and reading a
        blocked site is not an offence.
      </p>
      <p>
        Blocking rests on Law No. 5651, the Internet Law. A 2020 amendment,
        Law No. 7253, added bandwidth throttling of up to 90% as a sanction
        against large social networks that do not appoint a local
        representative.
      </p>
      <p>
        The rules for providers may tighten. In April 2026, İFÖD published
        a draft amendment to the Electronic Communications Law (No. 5809)
        that would require VPN providers to hold BTK authorisation and
        operate through a local company, with fines of 1 to 30 million lira
        and, for a provider that does not comply or pay within six months,
        throttling of up to 95% or blocking. Turkish media also reported
        plans for identity and age checks on licensed VPN services through
        the e-Devlet government portal. The draft targets providers, not
        users, and as of September 2026 we have not found confirmation that
        it has been enacted.
      </p>
      <h3>What a VPN does not change</h3>
      <ul>
        <li>
          <strong>Illegal activity stays illegal.</strong> A tunnel changes
          the route your traffic takes, not the law that applies to what you
          do.
        </li>
        <li>
          <strong>Speech offences follow the post, not the route.</strong>{" "}
          Amendments passed in 2022 made publicly spreading &quot;false
          information&quot; a crime punishable by up to three years in
          prison (Human Rights Watch, October 2022).
        </li>
      </ul>
      <div className="gd-note">
        <strong>Not legal advice.</strong> Rules and enforcement change, and
        residents can face different scrutiny from short-term visitors.
        Check current sources before you rely on any of this.
      </div>

      <h2>What is blocked, and how it changes</h2>
      <p>
        Blocking in Turkey is large-scale and routine. The Freedom of
        Expression Association (İFÖD) tracks it in its EngelliWeb project.
        Its annual report, summarised by the Stockholm Center for Freedom in
        June 2026, counts about 232,000 websites and domain names
        blocked in 2025 alone, and about 1.5 million since 2018. Orders
        come both from courts and from administrative bodies.
      </p>
      <div className="gd-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Target</th>
              <th>What happened</th>
              <th>Reported by</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Wikipedia</td>
              <td>
                Blocked from April 2017 until after the Constitutional Court
                ruled against the ban in December 2019
              </td>
              <td>Nomad Istanbul</td>
            </tr>
            <tr>
              <td>Instagram</td>
              <td>Blocked for nine days in August 2024</td>
              <td>Freedom House, 2025</td>
            </tr>
            <tr>
              <td>Roblox</td>
              <td>
                Blocked in August 2024, reported accessible again in June
                2026
              </td>
              <td>Türkiye Today</td>
            </tr>
            <tr>
              <td>Discord</td>
              <td>Blocked in October 2024, still blocked in September 2026</td>
              <td>Nomad Istanbul</td>
            </tr>
            <tr>
              <td>VPN provider websites</td>
              <td>
                About 10 providers blocked in December 2016, 16 in December 2023
                and about 27 in August 2024. In a September 2026 test, 8 of 10
                major sites were unreachable
              </td>
              <td>Nomad Istanbul</td>
            </tr>
            <tr>
              <td>VPN servers</td>
              <td>
                454 server addresses linked to 26 VPN services blocked in 2025
              </td>
              <td>İFÖD</td>
            </tr>
            <tr>
              <td>Travel-eSIM stores</td>
              <td>
                Blocks from 10 July 2025. In a 10 September 2026 test, 15 of
                the 19 largest stores were unreachable
              </td>
              <td>İFÖD, Nomad Istanbul</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Blocking a provider&apos;s website hurts at the worst moment: when
        someone arrives and tries to sign up, pay or read setup
        instructions. Counts differ slightly between sources, but the
        pattern is clear: waves in 2016, 2023 and 2024 cover most well-known
        brands, and İFÖD&apos;s 2025 figure shows that the servers apps
        connect to are blocked too, not just the marketing pages.
      </p>
      <p>
        The eSIM blocks began with a BTK decision in July 2025, reported by
        İFÖD, covering sellers including Airalo, Holafly, Saily and Nomad.
        More waves followed. What is affected is buying a plan: an eSIM
        installed and activated before arrival is consistently reported to
        keep working. The Roblox entry shows that the list also moves the
        other way. Treat any list, this one included, as a dated snapshot.
      </p>

      <h2>Throttling during major events</h2>
      <p>
        Separately from blocking, the authorities have repeatedly slowed
        specific platforms during political events. The affected apps barely
        load while the rest of the internet keeps working.
      </p>
      <ul>
        <li>
          <strong>March 2025:</strong> after the detention of Istanbul mayor
          Ekrem İmamoğlu, social media was throttled for about 42 hours
          (Freedom House).
        </li>
        <li>
          <strong>September 2025:</strong> from the evening of 7 September,
          NetBlocks reported that X, YouTube, Instagram, Facebook, TikTok and
          WhatsApp were restricted on multiple networks during a police
          blockade of the main opposition party&apos;s Istanbul office
          (Reuters). İFÖD put
          the throttling at about 21 hours.
        </li>
        <li>
          <strong>July 2024:</strong> internet access in Kayseri Province
          was throttled for about a week during anti-refugee unrest (Freedom
          House).
        </li>
      </ul>
      <p>
        When one platform is slowed, traffic inside a tunnel does not show
        which platform it is for. But VPN servers get blocked too, and when
        a whole region&apos;s connection is cut back, as in Kayseri, no VPN
        restores the lost bandwidth. Expect these periods to be unreliable
        whatever you use, and agree on a fallback with family, such as SMS
        or a phone call.
      </p>

      <h2>Before you fly: the install-first checklist</h2>
      <ol>
        <li>
          <strong>Install the app at home.</strong> App store listings differ
          by country, and provider websites may not load once you arrive.
        </li>
        <li>
          <strong>Import your subscription and test it</strong> on the device
          you will carry, on Wi-Fi and on mobile data, with two or three
          locations. The{" "}
          <Link href="/guides/how-to-set-up-vpn-on-android">
            Android setup guide
          </Link>{" "}
          has the steps.
        </li>
        <li>
          <strong>Buy and install your eSIM before departure</strong>, or
          check that your home plan includes roaming in Turkey.
        </li>
        <li>
          <strong>Check that your plan outlasts the trip.</strong> Renewing
          from inside the country depends on a payment page that may not
          load.
        </li>
        <li>
          <strong>Save support contacts and an offline copy of the
          instructions</strong>, such as screenshots of the setup steps.
        </li>
        <li>
          <strong>Set the date and time to automatic.</strong> If the clock
          is far off, HTTPS certificate checks fail, including the app&apos;s
          subscription refresh.
        </li>
        <li>
          <strong>Run one leak test</strong> while connected, using the{" "}
          <Link href="/guides/vpn-leak-test">leak test guide</Link>.
        </li>
      </ol>
      <div className="gd-note">
        <strong>If you use Kovra:</strong> each device needs its own link
        from the dashboard, because a link binds to the first device that
        opens it. If you change phones before the trip, press{" "}
        <em>Reset device binding</em> in the dashboard, then refresh the
        subscription on the new phone. Plans are one-time payments with no
        auto-renewal, and renewing the same plan adds time on top of the current expiry.
        Support is at @KovraVPN_bot on Telegram and support@kovravpn.com.
        We have not verified whether kovravpn.com is reachable from Turkish
        networks, so do anything that needs the website before you go.
      </div>

      <h2>Which location to use from inside Turkey</h2>
      <p>
        Pick a location outside Turkey. A server in Turkey reaches the
        internet through Turkish networks and follows the same blocking
        rules, so do not expect it to reach a site that is blocked in
        Turkey. For latency, European locations are the usual choice. With
        Kovra, that means Germany, Poland, Finland or Sweden.
      </p>
      <p>
        While you are in Turkey, you do not need a VPN to look Turkish,
        because your local connection already does. If a Turkish bank or
        government site objects to your foreign VPN address, disconnect for
        that session.
      </p>

      <h2>Turks abroad who need a Turkish IP address</h2>
      <p>
        The reverse case is just as common. Someone living in Berlin or
        London finds that a Turkish bank, TV subscription or operator
        account behaves differently from abroad. Streaming rights may be
        licensed for Turkey only, fraud checks may treat a foreign login as
        suspicious, and some sites restrict foreign traffic outright.
      </p>
      <p>
        Kovra has a Turkey location for this use. It comes with caveats:
      </p>
      <ul>
        <li>
          <strong>Datacentre addresses are recognisable.</strong> A VPN
          server&apos;s address can be flagged as datacentre or VPN traffic
          whatever country it is in. We make no promise about any bank,
          streaming service or government portal.
        </li>
        <li>
          <strong>A Turkish exit follows Turkish rules.</strong> Expect sites
          that are blocked in Turkey to be blocked for you too.
        </li>
        <li>
          <strong>Terms of service still apply.</strong> Some streaming
          services forbid VPN use in their terms.
        </li>
      </ul>

      <h2>Protocols: what is documented and what is only reported</h2>
      <p>
        Many VPN comparison sites say that Turkish networks detect and drop
        OpenVPN, WireGuard and IPsec connections with deep packet inspection
        (DPI). We have not found a published, independent measurement that
        confirms protocol-level blocking in Turkey, so treat those claims as
        reports. The capability is documented: Citizen Lab&apos;s 2018
        report &quot;Bad Traffic&quot; found DPI equipment on Türk
        Telekom&apos;s network being used to redirect software downloads to
        spyware.
      </p>
      <p>
        Kovra runs VLESS with REALITY over TCP on every location. REALITY is
        designed to make the handshake look like an ordinary TLS connection
        to a real website, leaving no distinctive VPN handshake to match. The
        details are in the{" "}
        <Link href="/guides/vless-reality-protocol">
          VLESS + REALITY explainer
        </Link>
        , and the{" "}
        <Link href="/guides/vpn-that-works-in-china">China guide</Link>{" "}
        covers fingerprinting in general. This is a property of the
        protocol, not a guarantee. It does nothing for a server whose
        address is on a blocklist, and we have not tested Kovra&apos;s
        reachability from Turkish networks.
      </p>

      <h2>Hotel Wi-Fi and mobile data in Turkey</h2>
      <p>
        Hotel, airport and café networks connect through Turkish providers,
        so the national blocks apply there too. Many also put a login page
        in front of the internet, and a VPN can keep that page from
        appearing. The fix is to pause the VPN, log in and then reconnect.
        It is covered step by step in{" "}
        <Link href="/guides/vpn-not-working-on-hotel-wifi">
          VPN not working on hotel or airport Wi-Fi
        </Link>
        .
      </p>
      <p>
        Keep a mobile fallback. A phone hotspot from a pre-installed travel
        eSIM or from roaming gives you a second route. Whether that route
        sees Turkish blocks depends on how your carrier routes the data, so
        do not count on it either way. If you plan to use a Turkish SIM for
        months, note that a phone brought from abroad works with one for
        only 120 days, according to Türkiye Today. After that it must be
        registered, and the same outlet reported the 2026 fee as 54,258
        lira.
      </p>

      <h2>Sources and dates</h2>
      <ul>
        <li>
          <Src href="https://nomadistanbul.com/kb/what-is-blocked-in-turkey-vpn/">
            Nomad Istanbul, &quot;What Is Blocked in Turkey&quot;
          </Src>
          , tested 10–11 September 2026.
        </li>
        <li>
          Freedom House, Freedom on the Net:{" "}
          <Src href="https://freedomhouse.org/country/turkey/freedom-net/2025">
            Turkey 2025
          </Src>{" "}
          and{" "}
          <Src href="https://freedomhouse.org/country/turkey/freedom-net/2024">
            Turkey 2024
          </Src>
          .
        </li>
        <li>
          <Src href="https://stockholmcf.org/turkey-blocked-232000-websites-in-2025-as-digital-censorship-expanded-report/">
            Stockholm Center for Freedom on İFÖD&apos;s 2025 EngelliWeb report
          </Src>
          , June 2026, and{" "}
          <Src href="https://ifade.org.tr/en/publications/reports-books/">
            İFÖD&apos;s own reports
          </Src>
          .
        </li>
        <li>
          <Src href="https://ifade.org.tr/engelliweb/vpn-saglayicilarina-para-cezasi-bant-daraltma-ve-erisim-engeli/">
            İFÖD on the draft VPN licensing rules
          </Src>{" "}
          (in Turkish), 20 April 2026.
        </li>
        <li>
          <Src href="https://www.al-monitor.com/originals/2025/09/access-x-youtube-other-online-platforms-restricted-turkey-internet-monitor-says">
            Reuters, via Al-Monitor
          </Src>
          , 8 September 2025, and{" "}
          <Src href="https://www.hrw.org/news/2022/10/14/turkey-dangerous-dystopian-new-legal-amendments">
            Human Rights Watch
          </Src>
          , 14 October 2022.
        </li>
        <li>
          <Src href="https://citizenlab.ca/2018/03/bad-traffic-sandvines-packetlogic-devices-deploy-government-spyware-turkey-syria/">
            Citizen Lab, &quot;Bad Traffic&quot;
          </Src>
          , March 2018.
        </li>
        <li>
          Türkiye Today on the{" "}
          <Src href="https://www.turkiyetoday.com/business/turkiye-lifts-roblox-ban-after-nearly-two-years-3222216">
            Roblox unblock
          </Src>{" "}
          and the{" "}
          <Src href="https://www.turkiyetoday.com/business/turkiye-sets-2026-imei-registration-fee-for-phones-brought-from-abroad-at-1263-3212215">
            2026 IMEI fee
          </Src>
          .
        </li>
      </ul>
    </GuideArticle>
  );
}

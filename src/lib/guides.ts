// src/lib/guides.ts
//
// Registry of English SEO guides under /guides. Single source of truth for
// the listing page, per-article pages, sitemap entries and Article JSON-LD.
// Content itself lives in src/app/guides/<slug>/page.tsx (server-rendered
// English, unlike the RU-first pages: these target EN search intent).

/**
 * Topic buckets. Used for the crumb trail, the `articleSection` schema
 * property and the grouped listing on /guides. Keep the list short: each
 * value becomes a visible section heading, and a bucket with one article
 * looks like an empty shelf.
 */
export type GuideTag =
  | "Payments"
  | "Privacy"
  | "Protocols"
  | "Proxies"
  | "Censorship"
  | "Setup"
  | "Comparisons";

export interface GuideMeta {
  slug: string;
  /** H1 / SERP title (without the " | Kovra" template suffix). */
  title: string;
  /** Meta description, ~150 chars. */
  description: string;
  /** Short card teaser for the listing page. */
  teaser: string;
  tag: GuideTag;
  /** ISO dates for schema + sitemap. */
  published: string;
  updated: string;
  minutes: number;
  /**
   * Direct 40-60 word answer to the query the article targets, rendered as
   * the first block of the page and mirrored into `abstract` in the Article
   * schema. Google lifts featured snippets from exactly this shape (question
   * restated, answered in one self-contained paragraph, no "see below"), and
   * LLM answer engines quote it verbatim. Optional so older entries stay valid.
   */
  tldr?: string;
  keywords: string[];
}

export const SITE_URL = "https://kovravpn.com";

export const GUIDES: readonly GuideMeta[] = [
  {
    slug: "pay-for-vpn-with-crypto",
    title: "How to Pay for a VPN with Crypto (USDT, BTC): No Card, No KYC",
    description:
      "Step-by-step guide to paying for a VPN with cryptocurrency: USDT on TRC-20, BEP-20 and ERC-20, Bitcoin, network fees compared, common mistakes, privacy tips.",
    teaser:
      "USDT, BTC and 300+ coins, which network to pick, what fees to expect and the mistakes that cost people money.",
    tag: "Payments",
    published: "2026-07-07",
    updated: "2026-07-07",
    minutes: 8,
    tldr:
      "Pick a provider that invoices natively in crypto, choose the coin and network with the lowest fee for the amount (USDT on TRC-20 for small subscriptions, Bitcoin for longer prepaid terms), send the exact invoiced amount from a wallet you control, and the plan activates after one to three confirmations. No card, no billing address, no KYC.",
    keywords: [
      "pay for vpn with crypto",
      "vpn crypto payment",
      "buy vpn with bitcoin",
      "buy vpn with usdt",
      "anonymous vpn payment",
    ],
  },
  {
    slug: "vpn-without-email",
    title: "VPN Without Email or Phone Number: How Anonymous Signup Works",
    description:
      "How to get a VPN account without giving an email address or phone number: Telegram-only signup, crypto payment, what you trade away and when it matters.",
    teaser:
      "What a no-email signup really removes from the data trail, what you give up in return, and how to do it in practice.",
    tag: "Privacy",
    published: "2026-07-07",
    updated: "2026-07-07",
    minutes: 7,
    tldr:
      "A no-email VPN issues you an account identifier instead of collecting a contact address: you sign in with a generated account number or a Telegram login and pay in crypto. That removes the two links that normally tie a subscription to a real person, at the cost of self-service recovery, so the identifier itself becomes the thing you must not lose.",
    keywords: [
      "vpn without email",
      "vpn without phone number",
      "anonymous vpn account",
      "no email vpn signup",
      "vpn no personal data",
    ],
  },
  {
    slug: "vless-reality-protocol",
    title: "VLESS + Reality Explained: Why It Beats OpenVPN and WireGuard",
    description:
      "What the VLESS protocol and Reality transport actually do, how TLS camouflage defeats DPI, performance versus OpenVPN and WireGuard, and post-quantum ML-KEM.",
    teaser:
      "TLS camouflage, no giveaway handshake, real browser fingerprints. How the protocol behind Kovra works and where classic VPNs fail.",
    tag: "Protocols",
    published: "2026-07-07",
    updated: "2026-07-07",
    minutes: 9,
    tldr:
      "VLESS is a lightweight transport that adds no crypto layer of its own, and Reality is the handshake trick layered on top: the server borrows the TLS certificate chain of a real public website, so a censor inspecting the connection sees an ordinary HTTPS session to that site. There is no VPN fingerprint to block and no self-signed certificate to flag.",
    keywords: [
      "vless reality protocol",
      "vless vs wireguard",
      "reality protocol vpn",
      "xray vless explained",
      "dpi resistant vpn protocol",
    ],
  },
  {
    slug: "how-to-verify-no-logs-vpn",
    title: "No-Logs VPN Claims: How to Actually Verify Them (2026 Checklist)",
    description:
      "A practical checklist for testing no-logs VPN claims: jurisdiction, audits, court evidence, RAM-only servers, payment trails, plus the leak tests you can run yourself.",
    teaser:
      "Every VPN says it keeps no logs. A checklist of what you can verify from the outside, and the red flags that end the conversation.",
    tag: "Privacy",
    published: "2026-07-07",
    updated: "2026-07-07",
    minutes: 8,
    tldr:
      "You cannot read a provider's disks, so verify the things that leave traces outside it: jurisdiction and data-retention law, a published third-party audit with scope you can read, court records where logs were demanded and none existed, RAM-only infrastructure, and whether signup and payment create an identity trail. Anything unverifiable is marketing.",
    keywords: [
      "no log vpn verify",
      "no logs vpn check",
      "vpn logging policy",
      "how to test vpn privacy",
      "vpn audit meaning",
    ],
  },
  {
    slug: "vpn-that-accepts-usdt",
    title: "VPN That Accepts USDT (TRC-20): Full Setup in 5 Minutes",
    description:
      "Find and set up a VPN that accepts USDT: TRC-20 vs BEP-20 fees, exact payment walkthrough, connecting your first device, renewals and troubleshooting.",
    teaser:
      "From an empty wallet field to an active connection in five minutes, with the network fee table you should read first.",
    tag: "Payments",
    published: "2026-07-07",
    updated: "2026-07-07",
    minutes: 7,
    tldr:
      "Choose USDT at checkout, pick TRC-20 or BEP-20 rather than ERC-20 (a few cents versus several dollars in fees), send the exact invoiced amount to the generated address, and wait about a minute for confirmation. The subscription activates automatically, and the whole flow from empty wallet field to a connected device takes about five minutes.",
    keywords: [
      "vpn accepts usdt",
      "usdt vpn",
      "vpn pay with tether",
      "trc20 vpn payment",
      "vpn subscription usdt",
    ],
  },
  {
    slug: "truly-anonymous-vpn",
    title: "Truly Anonymous VPN in 2026: No Email, No Card, No Name",
    description:
      "What it takes to run a VPN account with zero identity attached: anonymous signup, crypto payment, no-logs infrastructure, and the honest limits of anonymity.",
    teaser:
      "The three data trails every VPN account leaves, how to cut each one, and where anonymity actually ends.",
    tag: "Privacy",
    published: "2026-07-14",
    updated: "2026-07-14",
    minutes: 8,
    tldr:
      "Three trails identify a VPN account: the signup data, the payment method, and the server-side logs. Cut all three at once by registering without an email or phone, paying in crypto from a non-KYC wallet, and choosing a provider whose no-logs posture survives outside scrutiny. Anonymity ends at your own behaviour: logging into a personal account through the tunnel undoes it.",
    keywords: [
      "anonymous vpn",
      "truly anonymous vpn",
      "vpn no personal data",
      "anonymous vpn no email",
      "vpn anonymous payment",
    ],
  },
  {
    slug: "pay-vpn-with-bitcoin",
    title: "How to Pay for a VPN with Bitcoin: Fees, Timing, Privacy",
    description:
      "Paying for a VPN with Bitcoin step by step: on-chain fees explained, when BTC beats stablecoins, confirmation times, UTXO privacy basics and costly mistakes.",
    teaser:
      "On-chain BTC is the classic way to buy a VPN. When it makes sense, what it costs, and how not to overpay the miners.",
    tag: "Payments",
    published: "2026-07-14",
    updated: "2026-07-14",
    minutes: 7,
    tldr:
      "Bitcoin pays for a VPN with no card and no billing identity, but the fee is fixed per transaction rather than proportional to the amount, so it suits annual prepayments more than monthly ones. Send the exact invoiced amount, expect one to three confirmations, and remember that sending straight from a KYC exchange links the purchase to your verified identity.",
    keywords: [
      "pay for vpn with bitcoin",
      "bitcoin vpn",
      "buy vpn with btc",
      "vpn btc payment",
      "vpn subscription bitcoin",
    ],
  },
  {
    slug: "mullvad-alternatives",
    title: "Mullvad Alternatives in 2026: When the Gold Standard Falls Short",
    description:
      "Mullvad is excellent, but WireGuard is easy for DPI to spot and port forwarding is gone. Where it falls short and which private VPNs cover those gaps.",
    teaser:
      "An honest look at what Mullvad does best, the cases it genuinely does not cover, and what to use instead.",
    tag: "Privacy",
    published: "2026-07-14",
    updated: "2026-07-14",
    minutes: 9,
    tldr:
      "Mullvad remains the reference for anonymous accounts, but three gaps push people to look elsewhere: WireGuard is easy for DPI to fingerprint on censored networks, port forwarding was removed in 2023, and streaming is an explicit non-goal. Match the gap to the fix: TLS-camouflaged protocols for censorship, AirVPN for open ports, mainstream providers for streaming.",
    keywords: [
      "mullvad alternative",
      "mullvad alternatives",
      "vpn like mullvad",
      "mullvad vs kovra",
      "anonymous vpn alternative",
    ],
  },
  {
    slug: "nordvpn-alternative-crypto",
    title: "NordVPN Alternatives That Accept Crypto (No Email Needed)",
    description:
      "NordVPN takes crypto but still wants your email. Alternatives that treat crypto as a first-class payment and skip identity at signup, compared honestly.",
    teaser:
      "Paying Nord in BTC does not make the account anonymous. What actually does, and which providers are built that way.",
    tag: "Payments",
    published: "2026-07-14",
    updated: "2026-07-14",
    minutes: 8,
    tldr:
      "NordVPN accepts cryptocurrency, but the account still requires an email, so the payment is anonymous while the subscriber is not. A genuine alternative removes identity at signup as well: Mullvad's account numbers, IVPN's no-details signup, or Kovra's Telegram-or-one-field registration with native stablecoin invoicing.",
    keywords: [
      "nordvpn alternative",
      "nordvpn alternative crypto",
      "vpn like nordvpn",
      "nordvpn without email",
      "private alternative to nordvpn",
    ],
  },
  {
    slug: "no-logs-vpn-for-torrenting",
    title: "No-Logs VPN for Torrenting: What Actually Protects You",
    description:
      "How BitTorrent exposes your IP to the swarm, what a verified no-logs VPN changes, kill switches, payment trails and the checklist before you trust a provider.",
    teaser:
      "Everyone in a torrent swarm sees your IP. What a no-logs VPN really changes, and the features that matter more than marketing.",
    tag: "Privacy",
    published: "2026-07-14",
    updated: "2026-07-14",
    minutes: 8,
    tldr:
      "Every peer in a BitTorrent swarm can see your IP address, and monitoring firms join swarms specifically to collect it. A no-logs VPN replaces that address with a shared server IP and keeps no record linking it back to you, which is what turns a copyright notice into a dead end. A kill switch matters as much as the logging policy: a two-second reconnect exposes the real IP.",
    keywords: [
      "no logs vpn torrenting",
      "vpn for torrenting",
      "p2p vpn no logs",
      "torrenting privacy vpn",
      "safe torrenting vpn",
    ],
  },
  {
    slug: "best-crypto-vpn-2026",
    title: "Best Crypto VPN in 2026: 4 Providers Compared Honestly",
    description:
      "Four VPNs that take crypto seriously in 2026: Kovra, Mullvad, IVPN and AirVPN compared on signup data, coins, protocols, DPI resistance and jurisdiction.",
    teaser:
      "Not a top-10 built from affiliate payouts: four providers where crypto and privacy are the product, compared on facts.",
    tag: "Payments",
    published: "2026-07-14",
    updated: "2026-07-14",
    minutes: 9,
    tldr:
      "Four providers treat crypto and privacy as the product rather than a checkout option in 2026: Kovra for stablecoin invoicing and DPI-resistant camouflage, Mullvad for the longest audit trail and cash by post, IVPN for Monero and multi-hop, AirVPN for port forwarding. Everything else on typical top-10 lists accepts coins but still requires an email.",
    keywords: [
      "best crypto vpn",
      "crypto vpn 2026",
      "vpn that accepts crypto",
      "best vpn crypto payment",
      "usdt vpn 2026",
    ],
  },
  {
    slug: "vpn-vs-proxy",
    title: "VPN vs Proxy: What Actually Hides Your Traffic in 2026",
    description:
      "A proxy moves your IP, a VPN encrypts the whole device. The real differences in security, speed, leaks and cost, plus which one fits each job.",
    teaser:
      "Both change the IP a website sees. Only one encrypts what your network operator can read. The difference, without the marketing.",
    tag: "Proxies",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 9,
    tldr:
      "A proxy forwards traffic from a single app and usually adds no encryption, so your network operator still sees every hostname you visit. A VPN encrypts all traffic from the whole device and hides it inside one tunnel. Use a proxy for cheap IP rotation; use a VPN whenever privacy or an untrusted network is involved.",
    keywords: [
      "vpn vs proxy",
      "proxy vs vpn",
      "difference between vpn and proxy",
      "is a proxy the same as a vpn",
      "proxy or vpn for privacy",
    ],
  },
  {
    slug: "socks5-proxy-vs-vpn",
    title: "SOCKS5 Proxy vs VPN: Speed, Encryption and When Each Wins",
    description:
      "SOCKS5 is fast and protocol-agnostic but unencrypted and per-app. Where it beats a VPN, where it quietly exposes you, and how to combine both.",
    teaser:
      "SOCKS5 is the proxy people actually use. What it does well, what it never does, and the leak that catches most users.",
    tag: "Proxies",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 8,
    tldr:
      "SOCKS5 relays TCP and UDP for one configured app with no encryption and no authentication of the traffic itself, so it is fast but visible to anyone on the path. A VPN encrypts everything device-wide at a small speed cost. Pick SOCKS5 for per-app IP changes on a network you trust, and a VPN for anything you would not want logged.",
    keywords: [
      "socks5 proxy vs vpn",
      "socks5 vpn",
      "what is socks5 proxy",
      "socks5 vs http proxy",
      "socks5 proxy privacy",
    ],
  },
  {
    slug: "free-proxy-list-risks",
    title: "Free Proxy Lists: What Really Happens to Your Traffic",
    description:
      "Public proxy lists are free because the traffic is the product. Injected ads, stripped TLS, harvested sessions, and what to use instead.",
    teaser:
      "Nobody runs thousands of open proxies out of kindness. What the operators get, and why the price is your session cookies.",
    tag: "Proxies",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 8,
    tldr:
      "Free proxy lists are run by people who need your traffic for something: ad injection, credential harvesting, botnet exit points, or resale as residential IPs. They are unencrypted, unaccountable and frequently already blocklisted. If you would not hand the operator your logged-in browser session, do not route it through their proxy.",
    keywords: [
      "free proxy list",
      "are free proxies safe",
      "free proxy server risks",
      "public proxy danger",
      "free proxy vs vpn",
    ],
  },
  {
    slug: "telegram-proxy-vs-vpn",
    title: "Telegram Proxy (MTProto) vs VPN: What to Use When Telegram Is Blocked",
    description:
      "MTProto proxies unblock Telegram in seconds but cover nothing else and expose your IP to whoever runs them. When a VPN is the better answer.",
    teaser:
      "One tap in Telegram settings versus a tunnel for the whole phone. The trade-off nobody explains before you paste that link.",
    tag: "Proxies",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 8,
    tldr:
      "An MTProto proxy unblocks Telegram alone: it takes one tap, costs nothing and leaves every other app on the blocked network. It also hands your IP and connection metadata to an anonymous operator. A VPN covers the whole device, encrypts everything and is what you want if the block is broader than Telegram or the operator is unknown.",
    keywords: [
      "telegram proxy",
      "mtproto proxy",
      "telegram vpn",
      "telegram blocked",
      "telegram proxy vs vpn",
    ],
  },
  {
    slug: "shadowsocks-vs-vless-reality",
    title: "Shadowsocks vs VLESS Reality: Which One Survives DPI in 2026",
    description:
      "Shadowsocks hides that traffic is a proxy; Reality makes it look like a real TLS session with a real site. How modern DPI tells them apart.",
    teaser:
      "Both were built to beat deep packet inspection. Only one still does it on a censored network in 2026.",
    tag: "Protocols",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 9,
    tldr:
      "Shadowsocks disguises traffic as random bytes, which modern DPI detects statistically and by active probing. VLESS with Reality instead borrows the TLS handshake of a real third-party website, so a censor sees a normal HTTPS session to a normal domain. On aggressively filtered networks Reality survives where Shadowsocks, WireGuard and OpenVPN are dropped.",
    keywords: [
      "shadowsocks vs vless",
      "shadowsocks alternative",
      "vless reality vs shadowsocks",
      "v2ray vs shadowsocks",
      "dpi bypass protocol",
    ],
  },
  {
    slug: "wireguard-vs-openvpn-vs-vless",
    title: "WireGuard vs OpenVPN vs VLESS: The Protocol Comparison That Matters",
    description:
      "Speed, battery, audit history and censorship resistance for the three protocols worth using in 2026, with a straight recommendation per use case.",
    teaser:
      "Four thousand lines versus half a million, and the one metric comparison tables always skip: does it connect at all on a filtered network.",
    tag: "Protocols",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 10,
    tldr:
      "WireGuard is the fastest and easiest to audit but trivially fingerprinted by DPI. OpenVPN is the most compatible and the slowest, with an obfuscation story bolted on. VLESS with Reality is the only one of the three designed to be indistinguishable from ordinary HTTPS. Choose on whether your network filters VPNs, not on benchmark charts.",
    keywords: [
      "wireguard vs openvpn",
      "best vpn protocol",
      "vless vs wireguard",
      "openvpn vs wireguard speed",
      "which vpn protocol to use",
    ],
  },
  {
    slug: "vpn-that-works-in-china",
    title: "VPN That Works in China in 2026: What Still Gets Through",
    description:
      "The Great Firewall blocks VPNs by protocol fingerprint and active probing. Which protocols still connect, what to set up before you fly, and what fails.",
    teaser:
      "Most VPNs fail in China for one technical reason. Understand it and the shortlist of what works becomes obvious.",
    tag: "Censorship",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 9,
    tldr:
      "The Great Firewall does not block VPNs by IP alone: it fingerprints handshakes and actively probes suspicious servers, which kills stock WireGuard, OpenVPN and IKEv2. Protocols that mimic real TLS traffic, such as VLESS with Reality, still connect. Install and test everything before you arrive, because provider websites and app stores are themselves blocked.",
    keywords: [
      "vpn that works in china",
      "best vpn for china",
      "china vpn 2026",
      "great firewall bypass",
      "vpn blocked in china",
    ],
  },
  {
    slug: "unblock-websites-at-school-or-work",
    title: "How to Unblock Websites on School or Work Wi-Fi (and the Risks)",
    description:
      "How network filters actually block sites, which bypasses still work in 2026, what your administrator can see either way, and where the real risk sits.",
    teaser:
      "DNS filters, TLS inspection, MDM profiles. What each one can and cannot see, and what happens when you route around it.",
    tag: "Censorship",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 8,
    tldr:
      "School and office filters usually work at the DNS or SNI layer, so encrypted DNS or a TLS-camouflaged tunnel bypasses them, while a managed device with an installed root certificate or MDM profile can be inspected regardless. Before bypassing anything, note that the risk is rarely technical: it is the acceptable-use policy you signed.",
    keywords: [
      "unblock websites at school",
      "bypass school wifi restrictions",
      "unblock sites at work",
      "how to access blocked websites",
      "school vpn",
    ],
  },
  {
    slug: "are-free-vpns-safe",
    title: "Are Free VPNs Safe? What You Pay When You Do Not Pay",
    description:
      "Free VPNs cost real money to run, so the revenue comes from somewhere: data sales, ad injection, bandwidth resale. How to read the business model.",
    teaser:
      "Bandwidth and servers are not free. Follow the money and the answer to whether you should install it writes itself.",
    tag: "Privacy",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 8,
    tldr:
      "A free VPN still pays for bandwidth, servers and staff, so it monetizes the only asset it has: your traffic and your device. Documented cases include selling browsing data, injecting ads, and reselling users' connections as residential proxy exit nodes. The safe free tiers are loss leaders from paid providers, and they are deliberately limited.",
    keywords: [
      "are free vpns safe",
      "free vpn risks",
      "best free vpn",
      "free vpn selling data",
      "free vs paid vpn",
    ],
  },
  {
    slug: "vpn-leak-test",
    title: "VPN Leak Test: Check DNS, IPv6 and WebRTC in Five Minutes",
    description:
      "A connected VPN can still leak your real IP through DNS, IPv6 or WebRTC. The exact tests to run, how to read the results, and how to fix each leak.",
    teaser:
      "The icon says connected. That tells you nothing about DNS, IPv6 or what your browser hands out over WebRTC.",
    tag: "Privacy",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 8,
    tldr:
      "Run four checks: your public IP, a DNS leak test, an IPv6 reachability test, and a WebRTC local-IP check, each with the VPN connected. If the DNS resolvers or the IPv6 address belong to your home ISP, the tunnel is leaking. Most leaks are fixed by enabling the kill switch, forcing the provider's DNS, and disabling IPv6 or WebRTC.",
    keywords: [
      "vpn leak test",
      "dns leak test",
      "webrtc leak",
      "ipv6 leak vpn",
      "is my vpn working",
    ],
  },
  {
    slug: "vpn-for-public-wifi",
    title: "Public Wi-Fi Security: What a VPN Actually Prevents in 2026",
    description:
      "HTTPS fixed most cafe-Wi-Fi attacks, but not all of them. What still leaks on an open network, what a VPN closes, and what it cannot help with.",
    teaser:
      "The password-sniffing story is a decade out of date. Here is what an open network still reveals about you.",
    tag: "Privacy",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 7,
    tldr:
      "HTTPS already protects the contents of most connections on open Wi-Fi, so the modern risks are metadata and manipulation: every domain you visit, captive portals that tamper with traffic, and rogue access points impersonating the venue. A VPN hides the domain list and pins your traffic to one encrypted tunnel, which is exactly the gap HTTPS leaves open.",
    keywords: [
      "public wifi vpn",
      "is public wifi safe",
      "hotel wifi security",
      "airport wifi vpn",
      "vpn for coffee shop wifi",
    ],
  },
  {
    slug: "how-to-set-up-vpn-on-iphone",
    title: "How to Set Up a VPN on iPhone in 2026: The Fast, Private Way",
    description:
      "Set up a VPN on iPhone in about three minutes: which client to install, how subscription links work, iCloud Private Relay conflicts and battery settings.",
    teaser:
      "Skip the App Store roulette. A subscription link, one client app, and the toggles that decide whether it stays connected.",
    tag: "Setup",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 7,
    tldr:
      "Install a client that supports modern protocols, paste the subscription link your provider gives you, allow the VPN configuration prompt once, and connect. On iOS the two settings that matter afterwards are Connect On Demand, which reconnects automatically, and iCloud Private Relay, which should be off to avoid double-tunnelling Safari.",
    keywords: [
      "how to set up vpn on iphone",
      "vpn for iphone",
      "iphone vpn configuration",
      "ios vpn setup",
      "best vpn app iphone",
    ],
  },
  {
    slug: "cheapest-private-vpn",
    title: "Cheapest Private VPN in 2026: What $3 a Month Really Buys",
    description:
      "Honest pricing math for private VPNs: what a server actually costs, why $1 plans exist, renewal traps, and the cheapest options that stay private.",
    teaser:
      "Two-year prepay headlines hide the renewal price. The real per-month cost of a VPN that does not sell your data.",
    tag: "Payments",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 8,
    tldr:
      "Around $2.50 to $5 a month is the honest floor for a private VPN once bandwidth, servers and support are paid for. Headline prices below that are almost always two-year prepay deals that renew two to three times higher, or services monetizing data. Compare the renewal price and the signup data required, not the front-page number.",
    keywords: [
      "cheapest vpn",
      "cheap vpn 2026",
      "best budget vpn",
      "vpn under 3 dollars",
      "affordable private vpn",
    ],
  },
  {
    slug: "expressvpn-alternative",
    title: "ExpressVPN Alternatives in 2026: Privacy-First Options Compared",
    description:
      "ExpressVPN is polished but mainstream: email signup, Kape ownership, WireGuard-class fingerprint. Alternatives that fix each of those, compared honestly.",
    teaser:
      "What you actually pay for with ExpressVPN, which parts you may not need, and the providers that cover each gap.",
    tag: "Comparisons",
    published: "2026-07-27",
    updated: "2026-07-27",
    minutes: 9,
    tldr:
      "ExpressVPN buys you a wide server map, reliable streaming and a polished app, at roughly three times the price of privacy-first providers and with an identity-linked account. If you want anonymity, look at Mullvad, IVPN or Kovra; if you want censorship resistance, look for TLS-camouflaged protocols; if you want streaming, the mainstream field is genuinely competitive.",
    keywords: [
      "expressvpn alternative",
      "alternatives to expressvpn",
      "vpn like expressvpn",
      "expressvpn vs mullvad",
      "cheaper than expressvpn",
    ],
  },
] as const;

export function getGuide(slug: string): GuideMeta {
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) throw new Error(`unknown guide slug: ${slug}`);
  return g;
}

/**
 * Related guides for the footer block: the 3 entries after this one in the
 * registry, wrapping around. Rotation (instead of "always the first 3")
 * spreads internal links evenly across all guides, which matters for
 * crawl discovery and PageRank flow once the registry grows past a few
 * entries.
 */
export function relatedGuides(slug: string): GuideMeta[] {
  const i = GUIDES.findIndex((g) => g.slug === slug);
  if (i === -1) return GUIDES.slice(0, 3) as GuideMeta[];
  const rotated = [...GUIDES.slice(i + 1), ...GUIDES.slice(0, i)];
  return rotated.slice(0, 3);
}

/**
 * Order in which topic buckets are rendered on /guides. Commercial-intent
 * buckets first: those are the ones a visitor who arrived from a "vpn that
 * accepts usdt"-style query is most likely to click next.
 */
export const TAG_ORDER: readonly GuideTag[] = [
  "Payments",
  "Privacy",
  "Proxies",
  "Protocols",
  "Censorship",
  "Comparisons",
  "Setup",
] as const;

/** Guides grouped by tag in TAG_ORDER, empty buckets dropped. */
export function guidesByTag(): { tag: GuideTag; items: GuideMeta[] }[] {
  return TAG_ORDER.map((tag) => ({
    tag,
    items: GUIDES.filter((g) => g.tag === tag) as GuideMeta[],
  })).filter((group) => group.items.length > 0);
}

/** schema.org Article for a guide. Rendered via jsonLd() like other schemas. */
export function buildGuideArticleSchema(g: GuideMeta, ogImage: string) {
  const url = `${SITE_URL}/guides/${g.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    // `abstract` is the direct answer block rendered at the top of the page.
    // Answer engines (Google AI Overviews, Perplexity, ChatGPT search) quote
    // it, so it must match the visible text exactly — same rule as FAQPage.
    ...(g.tldr ? { abstract: g.tldr } : {}),
    // schema.org keywords takes a comma-separated string. Unlike the <meta>
    // keywords tag it is a documented property Google parses for topical
    // classification, which is why we repeat the registry terms here.
    keywords: g.keywords.join(", "),
    articleSection: g.tag,
    datePublished: g.published,
    dateModified: g.updated,
    inLanguage: "en",
    isAccessibleForFree: true,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: [ogImage],
    author: { "@type": "Organization", name: "Kovra", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "Kovra",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-192.png` },
    },
  };
}

export function fmtGuideDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Next Metadata object for a guide page (title, canonical, OG article). */
export function buildGuideMetadata(
  slug: string,
  ogImage: string,
): {
  title: string;
  description: string;
  keywords: string[];
  alternates: { canonical: string };
  openGraph: {
    type: "article";
    title: string;
    description: string;
    url: string;
    publishedTime: string;
    modifiedTime: string;
    images: { url: string; width: number; height: number; alt: string }[];
  };
  twitter: { title: string; description: string; images: string[] };
} {
  const g = getGuide(slug);
  return {
    title: g.title,
    description: g.description,
    keywords: g.keywords,
    alternates: { canonical: `/guides/${g.slug}` },
    openGraph: {
      type: "article",
      title: `${g.title} | Kovra`,
      description: g.description,
      url: `/guides/${g.slug}`,
      publishedTime: g.published,
      modifiedTime: g.updated,
      images: [{ url: ogImage, width: 1200, height: 630, alt: g.title }],
    },
    twitter: {
      title: `${g.title} | Kovra`,
      description: g.description,
      images: [ogImage],
    },
  };
}

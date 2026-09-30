#!/usr/bin/env node
// scripts/bot-screens.mjs
//
// Offline harness for the new bot interface (bot v2): renders every screen,
// in every bot language, to one HTML page (and a Markdown twin) so a person
// can review texts and keyboards without Telegram.
//
// Nothing leaves this machine. Redis is the in-memory stand-in from the tests
// (tests/support/memory-redis.mjs), and fetch is replaced: calls to the Bot
// API are recorded instead of sent, the device-creation call is answered
// locally, and any other request fails loudly.
//
// Two parts:
//   1. Every screen renderer (src/lib/bot-v2/screens.ts) with fixture
//      accounts, in en/ru/es/de/fr.
//   2. A walk through the real webhook (src/app/api/auth/telegram/webhook) as
//      a gated user: /start, Connect, a new iPhone, its QR, Balance, an order,
//      the payment, and the notices the payment webhooks send. This proves the
//      wiring, not only the renderers.
//
// Run:  node scripts/bot-screens.mjs --out ~/vpn-project/design/kovra-miniapp-2026-09-30/bot
// Also checks each screen (length, button labels, callback_data size, copy
// rules) and prints the warnings; exit code 1 when there are any.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 && process.argv[outArg + 1] ? process.argv[outArg + 1] : "bot-screens-out");

// Made-up credentials: nothing here can reach a real bot.
process.env.TELEGRAM_BOT_TOKEN = "000000:harness-not-a-token";
process.env.TELEGRAM_WEBHOOK_SECRET = "harness-secret";
process.env.KOVRA_BOT_V2_ALL = "1";
process.env.INTERNAL_API_KEY = "harness-internal";
process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://kovra.harness";
delete process.env.KOVRA_STATIC_PANELS;

const { setRedisModule } = await import("../tests/support/load-ts.mjs");
setRedisModule(new URL("../tests/support/memory-redis.mjs", import.meta.url));
const mem = await import("../tests/support/memory-redis.mjs");

const { BOT_LANGS } = await import("../src/lib/bot-i18n.ts");
const S = await import("../src/lib/bot-v2/screens.ts");
const { renderNotice, notifyUser } = await import("../src/lib/bot-v2/notify.ts");
const { deviceViews } = await import("../src/lib/bot-v2/controller.ts");
const { tr } = await import("../src/lib/bot-v2/i18n.ts");

// ─── Fixtures ───────────────────────────────────────────────────────────────

const NOW = Date.UTC(2026, 8, 30, 12, 0, 0);
const DAY = 86_400_000;
const TOKEN = "3f9c2a7e5b1d4c6f8a0e2b4d6f8a1c3e";
const profiles = (types) =>
  types.map((t, i) => ({ uuid: `0b1c2d3e-0000-4000-8000-00000000000${i}`, deviceType: t, clientEmail: "", vlessUrl: "", createdAt: i }));

function view(lang, v) {
  return {
    balanceCents: 0,
    activeSlots: 0,
    activeUntil: 0,
    lastExpiry: 0,
    planKind: null,
    planUntil: 0,
    lastPlanKind: null,
    ...v,
    devices: deviceViews(profiles(v.types ?? []), lang),
  };
}

const FIXTURES = {
  newcomer: { balanceCents: 0 },
  active: {
    balanceCents: 1250,
    activeSlots: 3,
    activeUntil: NOW + 40 * DAY,
    lastExpiry: NOW + 40 * DAY,
    planKind: "plan3",
    planUntil: NOW + 40 * DAY,
    lastPlanKind: "plan3",
    types: ["iphone", "mac"],
  },
  full: {
    balanceCents: 300,
    activeSlots: 1,
    activeUntil: NOW + 12 * DAY,
    lastExpiry: NOW + 12 * DAY,
    planKind: "plan1",
    planUntil: NOW + 12 * DAY,
    lastPlanKind: "plan1",
    types: ["android"],
  },
  ended: {
    balanceCents: 300,
    lastExpiry: NOW - 3 * DAY,
    lastPlanKind: "plan1",
    types: ["android", "android"],
  },
  rich: { balanceCents: 10_000 },
  tv: {
    balanceCents: 0,
    activeSlots: 3,
    activeUntil: NOW + 40 * DAY,
    lastExpiry: NOW + 40 * DAY,
    planKind: "plan3",
    planUntil: NOW + 40 * DAY,
    lastPlanKind: "plan3",
    types: ["iphone", "mac", "tv"],
  },
};

const METHODS = [
  { id: "card", minUsd: 5 },
  { id: "cryptobot", minUsd: 5 },
  { id: "crypto", minUsd: 8 },
  { id: "lava", minUsd: 5 },
];

function detail(v, i) {
  return { ...v.devices[i], subToken: TOKEN, subUrl: `https://kovravpn.com/api/sub/${TOKEN}` };
}

/** Every screen for one language: [id, title, screen]. */
function screensFor(lang) {
  const V = (name) => view(lang, FIXTURES[name]);
  const out = [];
  const add = (id, title, screen) => out.push({ id, title, screen });

  add("home-new", "Home · new account", S.homeScreen(V("newcomer"), lang, NOW));
  add("home-active", "Home · active plan", S.homeScreen(V("active"), lang, NOW));
  add("home-active-nodevice", "Home · active, no devices", S.homeScreen({ ...V("active"), devices: [] }, lang, NOW));
  add("home-ended", "Home · plan ended", S.homeScreen(V("ended"), lang, NOW));
  add("home-ref", "Home · after /start ref_…", S.homeScreen(V("newcomer"), lang, NOW, tr("note.ref", lang, { days: 14 })));
  add("connect-pick", "Connect · pick a device", S.connectScreen(V("active"), lang));
  add("connect-noplan", "Connect · no plan (plan choice)", S.connectScreen(V("newcomer"), lang));
  add("connect-full", "Connect · all slots used", S.connectScreen(V("full"), lang));
  add("creating", "Connect · creating", S.creatingScreen("iphone", lang));
  add("create-failed", "Connect · servers down", S.createFailedScreen("iphone", "unavailable", lang));
  add("devices", "My devices", S.devicesScreen(V("active"), lang));
  add("devices-empty", "My devices · none", S.devicesScreen(V("newcomer"), lang));
  add("devices-paused", "My devices · plan ended", S.devicesScreen(V("ended"), lang));
  add("devices-full", "My devices · all slots used", S.devicesScreen(V("full"), lang));
  const active = V("active");
  add("device", "Device · iPhone", S.deviceScreen(active, detail(active, 0), lang));
  add("device-new", "Device · just created", S.deviceScreen(active, detail(active, 0), lang, tr("dev.ready", lang, { dev: active.devices[0].label })));
  const tv = V("tv");
  add("device-tv", "Device · TV", S.deviceScreen(tv, detail(tv, 2), lang));
  const ended = V("ended");
  add("device-paused", "Device · plan ended", S.deviceScreen(ended, detail(ended, 1), lang));
  add("qr", "QR photo caption", S.qrPhoto("iPhone", lang));
  add("delete-confirm", "Remove · confirm", S.deleteConfirmScreen(active.devices[0], lang));
  add("deleting", "Remove · in progress", S.deletingScreen(active.devices[0].label, lang));
  add("wallet-new", "Balance & plans · new", S.walletScreen(V("newcomer"), lang));
  add("wallet-active", "Balance & plans · active", S.walletScreen(V("active"), lang));
  add("wallet-ended", "Balance & plans · ended", S.walletScreen(V("ended"), lang));
  add("plans", "Plans", S.plansScreen(V("newcomer"), lang, "w"));
  add("terms", "Terms · 3 devices", S.termsScreen(V("newcomer"), "plan3", lang, "w"));
  add("terms-renew", "Terms · renewal", S.termsScreen(V("active"), "plan3", lang, "w"));
  add("slot", "Extra slot", S.slotScreen(V("full"), lang, "w"));
  add("order-enough", "Order · enough balance", S.orderScreen(V("rich"), "plan3", 6, "n0nceAbc", lang, "w"));
  add("order-short", "Order · not enough", S.orderScreen(V("active"), "plan3", 6, "n0nceAbc", lang, "w"));
  add("order-renew", "Order · renewal", S.orderScreen({ ...V("active"), balanceCents: 20_000 }, "plan3", 12, "n0nceAbc", lang, "w"));
  add("order-slot", "Order · extra slot", S.orderScreen(V("full"), "slot", 1, "n0nceAbc", lang, "w"));
  add("paid", "Paid", S.paidScreen({ ...V("active"), devices: [] }, "plan3", 6, lang));
  add("pay-other-plan", "Pay · other plan runs", S.payProblemScreen("other_plan", lang, { a: "wallet" }, "plan1"));
  add("pay-refunded", "Pay · refunded", S.payProblemScreen("refunded", lang, { a: "wallet" }, null));
  add("topup", "Top up · methods", S.topupScreen(V("active"), METHODS, lang, null));
  add("topup-for", "Top up · for an order", S.topupScreen(V("active"), METHODS, lang, { product: "plan3", term: 6, needCents: 4144, from: "w" }));
  add("topup-none", "Top up · nothing configured", S.topupScreen(V("active"), [], lang, null));
  add("topup-amount", "Top up · amounts", S.topupAmountScreen("card", 5, 1000, [10, 20, 50, 100], lang, 0));
  add("topup-amount-need", "Top up · amounts for an order", S.topupAmountScreen("crypto", 8, 1000, [10, 20, 50, 100], lang, 4144));
  add("topup-manual", "Top up · type an amount", S.topupManualScreen("card", 5, 1000, lang));
  add("topup-manual-bad", "Top up · bad amount", S.topupManualScreen("card", 5, 1000, lang, true));
  add("invoice-card", "Invoice · card", S.invoiceScreen("card", 2000, "https://pay.example/card", "$20.00", lang));
  add("invoice-crypto", "Invoice · crypto", S.invoiceScreen("crypto", 2000, "https://pay.example/crypto", "$20.00", lang));
  add("invoice-cryptobot", "Invoice · CryptoBot", S.invoiceScreen("cryptobot", 2000, "https://t.me/CryptoBot?start=x", "$20.00", lang));
  add("invoice-lava", "Invoice · lava.top", S.invoiceScreen("lava", 2000, "https://pay.example/lava", "€18.40", lang));
  add(
    "lava-methods",
    "lava.top · methods",
    S.lavaMethodsScreen(
      2000,
      [
        { id: "card", currency: "USD", charge: "$20.00" },
        { id: "paypal", currency: "USD", charge: "$20.00" },
        { id: "applepay", currency: "USD", charge: "$20.00" },
        { id: "sepa", currency: "EUR", charge: "€18.40" },
        { id: "ideal", currency: "EUR", charge: "€18.40" },
        { id: "pix", currency: "USD", charge: "$20.00" },
      ],
      lang,
    ),
  );
  add("invoice-error", "Invoice · failed", S.invoiceErrorScreen("card", lang));
  add("promo-ask", "Promo · ask", S.promoAskScreen(lang));
  add("promo-ok", "Promo · applied", S.promoResultScreen({ ok: true, amountCents: 500, balanceCents: 1750 }, lang));
  add("promo-used", "Promo · already used", S.promoResultScreen({ ok: false, error: "already_used" }, lang));
  add("invite", "Invite friends", S.inviteScreen({ link: "https://t.me/KovraVPN_bot?start=ref_a1b2c3d4", total: 3, paid: 1 }, lang));
  add("help", "Help", S.helpScreen(lang));
  add("language", "Language", S.languageScreen(lang));
  add("error", "Error", S.errorScreen(lang));
  add("nt-topup", "Notice · top-up", renderNotice({ kind: "topup", amountCents: 2000, balanceCents: 3250 }, lang));
  add(
    "nt-topup-order",
    "Notice · top-up that covers an order",
    renderNotice({ kind: "topup", amountCents: 5000, balanceCents: 6250 }, lang, { product: "plan3", term: 6, from: "w" }),
  );
  add(
    "nt-purchase",
    "Notice · payment received",
    renderNotice({ kind: "purchase", product: { kind: "plan3", term: 6 }, activeSlots: 3, untilMs: NOW + 180 * DAY }, lang),
  );
  add(
    "nt-purchase-slot",
    "Notice · extra slot paid",
    renderNotice({ kind: "purchase", product: { kind: "device", days: 30 }, activeSlots: 4, untilMs: NOW + 30 * DAY }, lang),
  );
  add("nt-ref", "Notice · referral reward", renderNotice({ kind: "referral_reward" }, lang));
  add("nt-expiring", "Notice · plan ends soon", renderNotice({ kind: "expiring", hoursLeft: 20 }, lang));
  add("nt-expired", "Notice · plan ended", renderNotice({ kind: "expired" }, lang));
  return out;
}

// ─── Part 2: through the real webhook ───────────────────────────────────────

const transcript = [];
const realFetch = globalThis.fetch;
let messageSeq = 500;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.telegram.org/")) {
    const method = url.split("/").pop();
    let body = null;
    if (init.body instanceof FormData) {
      body = { caption: init.body.get("caption"), reply_markup: JSON.parse(String(init.body.get("reply_markup") ?? "{}")), photo: "(PNG)" };
    } else if (typeof init.body === "string") body = JSON.parse(init.body);
    transcript.push({ method, body });
    return Response.json({ ok: true, result: { message_id: ++messageSeq } });
  }
  if (url === "https://kovra.harness/api/vpn/create") {
    const { userId, deviceType } = JSON.parse(String(init.body));
    const key = `profiles:${userId}`;
    const list = mem.store.has(key) ? JSON.parse(mem.store.get(key)) : [];
    const subToken = TOKEN;
    list.push({ uuid: "7e57de71-0000-4000-8000-000000000001", clientEmail: "harness", vlessUrl: "", createdAt: NOW, deviceType, subToken });
    mem.store.set(key, JSON.stringify(list));
    mem.store.set(`sub_prof:${subToken}`, JSON.stringify({ userId, uuid: "7e57de71-0000-4000-8000-000000000001" }));
    return Response.json({ success: true, subToken });
  }
  throw new Error(`bot-screens: unexpected request to ${url}`);
};

async function walkWebhook() {
  const { NextRequest } = await import("next/server");
  const { POST } = await import("../src/app/api/auth/telegram/webhook/route.ts");
  const CHAT = 700000001;
  let update = 1;
  const steps = [];
  const post = async (label, payload) => {
    const before = transcript.length;
    const res = await POST(
      new NextRequest("https://kovra.harness/api/auth/telegram/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "harness-secret" },
        body: JSON.stringify({ update_id: update++, ...payload }),
      }),
    );
    steps.push({ label, status: res.status, calls: transcript.slice(before) });
  };
  const from = { id: CHAT, first_name: "Harness", language_code: "en" };
  const text = (label, t) => post(label, { message: { message_id: 10 + update, chat: { id: CHAT }, from, text: t } });
  const tap = (label, data) =>
    post(label, { callback_query: { id: `cb${update}`, from, data, message: { chat: { id: CHAT }, message_id: 42 } } });

  await text("/start (new account)", "/start");
  await tap("Connect a device (no plan yet)", "k:connect");
  mem.store.set(`balance_usd:tg_${CHAT}`, "6000");
  await tap("3 devices", "k:terms:plan3:c");
  await tap("6 months", "k:ord:plan3:6:c");
  await tap("Pay from balance", "k:pay:plan3:6:harness1:c");
  await tap("Pay again (double tap, same nonce)", "k:pay:plan3:6:harness1:c");
  await tap("Connect a device (plan active)", "k:connect");
  await tap("iPhone", "k:new:iphone");
  await tap("QR code", "k:qr:7e57de71-0000-4000-8000-000000000001");
  await tap("Someone else's device (forged)", "k:dev:0a0a0a0a-0000-4000-8000-00000000dead");
  await tap("Remove", "k:del:7e57de71-0000-4000-8000-000000000001");
  await tap("Balance & plans", "k:wallet");
  await tap("Promo code", "k:promo");
  await text("Types a promo code", "NOSUCHCODE");
  await tap("Old-interface button: buyterm_plan1_1 (now an order, not a charge)", "buyterm_plan1_1");
  await text("/help", "/help");
  await text("Random text", "hello?");
  await text("/whoami (not the owner)", "/whoami");

  // Notices, as the payment webhooks send them.
  const before = transcript.length;
  await notifyUser(`tg_${CHAT}`, { kind: "topup", amountCents: 2000, balanceCents: 3250 }, "LEGACY TEXT (not shown to v2 chats)");
  steps.push({ label: "Payment webhook: top-up notice", status: 200, calls: transcript.slice(before) });
  return steps;
}

// ─── Checks ─────────────────────────────────────────────────────────────────

const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function check(lang, id, screen) {
  const warnings = [];
  const text = plain(screen.text);
  const lines = text.split("\n").length;
  if (text.length > 600) warnings.push(`long text (${text.length} chars)`);
  if (lines > 16) warnings.push(`${lines} lines`);
  if (/\bVPN\b/i.test(text)) warnings.push(`the word "VPN" (copy rules)`);
  if (text.includes("—")) warnings.push("an em dash (copy rules: short hyphens)");
  if (screen.kb.length > 8) warnings.push(`${screen.kb.length} keyboard rows`);
  for (const row of screen.kb) {
    if (row.length > 3) warnings.push(`a row of ${row.length} buttons`);
    for (const b of row) {
      // What fits a phone (375 pt) without Telegram's ellipsis.
      const limit = row.length === 1 ? 40 : row.length === 2 ? 20 : 12;
      if ([...b.text].length > limit) warnings.push(`button "${b.text}" is ${[...b.text].length} chars (limit ${limit} in a row of ${row.length})`);
      if (b.callback_data && Buffer.byteLength(b.callback_data) > 64) warnings.push(`callback_data over 64 bytes: ${b.callback_data}`);
      if (!b.callback_data && !b.url && !b.web_app) warnings.push(`button "${b.text}" does nothing`);
      if (b.url && !/^https:\/\//.test(b.url)) warnings.push(`button "${b.text}" url is not https`);
    }
  }
  const backs = screen.kb.filter((r) => r.length === 1 && /^← /.test(r[0].text));
  if (backs.length > 1) warnings.push("more than one Back row");
  return warnings.map((w) => `[${lang}] ${id}: ${w}`);
}

// ─── Output ─────────────────────────────────────────────────────────────────

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Telegram HTML to page HTML: only our own markup (b, i, code, pre) survives. */
function tgHtml(text) {
  return String(text)
    .split(/(<\/?(?:b|i|code|pre)>)/g)
    .map((part) => (/^<\/?(?:b|i|code|pre)>$/.test(part) ? part : esc(plain(part))))
    .join("")
    .replace(/\n/g, "<br>");
}

function buttonHtml(b) {
  let kind = "cb";
  let hint = b.callback_data ?? "";
  if (b.web_app) {
    kind = "app";
    hint = `Mini App · ${b.web_app.url}`;
  } else if (b.url) {
    kind = "url";
    hint = b.url;
  }
  return `<span class="btn btn-${kind}" title="${esc(hint)}">${esc(b.text)}${kind === "url" ? ' <i class="arrow">↗</i>' : kind === "app" ? ' <i class="arrow">⧉</i>' : ""}</span>`;
}

function bubbleHtml(screen, photo = false) {
  const rows = screen.kb.map((row) => `<div class="row">${row.map(buttonHtml).join("")}</div>`).join("");
  return `<div class="msg">${photo ? '<div class="photo">QR</div>' : ""}<div class="bubble">${tgHtml(screen.text)}</div>${rows ? `<div class="kb">${rows}</div>` : ""}</div>`;
}

function mdScreen(screen) {
  const kb = screen.kb.map((row) => "    [ " + row.map((b) => `${b.text}${b.web_app ? " (Mini App)" : b.url ? " ↗" : ""}`).join(" | ") + " ]").join("\n");
  return "```\n" + plain(screen.text) + "\n```\n" + (kb ? kb + "\n" : "");
}

const all = {};
const warnings = [];
for (const lang of BOT_LANGS) {
  all[lang] = screensFor(lang);
  for (const s of all[lang]) warnings.push(...check(lang, s.id, s.screen));
}
const steps = await walkWebhook();
globalThis.fetch = realFetch;

const tabs = BOT_LANGS.map((l, i) => `<button class="tab${i === 0 ? " on" : ""}" data-lang="${l}">${l.toUpperCase()}</button>`).join("");
const panels = BOT_LANGS.map(
  (l, i) => `<section class="panel${i === 0 ? " on" : ""}" data-lang="${l}">${all[l]
    .map((s) => `<figure id="${l}-${s.id}"><figcaption>${esc(s.title)}</figcaption>${bubbleHtml(s.screen, s.id === "qr")}</figure>`)
    .join("")}</section>`,
).join("");
const walk = steps
  .map((st) => {
    const calls = st.calls
      .filter((c) => c.method !== "answerCallbackQuery" || c.body?.text)
      .map((c) => {
        if (c.method === "answerCallbackQuery") return `<div class="call"><code>answerCallbackQuery</code> toast: “${esc(c.body.text)}”</div>`;
        if (c.method === "deleteMessage" || c.method === "sendChatAction") return `<div class="call"><code>${c.method}</code></div>`;
        const screen = { text: c.body?.text ?? c.body?.caption ?? "", kb: c.body?.reply_markup?.inline_keyboard ?? [] };
        return `<div class="call"><code>${esc(c.method)}</code>${bubbleHtml(screen, c.method === "sendPhoto")}</div>`;
      })
      .join("");
    return `<div class="step"><h3>${esc(st.label)} <small>HTTP ${st.status}</small></h3>${calls || '<div class="call"><i>no messages</i></div>'}</div>`;
  })
  .join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kovra bot screens</title>
<style>
:root{--bg:#0e1621;--chat:#0e1621;--bubble:#182533;--text:#f5f5f5;--muted:#8a9aa9;--btn:#1f2f3f;--btn-text:#e8eef4;--accent:#D9A441;--line:rgba(255,255,255,.08)}
@media (prefers-color-scheme: light){:root{--bg:#e7ebf0;--chat:#c9d6c4;--bubble:#fff;--text:#111;--muted:#5b6770;--btn:rgba(0,0,0,.28);--btn-text:#fff;--line:rgba(0,0,0,.1)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}
h1{font-size:17px;margin:0 12px 0 0}.tab{border:1px solid var(--line);background:transparent;color:var(--text);border-radius:999px;padding:6px 14px;font:inherit;cursor:pointer}.tab.on{background:var(--accent);color:#111;border-color:var(--accent)}
main{padding:16px;max-width:1400px;margin:0 auto}.panel{display:none;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}.panel.on{display:grid}
figure{margin:0;background:var(--chat);border-radius:12px;padding:12px;border:1px solid var(--line)}figcaption{color:var(--muted);font-size:12px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em}
.msg{max-width:390px}.bubble{background:var(--bubble);border-radius:12px;padding:8px 10px;overflow-wrap:anywhere}.bubble code{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#7fc4ff}
.photo{background:#fff;color:#111;height:120px;border-radius:12px 12px 0 0;display:grid;place-items:center;font-weight:700;letter-spacing:.2em}
.kb{margin-top:4px;display:flex;flex-direction:column;gap:4px}.row{display:flex;gap:4px}.btn{flex:1;background:var(--btn);color:var(--btn-text);border-radius:8px;padding:8px 6px;text-align:center;font-size:14px;position:relative;cursor:help;min-width:0}
.btn .arrow{position:absolute;top:2px;right:5px;font-size:10px;font-style:normal;opacity:.8}.btn-app{outline:1px solid var(--accent)}
.walk{margin-top:40px}.step{margin:0 0 24px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--chat)}.step h3{margin:0 0 8px;font-size:15px}.step small{color:var(--muted);font-weight:400}
.call{margin:8px 0}.call>code{display:block;color:var(--muted);font-size:12px;margin-bottom:4px}
.warn{background:#3a1d1d;color:#ffd3d3;border-radius:12px;padding:12px 16px;margin-bottom:16px;white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:12px}.ok{color:var(--muted);margin-bottom:16px}
@media (max-width:420px){main{padding:16px 16px}.panel{grid-template-columns:1fr}}
</style></head><body>
<header><h1>Kovra bot v2 · ${all.en.length} screens × ${BOT_LANGS.length} languages</h1>${tabs}</header>
<main>
${warnings.length ? `<div class="warn">${esc(warnings.join("\n"))}</div>` : '<p class="ok">Checks passed: lengths, button labels, callback_data size, copy rules.</p>'}
${panels}
<section class="walk"><h2>Walk through the real webhook (English, gated user)</h2>${walk}</section>
</main>
<script>
document.querySelectorAll('.tab').forEach(function(t){t.addEventListener('click',function(){
document.querySelectorAll('.tab,.panel').forEach(function(x){x.classList.toggle('on',x.dataset.lang===t.dataset.lang)});});});
</script>
</body></html>`;

const md = [
  `# Kovra bot v2 screens`,
  "",
  `Generated by scripts/bot-screens.mjs. ${all.en.length} screens × ${BOT_LANGS.length} languages.`,
  "",
  warnings.length ? `## Warnings\n\n${warnings.map((w) => `- ${w}`).join("\n")}\n` : "No warnings.\n",
  ...BOT_LANGS.flatMap((l) => [`## ${l.toUpperCase()}`, "", ...all[l].flatMap((s) => [`### ${s.title}`, "", mdScreen(s.screen)])]),
  "## Webhook walk (en)",
  "",
  ...steps.flatMap((st) => [
    `### ${st.label} (HTTP ${st.status})`,
    "",
    ...st.calls
      .filter((c) => !["answerCallbackQuery", "sendChatAction", "deleteMessage"].includes(c.method) || c.body?.text)
      .map((c) =>
        c.method === "answerCallbackQuery"
          ? `toast: ${c.body.text}\n`
          : `${c.method}\n` + mdScreen({ text: c.body?.text ?? c.body?.caption ?? "", kb: c.body?.reply_markup?.inline_keyboard ?? [] }),
      ),
  ]),
].join("\n");

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "index.html"), html);
writeFileSync(resolve(OUT, "screens.md"), md);
console.log(`bot-screens: ${all.en.length} screens × ${BOT_LANGS.length} languages, ${steps.length} webhook steps → ${OUT}`);
if (warnings.length) {
  console.log(`${warnings.length} warning(s):\n${warnings.join("\n")}`);
  process.exitCode = 1;
}

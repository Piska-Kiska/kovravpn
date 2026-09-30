#!/usr/bin/env node
// scripts/telegram-setup.mjs
//
// Sets up the bot's command list (setMyCommands) and its menu button
// (setChatMenuButton → the Mini App) for the new interface (bot v2).
//
// DRY RUN BY DEFAULT: without --apply nothing is sent anywhere, the script
// only prints the exact Bot API calls it would make. With --apply it makes
// them and prints Telegram's answers.
//
// Owner first. The new interface is gated (src/lib/bot-v2/gate.ts), so the
// commands and the button go to the owner's chat first:
//
//   TELEGRAM_BOT_TOKEN=… node scripts/telegram-setup.mjs --chat <owner chat id>            # dry run
//   TELEGRAM_BOT_TOKEN=… node scripts/telegram-setup.mjs --chat <owner chat id> --apply
//
// and to everyone only once the gate is open for everyone
// (SADD kovra:botv2:users "*" or KOVRA_BOT_V2_ALL=1):
//
//   TELEGRAM_BOT_TOKEN=… node scripts/telegram-setup.mjs --default --apply
//
// Undo: add --reset (deleteMyCommands and the default menu button, for the
// same --chat / --default targets).
//
// Options:
//   --chat <id>      a private chat to set up (repeatable)
//   --default        everyone (the bot-wide default)
//   --only commands|menu   one of the two (default: both)
//   --url <https…>   Mini App URL for the menu button (default https://kovravpn.com/tg)
//   --text <label>   menu button label (default "Kovra")
//   --reset          remove what this script sets
//   --apply          actually call the Bot API

const API = "https://api.telegram.org/bot";
const DEFAULT_URL = "https://kovravpn.com/tg";
const DEFAULT_TEXT = "Kovra";

/** The commands the bot v2 understands (lib/bot-v2/controller.ts parseCommand). */
const COMMANDS = {
  en: { menu: "Main menu", devices: "My devices", balance: "Balance & plans", help: "Help", language: "Language" },
  ru: { menu: "Главное меню", devices: "Мои устройства", balance: "Баланс и тарифы", help: "Помощь", language: "Язык" },
  es: { menu: "Menú principal", devices: "Mis dispositivos", balance: "Saldo y planes", help: "Ayuda", language: "Idioma" },
  de: { menu: "Hauptmenü", devices: "Meine Geräte", balance: "Guthaben & Tarife", help: "Hilfe", language: "Sprache" },
  fr: { menu: "Menu principal", devices: "Mes appareils", balance: "Solde et forfaits", help: "Aide", language: "Langue" },
};
const ORDER = ["menu", "devices", "balance", "help", "language"];

function fail(message) {
  console.error(`telegram-setup: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { chats: [], all: false, only: null, url: DEFAULT_URL, text: DEFAULT_TEXT, reset: false, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      return v;
    };
    if (a === "--chat") {
      const v = next();
      if (!/^[1-9][0-9]{4,15}$/.test(v)) fail(`--chat must be a private chat id (digits), got "${v}"`);
      opts.chats.push(Number(v));
    } else if (a === "--default") opts.all = true;
    else if (a === "--only") {
      const v = next();
      if (v !== "commands" && v !== "menu") fail(`--only takes "commands" or "menu"`);
      opts.only = v;
    } else if (a === "--url") {
      const v = next();
      let u;
      try {
        u = new URL(v);
      } catch {
        fail(`--url is not a URL: ${v}`);
      }
      if (u.protocol !== "https:") fail("--url must be https (Telegram opens Mini Apps only over https)");
      opts.url = u.toString();
    } else if (a === "--text") {
      const v = next().trim();
      if (v.length === 0 || v.length > 64) fail("--text must be 1-64 characters");
      opts.text = v;
    } else if (a === "--reset") opts.reset = true;
    else if (a === "--apply") opts.apply = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "usage: node scripts/telegram-setup.mjs (--chat <id> ... | --default) [--only commands|menu] [--url https://…] [--text label] [--reset] [--apply]",
      );
      process.exit(0);
    } else fail(`unknown option ${a}`);
  }
  if (opts.chats.length === 0 && !opts.all) fail("choose targets: --chat <id> (owner first) and/or --default (everyone)");
  return opts;
}

/** The Bot API calls for the chosen targets, in order. */
function plan(opts) {
  const calls = [];
  const targets = [
    ...opts.chats.map((id) => ({ label: `chat ${id}`, scope: { type: "chat", chat_id: id }, chatId: id })),
    ...(opts.all ? [{ label: "everyone", scope: { type: "default" }, chatId: null }] : []),
  ];
  for (const t of targets) {
    if (opts.only !== "menu") {
      // No language_code = the fallback for any language Telegram has no list for: English.
      for (const lang of [null, "ru", "es", "de", "fr"]) {
        const base = { scope: t.scope, ...(lang ? { language_code: lang } : {}) };
        if (opts.reset) calls.push({ label: `${t.label} · commands ${lang ?? "default"} · delete`, method: "deleteMyCommands", body: base });
        else {
          const names = COMMANDS[lang ?? "en"];
          calls.push({
            label: `${t.label} · commands ${lang ?? "default (en)"}`,
            method: "setMyCommands",
            body: { ...base, commands: ORDER.map((command) => ({ command, description: names[command] })) },
          });
        }
      }
    }
    if (opts.only !== "commands") {
      const menu_button = opts.reset ? { type: "default" } : { type: "web_app", text: opts.text, web_app: { url: opts.url } };
      calls.push({
        label: `${t.label} · menu button${opts.reset ? " · reset" : ""}`,
        method: "setChatMenuButton",
        body: { ...(t.chatId !== null ? { chat_id: t.chatId } : {}), menu_button },
      });
    }
  }
  return calls;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const calls = plan(opts);

  if (opts.all && !opts.reset) {
    console.warn(
      "WARNING: --default shows the commands and the Mini App button to EVERY chat.\n" +
        '         Do it only after the gate is open for everyone (SADD kovra:botv2:users "*" or KOVRA_BOT_V2_ALL=1).\n',
    );
  }

  if (!opts.apply) {
    console.log(`DRY RUN: ${calls.length} call(s) planned, nothing sent. Add --apply to send them.\n`);
    for (const c of calls) console.log(`• ${c.label}\n  ${c.method} ${JSON.stringify(c.body)}\n`);
    return;
  }

  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!/^[0-9]{5,16}:[A-Za-z0-9_-]{20,}$/.test(token)) fail("TELEGRAM_BOT_TOKEN is missing or malformed");

  let failed = 0;
  for (const c of calls) {
    let answer;
    try {
      const res = await fetch(`${API}${token}/${c.method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c.body),
        signal: AbortSignal.timeout(15_000),
      });
      answer = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
    } catch (err) {
      answer = { ok: false, description: err instanceof Error ? err.message : String(err) };
    }
    if (answer.ok === true) console.log(`ok    ${c.label}`);
    else {
      failed += 1;
      console.log(`FAIL  ${c.label}: ${answer.description ?? "unknown error"}`);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} call(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("telegram-setup:", err instanceof Error ? err.message : err);
  process.exit(1);
});

// Run: TELEGRAM_BOT_TOKEN=xxx node scripts/telegram-poll.mjs
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) { console.error("Set TELEGRAM_BOT_TOKEN env var"); process.exit(1); }
const LOCAL_WEBHOOK = "http://localhost:3000/api/auth/telegram/webhook";
let offset = 0;

async function poll() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`);
    const data = await res.json();
    if (!data.ok || !data.result?.length) return;
    for (const update of data.result) {
      offset = update.update_id + 1;
      try {
        await fetch(LOCAL_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
        console.log(`✓ ${update.message?.from?.username}: "${update.message?.text}"`);
      } catch (err) { console.error("✗ Forward failed:", err.message); }
    }
  } catch (err) { console.error("✗ Poll error:", err.message); }
}

async function main() {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
  console.log("🤖 ПроксисВпнович бот — polling started\n");
  while (true) await poll();
}
main();

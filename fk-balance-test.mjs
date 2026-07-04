import crypto from 'node:crypto';
const shopId = Number(process.env.FREEKASSA_SHOP_ID);
const apiKey = process.env.FREEKASSA_API_KEY;
if (!shopId || !apiKey) { console.error('нет FREEKASSA_SHOP_ID/API_KEY'); process.exit(1); }
const params = { nonce: Date.now(), shopId };
const str = Object.keys(params).sort().map(k => String(params[k])).join('|');
const signature = crypto.createHmac('sha256', apiKey).update(str).digest('hex');
const res = await fetch('https://api.fk.life/v1/balance', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...params, signature }),
});
console.log('HTTP', res.status); console.log(await res.text());

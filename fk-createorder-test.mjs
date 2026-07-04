import crypto from 'node:crypto';
const shopId = Number(process.env.FREEKASSA_SHOP_ID);
const apiKey = process.env.FREEKASSA_API_KEY;
const ip = process.env.FREEKASSA_FALLBACK_IP;
if (!shopId || !apiKey || !ip) { console.error('нет FREEKASSA_SHOP_ID/API_KEY/FALLBACK_IP'); process.exit(1); }
const params = {
  amount: '5.00', currency: 'USD', email: 'test@telegram.org',
  i: 32, ip, nonce: Date.now(), paymentId: `test_${Date.now()}`, shopId,
};
const str = Object.keys(params).sort().map(k => String(params[k])).join('|');
const signature = crypto.createHmac('sha256', apiKey).update(str).digest('hex');
const res = await fetch('https://api.fk.life/v1/orders/create', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...params, signature }),
});
console.log('HTTP', res.status); console.log(await res.text());

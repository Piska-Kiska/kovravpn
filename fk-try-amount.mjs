import crypto from 'node:crypto';
const shopId = Number(process.env.FREEKASSA_SHOP_ID);
const apiKey = process.env.FREEKASSA_API_KEY;
const ip = process.env.FREEKASSA_FALLBACK_IP;
const params = {
  amount: '12.00', currency: 'USD', email: 'test@telegram.org',
  i: 32, ip, nonce: Date.now(), paymentId: `test_${Date.now()}`, shopId,
};
const str = Object.keys(params).sort().map(k => String(params[k])).join('|');
const signature = crypto.createHmac('sha256', apiKey).update(str).digest('hex');
const res = await fetch('https://api.fk.life/v1/orders/create', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...params, signature }),
});
const j = await res.json();
console.log('HTTP', res.status, '\nlocation:', j.location || JSON.stringify(j));

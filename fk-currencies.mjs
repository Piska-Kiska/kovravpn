import crypto from 'node:crypto';
const shopId = Number(process.env.FREEKASSA_SHOP_ID);
const apiKey = process.env.FREEKASSA_API_KEY;
const params = { nonce: Date.now(), shopId };
const str = Object.keys(params).sort().map(k => String(params[k])).join('|');
const signature = crypto.createHmac('sha256', apiKey).update(str).digest('hex');
const res = await fetch('https://api.fk.life/v1/currencies', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ...params, signature }),
});
const j = await res.json();
const list = j.currencies || [];
console.log('всего методов:', list.length);
for (const c of list) if ([32,11,36,44].includes(c.id))
  console.log(`ID ${c.id} ${c.name} ${c.currency} -> is_enabled=${c.is_enabled}`);

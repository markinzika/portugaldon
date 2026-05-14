'use strict';
require('dotenv').config();
const crypto  = require('crypto');
const utmify  = require('../../lib/utmify');

// Disable Vercel's automatic body parsing so we get the raw bytes for HMAC verification
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const signature = req.headers['x-vorkpay-signature'];
  console.log(`[webhook] received — signature header: ${signature ? 'present' : 'MISSING'}`);

  const rawBody = await readRawBody(req);
  console.log(`[webhook] raw body: ${rawBody.toString('utf8').slice(0, 500)}`);

  if (!signature) return res.status(401).json({ error: 'Missing signature' });

  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.VORKPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  const isValid = sigBuf.length === expBuf.length &&
    crypto.timingSafeEqual(sigBuf, expBuf);

  console.log(`[webhook] signature valid: ${isValid} | expected: ${expected}`);

  if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); }
  catch { return res.status(400).json({ error: 'Invalid JSON body' }); }

  const { event, data } = payload;
  console.log(`[webhook] event=${event} data=${JSON.stringify(data)}`);

  const transactionId = data?.transactionId || data?.transaction_id;
  const orderId       = transactionId || data?.orderId || data?.order_id || data?.reference || data?.id || `vkp_${Date.now()}`;
  const amount        = data?.amount  || data?.value || 0;
  const paidAt        = data?.paidAt  || data?.paid_at || new Date().toISOString();
  const createdAt     = data?.createdAt || data?.created_at || new Date().toISOString();
  const paymentMethod = data?.paymentMethod || data?.payment_method || data?.method || 'mbway';

  console.log(`[webhook] orderId=${orderId} amount=${amount} method=${paymentMethod}`);

  if (event === 'payment.success') {
    await utmify.sendOrder({ orderId, amount, paymentMethod, status: 'paid', createdAt, paidAt, customer: null, utms: null });
  } else if (event === 'payment.failed') {
    await utmify.sendOrder({ orderId, amount, paymentMethod, status: 'refused', createdAt, customer: null, utms: null });
  } else if (event === 'webhook.test') {
    console.log('[webhook] Test event received — OK');
  } else {
    console.log(`[webhook] Unknown event: ${event} — no action taken`);
  }

  res.status(200).json({ received: true });
};

'use strict';
require('dotenv').config();
const crypto  = require('crypto');
const utmify  = require('../../lib/utmify');

function readStream(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Try to get raw bytes from stream; if Vercel already parsed the body the stream is empty
  const streamBuf = await readStream(req);
  const rawBody   = streamBuf.length > 0
    ? streamBuf
    : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

  console.log(`[webhook] stream bytes=${streamBuf.length} rawBody=${rawBody.toString('utf8').slice(0, 400)}`);

  // Signature check
  const signature = req.headers['x-vorkpay-signature'];
  if (signature && process.env.VORKPAY_WEBHOOK_SECRET) {
    const expected = 'sha256=' + crypto
      .createHmac('sha256', process.env.VORKPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    const isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    console.log(`[webhook] signature valid=${isValid}`);
    if (!isValid) return res.status(401).json({ error: 'Invalid signature' });
  } else if (!signature) {
    console.log('[webhook] no signature header — rejecting');
    return res.status(401).json({ error: 'Missing signature' });
  }

  // Parse payload
  let payload;
  try {
    payload = streamBuf.length > 0
      ? JSON.parse(rawBody.toString('utf8'))
      : (typeof req.body === 'object' ? req.body : JSON.parse(req.body));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

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
    console.log('[webhook] test event OK');
  } else {
    console.log(`[webhook] unknown event="${event}"`);
  }

  res.status(200).json({ received: true });
};

// Config must be set on the exported function — NOT before the assignment
handler.config = { api: { bodyParser: false } };
module.exports = handler;

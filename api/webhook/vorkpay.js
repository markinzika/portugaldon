'use strict';
require('dotenv').config();
const crypto = require('crypto');
const utmify = require('../../lib/utmify');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const signature = req.headers['x-vorkpay-signature'];
  if (!signature) return res.status(401).json({ error: 'Missing signature' });

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.VORKPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  const isValid = sigBuf.length === expBuf.length &&
    crypto.timingSafeEqual(sigBuf, expBuf);

  if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

  let payload;
  try { payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON body' }); }

  const { event, data } = payload;
  console.log(`[webhook] event=${event} payload=${JSON.stringify(payload)}`);

  // VorkPay sends transactionId — use it as orderId because that's what we registered in Utmify
  const transactionId = data?.transactionId || data?.transaction_id;
  const orderId       = transactionId || data?.orderId || data?.order_id || data?.reference || data?.id || `vkp_${Date.now()}`;
  const amount        = data?.amount  || data?.value || 0;
  const paidAt        = data?.paidAt  || data?.paid_at || new Date().toISOString();
  const createdAt     = data?.createdAt || data?.created_at || new Date().toISOString();
  const paymentMethod = data?.paymentMethod || data?.payment_method || data?.method || 'mbway';

  console.log(`[webhook] transactionId=${transactionId} orderId=${orderId} amount=${amount} method=${paymentMethod}`);

  if (event === 'payment.success') {
    await utmify.sendOrder({
      orderId,
      amount,
      paymentMethod,
      status:    'paid',
      createdAt,
      paidAt,
      customer:  null,
      utms:      null,
    });
  }

  if (event === 'payment.failed') {
    await utmify.sendOrder({
      orderId,
      amount,
      paymentMethod,
      status:    'refused',
      createdAt,
      customer:  null,
      utms:      null,
    });
  }

  if (event === 'webhook.test') {
    console.log('[webhook] Test event received — OK');
  }

  res.status(200).json({ received: true });
};

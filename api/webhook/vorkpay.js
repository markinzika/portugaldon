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
  console.log(`[webhook] ${event}`, JSON.stringify(data));

  // Usa os dados que a VorkPay envia directamente — não depende do Map em memória
  const orderId       = data?.orderId || data?.id || `vkp_${Date.now()}`;
  const amount        = data?.amount  || 0;
  const paidAt        = data?.paidAt  || new Date().toISOString();
  const createdAt     = data?.createdAt || new Date().toISOString();
  const paymentMethod = data?.paymentMethod || 'mbway';

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

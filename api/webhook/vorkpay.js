'use strict';
require('dotenv').config();
const crypto   = require('crypto');
const utmify   = require('../../lib/utmify');

const orders = global._orders || (global._orders = new Map());

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const signature = req.headers['x-vorkpay-signature'];
  if (!signature) return res.status(401).json({ error: 'Missing signature' });

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.VORKPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  let isValid = false;
  try {
    isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { isValid = false; }

  if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

  let payload;
  try { payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON body' }); }

  const { event, data } = payload;
  const entry = [...orders.entries()].find(([, o]) => o.transactionId === data?.id);

  if (entry) {
    const [orderId, o] = entry;

    if (event === 'payment.success') {
      o.status = 'paid';
      o.paidAt = data?.paidAt || new Date().toISOString();

      // Notificar Utmify — pedido aprovado
      utmify.sendOrder({
        orderId,
        amount:        o.amount,
        paymentMethod: o.paymentMethod || 'mbway',
        status:        'paid',
        createdAt:     o.createdAt,
        paidAt:        o.paidAt,
        customer:      o.customer || null,
      });
    }

    if (event === 'payment.failed') {
      o.status = 'failed';

      utmify.sendOrder({
        orderId,
        amount:        o.amount,
        paymentMethod: o.paymentMethod || 'mbway',
        status:        'refused',
        createdAt:     o.createdAt,
        customer:      o.customer || null,
      });
    }

    if (event === 'payment.cancelled') {
      o.status = 'cancelled';
    }
  }

  res.status(200).json({ received: true });
};

'use strict';
require('dotenv').config();
const crypto  = require('crypto');
const vorkpay = require('../../lib/vorkpay');
const utmify  = require('../../lib/utmify');

const orders = global._orders || (global._orders = new Map());

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { amount, paymentMethod, customer } = req.body;
  if (!amount || typeof amount !== 'number' || amount < 1 || amount > 5000) {
    return res.status(400).json({ ok: false, error: 'amount must be a number between 1 and 5000' });
  }

  const orderId = `don_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  try {
    const payment = await vorkpay.createPayment(orderId, amount);
    const createdAt = new Date().toISOString();
    orders.set(orderId, {
      status:        'pending',
      amount,
      transactionId: payment.transactionId,
      paymentMethod: paymentMethod || 'mbway',
      createdAt,
      paidAt:        null,
      customer:      customer || null,
    });

    // Notificar Utmify — pedido criado (pending)
    utmify.sendOrder({
      orderId,
      amount,
      paymentMethod: paymentMethod || 'mbway',
      status:        'pending',
      createdAt,
      customer:      customer || null,
    });

    res.json({ ok: true, orderId, transactionId: payment.transactionId, amount: payment.amount, currency: payment.currency });
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: err.message });
  }
};

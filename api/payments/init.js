'use strict';
require('dotenv').config();
const crypto  = require('crypto');
const vorkpay = require('../../lib/vorkpay');
const utmify  = require('../../lib/utmify');


module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { amount, paymentMethod, customer, utms } = req.body;
  console.log(`[init] amount=${amount} method=${paymentMethod} utms=${JSON.stringify(utms)}`);
  if (!amount || typeof amount !== 'number' || amount < 1 || amount > 5000) {
    return res.status(400).json({ ok: false, error: 'amount must be a number between 1 and 5000' });
  }

  const orderId = `don_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  try {
    const payment = await vorkpay.createPayment(orderId, amount);
    const createdAt = new Date().toISOString();
    // Use VorkPay's transactionId as the Utmify orderId so the webhook can match it
    const utmifyOrderId = payment.transactionId || orderId;

    // Notificar Utmify — pedido criado (pending)
    // await obrigatório: Vercel termina a função após res.json()
    await utmify.sendOrder({
      orderId:       utmifyOrderId,
      amount,
      paymentMethod: paymentMethod || 'mbway',
      status:        'waiting_payment',
      createdAt,
      customer:      customer || null,
      utms:          utms     || null,
    });

    res.json({ ok: true, orderId, transactionId: payment.transactionId, amount: payment.amount, currency: payment.currency });
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: err.message });
  }
};

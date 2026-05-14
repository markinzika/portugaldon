'use strict';
require('dotenv').config();
const vorkpay = require('../../lib/vorkpay');
const utmify  = require('../../lib/utmify');

// Track which transactionIds we've already notified Utmify about as paid
// (in-memory; resets on cold start — acceptable since webhook is the primary path)
const notified = global._notifiedPaid || (global._notifiedPaid = new Set());

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { transactionId } = req.query;
  if (!transactionId) {
    return res.status(400).json({ ok: false, error: 'transactionId query param is required' });
  }

  try {
    const result = await vorkpay.getPaymentStatus(transactionId);

    // When payment is confirmed paid and not yet notified, update Utmify
    if (result.status === 'paid' && !notified.has(transactionId)) {
      notified.add(transactionId);
      console.log(`[status] paid detected for ${transactionId} — notifying Utmify`);
      // Fire-and-forget — don't block the response
      utmify.sendOrder({
        orderId:       transactionId,
        amount:        result.amount || 0,
        paymentMethod: result.paymentMethod || 'mbway',
        status:        'paid',
        createdAt:     new Date().toISOString(),
        paidAt:        result.paidAt || new Date().toISOString(),
        customer:      null,
        utms:          null,
      }).catch(err => console.error('[status] utmify error:', err.message));
    }

    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: err.message });
  }
};

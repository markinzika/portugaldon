'use strict';
require('dotenv').config();
const vorkpay = require('../../lib/vorkpay');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { transactionId } = req.query;
  if (!transactionId) {
    return res.status(400).json({ ok: false, error: 'transactionId query param is required' });
  }

  try {
    const result = await vorkpay.getPaymentStatus(transactionId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: err.message });
  }
};

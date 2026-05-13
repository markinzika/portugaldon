'use strict';
require('dotenv').config();
const vorkpay = require('../../lib/vorkpay');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { transactionId, phoneNumber } = req.body;
  if (!transactionId || typeof transactionId !== 'string') {
    return res.status(400).json({ ok: false, error: 'transactionId is required' });
  }
  if (!phoneNumber || !/^9\d{8}$/.test(phoneNumber)) {
    return res.status(400).json({ ok: false, error: 'phoneNumber must be a Portuguese mobile number (9XXXXXXXX)' });
  }

  try {
    const result = await vorkpay.triggerMbway(transactionId, phoneNumber);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.status || 502).json({ ok: false, error: err.message });
  }
};

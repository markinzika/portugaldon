'use strict';

const BASE_URL = 'https://vorkpay.com/api/v1';

function authHeaders() {
  return {
    'Authorization': `Bearer ${process.env.VORKPAY_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function request(method, path, body) {
  const options = {
    method,
    headers: authHeaders(),
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data.message || data.error || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// POST /payments/init — creates a pending transaction
// Returns { transactionId, amount, currency }
async function createPayment(orderId, amount) {
  return request('POST', '/payments/init', { orderId, amount, currency: 'EUR' });
}

// POST /payments/mbway — triggers MB WAY push notification
// phoneNumber must match 9XXXXXXXX (9 digits, starts with 9)
// Returns confirmation that notification was sent
async function triggerMbway(transactionId, phoneNumber) {
  return request('POST', '/payments/mbway', { transactionId, phoneNumber });
}

// POST /payments/multibanco — generates ATM reference
// Returns { entity, reference, amount, expiresAt }
async function generateMultibanco(transactionId) {
  return request('POST', '/payments/multibanco', { transactionId });
}

// GET /payments/status — polls transaction state
// Returns { status: 'pending'|'paid'|'failed'|'cancelled', paymentMethod, amount, paidAt }
async function getPaymentStatus(transactionId) {
  return request('GET', `/payments/status?transactionId=${encodeURIComponent(transactionId)}`);
}

module.exports = { createPayment, triggerMbway, generateMultibanco, getPaymentStatus };

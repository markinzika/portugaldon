'use strict';

require('dotenv').config();

const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const vorkpay = require('./lib/vorkpay');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Static files ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ─── Webhook MUST receive raw body for HMAC verification ─────────────────────
app.use('/api/webhook/vorkpay', express.raw({ type: 'application/json' }));

// ─── JSON body for all other routes ──────────────────────────────────────────
app.use(express.json());

// ─── In-memory order store (replace with a real DB in production) ─────────────
// Structure: { [orderId]: { status, amount, transactionId, paidAt } }
const orders = new Map();

// ─── Helper: send a consistent error response ────────────────────────────────
function apiError(res, status, message) {
  res.status(status).json({ ok: false, error: message });
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/payments/init
// Body: { amount: number }
// Creates a transaction and returns { orderId, transactionId, amount }
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/payments/init', async (req, res) => {
  const { amount } = req.body;

  if (!amount || typeof amount !== 'number' || amount < 1 || amount > 5000) {
    return apiError(res, 400, 'amount must be a number between 1 and 5000');
  }

  // Generate a stable orderId for this donation session
  const orderId = `don_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  try {
    const payment = await vorkpay.createPayment(orderId, amount);

    orders.set(orderId, {
      status: 'pending',
      amount,
      transactionId: payment.transactionId,
      paidAt: null,
    });

    res.json({
      ok: true,
      orderId,
      transactionId: payment.transactionId,
      amount: payment.amount,
      currency: payment.currency,
    });
  } catch (err) {
    console.error('[init]', err.message);
    apiError(res, err.status || 502, err.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/payments/mbway
// Body: { transactionId: string, phoneNumber: string }
// Triggers MB WAY push and returns confirmation
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/payments/mbway', async (req, res) => {
  const { transactionId, phoneNumber } = req.body;

  if (!transactionId || typeof transactionId !== 'string') {
    return apiError(res, 400, 'transactionId is required');
  }
  if (!phoneNumber || !/^9\d{8}$/.test(phoneNumber)) {
    return apiError(res, 400, 'phoneNumber must be a Portuguese mobile number (9XXXXXXXX)');
  }

  try {
    const result = await vorkpay.triggerMbway(transactionId, phoneNumber);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[mbway]', err.message);
    apiError(res, err.status || 502, err.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/payments/multibanco
// Body: { transactionId: string }
// Returns { entity, reference, amount, expiresAt }
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/payments/multibanco', async (req, res) => {
  const { transactionId } = req.body;

  if (!transactionId || typeof transactionId !== 'string') {
    return apiError(res, 400, 'transactionId is required');
  }

  try {
    const result = await vorkpay.generateMultibanco(transactionId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[multibanco]', err.message);
    apiError(res, err.status || 502, err.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/payments/status?transactionId=xxx
// Proxies VorkPay status — used by the frontend polling loop
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/payments/status', async (req, res) => {
  const { transactionId } = req.query;

  if (!transactionId) {
    return apiError(res, 400, 'transactionId query param is required');
  }

  try {
    const result = await vorkpay.getPaymentStatus(transactionId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[status]', err.message);
    apiError(res, err.status || 502, err.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/webhook/vorkpay
// Receives VorkPay events; verifies HMAC-SHA256 signature before processing
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/webhook/vorkpay', (req, res) => {
  const signature = req.headers['x-vorkpay-signature'];

  if (!signature) {
    console.warn('[webhook] Missing X-VorkPay-Signature header');
    return res.status(401).json({ error: 'Missing signature' });
  }

  // Verify HMAC-SHA256: header is "sha256=<hex>"
  const rawBody = req.body; // Buffer (express.raw middleware)
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.VORKPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );

  if (!isValid) {
    console.warn('[webhook] Signature mismatch');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { event, data } = payload;
  console.log(`[webhook] ${event}`, data?.id);

  switch (event) {
    case 'payment.success': {
      const order = findOrderByTransaction(data?.id);
      if (order) {
        order.status = 'paid';
        order.paidAt = data?.paidAt || new Date().toISOString();
        console.log(`[webhook] Order ${order.orderId} marked as PAID`);
      }
      break;
    }

    case 'payment.failed': {
      const order = findOrderByTransaction(data?.id);
      if (order) {
        order.status = 'failed';
        console.log(`[webhook] Order ${order.orderId} marked as FAILED`);
      }
      break;
    }

    case 'payment.cancelled': {
      const order = findOrderByTransaction(data?.id);
      if (order) {
        order.status = 'cancelled';
        console.log(`[webhook] Order ${order.orderId} marked as CANCELLED`);
      }
      break;
    }

    case 'webhook.test':
      console.log('[webhook] Test event received — OK');
      break;

    default:
      console.log(`[webhook] Unknown event: ${event}`);
  }

  // Must respond 2xx within 8s or VorkPay will retry
  res.status(200).json({ received: true });
});

function findOrderByTransaction(transactionId) {
  for (const [orderId, order] of orders) {
    if (order.transactionId === transactionId) {
      return { orderId, ...order };
    }
  }
  return null;
}

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Alaar server running at http://localhost:${PORT}`);
});
